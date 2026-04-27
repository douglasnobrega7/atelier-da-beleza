/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        blush: '#F9DDE8',
        roseSoft: '#F5BFD3',
        lilacSoft: '#DED4F4',
        goldSoft: '#C9A85D',
        pearl: '#FFF9FB',
        graphite: '#4B4650'
      },
      boxShadow: {
        soft: '0 12px 32px rgba(126, 86, 116, 0.12)'
      }
    }
  },
  plugins: []
}
