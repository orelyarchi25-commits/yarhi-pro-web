import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#eef4fb",
          100: "#d9e5f6",
          200: "#b9d0ed",
          300: "#8bb3e1",
          400: "#568fd1",
          500: "#3373bd",
          600: "#265a9e",
          700: "#204881",
          800: "#1e3d6b",
          900: "#1e3559",
          950: "#0f1d35",
        },
        metallic: {
          100: "#f5f7fa",
          200: "#e4e8ef",
          300: "#c5ced9",
          400: "#9ea9b8",
          500: "#7b8794",
          600: "#5c6775",
          700: "#49525d",
          800: "#3d444d",
          900: "#363c43",
        },
        accent: {
          gold: "#c9a227",
          silver: "#a8b2c1",
          bronze: "#cd7f32",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-metallic":
          "linear-gradient(135deg, #1e3559 0%, #0f1d35 50%, #1a2d4a 100%)",
      },
    },
  },
  plugins: [],
};
export default config;
