/**
 * Grupos de trabajo del Control Tower.
 *
 * IMPORTANTE: esto NO existe hoy en Helios. Ni helios_api ni helios_frontend
 * tienen concepto de equipo, capacidad ni propiedad de un caso; solo hay roles
 * (`custom:role` de Cognito) y permisos CASL (`rolesV2`).
 *
 * Por eso la configuración vive acá, en el cliente, como propuesta de modelo.
 * La sección "Gaps" del .md detalla qué habría que construir en backend.
 */

import type { StageIndex } from './stages';

export type GroupType = 'etapa' | 'cuenta' | 'pais';

export interface ControlTowerGroup {
  id: string;
  label: string;
  type: GroupType;
  /** Tracks que cubre. Se compara contra `service.serviceType`. */
  tracks: string[];
  /** Etapas de las que es responsable. Vacío + isAudit = cola de auditoría. */
  stages: StageIndex[];
  /** Máximo de casos simultáneos por agente. */
  capacity: number;
  /** Nombres de cuenta que cubre (si aplica). */
  accounts?: string[];
  /** Branches que cubre (si aplica). */
  branches?: string[];
  /** Cola Pending Audit (`status = Audit` / `trip.status = pending_audit`). */
  isAudit?: boolean;
  /** Cola Low Score Surveys (`surveys.hasLowScore` sin revisar). */
  isLowScoreSurvey?: boolean;
}

/** Tope operativo de casos simultáneos por grupo/agente en el prototipo. */
export const MAX_GROUP_CAPACITY = 10;

export const ALL_TRACKS = ['road', 'home', 'concierge'] as const;

/** Etiquetas de track en la UI (el mockup usa Road / Home / Concierge). */
export const TRACK_LABEL: Record<string, string> = {
  road: 'Road',
  home: 'Home',
  concierge: 'Concierge',
  claims: 'Claims',
};

export const TRACK_TONE: Record<string, 'orange' | 'navy' | 'success' | 'muted'> = {
  road: 'orange',
  home: 'navy',
  concierge: 'success',
  claims: 'muted',
};

export const GROUPS: ControlTowerGroup[] = [
  // --- Por momento del servicio ---
  {
    id: 'torre-control',
    label: 'Torre de Control',
    type: 'etapa',
    tracks: [...ALL_TRACKS],
    stages: [0, 1],
    capacity: 6,
  },
  {
    id: 'backoffice',
    label: 'Backoffice',
    type: 'etapa',
    tracks: [...ALL_TRACKS],
    stages: [],
    capacity: 6,
    isLowScoreSurvey: true,
  },
  {
    id: 'auditoria',
    label: 'Auditoría',
    type: 'etapa',
    tracks: [...ALL_TRACKS],
    stages: [],
    capacity: 6,
    isAudit: true,
  },

  // --- Por cuenta ---
  {
    id: 'eq-qualitas',
    label: 'Equipo Qualitas MX',
    type: 'cuenta',
    tracks: [...ALL_TRACKS],
    stages: [0, 1, 2, 3],
    accounts: ['Qualitas MX'],
    capacity: 5,
  },
  {
    id: 'eq-sura',
    label: 'Equipo Sura CO',
    type: 'cuenta',
    tracks: [...ALL_TRACKS],
    stages: [0, 1, 2, 3],
    accounts: ['Sura CO'],
    capacity: 5,
  },
  {
    id: 'eq-mmm',
    label: 'Equipo MMM',
    type: 'cuenta',
    tracks: [...ALL_TRACKS],
    stages: [0, 1, 2, 3],
    accounts: ['MMM', 'MMM Empleados'],
    capacity: 5,
  },
  {
    id: 'eq-hogar-cuentas',
    label: 'Equipo cuentas Hogar',
    type: 'cuenta',
    tracks: [...ALL_TRACKS],
    stages: [0, 1, 2, 3],
    accounts: ['Whirlpool', 'Zurich', 'Vanti'],
    capacity: 5,
  },

  // --- Por país ---
  {
    id: 'pais-co',
    label: 'Equipo Colombia',
    type: 'pais',
    tracks: [...ALL_TRACKS],
    stages: [0, 1, 2, 3],
    branches: ['Colombia'],
    capacity: 5,
  },
  {
    id: 'pais-pr',
    label: 'Equipo Puerto Rico',
    type: 'pais',
    tracks: [...ALL_TRACKS],
    stages: [0, 1, 2, 3],
    branches: ['Puerto Rico'],
    capacity: 5,
  },
  {
    id: 'pais-mx',
    label: 'Equipo México',
    type: 'pais',
    tracks: [...ALL_TRACKS],
    stages: [0, 1, 2, 3],
    branches: ['Mexico'],
    capacity: 5,
  },
  {
    id: 'pais-pa',
    label: 'Equipo Panamá',
    type: 'pais',
    tracks: [...ALL_TRACKS],
    stages: [0, 1, 2, 3],
    branches: ['Panama'],
    capacity: 5,
  },
  {
    id: 'pais-cr',
    label: 'Equipo Costa Rica',
    type: 'pais',
    tracks: [...ALL_TRACKS],
    stages: [0, 1, 2, 3],
    branches: ['Costa Rica'],
    capacity: 5,
  },
];

export const GROUP_BY_OPTIONS = [
  { value: 'etapa' as GroupType, label: 'Momento del servicio' },
  { value: 'cuenta' as GroupType, label: 'Cuenta' },
  { value: 'pais' as GroupType, label: 'País' },
];

/** Cuántos casos ve el agente a la vez, para no saturar la pantalla. */
export const QUEUE_VIEW_CAP = 5;

export const findGroup = (groupId: string): ControlTowerGroup =>
  GROUPS.find((group) => group.id === groupId) ?? GROUPS[0];

export const groupsOfType = (type: GroupType): ControlTowerGroup[] =>
  GROUPS.filter((group) => group.type === type);

export const describeGroupScope = (group: ControlTowerGroup, stageNames: readonly string[]): string => {
  if (group.isAudit) {
    return 'Muestra servicios en Pending Audit: ya cerraron o se cancelaron y esperan revisión.';
  }
  if (group.isLowScoreSurvey) {
    return 'Muestra servicios con encuesta de baja calificación que todavía no se revisaron.';
  }
  if (group.accounts) return `Cuentas: ${group.accounts.join(', ')} · todas las etapas`;
  if (group.branches) return `País: ${group.branches.join(', ')} · todas las etapas`;
  if (group.id === 'torre-control') {
    return 'Muestra servicios activos en camino o en ejecución: el proveedor ya aceptó y todavía no cierra.';
  }
  return `Muestra: ${group.stages.map((idx) => stageNames[idx]).join(' y ')}.`;
};
