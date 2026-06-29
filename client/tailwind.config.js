/** @type {import('tailwindcss').Config} */
// Palette is driven by CSS variables (space-separated RGB triplets) so the app
// can switch themes at runtime via a `data-theme` attribute. See src/index.css.
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        discord: {
          bg: v("bg"), // chat area
          sidebar: v("sidebar"), // channel list
          rail: v("rail"), // server rail + header
          deep: v("deep"), // inputs / deepest surfaces
          card: v("card"),
          hover: v("hover"),
          active: v("active"),
          input: v("input"),
          accent: v("accent"), // primary
          accentDark: v("accentDark"), // primary hover / gradient end
          green: v("green"),
          danger: v("danger"),
          dangerDark: v("dangerDark"),
          link: v("link"),
          text: v("text"),
          muted: v("muted"),
          faint: v("faint"),
        },
      },
      fontFamily: {
        sans: ["'gg sans'", "'Helvetica Neue'", "Helvetica", "Arial", "sans-serif"],
      },
      boxShadow: {
        // Soft elevation for a more three-dimensional feel.
        panel: "0 8px 24px -8px rgb(0 0 0 / 0.45)",
        glow: "0 4px 16px -2px rgb(var(--c-accent) / 0.45)",
      },
    },
  },
  plugins: [],
};
