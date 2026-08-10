import pg from "pg";

export type DatabaseHealthCheck = () => Promise<void>;

export function createDatabasePool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 10_000 });
}

export function createDatabaseHealthCheck(
  connectionString: string,
): DatabaseHealthCheck {
  const pool = createDatabasePool(connectionString);
  return async () => {
    await pool.query("SELECT 1");
  };
}
