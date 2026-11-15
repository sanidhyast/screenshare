/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B0D12',
        surface: {
          DEFAULT: '#151922',
          card: '#151922',
          hover: '#1E2330',
          elevated: '#1A1F2C',
          border: '#272E3F'
        },
        accent: {
          DEFAULT: '#6366F1',
          hover: '#4F46E5',
          light: '#818CF8',
          glow: 'rgba(99, 102, 241, 0.25)'
        },
        content: {
          primary: '#F8FAFC',
          secondary: '#94A3B8',
          muted: '#64748B'
        }
      },
      animation: {
        'pulse-subtle': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'laser-glow': 'laserGlow 1.5s ease-in-out infinite alternate',
      },
      keyframes: {
        laserGlow: {
          '0%': { boxShadow: '0 0 10px #ff0055, 0 0 20px #ff0055, 0 0 30px #ff0055' },
          '100%': { boxShadow: '0 0 16px #ff1a6c, 0 0 32px #ff1a6c, 0 0 48px #ff1a6c' }
        }
      }
    },
  },
  plugins: [],
}
