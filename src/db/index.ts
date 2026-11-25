import "dotenv/config";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const { Pool } = pg;

function resolveConnectionString(): string | null {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!parsed.hostname || parsed.hostname === "base") {
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

const connectionString = resolveConnectionString();

export const hasDatabase = Boolean(connectionString);

const isLocal = connectionString
  ? connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1")
  : true;

export const pool: pg.Pool | null = connectionString
  ? new Pool({
      connectionString,
      connectionTimeoutMillis: 2500,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    })
  : null;

if (pool) {
  pool.on("error", () => {
    // Handled gracefully by API fallback without crashing the process
  });
}

export const db: NodePgDatabase<typeof schema> | null = pool
  ? drizzle(pool, { schema })
  : null;