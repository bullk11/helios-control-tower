/**
 * Overrides de capacidad y log de claim/release para métricas de horas (demo local).
 */

import { MAX_GROUP_CAPACITY, type ControlTowerGroup } from './domain/groups';

const CAPACITY_KEY = 'control-tower:capacity-overrides';
const WORK_KEY = 'control-tower:work-log';
const IA_SEEN_KEY = 'control-tower:ia-seen';

export type CapacityOverrides = Record<string, number>;

export interface WorkLogEntry {
  caseId: string;
  groupId: string;
  claimedAt: number;
  endedAt?: number;
  endKind?: 'release' | 'dismiss';
}

const readJson = <T>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // demo sigue en memoria
  }
};

export const readCapacityOverrides = (): CapacityOverrides => readJson(CAPACITY_KEY, {});

export const writeCapacityOverrides = (map: CapacityOverrides): void => writeJson(CAPACITY_KEY, map);

export const clearCapacityOverrides = (): CapacityOverrides => {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(CAPACITY_KEY);
    } catch {
      // ignore
    }
  }
  return {};
};

export const baseCapacityOf = (groups: ControlTowerGroup[], groupId: string): number =>
  groups.find((group) => group.id === groupId)?.capacity ?? 1;

export const effectiveCapacityOf = (
  overrides: CapacityOverrides,
  groups: ControlTowerGroup[],
  groupId: string,
): number => {
  const override = overrides[groupId];
  if (typeof override === 'number' && Number.isFinite(override)) {
    return Math.max(1, Math.min(MAX_GROUP_CAPACITY, Math.round(override)));
  }
  return baseCapacityOf(groups, groupId);
};

export const setGroupCapacity = (
  overrides: CapacityOverrides,
  groups: ControlTowerGroup[],
  groupId: string,
  capacity: number,
): CapacityOverrides => {
  const base = baseCapacityOf(groups, groupId);
  const clamped = Math.max(1, Math.min(MAX_GROUP_CAPACITY, Math.round(capacity)));
  const next = { ...overrides };
  if (clamped === base) delete next[groupId];
  else next[groupId] = clamped;
  return next;
};

export const hasCapacityOverrides = (overrides: CapacityOverrides): boolean => Object.keys(overrides).length > 0;

export const applyCapacityOverrides = (
  groups: ControlTowerGroup[],
  overrides: CapacityOverrides,
): ControlTowerGroup[] =>
  groups.map((group) => {
    const next = overrides[group.id];
    if (typeof next !== 'number' || !Number.isFinite(next) || next < 1) return group;
    return { ...group, capacity: Math.max(1, Math.min(MAX_GROUP_CAPACITY, Math.round(next))) };
  });

export const readWorkLog = (): WorkLogEntry[] => readJson(WORK_KEY, []);

export const writeWorkLog = (log: WorkLogEntry[]): void => writeJson(WORK_KEY, log);

export const recordClaim = (log: WorkLogEntry[], caseId: string, groupId: string): WorkLogEntry[] => {
  const withoutOpen = log.filter((entry) => !(entry.caseId === caseId && !entry.endedAt));
  return [...withoutOpen, { caseId, groupId, claimedAt: Date.now() }];
};

export const recordWorkEnd = (log: WorkLogEntry[], caseId: string, endKind: 'release' | 'dismiss'): WorkLogEntry[] =>
  log.map((entry) =>
    entry.caseId === caseId && !entry.endedAt ? { ...entry, endedAt: Date.now(), endKind } : entry,
  );

export const readSeenSuggestionKeys = (): string[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(IA_SEEN_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

export const applyCapacityMove = (
  overrides: CapacityOverrides,
  groups: ControlTowerGroup[],
  overloadedGroupId: string,
  overloadedDelta: number,
  slackGroupId?: string,
  slackDelta?: number,
): CapacityOverrides => {
  const currentOf = (groupId: string) => {
    if (typeof overrides[groupId] === 'number') return overrides[groupId];
    return groups.find((group) => group.id === groupId)?.capacity ?? 1;
  };

  const next: CapacityOverrides = { ...overrides };
  next[overloadedGroupId] = Math.max(1, Math.min(MAX_GROUP_CAPACITY, currentOf(overloadedGroupId) + overloadedDelta));
  if (slackGroupId && slackDelta) {
    next[slackGroupId] = Math.max(1, Math.min(MAX_GROUP_CAPACITY, currentOf(slackGroupId) + slackDelta));
  }
  return next;
};

export const writeSeenSuggestionKeys = (keys: string[]): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(IA_SEEN_KEY, JSON.stringify(keys.slice(-80)));
  } catch {
    // ignore
  }
};
