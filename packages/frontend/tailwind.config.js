/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff2fe',
          100: '#e2e7fd',
          200: '#cad3fb',
          300: '#aab5f7',
          400: '#888ff1',
          500: '#6c6be9',
          600: '#5b4fdc',
          700: '#4d40c2',
          800: '#3f369d',
          900: '#3c3787',
        },
      },
      screens: {
        xs: '320px',
      },
      minHeight: { touch: '44px' },
      minWidth:  { touch: '44px' },
    },
  },
  plugins: [],
};
