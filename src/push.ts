import webpush, { type PushSubscription } from "web-push";
import type { Notification, Device, PushPath } from "./schema.js";
import { getContentBody } from "./schema.js";
import { config } from "./config.js";
import { isDuplicate } from "./dedup.js";
import { sendAlertPush, sendVoipPush } from "./apns.js";

// ── Payload builder ─────────────────────────────────────────────────

export interface WebPushPayload {
  event_id?: string;
  room_id?: string;
  room_name?: string;
  sender?: string;
  sender_display_name?: string;
  type?: string;
  body?: string;
  counts?: { unread?: number; missed_calls?: number };
  prio: string;
}

/**
 * Distill a Matrix notification into a lean payload suitable for a
 * service-worker `push` event. Keeps things small — push payloads are
 * capped at ~4 KB by most browsers.
 */
function buildPayload(notification: Notification): WebPushPayload {
  return {
    event_id: notification.event_id ?? undefined,
    room_id: notification.room_id ?? undefined,
    room_name: notification.room_name ?? undefined,
    sender: notification.sender ?? undefined,
    sender_display_name: notification.sender_display_name ?? undefined,
    type: notification.type ?? undefined,
    body: getContentBody(notification),
    counts: notification.counts,
    prio: notification.prio,
  };
}

// ── Subscription decoder ────────────────────────────────────────────

/**
 * The `pushkey` stored in Matrix is the JSON-serialised Web Push
 * subscription object that the PWA obtained from
 * `PushManager.subscribe()`.
 */
function decodePushkey(pushkey: string): PushSubscription {
  try {
    const parsed = JSON.parse(pushkey);
    if (!parsed.endpoint || !parsed.keys?.p256dh || !parsed.keys?.auth) {
      throw new Error("Missing required fields in push subscription");
    }
    return parsed as PushSubscription;
  } catch {
    throw new Error("Invalid pushkey — expected JSON PushSubscription");
  }
}

// ── Pushkey classifier ───────────────────────────────────────────────

function classifyPushkey(pushkey: string, appId: string): PushPath {
  if (pushkey.startsWith("{")) return "webpush";
  if (appId.endsWith(".voip"))  return "apns-voip";
  return "apns-alert";
}

// ── Send ────────────────────────────────────────────────────────────

export interface SendResult {
  pushkey: string;
  ok: boolean;
  statusCode?: number;
  error?: string;
}

/**
 * Attempt delivery for a single device.
 */
export async function sendToDevice(
  notification: Notification,
  device: Device,
): Promise<SendResult> {
  const path = classifyPushkey(device.pushkey, device.app_id);

  if (path === "apns-alert") return sendAlertPush(notification, device);
  if (path === "apns-voip")  return sendVoipPush(notification, device);

  let subscription: PushSubscription;
  try {
    subscription = decodePushkey(device.pushkey);
  } catch (err) {
    return { pushkey: device.pushkey, ok: false, error: String(err) };
  }

  const payload = JSON.stringify({ notification: buildPayload(notification) });
  const urgency = notification.prio === "low" ? "low" : "high";

  try {
    const result = await webpush.sendNotification(subscription, payload, {
      TTL: config.pushTtlSeconds,
      urgency,
      vapidDetails: {
        subject: config.vapidSubject,
        publicKey: config.vapidPublicKey,
        privateKey: config.vapidPrivateKey,
      },
    });
    return { pushkey: device.pushkey, ok: true, statusCode: result.statusCode };
  } catch (err: unknown) {
    const wpErr = err as { statusCode?: number; body?: string };
    const gone = wpErr.statusCode === 404 || wpErr.statusCode === 410;
    return {
      pushkey: device.pushkey,
      ok: false,
      statusCode: wpErr.statusCode,
      error: gone
        ? "Subscription expired or unsubscribed"
        : wpErr.body ?? String(err),
    };
  }
}

/**
 * Fan-out delivery to every device listed in the notification.
 * Returns the list of pushkeys that should be rejected (expired /
 * invalid subscriptions).
 */
export async function sendNotification(
  notification: Notification,
): Promise<string[]> {
  if (notification.event_id && isDuplicate(notification.event_id)) {
    console.log(`[push] duplicate event_id=${notification.event_id} — skipping`);
    return [];
  }

  const results = await Promise.all(
    notification.devices.map((device) => sendToDevice(notification, device)),
  );

  const rejected: string[] = [];
  for (const r of results) {
    if (!r.ok) {
      console.warn(
        `[push] delivery failed status=${r.statusCode} err=${r.error}`,
      );
      if (r.statusCode === 404 || r.statusCode === 410) {
        rejected.push(r.pushkey);
      }
    }
  }
  return rejected;
}
