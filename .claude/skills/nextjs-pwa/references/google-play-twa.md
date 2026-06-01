# Google Play Store via TWA (Trusted Web Activity)

Wrap an installable PWA as a Google Play app without rebuilding the UI. Apple App Store has separate constraints — see the bottom of this file.

## What a TWA actually is

A TWA is a thin Android wrapper that launches your PWA inside Chrome Custom Tabs running in fullscreen, without the URL bar. From the user's perspective it's a native app; under the hood it's the PWA you already shipped, served from your origin, with the same service worker and storage as the installed-PWA experience.

Requirements your PWA must meet (we already meet all of these):
- Served over HTTPS.
- Has a valid `manifest.webmanifest` with `name`, `short_name`, `start_url`, `display: standalone`, `theme_color`, `background_color`, and at least one 192×192 + one 512×512 icon.
- Has a registered service worker.
- Passes Lighthouse "Installable" criteria.

## The two tools

| Tool | What it does | When to use |
|---|---|---|
| **PWABuilder** (`pwabuilder.com`) | Web UI: paste your URL, it generates an Android Studio project + signed APK/AAB. Closest to one-click. | First-time wrap, no prior Android tooling. |
| **Bubblewrap** (`@bubblewrap/cli` from Google) | Local CLI, more control over the generated project, easier to commit and rebuild. | When you want the wrapper config in source control. |

PWABuilder uses Bubblewrap under the hood. They produce equivalent output. Use Bubblewrap if you want the wrapper checked into the repo (recommended for a project this size).

## Bubblewrap path (recommended)

```bash
# Install
npm i -g @bubblewrap/cli

# Initialize from your manifest URL — produces a /twa subdirectory
bubblewrap init --manifest=https://www.greencardgenius.com/app/manifest.webmanifest

# Answer prompts:
# - Application name: Green Card Genius
# - Short name: GCG
# - Domain: www.greencardgenius.com
# - URL path: /app/
# - Display mode: standalone
# - Theme color: #608939
# - Background color: #ffffff
# - Status bar color: #608939
# - Icon URL: defaults to /icons/icon-512.png from manifest
# - Maskable icon URL: /icons/icon-maskable-512.png
# - Splash color: #ffffff
# - Signing key: choose "Create new" the first time
#   - Save the keystore + alias + passwords in 1Password — losing them
#     means you can never publish updates to the same listing.
# - Package name: com.greencardgenius.app (must be unique on Play Store)

# Build the AAB (Android App Bundle for Play Store upload)
cd twa
bubblewrap build
# Outputs: app-release-bundle.aab (signed) and app-release-signed.apk (for testing)
```

## Digital Asset Links (the one thing that bites people)

Without this, the TWA opens with a URL bar at the top — defeats the point. The link proves your domain authorizes the Android package to run as a TWA.

1. Bubblewrap prints an `assetlinks.json` after init/build.
2. Host it at `https://www.greencardgenius.com/.well-known/assetlinks.json` — exactly that path.
3. In this Next.js project: add to `public/.well-known/assetlinks.json`. It's a static JSON file, served as-is from `public/`. Verify after deploy: `curl https://www.greencardgenius.com/.well-known/assetlinks.json`.

The file looks like:
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.greencardgenius.app",
    "sha256_cert_fingerprints": ["AB:CD:..."]
  }
}]
```

The `sha256_cert_fingerprints` value comes from your signing keystore. Bubblewrap prints it. **It must match your release signing — if Google's Play App Signing changes the upload key, regenerate.**

## Play Console submission

1. Create the Google Play Developer account ($25 one-time).
2. Create a new app in Play Console.
3. Upload `app-release-bundle.aab` to the Production track.
4. Fill in store listing: title, short description, full description, screenshots (at least 2 phone), feature graphic (1024×500), app icon (the 512×512 from manifest works).
5. Privacy policy URL — required. Already have one? Point at it. If not, you need to create one.
6. Data safety form: declare what your app collects (you collect: account info, app activity, app interactions). PostHog + RudderStack count as analytics SDKs you must disclose.
7. Content rating questionnaire.
8. Pricing: free, available in selected countries.
9. **Wait for review.** Typical 1–7 days for first submission.

## Update flow (after the first ship)

Push web changes → users see them on next PWA load. Bubblewrap wrapper rarely needs rebuilding. Only rebuild + reupload the AAB when:
- Bumping `versionCode` for forced-update behavior.
- Changing the package name, signing key, theme/splash colors, or icon.
- Updating `targetSdkVersion` (Google requires bumps roughly yearly).

## What to commit to this repo

Recommended structure:
```
twa/
├── twa-manifest.json        # Bubblewrap config, edited by humans
├── store-listing/           # screenshots, description text, change log
├── README.md                # build + sign + upload instructions
public/.well-known/
└── assetlinks.json          # served from your origin
```

Do NOT commit:
- The keystore (`*.keystore`).
- `keystore.pwd` / signing passwords.
- Any `.aab` / `.apk` build artifacts (bubblewrap regenerates them).

`.gitignore`:
```
twa/app/
twa/build/
twa/*.keystore
twa/*.pwd
```

## Effort estimate

- Local tooling setup + first build: 1 day.
- Play Console listing (screenshots, copy, privacy policy review): 1–2 days.
- Review wait: 1–7 days.
- Total elapsed: ~1 week to live.

## Key gotchas

- **Status bar color matches `theme_color`** — make sure you like how `#608939` looks behind the system bar. If not, override `statusBarColor` in `twa-manifest.json`.
- **Splash screen is the manifest's `background_color` + 192×192 icon centered.** No separate splash file. Test on actual device.
- **Manifest changes don't auto-propagate** — if you change `name`, `theme_color`, or icons in `app/manifest.ts`, you must re-run `bubblewrap update` and re-upload. Mention this in the TWA `README.md`.
- **Package name is forever** — once published, you can never change it without losing the listing + reviews. Pick carefully.
- **Play App Signing** is enabled by default for new apps — Google holds the production signing key, you only sign with an upload key. This means the `sha256_cert_fingerprints` in `assetlinks.json` must come from Google's app-signing fingerprint (visible in Play Console → Setup → App signing), NOT your local keystore. Bubblewrap can fetch this if you point it at the Play Console value.

## iOS App Store (separate problem)

PWAs cannot be submitted directly to the App Store. Wrapping with **PWABuilder iOS** or **Capacitor** produces a submittable build, but Apple guideline 4.2 ("Minimum Functionality") routinely rejects wrappers that are "just a website" without distinctive native value-add (offline-first features, hardware access, native UX patterns).

If iOS App Store presence becomes a goal, plan native value-add first — don't pursue a pure shell wrapper. That's a separate effort scoped after Play Store ships.
