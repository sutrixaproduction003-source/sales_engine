import type { Config } from "tailwindcss";

/**
 * Design tokens. The app's classes use Tailwind's palette names, so the
 * palettes are redefined here to give the whole UI one look:
 *  - slate      → graphite neutrals (surfaces, borders, text)
 *  - indigo/sky/violet → one accent ("iris"): actions, links, focus, selection
 *  - emerald / amber / rose stay as success / warning / danger
 */
const neutral = {
  50: "#f5f7fa",
  100: "#e9edf3",
  200: "#d2d8e2",
  300: "#aeb7c6",
  400: "#8793a7",
  500: "#667185",
  600: "#4b5467",
  700: "#353c4c",
  800: "#242a36",
  850: "#1c212b",
  900: "#161a22",
  950: "#0e1117",
};

const accent = {
  50: "#eef0ff",
  100: "#e0e3ff",
  200: "#c6caff",
  300: "#a6a9fb",
  400: "#8c8ef7",
  500: "#7475ef",
  600: "#6160e2",
  700: "#5150c5",
  800: "#42419f",
  900: "#38377e",
  950: "#22214a",
};

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: neutral,
        indigo: accent,
        sky: accent,
        violet: accent,
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 0 0 rgb(255 255 255 / 0.03) inset, 0 1px 2px 0 rgb(0 0 0 / 0.35)",
        pop: "0 12px 32px -8px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.04)",
      },
    },
  },
  plugins: [],
};
export default config;
