'use client';

/**
 * Primitivas mínimas con los tokens del Connect Design System.
 *
 * Nota: el design system real de Connect es `@connect-assistance/connect-ui`
 * (paquete privado en GitHub Packages, requiere GIT_NPM_TOKEN). Para que el
 * prototipo se pueda clonar y correr sin ese token, acá se replican solo los
 * componentes que el mockup usa, respetando colores, radios y sombras.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Tone = 'orange' | 'navy' | 'success' | 'alert' | 'muted' | 'orangeSoft';

const BADGE_TONES: Record<Tone, string> = {
  orange: 'bg-connect-naranja text-white',
  orangeSoft: 'bg-naranja-050 text-naranja-700 border border-naranja-100',
  navy: 'bg-connect-azul text-white',
  success: 'bg-estado-exito text-white',
  alert: 'bg-estado-error text-white',
  muted: 'bg-gris-200 text-gris-600',
};

export function Badge({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-wide ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-connect-naranja text-white hover:bg-naranja-600 disabled:bg-gris-300',
  secondary: 'bg-connect-azul text-white hover:bg-azul-600 disabled:bg-gris-300',
  outline: 'border border-gris-300 text-text-strong bg-white hover:border-connect-azul disabled:text-gris-400',
  ghost: 'text-text-strong hover:bg-gris-100 disabled:text-gris-400',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  full?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  className = '',
  ...props
}: ButtonProps) {
  const sizing = size === 'sm' ? 'text-[12px] px-3 py-[6px]' : 'text-[13px] px-4 py-[10px]';
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg font-bold transition-colors disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${sizing} ${full ? 'w-full' : ''} ${className}`}
    />
  );
}

export function Card({
  surface = 'white',
  className = '',
  children,
}: {
  surface?: 'white' | 'gray' | 'navy';
  className?: string;
  children: ReactNode;
}) {
  const surfaces = {
    white: 'bg-white border border-gris-200',
    gray: 'bg-gris-050 border border-gris-200',
    navy: 'bg-connect-azul text-white border border-connect-azul',
  } as const;
  return <div className={`rounded-md shadow-sm ${surfaces[surface]} ${className}`}>{children}</div>;
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-text-muted">{label}</span>
      ) : null}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="w-full rounded-lg border border-gris-300 bg-white px-3 py-2 text-[12.5px] text-text-body"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-text-muted">{label}</span>
      ) : null}
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gris-300 bg-white px-3 py-2 text-[12.5px] text-text-body placeholder:text-gris-400"
      />
    </label>
  );
}

/** Valor `datetime-local` (YYYY-MM-DDTHH:mm) en hora local. */
export const toDateTimeLocalValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function DateTimeInput({
  label,
  value,
  min,
  onChange,
}: {
  label?: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      {label ? (
        <span className="mb-1 block text-[10.5px] font-bold uppercase tracking-wide text-text-muted">{label}</span>
      ) : null}
      <input
        type="datetime-local"
        value={value}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-gris-300 bg-white px-3 py-2 text-[12.5px] text-text-body"
      />
    </label>
  );
}

export function StatCard({
  label,
  value,
  sub,
  surface = 'gray',
  children,
}: {
  label: string;
  value: string;
  sub?: string;
  surface?: 'gray' | 'navy';
  children?: ReactNode;
}) {
  const muted = surface === 'navy' ? 'text-azul-100' : 'text-text-muted';
  const strong = surface === 'navy' ? 'text-white' : 'text-text-strong';
  return (
    <Card surface={surface} className="p-[18px]">
      <div className={`mb-2 text-[11px] font-bold uppercase tracking-wide ${muted}`}>{label}</div>
      <div className={`text-[26px] font-extrabold leading-none ${strong}`}>{value}</div>
      {sub ? <div className={`mt-1 text-[11.5px] ${muted}`}>{sub}</div> : null}
      {children}
    </Card>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="m-0 text-[16px] font-extrabold uppercase text-text-strong">{children}</h2>
      {right}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md bg-gris-050 p-8 text-center text-[13px] text-text-muted">{children}</div>
  );
}

export function Alert({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const tones = {
    info: 'bg-azul-050 border-azul-100 text-text-body',
    warn: 'bg-amarillo-050 border-amarillo-100 text-text-body',
    error: 'bg-naranja-050 border-naranja-100 text-naranja-700',
  } as const;
  return (
    <div className={`rounded-md border px-4 py-3 text-[12.5px] leading-relaxed ${tones[tone]}`}>{children}</div>
  );
}

export function Modal({
  title,
  subtitle,
  headerTone = 'navy',
  headerActions,
  onClose,
  children,
  width = 'max-w-[880px]',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  headerTone?: 'navy' | 'orange';
  headerActions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,15,30,0.55)] p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
        className={`max-h-[88vh] w-full overflow-y-auto rounded-lg bg-white shadow-lg ${width}`}
      >
        <div
          className={`flex items-start justify-between gap-3 rounded-t-lg px-6 py-5 text-white ${
            headerTone === 'navy' ? 'bg-connect-azul' : 'bg-connect-naranja'
          }`}
        >
          <div>
            <div className="text-[19px] font-extrabold">{title}</div>
            {subtitle ? <div className="mt-1 text-[11.5px] opacity-90">{subtitle}</div> : null}
          </div>
          <div className="flex shrink-0 items-start gap-2">
            {headerActions}
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="rounded-md border border-white/40 px-2 py-1 text-[13px] leading-none"
            >
              ✕
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

export type ToastType = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

const TOAST_STYLES: Record<ToastType, string> = {
  success: 'bg-estado-exito text-white',
  error: 'bg-estado-error text-white',
  info: 'bg-connect-azul text-white',
};

const TOAST_ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '!',
  info: 'ℹ',
};

const MAX_VISIBLE_TOASTS = 2;

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  const visible = toasts.slice(-MAX_VISIBLE_TOASTS);
  const hiddenCount = toasts.length - visible.length;
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex max-w-[min(420px,calc(100vw-3rem))] flex-col gap-2">
      {hiddenCount > 0 ? (
        <div className="rounded-lg bg-gris-700 px-3 py-2 text-center text-[11px] font-bold text-white shadow-lg">
          +{hiddenCount} aviso{hiddenCount === 1 ? '' : 's'} más
        </div>
      ) : null}
      {visible.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 rounded-lg px-4 py-3 shadow-lg animate-toastIn ${TOAST_STYLES[toast.type]}`}
        >
          <span className="mt-[1px] shrink-0 text-[16px] font-bold">{TOAST_ICONS[toast.type]}</span>
          <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{toast.message}</span>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            className="shrink-0 text-[12px] opacity-70 hover:opacity-100"
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
