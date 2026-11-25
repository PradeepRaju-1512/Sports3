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

export const SESSION_COOKIE_NAME = "iiitt_session";
export const OAUTH_STATE_COOKIE_NAME = "iiitt_oauth_state";
const TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12 hours
const TOKEN_TTL_MS = TOKEN_TTL_SECONDS * 1000;

const WEAK_SECRET_PATTERNS = [
  "change-me",
  "changeme",
  "secret",
  "default",
  "example",
  "password",
  "iiitt",
  "placeholder",
  "12345678",
];

// Ephemeral fallback secret for local development only; production fails fast via validateProductionSessionSecret()
const EPHEMERAL_DEV_SECRET = crypto.randomBytes(32).toString("hex");

export function isWeakSessionSecret(secret: string | undefined): boolean {
  const trimmed = (secret || "").trim();
  if (trimmed.length < 32) return true;
  const lower = trimmed.toLowerCase();
  if (WEAK_SECRET_PATTERNS.some((p) => lower.includes(p))) return true;
  // Reject low-entropy repeated characters
  if (new Set(trimmed.split("")).size < 10) return true;
  return false;
}

export function validateProductionSessionSecret(): void {
  if (process.env.NODE_ENV !== "production") return;
  const configured = process.env.SESSION_SECRET?.trim();
  if (isWeakSessionSecret(configured)) {
    console.error(
      "FATAL: SESSION_SECRET must be set to a strong, high-entropy value of at least 32 characters in production."
    );
    process.exit(1);
  }
}

function getSessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is missing or weak in production");
  }
  return EPHEMERAL_DEV_SECRET;
}

export function isDemoSwitcherEnabled(): boolean {
  return process.env.ENABLE_DEMO_SWITCHER === "true";
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

// Async non-blocking scrypt password hashing (never blocks the Node event loop)
function scryptAsync(password: string, salt: string, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, 64);
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== 64) return false;
  const actual = await scryptAsync(password, salt, 64);
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

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(rawVal);
    } catch {
      out[key] = rawVal;
    }
  }
  return out;
}

export function setSessionCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${TOKEN_TTL_SECONDS}`,
  ];
  if (isProd) {
    parts.push("Secure");
  }
  res.append("Set-Cookie", parts.join("; "));
}

export function clearSessionCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProd) {
    parts.push("Secure");
  }
  res.append("Set-Cookie", parts.join("; "));
}

export function setOAuthStateCookie(res: Response, state: string): void {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${OAUTH_STATE_COOKIE_NAME}=${encodeURIComponent(state)}`,
    "Path=/api/auth/google",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
  ];
  if (isProd) {
    parts.push("Secure");
  }
  res.append("Set-Cookie", parts.join("; "));
}

export function clearOAuthStateCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${OAUTH_STATE_COOKIE_NAME}=`,
    "Path=/api/auth/google",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isProd) {
    parts.push("Secure");
  }
  res.append("Set-Cookie", parts.join("; "));
}

export function extractSessionToken(req: Request): {
  token: string | null;
  source: "bearer" | "cookie" | null;
} {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) return { token, source: "bearer" };
  }
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken) {
    return { token: cookieToken, source: "cookie" };
  }
  return { token: null, source: null };
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
      authSource?: "bearer" | "cookie" | null;
    }
  }
}

export function attachOptionalAuth(resolveUser: ResolveUserFn) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const { token, source } = extractSessionToken(req);
      if (!token) {
        req.authUser = null;
        req.authSource = null;
        return next();
      }
      const payload = verifySessionToken(token);
      if (!payload) {
        req.authUser = null;
        req.authSource = null;
        return next();
      }
      const user = await resolveUser(payload.uid);
      req.authUser = user;
      req.authSource = user ? source : null;
      return next();
    } catch {
      req.authUser = null;
      req.authSource = null;
      return next();
    }
  };
}

/**
 * CSRF defense-in-depth for cookie-authenticated state-changing requests.
 * Checks Origin/Referer host match or explicit X-Requested-With header.
 */
export function cookieCsrfGuard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    return next();
  }
  if (req.authSource !== "cookie") {
    return next();
  }

  const xrw = req.headers["x-requested-with"];
  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const requestHost = String(
    req.headers["x-forwarded-host"] || req.headers.host || ""
  )
    .split(",")[0]
    .trim()
    .toLowerCase();

  const allowedOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (typeof originHeader === "string" && originHeader) {
    try {
      const parsed = new URL(originHeader);
      const originHost = parsed.host.toLowerCase();
      if (
        (requestHost && originHost === requestHost) ||
        allowedOrigins.includes(originHeader.toLowerCase())
      ) {
        return next();
      }
    } catch {
      return res.status(403).json({ error: "Invalid request origin" });
    }
    return res.status(403).json({ error: "Cross-site cookie mutation blocked" });
  }

  if (typeof refererHeader === "string" && refererHeader) {
    try {
      const parsed = new URL(refererHeader);
      if (requestHost && parsed.host.toLowerCase() === requestHost) {
        return next();
      }
    } catch {
      return res.status(403).json({ error: "Invalid request referer" });
    }
  }

  if (typeof xrw === "string" && xrw.trim().length > 0) {
    return next();
  }

  return res.status(403).json({ error: "Missing origin verification for session cookie" });
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
