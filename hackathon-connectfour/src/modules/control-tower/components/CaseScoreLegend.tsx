'use client';

import { Badge } from '@/components/ui';
import type { ScoreBreakdown } from '../domain/intelligence';

const CHIP_HELP: Record<string, string> = {
  'Avisar proveedor': 'El viaje se retrasó o no ha cerrado. Contacta al proveedor.',
  'Confirmar en ruta': 'El proveedor aceptó pero no marca en ruta.',
  'Responder mensaje': 'Hay un mensaje sin leer del proveedor o la cuenta.',
  'Revisar auditoría': 'El servicio está en Pending Audit.',
  'Contactar por encuesta': 'Encuesta con baja calificación aún sin revisar.',
  'Priorizar ahora': 'VIP o emergencia: atender primero.',
  Seguimiento: 'Sin alerta crítica. Revisa si hay tiempo.',
};

const scoreTone = (score: number): 'alert' | 'orange' | 'muted' => {
  if (score >= 70) return 'alert';
  if (score >= 50) return 'orange';
  return 'muted';
};

export function CaseScoreLegend({ intel }: { intel: ScoreBreakdown }) {
  return (
    <div className="mt-2 rounded-md border border-gris-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="orangeSoft">{intel.chip}</Badge>
        <Badge tone={scoreTone(intel.score)}>Puntaje {intel.score}</Badge>
        <span className="text-[11px] text-text-muted">
          {intel.score >= 70 ? 'Alta prioridad' : intel.score >= 50 ? 'Atención' : 'Baja'}
        </span>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-text-body">
        {CHIP_HELP[intel.chip] ?? 'Sugerencia automática según el estado del servicio.'}
      </p>
      {intel.reasons.length > 0 ? (
        <ul className="mt-1 list-none space-y-[2px] p-0 text-[11px] text-text-muted">
          {intel.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[11px] text-text-muted">Sin señales extra: el puntaje sale de la antigüedad.</p>
      )}
    </div>
  );
}
