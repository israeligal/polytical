import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs-vite";
import tailwindcss from "@tailwindcss/vite";

// Server actions transitively pull the DB/auth chain into the browser bundle; alias each to an inert stub so stories render.
const mock = (p: string) => fileURLToPath(new URL(`./mocks/actions/${p}.ts`, import.meta.url));
const ACTION_ALIASES = [
  { find: /^@\/app\/actions\/stances$/, replacement: mock("stances") },
  { find: /^@\/app\/actions\/bet$/, replacement: mock("bet") },
  { find: /^@\/app\/actions\/onboarding$/, replacement: mock("onboarding") },
  { find: /^@\/app\/actions\/duels$/, replacement: mock("duels") },
];

/**
 * Storybook 10 + the Next.js Vite framework (Next 16 / React 19 compatible).
 *
 * Tailwind v4 is loaded through `@tailwindcss/vite` (not the PostCSS plugin) so
 * the design-token utilities in `app/globals.css` are generated for the
 * isolated Storybook bundle. `preview.ts` imports `globals.css` to apply them.
 */
const config: StorybookConfig = {
  stories: ["../components/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  staticDirs: ["../public"],
  viteFinal: async (viteConfig) => {
    viteConfig.plugins = viteConfig.plugins ?? [];
    viteConfig.plugins.push(tailwindcss());
    viteConfig.resolve = viteConfig.resolve ?? {};
    const existing = viteConfig.resolve.alias;
    const existingArray = Array.isArray(existing)
      ? existing
      : existing
        ? Object.entries(existing).map(([find, replacement]) => ({ find, replacement: replacement as string }))
        : [];
    viteConfig.resolve.alias = [...existingArray, ...ACTION_ALIASES];
    return viteConfig;
  },
};

export default config;
