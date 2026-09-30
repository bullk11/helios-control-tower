'use client';

import { useEffect, useMemo, useState } from 'react';
import { HeliosNavbar } from '@/components/HeliosNavbar';
import { Alert, Card, Select, ToastContainer, type ToastItem, type ToastType } from '@/components/ui';
import { config } from '@/lib/config';
import {
  findSupervisor,
  readSupervisorId,
  writeSupervisorId,
} from '@/lib/session';
import { CapacityDashboard } from '@/modules/control-tower/components/CapacityDashboard';
import { describeError } from '@/modules/control-tower/data-source';
import { GROUPS, TRACK_LABEL } from '@/modules/control-tower/domain/groups';
import { buildCapacityDashboard } from '@/modules/control-tower/domain/intelligence';
import { useCasesQuery } from '@/modules/control-tower/hooks';
import {
  applyCapacityMove,
  applyCapacityOverrides,
  clearCapacityOverrides,
  hasCapacityOverrides,
  readCapacityOverrides,
  readWorkLog,
  setGroupCapacity,
  writeCapacityOverrides,
  type CapacityOverrides,
} from '@/modules/control-tower/capacity-store';
import { readDismissed, readOwnership } from '@/modules/control-tower/ownership';
import { SUPERVISORS } from '@/lib/session';

let toastSeq = 1;

export default function CapacidadPage() {
  const [capacityOverrides, setCapacityOverrides] = useState<CapacityOverrides>({});
  const [supervisorId, setSupervisorId] = useState(readSupervisorId);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const casesQuery = useCasesQuery({ branch: null, division: config.defaultDivision });
  const supervisor = findSupervisor(supervisorId);

  useEffect(() => {
    setCapacityOverrides(readCapacityOverrides());
    setSupervisorId(readSupervisorId());
  }, []);

  const groupsEffective = useMemo(
    () => applyCapacityOverrides(GROUPS, capacityOverrides),
    [capacityOverrides],
  );

  const defaultCapacities = useMemo(
    () =>
      Object.fromEntries(
        GROUPS.filter((group) => group.type === 'etapa').map((group) => [group.id, group.capacity]),
      ),
    [],
  );

  const capacityDashboard = useMemo(
    () =>
      buildCapacityDashboard({
        groups: groupsEffective,
        cases: casesQuery.data?.cases ?? [],
        ownership: readOwnership(),
        dismissed: readDismissed(),
        workLog: readWorkLog(),
        branchFilter: null,
      }),
    [groupsEffective, casesQuery.data?.cases],
  );

  const showToast = (message: string, type: ToastType = 'success') => {
    const id = toastSeq++;
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 4000);
  };

  return (
    <div className="min-h-screen">
      <HeliosNavbar
        activeSection="capacidad"
        totalCases={casesQuery.data?.cases.length ?? 0}
        branchLabel="Todos los países"
        divisionLabel={config.defaultDivision === 'all' ? 'Todas las divisiones' : TRACK_LABEL[config.defaultDivision] ?? config.defaultDivision}
        unreadNotifications={0}
        onToggleNotifications={() => undefined}
      />

      <main className="mx-auto max-w-[1500px] px-6 pb-20 pt-7 lg:px-10">
        <header className="mb-5">
          <div className="text-[12px] font-bold uppercase tracking-wide text-text-muted">
            Vista de supervisor
          </div>
          <h1 className="m-0 text-[28px] font-extrabold uppercase text-text-strong">Capacidad</h1>
          <p className="mt-2 max-w-[760px] text-[14px] text-text-muted">
            Quien aplica las sugerencias actúa como supervisor. El agente en Control Tower solo opera su cola.
          </p>
        </header>

        <Card surface="gray" className="mb-6 p-4">
          <Select
            label="Agente a supervisar"
            value={supervisorId}
            options={SUPERVISORS.map((item) => ({
              value: item.id,
              label: `${item.name} · ${item.email}`,
            }))}
            onChange={(value) => {
              setSupervisorId(value);
              writeSupervisorId(value);
            }}
          />
        </Card>

        {casesQuery.isError ? (
          <div className="mb-6">
            <Alert tone="error">{describeError(casesQuery.error)}</Alert>
          </div>
        ) : null}

        <CapacityDashboard
          data={capacityDashboard}
          defaultCapacities={defaultCapacities}
          hasOverrides={hasCapacityOverrides(capacityOverrides)}
          onApplyMove={(move) => {
            setCapacityOverrides((prev) => {
              const next = applyCapacityMove(
                prev,
                GROUPS,
                move.overloadedGroupId,
                move.overloadedDelta,
                move.slackGroupId,
                move.slackDelta,
              );
              writeCapacityOverrides(next);
              return next;
            });
            showToast(`Capacidad actualizada por ${supervisor.name}: ${move.summary}`);
          }}
          onSetGroupCapacity={(groupId, capacity) => {
            setCapacityOverrides((prev) => {
              const next = setGroupCapacity(prev, GROUPS, groupId, capacity);
              writeCapacityOverrides(next);
              return next;
            });
            const label = GROUPS.find((group) => group.id === groupId)?.label ?? groupId;
            showToast(`${label}: capacidad fijada en ${capacity} por ${supervisor.name}`);
          }}
          onResetCapacity={() => {
            clearCapacityOverrides();
            setCapacityOverrides({});
            showToast(`Capacidad restaurada a valores por defecto por ${supervisor.name}`);
          }}
        />
      </main>

      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))} />
    </div>
  );
}
