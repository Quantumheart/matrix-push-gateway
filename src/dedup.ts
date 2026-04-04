import { config } from "./config.js";

const seen = new Map<string, number>();

let purgeTimer: ReturnType<typeof setInterval> | undefined;

function ensurePurgeTimer(): void {
  if (purgeTimer) return;
  purgeTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, expiry] of seen) {
      if (now >= expiry) seen.delete(key);
    }
    if (seen.size === 0) {
      clearInterval(purgeTimer);
      purgeTimer = undefined;
    }
  }, config.dedupTtlMs);
  purgeTimer.unref();
}

export function isDuplicate(eventId: string): boolean {
  if (seen.has(eventId)) return true;
  seen.set(eventId, Date.now() + config.dedupTtlMs);
  ensurePurgeTimer();
  return false;
}
