import { useMemo, useState } from 'react';
import type { EntradaGlossario } from '@dao-tale/shared';
import { CATEGORIAS_GLOSSARIO, ROTULOS_CATEGORIAS_GLOSSARIO } from '@dao-tale/shared';
import { Aviso } from '../App';
import { RelacoesNarrativas } from './RelacoesNarrativas';

export interface NoGlossario {
  entrada: EntradaGlossario;
  filhos: NoGlossario[];
}

export function construirFlorestaGlossario(entradas: EntradaGlossario[]): {
  raizes: NoGlossario[];
  orfaos: EntradaGlossario[];
  ciclos: EntradaGlossario[];
} {
  const porId = new Map(entradas.map((e) => [e.id, e]));
  const estruturais = entradas.filter((e) => e.principal_id == null);
  const filhos = new Map<number, EntradaGlossario[]>();
  const orfaos: EntradaGlossario[] = [];
  for (const entrada of estruturais) {
    if (entrada.termo_pai_id == null) continue;
    if (!porId.has(entrada.termo_pai_id)) orfaos.push(entrada);
    else filhos.set(entrada.termo_pai_id, [...(filhos.get(entrada.termo_pai_id) ?? []), entrada]);
  }

  const ciclosIds = new Set<number>();
  for (const entrada of estruturais) {
    const caminho = new Set<number>();
    let atual: EntradaGlossario | undefined = entrada;
    while (atual?.termo_pai_id != null) {
      if (caminho.has(atual.id)) {
        for (const id of caminho) ciclosIds.add(id);
        break;
      }
      caminho.add(atual.id);
      atual = porId.get(atual.termo_pai_id);
    }
  }

  const montar = (entrada: EntradaGlossario, ancestrais: Set<number>): NoGlossario => ({
    entrada,
    filhos: ancestrais.has(entrada.id)
      ? []
      : (filhos.get(entrada.id) ?? [])
          .filter((f) => !ciclosIds.has(f.id))
          .sort((a, b) => a.termo_pt.localeCompare(b.termo_pt, 'pt-BR'))
          .map((f) => montar(f, new Set([...ancestrais, entrada.id]))),
  });
  const raizes = estruturais
    .filter((e) => e.termo_pai_id == null && !ciclosIds.has(e.id))
    .sort((a, b) => a.termo_pt.localeCompare(b.termo_pt, 'pt-BR'))
    .map((e) => montar(e, new Set()));
  return { raizes, orfaos, ciclos: estruturais.filter((e) => ciclosIds.has(e.id)) };
}

function NoDaArvore({
  no,
  variantes,
  aoAbrir,
}: {
  no: NoGlossario;
  variantes: Map<number, EntradaGlossario[]>;
  aoAbrir: (id: number) => void;
}) {
  const [aberto, setAberto] = useState(true);
  const temFilhos = no.filhos.length > 0;
  const nomesAlternativos = variantes.get(no.entrada.id) ?? [];
  return (
    <li className="relative pl-6 before:absolute before:left-0 before:top-0 before:h-6 before:w-4 before:rounded-bl-lg before:border-b before:border-l before:border-linha last:after:absolute last:after:-left-px last:after:top-6 last:after:bottom-0 last:after:w-1 last:after:bg-papel-alto">
      <div className="group relative flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-linha bg-papel-alto px-3 py-2 shadow-sm transition hover:border-jade/60 hover:shadow-md">
        <button
          type="button"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-papel-fundo text-xs text-tinta-2 hover:bg-jade-tint hover:text-jade-forte disabled:bg-transparent disabled:opacity-30"
          disabled={!temFilhos}
          aria-expanded={temFilhos ? aberto : undefined}
          onClick={() => setAberto((v) => !v)}
        >
          {temFilhos ? (aberto ? '−' : '+') : '•'}
        </button>
        <button type="button" className="text-left font-medium text-tinta hover:text-jade-forte hover:underline" onClick={() => aoAbrir(no.entrada.id)}>
          {no.entrada.termo_pt}
          <span className="texto-zh ml-2 font-normal text-tinta-2">{no.entrada.termo_zh}</span>
        </button>
        <span className="rounded-full border border-linha bg-papel-fundo px-2 py-0.5 text-[10px] uppercase tracking-wide text-tinta-2">{no.entrada.categoria}</span>
        {temFilhos && <span className="ml-auto text-[10px] tabular-nums text-tinta-2">{no.filhos.length} {no.filhos.length === 1 ? 'ramo' : 'ramos'}</span>}
        {nomesAlternativos.map((v) => (
          <button
            type="button"
            key={v.id}
            onClick={() => aoAbrir(v.id)}
            className="rounded-full border border-dashed border-indigo/60 px-2 py-0.5 text-xs text-indigo-forte hover:bg-indigo-tint"
            title="Variante do mesmo referente"
          >
            ≈ {v.termo_pt}
          </button>
        ))}
      </div>
      {temFilhos && aberto && (
        <ul className="relative mt-2 space-y-2 border-l border-linha/70 pl-3">
          {no.filhos.map((filho) => <NoDaArvore key={filho.entrada.id} no={filho} variantes={variantes} aoAbrir={aoAbrir} />)}
        </ul>
      )}
    </li>
  );
}

