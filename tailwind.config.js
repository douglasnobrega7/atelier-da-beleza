/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        blush: '#D8E2EA',
        roseSoft: '#7AA7A9',
        lilacSoft: '#DDE4FF',
        goldSoft: '#2F8C8F',
        pearl: '#F5F7FA',
        graphite: '#17212B'
      },
      boxShadow: {
        soft: '0 16px 40px rgba(23, 33, 43, 0.10)'
      }
    }
  },
  plugins: []
}
