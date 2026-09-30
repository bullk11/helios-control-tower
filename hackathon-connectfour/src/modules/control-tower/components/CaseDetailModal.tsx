'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, DateTimeInput, Modal, Select, TextInput, toDateTimeLocalValue } from '@/components/ui';
import type { CaseChatTab } from '@/modules/helios/notes.api';
import { CHECK_IN_REASONS, CHECK_IN_RESOLVE_REASONS } from '@/modules/helios/check-in-reminder.api';
import { buildHeliosServiceUrl } from '@/modules/helios/incoming-calls.api';
import { EXCEPTION_TIME_OPTIONS } from '@/modules/helios/monitor.api';
import { advanceableStatusOptions, canFinishTripService } from '@/modules/helios/trip.api';
import type { ControlTowerCase } from '../domain/case';
import { formatMonitorStatus, formatServiceStatus, formatTripStatus, isLowScoreQueue } from '../domain/case';
import { STAGE_ACTIONS, type CaseAction } from '../domain/actions';
import { AUDIT_ACTIONS } from '../domain/audit';
import { LOW_SCORE_ACTIONS } from '../domain/survey';
import { STAGE_NAMES, type StageIndex } from '../domain/stages';
import { describeError } from '../data-source';
import { ServiceMap } from './ServiceMap';
import {
  useAddNoteMutation,
  useAdvanceTripMutation,
  useAuditHoldMutation,
  useCreateCheckInMutation,
  useDelayServiceMutation,
  useFinishServiceMutation,
  useMarkSurveyReviewedMutation,
  useNotesQuery,
  useResolveCheckInMutation,
  useResolveServiceMutation,
  useServiceLogsQuery,
  formatLogDate,
} from '../hooks';

const CHAT_TABS: Array<{ id: CaseChatTab; label: string; placeholder: string }> = [
  { id: 'driver', label: 'Chat proveedor', placeholder: 'Escribir al proveedor…' },
  { id: 'account', label: 'Chat cuenta / EOS', placeholder: 'Escribir a la cuenta (EOS)…' },
  { id: 'internal', label: 'Observaciones internas', placeholder: 'Nota interna (no la ve el proveedor)…' },
];

const ALERT_PROVIDER_MESSAGE =
  'Hola, el servicio lleva más tiempo del esperado. Por favor cuéntanos cómo va o cuándo llegarás.';

const LOW_SCORE_CONTACT_MESSAGE =
  'Hola, vimos tu calificación del servicio y queremos entender qué pasó para ayudarte. ¿Puedes contarnos tu experiencia?';

const defaultCheckInLocal = () => {
  const nextHour = new Date();
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);
  return toDateTimeLocalValue(nextHour);
};

const localDateTimeToIso = (value: string): string | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[11px] text-text-muted">{label}</span>
      <br />
      <strong className="text-[13px] text-text-strong">{value}</strong>
    </div>
  );
}

