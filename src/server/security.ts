import type { Request, Response, NextFunction } from "express";
import type { CorsOptionsDelegate } from "cors";

export function parseTrustProxySetting(): boolean | number | string {
  const raw = process.env.TRUST_PROXY?.trim();
  if (!raw) {
    return process.env.NODE_ENV === "production" ? 1 : false;
  }
  if (raw === "false" || raw === "0") return false;
  if (raw === "true") return true;
  const asNum = Number(raw);
  if (Number.isInteger(asNum) && asNum >= 0) return asNum;
  return raw;
}

/**
 * Explicit CORS policy — zero wildcard `.run.app` / `.googleusercontent.com` matching.
 * Same-origin requests (matching Host / X-Forwarded-Host) and explicit `CORS_ORIGIN` entries are allowed.
 * Localhost/127.0.0.1 is allowed only in non-production environments.
 */
export function buildCorsOptions(): CorsOptionsDelegate<Request> {
  const explicitOrigins = new Set(
    (process.env.CORS_ORIGIN || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const isProd = process.env.NODE_ENV === "production";

  return (req, callback) => {
    const origin = req.headers.origin;
    const baseOpts = {
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Idempotency-Key",
        "X-Requested-With",
      ],
    };

    // Requests without Origin header (same-origin GET, curl, server-to-server)
    if (!origin) {
      callback(null, { ...baseOpts, origin: true });
      return;
    }

    if (explicitOrigins.has(origin)) {
      callback(null, { ...baseOpts, origin: true });
      return;
    }

    try {
      const parsed = new URL(origin);
      const reqHost = String(
        req.headers["x-forwarded-host"] || req.headers.host || ""
      )
        .split(",")[0]
        .trim()
        .toLowerCase();

      // Same-origin browser requests (including preview proxy host matching request Host)
      if (reqHost && parsed.host.toLowerCase() === reqHost) {
        callback(null, { ...baseOpts, origin: true });
        return;
      }

      // Local development convenience ONLY when not in production
      if (
        !isProd &&
        (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
      ) {
        callback(null, { ...baseOpts, origin: true });
        return;
      }
    } catch {
      // invalid URL origin
    }

    callback(null, { ...baseOpts, origin: false });
  };
}

export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }
  next();
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const HIGH_BURST_ROLES = new Set([
  "SPORTS_SECRETARY",
  "FACULTY_ADVISOR",
  "AUCTION_OPERATOR",
  "MATCH_SCORER",
]);

/**
 * Campus-NAT-safe rate limiter:
 * - Uses Express `req.ip` (which safely honors `trust proxy` and ignores spoofed X-Forwarded-For).
 * - Keys authenticated users by `user:<id>` so 1,200 students behind campus NAT don't share one IP bucket.
 * - Grants high burst limits or exemptions to live operators, match scorers, and sports admins.
 */
export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  privilegedMaxRequests?: number;
  exemptPrivileged?: boolean;
  keyPrefix: string;
}) {
  const buckets = new Map<string, RateBucket>();

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    }
  }, Math.max(options.windowMs, 30_000));
  cleanupTimer.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const actor = req.authUser;
    const isPrivileged = Boolean(actor && HIGH_BURST_ROLES.has(actor.role));

    if (isPrivileged && options.exemptPrivileged) {
      return next();
    }

    const limit =
      isPrivileged && options.privilegedMaxRequests
        ? options.privilegedMaxRequests
        : options.maxRequests;

    // Key by authenticated userId when logged in; fall back to Express req.ip (never raw X-Forwarded-For)
    const identityKey = actor
      ? `uid:${actor.id}`
      : `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;

    const key = `${options.keyPrefix}:${identityKey}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(0, limit - bucket.count))
    );
    if (bucket.count > limit) {
      res.status(429).json({
        error: "Too many requests. Please wait a moment and try again.",
      });
      return;
    }
    next();
  };
}

export function sendServerError(
  res: Response,
  context: string,
  err: unknown
) {
  console.error(`[API Error] ${context}:`, err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
}

// Validate raster image buffer using magic bytes (JPEG, PNG, WebP, GIF only; blocks SVG/HTML)
export function detectImageMimeFromBuffer(
  buf: Buffer
): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return "image/gif";
  }
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function normalizeBatchCode(raw: string): string {
  const s = String(raw || "")
    .trim()
    .toUpperCase();
  if (s === "ALL" || s.includes("ALL")) return "ALL";
  if (s.startsWith("1") || s.includes("1ST")) return "1ST";
  if (s.startsWith("2") || s.includes("2ND")) return "2ND";
  if (s.startsWith("3") || s.includes("3RD")) return "3RD";
  if (s.startsWith("4") || s.includes("4TH")) return "4TH";
  if (s.includes("MTECH") || s.includes("M.TECH")) return "MTECH";
  return s;
}
