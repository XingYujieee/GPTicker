import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ticker: {
          ink: "#020617",
          steel: "#0f172a",
          mist: "#dbeafe",
          cyan: "#67e8f9",
          mint: "#34d399",
          rose: "#fb7185"
        }
      },
      boxShadow: {
        shell: "0 24px 60px rgba(2, 6, 23, 0.48)"
      }
    }
  },
  plugins: []
};

export default config;
