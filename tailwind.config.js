/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Charte LA TERMITIÈRE : rouge brique + anthracite (couleurs du logo)
        primary: { DEFAULT: '#BC3C31', dark: '#8F2A20', light: '#D9594B' },
        secondary: { DEFAULT: '#2E2E2E', dark: '#1A1A1A' },
        charcoal: { DEFAULT: '#2E2E2E', dark: '#1A1A1A', light: '#4A4A4A' },
        agro: '#BC3C31',
        logistique: '#0369a1',
        evenementiel: '#7c3aed',
        rh: '#ea580c',
        ovins: '#0284c7',
        bovins: '#7c3aed',
        caprins: '#16a34a',
        volailles: '#ea580c'
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      keyframes: {
        wiggle: {
          '0%, 100%': { transform: 'rotate(-10deg)' },
          '50%': { transform: 'rotate(10deg)' }
        }
      },
      animation: {
        wiggle: 'wiggle 1.8s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
