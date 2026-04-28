import type { Config } from "tailwindcss"

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      animation: {
        blob1: "blob1 14s ease-in-out infinite",
        blob2: "blob2 16s ease-in-out infinite",
        blob3: "blob3 18s ease-in-out infinite",
      },
      keyframes: {
        blob1: {
          "0%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(55px, -65px) scale(1.08)" },
          "66%": { transform: "translate(-35px, 45px) scale(0.94)" },
          "100%": { transform: "translate(0px, 0px) scale(1)" },
        },
        blob2: {
          "0%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(-60px, -30px) scale(1.12)" },
          "66%": { transform: "translate(45px, 55px) scale(0.96)" },
          "100%": { transform: "translate(0px, 0px) scale(1)" },
        },
        blob3: {
          "0%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(35px, 70px) scale(1.06)" },
          "66%": { transform: "translate(-70px, -40px) scale(0.92)" },
          "100%": { transform: "translate(0px, 0px) scale(1)" },
        },
      },
    },
  },
} satisfies Config