interface Bucket {
  tokens: number;
  lastRefill: number;
}

// In-process only. Running >1 replica multiplies the effective limit by N;
// use a shared store (redis) or enforce at an upstream layer if you scale out.
const buckets = new Map<string, Bucket>();

let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export interface RateLimitConfig {
  capacity: number;
  refillPerMs: number;
}

export function consume(key: string, cfg: RateLimitConfig): boolean {
  const now = Date.now();

  if (now - lastSweep > SWEEP_INTERVAL_MS) {
    for (const [k, b] of buckets) {
      if (b.tokens >= cfg.capacity && now - b.lastRefill > SWEEP_INTERVAL_MS) {
        buckets.delete(k);
      }
    }
    lastSweep = now;
  }

  let b = buckets.get(key);
  if (!b) {
    b = { tokens: cfg.capacity, lastRefill: now };
    buckets.set(key, b);
  } else {
    const elapsed = now - b.lastRefill;
    b.tokens = Math.min(cfg.capacity, b.tokens + elapsed * cfg.refillPerMs);
    b.lastRefill = now;
  }

  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}
