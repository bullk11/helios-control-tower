/**
 * Modelo de "caso" del Control Tower y su mapeo desde un servicio real de Helios.
 *
 * Cada campo indica de dónde sale, para que quede trazable contra
 * `helios_api/src/schemas/services.schema.ts`.
 */

import { MONITOR_STATUS, type HeliosService, type MonitorStatus } from '@/modules/helios/types';
import { resolveStage, stageLabel, type StageIndex } from './stages';
import { TRACK_LABEL, TRACK_TONE } from './groups';

export interface ControlTowerCase {
  /** `service._id` — la llave para llamar a la API. */
  id: string;
  /** `service.serviceNumber` — el PO que ve el negocio. */
  displayId: string;
  /** `service.serviceType` (road | home | concierge | claims). */
  track: string;
  trackLabel: string;
  trackTone: 'orange' | 'navy' | 'success' | 'muted';
  /** `service.accountName ?? service.account`. */
  account: string;
  /** `service.branch`. */
  branch: string;
  /** `service.situation`. */
  situation: string;
  /** `service.phone1`. */
  phone1: string;
  /** `service.pinSituationAddress ?? service.locations.situation.address`. */
  address: string;
  /** `service.providerName ?? service.provider.name ?? service.driverName`. */
  provider: string;
  /** Derivado de `service.trip.live.eta` (segundos) o los ETA iniciales. */
  eta: string;
  /** Etapa 0..3, o `null` si está en auditoría. */
  stageIdx: StageIndex | null;
  stageLabel: string;
  inAudit: boolean;
  /** `service.auditReason`. */
  auditReason?: string;
  /** `service.isAuditHold`. */
  isAuditHold: boolean;
  /** `service.surveys.hasLowScore` — cola Low Score Surveys / Backoffice. */
  hasLowScore: boolean;
  /** `service.surveys.reviewed`. */
  surveyReviewed: boolean;
  /** `service.flags.emergency || service.flags.vip`. */
  urgent: boolean;
  /** Minutos desde `service.date` (o `service.created`). */
  ageMinutes: number;
  ageLabel: string;
  /** `service.monitor.status` — lo que detectó el sistema automático. */
  monitorStatus?: MonitorStatus;
  monitorLabel?: string;
  /** `service.monitor.checkInReminderDate`. */
  checkInReminderDate?: string | null;
  /** `service.trip.status` crudo, para mostrarlo tal cual. */
  tripStatus?: string;
  /** `service.status` crudo. */
  serviceStatus?: string;
  /** Historial derivado de `service.trip.stamps` + `service.monitor.log`. */
  log: string[];
  /** El documento original, por si la UI necesita algo más. */
  raw: HeliosService;
}

/** Etiquetas legibles de `monitor.status` (MonitorDetailsLabel en helios_api). */
export const MONITOR_LABEL: Record<string, string> = {
  [MONITOR_STATUS.ON_TIME]: 'En tiempo',
  [MONITOR_STATUS.HAS_NOT_ACCEPTED]: 'No ha aceptado',
  [MONITOR_STATUS.IS_NOT_ON_ROUTE]: 'Fuera de ruta',
  [MONITOR_STATUS.HAS_NOT_FINISHED]: 'No ha finalizado',
  [MONITOR_STATUS.DELAYED]: 'Retraso 10+',
  [MONITOR_STATUS.NEW_MESSAGE]: 'Nuevo mensaje',
  [MONITOR_STATUS.MANAGED]: 'Gestionado',
  [MONITOR_STATUS.CHECK_IN]: 'Check-in',
  [MONITOR_STATUS.PENDING_MANAGEMENT]: 'Pendiente gestión',
};

/** Etiquetas de `trip.status` para la UI (Helios las muestra en inglés en timestamps). */
export const TRIP_LABEL: Record<string, string> = {
  new: 'Nuevo',
  accepted: 'Aceptado',
  on_route: 'En ruta',
  arrived: 'Arribado',
  towed: 'Remolcado',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
  cancelled_by_driver: 'Cancelado por el proveedor',
  pending_audit: 'Pendiente de auditoría',
};

/** Etiquetas de `service.status`. */
export const SERVICE_STATUS_LABEL: Record<string, string> = {
  Active: 'Activo',
  Hold: 'En espera',
  HoldInspection: 'Inspección en espera',
  Finished: 'Finalizado',
  Cancelled: 'Cancelado',
  'Not Covered': 'No cubierto',
  Informative: 'Informativo',
  Queued: 'En cola',
  New: 'Nuevo',
  Audit: 'Auditoría',
  Void: 'Anulado',
  'Hold Deleted': 'Hold eliminado',
};

export const formatTripStatus = (status?: string | null): string =>
  status ? TRIP_LABEL[status] ?? status : '—';

export const formatServiceStatus = (status?: string | null): string =>
  status ? SERVICE_STATUS_LABEL[status] ?? status : '—';

export const formatMonitorStatus = (status?: string | null): string =>
  status ? MONITOR_LABEL[status] ?? status : 'En tiempo';

export const isLowScoreQueue = (kase: Pick<ControlTowerCase, 'hasLowScore' | 'surveyReviewed'>): boolean =>
  kase.hasLowScore && !kase.surveyReviewed;

