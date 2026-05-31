#!/usr/bin/env tsx
/**
 * Generate the canonical PWA icon set from a single source logo.
 *
 * Outputs to <project-root>/public/icons/:
 *   - icon-192.png            (192x192, manifest)
 *   - icon-512.png            (512x512, manifest)
 *   - icon-maskable-512.png   (512x512, manifest, purpose="maskable", 40% safe-zone padding)
 *   - apple-touch-icon.png    (180x180, iOS home screen)
 *   - favicon-32.png          (32x32, browser tab)
 *   - favicon-16.png          (16x16, browser tab fallback)
 *
 * Run once after dropping in your logo, commit the output to git.
 *
 * Usage:
 *   pnpm add -D sharp tsx
 *   pnpm tsx scripts/generate-pwa-icons.ts            # uses public/logo.png
 *   pnpm tsx scripts/generate-pwa-icons.ts ./my-logo.png
 *   pnpm tsx scripts/generate-pwa-icons.ts ./my-logo.png --background "#ffffff"
 */

import sharp from "sharp"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const DEFAULT_SOURCE = "public/logo.png"
const OUTPUT_DIR = "public/icons"
const MASKABLE_SAFE_ZONE_PERCENT = 0.8 // 80% of canvas; spec calls for >=64%, recommend 80% for headroom

type IconSpec = {
  filename: string
  size: number
  maskable?: boolean
  background?: string
}

const ICONS: IconSpec[] = [
  { filename: "icon-192.png", size: 192 },
  { filename: "icon-512.png", size: 512 },
  { filename: "icon-maskable-512.png", size: 512, maskable: true },
  { filename: "apple-touch-icon.png", size: 180 },
  { filename: "favicon-32.png", size: 32 },
  { filename: "favicon-16.png", size: 16 },
]

function parseArgs() {
  const args = process.argv.slice(2)
  const positional = args.filter((a) => !a.startsWith("--"))
  const sourcePath = positional[0] || DEFAULT_SOURCE
  const bgIndex = args.indexOf("--background")
  const background = bgIndex >= 0 ? args[bgIndex + 1] : "#ffffff"
  return { sourcePath, background }
}

async function generateIcon({
  source,
  spec,
  background,
}: {
  source: Buffer
  spec: IconSpec
  background: string
}) {
  const outPath = path.join(OUTPUT_DIR, spec.filename)

  if (spec.maskable) {
    // Maskable: render logo into safe zone, fill remainder with background
    const innerSize = Math.round(spec.size * MASKABLE_SAFE_ZONE_PERCENT)
    const inner = await sharp(source)
      .resize(innerSize, innerSize, { fit: "contain", background })
      .png()
      .toBuffer()
    await sharp({
      create: {
        width: spec.size,
        height: spec.size,
        channels: 4,
        background,
      },
    })
      .composite([{ input: inner, gravity: "center" }])
      .png()
      .toFile(outPath)
  } else {
    await sharp(source)
      .resize(spec.size, spec.size, { fit: "contain", background })
      .png()
      .toFile(outPath)
  }

  console.log(`✓ ${outPath}`)
}

async function main() {
  const { sourcePath, background } = parseArgs()

  await mkdir(OUTPUT_DIR, { recursive: true })

  const source = await sharp(sourcePath).toBuffer().catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") {
      throw new Error(`Source logo not found: ${sourcePath}`)
    }
    throw err
  })

  const meta = await sharp(source).metadata()
  if ((meta.width ?? 0) < 512 || (meta.height ?? 0) < 512) {
    console.warn(
      `⚠ Source ${sourcePath} is ${meta.width}×${meta.height}. Recommend ≥512×512 for crisp output.`,
    )
  }

  console.log(`Generating PWA icons from ${sourcePath} (bg: ${background})\n`)
  for (const spec of ICONS) {
    await generateIcon({ source, spec, background })
  }
  console.log(`\nDone. Reference these in app/manifest.ts and app/layout.tsx.`)
}

main().catch((err) => {
  console.error("✗ Icon generation failed:", err.message)
  process.exit(1)
})
