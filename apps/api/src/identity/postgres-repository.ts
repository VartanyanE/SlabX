import pg from "pg";
import type {
  AddressInput,
  AuthenticatedUser,
  ProfileUpdate,
} from "@slabx/contracts";
import type {
  AddressRecord,
  CredentialRecord,
  IdentityRepository,
  SessionRecord,
  SessionSummary,
} from "./types.js";

type Queryable = Pick<pg.Pool, "query"> | pg.PoolClient;

export class PostgresIdentityRepository implements IdentityRepository {
  constructor(private readonly pool: pg.Pool) {}

  async createPasswordUser(
    input: Parameters<IdentityRepository["createPasswordUser"]>[0],
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const created = await client.query<{ id: string }>(
        `INSERT INTO users (email_normalized, email_display) VALUES ($1, $2) RETURNING id`,
        [input.emailNormalized, input.email],
      );
      const userId = created.rows[0]!.id;
      await client.query(
        `INSERT INTO password_credentials (user_id, password_hash) VALUES ($1, $2)`,
        [userId, input.passwordHash],
      );
      await client.query(
        `INSERT INTO profiles (user_id, handle_normalized, handle_display, display_name) VALUES ($1, $2, $3, $4)`,
        [userId, input.handleNormalized, input.handle, input.displayName],
      );
      await client.query(
        `INSERT INTO email_tokens (user_id, type, token_hash, expires_at) VALUES ($1, 'VERIFICATION', $2, $3)`,
        [userId, input.verificationHash, input.verificationExpiresAt],
      );
      await client.query(
        `INSERT INTO user_roles (user_id, role_id) SELECT $1, id FROM roles WHERE code = 'USER'`,
        [userId],
      );
      await this.audit(client, userId, "auth.registered", "user", userId);
      await client.query("COMMIT");
      return userId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findCredential(
    emailNormalized: string,
  ): Promise<CredentialRecord | null> {
    const result = await this.pool.query<CredentialRecord>(
      `SELECT u.id AS "userId", pc.password_hash AS "passwordHash", u.status,
       (u.email_verified_at IS NOT NULL) AS "emailVerified", pc.failed_attempts AS "failedAttempts",
       pc.locked_until AS "lockedUntil"
       FROM users u JOIN password_credentials pc ON pc.user_id = u.id
       WHERE u.email_normalized = $1 AND u.deleted_at IS NULL`,
      [emailNormalized],
    );
    return result.rows[0] ?? null;
  }

  async recordLoginFailure(
    userId: string,
    lockedUntil: Date | null,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE password_credentials SET failed_attempts = failed_attempts + 1, locked_until = $2 WHERE user_id = $1`,
      [userId, lockedUntil],
    );
  }

  async recordLoginSuccess(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE password_credentials SET failed_attempts = 0, locked_until = NULL WHERE user_id = $1`,
      [userId],
    );
    await this.pool.query(
      `UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [userId],
    );
  }

  async consumeEmailToken(
    tokenHash: string,
    type: "VERIFICATION" | "PASSWORD_RESET",
    now: Date,
  ): Promise<string | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ userId: string }>(
        `UPDATE email_tokens SET consumed_at = $3 WHERE token_hash = $1 AND type = $2::"EmailTokenType"
         AND consumed_at IS NULL AND expires_at > $3 RETURNING user_id AS "userId"`,
        [tokenHash, type, now],
      );
      const userId = result.rows[0]?.userId;
      if (userId && type === "VERIFICATION") {
        await client.query(
          `UPDATE users SET email_verified_at = $2, status = 'ACTIVE', updated_at = $2 WHERE id = $1 AND status = 'PENDING_VERIFICATION'`,
          [userId, now],
        );
        await this.audit(client, userId, "auth.email_verified", "user", userId);
      }
      await client.query("COMMIT");
      return userId ?? null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createEmailToken(
    userId: string,
    type: "VERIFICATION" | "PASSWORD_RESET",
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `UPDATE email_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND type = $2::"EmailTokenType" AND consumed_at IS NULL`,
      [userId, type],
    );
    await this.pool.query(
      `INSERT INTO email_tokens (user_id, type, token_hash, expires_at) VALUES ($1, $2::"EmailTokenType", $3, $4)`,
      [userId, type, tokenHash, expiresAt],
    );
  }

  async updatePasswordAndRevokeSessions(
    userId: string,
    passwordHash: string,
    now: Date,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE password_credentials SET password_hash = $2, password_changed_at = $3, failed_attempts = 0, locked_until = NULL WHERE user_id = $1`,
        [userId, passwordHash, now],
      );
      await client.query(
        `UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId, now],
      );
      await this.audit(client, userId, "auth.password_reset", "user", userId);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async createSession(
    input: Parameters<IdentityRepository["createSession"]>[0],
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO sessions (user_id, token_hash, csrf_token_hash, expires_at, ip_hash, user_agent_hash) VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        input.userId,
        input.tokenHash,
        input.csrfTokenHash,
        input.expiresAt,
        input.ipHash ?? null,
        input.userAgentHash ?? null,
      ],
    );
  }

  async findSession(
    tokenHash: string,
    now: Date,
  ): Promise<SessionRecord | null> {
    const result = await this.pool.query<{
      userId: string;
      csrfTokenHash: string;
      expiresAt: Date;
    }>(
      `SELECT user_id AS "userId", csrf_token_hash AS "csrfTokenHash", expires_at AS "expiresAt"
       FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2`,
      [tokenHash, now],
    );
    const row = result.rows[0];
    if (!row) return null;
    const user = await this.getUser(row.userId);
    return user
      ? { user, csrfTokenHash: row.csrfTokenHash, expiresAt: row.expiresAt }
      : null;
  }

  async revokeSession(tokenHash: string, now: Date): Promise<void> {
    await this.pool.query(
      `UPDATE sessions SET revoked_at = $2 WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash, now],
    );
  }
  async revokeAllSessions(userId: string, now: Date): Promise<void> {
    await this.pool.query(
      `UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId, now],
    );
  }
  async listSessions(
    userId: string,
    currentTokenHash: string,
  ): Promise<SessionSummary[]> {
    const result = await this.pool.query<SessionSummary>(
      `SELECT id, created_at AS "createdAt", expires_at AS "expiresAt",
       (token_hash = $2) AS current FROM sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC`,
      [userId, currentTokenHash],
    );
    return result.rows;
  }
  async findUserByEmail(
    emailNormalized: string,
  ): Promise<{ id: string } | null> {
    const r = await this.pool.query<{ id: string }>(
      `SELECT id FROM users WHERE email_normalized = $1 AND deleted_at IS NULL`,
      [emailNormalized],
    );
    return r.rows[0] ?? null;
  }

  async findOrCreateGoogleUser(input: {
    subject: string;
    email: string;
    emailNormalized: string;
    displayName: string;
  }): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const existingIdentity = await client.query<{ userId: string }>(
        `SELECT user_id AS "userId" FROM auth_identities WHERE provider='GOOGLE' AND provider_subject=$1 FOR UPDATE`,
        [input.subject],
      );
      if (existingIdentity.rows[0]) {
        await client.query("COMMIT");
        return existingIdentity.rows[0].userId;
      }
      const existingUser = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE email_normalized=$1 AND deleted_at IS NULL AND email_verified_at IS NOT NULL FOR UPDATE`,
        [input.emailNormalized],
      );
      let userId = existingUser.rows[0]?.id;
      if (!userId) {
        const created = await client.query<{ id: string }>(
          `INSERT INTO users (email_normalized,email_display,email_verified_at,status) VALUES ($1,$2,CURRENT_TIMESTAMP,'ACTIVE') RETURNING id`,
          [input.emailNormalized, input.email],
        );
        userId = created.rows[0]!.id;
        const handleBase =
          input.emailNormalized
            .split("@")[0]!
            .replace(/[^a-z0-9_]/g, "_")
            .slice(0, 20) || "collector";
        const handle = `${handleBase}_${userId.slice(0, 6)}`;
        await client.query(
          `INSERT INTO profiles (user_id,handle_normalized,handle_display,display_name) VALUES ($1,$2,$2,$3)`,
          [userId, handle, input.displayName],
        );
        await client.query(
          `INSERT INTO user_roles (user_id,role_id) SELECT $1,id FROM roles WHERE code='USER'`,
          [userId],
        );
      }
      await client.query(
        `INSERT INTO auth_identities (user_id,provider,provider_subject,provider_email) VALUES ($1,'GOOGLE',$2,$3)`,
        [userId, input.subject, input.email],
      );
      await this.audit(client, userId, "auth.google_linked", "user", userId);
      await client.query("COMMIT");
      return userId;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getUser(userId: string): Promise<AuthenticatedUser | null> {
    const result = await this.pool.query<
      AuthenticatedUser & { roles: string[] }
    >(
      `SELECT u.id, u.email_display AS email, (u.email_verified_at IS NOT NULL) AS "emailVerified", u.status,
       json_build_object('handle', p.handle_display, 'displayName', p.display_name, 'bio', p.bio) AS profile,
       COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
       FROM users u JOIN profiles p ON p.user_id = u.id
       LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1 AND u.deleted_at IS NULL GROUP BY u.id, p.user_id`,
      [userId],
    );
    return result.rows[0] ?? null;
  }

  async updateProfile(
    userId: string,
    input: ProfileUpdate,
  ): Promise<AuthenticatedUser> {
    await this.pool.query(
      `UPDATE profiles SET display_name = COALESCE($2, display_name), bio = CASE WHEN $3 THEN $4 ELSE bio END, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
      [
        userId,
        input.displayName ?? null,
        Object.hasOwn(input, "bio"),
        input.bio ?? null,
      ],
    );
    return (await this.getUser(userId))!;
  }

  async listAddresses(userId: string): Promise<AddressRecord[]> {
    const result = await this.pool.query<AddressRecord>(
      `SELECT id, label, recipient_name AS "recipientName", line1, line2, city, region, postal_code AS "postalCode", country_code AS "countryCode", is_default_shipping AS "isDefaultShipping" FROM addresses WHERE user_id = $1 AND deleted_at IS NULL ORDER BY is_default_shipping DESC, created_at`,
      [userId],
    );
    return result.rows;
  }

  private async clearDefault(
    queryable: Queryable,
    userId: string,
    requested: boolean,
  ): Promise<void> {
    if (requested)
      await queryable.query(
        `UPDATE addresses SET is_default_shipping = false, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId],
      );
  }
  async createAddress(
    userId: string,
    input: AddressInput,
  ): Promise<AddressRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.clearDefault(client, userId, input.isDefaultShipping);
      const r = await client.query<AddressRecord>(
        `INSERT INTO addresses (user_id,label,recipient_name,line1,line2,city,region,postal_code,country_code,is_default_shipping) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,label,recipient_name AS "recipientName",line1,line2,city,region,postal_code AS "postalCode",country_code AS "countryCode",is_default_shipping AS "isDefaultShipping"`,
        [
          userId,
          input.label,
          input.recipientName,
          input.line1,
          input.line2 ?? null,
          input.city,
          input.region,
          input.postalCode,
          input.countryCode,
          input.isDefaultShipping,
        ],
      );
      await client.query("COMMIT");
      return r.rows[0]!;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async updateAddress(
    userId: string,
    addressId: string,
    input: AddressInput,
  ): Promise<AddressRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await this.clearDefault(client, userId, input.isDefaultShipping);
      const r = await client.query<AddressRecord>(
        `UPDATE addresses SET label=$3,recipient_name=$4,line1=$5,line2=$6,city=$7,region=$8,postal_code=$9,country_code=$10,is_default_shipping=$11,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING id,label,recipient_name AS "recipientName",line1,line2,city,region,postal_code AS "postalCode",country_code AS "countryCode",is_default_shipping AS "isDefaultShipping"`,
        [
          addressId,
          userId,
          input.label,
          input.recipientName,
          input.line1,
          input.line2 ?? null,
          input.city,
          input.region,
          input.postalCode,
          input.countryCode,
          input.isDefaultShipping,
        ],
      );
      await client.query("COMMIT");
      return r.rows[0] ?? null;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
  async deleteAddress(userId: string, addressId: string): Promise<boolean> {
    const r = await this.pool.query(
      `UPDATE addresses SET deleted_at=CURRENT_TIMESTAMP,is_default_shipping=false WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`,
      [addressId, userId],
    );
    return (r.rowCount ?? 0) > 0;
  }
  private async audit(
    queryable: Queryable,
    actorUserId: string,
    action: string,
    targetType: string,
    targetId: string,
  ): Promise<void> {
    await queryable.query(
      `INSERT INTO audit_events (actor_user_id,action,target_type,target_id) VALUES ($1,$2,$3,$4)`,
      [actorUserId, action, targetType, targetId],
    );
  }
}
