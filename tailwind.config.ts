import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#050507",
        coal: "#0A0A0F",
        panel: "#0E0E14",
        line: "rgba(255,255,255,0.08)",
        electric: "#2563EB",
        sky: "#38BDF8",
        violet: "#7C3AED",
        lavender: "#8B5CF6",
        mist: "#A1A1AA",
        paper: "#F4F4F5",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        arabic: ["var(--font-arabic)", "var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
