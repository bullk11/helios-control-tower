'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { HeliosNavbar } from '@/components/HeliosNavbar';
import { PoLinkedText } from '@/components/PoLinkedText';
import { PauseModal, type OperatorAvailability } from '@/components/PauseModal';
import { Alert, Badge, Button, Card, EmptyState, SectionTitle, Select, StatCard, TextInput, ToastContainer, type ToastItem, type ToastType } from '@/components/ui';
import { BRANCHES, config } from '@/lib/config';
import { CaseDetailModal } from '@/modules/control-tower/components/CaseDetailModal';
import { CaseScoreLegend } from '@/modules/control-tower/components/CaseScoreLegend';
import { IncomingCallModal } from '@/modules/control-tower/components/IncomingCallModal';
import { describeError } from '@/modules/control-tower/data-source';
import { buildHeliosServiceUrl } from '@/modules/helios/incoming-calls.api';
import { createServiceLog } from '@/modules/helios/logs.api';
import {
  QUEUE_VIEW_CAP,
  TRACK_LABEL,
  describeGroupScope,
  groupsOfType,
  type GroupType,
} from '@/modules/control-tower/domain/groups';
import { buildQueueView, nextOwnerGroup } from '@/modules/control-tower/domain/queue';
import { GROUPS } from '@/modules/control-tower/domain/groups';
import { STAGE_NAMES } from '@/modules/control-tower/domain/stages';
import type { ControlTowerCase } from '@/modules/control-tower/domain/case';
import {
  formatSuggestionBatchToast,
  notificationSuggestionsForGroup,
  scoreCase,
  suggestionSeenKey,
} from '@/modules/control-tower/domain/intelligence';
import { useCasesQuery } from '@/modules/control-tower/hooks';
import {
  applyCapacityOverrides,
  readCapacityOverrides,
  readSeenSuggestionKeys,
  readWorkLog,
  recordClaim,
  recordWorkEnd,
  writeSeenSuggestionKeys,
  writeWorkLog,
  type CapacityOverrides,
  type WorkLogEntry,
} from '@/modules/control-tower/capacity-store';
import {
  claimCase,
  dismissCase,
  readDismissed,
  readOwnership,
  releaseCase,
  undismissCase,
  writeDismissed,
  writeOwnership,
  type DismissedMap,
  type OwnershipMap,
} from '@/modules/control-tower/ownership';

interface Notification {
  id: number;
  kind: string;
  text: string;
  time: string;
  caseId?: string;
}

let notificationSeq = 1;
const OPERATOR_INACTIVE_KEY = 'control-tower:operator-inactive';

