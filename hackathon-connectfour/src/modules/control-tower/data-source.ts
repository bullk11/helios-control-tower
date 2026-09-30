/**
 * Única frontera entre "de dónde vienen los datos" y el resto de la app.
 *
 * En modo `live` llama a helios_api. En modo `mock` devuelve las fixtures, que
 * tienen la misma forma. Todo lo de arriba (dominio + UI) no sabe en qué modo está.
 */

import { config, isLive } from '@/lib/config';
import { HeliosAuthError, HeliosHttpError } from '@/lib/auth';
import * as servicesApi from '@/modules/helios/services.api';
import * as incomingCallsApi from '@/modules/helios/incoming-calls.api';
import * as notesApi from '@/modules/helios/notes.api';
import * as checkInApi from '@/modules/helios/check-in-reminder.api';
import * as monitorApi from '@/modules/helios/monitor.api';
import * as tripApi from '@/modules/helios/trip.api';
import * as logsApi from '@/modules/helios/logs.api';
import * as surveysApi from '@/modules/helios/surveys.api';
import type { HeliosLog } from '@/modules/helios/logs.api';
import { IN_SCOPE_TRIP_STATUSES } from './domain/stages';
import {
  SERVICE_STATUS,
  TRIP_STATUS,
  type HeliosNote,
  type HeliosService,
  type IncomingCallData,
} from '@/modules/helios/types';
import { MOCK_INCOMING_CALL, MOCK_NOTES, MOCK_SERVICES } from './mock/fixtures';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface LoadCasesInput {
  branch?: string | null;
  /** track; `all` para todos. */
  division?: string;
  limit?: number;
}

export interface LoadCasesResult {
  services: HeliosService[];
  totalDocs: number;
  /** Descripción de la llamada que se hizo, para mostrarla en la UI. */
  requestDescription: string;
}

/** trip.status de la torre operativa (sin pending_audit: esa cola va aparte). */
const ACTIVE_TRIP_STATUSES = IN_SCOPE_TRIP_STATUSES.filter(
  (status) => status !== TRIP_STATUS.PENDING_AUDIT,
);

/**
 * Carga los servicios que le interesan al Control Tower.
 *
 * En live usa `GET /api/v2/services` con tres queries (como Helios dashboards):
 *  - Activos: Torre de Control (etapas 1–4)
 *  - Pending Audit: `tripStatuses=pending_audit` (dashboard Audit de Helios)
 *  - Low Score Surveys: Finished/Not Covered/Informative + surveyHasLowScore
 *
 * Antes Active+Audit compartían un solo `limit=100` y los Pending Audit
 * quedaban fuera (los Active más recientes llenaban la página).
 */
