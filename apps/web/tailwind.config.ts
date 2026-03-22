import type { Config } from "tailwindcss";

const config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: "var(--card)",
        border: "var(--border)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        accentStrong: "var(--accent-strong)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "0.9rem",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.1)",
      },
      fontFamily: {
        sans: ['"Noto Sans KR"', '"Noto Sans"', "sans-serif"],
        display: ['"Noto Sans KR"', '"Noto Sans"', "sans-serif"],
        body: ['"Noto Sans KR"', '"Noto Sans"', "sans-serif"],
        mono: ["SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
