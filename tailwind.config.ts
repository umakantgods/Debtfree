import type { Config } from "tailwindcss";

// Palette: calm, trustworthy fintech — deep teal + warm neutral, not "bank blue".
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefaf7",
          100: "#d4f1e9",
          200: "#a9e3d3",
          300: "#78ceba",
          400: "#4fb39f",
          500: "#2f9683",
          600: "#22786a",
          700: "#1e6056",
          800: "#1c4d46",
          900: "#19403b",
        },
        ink: {
          50: "#f7f7f6",
          100: "#e8e7e4",
          400: "#8b877f",
          600: "#5c584f",
          800: "#332f28",
          900: "#211e19",
        },
        warn: "#c9822a",
        danger: "#c1483f",
      },
      fontFamily: {
        sans: ["'Inter'", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
export default config;
