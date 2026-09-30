/**
 * Self-check de la capa de integración.
 *
 * Corre el pipeline completo (cargar servicios -> derivar etapas -> armar la cola
 * por grupo) del lado del servidor y devuelve los conteos. Sirve para verificar
 * que el mapeo funciona sin abrir el navegador, y para comprobar la conexión real
 * a helios_api en modo live:
 *
 *   curl http://localhost:4300/api/selftest
 *
 * En modo live este endpoint NO puede autenticarse (el token vive en el navegador),
 * así que reporta el error de auth. Es esperado: sirve para mock y para validar la
 * derivación de etapas.
 */

import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { loadCases } from '@/modules/control-tower/data-source';
import { toControlTowerCases } from '@/modules/control-tower/domain/case';
import { GROUPS } from '@/modules/control-tower/domain/groups';
import { buildQueueView } from '@/modules/control-tower/domain/queue';
import { resolveStage } from '@/modules/control-tower/domain/stages';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { services, requestDescription } = await loadCases();
    const cases = toControlTowerCases(services);

    const outOfScope = services
      .map((service) => ({ service, resolution: resolveStage(service) }))
      .filter((entry) => entry.resolution.kind === 'out-of-scope')
      .map((entry) => ({
        serviceNumber: entry.service.serviceNumber,
        tripStatus: entry.service.trip?.status,
        reason: entry.resolution.kind === 'out-of-scope' ? entry.resolution.reason : '',
      }));

    const byStage: Record<string, number> = {
      'etapa 1': 0,
      'etapa 2': 0,
      'etapa 3': 0,
      'etapa 4': 0,
      auditoría: 0,
      'low score': 0,
    };
    cases.forEach((kase) => {
      if (kase.inAudit) byStage['auditoría'] += 1;
      else if (kase.hasLowScore && !kase.surveyReviewed) byStage['low score'] += 1;
      else byStage[`etapa ${(kase.stageIdx ?? 0) + 1}`] += 1;
    });

    const queuesByGroup = GROUPS.map((group) => {
      const view = buildQueueView({ cases, group, ownership: {}, dismissed: {}, showAll: true });
      return { group: group.id, label: group.label, queue: view.queue.length, capacity: group.capacity };
    });

    return NextResponse.json({
      ok: true,
      dataMode: config.dataMode,
      requestDescription,
      servicesReturned: services.length,
      casesInScope: cases.length,
      outOfScope,
      byStage,
      queuesByGroup,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        dataMode: config.dataMode,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      },
      { status: 200 },
    );
  }
}
