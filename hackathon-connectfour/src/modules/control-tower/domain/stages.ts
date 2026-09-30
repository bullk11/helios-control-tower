/**
 * Las 4 etapas del Control Tower y su derivación desde el estado REAL del servicio.
 *
 * El mockup dice explícitamente: "etapas = trip.status desde `accepted` en adelante
 * (el modelo arranca post-despacho: `new`/asignación queda fuera del alcance inicial)".
 *
 * Este archivo es el corazón del prototipo: traduce el modelo de Helios
 * (`service.status` + `service.trip.status` + `service.monitor`) al modelo de
 * producto que el agente ve en pantalla.
 */

import { SERVICE_STATUS, TRIP_STATUS, type HeliosService, type TripStatus } from '@/modules/helios/types';

export const STAGE_NAMES = [
  'Camino al servicio',
  'En ejecución',
  'Cierre y validación',
  'Seguimiento post-servicio',
] as const;

export type StageIndex = 0 | 1 | 2 | 3;

/** `null` = el servicio está fuera del alcance del Control Tower. */
export type StageResolution =
  | { kind: 'stage'; stageIdx: StageIndex }
  | { kind: 'audit' }
  | { kind: 'out-of-scope'; reason: string };

/** trip.status que corresponde a cada etapa. */
export const STAGE_TRIP_STATUSES: Record<StageIndex, TripStatus[]> = {
  0: [TRIP_STATUS.ACCEPTED],
  1: [TRIP_STATUS.ON_ROUTE, TRIP_STATUS.ARRIVED, TRIP_STATUS.TOWED],
  2: [TRIP_STATUS.FINISHED, TRIP_STATUS.CANCELLED, TRIP_STATUS.CANCELLED_BY_DRIVER],
  3: [TRIP_STATUS.FINISHED, TRIP_STATUS.CANCELLED, TRIP_STATUS.CANCELLED_BY_DRIVER],
};

/** Todos los trip.status que Control Tower observa (excluye `new`). */
export const IN_SCOPE_TRIP_STATUSES: TripStatus[] = [
  TRIP_STATUS.ACCEPTED,
  TRIP_STATUS.ON_ROUTE,
  TRIP_STATUS.ARRIVED,
  TRIP_STATUS.TOWED,
  TRIP_STATUS.FINISHED,
  TRIP_STATUS.CANCELLED,
  TRIP_STATUS.CANCELLED_BY_DRIVER,
  TRIP_STATUS.PENDING_AUDIT,
];

export const stageLabel = (stageIdx: StageIndex): string => STAGE_NAMES[stageIdx];

/**
 * Deriva la etapa de un servicio real.
 *
 * Reglas, en orden:
 *  1. Auditoría gana sobre todo: `status === 'Audit'` o `trip.status === 'pending_audit'`.
 *     Es el "se cayó el servicio" del mockup.
 *  2. `trip.status === 'new'` -> fuera de alcance (todavía lo maneja Dispatch).
 *  3. `accepted` -> etapa 1.
 *  4. `on_route | arrived | towed` -> etapa 2.
 *  5. Cerrado/cancelado CON check-in reminder agendado -> etapa 4 (seguimiento).
 *  6. Cerrado/cancelado SIN reminder -> etapa 3 (cierre y validación).
 */
export const resolveStage = (service: HeliosService): StageResolution => {
  const tripStatus = service.trip?.status;

  if (service.status === SERVICE_STATUS.AUDIT || tripStatus === TRIP_STATUS.PENDING_AUDIT) {
    return { kind: 'audit' };
  }

  if (!tripStatus) {
    return { kind: 'out-of-scope', reason: 'El servicio no tiene trip.status.' };
  }

  if (tripStatus === TRIP_STATUS.NEW) {
    return {
      kind: 'out-of-scope',
      reason: 'trip.status = new: el despacho y la asignación siguen en Dispatch.',
    };
  }

  if (tripStatus === TRIP_STATUS.ACCEPTED) return { kind: 'stage', stageIdx: 0 };

  if (
    tripStatus === TRIP_STATUS.ON_ROUTE ||
    tripStatus === TRIP_STATUS.ARRIVED ||
    tripStatus === TRIP_STATUS.TOWED
  ) {
    return { kind: 'stage', stageIdx: 1 };
  }

  // finished | cancelled | cancelled_by_driver
  const hasCheckIn = Boolean(service.monitor?.checkInReminderDate);
  return { kind: 'stage', stageIdx: hasCheckIn ? 3 : 2 };
};

/**
 * Qué escribiría cada botón "Avanzar etapa" contra la API real.
 *
 * En el prototipo estas transiciones NO se escriben: el avance real lo produce el
 * proveedor desde Helios App (stamps del trip) o el agente desde las pantallas de
 * servicio de Helios. Se documenta acá para que quede explícito el contrato.
 */
export const STAGE_ADVANCE_CONTRACT: Record<StageIndex, { writes: string; owner: string }> = {
  0: {
    writes: "trip.status: 'accepted' -> 'on_route'",
    owner: 'Proveedor (Helios App). El agente solo alerta o reasigna.',
  },
  1: {
    writes: "trip.status: 'on_route'/'arrived'/'towed' -> 'finished'",
    owner: 'Proveedor (Helios App) al finalizar; dispara reglas de auditoría.',
  },
  2: {
    writes: "status: 'Active' -> 'Finished' | 'Audit'",
    owner: 'Agente vía cierre administrativo; las reglas de auditoría deciden.',
  },
  3: {
    writes: 'monitor.checkInReminderDate -> resuelto',
    owner: 'Agente vía POST /api/v1/services/checkInReminder/resolve',
  },
};
