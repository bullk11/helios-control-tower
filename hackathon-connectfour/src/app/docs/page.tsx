'use client';

/**
 * Segunda pantalla del mockup: la documentación del modelo, para que diseño e
 * ingeniería la validen aparte del prototipo interactivo.
 */

import { Alert, Badge, Card } from '@/components/ui';
import { HeliosNavbar } from '@/components/HeliosNavbar';
import { ACTOR_MATRIX, STAGE_ACTIONS } from '@/modules/control-tower/domain/actions';
import { STAGE_ADVANCE_CONTRACT, STAGE_NAMES, type StageIndex } from '@/modules/control-tower/domain/stages';
import { AUDIT_REASONS_BY_TRACK } from '@/modules/control-tower/domain/audit';
import { TRACK_LABEL } from '@/modules/control-tower/domain/groups';

const CALL_FLOW = [
  {
    step: '1 · Llega la llamada',
    body: 'Audara entrega callUniqueId, didNumber (línea marcada) y sourceNumber (número del cliente).',
  },
  {
    step: '2 · Helios resuelve contexto',
    body: 'GET /api/v1/incoming-calls/get-data?callUniqueId devuelve la conversación con activeServices[] y holdInspectionServices[].',
  },
  {
    step: '3a · Es un caso existente',
    body: 'El agente elige el servicio; POST /api/v1/incoming-calls/additional-data { uniqueId, serviceId } vincula la llamada y se abre el caso.',
  },
  {
    step: '3b · Es un caso nuevo',
    body: 'Se crea el servicio en Dispatch con el teléfono ya cargado. Entra a Control Tower cuando el proveedor lo acepta (trip.status = accepted).',
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gris-050">
      <HeliosNavbar
        activeSection="docs"
        totalCases={0}
        branchLabel="—"
        divisionLabel="—"
        unreadNotifications={0}
        onToggleNotifications={() => undefined}
      />

      <main className="mx-auto max-w-[1500px] px-6 pb-24 pt-10 lg:px-10">
        <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-text-muted">
          Documentación · pantalla aparte del prototipo
        </div>
        <h1 className="m-0 mb-2 text-[26px] font-extrabold uppercase text-text-strong">
          Modelo de estados, orígenes y auditoría
        </h1>
        <p className="mb-8 max-w-[800px] text-[14px] text-text-muted">
          Cómo se calculan las etapas a partir del estado real del servicio, quién puede moverlas y cuándo se
          abre una auditoría.
        </p>

        {/* --- Derivación de etapas --- */}
        <section className="mb-11">
          <h2 className="m-0 mb-1 text-[18px] font-extrabold uppercase text-text-strong">
            Derivación de las 4 etapas
          </h2>
          <p className="mb-4 max-w-[800px] text-[13px] text-text-muted">
            No hay un campo &quot;etapa&quot; en Helios. Se deriva de <code>service.trip.status</code>,{' '}
            <code>service.status</code> y <code>service.monitor.checkInReminderDate</code>.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {STAGE_NAMES.map((name, idx) => (
              <Card key={name} surface="white" className="p-4">
                <div className="mb-2 text-[11px] font-bold uppercase text-connect-naranja">
                  Etapa {idx + 1} · {name}
                </div>
                <div className="mb-3 text-[12.5px] leading-relaxed text-text-body">
                  {idx === 0 ? (
                    <>
                      <code>trip.status = accepted</code>
                    </>
                  ) : idx === 1 ? (
                    <>
                      <code>trip.status ∈ {'{'}on_route, arrived, towed{'}'}</code>
                    </>
                  ) : idx === 2 ? (
                    <>
                      <code>trip.status ∈ {'{'}finished, cancelled, cancelled_by_driver{'}'}</code> sin check-in
                      agendado
                    </>
                  ) : (
                    <>
                      cerrado/cancelado <strong>con</strong> <code>monitor.checkInReminderDate</code> seteado
                    </>
                  )}
                </div>
                <div className="border-t border-gris-200 pt-2 text-[11px] leading-snug text-text-muted">
                  <div>
                    <strong>Escribe:</strong> {STAGE_ADVANCE_CONTRACT[idx as StageIndex].writes}
                  </div>
                  <div className="mt-1">
                    <strong>Dueño:</strong> {STAGE_ADVANCE_CONTRACT[idx as StageIndex].owner}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="mt-4">
            <Alert>
              Fuera de alcance: <code>trip.status = new</code>. El despacho y la asignación del proveedor siguen
              siendo de Dispatch. Auditoría es una cola aparte:{' '}
              <code>status = Audit</code> o <code>trip.status = pending_audit</code>.
            </Alert>
          </div>
        </section>

        {/* --- Flujo de llamada entrante --- */}
        <section className="mb-11">
          <h2 className="m-0 mb-1 text-[18px] font-extrabold uppercase text-text-strong">
            Flujo de llamada entrante (Audara → Helios)
          </h2>
          <p className="mb-4 max-w-[800px] text-[13px] text-text-muted">
            Tal como está hoy en el módulo <code>incoming-calls</code>: la llamada llega con su identificador y
            Helios resuelve el contexto del número antes de que el agente escriba nada.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {CALL_FLOW.map((item) => (
              <Card key={item.step} surface="white" className="p-4">
                <div className="mb-2 text-[11px] font-bold uppercase text-connect-naranja">{item.step}</div>
                <div className="text-[12.5px] leading-relaxed text-text-body">{item.body}</div>
              </Card>
            ))}
          </div>
        </section>

        {/* --- Matriz actor x etapa --- */}
        <section className="mb-11">
          <h2 className="m-0 mb-1 text-[18px] font-extrabold uppercase text-text-strong">
            Acciones por actor y etapa
          </h2>
          <p className="mb-4 max-w-[800px] text-[13px] text-text-muted">
            Un cambio de estado puede originarse de tres formas: el <strong>agente</strong> a mano, el{' '}
            <strong>proveedor</strong> desde Helios App, o el <strong>sistema</strong> solo (crons y reglas de{' '}
            <code>monitor.helper.ts</code>).
          </p>

          <div className="overflow-x-auto">
            <div className="min-w-[920px]">
              <div className="mb-2 grid grid-cols-[190px_repeat(3,1fr)] gap-2">
                <div />
                <div className="text-center">
                  <Badge tone="navy">Agente</Badge>
                </div>
                <div className="text-center">
                  <Badge tone="success">Proveedor</Badge>
                </div>
                <div className="text-center">
                  <Badge tone="orangeSoft">Sistema automático</Badge>
                </div>
              </div>

              {ACTOR_MATRIX.map((row) => (
                <div key={row.stage} className="mb-2 grid grid-cols-[190px_repeat(3,1fr)] gap-2">
                  <Card surface="gray" className="p-3">
                    <div className="text-[12.5px] font-bold leading-tight text-text-strong">{row.stage}</div>
                    <div className="mt-1 text-[10.5px] text-text-muted">{row.trigger}</div>
                  </Card>
                  {[row.agente, row.proveedor, row.sistema].map((items, columnIdx) => (
                    <Card key={columnIdx} surface="white" className="p-3">
                      {items.map((item) => (
                        <div key={item} className="py-[2px] text-[12px] leading-snug text-text-body">
                          • {item}
                        </div>
                      ))}
                    </Card>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- Acciones disponibles y su endpoint --- */}
        <section className="mb-11">
          <h2 className="m-0 mb-1 text-[18px] font-extrabold uppercase text-text-strong">
            Acciones del detalle y su endpoint real
          </h2>
          <p className="mb-4 max-w-[800px] text-[13px] text-text-muted">
            <span className="font-bold text-estado-exito">● conectada</span> = el prototipo la ejecuta contra
            helios_api en modo live. <span className="font-bold text-connect-naranja">○ pendiente</span> = falta
            endpoint o vive en otra pantalla de Helios.
          </p>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(Object.keys(STAGE_ACTIONS) as unknown as StageIndex[]).map((stageIdx) => (
              <Card key={stageIdx} surface="white" className="p-4">
                <div className="mb-3 text-[11px] font-bold uppercase text-connect-naranja">
                  Etapa {Number(stageIdx) + 1} · {STAGE_NAMES[stageIdx]}
                </div>
                {STAGE_ACTIONS[stageIdx].map((action) => (
                  <div key={action.id} className="mb-3 border-b border-gris-100 pb-2 last:border-0">
                    <div className="text-[12px] font-bold text-text-body">
                      <span className={action.implemented ? 'text-estado-exito' : 'text-connect-naranja'}>
                        {action.implemented ? '● ' : '○ '}
                      </span>
                      {action.label}
                    </div>
                    <code className="mt-1 block break-all text-[10.5px] text-text-muted">{action.endpoint}</code>
                    {action.note ? (
                      <div className="mt-1 text-[10.5px] italic text-text-muted">{action.note}</div>
                    ) : null}
                  </div>
                ))}
              </Card>
            ))}
          </div>
        </section>

        {/* --- Auditoría --- */}
        <section>
          <h2 className="m-0 mb-1 text-[18px] font-extrabold uppercase text-text-strong">
            Motivos de auditoría por track
          </h2>
          <p className="mb-4 max-w-[800px] text-[13px] text-text-muted">
            Subconjunto del enum <code>AuditReasons</code> de <code>services.schema.ts</code>. La decisión la
            toma el backend en el cancel/finish del servicio, no el frontend.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Object.entries(AUDIT_REASONS_BY_TRACK).map(([track, reasons]) => (
              <Card key={track} surface="white" className="p-4">
                <div className="mb-3 text-[11px] font-bold uppercase text-connect-naranja">
                  {TRACK_LABEL[track] ?? track}
                </div>
                {reasons.map((reason) => (
                  <div key={reason} className="py-[2px] text-[12px] text-text-body">
                    • {reason}
                  </div>
                ))}
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
