/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: {
          DEFAULT: '#141414',
          raised: '#1c1c1c',
          overlay: 'rgba(255,255,255,0.06)',
        },
        accent: {
          gold: '#f5c842',
          emerald: '#34d399',
        },
      },
      boxShadow: {
        card: '0 4px 24px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.3)',
        glow: '0 0 32px rgba(245,200,66,0.15)',
        'glow-emerald': '0 0 24px rgba(52,211,153,0.2)',
      },
    },
  },
  plugins: [],
}
