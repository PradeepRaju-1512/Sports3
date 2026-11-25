import type { Request, Response, NextFunction } from "express";

export function buildCorsOptions() {
  const rawOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    origin(
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) {
      // Allow same-origin / server-to-server / curl requests without Origin header
      if (!origin) {
        callback(null, true);
        return;
      }
      if (rawOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // Allow local dev / preview hosts on standard http(s) ports when no strict list overrides
      try {
        const parsed = new URL(origin);
        const host = parsed.hostname;
        if (
          host === "localhost" ||
          host === "127.0.0.1" ||
          host.endsWith(".run.app") ||
          host.endsWith(".googleusercontent.com")
        ) {
          callback(null, true);
          return;
        }
      } catch {
        // invalid origin
      }
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Idempotency-Key"],
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

export function createRateLimiter(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}) {
  const buckets = new Map<string, RateBucket>();

  // Periodic cleanup to avoid unbounded memory growth
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
    const ip =
      (typeof req.headers["x-forwarded-for"] === "string"
        ? req.headers["x-forwarded-for"].split(",")[0].trim()
        : req.ip) || "unknown";
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", String(options.maxRequests));
    res.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(0, options.maxRequests - bucket.count))
    );
    if (bucket.count > options.maxRequests) {
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
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
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
  // GIF87a / GIF89a
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
  // WebP: RIFF....WEBP
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
