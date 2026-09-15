import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Frase, RevisaoLiteraria } from '@dao-tale/shared';
import { api, mensagemDeErro } from '../api';
import { Botao } from '../App';
import { TextoTraduzido } from './TextoRico';

type Foco = 'todas' | 'pendentes' | 'aprovadas' | 'rejeitadas';
type Coluna = 'zh' | 'ia' | 'vigente' | 'revisado';
type RespostaSombra = {
  lote_id: number | null;
  gravadas: RevisaoLiteraria[];
  bloqueadas: unknown[];
  sem_mudanca: number[];
  detector?: { examinadas: number; selecionadas: number } | null;
};

function correspondeAoFoco(revisao: RevisaoLiteraria | undefined, foco: Foco): boolean {
  if (foco === 'todas') return true;
  if (!revisao) return false;
  if (foco === 'pendentes') return revisao.status === 'pendente' || revisao.status === 'conflito';
  if (foco === 'aprovadas') return revisao.status === 'aprovada';
  return revisao.status === 'rejeitada';
}

function textoDaColuna(frase: Frase, revisao: RevisaoLiteraria | undefined, coluna: Coluna): string {
  if (coluna === 'zh') return frase.texto_zh;
  if (coluna === 'ia') return frase.texto_pt_original_ia ?? '⟦saída inicial indisponível⟧';
  if (coluna === 'vigente') return frase.texto_pt;
  return revisao?.texto_revisado ?? frase.texto_pt;
}

function tituloDoStatus(revisao: RevisaoLiteraria | undefined): string {
  if (!revisao) return 'Sem proposta: a revisão repete o texto vigente.';
  const rotulo = revisao.status === 'conflito' ? 'conflito com edição posterior' : revisao.status;
  return `Proposta ${rotulo}. Clique para ver justificativa e decidir.`;
}

