/**
 * Cliente de notas / chats de un servicio.
 *
 * En Helios los 3 "chats" del mockup son UNA sola colección (`notes`)
 * discriminada por `chatType` + `user.type` + `isObservation`
 * (helios_api/src/schemas/notes.schema.ts):
 *
 *   Chat proveedor        -> chatType: 'driver',            isObservation: false
 *   Chat cuenta / EOS     -> chatType: 'corporate_client',  isObservation: false
 *   Observación interna   -> isObservation: true
 *
 * Endpoints (router legacy montado en '/'):
 *   GET   /dispatch/gNotes/:serviceId      leer notas
 *   POST  /services/addNote                crear nota
 *   PATCH /services/:serviceId/notes        marcar como leídas
 */

import { config } from '@/lib/config';
import { fetchWithAuth, getStoredUserId } from '@/lib/auth';
import { NOTE_CHAT_TYPE, type HeliosNote, type NoteChatType } from './types';

const base = () => config.heliosApiUrl;

/** Las 3 pestañas de conversación del mockup. */
export type CaseChatTab = 'driver' | 'account' | 'internal';

export const CHAT_TAB_TO_QUERY: Record<CaseChatTab, { chatType: NoteChatType; isObservation: boolean }> = {
  driver: { chatType: NOTE_CHAT_TYPE.DRIVER, isObservation: false },
  account: { chatType: NOTE_CHAT_TYPE.DRIVER, isObservation: false },
  internal: { chatType: NOTE_CHAT_TYPE.DRIVER, isObservation: true },
};

/** `GET /dispatch/gNotes/:serviceId` — notas regulares + observaciones */
export const getServiceNotes = async (serviceId: string): Promise<HeliosNote[]> => {
  // Dos llamadas en paralelo:
  //  1. chatType=all_chats -> notas de chat (driver + corporate_client), excluye observations
  //  2. isObservation=true -> solo observations (param agregado en helios_api local)
  const [chatNotes, observations] = await Promise.all([
    fetchWithAuth<HeliosNote[] | { notes?: HeliosNote[] } | undefined>(
      `${base()}/dispatch/gNotes/${serviceId}?chatType=all_chats`,
    ),
    fetchWithAuth<HeliosNote[] | { notes?: HeliosNote[] } | undefined>(
      `${base()}/dispatch/gNotes/${serviceId}?isObservation=true`,
    ),
  ]);

  const parseNotes = (response: HeliosNote[] | { notes?: HeliosNote[] } | undefined): HeliosNote[] => {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    return response.notes ?? [];
  };

  const notes = parseNotes(chatNotes);

  // Agregar observaciones marcándolas con isObservation: true
  for (const obs of parseNotes(observations)) {
    notes.push({ ...obs, isObservation: true });
  }

  return notes;
};

/** `POST /utils/addNote` */
export const addServiceNote = async (input: {
  serviceId: string;
  msg: string;
  tab: CaseChatTab;
  employeeId?: string;
}): Promise<HeliosNote | undefined> => {
  const { chatType, isObservation } = CHAT_TAB_TO_QUERY[input.tab];

  // Chat cuenta/EOS: con chatType 'driver' + userType 'user', el controller marca d2iNote: true
  // automáticamente, que es lo que EOS filtra para mostrar las notas.
  const readFromEos = input.tab === 'account';
  const userType = input.tab === 'account' ? 'user' : undefined;

  const response = await fetchWithAuth<{ status?: boolean; note?: HeliosNote } | undefined>(`${base()}/utils/addNote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: input.serviceId,
      body: input.msg,
      employeeId: input.employeeId || getStoredUserId() || '',
      chatType,
      isObservation,
      readFromHelios: true,
      readFromEos,
      ...(userType ? { userType } : {}),
    }),
  });

  return response?.note;
};

/** `PATCH /services/:serviceId/notes` — apaga el estado `newMessage` del monitor. */
export const markNotesAsRead = async (serviceId: string, tab: CaseChatTab): Promise<void> => {
  const { chatType } = CHAT_TAB_TO_QUERY[tab];
  await fetchWithAuth(`${base()}/services/${serviceId}/notes`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatType }),
  });
};

/** Reparte las notas de un servicio en las 3 pestañas del mockup. */
export const groupNotesByTab = (notes: HeliosNote[]): Record<CaseChatTab, HeliosNote[]> => {
  const grouped: Record<CaseChatTab, HeliosNote[]> = { driver: [], account: [], internal: [] };

  notes
    .filter((note) => !note.hideNote)
    .forEach((note) => {
      if (note.isObservation) {
        grouped.internal.push(note);
        return;
      }
      // d2iNote = driver-to-insurer: es lo que EOS lee como "nota de la cuenta"
      if (note.d2iNote || note.chatType === NOTE_CHAT_TYPE.CORPORATE_CLIENT) {
        grouped.account.push(note);
        return;
      }
      grouped.driver.push(note);
    });

  return grouped;
};

/** Notas sin leer desde Helios: lo que dispara `monitor.status = newMessage`. */
export const countUnread = (notes: HeliosNote[]): number =>
  notes.filter((note) => note.readFromHelios === false && !note.d2iNote).length;
