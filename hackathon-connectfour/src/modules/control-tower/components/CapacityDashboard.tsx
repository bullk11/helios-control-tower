'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, Select } from '@/components/ui';
import {
  MAX_GROUP_CAPACITY,
  projectCapacityMove,
  type CapacityDashboardData,
  type CapacityMove,
} from '../domain/intelligence';

function MoveControls({
  move,
  delta,
  onDelta,
  onApply,
}: {
  move: CapacityMove;
  delta: number;
  onDelta: (next: number) => void;
  onApply: (move: CapacityMove) => void;
}) {
  const projected = projectCapacityMove(move, delta);
  const canApply = move.kind !== 'staff' && projected.overloadedDelta > 0;

  return (
    <div className="flex min-w-[220px] flex-col items-end gap-2">
      {move.kind === 'staff' ? (
        <Badge tone="orangeSoft">Requiere otro agente</Badge>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={delta <= 1}
              onClick={() => onDelta(delta - 1)}
              aria-label="Bajar slots"
            >
              −
            </Button>
            <div className="min-w-[72px] text-center text-[13px] font-extrabold text-text-strong">
              +{projected.overloadedDelta}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={delta >= move.maxOverloadDelta}
              onClick={() => onDelta(delta + 1)}
              aria-label="Subir slots"
            >
              +
            </Button>
          </div>
          <div className="text-right text-[11px] text-text-muted">
            cap {move.fromCapacity} → {projected.toCapacity}
            <span className="mx-1">·</span>
            carga {move.loadPct}% → {projected.projectedLoadPct}%
          </div>
          {projected.remainingQueue > 0 ? (
            <div className="text-right text-[11px] text-naranja-700">
              Aun quedarían {projected.remainingQueue} en cola (tope {MAX_GROUP_CAPACITY})
            </div>
          ) : null}
          <Button variant="secondary" size="sm" disabled={!canApply} onClick={() => onApply(projected)}>
            Aplicar +{projected.overloadedDelta}
          </Button>
        </>
      )}
    </div>
  );
}

