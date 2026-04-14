function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

// ── APNs config ──────────────────────────────────────────────────────

export interface ApnsConfig {
  keyPath:  string;
  keyId:    string;
  teamId:   string;
  bundleId: string;
  production: boolean;
}

function resolveApnsConfig(): ApnsConfig | null {
  const keyPath  = optionalEnv("APNS_KEY_PATH");
  const keyId    = optionalEnv("APNS_KEY_ID");
  const teamId   = optionalEnv("APNS_TEAM_ID");
  const bundleId = optionalEnv("APNS_BUNDLE_ID");

  if (!keyPath || !keyId || !teamId || !bundleId) {
    console.warn("[config] APNs env vars missing — native iOS push disabled");
    return null;
  }

  const production = (optionalEnv("APNS_PRODUCTION") ?? "true").toLowerCase() === "true";

  return { keyPath, keyId, teamId, bundleId, production };
}

// ── Config ───────────────────────────────────────────────────────────

const apns: ApnsConfig | null = resolveApnsConfig();

export const config: {
  port: number;
  vapidSubject: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
  pushTtlSeconds: number;
  dedupTtlMs: number;
  apns: ApnsConfig | null;
} = {
  /** Port the HTTP server listens on */
  port: parseInt(process.env["PORT"] ?? "7002", 10),

  /** VAPID mailto: or URL identifying the application server */
  vapidSubject: requireEnv("VAPID_SUBJECT"),

  /** Base64url-encoded VAPID public key */
  vapidPublicKey: requireEnv("VAPID_PUBLIC_KEY"),

  /** Base64url-encoded VAPID private key */
  vapidPrivateKey: requireEnv("VAPID_PRIVATE_KEY"),

  /** Time-to-live for push messages (seconds). Default 4 hours. */
  pushTtlSeconds: parseInt(process.env["PUSH_TTL_SECONDS"] ?? "14400", 10),

  /** How long (ms) to remember event IDs for duplicate suppression. Default 10 minutes. */
  dedupTtlMs: parseInt(process.env["DEDUP_TTL_MS"] ?? "600000", 10),

  apns,
};