export const loadCases = async (input: LoadCasesInput = {}): Promise<LoadCasesResult> => {
  const branches = input.branch ? [input.branch] : undefined;
  const divisions = input.division && input.division !== 'all' ? [input.division] : ['road', 'home', 'concierge'];
  const limit = input.limit ?? 100;

  if (!isLive()) {
    await delay(220);
    return {
      services: MOCK_SERVICES,
      totalDocs: MOCK_SERVICES.length,
      requestDescription: 'modo mock · fixtures locales con la forma de GET /api/v2/services',
    };
  }

  const activeParams: servicesApi.GetServicesParams = {
    statuses: [SERVICE_STATUS.ACTIVE],
    tripStatuses: ACTIVE_TRIP_STATUSES,
    branches,
    divisions,
    sortBy: 'date',
    sortDirection: -1,
    page: 1,
    limit,
  };

  // Misma forma que el dashboard Audit de Helios (audit-schema.service.ts).
  const auditParams: servicesApi.GetServicesParams = {
    tripStatuses: [TRIP_STATUS.PENDING_AUDIT],
    branches,
    divisions,
    sortBy: 'date',
    sortDirection: -1,
    page: 1,
    limit,
  };

  // Misma forma que el dashboard Low Score Surveys de Helios.
  const lowScoreParams: servicesApi.GetServicesParams = {
    statuses: [SERVICE_STATUS.FINISHED, SERVICE_STATUS.NOT_COVERED, SERVICE_STATUS.INFORMATIVE],
    branches,
    divisions,
    surveyHasLowScore: true,
    surveyReviewed: false,
    sortBy: 'date',
    sortDirection: -1,
    page: 1,
    limit,
  };

  const [activeResponse, auditResponse, lowScoreResponse] = await Promise.all([
    servicesApi.getServices(activeParams),
    servicesApi.getServices(auditParams),
    servicesApi.getServices(lowScoreParams),
  ]);

  const byId = new Map<string, HeliosService>();
  for (const svc of activeResponse.services ?? []) byId.set(svc._id, svc);
  for (const svc of auditResponse.services ?? []) byId.set(svc._id, svc);
  for (const svc of lowScoreResponse.services ?? []) byId.set(svc._id, svc);
  const services = Array.from(byId.values());

  const activeQs = servicesApi.buildGetServicesQuery(activeParams);
  const auditQs = servicesApi.buildGetServicesQuery(auditParams);
  const lowScoreQs = servicesApi.buildGetServicesQuery(lowScoreParams);

  return {
    services,
    totalDocs: services.length,
    requestDescription: `GET Active?${activeQs.toString()} + Pending Audit?${auditQs.toString()} + Low Score?${lowScoreQs.toString()}`,
  };
};

/** Contexto de una llamada entrante de Audara. */
export const loadIncomingCall = async (callUniqueId: string): Promise<IncomingCallData | null> => {
  if (!isLive()) {
    await delay(180);
    return { ...MOCK_INCOMING_CALL, uniqueId: callUniqueId || MOCK_INCOMING_CALL.uniqueId };
  }
  return incomingCallsApi.getIncomingCallData(callUniqueId);
};

export const linkCallToService = async (callUniqueId: string, serviceId: string): Promise<void> => {
  if (!isLive()) {
    await delay(140);
    return;
  }
  await incomingCallsApi.linkCallToService(callUniqueId, serviceId);
};

export const loadNotes = async (serviceId: string): Promise<HeliosNote[]> => {
  if (!isLive()) {
    await delay(140);
    return (MOCK_NOTES[serviceId] ?? []) as HeliosNote[];
  }
  return notesApi.getServiceNotes(serviceId);
};

export const addNote = async (input: {
  serviceId: string;
  msg: string;
  tab: notesApi.CaseChatTab;
}): Promise<void> => {
  if (!isLive()) {
    await delay(120);
    const existing = MOCK_NOTES[input.serviceId] ?? [];
    MOCK_NOTES[input.serviceId] = [
      ...existing,
      {
        _id: `local-${Date.now()}`,
        serviceId: input.serviceId,
        msg: input.msg,
        date: new Date().toISOString(),
        user: { type: 'user' },
        chatType: notesApi.CHAT_TAB_TO_QUERY[input.tab].chatType,
        isObservation: notesApi.CHAT_TAB_TO_QUERY[input.tab].isObservation,
        readFromHelios: true,
      },
    ];
    return;
  }
  await notesApi.addServiceNote(input);
};

export const createCheckIn = async (input: {
  serviceId: string;
  checkInDate: string;
  reason: string;
  branch?: string;
  serviceStatus?: string;
}): Promise<void> => {
  if (!isLive()) {
    await delay(120);
    const service = MOCK_SERVICES.find((item) => item._id === input.serviceId);
    if (service) {
      service.monitor = {
        ...service.monitor,
        checkInReminderDate: input.checkInDate,
        status: service.monitor?.status ?? 'onTime',
      };
    }
    return;
  }
  await checkInApi.createCheckInReminder(input);
};

export const resolveCheckIn = async (input: { serviceId: string; reason: string }): Promise<void> => {
  if (!isLive()) {
    await delay(120);
    const service = MOCK_SERVICES.find((item) => item._id === input.serviceId);
    if (service?.monitor) {
      service.monitor.checkInReminderDate = null;
    }
    return;
  }
  await checkInApi.resolveCheckInReminder(input);
};

