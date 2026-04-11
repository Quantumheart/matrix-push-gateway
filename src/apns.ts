import apn from "@parse/node-apn";
import { readFileSync } from "fs";
import type { Notification, Device } from "./schema.js";
import { config } from "./config.js";
import type { SendResult } from "./push.js";

// ── Provider singleton ───────────────────────────────────────────────

let _provider: apn.Provider | null = null;

function getProvider(): apn.Provider | null {
  if (!config.apns) return null;
  if (_provider) return _provider;
  const key = readFileSync(config.apns.keyPath);
  _provider = new apn.Provider({
    token: {
      key,
      keyId:  config.apns.keyId,
      teamId: config.apns.teamId,
    },
    production: true,
  });
  return _provider;
}

// ── Payload builders ─────────────────────────────────────────────────

function buildBody(notification: Notification): string {
  const sender = notification.sender_display_name;
  const body =
    notification.content && typeof notification.content["body"] === "string"
      ? notification.content["body"]
      : undefined;
  if (sender && body) return `${sender}: ${body}`;
  if (sender) return sender;
  return "New message";
}

function buildAlertNotification(notification: Notification): apn.Notification {
  const note = new apn.Notification();
  note.pushType = "alert";
  note.topic = config.apns!.bundleId;
  note.priority = 10;
  note.expiry = Math.floor(Date.now() / 1000) + config.pushTtlSeconds;
  note.alert = {
    title: notification.room_name ?? notification.room_id ?? "Message",
    body: buildBody(notification),
  };
  note.badge = notification.counts?.unread ?? 0;
  note.sound = "default";
  note.payload = { room_id: notification.room_id };
  return note;
}

function buildVoipNotification(notification: Notification): apn.Notification {
  const note = new apn.Notification();
  note.pushType = "voip";
  note.topic = `${config.apns!.bundleId}.voip`;
  note.priority = 10;
  note.expiry = Math.floor(Date.now() / 1000) + config.pushTtlSeconds;
  note.payload = {
    event_id:            notification.event_id,
    room_id:             notification.room_id,
    sender_display_name: notification.sender_display_name,
  };
  return note;
}

// ── Result mapper ────────────────────────────────────────────────────

function mapApnsResponse(
  responses: apn.Responses,
  pushkey: string,
): SendResult {
  if (responses.sent.length > 0) {
    return { pushkey, ok: true };
  }

  const failure = responses.failed[0];
  if (!failure) {
    return { pushkey, ok: false, error: "No sent or failed entries in APNs response" };
  }

  const reason = failure.response?.reason;
  const status = failure.status ? parseInt(failure.status, 10) : undefined;

  if (reason === "Unregistered") {
    return { pushkey, ok: false, statusCode: 410, error: reason };
  }

  return {
    pushkey,
    ok: false,
    statusCode: status,
    error: reason ?? failure.error?.message ?? "Unknown APNs error",
  };
}

// ── Send ─────────────────────────────────────────────────────────────

export async function sendAlertPush(
  notification: Notification,
  device: Device,
): Promise<SendResult> {
  const provider = getProvider();
  if (!provider) {
    return { pushkey: device.pushkey, ok: false, error: "APNs not configured" };
  }

  try {
    const note = buildAlertNotification(notification);
    const responses = await provider.send(note, device.pushkey);
    return mapApnsResponse(responses, device.pushkey);
  } catch (err) {
    return { pushkey: device.pushkey, ok: false, error: String(err) };
  }
}

export async function sendVoipPush(
  notification: Notification,
  device: Device,
): Promise<SendResult> {
  const provider = getProvider();
  if (!provider) {
    return { pushkey: device.pushkey, ok: false, error: "APNs not configured" };
  }

  try {
    const note = buildVoipNotification(notification);
    const responses = await provider.send(note, device.pushkey);
    return mapApnsResponse(responses, device.pushkey);
  } catch (err) {
    return { pushkey: device.pushkey, ok: false, error: String(err) };
  }
}
