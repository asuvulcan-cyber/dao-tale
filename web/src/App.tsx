import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CATEGORIAS_GLOSSARIO, type CategoriaGlossario, type EstadoSaude } from '@dao-tale/shared';
import { api } from './api';

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

/** Tarja de instância (doc 10 §2): mostra a porta e, quando NÃO é a instância
    real (porta padrão + pasta canônica), avisa em destaque qual pasta está no ar
    — resolve a confusão histórica entre 8317 (real) e 8399/8412 (testes). */
function TarjaInstancia() {
  const { data } = useQuery({
    queryKey: ['saude'],
    queryFn: () => api<EstadoSaude>('GET', '/saude'),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  if (!data) return null;
  if (data.canonico) {
    return (
      <span
        className="hidden rounded-full border border-linha px-2 py-0.5 text-xs text-tinta-2 sm:inline"
        title={`Pasta de dados: ${data.caminho_dados}`}
      >
        :{data.porta}
      </span>
    );
  }
  return (
    <span
      className="rounded-full border border-selo bg-selo-tint px-2 py-0.5 text-xs font-medium text-selo-forte"
      title={`Instância de teste — pasta de dados: ${data.caminho_dados}`}
    >
      instância de teste · :{data.porta}
    </span>
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
            <TarjaInstancia />
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
              to="/prompt-padrao"
              className={({ isActive }) =>
                isActive ? 'font-semibold text-tinta' : 'text-tinta-2 hover:text-tinta'
              }
            >
              Prompt padrão
            </NavLink>
            <NavLink
              to="/docs"
              className={({ isActive }) =>
                isActive ? 'font-semibold text-tinta' : 'text-tinta-2 hover:text-tinta'
              }
            >
              Guia
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

/** Menu suspenso que fecha ao clicar fora ou ao acionar um item (link/botão).
    Itens com o atributo `data-manter` não fecham o menu (controles A−/A+ etc.). */
export function MenuMais({
  titulo,
  rotulo = '⋯',
  children,
}: {
  titulo: string;
  rotulo?: string;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const aoClicarFora = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('pointerdown', aoClicarFora);
    return () => document.removeEventListener('pointerdown', aoClicarFora);
  }, [aberto]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        title={titulo}
        className="grid h-8 min-w-8 cursor-pointer place-items-center rounded-md border border-linha px-1.5 text-sm text-tinta-2 hover:border-jade hover:text-jade-forte"
      >
        {rotulo}
      </button>
      {aberto && (
        <div
          className="cartao absolute right-0 z-30 mt-1 flex w-56 flex-col gap-1 p-2 shadow-lg"
          onClick={(e) => {
            // Acionar um link ou botão fecha o menu; select/label e controles
            // marcados com data-manter (A−/A+, largura) não fecham.
            const alvo = e.target as Element;
            if (alvo.closest('[data-manter]')) return;
            if (alvo.closest('a, button')) setAberto(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Select de categoria do glossário: categorias padrão + as já usadas + criar nova. */
export function SeletorCategoria({
  valor,
  aoMudar,
  extras = [],
  className = 'entrada text-sm',
}: {
  valor: CategoriaGlossario;
  aoMudar: (c: CategoriaGlossario) => void;
  extras?: CategoriaGlossario[];
  className?: string;
}) {
  const opcoes = [...new Set([...CATEGORIAS_GLOSSARIO, ...extras, ...(valor ? [valor] : [])])].sort();
  return (
    <select
      value={valor}
      onChange={(e) => {
        if (e.target.value === '__nova') {
          const nova = window.prompt('Nome da nova categoria:')?.trim().toLowerCase();
          if (nova) aoMudar(nova.slice(0, 30));
        } else {
          aoMudar(e.target.value);
        }
      }}
      className={className}
    >
      {opcoes.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value="__nova">+ nova categoria…</option>
    </select>
  );
}

/** Cabeçalho padrão de página: título em serifa, descrição curta e ações à direita. */
export function CabecalhoPagina({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold">{titulo}</h2>
        {descricao && <p className="mt-0.5 max-w-[62ch] text-sm text-tinta-2">{descricao}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

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
  parcial: { texto: 'Parcial', cor: 'selo' },
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
