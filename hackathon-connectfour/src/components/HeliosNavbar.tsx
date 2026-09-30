'use client';

/**
 * Réplica de la franja superior real de Helios.
 *
 * Referencia: helios_frontend/src/app/modules/theme/modules/nav-menu/nav-menu.component.html
 * Conserva la identidad visual, pero solo muestra funciones reales del prototipo.
 */

import Link from 'next/link';
import { config } from '@/lib/config';

export interface NavbarProps {
  activeSection: 'control-tower' | 'capacidad' | 'docs';
  totalCases: number;
  branchLabel: string;
  divisionLabel: string;
  unreadNotifications: number;
  onToggleNotifications: () => void;
  unreadSuggestions?: number;
  onToggleSuggestions?: () => void;
  isPaused?: boolean;
  isInactive?: boolean;
  onTogglePause?: () => void;
  pauseTimeRemaining?: string;
}

const NAV_ITEMS = [
  { label: 'Control Tower', href: '/control-tower' as const, section: 'control-tower' as const },
  { label: 'Capacidad', href: '/capacidad' as const, section: 'capacidad' as const },
  { label: 'Documentación', href: '/docs' as const, section: 'docs' as const },
];

export function HeliosNavbar({
  activeSection,
  totalCases,
  branchLabel,
  divisionLabel,
  unreadNotifications,
  onToggleNotifications,
  unreadSuggestions = 0,
  onToggleSuggestions,
  isPaused = false,
  isInactive = false,
  onTogglePause,
  pauseTimeRemaining,
}: NavbarProps) {
  return (
    <div className="flex items-center gap-6 bg-black px-6 py-[10px] text-[13px] text-white">
      <div className="text-[15px] font-extrabold tracking-wider">HELIOS</div>

      <nav className="flex items-center gap-5 text-[#aaa]">
        {NAV_ITEMS.map((item) => {
          const isActive = item.section === activeSection;

          return (
            <Link
              key={item.label}
              href={item.href}
              className={isActive ? 'font-bold text-connect-naranja' : 'text-[#aaa] hover:text-white'}
            >
              {item.label}
            </Link>
          );
        })}
        <Link href="/" className="text-[#aaa] hover:text-white">
          Cambiar rol
        </Link>
      </nav>

      <div className="ml-auto flex items-center gap-3">
        <span
          className={`rounded-full px-3 py-[4px] text-[11px] font-bold uppercase ${
            config.dataMode === 'live' ? 'bg-estado-exito text-white' : 'bg-amarillo-600 text-black'
          }`}
          title={
            config.dataMode === 'live'
              ? `Consultando ${config.heliosApiUrl}`
              : 'Datos de fixtures locales con la forma de la API real'
          }
        >
          {config.dataMode === 'live' ? 'live' : 'mock'}
        </span>

        {onTogglePause && (
          <button
            type="button"
            onClick={onTogglePause}
            className={`rounded-full px-3 py-[4px] text-[11px] font-bold uppercase transition-colors ${
              isInactive
                ? 'bg-[#222] text-[#aaa] hover:bg-[#333]'
                : isPaused
                  ? 'bg-connect-naranja text-white'
                  : 'bg-estado-exito text-white hover:brightness-110'
            }`}
            title={
              isInactive
                ? 'Inactivo por fin de jornada · clic para reactivar'
                : isPaused
                  ? `Pausado${pauseTimeRemaining ? ` - ${pauseTimeRemaining}` : ''}`
                  : 'Gestionar disponibilidad'
            }
          >
            {isInactive ? (
              '○ Inactivo'
            ) : isPaused ? (
              <>
                ⏸ {pauseTimeRemaining ? pauseTimeRemaining : 'Pausado'}
              </>
            ) : (
              '● Activo'
            )}
          </button>
        )}

        <div className="rounded-full bg-[#222] px-3 py-[5px] text-[11.5px] text-[#ddd]">
          {totalCases} en el sistema · {branchLabel} · {divisionLabel}
        </div>

        <button
          type="button"
          onClick={onToggleNotifications}
          className="flex items-center gap-2 rounded-full bg-[#222] px-3 py-[4px] text-[11.5px] text-white hover:bg-[#333]"
        >
          Notificaciones
          {unreadNotifications > 0 ? (
            <span className="rounded-full bg-connect-naranja px-[7px] py-[1px] text-[10.5px] font-bold">
              {unreadNotifications > 9 ? '9+' : unreadNotifications}
            </span>
          ) : null}
        </button>

        {onToggleSuggestions ? (
          <button
            type="button"
            onClick={onToggleSuggestions}
            className="flex items-center gap-2 rounded-full bg-[#222] px-3 py-[4px] text-[11.5px] text-white hover:bg-[#333]"
            title="Sugerencias IA para tu cola activa"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-naranja-050 text-[9px] font-extrabold text-connect-naranja">
              IA
            </span>
            Sugerencias
            {unreadSuggestions > 0 ? (
              <span className="rounded-full bg-connect-naranja px-[7px] py-[1px] text-[10.5px] font-bold">
                {unreadSuggestions > 9 ? '9+' : unreadSuggestions}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}
