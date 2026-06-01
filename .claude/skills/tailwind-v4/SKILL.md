---
name: tailwind-v4
description: Tailwind CSS v4 migration patterns and native best practices. Use when writing new Tailwind classes, migrating from v3 to v4, auditing CSS for deprecated utilities (rounded-sm, shadow-sm, blur-sm, flex-shrink, !prefix, hsl(var())), configuring @theme inline, using OKLCH colors, container queries, or updating shadcn/ui components for v4 compatibility.
---

# Tailwind CSS v4 Migration & Best Practices

## Overview

This skill covers both migrating from Tailwind v3 to v4 AND v4-native best practices for writing modern, performant CSS. Use this when auditing codebases, migrating projects, or writing new code with Tailwind v4.

---

## V4 Best Practices (Native Features)

### 1. CSS-First Configuration with `@theme`

v4 moves configuration from JavaScript to CSS. Use `@theme inline` for design tokens:

```css
@import "tailwindcss";

@theme inline {
  /* Design tokens - these become Tailwind utilities */
  --font-sans: 'Inter', system-ui, sans-serif;
  --radius: 0.5rem;

  /* Custom colors reference CSS variables */
  --color-primary: var(--primary);
  --color-background: var(--background);

  /* Custom animations */
  --animate-accordion-down: accordion-down 0.2s ease-out;
}
```

### 2. Use OKLCH for All Colors

OKLCH provides perceptually uniform colors. Always define colors in OKLCH:

```css
:root {
  /* Format: oklch(lightness chroma hue) */
  --primary: oklch(0.52 0.12 130);      /* Green */
  --destructive: oklch(0.58 0.22 25);   /* Red */
  --background: oklch(1 0 0);            /* White */
  --foreground: oklch(0.24 0.01 260);   /* Dark gray */
}

.dark {
  --background: oklch(0.18 0.005 260);
  --foreground: oklch(0.95 0.005 260);
}
```

### 3. Use `@plugin` for Tailwind Plugins

```css
@import "tailwindcss";
@plugin "tailwindcss-animate";
@plugin "@tailwindcss/typography";
```

### 4. Modern Color Opacity Syntax

Always use the slash syntax for opacity:

```html
<!-- Correct v4 pattern -->
<div class="bg-primary/50 text-foreground/80 border-border/25">

<!-- Also works with arbitrary colors -->
<div class="bg-[oklch(0.5_0.2_250)]/50">
```

### 5. Container Queries (Native in v4)

Use `@container` for component-based responsive design:

```html
<div class="@container">
  <div class="@sm:flex @lg:grid @lg:grid-cols-2">
    <!-- Responds to container size, not viewport -->
  </div>
</div>
```

### 6. Use `size-*` for Width + Height

```html
<!-- v4 best practice -->
<div class="size-8">  <!-- Sets both w-8 and h-8 -->
<div class="size-full">  <!-- w-full h-full -->

<!-- Instead of -->
<div class="w-8 h-8">
```

### 7. Logical Properties for RTL Support

Use logical properties for internationalization:

```html
<!-- v4 logical properties -->
<div class="ms-4 me-2 ps-6 pe-4">  <!-- margin-start, margin-end, padding-start, padding-end -->
<div class="start-0 end-4">  <!-- inset-inline-start, inset-inline-end -->

<!-- Instead of directional -->
<div class="ml-4 mr-2 pl-6 pr-4">
```

### 8. Native `text-wrap` Utilities

```html
<h1 class="text-balance">Balanced headline text</h1>
<p class="text-pretty">Pretty paragraph wrapping</p>
```

### 9. Subgrid Support

```html
<div class="grid grid-cols-3">
  <div class="col-span-2 grid grid-cols-subgrid">
    <!-- Inherits parent grid columns -->
  </div>
</div>
```

### 10. Modern Gradient Syntax

