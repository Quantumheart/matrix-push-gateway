import { z } from "zod";

// ── Notification sub-schemas ────────────────────────────────────────

export const CountsSchema = z.object({
  unread: z.number().int().optional(),
  missed_calls: z.number().int().optional(),
});

export const PusherDataSchema = z.object({
  format: z.string().optional(),
}).passthrough();

export const TweaksSchema = z.record(z.unknown());

export const DeviceSchema = z.object({
  app_id: z.string(),
  pushkey: z.string(),
  pushkey_ts: z.number().int().optional(),
  data: PusherDataSchema.optional(),
  tweaks: TweaksSchema.optional(),
});

export const NotificationSchema = z.object({
  event_id: z.string().nullish(),
  room_id: z.string().nullish(),
  room_name: z.string().nullish(),
  room_alias: z.string().nullish(),
  prio: z.enum(["high", "low"]).default("high"),
  sender: z.string().nullish(),
  sender_display_name: z.string().nullish(),
  type: z.string().nullish(),
  content: z.record(z.unknown()).nullish(),
  counts: CountsSchema.optional(),
  user_is_target: z.boolean().optional(),
  devices: z.array(DeviceSchema).min(1),
});

export const NotifyRequestSchema = z.object({
  notification: NotificationSchema,
});

export const NotifyResponseSchema = z.object({
  rejected: z.array(z.string()),
});

// ── Derived types ───────────────────────────────────────────────────

export type Counts = z.infer<typeof CountsSchema>;
export type PusherData = z.infer<typeof PusherDataSchema>;
export type Tweaks = z.infer<typeof TweaksSchema>;
export type Device = z.infer<typeof DeviceSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type NotifyRequest = z.infer<typeof NotifyRequestSchema>;
export type NotifyResponse = z.infer<typeof NotifyResponseSchema>;

export type PushPath = "webpush" | "apns-alert" | "apns-voip";

// MSC3401 1:1 call membership state event type. Only event type routed to
// the VoIP pusher; everything else goes alert-only so CallKit doesn't fire
// on encrypted message payloads. See issue #343.
export const CALL_MEMBER_TYPE = "org.matrix.msc3401.call.member";

// ── Helpers ──────────────────────────────────────────────────────────

export function getContentBody(notification: Notification): string | undefined {
  const body = notification.content?.["body"];
  return typeof body === "string" ? body : undefined;
}