export default function ControlTowerPage() {
  // --- filtros y contexto de trabajo ---
  const groupBy: GroupType = 'etapa';
  const [activeGroupId, setActiveGroupId] = useState('torre-control');
  const [branchFilter, setBranchFilter] = useState<string>('__all__');
  const [division, setDivision] = useState<string>(config.defaultDivision);
  const [showAllQueue, setShowAllQueue] = useState(false);
  const [poFilter, setPoFilter] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [isPaused, setIsPaused] = useState(false);
  const [isInactive, setIsInactive] = useState(false);
  const [pauseEndTime, setPauseEndTime] = useState<number | null>(null);
  const [pauseTimeRemaining, setPauseTimeRemaining] = useState<string>('');
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [capacityOverrides, setCapacityOverrides] = useState<CapacityOverrides>({});
  const [workLog, setWorkLog] = useState<WorkLogEntry[]>([]);
  const iaSeenRef = useRef<Set<string>>(new Set());

  // --- estado local del prototipo ---
  const [ownership, setOwnership] = useState<OwnershipMap>({});
  const [dismissed, setDismissed] = useState<DismissedMap>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadSuggestions, setUnreadSuggestions] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [suggestionsPanelOpen, setSuggestionsPanelOpen] = useState(false);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    setOwnership(readOwnership());
    setDismissed(readDismissed());
    setCapacityOverrides(readCapacityOverrides());
    setWorkLog(readWorkLog());
    iaSeenRef.current = new Set(readSeenSuggestionKeys());
    setIsInactive(localStorage.getItem(OPERATOR_INACTIVE_KEY) === 'true');
  }, []);

  // Manejar el countdown de la pausa
  useEffect(() => {
    if (!isPaused || !pauseEndTime) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const remaining = pauseEndTime - now;

      if (remaining <= 0) {
        setIsPaused(false);
        setPauseEndTime(null);
        setPauseTimeRemaining('');
        notify('Pausa finalizada. Vuelves a recibir casos en tu cola.', 'Pausa');
      } else {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setPauseTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, pauseEndTime]);

  let toastSeq = 0;
  const showToast = (message: string, type: ToastType = 'success') => {
    const id = ++toastSeq + Date.now();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  };

  const dismissToast = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const branchForQuery = branchFilter === '__all__' ? null : branchFilter;
  const casesQuery = useCasesQuery({ branch: branchForQuery, division });

  const groupsEffective = useMemo(
    () => applyCapacityOverrides(GROUPS, capacityOverrides),
    [capacityOverrides],
  );
  const group = groupsEffective.find((item) => item.id === activeGroupId) ?? groupsEffective[0];
  const cases = casesQuery.data?.cases ?? [];

  const view = useMemo(
    () =>
      buildQueueView({
        cases,
        group,
        ownership,
        dismissed,
        showAll: showAllQueue,
        branchFilter: branchForQuery,
      }),
    [cases, group, ownership, dismissed, showAllQueue, branchForQuery],
  );

  const groupSuggestions = useMemo(
    () =>
      notificationSuggestionsForGroup(cases, group, {
        branchFilter: branchForQuery,
        limit: 6,
        dismissed,
      }),
    [cases, group, branchForQuery, dismissed],
  );

  // Filtrar por PO
  const filteredQueue = useMemo(() => {
    if (!poFilter.trim()) return view.visible;
    const searchTerm = poFilter.trim().toLowerCase();
    return view.visible.filter((kase) => kase.displayId.toLowerCase().includes(searchTerm));
  }, [view.visible, poFilter]);

  const isUnavailable = isPaused || isInactive;

  // Si está pausado, no mostrar casos en la cola (solo los que ya están tomados)
  const displayQueue = isUnavailable ? [] : filteredQueue;

  // Paginación
  const totalPages = Math.ceil(displayQueue.length / itemsPerPage);
  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = startIdx + itemsPerPage;
  const paginatedQueue = displayQueue.slice(startIdx, endIdx);

  // Resetear página cuando cambia el filtro
  useEffect(() => {
    setCurrentPage(1);
  }, [poFilter, activeGroupId, branchFilter, division]);

  const notify = (
    text: string,
    kind = 'Gestión',
    opts: { withToast?: boolean; caseId?: string; toastType?: ToastType } = {},
  ) => {
    const { withToast = true, caseId, toastType = 'success' } = opts;
    const entry: Notification = { id: notificationSeq++, kind, text, time: 'ahora', caseId };
    setNotifications((prev) => [entry, ...prev].slice(0, 40));
    setUnreadNotifications((prev) => prev + 1);
    if (withToast) showToast(text, toastType);
  };

  useEffect(() => {
    if (!cases.length) return;

    const fresh = groupSuggestions.filter(
      (suggestion) => !iaSeenRef.current.has(suggestionSeenKey(group.id, suggestion)),
    );
    if (!fresh.length) return;

    fresh.forEach((suggestion) => iaSeenRef.current.add(suggestionSeenKey(group.id, suggestion)));
    writeSeenSuggestionKeys([...iaSeenRef.current]);

    const batchText = formatSuggestionBatchToast(group.label, fresh);
    if (batchText) {
      showToast(batchText, fresh.some((item) => item.severity === 'high') ? 'error' : 'info');
      setUnreadSuggestions((count) => count + fresh.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, activeGroupId, branchForQuery, groupSuggestions, group.id, group.label]);

  const persistOwnership = (next: OwnershipMap) => {
    setOwnership(next);
    writeOwnership(next);
  };

  const persistDismissed = (next: DismissedMap) => {
    setDismissed(next);
    writeDismissed(next);
  };

  const handleDismiss = async (kase: ControlTowerCase) => {
    const next = dismissCase(dismissed, kase.id, {
      monitorStatus: kase.monitorStatus,
      noteCount: 0,
      dismissedAt: Date.now(),
    });
    persistDismissed(next);
    if (ownership[kase.id]) persistOwnership(releaseCase(ownership, kase.id));
    const nextLog = recordWorkEnd(workLog, kase.id, 'dismiss');
    setWorkLog(nextLog);
    writeWorkLog(nextLog);
    
    // Registrar log en Service Logs
    try {
      await createServiceLog(kase.id, `[Control Tower] Caso resuelto por el agente`);
    } catch (error) {
      console.error('Error al crear log:', error);
    }
    
    notify(`Caso ${kase.displayId} resuelto. Reaparecerá si hay novedades.`);
  };

  const handleClaim = async (kase: ControlTowerCase) => {
    if (isUnavailable) {
      notify(
        isInactive
          ? 'No puedes tomar casos mientras estás inactivo. Reactiva tu jornada primero.'
          : 'No puedes tomar casos mientras estás en pausa. Reactiva tu cola primero.',
        isInactive ? 'Operador inactivo' : 'Pausa activa',
      );
      return;
    }
    if (view.atCapacity) {
      notify(
        `Capacidad máxima alcanzada para ${group.label} (${view.claimedCount}/${group.capacity}). Suelta un caso antes de tomar otro.`,
        'Capacidad',
      );
      return;
    }
    persistOwnership(claimCase(ownership, kase.id, group.id));
    const nextLog = recordClaim(workLog, kase.id, group.id);
    setWorkLog(nextLog);
    writeWorkLog(nextLog);
    
    // Registrar log en Service Logs
    try {
      await createServiceLog(kase.id, `[Control Tower] Caso tomado por el agente (${group.label})`);
    } catch (error) {
      console.error('Error al crear log:', error);
    }
    
    notify(`Tomaste el caso ${kase.displayId}.`);
  };

  const handleRelease = async (kase: ControlTowerCase) => {
    persistOwnership(releaseCase(ownership, kase.id));
    const nextLog = recordWorkEnd(workLog, kase.id, 'release');
    setWorkLog(nextLog);
    writeWorkLog(nextLog);
    
    // Registrar log en Service Logs
    try {
      await createServiceLog(kase.id, `[Control Tower] Caso soltado por el agente`);
    } catch (error) {
      console.error('Error al crear log:', error);
    }
    
    const next = nextOwnerGroup(kase, groupsEffective, { groupType: groupBy });
    const nextStage = kase.stageIdx === null ? null : ((kase.stageIdx + 1) as 0 | 1 | 2 | 3);
    const leavesCurrentGroup = nextStage !== null && !group.stages.includes(nextStage);

    notify(
      next && leavesCurrentGroup
        ? `${kase.displayId} soltado. Si avanza de etapa, irá a ${next.label}.`
        : `${kase.displayId} soltado y devuelto a la cola de ${group.label}.`,
    );
  };

  const handleTogglePause = () => {
    if (isUnavailable) {
      // Reactivar
      setIsPaused(false);
      setIsInactive(false);
      setPauseEndTime(null);
      setPauseTimeRemaining('');
      localStorage.removeItem(OPERATOR_INACTIVE_KEY);
      notify('Operador activo. Vuelves a recibir casos.', 'Disponibilidad');
    } else {
      // Mostrar modal para configurar disponibilidad
      setShowPauseModal(true);
    }
  };

  const handleConfirmAvailability = (availability: OperatorAvailability, minutes?: number) => {
    if (availability === 'active') {
      setIsPaused(false);
      setIsInactive(false);
      setPauseEndTime(null);
      setPauseTimeRemaining('');
      localStorage.removeItem(OPERATOR_INACTIVE_KEY);
      notify('Operador activo. Vuelves a recibir casos.', 'Disponibilidad');
      return;
    }

    if (availability === 'inactive') {
      setIsPaused(false);
      setIsInactive(true);
      setPauseEndTime(null);
      setPauseTimeRemaining('');
      localStorage.setItem(OPERATOR_INACTIVE_KEY, 'true');
      notify('Jornada finalizada. No recibirás nuevos casos hasta reactivarte.', 'Disponibilidad');
      return;
    }

    const pauseMinutes = minutes ?? 10;
    const endTime = Date.now() + pauseMinutes * 60000;
    const remaining = endTime - Date.now();
    const remainingMinutes = Math.floor(remaining / 60000);
    const remainingSeconds = Math.floor((remaining % 60000) / 1000);
    setIsPaused(true);
    setIsInactive(false);
    localStorage.removeItem(OPERATOR_INACTIVE_KEY);
    setPauseEndTime(endTime);
    setPauseTimeRemaining(`${remainingMinutes}:${remainingSeconds.toString().padStart(2, '0')}`);
    notify(`Cola pausada por ${pauseMinutes} minutos. No recibirás nuevos casos hasta que termine la pausa.`, 'Pausa');
  };

  const openCase = openCaseId ? cases.find((kase) => kase.id === openCaseId) ?? null : null;
  const attentionCount = cases.filter((kase) => kase.monitorStatus && kase.monitorStatus !== 'onTime').length;
  const panelSummary = `${notifications.length} evento${notifications.length === 1 ? '' : 's'} recientes`;
  const suggestionsSummary = `${group.label} · ${groupSuggestions.length} sugerencia${groupSuggestions.length === 1 ? '' : 's'}`;

  return (
    <div className="min-h-screen">
      <HeliosNavbar
        activeSection="control-tower"
        totalCases={cases.length}
        branchLabel={branchFilter === '__all__' ? 'Todos los países' : branchFilter}
        divisionLabel={division === 'all' ? 'Todas las divisiones' : TRACK_LABEL[division] ?? division}
        unreadNotifications={unreadNotifications}
        onToggleNotifications={() => {
          setSuggestionsPanelOpen(false);
          setPanelOpen((prev) => !prev);
          setUnreadNotifications(0);
        }}
        unreadSuggestions={unreadSuggestions}
        onToggleSuggestions={() => {
          setPanelOpen(false);
          setSuggestionsPanelOpen((prev) => !prev);
          setUnreadSuggestions(0);
        }}
        isPaused={isUnavailable}
        isInactive={isInactive}
        onTogglePause={handleTogglePause}
        pauseTimeRemaining={pauseTimeRemaining}
      />

      {/* ---- panel de notificaciones operativas ---- */}
      {panelOpen ? (
        <aside className="fixed right-0 top-0 z-[90] flex h-full w-[380px] flex-col bg-white shadow-lg">
          <div className="flex items-start justify-between bg-connect-azul px-5 py-[18px] text-white">
            <div>
              <div className="text-[16px] font-extrabold">NOTIFICACIONES</div>
              <div className="mt-1 text-[11.5px] text-azul-100">{panelSummary}</div>
            </div>
            <button
              type="button"
              aria-label="Cerrar notificaciones"
              onClick={() => setPanelOpen(false)}
              className="rounded-md border border-white/40 px-2 py-1 text-[13px] leading-none"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {notifications.length === 0 ? (
              <div className="text-[12.5px] text-text-muted">
                Sin actividad reciente. Aquí verás pausas, casos tomados y otros eventos del operador.
              </div>
            ) : (
              notifications.map((entry) => (
                <div key={entry.id} className="border-b border-gris-200 py-[10px]">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Badge tone="navy">{entry.kind}</Badge>
                    <span className="text-[10.5px] text-text-muted">{entry.time}</span>
                  </div>
                  <div className="text-[12px] leading-snug text-text-body">
                    <PoLinkedText text={entry.text} />
                  </div>
                </div>
              ))
            )}
            {notifications.length > 0 ? (
              <div className="mt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  full
                  onClick={() => {
                    setNotifications([]);
                    setUnreadNotifications(0);
                  }}
                >
                  Limpiar actividad
                </Button>
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}

      {/* ---- panel de sugerencias IA ---- */}
      {suggestionsPanelOpen ? (
        <aside className="fixed right-0 top-0 z-[90] flex h-full w-[380px] flex-col bg-white shadow-lg">
          <div className="flex items-start justify-between bg-connect-naranja px-5 py-[18px] text-white">
            <div>
              <div className="text-[16px] font-extrabold">SUGERENCIAS IA</div>
              <div className="mt-1 text-[11.5px] text-white/80">{suggestionsSummary}</div>
            </div>
            <button
              type="button"
              aria-label="Cerrar sugerencias"
              onClick={() => setSuggestionsPanelOpen(false)}
              className="rounded-md border border-white/40 px-2 py-1 text-[13px] leading-none"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <p className="mb-4 text-[11.5px] text-text-muted">
              Priorizadas para <strong>{group.label}</strong> según score, monitor y antigüedad. Cambiá de grupo para
              ver otras colas.
            </p>
            {groupSuggestions.length === 0 ? (
              <div className="text-[12.5px] text-text-muted">
                Sin sugerencias IA para este grupo con los filtros actuales.
              </div>
            ) : (
              groupSuggestions.map((suggestion) => {
                const linkedCase = cases.find((kase) => kase.id === suggestion.caseId) ?? null;
                const ownedBy = ownership[suggestion.caseId];
                const canAssign = linkedCase && !ownedBy && !isUnavailable && !view.atCapacity;

                return (
                  <div key={suggestion.caseId} className="mb-3 border-b border-gris-200 pb-3 last:mb-0 last:border-0 last:pb-0">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <Badge tone="orangeSoft">IA</Badge>
                      <span className="text-[10.5px] text-text-muted">score {suggestion.score}</span>
                    </div>
                    <div className="text-[12px] leading-snug text-text-body">{suggestion.text}</div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      disabled={!canAssign}
                      onClick={() => {
                        if (linkedCase) void handleClaim(linkedCase);
                      }}
                    >
                      {ownedBy
                        ? ownedBy === group.id
                          ? 'En curso'
                          : 'Ya asignado'
                        : isUnavailable
                          ? isInactive
                            ? 'Operador inactivo'
                            : 'Cola pausada'
                          : view.atCapacity
                            ? 'Capacidad llena'
                            : linkedCase
                              ? 'Asignar caso'
                              : 'Caso no disponible'}
                    </Button>
                  </div>
                );
              })
            )}
            {groupSuggestions.length > 0 ? (
              <div className="mt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  full
                  onClick={() => {
                    groupSuggestions.forEach((suggestion) =>
                      iaSeenRef.current.add(suggestionSeenKey(group.id, suggestion)),
                    );
                    writeSeenSuggestionKeys([...iaSeenRef.current]);
                    setUnreadSuggestions(0);
                  }}
                >
                  Marcar como visto
                </Button>
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}

      <main className="mx-auto max-w-[1500px] px-6 pb-20 pt-7 lg:px-10">
        <header className="mb-5">
          <h1 className="m-0 text-[28px] font-extrabold uppercase text-text-strong">Control Tower</h1>
          <p className="mt-2 max-w-[760px] text-[14px] text-text-muted">
            Cola de trabajo por grupo sobre servicios reales de Helios. El alcance arranca después del
            despacho: un servicio entra cuando el proveedor ya lo aceptó (<code>trip.status = accepted</code>) y
            sale cuando cierra limpio o cae en auditoría.
          </p>
        </header>

        {/* ---- controles ---- */}
        <Card surface="gray" className="mb-6 p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Select
                label="Estás trabajando como"
                value={activeGroupId}
                options={groupsOfType(groupBy).map((item) => ({ value: item.id, label: item.label }))}
                onChange={(value) => {
                  setActiveGroupId(value);
                  setShowAllQueue(false);
                }}
              />
              <p className="mt-2 text-[11.5px] leading-snug text-text-muted">
                {describeGroupScope(group, STAGE_NAMES)}
              </p>
            </div>
            <Select
              label="País (branch)"
              value={branchFilter}
              options={[
                { value: '__all__', label: 'Todos los países' },
                ...BRANCHES.map((branch) => ({ value: branch, label: branch })),
              ]}
              onChange={setBranchFilter}
            />
            <Select
              label="División (track)"
              value={division}
              options={[
                { value: 'all', label: 'Todas' },
                { value: 'road', label: 'Road' },
                { value: 'home', label: 'Home' },
                { value: 'concierge', label: 'Concierge' },
              ]}
              onChange={setDivision}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gris-200 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCallId('a5ef555109eb10c3eec5ca89fd0f0533');
                notify('Llamada entrante de Audara.', 'Llamada entrante');
              }}
            >
              Simular llamada entrante (Audara)
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void casesQuery.refetch()}>
              Refrescar cola
            </Button>
            {casesQuery.isFetching ? (
              <span className="text-[11px] text-text-muted">consultando…</span>
            ) : null}
          </div>
        </Card>

        {/* ---- stats ---- */}
        <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="En cola para tu grupo" value={String(view.queue.length)} sub="sin tomar" />
          <StatCard
            label="Tu capacidad"
            value={`${view.claimedCount} / ${view.capacity}`}
            sub="casos activos / máximo simultáneo"
            surface="navy"
          >
            <div className="mt-3 h-2 overflow-hidden rounded bg-white/20">
              <div
                className="h-full rounded"
                style={{
                  width: `${view.capacityPct}%`,
                  background:
                    view.capacityPct >= 100 ? '#F15B2B' : view.capacityPct >= 70 ? '#D9A31C' : '#8FD9B6',
                }}
              />
            </div>
          </StatCard>
          <StatCard
            label="Visible ahora mismo"
            value={`${view.visible.length} de ${view.queue.length}`}
            sub={`límite de vista: ${QUEUE_VIEW_CAP} a la vez`}
          />
          <StatCard label="Marcados por el sistema" value={String(attentionCount)} sub="monitor.status ≠ onTime">
            <div className="mt-2 flex flex-wrap gap-[6px]">
              {group.tracks.map((track) => (
                <Badge key={track} tone={track === 'road' ? 'orangeSoft' : track === 'home' ? 'navy' : 'success'}>
                  {TRACK_LABEL[track] ?? track}
                </Badge>
              ))}
            </div>
          </StatCard>
        </div>

        {/* ---- errores / estado de conexión ---- */}
        {casesQuery.isError ? (
          <div className="mb-6">
            <Alert tone="error">{describeError(casesQuery.error)}</Alert>
          </div>
        ) : null}

        {isUnavailable ? (
          <div className="mb-6">
            <Alert tone="warn">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <strong>{isInactive ? 'Operador inactivo' : 'Cola pausada'}</strong> - No estás recibiendo
                  nuevos casos. {!isInactive && pauseTimeRemaining && `Tiempo restante: ${pauseTimeRemaining}.`}
                </div>
                <Button variant="outline" size="sm" onClick={handleTogglePause}>
                  {isInactive ? 'Iniciar jornada' : 'Reactivar ahora'}
                </Button>
              </div>
            </Alert>
          </div>
        ) : null}

        {casesQuery.data && casesQuery.data.outOfScopeCount > 0 ? (
          <div className="mb-6">
            <Alert>
              {casesQuery.data.outOfScopeCount} servicio(s) quedaron fuera del alcance del Control Tower
              (típicamente <code>trip.status = new</code>: todavía los maneja Dispatch).
            </Alert>
          </div>
        ) : null}

        {/* ---- board ---- */}
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          {/* cola */}
          <section>
            <SectionTitle
              right={
                view.hasMoreThanCap ? (
                  <Button variant="ghost" size="sm" onClick={() => setShowAllQueue((prev) => !prev)}>
                    {showAllQueue ? `Mostrar solo ${QUEUE_VIEW_CAP}` : `Ver todos (${view.queue.length})`}
                  </Button>
                ) : undefined
              }
            >
              Cola de tu grupo ({view.queue.length})
            </SectionTitle>

            {/* Filtro por número de PO */}
            <div className="mb-3">
              <TextInput
                placeholder="Buscar por número de PO..."
                value={poFilter}
                onChange={setPoFilter}
              />
              {poFilter && (
                <div className="mt-1 text-[11px] text-text-muted">
                  {filteredQueue.length} resultado(s) de {view.visible.length} casos
                </div>
              )}
            </div>

            <p className="mb-3 text-[11.5px] text-text-muted">
              {showAllQueue
                ? `Mostrando la cola completa de tu grupo (${view.queue.length}).`
                : `Tu vista muestra un máximo de ${QUEUE_VIEW_CAP} casos a la vez, priorizando urgentes, lo que el sistema marcó y lo más antiguo.`}
            </p>

            {casesQuery.isLoading ? (
              <EmptyState>Cargando servicios…</EmptyState>
            ) : isUnavailable ? (
              <EmptyState>
                <div className="text-estado-info">
                  {isInactive ? '○ Operador inactivo' : '⏸ Cola pausada'}
                  <div className="mt-2 text-text-muted">
                    No recibirás nuevos casos hasta que vuelvas a estar activo.
                  </div>
                </div>
              </EmptyState>
            ) : filteredQueue.length === 0 && poFilter ? (
              <EmptyState>No se encontraron casos que coincidan con "{poFilter}"</EmptyState>
            ) : view.visible.length === 0 ? (
              <EmptyState>Sin casos en cola para tu grupo ahora mismo.</EmptyState>
            ) : (
              <>
                {paginatedQueue.map((kase) => (
                  <Card key={kase.id} surface="white" className="mb-[10px] p-[14px]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-bold text-text-strong">{kase.displayId}</span>
                        <Badge tone={kase.trackTone === 'orange' ? 'orangeSoft' : kase.trackTone}>
                          {kase.trackLabel}
                        </Badge>
                        {kase.urgent ? <Badge tone="alert">Urgente</Badge> : null}
                        {kase.inAudit ? <Badge tone="orange">Pending Audit</Badge> : null}
                        {kase.hasLowScore && !kase.surveyReviewed ? (
                          <Badge tone="orangeSoft">Low Score Survey</Badge>
                        ) : null}
                        {kase.monitorStatus && kase.monitorStatus !== 'onTime' ? (
                          <Badge tone="muted">{kase.monitorLabel}</Badge>
                        ) : null}
                      </div>
                      <span className="whitespace-nowrap text-[11px] text-text-muted">{kase.ageLabel}</span>
                    </div>

                    <div className="mt-[6px] text-[12.5px] text-text-body">
                      {kase.account} · {kase.branch} · {kase.stageLabel}
                    </div>
                    <CaseScoreLegend intel={scoreCase(kase)} />

                    <div className="mt-[10px] flex items-center justify-between gap-3">
                      <span className="text-[11px] text-text-muted">
                        {kase.inAudit
                          ? 'Cola Pending Audit'
                          : kase.hasLowScore && !kase.surveyReviewed
                            ? 'Cola Low Score Survey'
                            : `Etapa ${(kase.stageIdx ?? 0) + 1} de 4`}
                      </span>
                      <Button variant="primary" size="sm" onClick={() => handleClaim(kase)}>
                        Tomar caso
                      </Button>
                    </div>
                  </Card>
                ))}

                {/* Controles de paginación */}
                {totalPages > 1 && !isUnavailable && (
                  <div className="mt-4 flex items-center justify-between border-t border-gris-200 pt-4">
                    <div className="text-[11.5px] text-text-muted">
                      Mostrando {startIdx + 1}-{Math.min(endIdx, filteredQueue.length)} de {filteredQueue.length}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        ← Anterior
                      </Button>
                      <div className="flex items-center gap-1">
                        {/* Mostrar solo páginas relevantes si hay muchas */}
                        {totalPages <= 7 ? (
                          // Mostrar todas las páginas si son 7 o menos
                          Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                            <button
                              key={page}
                              type="button"
                              onClick={() => setCurrentPage(page)}
                              className={`min-w-[32px] rounded px-2 py-1 text-[12px] font-medium transition-colors ${
                                currentPage === page
                                  ? 'bg-connect-azul text-white'
                                  : 'bg-gris-100 text-text-body hover:bg-gris-200'
                              }`}
                            >
                              {page}
                            </button>
                          ))
                        ) : (
                          // Mostrar paginación compacta con elipsis
                          <>
                            {currentPage > 3 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setCurrentPage(1)}
                                  className="min-w-[32px] rounded bg-gris-100 px-2 py-1 text-[12px] font-medium text-text-body hover:bg-gris-200"
                                >
                                  1
                                </button>
                                <span className="px-1 text-gris-400">…</span>
                              </>
                            )}
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              let page: number;
                              if (currentPage <= 3) {
                                page = i + 1;
                              } else if (currentPage >= totalPages - 2) {
                                page = totalPages - 4 + i;
                              } else {
                                page = currentPage - 2 + i;
                              }
                              return (
                                <button
                                  key={page}
                                  type="button"
                                  onClick={() => setCurrentPage(page)}
                                  className={`min-w-[32px] rounded px-2 py-1 text-[12px] font-medium transition-colors ${
                                    currentPage === page
                                      ? 'bg-connect-azul text-white'
                                      : 'bg-gris-100 text-text-body hover:bg-gris-200'
                                  }`}
                                >
                                  {page}
                                </button>
                              );
                            })}
                            {currentPage < totalPages - 2 && (
                              <>
                                <span className="px-1 text-gris-400">…</span>
                                <button
                                  type="button"
                                  onClick={() => setCurrentPage(totalPages)}
                                  className="min-w-[32px] rounded bg-gris-100 px-2 py-1 text-[12px] font-medium text-text-body hover:bg-gris-200"
                                >
                                  {totalPages}
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Siguiente →
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* mis casos */}
          <section>
            <SectionTitle>Tus casos en curso ({view.claimedCount})</SectionTitle>

            {view.myCases.length === 0 ? (
              <EmptyState>No has tomado ningún caso todavía. Toma uno de la cola a la izquierda.</EmptyState>
            ) : (
              view.myCases.map((kase) => (
                <Card key={kase.id} surface="gray" className="mb-[10px] p-[14px]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-bold text-text-strong">{kase.displayId}</span>
                      <Badge tone={kase.trackTone === 'orange' ? 'orangeSoft' : kase.trackTone}>
                        {kase.trackLabel}
                      </Badge>
                      {kase.inAudit ? <Badge tone="orange">Pending Audit</Badge> : null}
                      {kase.hasLowScore && !kase.surveyReviewed ? (
                        <Badge tone="orangeSoft">Low Score Survey</Badge>
                      ) : null}
                    </div>
                    <span className="whitespace-nowrap text-[11px] text-text-muted">{kase.ageLabel}</span>
                  </div>

                  <div className="mt-[6px] text-[12.5px] text-text-body">
                    {kase.account} · {kase.stageLabel}
                  </div>
                  <CaseScoreLegend intel={scoreCase(kase)} />

                  {/* progreso de etapas */}
                  <div className="mt-2 flex gap-1">
                    {STAGE_NAMES.map((name, idx) => (
                      <span
                        key={name}
                        title={name}
                        className="h-[5px] w-[18px] rounded"
                        style={{
                          background:
                            kase.stageIdx !== null && idx <= kase.stageIdx ? 'var(--connect-naranja)' : 'var(--gris-200)',
                        }}
                      />
                    ))}
                  </div>

                  <div className="mt-[10px] flex flex-wrap gap-2">
                    <Button variant="primary" size="sm" onClick={() => setOpenCaseId(kase.id)}>
                      Abrir caso
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleRelease(kase)}>
                      Soltar
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </section>
        </div>
      </main>

      {openCase ? (
        <CaseDetailModal
          kase={openCase}
          onClose={() => setOpenCaseId(null)}
          onRelease={() => {
            handleRelease(openCase);
            setOpenCaseId(null);
          }}
          onDismiss={() => {
            handleDismiss(openCase);
            setOpenCaseId(null);
          }}
          onAction={(message) => notify(message)}
          onError={(message) => showToast(message, 'error')}
        />
      ) : null}

      {callId ? (
        <IncomingCallModal
          callUniqueId={callId}
          onClose={() => setCallId(null)}
          onOpenCase={(serviceId, serviceNumber) => {
            setCallId(null);
            const inControlTower = cases.some((kase) => kase.id === serviceId);
            if (inControlTower) {
              setOpenCaseId(serviceId);
              return;
            }
            // Misma salida que el iframe de Helios: el PO asociado por teléfono
            // a menudo no está en la cola de Control Tower (p.ej. aún en Dispatch).
            if (serviceNumber) {
              window.open(buildHeliosServiceUrl(serviceNumber), '_blank', 'noopener,noreferrer');
              notify(
                `PO#${serviceNumber} no está en la cola de Control Tower. Se abrió en Helios.`,
                'Llamada entrante',
              );
              return;
            }
            notify(
              'Llamada vinculada, pero el servicio no está en la cola actual de Control Tower.',
              'Llamada entrante',
            );
          }}
          onNotify={(message) => notify(message, 'Llamada entrante')}
        />
      ) : null}

      {showPauseModal ? (
        <PauseModal
          onClose={() => setShowPauseModal(false)}
          onConfirm={handleConfirmAvailability}
        />
      ) : null}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