```html
<!-- Use oklch interpolation for smoother gradients -->
<div class="bg-gradient-to-r from-primary to-accent">

<!-- Custom gradient with color stops -->
<div class="bg-[linear-gradient(in_oklch,var(--primary),var(--accent))]">
```

---

## V3 to V4 Migration Patterns

### What to Search For (Grep Commands)

```bash
# === RENAMED UTILITIES ===
# Find all renamed size utilities
grep -rn "rounded-sm\|shadow-sm\|blur-sm\|drop-shadow-sm" src/
grep -rn "backdrop-blur-sm" src/

# Find deprecated flex utilities
grep -rn "flex-shrink\|flex-grow" src/

# Find overflow-ellipsis (now text-ellipsis)
grep -rn "overflow-ellipsis" src/

# Find decoration-slice/clone
grep -rn "decoration-slice\|decoration-clone" src/

# === SYNTAX CHANGES ===
# Find deprecated important syntax (!prefix)
grep -rn ':\!' src/

# Find HSL wrapper usage (should be direct var())
grep -rn 'hsl(var(' src/

# Find deprecated opacity utilities
grep -rn "text-opacity-\|bg-opacity-\|border-opacity-\|placeholder-opacity-" src/
grep -rn "divide-opacity-\|ring-opacity-" src/

# === CONFIGURATION ===
# Find old @tailwind directives
grep -rn "@tailwind base\|@tailwind components\|@tailwind utilities" src/

# Find tailwind.config references that may need migration
find . -name "tailwind.config.*" -not -path "./node_modules/*"
```

---

## Deprecated Patterns & Replacements

### 1. Renamed Utility Classes

| v3 (Deprecated) | v4 (Use This) | Notes |
|-----------------|---------------|-------|
| `rounded-sm` | `rounded-xs` | Border radius scale shifted |
| `shadow-sm` | `shadow-xs` | Shadow scale shifted |
| `blur-sm` | `blur-xs` | Blur scale shifted |
| `backdrop-blur-sm` | `backdrop-blur-xs` | Backdrop blur scale shifted |
| `drop-shadow-sm` | `drop-shadow-xs` | Drop shadow scale shifted |
| `flex-shrink-0` | `shrink-0` | Simplified naming |
| `flex-shrink` | `shrink` | Simplified naming |
| `flex-grow-0` | `grow-0` | Simplified naming |
| `flex-grow` | `grow` | Simplified naming |
| `overflow-ellipsis` | `text-ellipsis` | Renamed for clarity |
| `decoration-slice` | `box-decoration-slice` | Full name required |
| `decoration-clone` | `box-decoration-clone` | Full name required |

### 2. Important Modifier Syntax

```diff
# v3 (Deprecated)
- !text-red-500
- group-data-[collapsible=icon]:!size-8
- hover:!bg-blue-500

# v4 (Use This)
+ text-red-500!
+ group-data-[collapsible=icon]:size-8!
+ hover:bg-blue-500!
```

### 3. Color Function Syntax

```diff
# v3 (Deprecated) - HSL wrapper
- shadow-[0_0_0_1px_hsl(var(--sidebar-border))]
- fill="hsl(var(--background))"
- stroke="hsl(var(--foreground) / 0.28)"

# v4 (Use This) - Direct CSS variables (already in OKLCH/color space)
+ shadow-[0_0_0_1px_var(--sidebar-border)]
+ fill="var(--background)"
+ stroke="color-mix(in oklch, var(--foreground) 28%, transparent)"
```

### 4. Deprecated Opacity Utilities

```diff
# v3 (Deprecated)
- text-opacity-50
- bg-opacity-75
- border-opacity-25
- placeholder-opacity-50

# v4 (Use This) - Use color with alpha
+ text-black/50
+ bg-white/75
+ border-gray-500/25
+ placeholder:text-gray-400/50
```

---

## Configuration Requirements

### PostCSS Config (`postcss.config.js`)

