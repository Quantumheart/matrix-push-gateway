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
  event_id: z.string().optional(),
  room_id: z.string().optional(),
  room_name: z.string().optional(),
  room_alias: z.string().optional(),
  prio: z.enum(["high", "low"]).default("high"),
  sender: z.string().optional(),
  sender_display_name: z.string().optional(),
  type: z.string().optional(),
  content: z.record(z.unknown()).optional(),
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
