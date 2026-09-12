import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0e0f12",
        panel: "#15171c",
        raised: "#1b1e25",
        edge: "#262a33",
        "edge-strong": "#343945",
        fg: "#eceae4",
        "fg-2": "#b8b5ad",
        muted: "#7e8290",
        accent: "#f4c35a",
        "accent-ink": "#2a1f05",
        good: "#58d68d",
        warn: "#ff8a5b",
        bad: "#f26d6d",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      maxWidth: { page: "72rem" },
      boxShadow: {
        glow: "0 0 0 1px rgba(244,195,90,.25), 0 12px 40px -20px rgba(244,195,90,.35)",
      },
    },
  },
  plugins: [],
} satisfies Config;
