import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // Brand Colors - Youthful Palette
        sage: {
          50: '#f4f6f1',
          100: '#e8ece3',
          200: '#d5dcc9',
          300: '#b5c1a0', // Primary
          400: '#9aab7f',
          500: '#7f9362',
          600: '#657650',
          700: '#505c41',
          800: '#424b37',
          900: '#383f30',
          950: '#1c2118',
        },
        rose: {
          50: '#faf5f5',
          100: '#f5ebeb',
          200: '#eddada',
          300: '#d4a3a3', // Accent (dusty rose)
          400: '#c08585',
          500: '#a86868',
          600: '#8f5353',
          700: '#764545',
          800: '#633b3b',
          900: '#543535',
          950: '#2d1919',
        },
        mocha: {
          50: '#f8f5f4',
          100: '#f0eae7',
          200: '#e3d6d1',
          300: '#cfbbb2',
          400: '#b89a8d',
          500: '#a68172',
          600: '#8f6a5c',
          700: '#7b5e57', // Neutral
          800: '#604945',
          900: '#513f3c',
          950: '#2b201e',
        },
        gold: {
          50: '#fdfbf5',
          100: '#faf6e9',
          200: '#eedbb4', // Highlight
          300: '#e5c98c',
          400: '#d9b15e',
          500: '#cd9c3d',
          600: '#b88031',
          700: '#99632b',
          800: '#7c4e29',
          900: '#664125',
          950: '#382112',
        },
        navy: {
          50: '#f3f6fb',
          100: '#e4eaf5',
          200: '#cfdaee',
          300: '#aec1e2',
          400: '#87a0d3',
          500: '#6b82c6',
          600: '#5869b8',
          700: '#4d59a8',
          800: '#434a8a',
          900: '#345995', // Text/BG
          950: '#252a4a',
        },
        // Shadcn/ui compatible
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        heading: ['var(--font-poppins)', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.4s ease-out',
        shimmer: 'shimmer 2s infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
