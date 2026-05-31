import type { Decorator, Preview } from "@storybook/nextjs-vite";
import "../app/globals.css";

/**
 * RTL + Hebrew is the product baseline (see AGENTS.md "Styling, design system &
 * RTL"). Storybook does not run `next/font`, so the `--font-*` CSS variables
 * from the real app are absent — the `@theme` fallbacks in globals.css
 * ("Frank Ruhl Libre" / "Heebo" / system-ui) keep text legible. We set
 * `dir`/`lang` on the preview root from a single decorator, mirroring layout.tsx.
 */
const withDirection: Decorator = (Story, context) => {
  const dir = context.globals.direction ?? "rtl";
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("dir", dir);
    document.documentElement.setAttribute("lang", dir === "rtl" ? "he" : "en");
  }
  return Story();
};

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: "paper",
      values: [
        { name: "paper", value: "oklch(0.985 0.008 85)" },
        { name: "card", value: "oklch(0.995 0.004 90)" },
      ],
    },
    a11y: {
      // Report violations in the panel without failing the build.
      test: "todo",
    },
  },
  globalTypes: {
    direction: {
      description: "Document direction",
      defaultValue: "rtl",
      toolbar: {
        title: "Direction",
        icon: "transfer",
        items: [
          { value: "rtl", title: "RTL (עברית)" },
          { value: "ltr", title: "LTR" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [withDirection],
};

export default preview;
