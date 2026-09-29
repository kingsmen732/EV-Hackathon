import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#070b10", 900: "#0b1118", 850: "#0f1720", 800: "#131d28", 700: "#1c2a38", 600: "#2a3b4d" },
        volt: { 300: "#8ef5c4", 400: "#4fe6a3", 500: "#1fd084", 600: "#12a86a" },
        amp: { 400: "#ffc857", 500: "#f5a524" },
        surge: { 400: "#ff7a7a", 500: "#f04d4d" },
        share: { 400: "#b8a4ff", 500: "#9a7bff" },
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"], mono: ["var(--font-mono)", "monospace"] },
    },
  },
  plugins: [],
} satisfies Config;
