import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      screens: {
        compact: { max: "767px" },
        tablet: { min: "768px", max: "1023px" },
        desktop: { min: "1024px" },
      },
    },
  },
  plugins: [],
};

export default config;
