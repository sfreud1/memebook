import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        page: "#f5f7fa",
        card: "#ffffff",
        line: "#dbe1e9",
        "line-strong": "#c6cfdb",
        fg: "#202b3c",
        "fg-2": "#4b5872",
        muted: "#7b879c",
        accent: "#3564dc",
        "accent-hover": "#2d57c4",
        "accent-soft": "#eef3ff",
        good: "#1e9e63",
        "good-soft": "#e9f7f0",
        warn: "#b8690f",
        "warn-soft": "#fff4e5",
        bad: "#d64545",
        "bad-soft": "#fdecec",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      maxWidth: { page: "68.75rem" },
      borderRadius: { card: "10px", field: "8px", btn: "9px" },
      boxShadow: {
        btn: "0 3px 8px rgba(53, 100, 220, 0.12)",
        card: "0 1px 2px rgba(32, 43, 60, 0.04)",
        pop: "0 8px 24px -8px rgba(32, 43, 60, 0.18)",
      },
    },
  },
  plugins: [],
} satisfies Config;
