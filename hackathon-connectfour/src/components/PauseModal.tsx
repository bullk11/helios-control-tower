'use client';

import { useState } from 'react';
import { Button, Modal, Select } from './ui';

export type OperatorAvailability = 'active' | 'paused' | 'inactive';

interface PauseModalProps {
  onClose: () => void;
  onConfirm: (availability: OperatorAvailability, minutes?: number) => void;
}

const PAUSE_OPTIONS = [
  { value: 5, label: '5 minutos' },
  { value: 10, label: '10 minutos' },
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
];

export function PauseModal({ onClose, onConfirm }: PauseModalProps) {
  const [availability, setAvailability] = useState<OperatorAvailability>('paused');
  const [selectedTime, setSelectedTime] = useState(String(PAUSE_OPTIONS[1].value));

  const handleConfirm = () => {
    onConfirm(availability, availability === 'paused' ? Number(selectedTime) : undefined);
    onClose();
  };

  return (
    <Modal
      title="Disponibilidad del operador"
      subtitle="Define si recibirás nuevos casos en tu cola"
      onClose={onClose}
      width="max-w-[480px]"
    >
      <div className="px-6 py-6">
        <div className="mb-4">
          <Select
            label="Estado"
            value={availability}
            options={[
              { value: 'active', label: 'Activo · recibir casos' },
              { value: 'paused', label: 'Pausa temporal' },
              { value: 'inactive', label: 'Inactivo · fin de jornada' },
            ]}
            onChange={setAvailability}
          />
        </div>

        {availability === 'paused' ? (
          <div className="mb-4">
          <Select
            label="Duración de la pausa"
            value={selectedTime}
            options={PAUSE_OPTIONS.map((opt) => ({
              value: String(opt.value),
              label: opt.label,
            }))}
            onChange={setSelectedTime}
          />
          </div>
        ) : null}

        <div className="mb-4 rounded-md bg-azul-050 p-3 text-[12px] text-text-body">
          <strong>Nota:</strong>{' '}
          {availability === 'active'
            ? 'Volverás a recibir nuevos casos en tu cola.'
            : availability === 'paused'
              ? 'Los casos asignados permanecerán contigo. La recepción se reactivará al terminar la pausa.'
              : 'No recibirás nuevos casos hasta que vuelvas a marcarte como activo. Los casos asignados permanecerán contigo.'}
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" full onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" full onClick={handleConfirm}>
            {availability === 'active'
              ? 'Marcar activo'
              : availability === 'paused'
                ? 'Pausar cola'
                : 'Finalizar jornada'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
