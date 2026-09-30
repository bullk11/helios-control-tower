/**
 * Reglas de cola: qué casos ve un grupo, en qué orden, y cuántos puede tomar.
 *
 * La propiedad del caso (`claim`) no existe en Helios hoy. En el prototipo vive en
 * memoria/localStorage (ver ../ownership.ts). Lo más cercano que existe hoy en
 * Helios es el soft-lock de Service Q
 * (`POST /dashboard/updateEditOrDuplicateStatus`) y la presencia de
 * `GET /dashboard/liveViewData`.
 */

import type { ControlTowerCase } from './case';
import type { ControlTowerGroup } from './groups';
import { QUEUE_VIEW_CAP } from './groups';
import { type DismissedMap, shouldReappear } from '../ownership';

/** ¿Este caso pertenece al alcance del grupo? */
export const isInGroupScope = (kase: ControlTowerCase, group: ControlTowerGroup): boolean => {
  // Auditoría = Pending Audit. Backoffice = Low Score Survey. Son colas exclusivas.
  if (group.isAudit) return kase.inAudit;
  if (group.isLowScoreSurvey) return kase.hasLowScore && !kase.surveyReviewed;

  if (kase.inAudit) return false;
  if (kase.hasLowScore && !kase.surveyReviewed) return false;

  if (kase.stageIdx === null) return false;
  if (!group.stages.includes(kase.stageIdx)) return false;
  if (!group.tracks.includes(kase.track)) return false;
  if (group.accounts && !group.accounts.includes(kase.account)) return false;
  if (group.branches && !group.branches.includes(kase.branch)) return false;

  return true;
};

/**
 * Orden de la cola: urgentes primero, luego lo que el sistema marcó como que
 * necesita atención, luego lo más viejo. Esta prioridad es propuesta del
 * prototipo, no existe en Helios.
 */
export const sortQueue = (cases: ControlTowerCase[]): ControlTowerCase[] =>
  [...cases].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;

    const aAttention = Boolean(a.monitorStatus && a.monitorStatus !== 'onTime');
    const bAttention = Boolean(b.monitorStatus && b.monitorStatus !== 'onTime');
    if (aAttention !== bAttention) return aAttention ? -1 : 1;

    return b.ageMinutes - a.ageMinutes;
  });

export interface QueueView {
  /** Todo lo que le corresponde al grupo y nadie tomó. */
  queue: ControlTowerCase[];
  /** El subconjunto visible (cap de 5 salvo que se pida ver todo). */
  visible: ControlTowerCase[];
  /** Casos que este grupo ya tomó. */
  myCases: ControlTowerCase[];
  capacity: number;
  claimedCount: number;
  capacityPct: number;
  atCapacity: boolean;
  hasMoreThanCap: boolean;
}

export const buildQueueView = (input: {
  cases: ControlTowerCase[];
  group: ControlTowerGroup;
  /** caseId -> groupId */
  ownership: Record<string, string>;
  /** caseId -> DismissedSnapshot */
  dismissed: DismissedMap;
  showAll: boolean;
  /** Filtro de país del panel superior. `null` = todos. */
  branchFilter?: string | null;
}): QueueView => {
  const { cases, group, ownership, dismissed, showAll, branchFilter } = input;

  const scoped = cases.filter((kase) => {
    if (branchFilter && kase.branch !== branchFilter) return false;
    if (!isInGroupScope(kase, group)) return false;

    // Si el caso está descartado, solo lo mostramos si debe reaparecer
    if (dismissed[kase.id]) {
      const noteCount = 0; // sin acceso a notas en la cola, el cambio de monitor basta
      return shouldReappear(kase.id, kase.monitorStatus, noteCount, dismissed);
    }

    return true;
  });

  const queue = sortQueue(scoped.filter((kase) => !ownership[kase.id]));
  const myCases = scoped.filter((kase) => ownership[kase.id] === group.id);

  const claimedCount = myCases.length;
  const capacityPct = group.capacity > 0 ? Math.min(100, Math.round((claimedCount / group.capacity) * 100)) : 0;

  return {
    queue,
    visible: showAll ? queue : queue.slice(0, QUEUE_VIEW_CAP),
    myCases,
    capacity: group.capacity,
    claimedCount,
    capacityPct,
    atCapacity: claimedCount >= group.capacity,
    hasMoreThanCap: queue.length > QUEUE_VIEW_CAP,
  };
};

/** El grupo que recibiría el caso si avanza a la etapa siguiente (mismo alcance que la cola). */
export const nextOwnerGroup = (
  kase: ControlTowerCase,
  groups: ControlTowerGroup[],
  options?: { groupType?: ControlTowerGroup['type'] },
): ControlTowerGroup | undefined => {
  if (kase.stageIdx === null || kase.inAudit || (kase.hasLowScore && !kase.surveyReviewed)) return undefined;

  const nextStage = kase.stageIdx + 1;
  if (nextStage > 3) return undefined;

  const candidates = options?.groupType ? groups.filter((item) => item.type === options.groupType) : groups;

  return candidates.find((group) => {
    if (group.isAudit || group.isLowScoreSurvey) return false;
    if (!group.stages.includes(nextStage as 0 | 1 | 2 | 3)) return false;
    if (!group.tracks.includes(kase.track)) return false;
    if (group.accounts && !group.accounts.includes(kase.account)) return false;
    if (group.branches && !group.branches.includes(kase.branch)) return false;
    return true;
  });
};
