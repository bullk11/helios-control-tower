/**
 * Auth contra helios_api.
 *
 * Replica el patrón de `nextjs_helios_dispatch/src/utils/auth.ts`.
 *
 * Lo importante, y es fácil de equivocar:
 * helios_api NO usa el esquema `Bearer`. Su middleware global lee el token crudo
 * del header `authorization` y, opcionalmente, el mongo id del usuario en el
 * header `user-id`:
 *
 *   helios_api/src/controllers/auth.controller.ts:313
 *     if (req.headers['authorization']) {
 *       const auth = await this.authenticate(req.headers['authorization'], req.headers['user-id']);
 *
 * El token es el **ID token de Cognito** que emite el Helios Angular
 * (`fetchAuthSession().tokens.idToken`). Este prototipo no hace login: recibe el
 * token por `?token=` o por postMessage del padre, igual que los iframes de
 * dispatch.
 */

export const TOKEN_KEY = 'auth_token';
export const USER_ID_KEY = 'auth_user_id';

const isBrowser = () => typeof window !== 'undefined';

/** Chequeo laxo de forma de JWT, igual que en nextjs_helios_dispatch. */
const looksLikeJwt = (token: string): boolean => token.split('.').length === 3 && token.length < 3000;

export const setStoredToken = (token: string): void => {
  if (!looksLikeJwt(token)) throw new Error('Invalid token format');
  if (isBrowser()) localStorage.setItem(TOKEN_KEY, token);
};

export const setStoredUserId = (userId: string): void => {
  if (isBrowser()) localStorage.setItem(USER_ID_KEY, userId);
};

export const getStoredUserId = (): string | null => {
  if (isBrowser()) {
    const stored = localStorage.getItem(USER_ID_KEY);
    if (stored) return stored;
  }
  return process.env.NEXT_PUBLIC_HELIOS_USER_ID || null;
};

/**
 * Devuelve el token. Prioridad:
 *  1. URL query param `?token=` (lo persiste y limpia).
 *  2. localStorage (para sesiones que ya recibieron el token).
 *  3. Variable de entorno `NEXT_PUBLIC_HELIOS_API_TOKEN` (para hackathon/dev).
 */
export const getAuthToken = (): string | null => {
  // En server-side, usar la env directamente
  if (!isBrowser()) {
    return process.env.NEXT_PUBLIC_HELIOS_API_TOKEN || null;
  }

  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('token');

  if (urlToken) {
    try {
      setStoredToken(urlToken);
    } catch {
      return localStorage.getItem(TOKEN_KEY);
    }
    const userId = params.get('userId');
    if (userId) setStoredUserId(userId);

    params.delete('token');
    params.delete('userId');
    const rest = params.toString();
    window.history.replaceState({}, '', rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
    return urlToken;
  }

  const stored = localStorage.getItem(TOKEN_KEY);
  if (stored) return stored;

  // Fallback: token de la variable de entorno (hackathon)
  const envToken = process.env.NEXT_PUBLIC_HELIOS_API_TOKEN;
  if (envToken) return envToken;

  return null;
};

export const clearAuth = (): void => {
  if (!isBrowser()) return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_ID_KEY);
};

/** Error tipado para que la UI pueda distinguir "falta token" de un 500. */
export class HeliosAuthError extends Error {
  constructor(message = 'No hay token de Helios disponible.') {
    super(message);
    this.name = 'HeliosAuthError';
  }
}

export class HeliosHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    message?: string,
  ) {
    super(message ?? `helios_api respondió ${status} en ${url}`);
    this.name = 'HeliosHttpError';
  }
}

/**
 * fetch autenticado contra helios_api.
 *
 * @param url        URL absoluta.
 * @param options    RequestInit estándar.
 * @param rawToken   `true` (default) manda el token crudo -> helios_api.
 *                   `false` manda `Bearer <token>` -> serverless-helios-api / core-api.
 */
export const fetchWithAuth = async <T = unknown>(
  url: string,
  options: RequestInit = {},
  rawToken = true,
): Promise<T> => {
  const token = getAuthToken();
  if (!token) throw new HeliosAuthError();

  const userId = getStoredUserId();

  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) ?? {}),
    Authorization: rawToken ? token : `Bearer ${token}`,
  };
  // helios_api usa este header para resolver el principal cuando el token de
  // Cognito no trae `custom:mongo_id`.
  if (userId) headers['User-Id'] = userId;

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 || response.status === 403) {
    clearAuth();
    throw new HeliosAuthError('helios_api rechazó el token (401/403). Vuelve a cargar el token.');
  }

  if (!response.ok) {
    const text = await response.text();
    let message: string | undefined;
    if (text) {
      try {
        const parsed = JSON.parse(text) as { message?: string; msg?: string };
        message = parsed.message ?? parsed.msg;
      } catch {
        message = text;
      }
    }
    throw new HeliosHttpError(response.status, url, message);
  }

  // Varios endpoints de helios_api responden 200 con body vacío
  // (p.ej. POST /api/v1/incoming-calls/additional-data hace res.status(200) sin send).
  const text = await response.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
};