```javascript
// v4 - Correct
module.exports = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
}

// v3 - Deprecated
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

### CSS Entry Point (`globals.css`)

```css
/* v4 - Correct */
@import "tailwindcss";
@plugin "tailwindcss-animate";

@theme inline {
  /* Custom design tokens */
  --radius: 0.5rem;
  --color-primary: var(--primary);
  /* ... */
}

/* v3 - Deprecated */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### Package Dependencies

```json
{
  "dependencies": {
    "tailwindcss": "^4.x.x"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.x.x"
  }
}
```

### No `tailwind.config.js` Needed

In v4, configuration moves to CSS via `@theme inline`. The `tailwind.config.js` file is no longer required for most projects.

---

## Quick Reference Card

### Size Scale Changes
| v3 | v4 | Actual Size |
|----|----|----|
| `rounded-sm` | `rounded-xs` | 0.125rem (2px) |
| `rounded` | `rounded-sm` | 0.25rem (4px) |
| `shadow-sm` | `shadow-xs` | Subtle shadow |
| `shadow` | `shadow-sm` | Small shadow |
| `blur-sm` | `blur-xs` | 4px blur |

### Common Find & Replace

```
rounded-sm    ->  rounded-xs
shadow-sm     ->  shadow-xs
blur-sm       ->  blur-xs
flex-shrink-0 ->  shrink-0
flex-grow-0   ->  grow-0
!important    ->  suffix! (e.g., text-red-500!)
hsl(var(--x)) ->  var(--x)
```

---

## Migration Checklist

- [ ] Update `postcss.config.js` to use `@tailwindcss/postcss`
- [ ] Convert CSS from `@tailwind` directives to `@import "tailwindcss"`
- [ ] Move theme config from `tailwind.config.js` to `@theme inline` in CSS
- [ ] Replace `rounded-sm` -> `rounded-xs`
- [ ] Replace `shadow-sm` -> `shadow-xs`
- [ ] Replace `blur-sm` -> `blur-xs`
- [ ] Replace `backdrop-blur-sm` -> `backdrop-blur-xs`
- [ ] Replace `flex-shrink-0` -> `shrink-0`
- [ ] Replace `flex-grow-0` -> `grow-0`
- [ ] Update `!prefix` -> `suffix!` for important modifiers
- [ ] Replace `hsl(var(--...))` -> `var(--...)` (colors should be in OKLCH)
- [ ] Remove deprecated opacity utilities
- [ ] Run build to verify no CSS warnings
- [ ] Visual spot-check affected components

---

## Color Space: OKLCH

Tailwind v4 uses OKLCH (Oklab Lightness Chroma Hue) as the default color space for better perceptual uniformity.

```css
/* Define colors in OKLCH */
:root {
  --primary: oklch(0.52 0.12 130);
  --background: oklch(1 0 0);
  --foreground: oklch(0.24 0.01 260);
}
```

Benefits:
- Perceptually uniform color mixing
- Better gradients
- Consistent lightness across hues

---

## Common Patterns in shadcn/ui Components

shadcn/ui components often need these updates:

| Component | Common Issues |
|-----------|--------------|
| `checkbox.tsx` | `rounded-sm` |
| `dialog.tsx` | `rounded-sm` |
| `sheet.tsx` | `rounded-sm` |
| `tabs.tsx` | `rounded-sm`, `shadow-sm` |
| `card.tsx` | `shadow-sm` |
| `command.tsx` | `rounded-sm` |
| `dropdown-menu.tsx` | `rounded-sm` (multiple) |
| `context-menu.tsx` | `rounded-sm` (multiple) |
| `menubar.tsx` | `rounded-sm` (multiple) |
| `select.tsx` | `rounded-sm` |
| `sidebar.tsx` | `!prefix`, `hsl(var())` |

---

## Resources

- [Tailwind CSS v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
- [OKLCH Color Space](https://oklch.com/)
