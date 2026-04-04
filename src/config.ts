function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
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
} as const;
