# iOS Safari PWA quirks

iOS implements PWAs differently from Chromium and intentionally. Treat iOS as a separate platform, not a fallback.

## Install flow

iOS Safari does **not** fire `beforeinstallprompt`. There is no programmatic "install" trigger. The user must:

1. Tap the Share button (square with up arrow) in the Safari toolbar.
2. Scroll down and tap "Add to Home Screen".
3. Confirm the icon and name.

Your job: detect iOS + non-installed state and show a hint with a Share-icon glyph. Don't try to "trigger" the install — there's no API.

```tsx
"use client"
import { useEffect, useState } from "react"

export function InstallPrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    setShow(isIOS && !isStandalone)
  }, [])

  if (!show) return null
  return (
    <aside>
      <p>Install this app: tap <span aria-label="Share">⎋</span> then "Add to Home Screen" <span>➕</span>.</p>
    </aside>
  )
}
```

The `(navigator as any).standalone` property is a legacy iOS-only flag (true if launched from home screen). `window.matchMedia("(display-mode: standalone)").matches` is the cross-platform standard and works on iOS 16.4+. Prefer the matchMedia check.

## Detecting installed state

Three methods, in order of preference:

1. `window.matchMedia("(display-mode: standalone)").matches` — standard, works everywhere.
2. `(navigator as any).standalone === true` — legacy iOS, still useful as a fallback.
3. URL query parameter you set in `start_url` (e.g., `start_url: "/?installed=1"`) — works as a last resort.

Use #1 alone unless you specifically need to support older iOS.

## `apple-touch-icon`

iOS ignores manifest icons for the home-screen tile. It uses the `apple-touch-icon` link tag. **Always include**:

```tsx
// app/layout.tsx (Metadata API handles the link tag)
icons: {
  apple: "/icons/apple-touch-icon.png", // 180×180
}
```

If you skip this, iOS uses a screenshot of the page as the icon, which looks broken.

iOS 7+ no longer applies the rounded-corner mask automatically — your icon should be a flat square that *looks good as-is*. If you want the rounded mask, render it into the icon. Don't rely on iOS to add it.

## `appleWebApp` metadata

```tsx
appleWebApp: {
  capable: true,                  // tells iOS this is a web app, not a website
  statusBarStyle: "default",      // "default" | "black" | "black-translucent"
  title: "App Name",              // appears under the icon (must be short)
}
```

`statusBarStyle: "black-translucent"` makes the status bar transparent and overlays it on your content — useful for fullscreen experiences but you must add top padding so your header isn't hidden behind it.

## Splash screens

iOS doesn't read manifest splash screens. To get a branded launch screen, you must provide separate `<link rel="apple-touch-startup-image">` tags for each device size — iPhone SE through Pro Max, multiple iPad sizes, light and dark modes. This produces ~20+ tags.

Most apps skip this and accept a white flash on launch. Tools like `pwa-asset-generator` produce the full set if you want it.

## iOS push notifications (16.4+)

Web push works on iOS, but with constraints:

- **Requires iOS 16.4 or later.** Older versions return `Notification.requestPermission()` with `"denied"` instantly.
- **Requires the PWA to be installed to home screen.** Push subscriptions made from a regular Safari tab silently fail. Detect installed state before showing the "enable notifications" CTA.
- **Requires iOS-style notification permission flow**: must follow a user gesture, must not be the first interaction, and the prompt cannot be re-triggered if denied (user must change in Settings).
- **Notification icons** must be reachable HTTPS URLs. iOS does not respect the `badge` field reliably; the main `icon` is what shows.

## Storage quotas

iOS aggressively evicts PWA data after **7 days of inactivity**. If your PWA stores anything in IndexedDB or Cache Storage that the user cares about (offline form drafts, e.g.), warn them that the data may disappear if they don't open the app for a week. There is no opt-out.

This applies only to PWAs not installed to home screen. Installed PWAs get the same quota as Safari proper.

## `display: standalone` vs `display: minimal-ui`

iOS supports `standalone` (full custom chrome) and treats `minimal-ui` and `browser` as "open in Safari." If you want a status bar and the iOS notch handled gracefully, use `standalone` and set `viewportFit: "cover"` in the viewport export so `env(safe-area-inset-*)` CSS variables are populated.

## CSS for the notch

```css
header {
  padding-top: env(safe-area-inset-top);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
```

Without this, your header sits behind the notch on iPhone X+.

## Testing on iOS

You need a real device. Simulator doesn't accurately reproduce home-screen install behavior, push permissions, or storage eviction. Connect an iPhone, open Safari, tap Share → Add to Home Screen, and exercise the full flow. Use Safari's "Inspect" tool from a Mac (Develop menu) to debug the standalone window.
