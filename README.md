# matrix-push-gateway

A thin TypeScript API layer that implements the [Matrix Push Gateway spec](https://spec.matrix.org/unstable/push-gateway-api/) and delivers notifications via **Web Push** (browser PWAs) **and APNs** (native iOS apps) from a single endpoint.

## How it works

```
                                          ┌──▶ Web Push ──▶ browser service worker
Matrix homeserver ──/_matrix/push/v1/notify──▶ this gateway
                                          └──▶ APNs ──▶ iOS app
```

Transport is picked per device based on `pushkey` / `app_id`:
- `pushkey` starts with `{` → treated as a JSON `PushSubscription` and sent via Web Push
- `app_id` ends with `.voip` → APNs VoIP push
- otherwise → APNs alert push

Per-event duplicate suppression (`event_id` × `pushkey`) and per-pushkey token-bucket rate limiting are applied before any outbound call.

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

### Web Push (required)
| Variable | Description |
|---|---|
| `VAPID_PUBLIC_KEY` | Base64url VAPID public key |
| `VAPID_PRIVATE_KEY` | Base64url VAPID private key |
| `VAPID_SUBJECT` | `mailto:` or URL identifying operator |

### APNs (optional — omit any to disable iOS push)
| Variable | Description |
|---|---|
| `APNS_KEY_PATH` | Path to `.p8` auth key inside the container |
| `APNS_KEY_ID` | 10-char key ID from Apple Developer portal |
| `APNS_TEAM_ID` | 10-char team ID |
| `APNS_BUNDLE_ID` | iOS app bundle ID (e.g. `io.github.quantumheart.kohera`) |
| `APNS_PRODUCTION` | `true` for production APNs, `false` for sandbox (default `true`) |

### Tuning (optional)
| Variable | Default | Description |
|---|---|---|
| `PORT` | `7002` | HTTP port |
| `PUSH_TTL_SECONDS` | `14400` | Web Push message TTL (4h) |
| `DEDUP_TTL_MS` | `600000` | Window to remember `(event_id, pushkey)` pairs (10 min) |
| `RATE_LIMIT_PER_PUSHKEY_PER_MIN` | `60` | Sustained per-pushkey send rate |
| `RATE_LIMIT_BURST` | `20` | Per-pushkey burst capacity |

## Deploying behind traefik

`docker-compose.yml` ships traefik labels for TLS termination (`push.<your-domain>`) and a per-source-IP rate-limit middleware. Mount your `.p8` at `/app/apns.p8` and put env in `.env`:

```bash
docker compose up -d
```

Scale-out note: the rate limiter is in-process. Running multiple replicas multiplies the effective limit by N — use a single replica or enforce rate limiting at an upstream layer.

## Spec compliance notes

- Implements `POST /_matrix/push/v1/notify` per the spec
- Returns `{ rejected: [...] }` with dead/expired pushkeys (Web Push 404/410, APNs `BadDeviceToken` / `Unregistered`) so the homeserver can clean up stale pushers
- Unknown `/_matrix/*` endpoints return `404 M_UNRECOGNIZED` (or `405` for wrong method) per spec requirements
- No auth required on the notify endpoint (per spec)
- Rate-limited and duplicate sends return `ok` (not rejected) so the homeserver does not unregister the pusher
