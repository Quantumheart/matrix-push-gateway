# matrix-push-gateway

A thin TypeScript API layer that implements the [Matrix Push Gateway spec](https://spec.matrix.org/unstable/push-gateway-api/) and delivers notifications via the **Web Push** protocol — purpose-built for PWAs.

## How it works

```
Matrix homeserver ──POST /_matrix/push/v1/notify──▶ this gateway ──Web Push──▶ browser service worker
```

Your PWA subscribes via `PushManager.subscribe()`, and you store the resulting `PushSubscription` JSON as the `pushkey` when creating a Matrix pusher. The homeserver forwards events here, and this gateway fans them out as Web Push messages.

## Setup

```bash
# install
npm install

# generate VAPID keys
npm run generate-vapid
# copy the output into .env (see .env.example)

# run (dev)
npm run dev

# build + run (prod)
npm run build
npm start
```

## Registering a pusher (client-side)

On your PWA, after obtaining a `PushSubscription`:

```typescript
const sub = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: VAPID_PUBLIC_KEY,
});

await matrixClient.setPusher({
  pushkey: JSON.stringify(sub),          // the full subscription JSON
  kind: "http",
  app_id: "com.example.mypwa",
  app_display_name: "My PWA",
  device_display_name: navigator.userAgent,
  lang: "en",
  data: {
    url: "https://push.example.com/_matrix/push/v1/notify",
  },
});
```

## Service worker handler

```typescript
self.addEventListener("push", (event) => {
  const data = event.data?.json();
  const title = data?.room_name ?? "New message";
  const body =
    data?.sender_display_name && data?.body
      ? `${data.sender_display_name}: ${data.body}`
      : "You have a new notification";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { room_id: data?.room_id },
    })
  );
});
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `VAPID_PUBLIC_KEY` | yes | Base64url VAPID public key |
| `VAPID_PRIVATE_KEY` | yes | Base64url VAPID private key |
| `VAPID_SUBJECT` | yes | `mailto:` or URL identifying operator |
| `PORT` | no | HTTP port (default `7002`) |
| `PUSH_TTL_SECONDS` | no | Push message TTL (default `14400` = 4h) |

## Spec compliance notes

- Implements `POST /_matrix/push/v1/notify` per the spec
- Returns `{ rejected: [...] }` with dead/expired pushkeys (410/404) so the homeserver can clean up stale pushers
- Unknown `/_matrix/*` endpoints return `404 M_UNRECOGNIZED` (or `405` for wrong method) per spec requirements
- No auth required on the notify endpoint (per spec)
