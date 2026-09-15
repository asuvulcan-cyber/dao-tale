import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DEFINICOES_RELACOES_TERMO,
  type DefinicaoRelacaoTermo,
  type EntradaGlossario,
  type RelacaoTermo,
  type TipoRelacaoTermo,
} from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, Etiqueta } from '../App';

type Modo = 'genealogia' | 'rede' | 'editor';
type Posicao = { x: number; y: number };

const porTipo = new Map(DEFINICOES_RELACOES_TERMO.map((d) => [d.tipo, d]));
const tiposPais = new Set<TipoRelacaoTermo>(['pai-filha', 'pai-filho', 'mae-filha', 'mae-filho']);
const tiposIrmaos = new Set<TipoRelacaoTermo>(['irmao-irma', 'irmao-irmao', 'irma-irma']);

export function calcularGeracoes(relacoes: RelacaoTermo[]): Map<number, number> {
  const geracao = new Map<number, number>();
  const pessoas = new Set(relacoes.flatMap((r) => [r.origem_termo_id, r.destino_termo_id]));
  for (const id of pessoas) geracao.set(id, 0);
  // Relaxamento monotônico: pai/mãe fica uma geração acima do filho. O limite
  // protege dados históricos defeituosos sem travar a tela.
  for (let i = 0; i < pessoas.size; i++) {
    let mudou = false;
    for (const r of relacoes.filter((x) => tiposPais.has(x.tipo))) {
      const desejada = (geracao.get(r.origem_termo_id) ?? 0) + 1;
      if ((geracao.get(r.destino_termo_id) ?? 0) < desejada) {
        geracao.set(r.destino_termo_id, desejada);
        mudou = true;
      }
    }
    if (!mudou) break;
  }
  // Cônjuges e irmãos ocupam a mesma faixa; usa a geração mais profunda para
  // não puxar um filho de volta para o nível dos pais.
  for (let i = 0; i < 3; i++) {
    for (const r of relacoes.filter((x) => x.tipo === 'conjuges' || tiposIrmaos.has(x.tipo))) {
      const g = Math.max(geracao.get(r.origem_termo_id) ?? 0, geracao.get(r.destino_termo_id) ?? 0);
      geracao.set(r.origem_termo_id, g);
      geracao.set(r.destino_termo_id, g);
    }
  }
  return geracao;
}

function layoutGenealogia(relacoes: RelacaoTermo[]): { posicoes: Map<number, Posicao>; largura: number; altura: number } {
  const geracoes = calcularGeracoes(relacoes);
  const porGeracao = new Map<number, number[]>();
  for (const [id, g] of geracoes) porGeracao.set(g, [...(porGeracao.get(g) ?? []), id]);
  const paisPorFilho = new Map<number, number[]>();
  for (const r of relacoes.filter((x) => tiposPais.has(x.tipo))) {
    paisPorFilho.set(r.destino_termo_id, [...(paisPorFilho.get(r.destino_termo_id) ?? []), r.origem_termo_id]);
  }
  // IDs do banco não carregam informação visual. A partir da segunda geração,
  // aproxima cada descendente de seus pais para reduzir cruzamentos arbitrários.
  const linhas = [...porGeracao].sort(([a], [b]) => a - b);
  for (let i = 0; i < linhas.length; i++) {
    const ids = linhas[i][1];
    const anterior = i > 0 ? linhas[i - 1][1] : [];
    const indiceAnterior = new Map(anterior.map((id, indice) => [id, indice]));
    ids.sort((a, b) => {
      const centro = (id: number) => {
        const indices = (paisPorFilho.get(id) ?? []).map((pai) => indiceAnterior.get(pai)).filter((x): x is number => x != null);
        return indices.length ? indices.reduce((s, x) => s + x, 0) / indices.length : Number.MAX_SAFE_INTEGER;
      };
      return centro(a) - centro(b) || a - b;
    });
  }
  const maiorLinha = Math.max(1, ...[...porGeracao.values()].map((ids) => ids.length));
  const largura = Math.max(760, maiorLinha * 230 + 100);
  const altura = Math.max(320, (Math.max(0, ...porGeracao.keys()) + 1) * 190 + 80);
  const posicoes = new Map<number, Posicao>();
  for (const [g, ids] of linhas) {
    const passo = largura / (ids.length + 1);
    ids.forEach((id, i) => posicoes.set(id, { x: passo * (i + 1), y: 72 + g * 190 }));
  }
  return { posicoes, largura, altura };
}

