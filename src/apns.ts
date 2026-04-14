import apn from "@parse/node-apn";
import { readFileSync } from "fs";
import type { Notification, Device } from "./schema.js";
import { getContentBody } from "./schema.js";
import { config } from "./config.js";
import type { SendResult } from "./push.js";

type ApnsResponses = Awaited<ReturnType<apn.Provider["send"]>>;

// ── Provider singleton ───────────────────────────────────────────────
// Initialized at module load so readFileSync runs once at startup, not
// on the first incoming request. Provider + bundleId travel together so
// callers only need a single null check to access both.

interface ApnsRuntime {
  provider: apn.Provider;
  bundleId: string;
}

const _runtime: ApnsRuntime | null = config.apns
  ? {
      provider: new apn.Provider({
        token: {
          key:    readFileSync(config.apns.keyPath),
          keyId:  config.apns.keyId,
          teamId: config.apns.teamId,
        },
        production: config.apns.production,
      }),
      bundleId: config.apns.bundleId,
    }
  : null;

export function shutdownApns(): void {
  _runtime?.provider.shutdown();
}

// ── Payload builders ─────────────────────────────────────────────────

function buildBody(notification: Notification): string {
  const sender = notification.sender_display_name;
  const body   = getContentBody(notification);
  if (sender && body) return `${sender}: ${body}`;
  if (sender) return sender;
  return "New message";
}

function expiryTimestamp(): number {
  return Math.floor(Date.now() / 1000) + config.pushTtlSeconds;
}

function buildAlertNotification(notification: Notification, bundleId: string): apn.Notification {
  const note = new apn.Notification();
  note.topic  = bundleId;
  note.expiry = expiryTimestamp();
  note.payload = {
    notification: {
      event_id: notification.event_id,
      room_id: notification.room_id,
      counts: notification.counts,
    },
  };

  if (notification.event_id) {
    note.pushType        = "alert";
    note.priority        = 10;
    note.contentAvailable = true;
    note.alert           = "New message";
    note.sound           = "default";
    note.badge           = notification.counts?.unread ?? 0;
  } else {
    note.pushType        = "background";
    note.priority        = 5;
    note.contentAvailable = true;
    note.badge           = notification.counts?.unread ?? 0;
  }

  return note;
}

function buildVoipNotification(notification: Notification, bundleId: string): apn.Notification {
  const note = new apn.Notification();
  note.pushType = "voip";
  note.topic    = `${bundleId}.voip`;
  note.priority = 10;
  note.expiry   = expiryTimestamp();
  note.payload  = {
    event_id:            notification.event_id,
    room_id:             notification.room_id,
    sender_display_name: notification.sender_display_name,
  };
  return note;
}

// ── Result mapper ────────────────────────────────────────────────────

function mapApnsResponse(responses: ApnsResponses, pushkey: string): SendResult {
  if (responses.sent.length > 0) {
    return { pushkey, ok: true };
  }

  // Single-token sends always populate exactly one of sent/failed.
  const failure = responses.failed[0];
  const reason  = failure.response?.reason;

  if (reason === "Unregistered") {
    return { pushkey, ok: false, statusCode: 410, error: reason };
  }

  return {
    pushkey,
    ok: false,
    statusCode: failure.status,
    error: reason ?? failure.error?.message ?? "Unknown APNs error",
  };
}

// ── Send ─────────────────────────────────────────────────────────────

async function sendApnsPush(
  build: (notification: Notification, bundleId: string) => apn.Notification,
  notification: Notification,
  device: Device,
): Promise<SendResult> {
  if (!_runtime) {
    return { pushkey: device.pushkey, ok: false, error: "APNs not configured" };
  }
  try {
    const note      = build(notification, _runtime.bundleId);
    const responses = await _runtime.provider.send(note, device.pushkey);
    return mapApnsResponse(responses, device.pushkey);
  } catch (err) {
    console.warn(`[apns] send failed pushkey=${device.pushkey} err=${String(err)}`);
    return { pushkey: device.pushkey, ok: false, error: String(err) };
  }
}

export function sendAlertPush(notification: Notification, device: Device): Promise<SendResult> {
  return sendApnsPush(buildAlertNotification, notification, device);
}

export function sendVoipPush(notification: Notification, device: Device): Promise<SendResult> {
  return sendApnsPush(buildVoipNotification, notification, device);
}
