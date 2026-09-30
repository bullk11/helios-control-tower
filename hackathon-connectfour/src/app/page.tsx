'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@/components/ui';
import { writeWorkspaceRole, type WorkspaceRole } from '@/lib/session';

const ROLES: Array<{
  role: WorkspaceRole;
  title: string;
  description: string;
  href: string;
  cta: string;
}> = [
  {
    role: 'agent',
    title: 'Agente',
    description: 'Opera tu cola: tomar casos, alertar al proveedor, check-in y llamadas entrantes.',
    href: '/control-tower',
    cta: 'Entrar como agente',
  },
  {
    role: 'supervisor',
    title: 'Supervisor',
    description: 'Revisa utilización de capacidad y acepta o descarta sugerencias de redistribución.',
    href: '/capacidad',
    cta: 'Entrar como supervisor',
  },
];

export default function HomePage() {
  const router = useRouter();

  const enterAs = (role: WorkspaceRole, href: string) => {
    writeWorkspaceRole(role);
    router.push(href);
  };

  return (
    <div className="min-h-screen bg-gris-050">
      <header className="bg-black px-6 py-[10px] text-[15px] font-extrabold tracking-wider text-white">
        HELIOS
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-44px)] max-w-[920px] flex-col justify-center px-6 py-12">
        <div className="mb-8 text-center">
          <div className="text-[12px] font-bold uppercase tracking-wide text-text-muted">Control Tower</div>
          <h1 className="mt-2 text-[32px] font-extrabold uppercase text-text-strong">¿Cómo quieres ingresar?</h1>
          <p className="mx-auto mt-3 max-w-[560px] text-[14px] text-text-muted">
            Elige una vista
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {ROLES.map((entry) => (
            <Card key={entry.role} className="flex flex-col p-6">
              <h2 className="m-0 text-[20px] font-extrabold text-text-strong">{entry.title}</h2>
              <p className="mt-3 flex-1 text-[13.5px] leading-relaxed text-text-muted">{entry.description}</p>
              <div className="mt-6">
                <Button variant={entry.role === 'agent' ? 'primary' : 'secondary'} full onClick={() => enterAs(entry.role, entry.href)}>
                  {entry.cta}
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <p className="mt-8 text-center text-[12px] text-text-muted">
          ¿Ya estás dentro?{' '}
          <Link href="/control-tower" className="font-bold text-connect-naranja no-underline hover:underline">
            Control Tower
          </Link>
          {' · '}
          <Link href="/capacidad" className="font-bold text-connect-naranja no-underline hover:underline">
            Capacidad
          </Link>
        </p>
      </main>
    </div>
  );
}