function layoutRede(relacoes: RelacaoTermo[]): { posicoes: Map<number, Posicao>; largura: number; altura: number } {
  const ids = [...new Set(relacoes.flatMap((r) => [r.origem_termo_id, r.destino_termo_id]))];
  const largura = 1000;
  const altura = Math.max(620, ids.length * 22);
  const centro = { x: largura / 2, y: altura / 2 };
  const pos = new Map<number, Posicao>();
  ids.forEach((id, i) => {
    const a = (i / Math.max(1, ids.length)) * Math.PI * 2;
    const raio = Math.min(largura, altura) * 0.34;
    pos.set(id, { x: centro.x + Math.cos(a) * raio, y: centro.y + Math.sin(a) * raio });
  });
  // Pequeno layout de forças determinístico: aproxima termos relacionados e
  // afasta cartões, preservando a leitura mesmo quando a rede crescer.
  for (let passo = 0; passo < 180; passo++) {
    const delta = new Map(ids.map((id) => [id, { x: 0, y: 0 }]));
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = pos.get(ids[i])!; const b = pos.get(ids[j])!;
      const dx = a.x - b.x; const dy = a.y - b.y; const d2 = Math.max(900, dx * dx + dy * dy);
      const f = 18000 / d2;
      delta.get(ids[i])!.x += dx * f; delta.get(ids[i])!.y += dy * f;
      delta.get(ids[j])!.x -= dx * f; delta.get(ids[j])!.y -= dy * f;
    }
    for (const r of relacoes) {
      const a = pos.get(r.origem_termo_id)!; const b = pos.get(r.destino_termo_id)!;
      const dx = b.x - a.x; const dy = b.y - a.y; const f = 0.012;
      delta.get(r.origem_termo_id)!.x += dx * f; delta.get(r.origem_termo_id)!.y += dy * f;
      delta.get(r.destino_termo_id)!.x -= dx * f; delta.get(r.destino_termo_id)!.y -= dy * f;
    }
    for (const id of ids) {
      const p = pos.get(id)!; const d = delta.get(id)!;
      p.x = Math.min(largura - 95, Math.max(95, p.x + d.x * 0.08 + (centro.x - p.x) * 0.002));
      p.y = Math.min(altura - 45, Math.max(45, p.y + d.y * 0.08 + (centro.y - p.y) * 0.002));
    }
  }
  return { posicoes: pos, largura, altura };
}

