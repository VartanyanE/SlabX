import pg from "pg";

export type DatabaseHealthCheck = () => Promise<void>;

export function createDatabaseHealthCheck(
  connectionString: string,
): DatabaseHealthCheck {
  const pool = new pg.Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
  });
  return async () => {
    await pool.query("SELECT 1");
  };
}
