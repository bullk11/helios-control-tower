/**
 * Cliente de check-in reminders.
 *
 * El router vive en helios_api/src/routes/check-in-reminder/check-in-reminder.router.ts
 * y se monta dentro del router v1 de servicios
 * (src/routes/api/services/v1/services.router.ts:14), así que el prefijo real es
 * `/api/v1/services`:
 *
 *   POST /api/v1/services/checkInReminder            { userId, checkInDate, reason, serviceId }
 *   GET  /api/v1/services/checkInReminder/:serviceId
 *   GET  /api/v1/services/checkInReminder/last/:serviceId
 *   POST /api/v1/services/checkInReminder/resolve    { serviceId, reason }
 *
 * Crear un reminder escribe `service.monitor.checkInReminderDate`, que es lo que
 * hace que `monitor.helper.ts` marque el servicio como `checkIn`. Esa es la
 * etapa 4 "Seguimiento post-servicio" del mockup.
 */

import { config } from '@/lib/config';
import { fetchWithAuth, getStoredUserId } from '@/lib/auth';
import type { HeliosCheckInReminder } from './types';

const base = () => `${config.heliosApiUrl}/api/v1/services/checkInReminder`;

/** Motivos de agenda. Alineados con los del mockup. */
export const CHECK_IN_REASONS = [
  'Pendiente respuesta del proveedor',
  'Pendiente respuesta del cliente',
  'Pendiente autorización de la cuenta',
  'Pendiente repuesto / insumo',
  'Servicio reprogramado',
] as const;

/** Motivos de cierre al resolver. */
export const CHECK_IN_RESOLVE_REASONS = [
  'Cliente confirmó satisfacción',
  'Servicio reprogramado',
  'Se resolvió con el proveedor',
  'Sin respuesta del cliente',
] as const;

export const createCheckInReminder = async (input: {
  serviceId: string;
  checkInDate: string;
  reason: string;
  branch?: string;
  serviceStatus?: string;
  userId?: string;
}): Promise<HeliosCheckInReminder | undefined> => {
  const userId = input.userId ?? getStoredUserId() ?? '';
  if (!userId) {
    throw new Error('Falta userId. Abre con ?userId=<mongo_id> o configura NEXT_PUBLIC_HELIOS_USER_ID.');
  }

  return fetchWithAuth<HeliosCheckInReminder | undefined>(base(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: input.serviceId,
      checkInDate: input.checkInDate,
      reason: input.reason,
      branch: input.branch,
      serviceStatus: input.serviceStatus,
      userId,
    }),
  });
};

export const getCheckInReminders = async (serviceId: string): Promise<HeliosCheckInReminder[]> => {
  const response = await fetchWithAuth<HeliosCheckInReminder[] | undefined>(`${base()}/${serviceId}`);
  return response ?? [];
};

export const getLastCheckInReminder = async (serviceId: string): Promise<HeliosCheckInReminder | null> => {
  const response = await fetchWithAuth<HeliosCheckInReminder | undefined>(`${base()}/last/${serviceId}`);
  return response ?? null;
};

export const resolveCheckInReminder = async (input: { serviceId: string; reason: string }): Promise<void> => {
  await fetchWithAuth(`${base()}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
};
