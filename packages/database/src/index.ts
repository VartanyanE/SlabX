import pg from "pg";

export type DatabaseHealthCheck = () => Promise<void>;

export function createDatabasePool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 10_000 });
}

export function createDatabaseHealthCheck(
  source: string | pg.Pool,
): DatabaseHealthCheck {
  const pool = typeof source === "string" ? createDatabasePool(source) : source;
  return async () => {
    await pool.query("SELECT 1");
  };
}
