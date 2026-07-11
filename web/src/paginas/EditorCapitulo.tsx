import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Capitulo,
  CasoTeste,
  Frase,
  ProgressoTraducao,
  ProvedorId,
  RespostaRevisao,
  StatusCapitulo,
} from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, Etiqueta, STATUS_CAPITULO_ROTULO, STATUS_CASO_ROTULO } from '../App';
import { IndicadorCota } from '../componentes/IndicadorCota';

interface DetalheCapitulo {
  capitulo: Capitulo;
  frases: Frase[];
  progresso: ProgressoTraducao;
}

interface ViolacaoConsistencia {
  frase_id: number;
  ordem: number;
  termo_zh: string;
  termo_pt: string;
  texto_zh: string;
  texto_pt: string;
}

export function EditorCapitulo() {
  const { obraId, capituloId } = useParams();
  const clienteQuery = useQueryClient();
  const [fraseSelecionada, setFraseSelecionada] = useState<number | null>(null);
  const [progressoVivo, setProgressoVivo] = useState<ProgressoTraducao | null>(null);
  const [erroJob, setErroJob] = useState('');
  const [provedorEscolhido, setProvedorEscolhido] = useState('');
  const [mostrarConsistencia, setMostrarConsistencia] = useState(false);
  const fonteEventos = useRef<EventSource | null>(null);

  const { data: provedores } = useQuery({
    queryKey: ['provedores'],
    queryFn: () => api<{ id: ProvedorId; nome: string }[]>('GET', '/provedores'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['capitulo', capituloId],
    queryFn: () => api<DetalheCapitulo>('GET', `/capitulos/${capituloId}`),
  });

  // Conecta ao SSE de progresso; usado tanto ao iniciar tradução quanto ao abrir
  // a página com um job já em andamento (retomada após fechar o navegador).
  function conectarEventos() {
    fonteEventos.current?.close();
    const fonte = new EventSource(`/api/capitulos/${capituloId}/traducao/eventos`);
    fonteEventos.current = fonte;
    fonte.addEventListener('progresso', (e) => {
      setProgressoVivo(JSON.parse(e.data));
      // As frases do bloco recém-concluído aparecem no editor sem esperar o job acabar.
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
      clienteQuery.invalidateQueries({ queryKey: ['uso-hoje'] });
    });
    fonte.addEventListener('termos_sugeridos', () => {
      clienteQuery.invalidateQueries({ queryKey: ['termos-sugeridos', obraId, 'pendente'] });
    });
    fonte.addEventListener('job_concluido', (e) => {
      setProgressoVivo(JSON.parse(e.data));
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
      fonte.close();
    });
    fonte.addEventListener('job_erro', (e) => {
      setErroJob(JSON.parse(e.data).mensagem);
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
      fonte.close();
    });
    fonte.onerror = () => {
      // Conexão caiu: recarrega o estado via REST (fallback de polling simples).
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
      fonte.close();
    };
  }

  useEffect(() => {
    if (data?.progresso.em_execucao && !fonteEventos.current) conectarEventos();
    return () => {
      fonteEventos.current?.close();
      fonteEventos.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.progresso.em_execucao, capituloId]);

  const traduzir = useMutation({
    mutationFn: (opcoes: { sobrescrever?: boolean; sobrescrever_editadas?: boolean } = {}) =>
      api('POST', `/capitulos/${capituloId}/traduzir`, {
        ...(provedorEscolhido ? { provedor: provedorEscolhido } : {}),
        ...opcoes,
      }),
    onSuccess: () => {
      setErroJob('');
      conectarEventos();
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
    },
    onError: (e) => setErroJob((e as Error).message),
  });

  function retraduzirTudo(frases: Frase[]) {
    if (!window.confirm('Retraduzir o capítulo inteiro com o provedor selecionado?')) return;
    const editadas = frases.filter((f) => f.editado_manualmente).length;
    let sobrescreverEditadas = false;
    if (editadas > 0) {
      sobrescreverEditadas = window.confirm(
        `Há ${editadas} frase${editadas === 1 ? '' : 's'} editada${editadas === 1 ? '' : 's'} manualmente.\n\n` +
          'OK — sobrescrever TAMBÉM as editadas.\nCancelar — preservar as editadas e retraduzir só o resto.',
      );
    }
    traduzir.mutate({ sobrescrever: true, sobrescrever_editadas: sobrescreverEditadas });
  }

  const cancelar = useMutation({
    mutationFn: () => api('POST', `/capitulos/${capituloId}/traduzir/cancelar`),
  });

  const mudarStatus = useMutation({
    mutationFn: (status: StatusCapitulo) => api('PUT', `/capitulos/${capituloId}`, { status }),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] }),
  });

  const paragrafos = useMemo(() => {
    if (!data) return [];
    const grupos = new Map<number, Frase[]>();
    for (const f of data.frases) {
      const lista = grupos.get(f.paragrafo) ?? [];
      lista.push(f);
      grupos.set(f.paragrafo, lista);
    }
    return [...grupos.entries()].sort(([a], [b]) => a - b);
  }, [data]);

  if (isLoading || !data) return <p className="text-stone-500">Carregando…</p>;

  const progresso = progressoVivo ?? data.progresso;
  const { capitulo, frases } = data;
  const pendentes = frases.filter((f) => f.status_traducao === 'pendente').length;
  const comErro = frases.filter((f) => f.status_traducao === 'erro').length;
  const emExecucao = progresso.em_execucao;
  const selecionada = frases.find((f) => f.id === fraseSelecionada) ?? null;
  const pct = progresso.frases_total > 0 ? Math.round((progresso.frases_prontas / progresso.frases_total) * 100) : 0;
  const palavrasPt = frases.reduce((n, f) => n + (f.texto_pt.trim() ? f.texto_pt.trim().split(/\s+/).length : 0), 0);
  const caracteresZh = frases.reduce((n, f) => n + [...f.texto_zh].length, 0);

  return (
    <div>
      {/* Barra superior (tela 4.3 do briefing) */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-stone-300 bg-white px-4 py-2.5">
        <h2 className="font-semibold">
          Capítulo {capitulo.numero}
          {(capitulo.titulo_pt || capitulo.titulo) && (
            <span className="ml-2 font-normal text-stone-600">{capitulo.titulo_pt ?? capitulo.titulo}</span>
          )}
          {capitulo.titulo_pt && capitulo.titulo && capitulo.titulo !== capitulo.titulo_pt && (
            <span className="texto-zh ml-2 text-sm font-normal text-stone-400" title="Título original">
              {capitulo.titulo}
            </span>
          )}
        </h2>
        <select
          value={capitulo.status}
          onChange={(e) => mudarStatus.mutate(e.target.value as StatusCapitulo)}
          className="rounded border border-stone-300 px-2 py-1 text-sm"
        >
          {Object.entries(STATUS_CAPITULO_ROTULO).map(([valor, r]) => (
            <option key={valor} value={valor}>
              {r.texto}
            </option>
          ))}
        </select>
        <span className="text-sm text-stone-500">
          {frases.length - pendentes - comErro}/{frases.length} traduzidas
          {comErro > 0 && <span className="text-red-600"> · {comErro} com erro</span>}
          {palavrasPt > 0 && (
            <span title={`${caracteresZh.toLocaleString('pt-BR')} caracteres no original chinês`}>
              {' '}· {palavrasPt.toLocaleString('pt-BR')} palavras
            </span>
          )}
        </span>
        {capitulo.provedor && (
          <Etiqueta>
            {capitulo.provedor} · {capitulo.modelo}
          </Etiqueta>
        )}
        <div className="ml-auto flex items-center gap-2">
          <IndicadorCota compacto />
          {frases.some((f) => f.status_traducao === 'traduzida') && !emExecucao && (
            <>
              <a href={`/api/capitulos/${capitulo.id}/baixar?formato=md`} download title="Markdown: preserva itálico/negrito que a tradução usar, com título do capítulo">
                <Botao variante="secundario">Baixar .md</Botao>
              </a>
              <a href={`/api/capitulos/${capitulo.id}/baixar`} download title="Texto puro corrido, com os parágrafos originais">
                <Botao variante="secundario">.txt</Botao>
              </a>
              <a href={`/api/capitulos/${capitulo.id}/baixar?formato=bilingue`} download title="Versão com pares chinês/português por parágrafo, para revisão externa">
                <Botao variante="secundario">Bilíngue</Botao>
              </a>
              <Botao variante="secundario" onClick={() => setMostrarConsistencia(true)}>
                Consistência
              </Botao>
            </>
          )}
          {emExecucao ? (
            <>
              <span className="relative flex h-2.5 w-2.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-600" />
              </span>
              <div className="h-2 w-36 overflow-hidden rounded-full bg-stone-200" title={`${pct}% traduzido`}>
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-700"
                  style={{ width: `${Math.max(pct, 3)}%` }}
                />
              </div>
              <span className="text-sm tabular-nums text-blue-700">
                {progresso.frases_prontas}/{progresso.frases_total} · {pct}%
              </span>
              <Botao variante="secundario" onClick={() => cancelar.mutate()}>
                Cancelar
              </Botao>
            </>
          ) : (
            <>
              <select
                value={provedorEscolhido}
                onChange={(e) => setProvedorEscolhido(e.target.value)}
                title="Provedor desta tradução (vazio = padrão da obra/global)"
                className="rounded border border-stone-300 px-2 py-1 text-sm"
              >
                <option value="">Provedor padrão</option>
                {provedores?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              {(pendentes > 0 || comErro > 0) && (
                <Botao onClick={() => traduzir.mutate({})} disabled={traduzir.isPending}>
                  {frases.some((f) => f.status_traducao === 'traduzida') ? 'Retomar tradução' : 'Traduzir'}
                </Botao>
              )}
              {pendentes === 0 && comErro === 0 && capitulo.titulo && !capitulo.titulo_pt && (
                <Botao
                  variante="secundario"
                  onClick={() => traduzir.mutate({})}
                  disabled={traduzir.isPending}
                  title="O capítulo já está traduzido — isto pede à IA apenas a tradução do título"
                >
                  Traduzir título
                </Botao>
              )}
              {frases.some((f) => f.status_traducao === 'traduzida') && (
                <Botao variante="secundario" onClick={() => retraduzirTudo(frases)} disabled={traduzir.isPending}>
                  Retraduzir tudo
                </Botao>
              )}
            </>
          )}
        </div>
      </div>

      {erroJob && <Aviso tipo="erro">{erroJob}</Aviso>}

      <div className="flex gap-4">
        {/* Editor bilíngue */}
        <div className="min-w-0 flex-1 space-y-4">
          {paragrafos.map(([idx, frasesDoParagrafo]) => (
            // content-visibility: parágrafos fora da tela não são renderizados —
            // mantém capítulos muito longos (600+ frases) fluidos sem virtualização.
            <div
              key={idx}
              className="overflow-hidden rounded-lg border border-stone-300 bg-white [contain-intrinsic-size:auto_120px] [content-visibility:auto]"
            >
              {frasesDoParagrafo.map((frase) => (
                <LinhaFrase
                  key={frase.id}
                  frase={frase}
                  selecionada={frase.id === fraseSelecionada}
                  aoSelecionar={() => setFraseSelecionada(frase.id === fraseSelecionada ? null : frase.id)}
                  capituloId={capituloId!}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Painel de revisão */}
        {selecionada && (
          <PainelRevisao
            frase={selecionada}
            proxima={frases.find((f) => f.ordem === selecionada.ordem + 1) ?? null}
            capituloId={capituloId!}
            aoFechar={() => setFraseSelecionada(null)}
          />
        )}
      </div>

      {mostrarConsistencia && (
        <ModalConsistencia
          capituloId={capituloId!}
          aoFechar={() => setMostrarConsistencia(false)}
          aoIrParaFrase={(fraseId) => {
            setMostrarConsistencia(false);
            setFraseSelecionada(fraseId);
            requestAnimationFrame(() =>
              document.getElementById(`frase-${fraseId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
            );
          }}
        />
      )}
    </div>
  );
}

function LinhaFrase({
  frase,
  selecionada,
  aoSelecionar,
  capituloId,
}: {
  frase: Frase;
  selecionada: boolean;
  aoSelecionar: () => void;
  capituloId: string;
}) {
  const clienteQuery = useQueryClient();
  const [texto, setTexto] = useState(frase.texto_pt);

  // Sincroniza quando a tradução chega por fora (job em lote, correção aplicada).
  useEffect(() => setTexto(frase.texto_pt), [frase.texto_pt]);

  const salvar = useMutation({
    mutationFn: (texto_pt: string) => api<Frase>('PATCH', `/frases/${frase.id}`, { texto_pt }),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] }),
  });

  const corStatus =
    frase.status_traducao === 'erro'
      ? 'border-l-red-500'
      : frase.status_traducao === 'pendente'
        ? 'border-l-stone-300'
        : frase.editado_manualmente
          ? 'border-l-amber-400'
          : 'border-l-green-400';

  return (
    <div
      id={`frase-${frase.id}`}
      className={`grid grid-cols-2 border-b border-l-4 border-stone-200 last:border-b-0 ${corStatus} ${
        selecionada ? 'bg-amber-50' : ''
      }`}
    >
      <div className="texto-zh cursor-pointer select-text border-r border-stone-200 px-3 py-2" onClick={aoSelecionar}>
        {frase.texto_zh}
      </div>
      <div className="px-2 py-1.5">
        <textarea
          value={texto}
          placeholder={frase.status_traducao === 'pendente' ? '(pendente de tradução)' : ''}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            if (texto !== frase.texto_pt) salvar.mutate(texto);
          }}
          rows={Math.max(1, Math.ceil(texto.length / 60))}
          className="w-full resize-none rounded border border-transparent px-1 py-0.5 text-sm leading-relaxed hover:border-stone-200 focus:border-stone-400 focus:outline-none"
        />
      </div>
    </div>
  );
}

function PainelRevisao({
  frase,
  proxima,
  capituloId,
  aoFechar,
}: {
  frase: Frase;
  proxima: Frase | null;
  capituloId: string;
  aoFechar: () => void;
}) {
  const clienteQuery = useQueryClient();
  const [pergunta, setPergunta] = useState('');
  const [resultado, setResultado] = useState<{ revisao: RespostaRevisao; caso: CasoTeste } | null>(null);
  const [erro, setErro] = useState('');
  const [dividindo, setDividindo] = useState(false);

  // Limpa o painel ao trocar de frase.
  useEffect(() => {
    setPergunta('');
    setResultado(null);
    setErro('');
    setDividindo(false);
  }, [frase.id]);

  const mesclar = useMutation({
    mutationFn: () => api('POST', '/frases/mesclar', { frase_ids: [frase.id, proxima!.id] }),
    onSuccess: () => {
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });

  // Consultas anteriores desta frase no banco de testes (item 12 do backlog).
  const { data: historico } = useQuery({
    queryKey: ['testes-frase', frase.id],
    queryFn: () => api<CasoTeste[]>('GET', `/frases/${frase.id}/testes`),
  });

  const revisar = useMutation({
    mutationFn: () =>
      api<{ revisao: RespostaRevisao; caso: CasoTeste }>('POST', `/frases/${frase.id}/revisar`, { pergunta }),
    onSuccess: (dados) => {
      setResultado(dados);
      setErro('');
      clienteQuery.invalidateQueries({ queryKey: ['testes-frase', frase.id] });
    },
    onError: (e) => setErro((e as Error).message),
  });

  const aplicarCorrecao = useMutation({
    mutationFn: () => api('POST', `/testes/${resultado!.caso.id}/aplicar-correcao`),
    onSuccess: () => {
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
      clienteQuery.invalidateQueries({ queryKey: ['testes-frase', frase.id] });
      setResultado((r) => (r ? { ...r, caso: { ...r.caso, status: 'corrigido' } } : r));
    },
    onError: (e) => setErro((e as Error).message),
  });

  const reverter = useMutation({
    mutationFn: () => api('POST', `/frases/${frase.id}/reverter-ia`),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] }),
  });

  return (
    <aside className="w-96 shrink-0">
      <div className="sticky top-4 space-y-3 rounded-lg border border-stone-300 bg-white p-4">
        <div className="flex items-start justify-between">
          <h3 className="font-semibold">Protocolo de Revisão</h3>
          <button onClick={aoFechar} className="text-stone-400 hover:text-stone-700">
            ✕
          </button>
        </div>

        <p className="texto-zh rounded bg-stone-50 px-2 py-1.5 text-sm">{frase.texto_zh}</p>
        <p className="rounded bg-stone-50 px-2 py-1.5 text-sm">{frase.texto_pt || '(sem tradução)'}</p>
        {frase.editado_manualmente && frase.texto_pt_original_ia && (
          <button onClick={() => reverter.mutate()} className="text-xs text-stone-500 underline hover:text-stone-800">
            Reverter para a tradução original da IA
          </button>
        )}

        <textarea
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          rows={3}
          placeholder="Pergunte sobre a escolha de tradução desta frase…"
          className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
        />
        <Botao onClick={() => revisar.mutate()} disabled={!pergunta.trim() || revisar.isPending} className="w-full">
          {revisar.isPending ? 'Consultando a IA…' : 'Perguntar'}
        </Botao>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {resultado && (
          <div className="space-y-2 border-t border-stone-200 pt-3 text-sm">
            <div>
              <Etiqueta cor={resultado.revisao.veredito === 'correto' ? 'green' : 'red'}>
                {resultado.revisao.veredito === 'correto' ? 'Correto' : 'Incorreto'}
              </Etiqueta>
              <span className="ml-2 text-xs text-stone-500">regra: {resultado.revisao.secao_regra}</span>
            </div>
            <p className="texto-zh rounded bg-stone-50 px-2 py-1 text-xs">{resultado.revisao.trecho_zh}</p>
            <p>{resultado.revisao.justificativa}</p>
            {resultado.revisao.correcao_proposta && (
              <div className="rounded border border-amber-300 bg-amber-50 p-2">
                <p className="mb-2">{resultado.revisao.correcao_proposta}</p>
                {resultado.caso.status !== 'corrigido' ? (
                  <Botao onClick={() => aplicarCorrecao.mutate()} disabled={aplicarCorrecao.isPending}>
                    Aplicar correção
                  </Botao>
                ) : (
                  <Etiqueta cor="blue">Correção aplicada</Etiqueta>
                )}
              </div>
            )}
            <p className="text-xs text-stone-400">Caso #{resultado.caso.id} salvo no banco de testes.</p>
          </div>
        )}

        {/* Consultas anteriores desta frase */}
        {historico && historico.length > 0 && (
          <details className="border-t border-stone-200 pt-3" open={historico.length <= 2 && !resultado}>
            <summary className="cursor-pointer text-xs font-medium text-stone-500 hover:text-stone-800">
              Revisões anteriores desta frase ({historico.length})
            </summary>
            <div className="mt-2 space-y-2">
              {historico.map((caso) => (
                <div key={caso.id} className="rounded border border-stone-200 bg-stone-50 p-2 text-xs">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Etiqueta cor={caso.veredito === 'correto' ? 'green' : 'red'}>
                      {caso.veredito === 'correto' ? 'Correto' : 'Incorreto'}
                    </Etiqueta>
                    {STATUS_CASO_ROTULO[caso.status] && (
                      <Etiqueta cor={STATUS_CASO_ROTULO[caso.status].cor}>
                        {STATUS_CASO_ROTULO[caso.status].texto}
                      </Etiqueta>
                    )}
                    <span className="text-stone-400">
                      {new Date(caso.criado_em).toLocaleDateString('pt-BR')} · caso #{caso.id}
                    </span>
                  </div>
                  <p className="font-medium text-stone-700">{caso.pergunta}</p>
                  <p className="mt-0.5 text-stone-600">{caso.justificativa}</p>
                  {caso.correcao_proposta && (
                    <p className="mt-0.5 text-stone-600">
                      <span className="font-medium">Proposta:</span> {caso.correcao_proposta}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Correção de segmentação */}
        <div className="border-t border-stone-200 pt-3">
          <p className="mb-2 text-xs font-medium text-stone-500">Segmentação errada?</p>
          <div className="flex flex-wrap gap-2">
            {proxima && proxima.paragrafo === frase.paragrafo && (
              <Botao
                variante="secundario"
                onClick={() =>
                  window.confirm('Mesclar esta frase com a seguinte? Casos de teste serão religados à frase resultante.') &&
                  mesclar.mutate()
                }
                disabled={mesclar.isPending}
              >
                Mesclar com a próxima
              </Botao>
            )}
            {[...frase.texto_zh].length > 1 && (
              <Botao variante="secundario" onClick={() => setDividindo(true)}>
                Dividir frase
              </Botao>
            )}
          </div>
        </div>
      </div>

      {dividindo && (
        <ModalDividir
          frase={frase}
          capituloId={capituloId}
          aoFechar={() => setDividindo(false)}
          aoErro={setErro}
        />
      )}
    </aside>
  );
}

function ModalConsistencia({
  capituloId,
  aoFechar,
  aoIrParaFrase,
}: {
  capituloId: string;
  aoFechar: () => void;
  aoIrParaFrase: (fraseId: number) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['consistencia', capituloId],
    queryFn: () =>
      api<{ ocorrencias: number; violacoes: ViolacaoConsistencia[]; termos_curtos_ignorados: number }>(
        'GET',
        `/capitulos/${capituloId}/consistencia`,
      ),
    staleTime: 0,
  });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40" onClick={aoFechar}>
      <div className="max-h-[80vh] w-[42rem] max-w-full space-y-3 overflow-auto rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="font-semibold">Consistência do glossário</h3>
          <button onClick={aoFechar} className="text-stone-400 hover:text-stone-700">
            ✕
          </button>
        </div>
        {isLoading && <p className="text-sm text-stone-500">Verificando…</p>}
        {data && (
          <>
            <p className="text-sm text-stone-600">
              {data.ocorrencias} ocorrência{data.ocorrencias === 1 ? '' : 's'} de termos do glossário neste capítulo ·{' '}
              {data.violacoes.length === 0 ? (
                <span className="font-medium text-green-700">todas seguem o cânone.</span>
              ) : (
                <span className="font-medium text-red-700">{data.violacoes.length} fora do cânone:</span>
              )}
            </p>
            <div className="space-y-2">
              {data.violacoes.map((v, i) => (
                <div key={i} className="rounded border border-red-200 bg-red-50 p-3 text-sm">
                  <p className="mb-1">
                    <span className="texto-zh font-medium">{v.termo_zh}</span> deveria virar{' '}
                    <span className="font-medium">“{v.termo_pt}”</span> (frase {v.ordem + 1})
                  </p>
                  <p className="texto-zh text-xs text-stone-600">{v.texto_zh}</p>
                  <p className="mb-2 text-xs text-stone-600">{v.texto_pt}</p>
                  <Botao variante="secundario" onClick={() => aoIrParaFrase(v.frase_id)}>
                    Ir à frase
                  </Botao>
                </div>
              ))}
            </div>
            <p className="text-xs text-stone-400">
              Verificação heurística: compara sem maiúsculas/acentos e não entende flexões (plural, gênero) — trate
              como sinalização, não veredito.
              {data.termos_curtos_ignorados > 0 && (
                <>
                  {' '}
                  {data.termos_curtos_ignorados} termo{data.termos_curtos_ignorados === 1 ? '' : 's'} de 1 caractere
                  do glossário {data.termos_curtos_ignorados === 1 ? 'foi ignorado' : 'foram ignorados'} (ambíguos
                  demais — aparecem dentro de palavras comuns); prefira cadastrar o composto (ex.: 人级 em vez de 人).
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ModalDividir({
  frase,
  capituloId,
  aoFechar,
  aoErro,
}: {
  frase: Frase;
  capituloId: string;
  aoFechar: () => void;
  aoErro: (m: string) => void;
}) {
  const clienteQuery = useQueryClient();
  const caracteres = [...frase.texto_zh];
  const [corte, setCorte] = useState(Math.ceil(caracteres.length / 2));
  const [pt1, setPt1] = useState(frase.texto_pt);
  const [pt2, setPt2] = useState('');

  const dividir = useMutation({
    mutationFn: () =>
      api('POST', `/frases/${frase.id}/dividir`, {
        texto_zh_1: caracteres.slice(0, corte).join(''),
        texto_zh_2: caracteres.slice(corte).join(''),
        texto_pt_1: pt1,
        texto_pt_2: pt2,
      }),
    onSuccess: () => {
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
      aoFechar();
    },
    onError: (e) => aoErro((e as Error).message),
  });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40" onClick={aoFechar}>
      <div className="w-[36rem] max-w-full space-y-3 rounded-lg bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">Dividir frase</h3>
        <p className="text-sm text-stone-600">Clique no caractere onde a segunda frase deve começar:</p>
        <p className="texto-zh rounded bg-stone-50 p-2 text-lg leading-loose">
          {caracteres.map((ch, i) => (
            <span
              key={i}
              onClick={() => i > 0 && setCorte(i)}
              className={`cursor-pointer ${i === corte ? 'border-l-2 border-red-500' : ''} ${
                i >= corte ? 'bg-amber-100' : ''
              }`}
            >
              {ch}
            </span>
          ))}
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="texto-zh mb-1 rounded bg-stone-50 px-2 py-1 text-xs">{caracteres.slice(0, corte).join('')}</p>
            <textarea
              value={pt1}
              onChange={(e) => setPt1(e.target.value)}
              rows={3}
              placeholder="Tradução da 1ª parte"
              className="w-full rounded border border-stone-300 px-2 py-1.5"
            />
          </div>
          <div>
            <p className="texto-zh mb-1 rounded bg-amber-50 px-2 py-1 text-xs">{caracteres.slice(corte).join('')}</p>
            <textarea
              value={pt2}
              onChange={(e) => setPt2(e.target.value)}
              rows={3}
              placeholder="Tradução da 2ª parte (vazio = pendente)"
              className="w-full rounded border border-stone-300 px-2 py-1.5"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={() => dividir.mutate()} disabled={dividir.isPending}>
            Dividir
          </Botao>
        </div>
      </div>
    </div>
  );
}
