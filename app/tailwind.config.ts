import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0b0d",
        panel: "#121417",
        edge: "#22262c",
        muted: "#8b93a1",
        accent: "#c8f560",
      },
    },
  },
  plugins: [],
} satisfies Config;