function GrafoSvg({
  entradas, relacoes, genealogia, aoAbrir,
}: {
  entradas: EntradaGlossario[]; relacoes: RelacaoTermo[]; genealogia: boolean; aoAbrir: (id: number) => void;
}) {
  const porId = new Map(entradas.map((e) => [e.id, e]));
  const layout = useMemo(() => genealogia ? layoutGenealogia(relacoes) : layoutRede(relacoes), [genealogia, relacoes]);
  const ids = [...layout.posicoes.keys()];
  if (ids.length === 0) return <p className="py-10 text-center text-sm text-tinta-2">Nenhuma relação deste tipo cadastrada.</p>;
  return (
    <div className="min-w-0 max-w-full">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tinta-2" aria-hidden="true">
        {genealogia ? <>
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-5 bg-jade-forte" /> descendência</span>
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-5 bg-selo-forte" /> casamento</span>
          <span className="flex items-center gap-1.5"><i className="w-5 border-t-2 border-dashed border-jade-forte" /> irmãos</span>
        </> : <span>As cores distinguem família, organização, relações sociais e lugares.</span>}
      </div>
      <p className="mb-1.5 text-xs text-tinta-2 sm:hidden">Deslize horizontalmente para explorar o mapa.</p>
      <div className="w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-linha bg-papel-fundo/30 shadow-inner">
      <svg viewBox={`0 0 ${layout.largura} ${layout.altura}`} className="block min-h-[420px] min-w-[760px] max-w-none" style={{ width: `${Math.max(760, layout.largura)}px` }} role="img" aria-label={genealogia ? 'Árvore genealógica' : 'Rede narrativa'}>
        <defs>
          <marker id="seta-relacao" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" style={{ fill: 'var(--cor-jade-forte)' }} /></marker>
          <filter id="sombra-no" x="-15%" y="-25%" width="130%" height="160%"><feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.12" /></filter>
        </defs>
        {relacoes.map((r) => {
          const a = layout.posicoes.get(r.origem_termo_id); const b = layout.posicoes.get(r.destino_termo_id);
          if (!a || !b) return null;
          const def = porTipo.get(r.tipo)!;
          const simetrica = def.simetrica;
          const meioX = (a.x + b.x) / 2;
          const meioY = (a.y + b.y) / 2 - 6;
          const larguraRotulo = Math.max(54, def.rotulo_direto.length * 6.2 + 14);
          const grupo = def.grupo;
          const cor = r.tipo === 'conjuges' ? 'var(--cor-selo-forte)' : grupo === 'geografia' ? 'var(--cor-indigo-forte)' : 'var(--cor-jade-forte)';
          const caminho = genealogia && tiposPais.has(r.tipo)
            ? `M ${a.x} ${a.y + 37} V ${(a.y + b.y) / 2} H ${b.x} V ${b.y - 37}`
            : `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
          return <g key={r.id}>
            <path d={caminho} fill="none" style={{ stroke: cor }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={tiposIrmaos.has(r.tipo) ? '6 5' : undefined} markerEnd={simetrica ? undefined : 'url(#seta-relacao)'} opacity="0.82" />
            <rect x={meioX - larguraRotulo / 2} y={meioY - 11} width={larguraRotulo} height="18" rx="9" style={{ fill: 'var(--cor-papel-alto)', stroke: 'var(--cor-linha)' }} strokeWidth="1" />
            <text x={meioX} y={meioY + 2} textAnchor="middle" style={{ fill: 'var(--cor-tinta)' }} className="text-[11px] font-medium">{def.rotulo_direto}</text>
          </g>;
        })}
        {ids.map((id) => {
          const p = layout.posicoes.get(id)!; const e = porId.get(id);
          if (!e) return null;
          const nome = e.termo_pt.length > 22 ? `${e.termo_pt.slice(0, 21)}…` : e.termo_pt;
          return <g key={id} onClick={() => aoAbrir(id)} className="cursor-pointer" role="button" tabIndex={0}>
            <rect x={p.x - 96} y={p.y - 36} width="192" height="72" rx="12" style={{ fill: 'var(--cor-papel-alto)', stroke: 'var(--cor-linha)' }} strokeWidth="1.25" filter="url(#sombra-no)" />
            <rect x={p.x - 96} y={p.y - 36} width="5" height="72" rx="2.5" style={{ fill: 'var(--cor-jade-forte)' }} />
            <text x={p.x} y={p.y - 6} textAnchor="middle" style={{ fill: 'var(--cor-tinta)' }} className="text-[14px] font-semibold">{nome}</text>
            <text x={p.x} y={p.y + 15} textAnchor="middle" style={{ fill: 'var(--cor-tinta-2)' }} className="text-[10px] uppercase tracking-wide">{e.categoria}</text>
          </g>;
        })}
      </svg>
      </div>
    </div>
  );
}

export function RelacoesNarrativas({ obraId, entradas, modo, aoAbrir }: { obraId: string; entradas: EntradaGlossario[]; modo: Modo; aoAbrir: (id: number) => void }) {
  const cliente = useQueryClient();
  const [erro, setErro] = useState('');
  const { data: relacoes = [] } = useQuery({
    queryKey: ['glossario-relacoes', obraId],
    queryFn: () => api<RelacaoTermo[]>('GET', `/obras/${obraId}/glossario/relacoes`),
  });
  const genealogicas = relacoes.filter((r) => porTipo.get(r.tipo)?.grupo === 'genealogia');
  if (modo === 'genealogia') return <GrafoSvg entradas={entradas} relacoes={genealogicas} genealogia aoAbrir={aoAbrir} />;
  if (modo === 'rede') return <GrafoSvg entradas={entradas} relacoes={relacoes} genealogia={false} aoAbrir={aoAbrir} />;
  return <EditorRelacoes obraId={obraId} entradas={entradas} relacoes={relacoes} erro={erro} setErro={setErro} aoMudar={() => cliente.invalidateQueries({ queryKey: ['glossario-relacoes', obraId] })} aoAbrir={aoAbrir} />;
}

function EditorRelacoes({ obraId, entradas, relacoes, erro, setErro, aoMudar, aoAbrir }: {
  obraId: string; entradas: EntradaGlossario[]; relacoes: RelacaoTermo[]; erro: string; setErro: (e: string) => void; aoMudar: () => void; aoAbrir: (id: number) => void;
}) {
  const canonicas = entradas.filter((e) => e.principal_id == null).sort((a, b) => a.termo_pt.localeCompare(b.termo_pt, 'pt-BR'));
  const [origem, setOrigem] = useState<number | ''>(''); const [destino, setDestino] = useState<number | ''>('');
  const [tipo, setTipo] = useState<TipoRelacaoTermo>('pai-filha'); const [nota, setNota] = useState('');
  const [inicio, setInicio] = useState(''); const [fim, setFim] = useState('');
  const criar = useMutation({
    mutationFn: () => api('POST', `/obras/${obraId}/glossario/relacoes`, {
      origem_termo_id: origem, destino_termo_id: destino, tipo, nota: nota || null,
      capitulo_inicio: inicio === '' ? null : Number(inicio), capitulo_fim: fim === '' ? null : Number(fim),
    }),
    onSuccess: () => { setNota(''); setErro(''); aoMudar(); }, onError: (e) => setErro((e as Error).message),
  });
  const excluir = useMutation({ mutationFn: (id: number) => api('DELETE', `/glossario/relacoes/${id}`), onSuccess: aoMudar, onError: (e) => setErro((e as Error).message) });
  const porId = new Map(entradas.map((e) => [e.id, e]));
  const grupos: Array<[DefinicaoRelacaoTermo['grupo'], string]> = [['genealogia', 'Genealogia'], ['organizacao', 'Organizações'], ['social', 'Relações sociais'], ['geografia', 'Origem e localização']];
  return <div className="space-y-4">
    {erro && <Aviso tipo="erro">{erro}</Aviso>}
    <form onSubmit={(e) => { e.preventDefault(); criar.mutate(); }} className="grid min-w-0 gap-2 rounded-lg border border-linha bg-papel-fundo/40 p-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <select required value={origem} onChange={(e) => setOrigem(e.target.value ? Number(e.target.value) : '')} className="entrada w-full min-w-0 max-w-full text-sm"><option value="">Primeiro termo…</option>{canonicas.map((x) => <option key={x.id} value={x.id}>{x.termo_pt} ({x.termo_zh})</option>)}</select>
      <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoRelacaoTermo)} className="entrada w-full min-w-0 max-w-full text-sm">{grupos.map(([grupo, rotulo]) => <optgroup key={grupo} label={rotulo}>{DEFINICOES_RELACOES_TERMO.filter((d) => d.grupo === grupo).map((d) => <option key={d.tipo} value={d.tipo}>{d.rotulo_direto} / {d.rotulo_inverso}</option>)}</optgroup>)}</select>
      <select required value={destino} onChange={(e) => setDestino(e.target.value ? Number(e.target.value) : '')} className="entrada w-full min-w-0 max-w-full text-sm"><option value="">Segundo termo…</option>{canonicas.map((x) => <option key={x.id} value={x.id}>{x.termo_pt} ({x.termo_zh})</option>)}</select>
      <div className="min-w-0"><Botao type="submit" disabled={origem === '' || destino === '' || criar.isPending} className="w-full">Relacionar</Botao></div>
      <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Nota/proveniência opcional" className="entrada w-full min-w-0 text-sm md:col-span-2" />
      <div className="grid min-w-0 grid-cols-2 gap-2"><input type="number" min="0" value={inicio} onChange={(e) => setInicio(e.target.value)} placeholder="desde cap." className="entrada w-full min-w-0 text-sm" /><input type="number" min="0" value={fim} onChange={(e) => setFim(e.target.value)} placeholder="até cap." className="entrada w-full min-w-0 text-sm" /></div>
    </form>
    <div className="grid gap-2 lg:grid-cols-2">
      {relacoes.map((r) => { const a = porId.get(r.origem_termo_id); const b = porId.get(r.destino_termo_id); const d = porTipo.get(r.tipo)!; return <div key={r.id} className="min-w-0 rounded-lg border border-linha p-3 text-sm">
        <div className="relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 pr-7 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-center sm:pr-0">
          <button onClick={() => a && aoAbrir(a.id)} className="min-w-0 truncate text-left font-medium hover:underline sm:text-right">{a?.termo_pt ?? 'Termo ausente'}</button>
          <span className="row-start-2 w-fit max-w-full rounded-full border border-jade/40 bg-jade-tint px-2 py-0.5 text-xs font-medium text-jade-forte sm:row-start-auto">{d.rotulo_direto} →</span>
          <button onClick={() => b && aoAbrir(b.id)} className="col-span-2 min-w-0 truncate text-left font-medium hover:underline sm:col-span-1">{b?.termo_pt ?? 'Termo ausente'}</button>
          <button onClick={() => window.confirm('Excluir esta relação?') && excluir.mutate(r.id)} className="absolute justify-self-end text-lg text-erro sm:static" aria-label="Excluir relação">×</button>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1 text-xs text-tinta-2"><Etiqueta>{d.grupo}</Etiqueta>{r.capitulo_inicio != null && <span>desde cap. {r.capitulo_inicio}</span>}{r.capitulo_fim != null && <span>até cap. {r.capitulo_fim}</span>}{r.nota && <span className="min-w-0 break-words">· {r.nota}</span>}</div>
      </div>; })}
      {relacoes.length === 0 && <p className="py-6 text-center text-sm text-tinta-2 lg:col-span-2">Nenhuma relação narrativa cadastrada.</p>}
    </div>
  </div>;
}
