'use client';

/**
 * Modal de llamada entrante (Audara -> Helios).
 *
 * Implementa el flujo que documenta el mockup:
 *   1. Llega la llamada con callUniqueId / didNumber / sourceNumber.
 *   2. GET /api/v1/incoming-calls/get-data resuelve el contexto del número.
 *   3a. Es un caso existente -> POST /additional-data vincula y abre el caso.
 *   3b. Es un caso nuevo -> el despacho sigue en Dispatch; entra a Control Tower
 *       cuando el proveedor ya está asignado (trip.status = accepted).
 */

import { Alert, Badge, Button, Modal } from '@/components/ui';
import {
  buildDispatchIncomingCallUrl,
  collectCallServices,
  resolveCallContactName,
} from '@/modules/helios/incoming-calls.api';
import { TRIP_STATUS } from '@/modules/helios/types';
import { useIncomingCallQuery, useLinkCallMutation } from '../hooks';

const TRIP_STATUS_STYLE: Record<string, { border: string; bg: string }> = {
  [TRIP_STATUS.ACCEPTED]: { border: '#2979FF', bg: '#EBF2FF' },
  [TRIP_STATUS.ON_ROUTE]: { border: '#F15B2B', bg: '#FFF2EE' },
  [TRIP_STATUS.ARRIVED]: { border: '#F15B2B', bg: '#FFF2EE' },
  [TRIP_STATUS.FINISHED]: { border: '#43A047', bg: '#ECF8E8' },
};

export function IncomingCallModal({
  callUniqueId,
  onClose,
  onOpenCase,
  onNotify,
}: {
  callUniqueId: string;
  onClose: () => void;
  onOpenCase: (serviceId: string, serviceNumber?: number) => void;
  onNotify: (message: string) => void;
}) {
  const callQuery = useIncomingCallQuery(callUniqueId);
  const linkCall = useLinkCallMutation();

  const call = callQuery.data ?? null;
  const services = collectCallServices(call);
  const contactName = resolveCallContactName(call);

  const handleLink = async (serviceId: string, serviceNumber?: number) => {
    try {
      await linkCall.mutateAsync({ callUniqueId, serviceId });
      onNotify(`Llamada ${callUniqueId} vinculada al servicio.`);
      onOpenCase(serviceId, serviceNumber);
    } catch (error) {
      onNotify(error instanceof Error ? error.message : 'No se pudo vincular la llamada.');
    }
  };

  return (
    <Modal
      headerTone="orange"
      width="max-w-[660px]"
      onClose={onClose}
      title={`${contactName} · ${call?.sourceNumber ?? '—'}`}
      subtitle="Llamada entrante · Audara"
    >
      <div className="px-6 py-5">
        <div className="mb-5 flex flex-wrap gap-4 text-[12px] text-text-muted">
          <div>
            callUniqueId: <strong className="text-text-strong">{call?.uniqueId ?? callUniqueId}</strong>
          </div>
          <div>
            DID: <strong className="text-text-strong">{call?.didNumber ?? '—'}</strong>
          </div>
          <div>
            País: <strong className="text-text-strong">{call?.branch ?? '—'}</strong>
          </div>
        </div>

        {callQuery.isLoading ? (
          <div className="text-[13px] text-text-muted">Resolviendo contexto del número…</div>
        ) : callQuery.isError ? (
          <Alert tone="error">No se pudo consultar la llamada. {String(callQuery.error)}</Alert>
        ) : (
          <>
            <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-text-muted">
              Servicios de este número ({services.length})
            </div>

            {!call ? (
              <Alert tone="error">
                No se encontró una conversación con el callUniqueId <strong>{callUniqueId}</strong>.
              </Alert>
            ) : services.length === 0 ? (
              <Alert tone="warn">
                El número no tiene servicios asociados. Es un caso nuevo: el despacho lo hace Dispatch.
              </Alert>
            ) : (
              services.map((service) => {
                const style = TRIP_STATUS_STYLE[service.trip?.status ?? ''] ?? {
                  border: '#001D3D',
                  bg: '#EEF7FF',
                };
                return (
                  <div
                    key={service._id}
                    className="mb-[10px] rounded-lg border border-gris-200 p-3"
                    style={{ borderLeft: `4px solid ${style.border}`, background: style.bg }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-[13px] font-bold text-text-strong">
                        PO#{service.serviceNumber} · {service.situationLabel || service.situation}
                      </div>
                      <span className="text-[11px] text-text-muted">{service.trip?.status ?? '—'}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-text-body">
                      {service.accountName || service.account} · {service.pinSituationAddress || 'sin dirección'}
                    </div>
                    <div className="mt-[10px] flex items-center justify-between gap-3">
                      <Badge tone={service.origin === 'active' ? 'navy' : 'orangeSoft'}>
                        {service.origin === 'active' ? 'activeServices' : 'holdInspectionServices'}
                      </Badge>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={linkCall.isPending}
                        onClick={() => handleLink(service._id, service.serviceNumber)}
                      >
                        Vincular llamada y abrir caso
                      </Button>
                    </div>
                  </div>
                );
              })
            )}

            <div className="mt-4 border-t border-gris-200 pt-4">
              <Alert>
                Si la llamada no corresponde a ninguno de estos servicios se crea un caso nuevo, pero el
                despacho lo sigue haciendo Dispatch: el caso entra a Control Tower cuando ya tiene proveedor
                asignado (<code>trip.status = accepted</code>).
              </Alert>
              <div className="mt-2">
                <Button
                  variant="primary"
                  full
                  disabled={!call}
                  onClick={() => {
                    const dispatchUrl = buildDispatchIncomingCallUrl(call?.uniqueId ?? callUniqueId);
                    window.open(dispatchUrl, '_blank', 'noopener,noreferrer');
                    onNotify('Dispatch abierto con los datos de la llamada para crear el servicio.');
                    onClose();
                  }}
                >
                  Abrir Dispatch con los datos de la llamada
                </Button>
              </div>
              <div className="mt-2 text-[10.5px] text-text-muted">
                Dispatch recupera la conversación por <code>incomingCallId</code> y precarga país, situación,
                contrato/cliente, teléfono, cuenta, ubicación y notas disponibles.
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
