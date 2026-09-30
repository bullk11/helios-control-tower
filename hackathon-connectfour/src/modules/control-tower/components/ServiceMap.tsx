'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import type { ControlTowerCase } from '../domain/case';

interface ServiceMapProps {
  kase: ControlTowerCase;
}

/**
 * Componente de mapa que muestra las ubicaciones del servicio.
 * Usa Google Maps embebido para mostrar la situación, proveedor y destino.
 */
export function ServiceMap({ kase }: ServiceMapProps) {
  const [showMap, setShowMap] = useState(false);

  const locations = kase.raw.locations;
  const situationLat = locations?.situation?.lat;
  const situationLng = locations?.situation?.lng;
  const providerLat = locations?.provider?.lat;
  const providerLng = locations?.provider?.lng;
  const destinationLat = locations?.destination?.lat;
  const destinationLng = locations?.destination?.lng;

  // Si no hay coordenadas, no mostrar el mapa
  const hasCoordinates = (situationLat && situationLng) || (providerLat && providerLng);

  if (!hasCoordinates) {
    return (
      <div className="rounded-lg border border-gris-200 bg-gris-050 p-4 text-center">
        <div className="text-[12px] text-text-muted">
          No hay coordenadas disponibles para mostrar el mapa
        </div>
      </div>
    );
  }

  // Construir marcadores para Google Maps Static API
  const markers: string[] = [];
  if (situationLat && situationLng) {
    markers.push(`color:red|label:S|${situationLat},${situationLng}`);
  }
  if (providerLat && providerLng) {
    markers.push(`color:blue|label:P|${providerLat},${providerLng}`);
  }
  if (destinationLat && destinationLng) {
    markers.push(`color:green|label:D|${destinationLat},${destinationLng}`);
  }

  // Centro del mapa (usar situación o proveedor)
  const centerLat = situationLat ?? providerLat ?? 0;
  const centerLng = situationLng ?? providerLng ?? 0;

  // URL de Google Maps interactivo (abrir en nueva pestaña)
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${providerLat ?? situationLat},${providerLng ?? situationLng}&destination=${destinationLat ?? situationLat},${destinationLng ?? situationLng}&travelmode=driving`;

  if (!showMap) {
    return (
      <div className="rounded-lg border border-gris-200 bg-gris-600 p-4">
        <div className="flex items-center justify-center" style={{ minHeight: '300px' }}>
          <Button
            variant="primary"
            size="md"
            onClick={() => setShowMap(true)}
            className="shadow-lg"
          >
            Show Map
          </Button>
        </div>
        
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {situationLat && situationLng && (
            <div className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full bg-estado-error"></span>
              <span className="text-text-muted">Situación</span>
            </div>
          )}
          {providerLat && providerLng && (
            <div className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full bg-connect-azul"></span>
              <span className="text-text-muted">Proveedor</span>
            </div>
          )}
          {destinationLat && destinationLng && (
            <div className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded-full bg-estado-exito"></span>
              <span className="text-text-muted">Destino</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gris-200 bg-white overflow-hidden">
      <div className="relative" style={{ height: '400px' }}>
        <iframe
          title="Service Map"
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          src={`https://www.google.com/maps/embed/v1/directions?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || 'YOUR_API_KEY'}&origin=${providerLat ?? situationLat},${providerLng ?? situationLng}&destination=${destinationLat ?? situationLat},${destinationLng ?? situationLng}&mode=driving`}
        />
      </div>

      <div className="border-t border-gris-200 bg-gris-050 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-[11px]">
            {situationLat && situationLng && (
              <div className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-full bg-estado-error"></span>
                <span className="text-text-muted">Situación</span>
              </div>
            )}
            {providerLat && providerLng && (
              <div className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-full bg-connect-azul"></span>
                <span className="text-text-muted">Proveedor</span>
              </div>
            )}
            {destinationLat && destinationLng && (
              <div className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-full bg-estado-exito"></span>
                <span className="text-text-muted">Destino</span>
              </div>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMap(false)}
            >
              Ocultar
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.open(googleMapsUrl, '_blank')}
            >
              Abrir en Google Maps
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
