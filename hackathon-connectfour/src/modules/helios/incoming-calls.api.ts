/**
 * Cliente del módulo incoming-calls (Audara -> Helios).
 *
 * Rutas confirmadas en helios_api/src/routes/api/incoming-calls/v1/incoming-calls.router.ts:39-43
 *   POST /api/v1/incoming-calls
 *   POST /api/v1/incoming-calls/additional-data
 *   GET  /api/v1/incoming-calls/get-data
 *   GET  /api/v1/incoming-calls/search
 *   POST /api/v1/incoming-calls/:conversationId/readEvent
 *
 * Este es el paso 2 del flujo documentado en el mockup: la llamada llega con su
 * `callUniqueId` y Helios resuelve el contexto del número antes de que el agente
 * escriba nada.
 */

import { config } from '@/lib/config';
import { fetchWithAuth } from '@/lib/auth';
import type { IncomingCallData, IncomingCallService } from './types';

const base = () => config.heliosApiUrl;

/** URL que Helios Angular usa para recuperar y precargar una conversación. */
export const buildDispatchIncomingCallUrl = (callUniqueId: string): string => {
  const url = new URL('/dispatch/open', config.heliosFrontendUrl);
  url.searchParams.set('incomingCallId', callUniqueId);
  return url.toString();
};

/** Detalle real de un PO en Helios Angular. */
export const buildHeliosServiceUrl = (serviceNumber: number): string =>
  new URL(`/service/${serviceNumber}`, config.heliosFrontendUrl).toString();

/**
 * `GET /api/v1/incoming-calls/get-data?callUniqueId=...`
 *
 * Devuelve la Conversation completa con `activeServices[]` y
 * `holdInspectionServices[]` hidratados. Si no encuentra nada responde 200 con
 * body vacío, por eso el retorno puede ser `null`.
 */
export const getIncomingCallData = async (callUniqueId: string): Promise<IncomingCallData | null> => {
  const qs = new URLSearchParams({ callUniqueId });
  const response = await fetchWithAuth<IncomingCallData | undefined>(
    `${base()}/api/v1/incoming-calls/get-data?${qs.toString()}`,
  );

  if (!response) return null;

  return {
    ...response,
    activeServices: response.activeServices ?? [],
    holdInspectionServices: response.holdInspectionServices ?? [],
  };
};

/**
 * `POST /api/v1/incoming-calls/additional-data`
 *
 * Vincula la llamada a un servicio existente (paso 3a del flujo). Responde 200
 * sin body.
 */
export const linkCallToService = async (callUniqueId: string, serviceId: string): Promise<void> => {
  await fetchWithAuth(`${base()}/api/v1/incoming-calls/additional-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uniqueId: callUniqueId, serviceId }),
  });
};

/** `GET /api/v1/incoming-calls/search` */
export const searchIncomingCall = async (params: {
  sourceNumber?: string;
  didNumber?: string;
  serviceId?: string;
  fromDate?: string;
}): Promise<IncomingCallData | null> => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) qs.set(key, value);
  });
  const response = await fetchWithAuth<IncomingCallData | undefined>(
    `${base()}/api/v1/incoming-calls/search?${qs.toString()}`,
  );
  return response ?? null;
};

/**
 * helios_api a veces devuelve ids sueltos (strings) en lugar de servicios
 * hidratados dentro de `holdInspectionServices`. Este guard los descarta, igual
 * que `isValidActiveService` en nextjs_helios_dispatch.
 */
export const isHydratedService = (value: IncomingCallService | string): value is IncomingCallService =>
  typeof value === 'object' && value !== null && '_id' in value;

/** Une los dos arrays de la conversación y marca de dónde vino cada servicio. */
export const collectCallServices = (
  call: IncomingCallData | null,
): Array<IncomingCallService & { origin: 'active' | 'holdInspection' }> => {
  if (!call) return [];

  const active = (call.activeServices ?? [])
    .filter(isHydratedService)
    .map((service) => ({ ...service, origin: 'active' as const }));

  const holdInspection = (call.holdInspectionServices ?? [])
    .filter(isHydratedService)
    .map((service) => ({ ...service, origin: 'holdInspection' as const }));

  return [...active, ...holdInspection];
};

/** Nombre de contacto: primero el contrato, si no el primer servicio hidratado. */
export const resolveCallContactName = (call: IncomingCallData | null): string => {
  if (!call) return 'Desconocido';

  const customer = call.customerContract?.customer;
  if (customer?.full_name) return customer.full_name;
  if (customer?.first_name || customer?.last_name) {
    return [customer.first_name, customer.last_name].filter(Boolean).join(' ');
  }

  const first = collectCallServices(call)[0];
  if (first) return [first.firstname, first.lastname].filter(Boolean).join(' ') || 'Desconocido';

  return 'Desconocido';
};
