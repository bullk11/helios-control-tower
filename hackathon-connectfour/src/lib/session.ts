/**
 * Rol de ingreso al prototipo (demo local, sin auth real).
 * En producto esto vendría de Cognito / permisos de Helios.
 */

export type WorkspaceRole = 'agent' | 'supervisor';

export interface WorkspaceSupervisor {
  id: string;
  name: string;
  email: string;
}

export const DEFAULT_SUPERVISOR: WorkspaceSupervisor = {
  id: 'eduardo-mora',
  name: 'Eduardo Mora',
  email: 'eduardo.mora@connect.inc',
};

export const SUPERVISORS: WorkspaceSupervisor[] = [DEFAULT_SUPERVISOR];

const ROLE_KEY = 'ct_workspace_role';
const SUPERVISOR_KEY = 'ct_supervisor_id';

const isBrowser = () => typeof window !== 'undefined';

export const readWorkspaceRole = (): WorkspaceRole | null => {
  if (!isBrowser()) return null;
  const value = localStorage.getItem(ROLE_KEY);
  return value === 'agent' || value === 'supervisor' ? value : null;
};

export const writeWorkspaceRole = (role: WorkspaceRole): void => {
  if (!isBrowser()) return;
  localStorage.setItem(ROLE_KEY, role);
};

export const readSupervisorId = (): string => {
  if (!isBrowser()) return DEFAULT_SUPERVISOR.id;
  return localStorage.getItem(SUPERVISOR_KEY) ?? DEFAULT_SUPERVISOR.id;
};

export const writeSupervisorId = (supervisorId: string): void => {
  if (!isBrowser()) return;
  localStorage.setItem(SUPERVISOR_KEY, supervisorId);
};

export const findSupervisor = (supervisorId: string): WorkspaceSupervisor =>
  SUPERVISORS.find((item) => item.id === supervisorId) ?? DEFAULT_SUPERVISOR;