export function MapaGlossario({ obraId, entradas, aoAbrir }: { obraId: string; entradas: EntradaGlossario[]; aoAbrir: (id: number) => void }) {
  const [aba, setAba] = useState<'arvore' | 'vinculos'>('arvore');
  const [categoria, setCategoria] = useState('');
  const filtradas = categoria ? entradas.filter((e) => e.categoria === categoria) : entradas;
  // Na árvore, conservamos os ancestrais dos resultados para não transformar um
  // filtro de categoria em falsos órfãos.
  const entradasDaArvore = useMemo(() => {
    if (!categoria) return entradas;
    const porId = new Map(entradas.map((e) => [e.id, e]));
    const ids = new Set(filtradas.map((e) => e.id));
    for (const entrada of filtradas) {
      let pai = entrada.termo_pai_id == null ? undefined : porId.get(entrada.termo_pai_id);
      while (pai && !ids.has(pai.id)) {
        ids.add(pai.id);
        pai = pai.termo_pai_id == null ? undefined : porId.get(pai.termo_pai_id);
      }
    }
    return entradas.filter((e) => ids.has(e.id));
  }, [categoria, entradas, filtradas]);
  const floresta = useMemo(() => construirFlorestaGlossario(entradasDaArvore), [entradasDaArvore]);
  const variantes = useMemo(() => {
    const mapa = new Map<number, EntradaGlossario[]>();
    for (const e of entradas) if (e.principal_id != null) mapa.set(e.principal_id, [...(mapa.get(e.principal_id) ?? []), e]);
    return mapa;
  }, [entradas]);
  const porId = new Map(entradas.map((e) => [e.id, e]));
  const vinculos = filtradas.flatMap((e) => [
    ...(e.termo_pai_id != null && porId.has(e.termo_pai_id)
      ? [{ origem: e, destino: porId.get(e.termo_pai_id)!, tipo: 'pertence a' as const }]
      : []),
    ...(e.principal_id != null && porId.has(e.principal_id)
      ? [{ origem: e, destino: porId.get(e.principal_id)!, tipo: 'variante de' as const }]
      : []),
  ]);

  return (
    <section className="cartao min-w-0 max-w-full overflow-hidden p-3 sm:p-4" aria-label="Mapa do Gama">
      <div className="mb-4 flex min-w-0 flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold">Relações do Gama</h3>
          <p className="text-xs text-tinta-2">Hierarquia dos termos e vínculos narrativos cadastrados no glossário.</p>
        </div>
        <div className="flex min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:items-center">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="entrada w-full min-w-0 max-w-full text-sm sm:w-auto">
            <option value="">Todas as categorias</option>
            {CATEGORIAS_GLOSSARIO.map((c) => <option key={c} value={c}>{ROTULOS_CATEGORIAS_GLOSSARIO[c]}</option>)}
          </select>
          <div className="grid w-full min-w-0 grid-cols-2 rounded-md border border-linha p-0.5 sm:flex sm:w-auto">
            <button type="button" onClick={() => setAba('arvore')} className={`rounded px-2.5 py-1.5 text-sm ${aba === 'arvore' ? 'bg-jade text-papel-alto' : 'text-tinta-2 hover:bg-papel-fundo'}`}>Árvore</button>
            <button type="button" onClick={() => setAba('vinculos')} className={`rounded px-2.5 py-1.5 text-sm ${aba === 'vinculos' ? 'bg-jade text-papel-alto' : 'text-tinta-2 hover:bg-papel-fundo'}`}>Relações</button>
          </div>
        </div>
      </div>

      {(floresta.orfaos.length > 0 || floresta.ciclos.length > 0) && (
        <Aviso tipo="erro">Há {floresta.orfaos.length} órfão(s) e {floresta.ciclos.length} termo(s) em ciclo. Corrija os vínculos antes de confiar no mapa.</Aviso>
      )}
      {aba === 'arvore' ? (
        <div className="rounded-xl border border-linha bg-papel-fundo/30 p-2 sm:p-4">
          <p className="mb-3 text-xs text-tinta-2">Hierarquia estrutural do glossário. Abra ou recolha cada ramo para explorar seus termos.</p>
          <ul className="space-y-3">
            {floresta.raizes.map((raiz) => <NoDaArvore key={raiz.entrada.id} no={raiz} variantes={variantes} aoAbrir={aoAbrir} />)}
            {floresta.raizes.length === 0 && <li className="py-6 text-center text-sm text-tinta-2">Nenhum termo nesta seleção.</li>}
          </ul>
        </div>
      ) : (
        <div className="space-y-5">
          <RelacoesNarrativas obraId={obraId} entradas={entradas} modo="editor" aoAbrir={aoAbrir} />
          <div>
            <h4 className="mb-2 text-sm font-semibold">Vínculos estruturais existentes</h4>
            <div className="grid gap-2 lg:grid-cols-2">
              {vinculos.map((v) => (
                <div key={`${v.tipo}-${v.origem.id}`} className="grid min-w-0 grid-cols-1 items-center gap-1 rounded-lg border border-linha bg-papel-fundo/40 p-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-2">
                  <button type="button" onClick={() => aoAbrir(v.origem.id)} className="truncate text-right font-medium hover:underline">{v.origem.termo_pt}</button>
                  <span className={v.tipo === 'variante de' ? 'w-fit rounded-full border border-dashed border-indigo/60 bg-indigo-tint px-2 py-0.5 text-xs text-indigo-forte' : 'w-fit rounded-full border border-jade/50 bg-jade-tint px-2 py-0.5 text-xs text-jade-forte'}>{v.tipo} →</span>
                  <button type="button" onClick={() => aoAbrir(v.destino.id)} className="truncate text-left font-medium hover:underline">{v.destino.termo_pt}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