/** Otorga minutos de excepción al servicio (PATCH /services/monitor). */
export const delayServiceMonitor = async (input: { serviceId: string; time: number }): Promise<void> => {
  if (!isLive()) {
    await delay(120);
    return;
  }
  await monitorApi.delayService(input);
};

/** Avanza el trip.status del servicio (POST /service/trip/:id/timestamp). */
export const advanceTripStatus = async (input: { serviceId: string; status: string }): Promise<void> => {
  if (!isLive()) {
    await delay(120);
    const service = MOCK_SERVICES.find((item) => item._id === input.serviceId);
    if (service?.trip) service.trip.status = input.status as typeof service.trip.status;
    return;
  }
  await tripApi.addTripTimestamp({ serviceId: input.serviceId, status: input.status as any });
};

/** Cierra el servicio activo (POST /services/finish). Mismo endpoint que Helios al finalizar. */
export const finishActiveService = async (serviceId: string): Promise<void> => {
  if (!isLive()) {
    await delay(120);
    const service = MOCK_SERVICES.find((item) => item._id === serviceId);
    if (service) {
      service.status = SERVICE_STATUS.FINISHED;
      service.trip = { ...service.trip, status: TRIP_STATUS.FINISHED };
    }
    return;
  }
  await servicesApi.finishService(serviceId);
};

/** Hold de auditoría (PATCH /services/:id/audit-hold). */
export const setAuditHold = async (serviceId: string, isAuditHold: boolean): Promise<void> => {
  if (!isLive()) {
    await delay(120);
    const service = MOCK_SERVICES.find((item) => item._id === serviceId);
    if (service) service.isAuditHold = isAuditHold;
    return;
  }
  await servicesApi.setAuditHold(serviceId, isAuditHold);
};

/** Resuelve auditoría / cierra el servicio (POST /services/finish). */
export const resolveService = async (serviceId: string): Promise<void> => {
  if (!isLive()) {
    await delay(120);
    const service = MOCK_SERVICES.find((item) => item._id === serviceId);
    if (service) {
      service.status = SERVICE_STATUS.FINISHED;
      service.trip = { ...service.trip, status: TRIP_STATUS.FINISHED };
      service.isAuditHold = false;
    }
    return;
  }
  await servicesApi.finishService(serviceId);
};

/** Marca la encuesta Low Score como revisada (POST /surveys/review). */
export const markSurveyReviewed = async (input: {
  serviceId: string;
  agentObservations?: string;
}): Promise<import('@/modules/helios/surveys.api').SurveyReviewMethod> => {
  if (!isLive()) {
    await delay(120);
    const service = MOCK_SERVICES.find((item) => item._id === input.serviceId);
    if (service) {
      service.surveys = { ...service.surveys, hasLowScore: true, reviewed: true };
    }
    return 'review';
  }
  return surveysApi.markSurveyReviewed(input);
};

/** Obtiene los service logs (GET /services/:serviceId). */
export const loadServiceLogs = async (serviceId: string): Promise<HeliosLog[]> => {
  if (!isLive()) {
    await delay(120);
    return [];
  }
  return logsApi.getServiceLogs(serviceId);
};

/** Mensaje accionable cuando falta el token en modo live. */
export const describeError = (error: unknown): string => {
  if (error instanceof HeliosAuthError) {
    return `${error.message} Abre el prototipo con ?token=<idToken de Cognito> o cambia NEXT_PUBLIC_DATA_MODE=mock.`;
  }
  if (error instanceof HeliosHttpError) {
    if (error.message?.includes('exceeded the limit for review')) {
      return 'Helios solo permite POST /surveys/review dentro de 30 días desde la respuesta. El prototipo reintentará con PATCH /surveys.';
    }
    return error.message ?? error.toString();
  }
  if (error instanceof Error) return error.message;
  return 'Error desconocido consultando helios_api.';
};
