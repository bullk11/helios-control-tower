/**
 * Configuración del prototipo.
 *
 * Se lee de variables NEXT_PUBLIC_* (ver .env.example). En nextjs_helios_dispatch
 * esto viene de convict + Vault (src/config.mjs); acá se mantiene simple a
 * propósito porque es un prototipo de hackathon.
 */

export type DataMode = 'mock' | 'live';

/** Branches de Helios. Los servicios guardan el nombre largo en `service.branch`. */
export const BRANCHES = ['Puerto Rico', 'Costa Rica', 'Panama', 'Colombia', 'Mexico'] as const;
export type Branch = (typeof BRANCHES)[number];

/**
 * Tracks de Helios (`helios_api/src/utils/enums.ts` -> `TRACKS`).
 * Se guardan en `service.serviceType`. En el list API el filtro se llama `divisions`.
 */
export const TRACKS = ['road', 'home', 'concierge', 'claims'] as const;
export type Track = (typeof TRACKS)[number];

const rawMode = process.env.NEXT_PUBLIC_DATA_MODE;

export const config = {
  /** `mock` no requiere credenciales; `live` pega contra helios_api. */
  dataMode: (rawMode === 'live' ? 'live' : 'mock') as DataMode,

  /** Base URL del monolito helios_api (rutas `/api/v1/...` y `/api/v2/...`). */
  heliosApiUrl: (process.env.NEXT_PUBLIC_HELIOS_API_URL ?? '').replace(/\/$/, ''),

  /** Base URL de serverless-helios-api (rutas `/core-api/...`). Opcional. */
  coreApiUrl: (process.env.NEXT_PUBLIC_CORE_API_URL ?? '').replace(/\/$/, ''),

  /** Orígenes del Helios Angular permitidos para postMessage cuando corre en iframe. */
  heliosWebUrls: (process.env.NEXT_PUBLIC_HELIOS_WEB_URLS ?? 'http://localhost:4200')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean),

  /** Helios Angular donde viven Dispatch y el detalle del servicio. */
  heliosFrontendUrl: (
    process.env.NEXT_PUBLIC_HELIOS_FRONTEND_URL ?? 'https://helios-stg.connectasistencia.com'
  ).replace(/\/$/, ''),

  defaultBranch: (process.env.NEXT_PUBLIC_DEFAULT_BRANCH ?? 'Colombia') as Branch,

  /** `all` se expande a todos los TRACKS en el list API de helios_api. */
  defaultDivision: process.env.NEXT_PUBLIC_DEFAULT_DIVISION ?? 'all',
} as const;

export const isLive = () => config.dataMode === 'live';
