import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#f7f6f2",
        card: "#ffffff",
        line: "#e6e3db",
        "line-strong": "#d4d0c6",
        fg: "#1b1a17",
        "fg-2": "#494640",
        muted: "#7a766d",
        accent: "#0d7a6a",
        "accent-hover": "#0b6a5c",
        "accent-soft": "#e6f3f0",
        lock: "#c77700",
        "lock-soft": "#fdf3e3",
        good: "#1d9a5b",
        "good-soft": "#e7f6ee",
        warn: "#b45309",
        "warn-soft": "#fef3e2",
        bad: "#d14343",
        "bad-soft": "#fcebeb",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      maxWidth: { page: "70rem" },
      borderRadius: { card: "12px", field: "8px", btn: "8px" },
      boxShadow: {
        card: "0 1px 2px rgba(27, 26, 23, 0.04)",
        pop: "0 12px 32px -12px rgba(27, 26, 23, 0.22)",
      },
    },
  },
  plugins: [],
} satisfies Config;