export function CaseDetailModal({
  kase,
  onClose,
  onRelease,
  onDismiss,
  onAction,
  onError,
}: {
  kase: ControlTowerCase;
  onClose: () => void;
  onRelease: () => void;
  onDismiss: () => void;
  onAction: (message: string) => void;
  onError?: (message: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<CaseChatTab | 'logs'>('driver');
  const [draft, setDraft] = useState('');
  const [checkInDate, setCheckInDate] = useState(defaultCheckInLocal);
  const [checkInReason, setCheckInReason] = useState<string>(CHECK_IN_REASONS[0]);
  const [resolveReason, setResolveReason] = useState<string>(CHECK_IN_RESOLVE_REASONS[0]);
  const [exceptionTime, setExceptionTime] = useState<string>(String(EXCEPTION_TIME_OPTIONS[1].value));
  const [advanceStatus, setAdvanceStatus] = useState<string>('');
  const [surveyNote, setSurveyNote] = useState('');

  const notesQuery = useNotesQuery(kase.id);
  const logsQuery = useServiceLogsQuery(kase.id);
  const addNote = useAddNoteMutation(kase.id);
  const createCheckIn = useCreateCheckInMutation(kase.id);
  const resolveCheckIn = useResolveCheckInMutation(kase.id);
  const delayService = useDelayServiceMutation(kase.id);
  const advanceTrip = useAdvanceTripMutation(kase.id);
  const finishService = useFinishServiceMutation(kase.id);
  const auditHold = useAuditHoldMutation(kase.id);
  const resolveService = useResolveServiceMutation(kase.id);
  const markSurveyReviewed = useMarkSurveyReviewedMutation(kase.id);
  const isLowScore = isLowScoreQueue(kase);

  const actions: readonly CaseAction[] = useMemo(() => {
    if (kase.inAudit) return AUDIT_ACTIONS;
    if (isLowScore) return LOW_SCORE_ACTIONS;
    return kase.stageIdx === null ? [] : STAGE_ACTIONS[kase.stageIdx];
  }, [kase.inAudit, isLowScore, kase.stageIdx]);

  const hasCheckIn = Boolean(kase.checkInReminderDate);

  const advanceOptions = useMemo(
    () =>
      advanceableStatusOptions(kase.tripStatus, { situation: kase.situation }).map((item) => ({
        value: item.value,
        label: item.label,
      })),
    [kase.tripStatus, kase.situation],
  );

  const readyToFinish = canFinishTripService(kase.tripStatus);

  useEffect(() => {
    setAdvanceStatus((prev) => {
      if (advanceOptions.some((option) => option.value === prev)) return prev;
      return advanceOptions[0]?.value ?? '';
    });
  }, [advanceOptions, kase.id]);

  const handleSend = async () => {
    const msg = draft.trim();
    if (!msg) return;
    const tab = activeTab === 'logs' ? 'driver' : activeTab;
    try {
      await addNote.mutateAsync({ msg, tab });
      setDraft('');
      onAction(`Nota enviada en ${CHAT_TABS.find((t) => t.id === tab)?.label}.`);
    } catch (error) {
      (onError ?? onAction)(error instanceof Error ? error.message : 'No se pudo enviar la nota.');
    }
  };

  const handleCreateCheckIn = async () => {
    const iso = localDateTimeToIso(checkInDate);
    if (!iso) {
      onAction('Elige fecha y hora del check-in.');
      return;
    }
    try {
      await createCheckIn.mutateAsync({
        checkInDate: iso,
        reason: checkInReason,
        branch: kase.branch,
        serviceStatus: kase.serviceStatus,
      });
      setCheckInDate(defaultCheckInLocal());
      onAction(`Check-in programado para ${new Date(iso).toLocaleString()}.`);
    } catch (error) {
      (onError ?? onAction)(error instanceof Error ? error.message : 'No se pudo crear el check-in.');
    }
  };

  const handleResolveCheckIn = async () => {
    try {
      await resolveCheckIn.mutateAsync({ reason: resolveReason });
      onAction(`Check-in resuelto: ${resolveReason}.`);
    } catch (error) {
      (onError ?? onAction)(error instanceof Error ? error.message : 'No se pudo resolver el check-in.');
    }
  };

  return (
    <Modal
      onClose={onClose}
      headerTone={kase.inAudit || (kase.hasLowScore && !kase.surveyReviewed) ? 'orange' : 'navy'}
      headerActions={
        kase.raw.serviceNumber ? (
          <button
            type="button"
            onClick={() =>
              window.open(buildHeliosServiceUrl(kase.raw.serviceNumber!), '_blank', 'noopener,noreferrer')
            }
            className="flex items-center gap-2 rounded-md border border-white/40 bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-white/20"
            title={`Abrir ${kase.displayId} en Helios`}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-connect-naranja text-[10px] font-extrabold text-white">
              H
            </span>
            Abrir en Helios
            <span aria-hidden className="text-[11px] opacity-80">
              ↗
            </span>
          </button>
        ) : null
      }
      title={
        <span className="flex flex-wrap items-center gap-2">
          {kase.displayId}
          <Badge tone={kase.trackTone === 'orange' ? 'orangeSoft' : kase.trackTone}>{kase.trackLabel}</Badge>
          {kase.urgent ? <Badge tone="alert">Urgente</Badge> : null}
          {kase.inAudit ? <Badge tone="orange">Pending Audit</Badge> : null}
          {kase.hasLowScore && !kase.surveyReviewed ? (
            <Badge tone="orangeSoft">Low Score Survey</Badge>
          ) : null}
        </span>
      }
      subtitle={
        kase.inAudit
          ? `Pending Audit · ${kase.auditReason ?? 'motivo no informado'}`
          : kase.hasLowScore && !kase.surveyReviewed
            ? 'Low Score Survey · encuesta con baja calificación sin revisar'
            : `Etapa ${(kase.stageIdx ?? 0) + 1} de 4 · ${STAGE_NAMES[(kase.stageIdx ?? 0) as StageIndex]}`
      }
    >
      <div className="grid gap-6 px-6 py-6 lg:grid-cols-2">
        {/* --- Datos del servicio --- */}
        <div>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Datos del servicio
          </div>
          <div className="mb-4 flex flex-col gap-[10px]">
            <Field label="Cuenta" value={kase.account} />
            <Field label="Situación (situation)" value={kase.situation} />
            <Field label="Teléfono (phone1)" value={kase.phone1} />
            <Field label="Dirección" value={kase.address} />
            <Field label="Proveedor / técnico" value={kase.provider} />
            <Field label="ETA" value={kase.eta} />
            <Field label="Tiempo en el sistema" value={kase.ageLabel} />
            <Field label="País (branch)" value={kase.branch} />
          </div>

          <div className="mb-4 rounded-[20px] border border-gris-200 bg-white p-5 shadow-sm">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              Estado en Helios
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-text-body">
              <span>
                Estado del servicio:{' '}
                <strong className="text-text-strong">{formatServiceStatus(kase.serviceStatus)}</strong>
              </span>
              <span>
                Estado del viaje:{' '}
                <strong className="text-text-strong">{formatTripStatus(kase.tripStatus)}</strong>
              </span>
              <span>
                Monitor:{' '}
                <strong className="text-text-strong">{formatMonitorStatus(kase.monitorStatus)}</strong>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone={kase.trackTone === 'orange' ? 'orangeSoft' : kase.trackTone}>{kase.trackLabel}</Badge>
              {kase.urgent ? <Badge tone="alert">Urgente</Badge> : null}
              {kase.monitorStatus && kase.monitorStatus !== 'onTime' ? (
                <Badge tone="orange">{kase.monitorLabel}</Badge>
              ) : null}
            </div>
          </div>

          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">Historial</div>
          <div className="flex flex-col gap-[8px]">
            {kase.log.map((entry, index) => (
              <div key={`${entry}-${index}`} className="rounded-[14px] bg-gris-050 px-4 py-[10px] text-[13px] text-text-body shadow-sm">
                {entry}
              </div>
            ))}
          </div>
        </div>

        {/* --- Acciones --- */}
        <div>
          {/* --- Mapa del servicio --- */}
          <div className="mb-5">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              Ubicación del servicio
            </div>
            <ServiceMap kase={kase} />
          </div>

          <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Acciones para esta etapa
          </div>
          <div className="mb-5 flex flex-col gap-2">
            {actions.map((action) => {
              // --- Excepción de tiempo: selector + botón ---
              if (action.id === 'exception-time') {
                return (
                  <div key={action.id} className="rounded-lg border border-gris-200 p-3">
                    <div className="mb-2 text-[12px] font-bold text-text-strong">{action.label}</div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <Select
                          label="Tiempo"
                          value={exceptionTime}
                          options={EXCEPTION_TIME_OPTIONS.map((opt) => ({
                            value: String(opt.value),
                            label: opt.label,
                          }))}
                          onChange={setExceptionTime}
                        />
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={delayService.isPending}
                        onClick={async () => {
                          try {
                            await delayService.mutateAsync({ time: Number(exceptionTime) });
                            const label = EXCEPTION_TIME_OPTIONS.find((o) => o.value === Number(exceptionTime))?.label ?? exceptionTime;
                            onAction(`Excepción otorgada: ${label}. monitor.status → managed.`);
                          } catch (error) {
                            (onError ?? onAction)(error instanceof Error ? error.message : 'No se pudo otorgar la excepción.');
                          }
                        }}
                      >
                        {delayService.isPending ? 'Aplicando…' : 'Aplicar'}
                      </Button>
                    </div>
                    <div className="mt-1 flex items-start gap-2 px-1 text-[10.5px] leading-snug text-text-muted">
                      <span className="text-estado-exito">● conectada</span>
                      <code className="break-all">{action.endpoint}</code>
                    </div>
                  </div>
                );
              }

              // --- Alertar al proveedor por ETA: botón con mensaje predefinido ---
              if (action.id === 'alert-provider-eta') {
                return (
                  <div key={action.id} className="rounded-lg border border-gris-200 p-3">
                    <div className="mb-2 text-[12px] font-bold text-text-strong">{action.label}</div>
                    <div className="mb-2 rounded-md bg-gris-050 p-2 text-[11.5px] text-text-body italic">
                      &ldquo;{ALERT_PROVIDER_MESSAGE}&rdquo;
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      full
                      disabled={addNote.isPending}
                      onClick={async () => {
                        try {
                          await addNote.mutateAsync({ msg: ALERT_PROVIDER_MESSAGE, tab: 'driver' });
                          setActiveTab('driver');
                          onAction('Alerta enviada. Revisa el chat del proveedor abajo.');
                        } catch (error) {
                          (onError ?? onAction)(error instanceof Error ? error.message : 'No se pudo enviar la alerta.');
                        }
                      }}
                    >
                      {addNote.isPending ? 'Enviando…' : 'Enviar alerta al proveedor'}
                    </Button>
                    <div className="mt-1 flex items-start gap-2 px-1 text-[10.5px] leading-snug text-text-muted">
                      <span className="text-estado-exito">● conectada</span>
                      <code className="break-all">{action.endpoint}</code>
                    </div>
                  </div>
                );
              }

              // --- Escalar a operaciones: nota interna ---
              if (action.id === 'escalate-ops' || action.id === 'escalate-ops-followup') {
                return (
                  <div key={action.id} className="rounded-lg border border-gris-200 p-3">
                    <div className="mb-2 text-[12px] font-bold text-text-strong">{action.label}</div>
                    <Button
                      variant="secondary"
                      size="sm"
                      full
                      disabled={addNote.isPending}
                      onClick={async () => {
                        const msg = `[ESCALAMIENTO] Caso ${kase.displayId} escalado a operaciones. Situación: ${kase.situation}. Proveedor: ${kase.provider}. Monitor: ${kase.monitorLabel ?? 'sin alerta'}.`;
                        try {
                          await addNote.mutateAsync({ msg, tab: 'internal' });
                          setActiveTab('internal');
                          onAction('Escalado a operaciones (observación interna creada).');
                        } catch (error) {
                          (onError ?? onAction)(error instanceof Error ? error.message : 'No se pudo escalar.');
                        }
                      }}
                    >
                      {addNote.isPending ? 'Escalando…' : 'Escalar (observación interna)'}
                    </Button>
                    <div className="mt-1 flex items-start gap-2 px-1 text-[10.5px] leading-snug text-text-muted">
                      <span className="text-estado-exito">● conectada</span>
                      <code className="break-all">{action.endpoint}</code>
                    </div>
                  </div>
                );
              }

              if (action.id === 'contact-customer-survey') {
                return (
                  <div key={action.id} className="rounded-lg border border-gris-200 p-3">
                    <div className="mb-2 text-[12px] font-bold text-text-strong">{action.label}</div>
                    <div className="mb-2 rounded-md bg-gris-050 p-2 text-[11.5px] text-text-body italic">
                      &ldquo;{LOW_SCORE_CONTACT_MESSAGE}&rdquo;
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      full
                      disabled={addNote.isPending}
                      onClick={async () => {
                        try {
                          await addNote.mutateAsync({ msg: LOW_SCORE_CONTACT_MESSAGE, tab: 'account' });
                          setActiveTab('account');
                          onAction('Mensaje enviado al chat de la cuenta.');
                        } catch (error) {
                          (onError ?? onAction)(
                            error instanceof Error ? error.message : 'No se pudo contactar al cliente.',
                          );
                        }
                      }}
                    >
                      {addNote.isPending ? 'Enviando…' : 'Enviar al chat de cuenta'}
                    </Button>
                    <div className="mt-1 flex items-start gap-2 px-1 text-[10.5px] leading-snug text-text-muted">
                      <span className="text-estado-exito">● conectada</span>
                      <code className="break-all">{action.endpoint}</code>
                    </div>
                  </div>
                );
              }

              if (action.id === 'mark-survey-reviewed') {
                return (
                  <div key={action.id} className="rounded-lg border border-gris-200 p-3">
                    <div className="mb-2 text-[12px] font-bold text-text-strong">{action.label}</div>
                    <p className="mb-2 text-[11.5px] text-text-muted">
                      Lo saca de la cola Low Score.
                    </p>
                    <TextInput
                      label="Observación del agente"
                      value={surveyNote}
                      placeholder="Qué se habló o qué se resolvió…"
                      onChange={setSurveyNote}
                    />
                    <div className="mt-2">
                      <Button
                        variant="primary"
                        size="sm"
                        full
                        disabled={markSurveyReviewed.isPending}
                        onClick={async () => {
                          try {
                            const method = await markSurveyReviewed.mutateAsync({ agentObservations: surveyNote });
                            onAction(
                              method === 'legacy'
                                ? `${kase.displayId}: encuesta marcada como revisada.`
                                : `${kase.displayId}: encuesta marcada como revisada.`,
                            );
                            onClose();
                          } catch (error) {
                            (onError ?? onAction)(describeError(error));
                          }
                        }}
                      >
                        {markSurveyReviewed.isPending ? 'Guardando…' : 'Marcar como revisada'}
                      </Button>
                    </div>
                    <div className="mt-1 flex items-start gap-2 px-1 text-[10.5px] leading-snug text-text-muted">
                      <span className="text-estado-exito">● conectada</span>
                      <code className="break-all">{action.endpoint}</code>
                    </div>
                  </div>
                );
              }

              if (action.id === 'hold-audit') {
                return (
                  <div key={action.id} className="rounded-lg border border-gris-200 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="text-[12px] font-bold text-text-strong">{action.label}</div>
                      {kase.isAuditHold ? <Badge tone="orangeSoft">En hold</Badge> : null}
                    </div>
                    <Button
                      variant={kase.isAuditHold ? 'outline' : 'secondary'}
                      size="sm"
                      full
                      disabled={auditHold.isPending}
                      onClick={async () => {
                        const next = !kase.isAuditHold;
                        try {
                          await auditHold.mutateAsync(next);
                          onAction(
                            next
                              ? `${kase.displayId} quedó en hold audit.`
                              : `Se quitó el hold audit de ${kase.displayId}.`,
                          );
                        } catch (error) {
                          (onError ?? onAction)(
                            error instanceof Error ? error.message : 'No se pudo actualizar el hold audit.',
                          );
                        }
                      }}
                    >
                      {auditHold.isPending
                        ? 'Actualizando…'
                        : kase.isAuditHold
                          ? 'Quitar hold audit'
                          : 'Poner en hold audit'}
                    </Button>
                    <div className="mt-1 flex items-start gap-2 px-1 text-[10.5px] leading-snug text-text-muted">
                      <span className="text-estado-exito">● conectada</span>
                      <code className="break-all">{action.endpoint}</code>
                    </div>
                  </div>
                );
              }

              if (action.id === 'resolve-audit') {
                return (
                  <div key={action.id} className="rounded-lg border border-gris-200 p-3">
                    <div className="mb-2 text-[12px] font-bold text-text-strong">{action.label}</div>
                    <p className="mb-2 text-[11.5px] text-text-muted">
                      Cierra el servicio en Helios y lo saca de Pending Audit.
                    </p>
                    <Button
                      variant="primary"
                      size="sm"
                      full
                      disabled={resolveService.isPending}
                      onClick={async () => {
                        try {
                          await resolveService.mutateAsync();
                          onAction(`${kase.displayId} salió de auditoría.`);
                          onClose();
                        } catch (error) {
                          (onError ?? onAction)(
                            error instanceof Error ? error.message : 'No se pudo resolver la auditoría.',
                          );
                        }
                      }}
                    >
                      {resolveService.isPending ? 'Resolviendo…' : 'Resolver auditoría'}
                    </Button>
                    <div className="mt-1 flex items-start gap-2 px-1 text-[10.5px] leading-snug text-text-muted">
                      <span className="text-estado-exito">● conectada</span>
                      <code className="break-all">{action.endpoint}</code>
                    </div>
                  </div>
                );
              }

              // --- Acciones genéricas (no funcionales todavía) ---
              return (
                <div key={action.id} className="rounded-lg border border-gris-200 p-2">
                  <Button
                    variant="outline"
                    size="sm"
                    full
                    onClick={() => onAction(`${action.label} — ${action.endpoint}`)}
                  >
                    {action.label}
                  </Button>
                  <div className="mt-1 flex items-start gap-2 px-1 text-[10.5px] leading-snug text-text-muted">
                    <span className={action.implemented ? 'text-estado-exito' : 'text-connect-naranja'}>
                      {action.implemented ? '● conectada' : '○ pendiente'}
                    </span>
                    <code className="break-all">{action.endpoint}</code>
                  </div>
                </div>
              );
            })}
            {actions.length === 0 ? <Alert>Esta etapa no tiene acciones definidas.</Alert> : null}
          </div>

          {/* --- Check-in reminder --- */}
          {!kase.inAudit && !isLowScore ? (
            <div className="mb-5 border-t border-gris-200 pt-4">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                Check-in reminder
              </div>
              {hasCheckIn ? (
                <>
                  <div className="mb-3 rounded-md bg-naranja-050 p-3 text-[12px]">
                    <div>
                      <strong>Programado:</strong> {kase.checkInReminderDate}
                    </div>
                    <div className="mt-1 text-text-muted">
                      Vive en <code>service.monitor.checkInReminderDate</code>.
                    </div>
                  </div>
                  <Select
                    label="Motivo de cierre"
                    value={resolveReason}
                    options={CHECK_IN_RESOLVE_REASONS.map((reason) => ({ value: reason, label: reason }))}
                    onChange={setResolveReason}
                  />
                  <div className="mt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      full
                      disabled={resolveCheckIn.isPending}
                      onClick={handleResolveCheckIn}
                    >
                      {resolveCheckIn.isPending ? 'Resolviendo…' : 'Resolver check-in'}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <DateTimeInput
                    label="Fecha y hora"
                    value={checkInDate}
                    min={toDateTimeLocalValue(new Date())}
                    onChange={setCheckInDate}
                  />
                  <Select
                    label="Motivo"
                    value={checkInReason}
                    options={CHECK_IN_REASONS.map((reason) => ({ value: reason, label: reason }))}
                    onChange={setCheckInReason}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    full
                    disabled={createCheckIn.isPending}
                    onClick={handleCreateCheckIn}
                  >
                    {createCheckIn.isPending ? 'Creando…' : 'Crear check-in reminder'}
                  </Button>
                  <div className="flex items-start gap-2 px-1 text-[10.5px] leading-snug text-text-muted">
                    <span className="text-estado-exito">● conectada</span>
                    <code className="break-all">POST /api/v1/services/checkInReminder</code>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {/* --- Avance de etapa y resolver --- */}
          <div className="border-t border-gris-200 pt-4">
            {!kase.inAudit && !isLowScore ? (
              <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
                Avanzar etapa / Resolver
              </div>
            ) : null}

            {/* Timestamps intermedios (on_route / arrived / towed) */}
            {kase.stageIdx !== null && kase.stageIdx < 2 && advanceOptions.length > 0 ? (
              <div className="mb-3 flex flex-col gap-2">
                <Select
                  label="Avanzar estado del viaje a"
                  value={advanceStatus}
                  options={advanceOptions}
                  onChange={setAdvanceStatus}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  full
                  disabled={advanceTrip.isPending || !advanceStatus}
                  onClick={async () => {
                    if (!advanceStatus) return;
                    try {
                      await advanceTrip.mutateAsync({ status: advanceStatus });
                      onAction(`trip.status avanzado a ${advanceStatus}.`);
                    } catch (error) {
                      (onError ?? onAction)(error instanceof Error ? error.message : 'No se pudo avanzar el trip.');
                    }
                  }}
                >
                  {advanceTrip.isPending ? 'Avanzando…' : 'Avanzar etapa'}
                </Button>
                <div className="flex items-start gap-2 px-1 text-[10.5px] leading-snug text-text-muted">
                  <span className="text-estado-exito">● conectada</span>
                  <code className="break-all">POST /service/trip/:id/timestamp</code>
                </div>
              </div>
            ) : null}

            {/* Cierre administrativo desde arrived/towed */}
            {kase.stageIdx !== null && kase.stageIdx < 2 && readyToFinish ? (
              <div className="mb-3 flex flex-col gap-2">
                <p className="m-0 text-[11.5px] text-text-muted">
                  El viaje está en <strong>{formatTripStatus(kase.tripStatus)}</strong>.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  full
                  disabled={finishService.isPending}
                  onClick={async () => {
                    try {
                      await finishService.mutateAsync();
                      onAction(`Servicio ${kase.displayId} finalizado en Helios.`);
                    } catch (error) {
                      (onError ?? onAction)(error instanceof Error ? error.message : 'No se pudo finalizar el servicio.');
                    }
                  }}
                >
                  {finishService.isPending ? 'Finalizando…' : 'Finalizar servicio'}
                </Button>
                <div className="flex items-start gap-2 px-1 text-[10.5px] leading-snug text-text-muted">
                  <span className="text-estado-exito">● conectada</span>
                  <code className="break-all">POST /services/finish</code>
                </div>
              </div>
            ) : null}

            {/* Resolver caso (dismiss local) — no aplica en Pending Audit */}
            {!kase.inAudit && !isLowScore ? (
              <>
                <Button variant="primary" full onClick={onDismiss}>
                  Resolver caso
                </Button>
                <div className="mt-1 text-[10.5px] text-text-muted text-center">
                  Lo saca de tu cola. Reaparece automáticamente si hay nuevos mensajes o alertas del monitor.
                </div>
              </>
            ) : null}

            <div className={kase.inAudit || isLowScore ? '' : 'mt-3'}>
              <Button variant="ghost" full onClick={onRelease}>
                Soltar caso
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* --- Conversaciones --- */}
      <div className="px-6 pb-6">
        <div className="border-t border-gris-200 pt-4">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
            Conversaciones del caso
          </div>

          <div className="flex flex-wrap gap-2">
            {CHAT_TABS.map((tab) => {
              const count = notesQuery.data?.byTab[tab.id].filter((note) => note.readFromHelios === false).length ?? 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-full px-3 py-[6px] text-[12px] font-bold ${
                    activeTab === tab.id
                      ? 'bg-connect-azul text-white'
                      : 'border border-gris-300 bg-white text-text-body'
                  }`}
                >
                  {tab.label}
                  {count > 0 ? ` (${count})` : ''}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`rounded-full px-3 py-[6px] text-[12px] font-bold ${
                activeTab === 'logs'
                  ? 'bg-connect-azul text-white'
                  : 'border border-gris-300 bg-white text-text-body'
              }`}
            >
              Service Logs
              {logsQuery.data && logsQuery.data.length > 0 ? ` (${logsQuery.data.length})` : ''}
            </button>
          </div>

          {/* Contenido de tabs de chat */}
          {activeTab !== 'logs' ? (
            <>
              <div className="mt-3 flex flex-col gap-[6px]">
                {notesQuery.isLoading ? (
                  <div className="text-[12px] text-text-muted">Cargando notas…</div>
                ) : (notesQuery.data?.byTab[activeTab as CaseChatTab] ?? []).length === 0 ? (
                  <div className="rounded-lg bg-gris-050 px-3 py-3 text-[12px] text-text-muted">
                    Sin mensajes en esta conversación.
                  </div>
                ) : (
                  (notesQuery.data?.byTab[activeTab as CaseChatTab] ?? []).map((note, index) => (
                    <div key={note._id ?? index} className="rounded-[14px] bg-gris-050 px-3 py-2 text-[12px]">
                      <strong>{note.user?.type ?? 'usuario'}:</strong> {note.msg}
                      {note.readFromHelios === false ? (
                        <span className="ml-2 text-[10.5px] font-bold text-connect-naranja">sin leer</span>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <div className="flex-1">
                  <TextInput
                    value={draft}
                    placeholder={CHAT_TABS.find((tab) => tab.id === activeTab)?.placeholder}
                    onChange={setDraft}
                  />
                </div>
                <Button variant="secondary" size="sm" disabled={addNote.isPending} onClick={handleSend}>
                  {addNote.isPending ? 'Enviando…' : 'Enviar'}
                </Button>
              </div>
              <div className="mt-2 text-[10.5px] text-text-muted">
                Las 3 pestañas son la misma colección <code>notes</code> de Helios, discriminada por{' '}
                <code>chatType</code> y <code>isObservation</code>.
              </div>
            </>
          ) : (
            /* --- Service Logs --- */
            <div className="mt-3">
              {logsQuery.isLoading ? (
                <div className="text-[12px] text-text-muted">Cargando logs…</div>
              ) : !logsQuery.data || logsQuery.data.length === 0 ? (
                <div className="rounded-[14px] bg-gris-050 px-3 py-3 text-[12px] text-text-muted">
                  Sin service logs registrados.
                </div>
              ) : (
                <div className="flex flex-col gap-[10px]">
                  {logsQuery.data.map((log, index) => (
                    <div key={log._id ?? index} className="rounded-[14px] border border-gris-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <span className="text-[12px] font-bold text-text-strong">
                          {log.agentName ?? 'Sistema'}
                        </span>
                        <span className="text-[11px] text-text-muted whitespace-nowrap">
                          {formatLogDate(log)}
                        </span>
                      </div>
                      <div className="text-[12.5px] text-text-body leading-snug">
                        {log.logMessage ?? '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
