import "dotenv/config";
import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL?.trim();

export const hasDatabase = Boolean(connectionString);

const isLocal = connectionString
  ? connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1")
  : true;

export const pool: pg.Pool | null = connectionString
  ? new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    })
  : null;

export const db: NodePgDatabase<typeof schema> | null = pool
  ? drizzle(pool, { schema })
  : null;