'use client';

import { buildHeliosServiceUrl } from '@/modules/helios/incoming-calls.api';

const PO_PATTERN = /(PO#\d+)/g;

/** Convierte referencias PO#123456 en links al detalle de Helios. */
export function PoLinkedText({ text }: { text: string }) {
  const parts = text.split(PO_PATTERN);

  return (
    <>
      {parts.map((part, index) => {
        const match = /^PO#(\d+)$/.exec(part);
        if (!match) return <span key={`${index}-${part}`}>{part}</span>;

        const serviceNumber = Number(match[1]);
        return (
          <a
            key={`${index}-${part}`}
            href={buildHeliosServiceUrl(serviceNumber)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-connect-naranja underline decoration-connect-naranja/40 hover:text-naranja-600"
          >
            {part}
          </a>
        );
      })}
    </>
  );
}
