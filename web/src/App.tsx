import { Link, NavLink, Outlet } from 'react-router-dom';

export function Casca() {
  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <header className="border-b border-stone-300 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-xl font-bold tracking-tight">
            道 Dao Tale
          </Link>
          <nav className="flex gap-4 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? 'font-semibold text-stone-900' : 'text-stone-500 hover:text-stone-900'
              }
            >
              Obras
            </NavLink>
            <NavLink
              to="/configuracoes"
              className={({ isActive }) =>
                isActive ? 'font-semibold text-stone-900' : 'text-stone-500 hover:text-stone-900'
              }
            >
              Configurações
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

// ── Componentes utilitários compartilhados pelas páginas ────────────────────

export function Botao(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: 'primario' | 'secundario' | 'perigo' }) {
  const { variante = 'primario', className = '', ...resto } = props;
  const base = 'rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';
  const estilos = {
    primario: 'bg-stone-800 text-white hover:bg-stone-700',
    secundario: 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
    perigo: 'border border-red-300 bg-white text-red-700 hover:bg-red-50',
  };
  return <button {...resto} className={`${base} ${estilos[variante]} ${className}`} />;
}

export function Aviso({ tipo, children }: { tipo: 'erro' | 'ok' | 'info'; children: React.ReactNode }) {
  const estilos = {
    erro: 'border-red-300 bg-red-50 text-red-800',
    ok: 'border-green-300 bg-green-50 text-green-800',
    info: 'border-amber-300 bg-amber-50 text-amber-800',
  };
  return <div className={`my-2 rounded border px-3 py-2 text-sm ${estilos[tipo]}`}>{children}</div>;
}

export function Etiqueta({ children, cor = 'stone' }: { children: React.ReactNode; cor?: string }) {
  const cores: Record<string, string> = {
    stone: 'bg-stone-200 text-stone-700',
    green: 'bg-green-100 text-green-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
    teal: 'bg-teal-100 text-teal-800',
  };
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cores[cor]}`}>{children}</span>;
}

export const STATUS_CAPITULO_ROTULO: Record<string, { texto: string; cor: string }> = {
  rascunho: { texto: 'Rascunho', cor: 'stone' },
  traduzindo: { texto: 'Traduzindo', cor: 'blue' },
  traduzido: { texto: 'Traduzido', cor: 'teal' },
  revisado: { texto: 'Revisado', cor: 'amber' },
  finalizado: { texto: 'Finalizado', cor: 'green' },
};

export const STATUS_CASO_ROTULO: Record<string, { texto: string; cor: string }> = {
  confirmado: { texto: 'Confirmado', cor: 'green' },
  corrigido: { texto: 'Corrigido', cor: 'blue' },
  pendente: { texto: 'Pendente', cor: 'amber' },
  'regra-nova-necessaria': { texto: 'Regra nova necessária', cor: 'red' },
};
