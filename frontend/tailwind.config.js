/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tt: {
          blue: "#0ea5e9",
          navy: "#0f172a",
          green: "#10b981",
          amber: "#f59e0b",
          red: "#ef4444"
        }
      }
    },
  },
  plugins: [],
}
