/**
 * Motor de decisión local (sin LLM): scoring explicable, avisos y redistribución.
 * Las razones salen de señales reales de Helios (monitor, urgencia, edad, cola).
 */

import { MONITOR_STATUS, type MonitorStatus } from '@/modules/helios/types';
import { ATTENTION_MONITOR_STATUSES, type ControlTowerCase } from './case';
import { MAX_GROUP_CAPACITY, type ControlTowerGroup } from './groups';
import { isInGroupScope } from './queue';
import { buildQueueView } from './queue';
import { shouldReappear, type DismissedMap } from '../ownership';
import type { WorkLogEntry } from '../capacity-store';

const MONITOR_SCORE: Partial<Record<MonitorStatus, number>> = {
  [MONITOR_STATUS.HAS_NOT_FINISHED]: 35,
  [MONITOR_STATUS.DELAYED]: 32,
  [MONITOR_STATUS.IS_NOT_ON_ROUTE]: 28,
  [MONITOR_STATUS.PENDING_MANAGEMENT]: 26,
  [MONITOR_STATUS.NEW_MESSAGE]: 25,
  [MONITOR_STATUS.HAS_NOT_ACCEPTED]: 22,
  [MONITOR_STATUS.CHECK_IN]: 18,
};

export interface ScoreBreakdown {
  score: number;
  reasons: string[];
  chip: string;
}

export interface NotificationSuggestion {
  caseId: string;
  displayId: string;
  score: number;
  severity: 'high' | 'medium';
  monitorKey: string;
  title: string;
  text: string;
  reasons: string[];
  chip: string;
}

export type CapacityMoveKind = 'rebalance' | 'boost' | 'staff';

