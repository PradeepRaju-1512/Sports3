import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";

export interface AuthUserRecord {
  id: number;
  name: string;
  email: string;
  rollNumber: string | null;
  batch: string;
  branch: string;
  role: string;
  passwordHash?: string | null;
}

export interface PublicUserView {
  id: number;
  name: string;
  batch: string;
  branch: string;
  role: string;
}

export interface SessionPayload {
  uid: number;
  role: string;
  iat: number;
  exp: number;
}

// Ephemeral fallback secret for dev; production should set SESSION_SECRET in env
const EPHEMERAL_SECRET = crypto.randomBytes(32).toString("hex");
function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 16) return configured;
  return EPHEMERAL_SECRET;
}

export function isDemoSwitcherEnabled(): boolean {
  return process.env.ENABLE_DEMO_SWITCHER === "true";
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLen), "base64").toString("utf8");
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

export function signSessionToken(user: { id: number; role: string }): string {
  const now = Date.now();
  const payload: SessionPayload = {
    uid: user.id,
    role: user.role,
    iat: now,
    exp: now + TOKEN_TTL_MS,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", getSessionSecret())
    .update(encoded)
    .digest();
  return `${encoded}.${base64UrlEncode(sig)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sigPart] = parts;
  if (!encoded || !sigPart) return null;

  const expectedSig = base64UrlEncode(
    crypto.createHmac("sha256", getSessionSecret()).update(encoded).digest()
  );
  const a = Buffer.from(sigPart);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as SessionPayload;
    if (
      !parsed ||
      typeof parsed.uid !== "number" ||
      typeof parsed.exp !== "number" ||
      parsed.exp < Date.now()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  return null;
}

export function toPublicUser(u: AuthUserRecord): PublicUserView {
  return {
    id: u.id,
    name: u.name,
    batch: u.batch,
    branch: u.branch,
    role: u.role,
  };
}

export function toSelfUser(u: AuthUserRecord) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    rollNumber: u.rollNumber,
    batch: u.batch,
    branch: u.branch,
    role: u.role,
  };
}

export type ResolveUserFn = (id: number) => Promise<AuthUserRecord | null>;

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUserRecord | null;
    }
  }
}

export function attachOptionalAuth(resolveUser: ResolveUserFn) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        req.authUser = null;
        return next();
      }
      const payload = verifySessionToken(token);
      if (!payload) {
        req.authUser = null;
        return next();
      }
      const user = await resolveUser(payload.uid);
      req.authUser = user;
      return next();
    } catch {
      req.authUser = null;
      return next();
    }
  };
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.authUser) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
