/**
 * Client for service logs.
 *
 * Los logs vienen dentro del servicio completo: GET /services/:serviceId
 * El objeto service incluye service.logs[] con la misma estructura que
 * helios_frontend/Service Logs tab.
 *
 * Estructura de un log (helios_api/src/schemas/logs.schema.ts):
 *   { created, createdDate, agentName, agentId, logMessage, ... }
 */

import { config } from '@/lib/config';
import { fetchWithAuth } from '@/lib/auth';

const base = () => config.heliosApiUrl;

export interface HeliosLog {
  _id?: string;
  created?: number | string;
  createdDate?: string;
  agentName?: string;
  agentId?: string;
  logMessage?: string;
  auditSource?: string;
}

interface ServiceDetailResponse {
  service?: { logs?: HeliosLog[] };
  data?: { logs?: HeliosLog[] };
  logs?: HeliosLog[];
}

/**
 * `GET /services/:serviceId`
 * Devuelve el servicio completo. Extraemos service.logs[].
 */
export const getServiceLogs = async (serviceId: string): Promise<HeliosLog[]> => {
  const response = await fetchWithAuth<ServiceDetailResponse | undefined>(
    `${base()}/services/${serviceId}`,
  );

  if (!response) return [];

  // La respuesta puede venir como { service: { logs: [] } } o { data: { logs: [] } }
  const logs =
    response.service?.logs ??
    response.data?.logs ??
    response.logs ??
    [];

  return logs;
};

export const formatLogDate = (log: HeliosLog): string => {
  const raw = log.createdDate ?? log.created;
  if (!raw) return '—';
  const date = new Date(raw);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('es', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

/**
 * POST /api/v2/services/:serviceId/logs
 * Contrato de Helios (helios_frontend saveServiceLog): { body, fieldsChanged? }.
 */
export const createServiceLog = async (serviceId: string, logMessage: string): Promise<void> => {
  await fetchWithAuth(`${base()}/api/v2/services/${serviceId}/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: logMessage }),
  });
};
