# Web push notifications in Next.js 16

This is the documented Next.js 16 push path, lightly adapted for projects that use route handlers (Drizzle + auth wrappers) instead of in-memory Server Action examples.

## Components

A working push setup has six pieces:

1. **VAPID keys** (one-time): identify your server to push services.
2. **`pushSubscriptions` table**: persist `PushSubscription` JSON keyed by user.
3. **Subscribe/unsubscribe endpoint**: store and revoke subscriptions.
4. **Server-side dispatcher**: send notifications via `web-push`.
5. **Client hook**: request permission, subscribe, hand the subscription to the server.
6. **Service worker handlers**: receive `push` events, show notifications, route clicks.

## 1. Generate VAPID keys

VAPID (Voluntary Application Server Identification) lets the push service authenticate your server. Generate once, never regenerate (rotating breaks all existing subscriptions).

```bash
pnpm dlx web-push generate-vapid-keys
```

Add to `.env`:

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BJ...
VAPID_PRIVATE_KEY=Mn...
VAPID_SUBJECT=mailto:notifications@yourdomain.com
```

`NEXT_PUBLIC_*` for the public key (browser needs it for `applicationServerKey`); private key is server-only. The subject must be a `mailto:` URL or `https://` URL — push services use it to contact you on abuse complaints.

## 2. Subscriptions table (Drizzle example)

```ts
// schema.ts
import { pgTable, text, timestamp, jsonb, uuid, uniqueIndex } from "drizzle-orm/pg-core"

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    subscription: jsonb("subscription").$type<PushSubscriptionJSON>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    endpointIdx: uniqueIndex("push_subs_endpoint_idx").on(t.endpoint),
  })
)
```

The endpoint is the unique key — the same browser+user can produce a new subscription if the user revokes and re-grants permission, so dedupe on endpoint.

## 3. Subscribe / unsubscribe endpoint

Use a route handler to match this codebase's pattern (`authenticatedRoute()` wrapper, AsyncLocalStorage analytics context, etc.). The Next.js docs example uses a Server Action with in-memory state — fine for a demo, not for production.

```ts
// app/api/push/subscribe/route.ts
import { authenticatedRoute } from "@/lib/server/route-handler"
import { z } from "zod"

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  expirationTime: z.number().nullable().optional(),
})

export const POST = authenticatedRoute(async ({ req, userId }) => {
  const body = subscribeSchema.parse(await req.json())
  await pushService.subscribe({ userId, subscription: body })
  return Response.json({ ok: true })
})

export const DELETE = authenticatedRoute(async ({ req, userId }) => {
  const { endpoint } = z.object({ endpoint: z.string().url() }).parse(await req.json())
  await pushService.unsubscribe({ userId, endpoint })
  return Response.json({ ok: true })
})
```

## 4. Server dispatcher

```ts
// services/push.service.ts
import webpush from "web-push"
import { pushSubscriptions } from "@/lib/db/schema"
import { db } from "@/lib/db"
import { eq } from "drizzle-orm"

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

type Payload = { title: string; body: string; url?: string; icon?: string }

export const pushService = {
  async subscribe({ userId, subscription }: { userId: string; subscription: PushSubscriptionJSON }) {
    await db
      .insert(pushSubscriptions)
      .values({ userId, endpoint: subscription.endpoint!, subscription })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, subscription },
      })
  },
  async unsubscribe({ userId, endpoint }: { userId: string; endpoint: string }) {
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
  },
  async sendToUser({ userId, payload }: { userId: string; payload: Payload }) {
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
    await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(s.subscription as any, JSON.stringify(payload))
          .catch(async (err) => {
            // 404/410 means the subscription is dead — drop it
            if (err.statusCode === 404 || err.statusCode === 410) {
              await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, s.endpoint))
            } else {
              throw err
            }
          })
      ),
    )
  },
}
```

**Always handle 404/410** by deleting the subscription. Push services return these when the user uninstalled the PWA or revoked permission. Without cleanup, your DB fills with dead endpoints and `Promise.allSettled` slows down.

## 5. Client subscription hook

```ts
// hooks/usePushSubscription.ts
"use client"

import { useCallback, useEffect, useState } from "react"

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4)
  const cleaned = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(cleaned)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export function usePushSubscription() {
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return
    setSupported(true)
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setSubscription(sub)
    })
  }, [])

  const subscribe = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    })
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    })
    setSubscription(sub)
  }, [])

  const unsubscribe = useCallback(async () => {
    if (!subscription) return
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    })
    await subscription.unsubscribe()
    setSubscription(null)
  }, [subscription])

  return { supported, subscription, subscribe, unsubscribe }
}
```

`userVisibleOnly: true` is required — Chrome refuses silent push.

## 6. Service worker handlers

Add to `public/sw.js`:

```js
self.addEventListener("push", (event) => {
  if (!event.data) return
  const payload = event.data.json()
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url || "/" },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = event.notification.data?.url || "/"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(url))
      if (existing) return existing.focus()
      return self.clients.openWindow(url)
    }),
  )
})
```

The `matchAll` + `focus` pattern reuses an existing tab if open; otherwise opens a new one. Without it, every click spawns a new tab.

## Permission UX

Don't ask for notification permission on page load. Browsers throttle and Safari blocks pre-emptive prompts. Tie the request to a user gesture: a button click, or a moment in the flow where notifications are the obvious next step ("get notified when your application is reviewed"). The pattern:

1. User clicks "Enable notifications".
2. Call `Notification.requestPermission()`.
3. If granted, call `usePushSubscription().subscribe()`.
4. If denied, surface a help link explaining how to re-enable in browser settings.

## iOS specifics

iOS 16.4+ supports web push **only after** the user installs the PWA to home screen and opens it from there. If you call `subscribe()` from a regular Safari tab on iOS, it silently fails. Detect installed state (`window.matchMedia("(display-mode: standalone)").matches`) before showing the enable-notifications CTA on iOS. See `references/ios-quirks.md`.
