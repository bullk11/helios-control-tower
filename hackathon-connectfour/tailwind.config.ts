import type { Config } from 'tailwindcss';

/**
 * Los colores replican los tokens del Connect Design System que viene dentro del
 * zip del mockup (carpeta `_ds/connect-design-system-<hash>/tokens/colors.css`).
 * Se exponen también como CSS custom properties en globals.css para poder usar
 * `var(--...)` igual que en el mockup.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        connect: {
          naranja: '#F15B2B',
          amarillo: '#F4BB2B',
          azul: '#001D3D',
          gris: '#F1F1F1',
        },
        naranja: {
          '050': '#FEF3EE',
          100: '#FDE7DF',
          600: '#D94F23',
          700: '#C8431B',
        },
        amarillo: {
          '050': '#FEF9EB',
          100: '#FDF1CF',
          600: '#D9A31C',
          700: '#B9860F',
        },
        azul: {
          '050': '#EDF0F4',
          100: '#D3DAE2',
          300: '#5B7390',
          600: '#073460',
          800: '#001731',
        },
        gris: {
          '050': '#FAFAFA',
          100: '#F1F1F1',
          200: '#E4E4E4',
          300: '#CFCFCF',
          400: '#A8A8A8',
          500: '#767676',
          600: '#4D4D4D',
        },
        estado: {
          exito: '#1F8A5B',
          alerta: '#F4BB2B',
          error: '#C8431B',
          info: '#073460',
        },
        text: {
          strong: '#001D3D',
          body: '#213040',
          muted: '#767676',
        },
      },
      fontFamily: {
        ui: ['Montserrat', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        md: '14px',
        lg: '20px',
        xl: '28px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 29, 61, 0.06), 0 1px 3px rgba(0, 29, 61, 0.08)',
        md: '0 4px 12px rgba(0, 29, 61, 0.08), 0 2px 4px rgba(0, 29, 61, 0.06)',
        lg: '0 12px 32px rgba(0, 29, 61, 0.12), 0 4px 8px rgba(0, 29, 61, 0.06)',
      },
      keyframes: {
        flashIn: {
          '0%': { transform: 'translateX(12px)', opacity: '0', background: '#FEF3EE' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        toastIn: {
          from: { transform: 'translateY(-8px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        flashIn: 'flashIn .5s ease-out',
        toastIn: 'toastIn .25s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