export function CapacityDashboard({
  data,
  defaultCapacities,
  hasOverrides,
  onApplyMove,
  onSetGroupCapacity,
  onResetCapacity,
}: {
  data: CapacityDashboardData;
  defaultCapacities: Record<string, number>;
  hasOverrides: boolean;
  onApplyMove: (move: CapacityMove) => void;
  onSetGroupCapacity: (groupId: string, capacity: number) => void;
  onResetCapacity: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  const draftKey = useMemo(
    () => data.moves.map((move) => `${move.id}:${move.overloadedDelta}`).join('|'),
    [data.moves],
  );

  useEffect(() => {
    setDrafts(Object.fromEntries(data.moves.map((move) => [move.id, move.overloadedDelta])));
  }, [draftKey, data.moves]);

  const actionable = data.moves.filter((move) => move.kind !== 'staff' && (drafts[move.id] ?? move.overloadedDelta) > 0);

  return (
    <section id="capacidad">
      <h2 className="m-0 text-[18px] font-extrabold uppercase text-text-strong">Utilización de capacidad</h2>

      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-[11px] font-bold uppercase text-text-muted">En cola (etapas)</div>
          <div className="mt-1 text-[22px] font-extrabold text-text-strong">{data.queueCases}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-bold uppercase text-text-muted">En curso</div>
          <div className="mt-1 text-[22px] font-extrabold text-text-strong">{data.claimedCases}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] font-bold uppercase text-text-muted">Utilización</div>
          <div className="mt-1 text-[22px] font-extrabold text-text-strong">{data.utilizationPct}%</div>
        </Card>
      </div>

      {data.moves.length > 0 ? (
        <Card surface="gray" className="mb-5 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[12px] font-bold uppercase text-text-strong">Redistribución sugerida</div>
            {actionable.length > 1 ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  actionable.forEach((move) => {
                    onApplyMove(projectCapacityMove(move, drafts[move.id] ?? move.overloadedDelta));
                  });
                }}
              >
                Aplicar plan ({actionable.length})
              </Button>
            ) : null}
          </div>
          <p className="mb-3 text-[11.5px] text-text-muted">
            Aceptar o no estos cambios es responsabilidad de un supervisor. La IA propone cuántos slots hacen falta
            hasta el tope; no suma +1 cada clic.
          </p>
          {data.moves.map((move) => (
            <div
              key={move.id}
              className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-gris-200 pb-3 last:mb-0 last:border-0 last:pb-0"
            >
              <div>
                <div className="text-[13px] text-text-body">{move.summary}</div>
                <div className="mt-1 text-[11px] text-text-muted">{move.reasons.join(' · ')}</div>
              </div>
              <MoveControls
                move={move}
                delta={drafts[move.id] ?? move.overloadedDelta}
                onDelta={(next) => setDrafts((prev) => ({ ...prev, [move.id]: next }))}
                onApply={onApplyMove}
              />
            </div>
          ))}
        </Card>
      ) : (
        <p className="mb-5 text-[12.5px] text-text-muted">Ningún grupo de etapa está saturado ahora mismo.</p>
      )}

      <Card surface="gray" className="mb-5 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-bold uppercase text-text-strong">Ajuste manual por grupo</div>
            <p className="mt-1 mb-0 text-[11.5px] text-text-muted">
              Subí o bajá la capacidad de cada cola sin depender de la sugerencia IA. Tope: {MAX_GROUP_CAPACITY} casos
              simultáneos.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.rows.map((row) => {
            const base = defaultCapacities[row.groupId] ?? row.capacity;
            const adjusted = row.capacity !== base;
            const capacityOptions = Array.from({ length: MAX_GROUP_CAPACITY }, (_, index) => {
              const value = String(index + 1);
              return { value, label: `${index + 1} caso${index + 1 === 1 ? '' : 's'}` };
            });
            return (
              <div key={row.groupId} className="rounded-lg border border-gris-200 bg-white p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[13px] font-bold text-text-strong">{row.label}</div>
                  {adjusted ? <Badge tone="orangeSoft">Ajustado</Badge> : null}
                </div>
                <div className="mb-2 text-[11px] text-text-muted">
                  Base {base} · actual {row.capacity} · {row.claimed} en curso · {row.queue} en cola
                </div>
                <Select
                  label="Capacidad"
                  value={String(row.capacity)}
                  options={capacityOptions}
                  onChange={(value) => onSetGroupCapacity(row.groupId, Number(value))}
                />
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
          <thead>
            <tr className="border-b border-gris-200 bg-gris-050 text-[11px] uppercase text-text-muted">
              <th className="px-4 py-3 font-bold">Grupo</th>
              <th className="px-4 py-3 font-bold">Capacidad</th>
              <th className="px-4 py-3 font-bold">En curso</th>
              <th className="px-4 py-3 font-bold">Cola</th>
              <th className="px-4 py-3 font-bold">Utilización</th>
              <th className="px-4 py-3 font-bold">Carga</th>
              <th className="px-4 py-3 font-bold">Sugerencia</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => {
              const loadPct = Math.round(row.loadRatio * 100);
              return (
                <tr key={row.groupId} className="border-b border-gris-200 last:border-0">
                  <td className="px-4 py-3 font-bold text-text-strong">{row.label}</td>
                  <td className="px-4 py-3">{row.capacity}</td>
                  <td className="px-4 py-3">{row.claimed}</td>
                  <td className="px-4 py-3">{row.queue}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded bg-gris-200">
                        <div
                          className="h-full rounded"
                          style={{
                            width: `${Math.min(100, row.utilizationPct)}%`,
                            background:
                              row.utilizationPct >= 100 ? '#F15B2B' : row.utilizationPct >= 70 ? '#D9A31C' : '#8FD9B6',
                          }}
                        />
                      </div>
                      <span>{row.utilizationPct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={loadPct >= 100 ? 'font-bold text-naranja-700' : 'text-text-muted'}>{loadPct}%</span>
                  </td>
                  <td className="px-4 py-3 text-[11.5px] text-text-muted">
                    {row.suggestion ? <Badge tone="orangeSoft">IA</Badge> : '—'}
                    {row.suggestion ? <span className="ml-2">{row.suggestion}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
