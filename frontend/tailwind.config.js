/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { canvas: '#080c16', panel: '#101725', line: '#202b3c', muted: '#8491a8', ink: '#f3f6fc', violet: '#8c78ff', mint: '#3bd6ad' },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      boxShadow: { glow: '0 18px 60px rgba(97, 75, 235, .16)' },
    },
  },
  plugins: [],
}