export interface CapacityMove {
  id: string;
  kind: CapacityMoveKind;
  overloadedGroupId: string;
  overloadedLabel: string;
  slackGroupId?: string;
  slackLabel?: string;
  overloadedDelta: number;
  slackDelta?: number;
  maxOverloadDelta: number;
  fromCapacity: number;
  toCapacity: number;
  loadPct: number;
  projectedLoadPct: number;
  remainingQueue: number;
  claimed: number;
  queue: number;
  summary: string;
  reasons: string[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const projectCapacityMove = (move: CapacityMove, overloadedDelta: number): CapacityMove => {
  const delta = clamp(Math.round(overloadedDelta), 0, move.maxOverloadDelta);
  const toCapacity = move.fromCapacity + delta;
  const slackDelta = move.kind === 'rebalance' ? -delta : move.slackDelta;
  return {
    ...move,
    overloadedDelta: delta,
    slackDelta,
    toCapacity,
    projectedLoadPct: loadPctOf(move.claimed, move.queue, toCapacity),
    remainingQueue: Math.max(0, move.claimed + move.queue - toCapacity),
    summary:
      move.kind === 'rebalance' && move.slackLabel
        ? `${move.overloadedLabel} al ${move.loadPct}% y ${move.slackLabel} con holgura: mover ${delta} slot${delta === 1 ? '' : 's'} de capacidad.`
        : `${move.overloadedLabel} al ${move.loadPct}%: subir capacidad +${delta} (de ${move.fromCapacity} a ${toCapacity}).`,
  };
};

export interface GroupCapacityRow {
  groupId: string;
  label: string;
  capacity: number;
  claimed: number;
  queue: number;
  utilizationPct: number;
  loadRatio: number;
  backlogHours: number;
  suggestion?: string;
}

export interface CapacityDashboardData {
  queueCases: number;
  claimedCases: number;
  utilizationPct: number;
  backlogHours: number;
  workedHours: number;
  rows: GroupCapacityRow[];
  moves: CapacityMove[];
}

export const scoreCase = (kase: ControlTowerCase): ScoreBreakdown => {
  const reasons: string[] = [];
  let score = 0;

  if (kase.urgent) {
    score += 40;
    reasons.push('+40 urgente (VIP / emergencia)');
  }

  const monitorPts = kase.monitorStatus ? MONITOR_SCORE[kase.monitorStatus] ?? 0 : 0;
  if (monitorPts > 0) {
    score += monitorPts;
    reasons.push(`+${monitorPts} monitor: ${kase.monitorLabel ?? kase.monitorStatus}`);
  }

  const agePts = Math.round(Math.min(kase.ageMinutes, 120) * 0.2);
  if (agePts > 0) {
    score += agePts;
    reasons.push(`+${agePts} antigüedad (${kase.ageLabel})`);
  }

  if (kase.inAudit) {
    score += 15;
    reasons.push('+15 Pending Audit');
  }

  if (kase.hasLowScore && !kase.surveyReviewed) {
    score += 18;
    reasons.push('+18 Low Score Survey sin revisar');
  }

  if (kase.monitorStatus === MONITOR_STATUS.MANAGED) {
    score -= 20;
    reasons.push('−20 ya gestionado (excepción de tiempo)');
  }

  score = clamp(Math.round(score), 0, 100);

  let chip = 'Seguimiento';
  if (kase.inAudit) chip = 'Revisar auditoría';
  else if (kase.hasLowScore && !kase.surveyReviewed) chip = 'Contactar por encuesta';
  else if (kase.monitorStatus === MONITOR_STATUS.NEW_MESSAGE) chip = 'Responder mensaje';
  else if (kase.monitorStatus === MONITOR_STATUS.DELAYED || kase.monitorStatus === MONITOR_STATUS.HAS_NOT_FINISHED) {
    chip = 'Avisar proveedor';
  } else if (kase.monitorStatus === MONITOR_STATUS.IS_NOT_ON_ROUTE) chip = 'Confirmar en ruta';
  else if (kase.urgent) chip = 'Priorizar ahora';

  return { score, reasons, chip };
};

export const suggestNotification = (kase: ControlTowerCase): NotificationSuggestion | null => {
  const scored = scoreCase(kase);
  const needsAttention =
    kase.urgent ||
    kase.inAudit ||
    (kase.hasLowScore && !kase.surveyReviewed) ||
    Boolean(kase.monitorStatus && ATTENTION_MONITOR_STATUSES.includes(kase.monitorStatus));

  if (!needsAttention && scored.score < 45) return null;

  const high =
    kase.inAudit ||
    (kase.hasLowScore && !kase.surveyReviewed) ||
    kase.monitorStatus === MONITOR_STATUS.HAS_NOT_FINISHED ||
    kase.monitorStatus === MONITOR_STATUS.DELAYED ||
    (kase.urgent && scored.score >= 60);

  const title = `${scored.chip} · ${kase.displayId}`;
  const text = `${title} (score ${scored.score}). ${scored.reasons.slice(0, 2).join('; ')}.`;

  return {
    caseId: kase.id,
    displayId: kase.displayId,
    score: scored.score,
    severity: high ? 'high' : 'medium',
    monitorKey: kase.monitorStatus ?? (kase.inAudit ? 'audit' : kase.hasLowScore ? 'low-score' : 'base'),
    title,
    text,
    reasons: scored.reasons,
    chip: scored.chip,
  };
};

export const topNotificationSuggestions = (cases: ControlTowerCase[], limit = 8): NotificationSuggestion[] =>
  cases
    .map(suggestNotification)
    .filter((value): value is NotificationSuggestion => value !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

/** Sugerencias IA acotadas al grupo activo (etapa/cuenta/país) y filtros del panel. */
export const notificationSuggestionsForGroup = (
  cases: ControlTowerCase[],
  group: ControlTowerGroup,
  options?: { branchFilter?: string | null; limit?: number; dismissed?: DismissedMap },
): NotificationSuggestion[] => {
  const { branchFilter = null, limit = 6, dismissed = {} } = options ?? {};
  const scoped = cases.filter((kase) => {
    if (branchFilter && kase.branch !== branchFilter) return false;
    if (!isInGroupScope(kase, group)) return false;
    if (dismissed[kase.id]) {
      const noteCount = 0;
      return shouldReappear(kase.id, kase.monitorStatus, noteCount, dismissed);
    }
    return true;
  });
  return topNotificationSuggestions(scoped, limit);
};

export const suggestionSeenKey = (
  groupId: string,
  suggestion: Pick<NotificationSuggestion, 'caseId' | 'monitorKey'>,
) => `${groupId}:${suggestion.caseId}:${suggestion.monitorKey}`;

export const formatSuggestionBatchToast = (groupLabel: string, suggestions: NotificationSuggestion[]): string => {
  if (suggestions.length === 0) return '';
  if (suggestions.length === 1) return `${groupLabel}: ${suggestions[0].title}`;
  return `${groupLabel}: ${suggestions.length} casos requieren atención · ${suggestions[0].displayId} y ${suggestions.length - 1} más`;
};

const loadOf = (claimed: number, queue: number, capacity: number) =>
  capacity > 0 ? (claimed + queue) / capacity : 0;

/** Carga objetivo: curso + cola deberían caber en la capacidad del grupo. */
export const TARGET_LOAD_RATIO = 1;
export { MAX_GROUP_CAPACITY } from './groups';

export const loadPctOf = (claimed: number, queue: number, capacity: number) =>
  Math.round(loadOf(claimed, queue, capacity) * 100);

export const recommendedCapacityDelta = (claimed: number, queue: number, capacity: number) => {
  const work = claimed + queue;
  const targetCapacity = Math.max(capacity, Math.ceil(work / TARGET_LOAD_RATIO));
  const needed = Math.max(0, targetCapacity - capacity);
  const room = Math.max(0, MAX_GROUP_CAPACITY - capacity);
  const delta = Math.min(needed, room);
  return { needed, delta, room, targetCapacity, atCap: needed > 0 && room === 0 };
};

const spareGiveaway = (claimed: number, queue: number, capacity: number) => {
  const work = claimed + queue;
  const keepForLoad = Math.ceil(work / 0.8);
  return Math.max(0, Math.min(capacity - 1, capacity - keepForLoad));
};

export const suggestCapacityMoves = (input: {
  groups: ControlTowerGroup[];
  cases: ControlTowerCase[];
  ownership: Record<string, string>;
  dismissed: DismissedMap;
  branchFilter?: string | null;
}): CapacityMove[] => {
  const etapa = input.groups.filter((group) => group.type === 'etapa');
  const snapshots = etapa.map((group) => {
    const view = buildQueueView({
      cases: input.cases,
      group,
      ownership: input.ownership,
      dismissed: input.dismissed,
      showAll: true,
      branchFilter: input.branchFilter,
    });
    const loadRatio = loadOf(view.claimedCount, view.queue.length, view.capacity);
    return { group, view, loadRatio };
  });

  const overloaded = snapshots.filter((row) => row.loadRatio >= 1).sort((a, b) => b.loadRatio - a.loadRatio);
  const slack = snapshots.filter((row) => row.loadRatio < 0.45 && row.view.capacity > 1).sort((a, b) => a.loadRatio - b.loadRatio);

  const moves: CapacityMove[] = [];

  overloaded.forEach((hot, index) => {
    const spare = slack[index];
    const claimed = hot.view.claimedCount;
    const queue = hot.view.queue.length;
    const capacity = hot.view.capacity;
    const rec = recommendedCapacityDelta(claimed, queue, capacity);
    const hotPct = loadPctOf(claimed, queue, capacity);
    const remainingAfterMax = Math.max(0, claimed + queue - MAX_GROUP_CAPACITY);

    if (spare) {
      const give = Math.min(rec.needed || 1, spareGiveaway(spare.view.claimedCount, spare.view.queue.length, spare.view.capacity));
      if (give > 0) {
        const toCapacity = capacity + give;
        moves.push({
          id: `${hot.group.id}->${spare.group.id}`,
          kind: 'rebalance',
          overloadedGroupId: hot.group.id,
          overloadedLabel: hot.group.label,
          slackGroupId: spare.group.id,
          slackLabel: spare.group.label,
          overloadedDelta: give,
          slackDelta: -give,
          maxOverloadDelta: give,
          fromCapacity: capacity,
          toCapacity,
          loadPct: hotPct,
          projectedLoadPct: loadPctOf(claimed, queue, toCapacity),
          remainingQueue: Math.max(0, claimed + queue - toCapacity),
          claimed,
          queue,
          summary: `${hot.group.label} al ${hotPct}% y ${spare.group.label} con holgura: mover ${give} slot${give === 1 ? '' : 's'} de capacidad.`,
          reasons: [
            `${hot.group.label}: ${claimed} en curso + ${queue} en cola / cap ${capacity}`,
            `${spare.group.label}: ${spare.view.claimedCount} en curso + ${spare.view.queue.length} en cola / cap ${spare.view.capacity}`,
          ],
        });
        return;
      }
    }

    if (rec.atCap) {
      moves.push({
        id: `${hot.group.id}-staff`,
        kind: 'staff',
        overloadedGroupId: hot.group.id,
        overloadedLabel: hot.group.label,
        overloadedDelta: 0,
        maxOverloadDelta: 0,
        fromCapacity: capacity,
        toCapacity: capacity,
        loadPct: hotPct,
        projectedLoadPct: hotPct,
        remainingQueue: remainingAfterMax,
        claimed,
        queue,
        summary: `${hot.group.label} al ${hotPct}%: el tope de ${MAX_GROUP_CAPACITY} casos simultáneos ya no da más. Hace falta otro agente, no inflar a uno solo.`,
        reasons: [
          `${claimed} en curso + ${queue} en cola / cap ${capacity}`,
          remainingAfterMax > 0 ? `Aun al tope quedarían ~${remainingAfterMax} casos fuera` : 'Sin holgura para más slots',
        ],
      });
      return;
    }

    if (rec.delta === 0) return;

    const toCapacity = capacity + rec.delta;
    moves.push({
      id: `${hot.group.id}-plus`,
      kind: 'boost',
      overloadedGroupId: hot.group.id,
      overloadedLabel: hot.group.label,
      overloadedDelta: rec.delta,
      maxOverloadDelta: rec.delta,
      fromCapacity: capacity,
      toCapacity,
      loadPct: hotPct,
      projectedLoadPct: loadPctOf(claimed, queue, toCapacity),
      remainingQueue: Math.max(0, claimed + queue - toCapacity),
      claimed,
      queue,
      summary: `${hot.group.label} al ${hotPct}%: subir capacidad +${rec.delta} (de ${capacity} a ${toCapacity}).`,
      reasons: [
        `${claimed} en curso + ${queue} en cola / cap ${capacity}`,
        rec.needed > rec.delta
          ? `Para absorber toda la cola harían falta +${rec.needed}; el tope por agente es ${MAX_GROUP_CAPACITY}`
          : `Con +${rec.delta} la carga baja a ~${loadPctOf(claimed, queue, toCapacity)}%`,
      ],
    });
  });

  return moves.slice(0, 3);
};

export const hoursFromWorkLog = (log: WorkLogEntry[], now = Date.now()): number => {
  const ms = log.reduce((sum, entry) => {
    const end = entry.endedAt ?? now;
    return sum + Math.max(0, end - entry.claimedAt);
  }, 0);
  return Math.round((ms / 3_600_000) * 10) / 10;
};

export const buildCapacityDashboard = (input: {
  groups: ControlTowerGroup[];
  cases: ControlTowerCase[];
  ownership: Record<string, string>;
  dismissed: DismissedMap;
  workLog: WorkLogEntry[];
  branchFilter?: string | null;
}): CapacityDashboardData => {
  const etapa = input.groups.filter((group) => group.type === 'etapa');
  const moves = suggestCapacityMoves(input);
  const moveByGroup = new Map(moves.map((move) => [move.overloadedGroupId, move.summary]));

  const rows: GroupCapacityRow[] = etapa.map((group) => {
    const view = buildQueueView({
      cases: input.cases,
      group,
      ownership: input.ownership,
      dismissed: input.dismissed,
      showAll: true,
      branchFilter: input.branchFilter,
    });
    const loadRatio = loadOf(view.claimedCount, view.queue.length, view.capacity);
    const backlogHours = Math.round((view.queue.reduce((sum, kase) => sum + kase.ageMinutes, 0) / 60) * 10) / 10;
    return {
      groupId: group.id,
      label: group.label,
      capacity: view.capacity,
      claimed: view.claimedCount,
      queue: view.queue.length,
      utilizationPct: view.capacityPct,
      loadRatio,
      backlogHours,
      suggestion: moveByGroup.get(group.id),
    };
  });

  const queueCases = rows.reduce((sum, row) => sum + row.queue, 0);
  const claimedCases = rows.reduce((sum, row) => sum + row.claimed, 0);
  const totalCapacity = rows.reduce((sum, row) => sum + row.capacity, 0);
  const backlogHours = Math.round((input.cases.reduce((sum, kase) => sum + kase.ageMinutes, 0) / 60) * 10) / 10;
  const utilizationPct =
    totalCapacity > 0 ? Math.min(100, Math.round((claimedCases / totalCapacity) * 100)) : 0;

  return {
    queueCases,
    claimedCases,
    utilizationPct,
    backlogHours,
    workedHours: hoursFromWorkLog(input.workLog),
    rows,
    moves,
  };
};
