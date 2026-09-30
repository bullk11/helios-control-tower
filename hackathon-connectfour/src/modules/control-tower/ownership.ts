/**
 * Propiedad de un caso ("tomar caso" / "soltar caso").
 *
 * Esto NO existe en Helios. No hay endpoint de asignación de un servicio a un
 * agente ni a un equipo. Lo más cercano es:
 *   - `POST /dashboard/updateEditOrDuplicateStatus` — soft-lock del Service Q para
 *     que dos agentes no editen el mismo servicio.
 *   - `GET /dashboard/liveViewData` y `POST|DELETE /dashboard/liveViewData/:agentId/:serviceNumber`
 *     — presencia: quién está mirando qué.
 *
 * El prototipo lo persiste en localStorage para que la demo sobreviva un refresh.
 * La propuesta de backend está en la sección "Gaps" del .md.
 */

const STORAGE_KEY = 'control-tower:ownership';
const DISMISSED_KEY = 'control-tower:dismissed';

/** caseId -> groupId */
export type OwnershipMap = Record<string, string>;

export const readOwnership = (): OwnershipMap => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as OwnershipMap;
  } catch {
    return {};
  }
};

export const writeOwnership = (map: OwnershipMap): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage lleno o bloqueado: la demo sigue con el estado en memoria.
  }
};

export const claimCase = (map: OwnershipMap, caseId: string, groupId: string): OwnershipMap => ({
  ...map,
  [caseId]: groupId,
});

export const releaseCase = (map: OwnershipMap, caseId: string): OwnershipMap => {
  const next = { ...map };
  delete next[caseId];
  return next;
};

// ---------------------------------------------------------------------------
// Dismissed cases — "Resolver caso" local, sin tocar Helios.
//
// Guarda qué casos descartó el agente y el snapshot del momento:
//   monitorStatus + noteCount.
// El caso reaparece automáticamente si alguno de esos valores cambia
// (nuevo mensaje, cambio de monitor, etc.).
// ---------------------------------------------------------------------------

export interface DismissedSnapshot {
  monitorStatus?: string;
  noteCount: number;
  dismissedAt: number;
}

export type DismissedMap = Record<string, DismissedSnapshot>;

export const readDismissed = (): DismissedMap => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as DismissedMap;
  } catch {
    return {};
  }
};

export const writeDismissed = (map: DismissedMap): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(map));
  } catch {}
};

export const dismissCase = (
  map: DismissedMap,
  caseId: string,
  snapshot: DismissedSnapshot,
): DismissedMap => ({ ...map, [caseId]: snapshot });

export const undismissCase = (map: DismissedMap, caseId: string): DismissedMap => {
  const next = { ...map };
  delete next[caseId];
  return next;
};

/**
 * Un caso descartado debe reaparecer si:
 *  - El monitor.status cambió (hay una alerta nueva)
 *  - Hay un nuevo mensaje (noteCount aumentó)
 *  - Han pasado más de 4 horas (tiempo máximo de supresión)
 */
export const shouldReappear = (
  caseId: string,
  currentMonitorStatus: string | undefined,
  currentNoteCount: number,
  dismissed: DismissedMap,
): boolean => {
  const snap = dismissed[caseId];
  if (!snap) return false; // no estaba descartado

  const MAX_SUPPRESS_MS = 4 * 60 * 60 * 1000; // 4 horas
  if (Date.now() - snap.dismissedAt > MAX_SUPPRESS_MS) return true;
  if (currentMonitorStatus !== snap.monitorStatus) return true;
  if (currentNoteCount > snap.noteCount) return true;

  return false;
};
