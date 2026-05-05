/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        fiber: {
          blue: "#1e40af",
          orange: "#f97316",
          green: "#15803d",
          brown: "#7c2d12",
          slate: "#475569",
          white: "#f8fafc",
          red: "#dc2626",
          black: "#0f172a",
          yellow: "#eab308",
          violet: "#7c3aed",
          rose: "#e11d48",
          aqua: "#06b6d4",
        },
      },
    },
  },
  plugins: [],
};
