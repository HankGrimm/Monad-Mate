import type { Config } from "tailwindcss";

/**
 * Design tokens transcribed from
 * `stitch/stitch_monadmate_mobile_app_ui/velvet_cyberpunk_social/DESIGN.md`.
 *
 * The Stitch export inlined this config in a `<script>` tag next to a Tailwind
 * CDN build. Here it lives in the real config so classes are compiled and
 * purged normally, with no runtime CDN dependency.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#131318",
        "surface-dim": "#131318",
        "surface-bright": "#39383e",
        "surface-container-lowest": "#0e0e13",
        "surface-container-low": "#1b1b20",
        "surface-container": "#1f1f25",
        "surface-container-high": "#2a292f",
        "surface-container-highest": "#35343a",
        "surface-variant": "#35343a",
        "surface-tint": "#d2bbff",
        "on-surface": "#e4e1e9",
        "on-surface-variant": "#ccc3d8",
        "inverse-surface": "#e4e1e9",
        "inverse-on-surface": "#303036",
        outline: "#958da1",
        "outline-variant": "#4a4455",
        background: "#131318",
        "on-background": "#e4e1e9",
        primary: "#d2bbff",
        "on-primary": "#3f008e",
        "primary-container": "#7c3aed",
        "on-primary-container": "#ede0ff",
        "inverse-primary": "#732ee4",
        "primary-fixed": "#eaddff",
        "primary-fixed-dim": "#d2bbff",
        "on-primary-fixed": "#25005a",
        "on-primary-fixed-variant": "#5a00c6",
        secondary: "#ffb0cd",
        "on-secondary": "#640039",
        "secondary-container": "#aa0266",
        "on-secondary-container": "#ffbad3",
        "secondary-fixed": "#ffd9e4",
        "secondary-fixed-dim": "#ffb0cd",
        "on-secondary-fixed": "#3e0022",
        "on-secondary-fixed-variant": "#8c0053",
        tertiary: "#4edea3",
        "on-tertiary": "#003824",
        "tertiary-container": "#007650",
        "on-tertiary-container": "#76ffc2",
        "tertiary-fixed": "#6ffbbe",
        "tertiary-fixed-dim": "#4edea3",
        "on-tertiary-fixed": "#002113",
        "on-tertiary-fixed-variant": "#005236",
        error: "#ffb4ab",
        "on-error": "#690005",
        "error-container": "#93000a",
        "on-error-container": "#ffdad6",
      },
      borderRadius: {
        sm: "0.5rem",
        DEFAULT: "1rem",
        md: "1.5rem",
        lg: "2rem",
        xl: "3rem",
        full: "9999px",
      },
      spacing: {
        "space-2xs": "0.25rem",
        "space-xs": "0.5rem",
        "space-sm": "0.75rem",
        "space-md": "1rem",
        "space-lg": "1.25rem",
        "space-xl": "1.5rem",
        "space-2xl": "2rem",
        "space-3xl": "2.5rem",
        "space-4xl": "3rem",
        "gutter-mobile": "1rem",
        "margin-mobile": "1rem",
        "gutter-desktop": "1.5rem",
        "margin-desktop": "2rem",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-hero": [
          "40px",
          { lineHeight: "48px", letterSpacing: "-0.03em", fontWeight: "800" },
        ],
        "display-hero-mobile": [
          "32px",
          { lineHeight: "38px", letterSpacing: "-0.025em", fontWeight: "800" },
        ],
        "headline-lg": [
          "28px",
          { lineHeight: "34px", letterSpacing: "-0.02em", fontWeight: "700" },
        ],
        "headline-md": [
          "22px",
          { lineHeight: "28px", letterSpacing: "-0.015em", fontWeight: "700" },
        ],
        "headline-sm": [
          "18px",
          { lineHeight: "24px", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        "body-lg": [
          "16px",
          { lineHeight: "24px", letterSpacing: "-0.005em", fontWeight: "400" },
        ],
        "body-md": [
          "14px",
          { lineHeight: "20px", letterSpacing: "0em", fontWeight: "400" },
        ],
        "body-sm": [
          "12px",
          { lineHeight: "16px", letterSpacing: "0.01em", fontWeight: "400" },
        ],
        "label-lg": [
          "15px",
          { lineHeight: "20px", letterSpacing: "-0.01em", fontWeight: "600" },
        ],
        "label-md": [
          "13px",
          { lineHeight: "18px", letterSpacing: "0.01em", fontWeight: "600" },
        ],
        "label-sm": [
          "11px",
          { lineHeight: "14px", letterSpacing: "0.04em", fontWeight: "700" },
        ],
        "label-status": [
          "10px",
          { lineHeight: "12px", letterSpacing: "0.08em", fontWeight: "700" },
        ],
      },
      boxShadow: {
        // "Layer 2 (Interactive Floating Elements)" from DESIGN.md
        float:
          "0 12px 32px -4px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4)",
        beacon:
          "0 0 24px rgba(124, 58, 237, 0.35), 0 4px 12px rgba(124, 58, 237, 0.2)",
        "hot-match": "0 0 28px rgba(236, 72, 153, 0.3)",
        onsite: "0 0 12px rgba(16, 185, 129, 0.4)",
      },
      animation: {
        "fade-up": "fadeUp 0.4s ease-out forwards",
        "fade-in": "fadeIn 0.3s ease-out forwards",
        ripple: "ripple 2.4s ease-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        ripple: {
          "0%": { transform: "scale(0.8)", opacity: "0.5" },
          "100%": { transform: "scale(2.2)", opacity: "0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
