import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';

// ── Tema (claro/escuro) ─────────────────────────────────────────────────────
// Persiste a escolha explícita; sem escolha, segue o SO (prefers-color-scheme).
type Tema = 'claro' | 'escuro';
const CHAVE_TEMA = 'dao-tale-tema';

function temaEfetivo(): Tema {
  const salvo = localStorage.getItem(CHAVE_TEMA);
  if (salvo === 'claro' || salvo === 'escuro') return salvo;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

function aplicarTema(tema: Tema) {
  document.documentElement.setAttribute('data-theme', tema === 'escuro' ? 'dark' : 'light');
}

function BotaoTema() {
  const [tema, setTema] = useState<Tema>(() => temaEfetivo());
  useEffect(() => {
    aplicarTema(tema);
    localStorage.setItem(CHAVE_TEMA, tema);
  }, [tema]);
  const escuro = tema === 'escuro';
  return (
    <button
      type="button"
      onClick={() => setTema(escuro ? 'claro' : 'escuro')}
      className="flex items-center gap-1.5 rounded-full border border-linha bg-papel-alto px-3 py-1 text-sm text-tinta-2 hover:border-jade hover:text-jade-forte"
      aria-label={escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={escuro ? 'Tema claro' : 'Tema escuro'}
    >
      <span aria-hidden>{escuro ? '☀' : '☾'}</span>
    </button>
  );
}

export function Casca() {
  return (
    <div className="min-h-screen bg-papel text-tinta">
      <header className="border-b border-linha bg-papel-alto">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span
              className="grid size-8 place-items-center rounded-selo bg-selo font-zh text-lg leading-none text-papel-alto"
              aria-hidden
            >
              道
            </span>
            <span className="font-display text-xl font-semibold tracking-tight">Dao Tale</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                isActive ? 'font-semibold text-tinta' : 'text-tinta-2 hover:text-tinta'
              }
            >
              Obras
            </NavLink>
            <NavLink
              to="/configuracoes"
              className={({ isActive }) =>
                isActive ? 'font-semibold text-tinta' : 'text-tinta-2 hover:text-tinta'
              }
            >
              Configurações
            </NavLink>
            <BotaoTema />
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
    primario: 'bg-acao text-papel-alto hover:bg-acao-forte',
    secundario: 'border border-linha bg-papel-alto text-tinta hover:border-jade hover:text-jade-forte',
    perigo: 'border border-erro/45 bg-papel-alto text-erro hover:bg-selo-tint',
  };
  return <button {...resto} className={`${base} ${estilos[variante]} ${className}`} />;
}

export function Aviso({ tipo, children }: { tipo: 'erro' | 'ok' | 'info'; children: React.ReactNode }) {
  const estilos = {
    erro: 'border-selo bg-selo-tint text-selo-forte',
    ok: 'border-jade bg-jade-tint text-jade-forte',
    info: 'border-ocre bg-ocre-tint text-ocre-forte',
  };
  return <div className={`my-2 rounded border-l-4 border px-3 py-2 text-sm ${estilos[tipo]}`}>{children}</div>;
}

// Cores de etiqueta na nomenclatura de pigmentos/semânticos (ver docs/tokens-css.md).
export type CorEtiqueta = 'neutro' | 'jade' | 'indigo' | 'ocre' | 'selo';

export function Etiqueta({ children, cor = 'neutro' }: { children: React.ReactNode; cor?: CorEtiqueta }) {
  const cores: Record<CorEtiqueta, string> = {
    neutro: 'bg-papel-fundo text-tinta-2',
    jade: 'bg-jade-tint text-jade-forte',
    indigo: 'bg-indigo-tint text-indigo-forte',
    ocre: 'bg-ocre-tint text-ocre-forte',
    selo: 'bg-selo-tint text-selo-forte',
  };
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${cores[cor]}`}>{children}</span>;
}

export const STATUS_CAPITULO_ROTULO: Record<string, { texto: string; cor: CorEtiqueta }> = {
  rascunho: { texto: 'Rascunho', cor: 'neutro' },
  traduzindo: { texto: 'Traduzindo', cor: 'indigo' },
  traduzido: { texto: 'Traduzido', cor: 'jade' },
  revisado: { texto: 'Revisado', cor: 'ocre' },
  finalizado: { texto: 'Finalizado', cor: 'jade' },
};

export const STATUS_CASO_ROTULO: Record<string, { texto: string; cor: CorEtiqueta }> = {
  confirmado: { texto: 'Confirmado', cor: 'jade' },
  corrigido: { texto: 'Corrigido', cor: 'indigo' },
  pendente: { texto: 'Pendente', cor: 'ocre' },
  'regra-nova-necessaria': { texto: 'Regra nova necessária', cor: 'selo' },
};
