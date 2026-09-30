/**
 * Auditoría.
 *
 * En Helios la auditoría no la decide el frontend: cuando un servicio se cancela
 * o se finaliza, `service.controller.ts` llama al helper del track
 * (`roadAuditReasons` / `homeAuditReasons` / `conciergeAuditReasons` /
 * `claimsAuditReasons`) y, si devuelve un motivo, ejecuta
 * `markServiceAsPendingAudit(...)`, que deja el servicio en
 * `status = 'Audit'` / `trip.status = 'pending_audit'` con `auditReason` seteado.
 *
 * Por eso el prototipo NO simula la decisión: lee `service.auditReason` y lo
 * muestra. Los motivos de abajo son el subconjunto del enum `AuditReasons`
 * (helios_api/src/schemas/services.schema.ts) que aplica a cada track, y se usan
 * solo para poblar los filtros y el modo mock.
 */

import type { CaseAction } from './actions';

/** Subconjunto del enum `AuditReasons` de helios_api, agrupado por track. */
export const AUDIT_REASONS_BY_TRACK: Record<string, string[]> = {
  road: [
    'Difference from estimated distance',
    'Heavy Vehicle',
    'Has Surplus Charge',
    'Cancelled by GOA',
    'Foreign Service over 40km',
  ],
  home: [
    'Requires Manual Close Request',
    'Agreed amount (Costa Rica)',
    'Service Cost Modified',
    'Is Other Service',
    'Cancelled with provider payment',
  ],
  concierge: [
    'Provider Payment Zero',
    'Has provider costs',
    'Rejected by Provider',
    'Other Service',
  ],
  claims: ['Automatic Audit Disabled', 'Provider Payment Changed'],
};

export const auditReasonsForTrack = (track: string): string[] => AUDIT_REASONS_BY_TRACK[track] ?? [];

export const ALL_AUDIT_REASONS: string[] = Array.from(
  new Set(Object.values(AUDIT_REASONS_BY_TRACK).flat()),
).sort();

/**
 * Acciones del agente sobre un Pending Audit.
 * En Helios viven en el detalle del servicio: switch Hold audit y botón Audit (finish).
 */
export const AUDIT_ACTIONS: CaseAction[] = [
  {
    id: 'hold-audit',
    label: 'Poner en hold audit',
    endpoint: 'PATCH /services/:serviceId/audit-hold',
    implemented: true,
    note: 'Escribe `isAuditHold`. En Helios es el switch Hold audit del detalle.',
  },
  {
    id: 'resolve-audit',
    label: 'Resolver auditoría',
    endpoint: 'POST /services/finish',
    implemented: true,
    note: 'Mismo flujo que el botón Audit del detalle: handleFinish saca el servicio de pending_audit.',
  },
];
