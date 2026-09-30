/**
 * Cliente del endpoint de monitor delay.
 *
 * Ruta confirmada en helios_api/src/routes/services/monitor.router.ts:17
 *   PATCH /services/monitor
 *
 * Body: { serviceId, time }
 *   - serviceId: el _id del servicio
 *   - time: minutos de excepción a otorgar
 *
 * Efecto: empuja `service.trip.live.eta` + N minutos y marca
 * `service.monitor.status = 'managed'`.
 */

import { config } from '@/lib/config';
import { fetchWithAuth } from '@/lib/auth';

const base = () => config.heliosApiUrl;

/** Opciones de tiempo para excepción. */
export const EXCEPTION_TIME_OPTIONS = [
  { value: 5, label: '+5 min' },
  { value: 10, label: '+10 min' },
  { value: 15, label: '+15 min' },
  { value: 120, label: '+2 horas' },
] as const;

/**
 * `PATCH /services/monitor`
 * Otorga minutos de excepción al servicio.
 */
export const delayService = async (input: {
  serviceId: string;
  time: number;
}): Promise<void> => {
  await fetchWithAuth(`${base()}/services/monitor`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
};
