/**
 * Cliente de los endpoints de servicios de helios_api.
 *
 * Rutas confirmadas contra el código (helios_api @ master):
 *   GET  /api/v2/services            src/routes/api/services/v2/services.router.ts
 *   GET  /api/v1/services/count      src/routes/api/services/v1/services.router.ts:17
 *   POST /api/v1/services/find       src/routes/api/services/v1/services.router.ts
 *
 * Ojo con dos cosas:
 *  1. `GET /api/v2/services` se apoya en Atlas Search (`$search`). Contra un mongod
 *     local sin Atlas no funciona; en ese caso usar `findServices` (POST .../find).
 *  2. `projection` viaja como STRING JSON y su default es `{_id:1}`.
 */

import { config } from '@/lib/config';
import { fetchWithAuth } from '@/lib/auth';
import { CONTROL_TOWER_PROJECTION } from './projections';
import type { HeliosService, HeliosServicesResponse, ServiceStatus, TripStatus } from './types';

const base = () => config.heliosApiUrl;

/**
 * Parámetros de `GET /api/v2/services`.
 * Los campos de lista viajan como CSV. Verificado en
 * helios_api/src/routes/api/services/v2/validators.ts (SERVICES_VALIDATORS.GET_SERVICES).
 */
export interface GetServicesParams {
  statuses?: ServiceStatus[];
  tripStatuses?: TripStatus[];
  /** Nombres largos de branch. `Global` se expande a todos. */
  branches?: string[];
  /** El track. Acepta `all`. En la API se llama `divisions`, no `tracks`. */
  divisions?: string[];
  /** Salesforce account ids -> filtra por `sfIdAccount`. */
  accountIds?: string[];
  auditReasons?: string[];
  situations?: string[];
  drivers?: string[];
  providers?: string[];
  /** Filtro "necesita atención" del Active Dashboard. */
  manageActiveServices?: boolean;
  /** Dashboard Low Score Surveys: `surveys.hasLowScore`. */
  surveyHasLowScore?: boolean;
  /** Dashboard Low Score Surveys: cola sin revisar (`surveys.reviewed = false`). */
  surveyReviewed?: boolean;
  serviceQFilter?: string;
  createdStartDate?: string;
  createdEndDate?: string;
  checkInStartDate?: string;
  checkInEndDate?: string;
  serviceNumber?: number;
  plate?: string;
  /** Rutas de campos que deben existir. */
  exists?: string[];
  projection?: Record<string, 0 | 1>;
  populate?: string[];
  sortBy?: string;
  sortDirection?: 1 | -1;
  page?: number;
  limit?: number;
}

const appendCsv = (qs: URLSearchParams, key: string, value?: Array<string | number>) => {
  if (value && value.length) qs.set(key, value.join(','));
};

export const buildGetServicesQuery = (params: GetServicesParams): URLSearchParams => {
  const qs = new URLSearchParams();

  appendCsv(qs, 'statuses', params.statuses);
  appendCsv(qs, 'tripStatuses', params.tripStatuses);
  appendCsv(qs, 'branches', params.branches);
  appendCsv(qs, 'divisions', params.divisions);
  appendCsv(qs, 'accountIds', params.accountIds);
  appendCsv(qs, 'auditReasons', params.auditReasons);
  appendCsv(qs, 'situations', params.situations);
  appendCsv(qs, 'drivers', params.drivers);
  appendCsv(qs, 'providers', params.providers);
  appendCsv(qs, 'exists', params.exists);
  appendCsv(qs, 'populate', params.populate);

  if (params.manageActiveServices !== undefined) {
    qs.set('manageActiveServices', String(params.manageActiveServices));
  }
  if (params.surveyHasLowScore !== undefined) {
    qs.set('surveyHasLowScore', String(params.surveyHasLowScore));
  }
  if (params.surveyReviewed !== undefined) {
    qs.set('surveyReviewed', String(params.surveyReviewed));
  }
  if (params.serviceQFilter) qs.set('serviceQFilter', params.serviceQFilter);
  if (params.createdStartDate) qs.set('createdStartDate', params.createdStartDate);
  if (params.createdEndDate) qs.set('createdEndDate', params.createdEndDate);
  if (params.checkInStartDate) qs.set('checkInStartDate', params.checkInStartDate);
  if (params.checkInEndDate) qs.set('checkInEndDate', params.checkInEndDate);
  if (params.serviceNumber !== undefined) qs.set('serviceNumber', String(params.serviceNumber));
  if (params.plate) qs.set('plate', params.plate);

  // projection SIEMPRE, si no la API devuelve solo _id.
  qs.set('projection', JSON.stringify(params.projection ?? CONTROL_TOWER_PROJECTION));

  // sortBy exige sortDirection (validador `requireQueryParam('sortDirection')`).
  if (params.sortBy) {
    qs.set('sortBy', params.sortBy);
    qs.set('sortDirection', String(params.sortDirection ?? -1));
  }

  qs.set('page', String(params.page ?? 1));
  qs.set('limit', String(params.limit ?? 50));

  return qs;
};

/** `GET /api/v2/services` */
export const getServices = async (params: GetServicesParams): Promise<HeliosServicesResponse> => {
  const qs = buildGetServicesQuery(params);
  return fetchWithAuth<HeliosServicesResponse>(`${base()}/api/v2/services?${qs.toString()}`);
};

/** `GET /api/v1/services/count` — el mismo endpoint que alimenta el pill del navbar. */
export const getServicesCount = async (input: {
  branch: string;
  serviceType?: string;
  urgency?: string;
}): Promise<{ count?: number } & Record<string, unknown>> => {
  const qs = new URLSearchParams();
  qs.set('branch', input.branch);
  if (input.serviceType) qs.set('serviceType', input.serviceType);
  if (input.urgency) qs.set('urgency', input.urgency);
  return fetchWithAuth(`${base()}/api/v1/services/count?${qs.toString()}`);
};

/**
 * `POST /api/v1/services/find` — filtro estilo Mongo en el body.
 * Fallback portable cuando no hay Atlas Search disponible.
 */
export const findServices = async (body: {
  filter: Record<string, unknown>;
  projection?: Record<string, 0 | 1>;
  limit?: number;
  sort?: Record<string, 1 | -1>;
}): Promise<{ services?: HeliosService[] } & Record<string, unknown>> =>
  fetchWithAuth(`${base()}/api/v1/services/find`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projection: CONTROL_TOWER_PROJECTION,
      limit: 50,
      ...body,
    }),
  });

/**
 * `PATCH /services/:serviceId/audit-hold`
 * Toggle de hold de auditoría (`isAuditHold`).
 */
export const setAuditHold = async (serviceId: string, isAuditHold: boolean): Promise<void> => {
  await fetchWithAuth(`${base()}/services/${serviceId}/audit-hold`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isAuditHold }),
  });
};

/**
 * `POST /services/finish`
 * Cierra el servicio. En Pending Audit es lo que usa el botón Audit del detalle de Helios
 * (`handleFinish`) para sacarlo de `trip.status = pending_audit`.
 */
export const finishService = async (serviceId: string): Promise<void> => {
  await fetchWithAuth(`${base()}/services/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ _id: serviceId }),
  });
};