/** Estados de monitor que significan "esto necesita atención ya". */
export const ATTENTION_MONITOR_STATUSES: MonitorStatus[] = [
  MONITOR_STATUS.HAS_NOT_ACCEPTED,
  MONITOR_STATUS.IS_NOT_ON_ROUTE,
  MONITOR_STATUS.HAS_NOT_FINISHED,
  MONITOR_STATUS.DELAYED,
  MONITOR_STATUS.NEW_MESSAGE,
  MONITOR_STATUS.PENDING_MANAGEMENT,
];

export const formatAge = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} d`;
};

const minutesSince = (service: HeliosService, now: number): number => {
  const iso = service.date ? Date.parse(service.date) : NaN;
  const epoch = typeof service.created === 'number' ? service.created : NaN;
  const reference = Number.isFinite(iso) ? iso : epoch;
  if (!Number.isFinite(reference)) return 0;
  return Math.max(0, (now - reference) / 60000);
};

/** `trip.live.eta` viene en segundos; los ETA iniciales también. */
const formatEta = (service: HeliosService): string => {
  const trip = service.trip;
  if (!trip) return '—';

  const finished = trip.status === 'finished' || trip.status === 'cancelled' || trip.status === 'cancelled_by_driver';
  if (finished) return 'Finalizado';

  const seconds = trip.live?.eta ?? trip.onRouteEta ?? trip.trueEta ?? trip.initialEta;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return 'Calculando';
  if (seconds <= 0) return 'Arribado';
  return `${Math.round(seconds / 60)} min`;
};

const resolveAddress = (service: HeliosService): string =>
  service.pinSituationAddress || service.locations?.situation?.address || 'Sin dirección registrada';

const resolveProvider = (service: HeliosService): string =>
  service.providerName || service.provider?.name || service.driverName || service.driver?.name || 'Sin proveedor';

const resolveAccount = (service: HeliosService): string =>
  service.accountName || service.account || service.sfIdAccount || 'Sin cuenta';

/** Historial legible: stamps del trip + log del monitor. */
const buildLog = (service: HeliosService): string[] => {
  const entries: string[] = [];

  (service.trip?.stamps ?? []).forEach((stamp) => {
    const who = stamp.employeeName ? ` (${stamp.employeeName})` : '';
    entries.push(`Estado del viaje → ${formatTripStatus(stamp.status)}${who}`);
  });

  (service.monitor?.log ?? []).forEach((line) => {
    if (line.message) {
      entries.push(
        (line.status ? MONITOR_LABEL[line.status] : undefined) ??
          MONITOR_LABEL[line.message] ??
          line.message,
      );
    }
  });

  if (service.auditReason) entries.push(`Auditoría abierta: ${service.auditReason}`);
  if (service.surveys?.hasLowScore) {
    entries.push(
      service.surveys.reviewed
        ? 'Low Score Survey revisada'
        : 'Low Score Survey pendiente de revisión',
    );
  }

  return entries.length ? entries : ['Sin historial registrado en trip.stamps ni monitor.log.'];
};

/**
 * Convierte un servicio de Helios en un caso del Control Tower.
 * Devuelve `null` si el servicio está fuera del alcance (p.ej. `trip.status = new`).
 */
export const toControlTowerCase = (service: HeliosService, now = Date.now()): ControlTowerCase | null => {
  const resolution = resolveStage(service);
  if (resolution.kind === 'out-of-scope') return null;

  const inAudit = resolution.kind === 'audit';
  const hasLowScore = Boolean(service.surveys?.hasLowScore);
  const surveyReviewed = Boolean(service.surveys?.reviewed);
  const stageIdx = resolution.kind === 'stage' ? resolution.stageIdx : null;
  const track = service.serviceType ?? 'road';
  const ageMinutes = minutesSince(service, now);
  const monitorStatus = service.monitor?.status;

  return {
    id: service._id,
    displayId: service.serviceNumber ? `PO#${service.serviceNumber}` : service._id.slice(-6).toUpperCase(),
    track,
    trackLabel: TRACK_LABEL[track] ?? track,
    trackTone: TRACK_TONE[track] ?? 'muted',
    account: resolveAccount(service),
    branch: service.branch ?? '—',
    situation: service.situationLabel || service.situation || '—',
    phone1: service.phone1 ?? '—',
    address: resolveAddress(service),
    provider: resolveProvider(service),
    eta: formatEta(service),
    stageIdx,
    stageLabel: inAudit
      ? `Auditoría — ${service.auditReason ?? 'motivo no informado'}`
      : hasLowScore && !surveyReviewed
        ? 'Low Score Survey'
        : stageLabel(stageIdx as StageIndex),
    inAudit,
    auditReason: service.auditReason,
    isAuditHold: Boolean(service.isAuditHold),
    hasLowScore,
    surveyReviewed,
    urgent: Boolean(service.flags?.emergency || service.flags?.vip),
    ageMinutes,
    ageLabel: formatAge(ageMinutes),
    monitorStatus,
    monitorLabel: monitorStatus ? MONITOR_LABEL[monitorStatus] ?? monitorStatus : undefined,
    checkInReminderDate: service.monitor?.checkInReminderDate ?? null,
    tripStatus: service.trip?.status,
    serviceStatus: service.status,
    log: buildLog(service),
    raw: service,
  };
};

export const toControlTowerCases = (services: HeliosService[], now = Date.now()): ControlTowerCase[] =>
  services
    .map((service) => toControlTowerCase(service, now))
    .filter((value): value is ControlTowerCase => value !== null);