export function ComparacaoRevisaoLiteraria({
  revisoes,
  frases,
  capituloId,
  capituloNumero,
  aoFechar,
  aoIrParaFrase,
}: {
  revisoes: RevisaoLiteraria[];
  frases: Frase[];
  capituloId: string;
  capituloNumero: number;
  aoFechar: () => void;
  aoIrParaFrase: (fraseId: number) => void;
}) {
  const cliente = useQueryClient();
  const lotes = useMemo(() => {
    const mapa = new Map<number, { id: number; rotulo: string; total: number }>();
    for (const revisao of revisoes) {
      const atual = mapa.get(revisao.lote_id);
      if (atual) atual.total += 1;
      else mapa.set(revisao.lote_id, { id: revisao.lote_id, rotulo: revisao.lote_rotulo, total: 1 });
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total || a.id - b.id);
  }, [revisoes]);
  const [loteId, setLoteId] = useState<number | null>(null);
  useEffect(() => {
    if (lotes.length && !lotes.some((l) => l.id === loteId)) setLoteId(lotes[0].id);
  }, [loteId, lotes]);

  const [foco, setFoco] = useState<Foco>('todas');
  const [selecionadaId, setSelecionadaId] = useState<number | null>(null);
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState('');
  const [erro, setErro] = useState('');
  const [mostrarSombra, setMostrarSombra] = useState(false);
  const [inicioSombra, setInicioSombra] = useState(0);
  const [quantidadeSombra, setQuantidadeSombra] = useState(6);
  const [resumoSombra, setResumoSombra] = useState('');

  const revisoesDoLote = useMemo(
    () => revisoes.filter((r) => r.lote_id === loteId).sort((a, b) => a.ordem - b.ordem),
    [loteId, revisoes],
  );
  const porFrase = useMemo(() => new Map(revisoesDoLote.map((r) => [r.frase_id, r])), [revisoesDoLote]);
  const frasesOrdenadas = useMemo(() => [...frases].sort((a, b) => a.ordem - b.ordem), [frases]);
  const paragrafos = useMemo(() => {
    const mapa = new Map<number, Frase[]>();
    for (const frase of frasesOrdenadas) mapa.set(frase.paragrafo, [...(mapa.get(frase.paragrafo) ?? []), frase]);
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
  }, [frasesOrdenadas]);
  const selecionada = selecionadaId == null ? undefined : porFrase.get(selecionadaId);
  const fraseSelecionada = selecionadaId == null ? undefined : frasesOrdenadas.find((f) => f.id === selecionadaId);

  const atualizar = () => {
    cliente.invalidateQueries({ queryKey: ['revisoes-literarias', capituloId] });
    cliente.invalidateQueries({ queryKey: ['capitulo', capituloId] });
  };
  const decidir = useMutation({
    mutationFn: ({ id, decisao }: { id: number; decisao: 'aprovar' | 'rejeitar' }) => api('POST', `/revisoes-literarias/${id}/decisao`, { decisao }),
    onSuccess: () => { setErro(''); atualizar(); },
    onError: (e) => setErro(mensagemDeErro(e)),
  });
  const salvar = useMutation({
    mutationFn: ({ revisao, texto }: { revisao: RevisaoLiteraria; texto: string }) => api('PUT', `/revisoes-literarias/${revisao.id}`, {
      texto_revisado: texto, justificativa: revisao.justificativa, categorias: revisao.categorias,
    }),
    onSuccess: () => { setEditando(false); setErro(''); atualizar(); },
    onError: (e) => setErro(mensagemDeErro(e)),
  });
  const gerarSombra = useMutation({
    mutationFn: () => api<RespostaSombra>('POST', `/capitulos/${capituloId}/revisao-literaria/sombra`, {
      inicio: inicioSombra, quantidade: quantidadeSombra, seletiva: true, adjudicar: false,
    }),
    onSuccess: (r) => {
      setErro('');
      const triagem = r.detector ? `${r.detector.selecionadas}/${r.detector.examinadas} selecionada(s) · ` : '';
      setResumoSombra(`${triagem}${r.gravadas.length} proposta(s), ${r.bloqueadas.length} bloqueada(s), ${r.sem_mudanca.length} sem mudança.`);
      atualizar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });
  const gerarCapituloInteiro = useMutation({
    mutationFn: async () => {
      const TAMANHO = 12;
      let lote: number | undefined;
      let propostas = 0;
      let bloqueadas = 0;
      let semMudanca = 0;
      for (let indice = 0; indice < frasesOrdenadas.length; indice += TAMANHO) {
        const inicio = frasesOrdenadas[indice]?.ordem;
        if (inicio == null) break;
        const r = await api<RespostaSombra>('POST', `/capitulos/${capituloId}/revisao-literaria/sombra`, {
          inicio,
          quantidade: Math.min(TAMANHO, frasesOrdenadas.length - indice),
          seletiva: true,
          adjudicar: false,
          ...(lote == null ? {} : { lote_id: lote }),
        });
        // Uma janela limpa retorna lote_id=null e não deve romper o lote já
        // aberto pelas janelas anteriores do mesmo capítulo.
        if (r.lote_id != null) lote = r.lote_id;
        propostas += r.gravadas.length;
        bloqueadas += r.bloqueadas.length;
        semMudanca += r.sem_mudanca.length;
        setResumoSombra(`Bloco ${Math.floor(indice / TAMANHO) + 1}/${Math.ceil(frasesOrdenadas.length / TAMANHO)} · ${propostas} proposta(s) até agora.`);
      }
      return { lote, propostas, bloqueadas, semMudanca };
    },
    onSuccess: (r) => {
      setErro('');
      if (r.lote != null) setLoteId(r.lote);
      setResumoSombra(`${r.propostas} proposta(s), ${r.bloqueadas} bloqueada(s), ${r.semMudanca} sem mudança no capítulo inteiro.`);
      atualizar();
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  const pendentes = revisoesDoLote.filter((r) => r.status === 'pendente' || r.status === 'conflito').length;
  const aprovadas = revisoesDoLote.filter((r) => r.status === 'aprovada').length;
  const rejeitadas = revisoesDoLote.filter((r) => r.status === 'rejeitada').length;
  const selecionar = (frase: Frase) => {
    setSelecionadaId(frase.id);
    setEditando(false);
    requestAnimationFrame(() => document.getElementById('comparacao-detalhe')?.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  };
  const classeTrecho = (frase: Frase, coluna: Coluna) => {
    const revisao = porFrase.get(frase.id);
    return [
      'cursor-pointer rounded px-0.5 transition-colors hover:bg-ocre-tint/70 focus:outline-none focus:ring-2 focus:ring-ocre',
      selecionadaId === frase.id ? 'bg-ocre-tint ring-2 ring-ocre' : '',
      coluna === 'revisado' && revisao && selecionadaId !== frase.id ? 'bg-jade-tint/35' : '',
      !correspondeAoFoco(revisao, foco) ? 'opacity-35' : '',
      revisao?.status === 'rejeitada' && coluna === 'revisado' ? 'line-through decoration-erro/60' : '',
    ].filter(Boolean).join(' ');
  };

  const renderizarColuna = (frasesDoParagrafo: Frase[], lado: Coluna) => (
    <div data-coluna={lado} className={`min-w-0 whitespace-pre-wrap px-4 py-4 text-[0.94rem] leading-7 ${lado === 'zh' ? 'texto-zh bg-papel-fundo/35' : lado === 'revisado' ? 'bg-jade-tint/10' : ''}`}>
      {frasesDoParagrafo.map((frase, indice) => {
        const revisao = porFrase.get(frase.id);
        return (
          <span key={frase.id}>
            {indice > 0 && ' '}
            <span
              role="button"
              data-ordem={frase.ordem}
              tabIndex={0}
              className={classeTrecho(frase, lado)}
              title={`Frase ${capituloNumero}.${frase.ordem}. ${tituloDoStatus(revisao)}`}
              onClick={() => selecionar(frase)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selecionar(frase); }}
            >
              <sup className="mr-1 select-none font-mono text-[0.62rem] font-normal text-tinta-2">{frase.ordem}</sup>
              {lado === 'zh'
                ? textoDaColuna(frase, revisao, lado)
                : <TextoTraduzido texto={textoDaColuna(frase, revisao, lado)} marcador={null} />}
            </span>
          </span>
        );
      })}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-tinta/40 p-2 backdrop-blur-xs md:p-5" role="dialog" aria-modal="true">
      <div className="mx-auto flex min-h-0 w-full max-w-[118rem] flex-1 flex-col overflow-hidden rounded-xl border border-linha bg-papel-alto shadow-xl">
        <header className="z-20 flex flex-wrap items-center gap-3 border-b border-linha bg-papel-alto px-5 py-3">
          <div className="min-w-[18rem] flex-1">
            <h3 className="font-display text-lg font-semibold">Capítulo {capituloNumero} · revisão literária em sombra</h3>
            <p className="text-xs text-tinta-2">Leia o capítulo inteiro. Os números discretos ligam o mesmo trecho nas quatro versões; clique em qualquer frase para decidir.</p>
          </div>
          {lotes.length > 1 && (
            <label className="text-xs text-tinta-2">Lote
              <select value={loteId ?? ''} onChange={(e) => { setLoteId(Number(e.target.value)); setSelecionadaId(null); }} className="entrada ml-2 max-w-80">
                {lotes.map((lote) => <option key={lote.id} value={lote.id}>{lote.rotulo} ({lote.total})</option>)}
              </select>
            </label>
          )}
          <select value={foco} onChange={(e) => setFoco(e.target.value as Foco)} className="entrada" aria-label="Destacar decisões">
            <option value="todas">Leitura integral</option>
            <option value="pendentes">Destacar pendentes</option>
            <option value="aprovadas">Destacar aprovadas</option>
            <option value="rejeitadas">Destacar rejeitadas</option>
          </select>
          <Botao variante="secundario" onClick={() => setMostrarSombra((v) => !v)}>Nova passada em sombra</Botao>
          <Botao variante="secundario" onClick={aoFechar}>Fechar</Botao>
          <div className="basis-full text-xs text-tinta-2">
            {frasesOrdenadas.length} frases · {pendentes} pendente(s) · {aprovadas} aprovada(s) · {rejeitadas} rejeitada(s) · {frasesOrdenadas.length - revisoesDoLote.length} sem proposta
          </div>
        </header>
        {erro && <p className="mx-5 mt-3 rounded bg-selo-tint px-3 py-2 text-sm text-erro">{erro}</p>}
        {mostrarSombra && (
          <section className="mx-5 mt-3 rounded-lg border border-linha bg-papel p-3">
            <p className="text-sm font-semibold">Gerar candidatos com revisão seletiva</p>
            <p className="mt-1 text-xs text-tinta-2">A triagem chama a IA somente nas frases diagnosticadas. As propostas ficam pendentes e nenhum texto é aplicado automaticamente.</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-xs text-tinta-2">Frase inicial<input type="number" min={0} value={inicioSombra} onChange={(e) => setInicioSombra(Number(e.target.value))} className="entrada mt-1 block w-24" /></label>
              <label className="text-xs text-tinta-2">Quantidade (1–12)<input type="number" min={1} max={12} value={quantidadeSombra} onChange={(e) => setQuantidadeSombra(Math.max(1, Math.min(12, Number(e.target.value))))} className="entrada mt-1 block w-24" /></label>
              <Botao onClick={() => gerarSombra.mutate()} disabled={gerarSombra.isPending}>{gerarSombra.isPending ? 'Revisando…' : 'Executar seleção em sombra'}</Botao>
              <Botao onClick={() => gerarCapituloInteiro.mutate()} disabled={gerarCapituloInteiro.isPending || gerarSombra.isPending}>
                {gerarCapituloInteiro.isPending ? 'Triando capítulo…' : 'Triar capítulo inteiro'}
              </Botao>
              {resumoSombra && <span className="text-xs text-tinta-2">{resumoSombra}</span>}
            </div>
          </section>
        )}
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="min-w-[100rem]">
            <div className="sticky top-0 z-10 grid grid-cols-4 border-b border-linha bg-papel-alto/95 text-xs font-semibold uppercase tracking-wide text-tinta-2 shadow-sm backdrop-blur">
              <div className="border-r border-linha px-4 py-2">Original chinês</div>
              <div className="border-r border-linha px-4 py-2">Primeira saída da IA</div>
              <div className="border-r border-linha px-4 py-2">Texto vigente</div>
              <div className="px-4 py-2">Revisão proposta</div>
            </div>
            {paragrafos.map(([paragrafo, frasesDoParagrafo]) => (
              <div key={paragrafo} className="grid grid-cols-4 border-b border-linha/70">
                <div className="border-r border-linha/70">{renderizarColuna(frasesDoParagrafo, 'zh')}</div>
                <div className="border-r border-linha/70">{renderizarColuna(frasesDoParagrafo, 'ia')}</div>
                <div className="border-r border-linha/70">{renderizarColuna(frasesDoParagrafo, 'vigente')}</div>
                <div>{renderizarColuna(frasesDoParagrafo, 'revisado')}</div>
              </div>
            ))}
          </div>
        </div>
        <section id="comparacao-detalhe" className="z-20 border-t border-linha bg-papel-alto px-5 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          {!fraseSelecionada ? (
            <p className="text-sm text-tinta-2">Selecione uma frase no capítulo para ver a justificativa e aprovar, rejeitar ou editar a proposta.</p>
          ) : !selecionada ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm"><span className="font-mono text-jade-forte">[{capituloNumero}.{fraseSelecionada.ordem}]</span> Esta frase não tem proposta: o revisado é igual ao vigente.</p>
              <Botao variante="secundario" onClick={() => aoIrParaFrase(fraseSelecionada.id)}>Abrir no editor</Botao>
            </div>
          ) : (
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-tinta-2">
                  <span className="font-mono text-jade-forte">[{capituloNumero}.{selecionada.ordem}]</span>
                  <span className="rounded bg-papel-fundo px-1.5 py-0.5">{selecionada.status}</span>
                  {selecionada.categorias.map((c) => <span key={c} className="rounded bg-ocre-tint px-1.5 py-0.5">{c}</span>)}
                </div>
                {editando ? <textarea value={rascunho} onChange={(e) => setRascunho(e.target.value)} rows={4} className="entrada mt-2 w-full resize-y" /> : <p className="mt-2 text-sm leading-relaxed">{selecionada.texto_revisado}</p>}
                {selecionada.justificativa && <p className="mt-1 text-xs text-tinta-2">{selecionada.justificativa}</p>}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Botao variante="secundario" onClick={() => aoIrParaFrase(selecionada.frase_id)}>Abrir no editor</Botao>
                {(selecionada.status === 'pendente' || selecionada.status === 'conflito') && (editando ? (
                  <><Botao variante="secundario" onClick={() => setEditando(false)}>Cancelar</Botao><Botao onClick={() => salvar.mutate({ revisao: selecionada, texto: rascunho })} disabled={!rascunho.trim() || salvar.isPending}>Salvar proposta</Botao></>
                ) : (
                  <><Botao variante="secundario" onClick={() => { setEditando(true); setRascunho(selecionada.texto_revisado); }}>Editar</Botao><Botao variante="secundario" onClick={() => decidir.mutate({ id: selecionada.id, decisao: 'rejeitar' })}>Rejeitar</Botao><Botao onClick={() => decidir.mutate({ id: selecionada.id, decisao: 'aprovar' })} disabled={selecionada.status === 'conflito'}>Aprovar</Botao></>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
