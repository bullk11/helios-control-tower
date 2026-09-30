/**
 * Catálogo de acciones por etapa.
 *
 * Cada acción declara contra qué endpoint de Helios pegaría. `implemented` dice si
 * el prototipo la ejecuta de verdad o solo la registra en el historial local.
 * Es, a propósito, la tabla que hay que revisar con ingeniería: muestra qué parte
 * del Control Tower ya se puede armar con la API que existe y qué falta.
 */

import type { StageIndex } from './stages';

export interface CaseAction {
  id: string;
  label: string;
  /** Endpoint real de Helios que respalda la acción. */
  endpoint: string;
  /** `true` = el prototipo la ejecuta contra la API en modo live. */
  implemented: boolean;
  /** Nota para diseño/ingeniería. */
  note?: string;
}

export const STAGE_ACTIONS: Record<StageIndex, CaseAction[]> = {
  0: [
    {
      id: 'contact-provider',
      label: 'Contactar proveedor',
      endpoint: 'POST /services/addNote (chatType: driver)',
      implemented: true,
    },
    {
      id: 'inform-client',
      label: 'Informar al cliente (ETA)',
      endpoint: 'POST /api/v2/services/confirm-message',
      implemented: false,
      note: 'Requiere { _id, sfIdAccount, serviceNumber, situation, phone1, branch }.',
    },
    {
      id: 'alert-provider',
      label: 'Alertar al proveedor',
      endpoint: 'No existe endpoint dedicado',
      implemented: false,
      note: 'Hoy se resuelve por fuera de Helios (WhatsApp / llamada al supervisor de flota).',
    },
    {
      id: 'reassign-provider',
      label: 'Reasignar proveedor',
      endpoint: 'POST /api/v2/services/try-automatic-reassignment',
      implemented: false,
      note: 'La reasignación manual vive en la pantalla de Dispatch.',
    },
  ],
  1: [
    {
      id: 'exception-time',
      label: 'Excepción de tiempo',
      endpoint: 'PATCH /services/monitor',
      implemented: true,
      note: 'monitor.helper.delay() empuja lastEta + N min y marca monitor.status = managed.',
    },
    {
      id: 'alert-provider-eta',
      label: 'Alertar al proveedor por ETA',
      endpoint: 'POST /services/addNote (chatType: driver)',
      implemented: true,
    },
    {
      id: 'escalate-ops',
      label: 'Escalar a operaciones',
      endpoint: 'POST /services/addNote (isObservation: true)',
      implemented: true,
      note: 'Deja una observación interna visible solo para el equipo.',
    },
  ],
  2: [
    {
      id: 'validate-close',
      label: 'Validar cierre administrativo',
      endpoint: 'PATCH /services/finished',
      implemented: false,
      note: 'Al cerrar, las reglas de auditoría deciden si va a Audit o a Finished.',
    },
    {
      id: 'request-evidence',
      label: 'Solicitar evidencia al proveedor',
      endpoint: 'POST /services/addNote (chatType: driver)',
      implemented: true,
    },
  ],
  3: [
    {
      id: 'reopen-followup',
      label: 'Reabrir seguimiento',
      endpoint: 'POST /api/v1/services/checkInReminder',
      implemented: true,
      note: 'Reabrir = agendar un nuevo check-in reminder.',
    },
    {
      id: 'escalate-ops-followup',
      label: 'Escalar a operaciones',
      endpoint: 'POST /services/addNote (isObservation: true)',
      implemented: true,
    },
  ],
};

/**
 * Matriz actor x etapa que documenta el mockup. Se renderiza en /docs.
 * `sistema` refleja los umbrales REALES de
 * helios_api/src/controllers/helpers/services/monitor.helper.ts.
 */
export interface ActorMatrixRow {
  stage: string;
  trigger: string;
  agente: string[];
  proveedor: string[];
  sistema: string[];
}

export const ACTOR_MATRIX: ActorMatrixRow[] = [
  {
    stage: '1 · Camino al servicio',
    trigger: 'trip.status = accepted',
    agente: ['Contactar al proveedor', 'Informar ETA al cliente', 'Reasignar si no avanza'],
    proveedor: ['Actualizar ubicación en vivo', 'Marcar en ruta (accepted -> on_route)'],
    sistema: [
      'monitor.status = isNotOnRoute si no arranca en 6 min (proveedor con <=1 servicio) o 15 min (con más)',
      'monitor.status = hasNotAccepted si lleva 3+ min en new',
    ],
  },
  {
    stage: '2 · En ejecución',
    trigger: 'trip.status = on_route | arrived | towed',
    agente: ['Otorgar minutos de excepción', 'Escalar a supervisor', 'Informar al cliente'],
    proveedor: ['Actualizar diagnóstico', 'Marcar finalizado (-> finished)'],
    sistema: [
      'monitor.status = delayed si el ETA no cambia en 10 min',
      'monitor.status = hasNotFinished: CO 60 min, no-tow 45 min, tow 120 min',
    ],
  },
  {
    stage: '3 · Cierre y validación',
    trigger: 'trip.status finished/cancelled con status aún Active',
    agente: ['Validar cierre administrativo', 'Solicitar evidencia', 'Aprobar o enviar a auditoría'],
    proveedor: ['Enviar evidencia y costo pactado'],
    sistema: [
      'Evalúa las reglas de auditoría del track y el país; si aplica -> status = Audit, trip.status = pending_audit',
    ],
  },
  {
    stage: '4 · Seguimiento post-servicio',
    trigger: 'monitor.checkInReminderDate activo',
    agente: ['Confirmar satisfacción', 'Resolver o reabrir seguimiento'],
    proveedor: ['No participa en esta etapa'],
    sistema: ['monitor.status = checkIn cuando llega la fecha del recordatorio'],
  },
  {
    stage: 'Transversal · chats, notas y check-in',
    trigger: 'notes.chatType · monitor.checkInReminderDate',
    agente: [
      'Responder chat del proveedor (chatType: driver)',
      'Responder chat de la cuenta / EOS (chatType: corporate_client)',
      'Dejar observación interna (isObservation: true)',
      'Crear o resolver check-in reminder con motivo',
    ],
    proveedor: ['Escribir en el chat del driver', 'Notas de audio', 'Notas driver -> aseguradora (d2iNote)'],
    sistema: [
      'monitor.status = newMessage con notas readFromHelios = false',
      'monitor.eosStatus = newMessage con notas readFromEos = false',
    ],
  },
  {
    stage: 'Auditoría',
    trigger: 'status = Audit o trip.status = pending_audit',
    agente: ['Revisar auditReason', 'Poner en hold audit', 'Resolver auditoría'],
    proveedor: ['Responder solicitudes de evidencia'],
    sistema: ['Asigna auditReason según las reglas del track y el país'],
  },
  {
    stage: 'Low Score Survey',
    trigger: 'surveys.hasLowScore y surveys.reviewed = false',
    agente: ['Contactar al cliente', 'Marcar encuesta como revisada'],
    proveedor: ['No participa en esta cola'],
    sistema: ['Entra a la cola cuando la encuesta post-servicio queda bajo el umbral'],
  },
];
