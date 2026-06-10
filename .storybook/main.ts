import type { StorybookConfig } from "@storybook/nextjs-vite";
import tailwindcss from "@tailwindcss/vite";

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
    return viteConfig;
  },
};

export default config;
