/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Discord-like dark palette, exposed as Tailwind colors.
      colors: {
        discord: {
          bg: "#313338",          // chat area
          sidebar: "#2b2d31",     // channel list
          rail: "#1e1f22",        // server rail + header
          card: "#383a40",
          hover: "#404249",
          active: "#404249",
          input: "#383a40",
          accent: "#5865f2",      // blurple
          green: "#23a55a",
          danger: "#da373c",
          text: "#dbdee1",
          muted: "#949ba4",
          faint: "#80848e",
        },
      },
      fontFamily: {
        sans: ["'gg sans'", "'Helvetica Neue'", "Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
