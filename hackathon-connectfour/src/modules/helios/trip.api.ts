/**
 * Cliente del endpoint de timestamps del trip.
 *
 * Ruta confirmada en helios_api/src/routes/trips/trip.router.ts:10
 *   POST /service/trip/:serviceId/timestamp
 *
 * Body: { timestamp: { status, time } }
 *
 * En Helios Angular el botón + de Timestamps NO incluye `finished`: el cierre
 * administrativo va por POST /services/finish (service-container finishService).
 */

import { config } from '@/lib/config';
import { fetchWithAuth } from '@/lib/auth';
import type { TripStatus } from './types';

const base = () => config.heliosApiUrl;

/** Estados intermedios que se agregan como timestamp (como Helios Timestamps). */
export const TRIP_TIMESTAMP_STATUSES: Array<{ value: TripStatus; label: string }> = [
  { value: 'on_route', label: 'En ruta' },
  { value: 'arrived', label: 'Arribado' },
  { value: 'towed', label: 'Remolcado' },
];

export const isTowSituation = (situation?: string | null): boolean => {
  const value = (situation ?? '').toLowerCase();
  return /\b(tow|grúa|grua|remolque|arrastre)\b/.test(value);
};

/** Opciones de timestamp según trip.status (nunca incluye finished). */
export const advanceableStatusOptions = (
  tripStatus?: string | null,
  options?: { situation?: string | null },
) => {
  const current = tripStatus ?? '';
  const allowTowed = isTowSituation(options?.situation);

  return TRIP_TIMESTAMP_STATUSES.filter((item) => {
    if (item.value === 'towed' && !allowTowed) return false;
    if (current === 'accepted' || current === 'new') {
      return item.value === 'on_route' || item.value === 'arrived' || (allowTowed && item.value === 'towed');
    }
    if (current === 'on_route') {
      return item.value === 'arrived' || (allowTowed && item.value === 'towed');
    }
    return false;
  });
};

/** Solo desde arrived o towed se puede cerrar el servicio con finish. */
export const canFinishTripService = (tripStatus?: string | null): boolean =>
  tripStatus === 'arrived' || tripStatus === 'towed';

/**
 * `POST /service/trip/:serviceId/timestamp?dashboard=true`
 * Agrega un timestamp al trip del servicio, avanzando su etapa intermedia.
 */
export const addTripTimestamp = async (input: {
  serviceId: string;
  status: TripStatus;
}): Promise<void> => {
  await fetchWithAuth(`${base()}/service/trip/${input.serviceId}/timestamp?dashboard=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      timestamp: {
        status: input.status,
        time: Date.now(),
      },
    }),
  });
};
