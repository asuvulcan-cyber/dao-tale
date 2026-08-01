import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Capitulo,
  CapituloResumo,
  CheckpointObra,
  Lote,
  LoteCapitulo,
  Obra,
  PromptMae,
  PromptPadrao,
  ProvedorId,
} from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, CabecalhoPagina, Etiqueta, STATUS_CAPITULO_ROTULO } from '../App';
import { SeletorModelo } from '../componentes/SeletorModelo';
import { PainelExportacao } from '../componentes/ExportarObra';

export function Capitulos() {
  const { obraId } = useParams();
  const navegar = useNavigate();
  const clienteQuery = useQueryClient();
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [mostrarExportacao, setMostrarExportacao] = useState(false);
  const [erro, setErro] = useState('');
  const [avisosSegmentacao, setAvisosSegmentacao] = useState<string[]>([]);

  const { data: capitulos, isLoading } = useQuery({
    queryKey: ['capitulos', obraId],
    queryFn: () => api<CapituloResumo[]>('GET', `/obras/${obraId}/capitulos`),
  });

  // Proveniência (doc 08 §2 camada 4): id → versão para o tooltip "traduzido
  // com prompt vX · núcleo vY". Mesmas chaves de cache da tela Prompt mãe.
  const { data: promptsObra } = useQuery({
    queryKey: ['prompts', obraId],
    queryFn: () => api<PromptMae[]>('GET', `/obras/${obraId}/prompts`),
  });
  const { data: nucleos } = useQuery({
    queryKey: ['prompt-padrao'],
    queryFn: () => api<PromptPadrao[]>('GET', '/prompt-padrao'),
  });
  const versaoPrompt = new Map((promptsObra ?? []).map((p) => [p.id, p.versao]));
  const versaoNucleo = new Map((nucleos ?? []).map((n) => [n.id, n.versao]));
  const proveniencia = (cap: CapituloResumo): string | undefined => {
    if (!cap.prompt_id) return undefined;
    const prompt = versaoPrompt.get(cap.prompt_id);
    const nucleo = cap.nucleo_id ? versaoNucleo.get(cap.nucleo_id) : undefined;
    if (!prompt) return undefined;
    return `Traduzido com o prompt v${prompt}${nucleo ? ` sobre o núcleo v${nucleo}` : ''}${cap.provedor ? ` (${cap.provedor}${cap.modelo ? ` · ${cap.modelo}` : ''})` : ''}`;
  };

  const criar = useMutation({
    mutationFn: (dados: { numero: number; titulo?: string; texto_origem: string }) =>
      api<{ capitulo: Capitulo; frases_total: number; avisos: string[] }>(
        'POST',
        `/obras/${obraId}/capitulos`,
        dados,
      ),
    onSuccess: (resultado) => {
      clienteQuery.invalidateQueries({ queryKey: ['capitulos', obraId] });
      setErro('');
      if (resultado.avisos.length > 0) {
        setAvisosSegmentacao(resultado.avisos);
      } else {
        navegar(`/obras/${obraId}/capitulos/${resultado.capitulo.id}`);
      }
      setMostrarFormulario(false);
    },
    onError: (e) => setErro((e as Error).message),
  });

  const excluir = useMutation({
    mutationFn: async (cap: CapituloResumo) => {
      const impacto = await api<Record<string, number>>('DELETE', `/capitulos/${cap.id}?simular=1`);
      const detalhe = Object.entries(impacto)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${n} ${k.replace('_', ' ')}`)
        .join(', ');
      if (!window.confirm(`Excluir o capítulo ${cap.numero}?${detalhe ? `\n\nSerão perdidos: ${detalhe}.` : ''}`)) return;
      await api('DELETE', `/capitulos/${cap.id}`);
    },
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['capitulos', obraId] }),
    onError: (e) => setErro((e as Error).message),
  });

  const proximoNumero = capitulos && capitulos.length > 0 ? Math.max(...capitulos.map((c) => c.numero)) + 1 : 1;

  return (
    <div>
      <FichaObra />

      <PainelCheckpoint />
      <PainelLote />

      <CabecalhoPagina
        titulo="Capítulos"
        descricao={
          capitulos && capitulos.length > 0
            ? `${capitulos.length} capítulo${capitulos.length === 1 ? '' : 's'} — o sumário da tradução.`
            : undefined
        }
      >
        <Link
          to={`/ler/${obraId}`}
          className="ferramenta"
          title="Abrir o modo leitura — só o texto traduzido, fora da bancada"
        >
          Ler
        </Link>
        <button
          type="button"
          className="ferramenta"
          aria-pressed={mostrarExportacao}
          onClick={() => setMostrarExportacao((v) => !v)}
          title="Gerar EPUB ou Markdown da obra inteira"
        >
          Exportar livro
        </button>
        <Botao onClick={() => setMostrarFormulario((v) => !v)}>
          {mostrarFormulario ? 'Cancelar' : 'Novo capítulo'}
        </Botao>
      </CabecalhoPagina>

      {mostrarExportacao && <PainelExportacao obraId={obraId!} capitulos={capitulos ?? []} />}

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {avisosSegmentacao.length > 0 && (
        <Aviso tipo="info">
          Capítulo criado, mas a segmentação encontrou pontos de atenção:
          <ul className="list-inside list-disc">
            {avisosSegmentacao.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}

      {mostrarFormulario && (
        <FormularioNovoCapitulo
          numeroSugerido={proximoNumero}
          enviando={criar.isPending}
          aoEnviar={(dados) => criar.mutate(dados)}
        />
      )}

      {isLoading && <p className="text-tinta-2">Carregando…</p>}
      {capitulos?.length === 0 && !mostrarFormulario && (
        <p className="text-tinta-2">Nenhum capítulo ainda. Cole o texto chinês em “Novo capítulo”.</p>
      )}

      {/* Índice como sumário de livro (guia §五.2): número serifado, progresso
          em mono, excluir só aparece no hover da linha. */}
      {capitulos && capitulos.length > 0 && (
        <div className="cartao">
          {capitulos.map((cap) => {
            const rotulo = STATUS_CAPITULO_ROTULO[cap.status];
            return (
              <div
                key={cap.id}
                className="group grid grid-cols-[3.4rem_minmax(0,1fr)_auto_auto_1.6rem] items-baseline gap-4 border-b border-linha/50 px-4 py-2.5 last:border-b-0 hover:bg-papel-fundo/40"
              >
                <Link
                  to={`/obras/${obraId}/capitulos/${cap.id}`}
                  className="text-right font-display text-lg font-semibold hover:text-jade-forte"
                >
                  {cap.numero}
                </Link>
                <Link to={`/obras/${obraId}/capitulos/${cap.id}`} className="min-w-0 truncate hover:underline">
                  {cap.titulo_pt ?? cap.titulo ?? <span className="text-tinta-2 italic">sem título</span>}
                  {cap.titulo_pt && cap.titulo && cap.titulo !== cap.titulo_pt && (
                    <span className="texto-zh ml-2 text-sm text-tinta-2">{cap.titulo}</span>
                  )}
                </Link>
                <span className="font-mono text-xs text-tinta-2 tabular-nums" title={proveniencia(cap)}>
                  {cap.frases_traduzidas}/{cap.frases_total}
                  {cap.frases_erro > 0 && <span className="text-erro"> · {cap.frases_erro} erro</span>}
                  {/* D5: varredura local de consistência do glossário. */}
                  {cap.consistencia_violacoes != null && cap.consistencia_violacoes > 0 && (
                    <span className="text-ocre-forte" title="Termos do glossário traduzidos fora do padrão — abra o capítulo para conferir">
                      {' '}· {cap.consistencia_violacoes} glossário
                    </span>
                  )}
                  {/* QA por segunda IA (doc 09 §6): apontamentos pendentes de triagem. */}
                  {cap.qa_pendentes > 0 && (
                    <span className="text-selo-forte" title="Apontamentos de QA pendentes — abra o capítulo para triar">
                      {' '}· {cap.qa_pendentes} QA
                    </span>
                  )}
                </span>
                <span title={proveniencia(cap)}>
                  <Etiqueta cor={rotulo.cor}>{rotulo.texto}</Etiqueta>
                </span>
                <button
                  type="button"
                  onClick={() => excluir.mutate(cap)}
                  title={`Excluir o capítulo ${cap.numero}`}
                  className="invisible text-tinta-2 hover:text-erro group-hover:visible"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Painel-semáforo do checkpoint de estabilidade (doc 09 §4): mostra as taxas
 * medidas e libera (ou não) a fase de cruzeiro. Quem decide é o usuário. */
function PainelCheckpoint() {
  const { obraId } = useParams();
  const clienteQuery = useQueryClient();
  const [erro, setErro] = useState('');

  const { data: checkpoint } = useQuery({
    queryKey: ['checkpoint', obraId],
    queryFn: () => api<CheckpointObra>('GET', `/obras/${obraId}/checkpoint`),
  });

  const mudarFase = useMutation({
    mutationFn: (fase: 'calibracao' | 'cruzeiro') => api<Obra>('PUT', `/obras/${obraId}/fase`, { fase }),
    onSuccess: () => {
      clienteQuery.invalidateQueries({ queryKey: ['checkpoint', obraId] });
      clienteQuery.invalidateQueries({ queryKey: ['obra', obraId] });
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });

  if (!checkpoint) return null;
  const emCruzeiro = checkpoint.fase === 'cruzeiro';

  const cor: Record<string, string> = {
    ok: 'bg-jade text-papel-alto',
    acima: 'bg-erro text-papel-alto',
    'amostra-insuficiente': 'bg-papel-fundo text-tinta-2 border border-linha',
  };
  const simbolo: Record<string, string> = { ok: '✓', acima: '!', 'amostra-insuficiente': '·' };

  return (
    <div className="mb-6 cartao p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">
            Fase da tradução: {emCruzeiro ? 'Cruzeiro (lote liberado)' : 'Calibração'}
          </h3>
          <p className="text-xs text-tinta-2">
            {emCruzeiro
              ? 'Tradução em lote liberada. Se as taxas piorarem num arco novo, volte para calibração.'
              : 'Traduza e revise capítulo a capítulo até as taxas estabilizarem, depois libere o cruzeiro.'}
          </p>
        </div>
        {emCruzeiro ? (
          <Botao variante="secundario" onClick={() => mudarFase.mutate('calibracao')} disabled={mudarFase.isPending}>
            Voltar para calibração
          </Botao>
        ) : checkpoint.aprovado ? (
          <Botao onClick={() => mudarFase.mutate('cruzeiro')} disabled={mudarFase.isPending}>
            Liberar cruzeiro
          </Botao>
        ) : (
          <Botao
            variante="secundario"
            onClick={() => {
              if (window.confirm('As taxas ainda não estabilizaram. Liberar o lote assim mesmo pode gerar retrabalho pago (retradução). Continuar?'))
                mudarFase.mutate('cruzeiro');
            }}
            disabled={mudarFase.isPending}
          >
            Liberar mesmo assim
          </Botao>
        )}
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="grid gap-2 sm:grid-cols-3">
        {checkpoint.metricas.map((m) => (
          <div key={m.chave} className="flex items-start gap-2 rounded border border-linha/60 p-2">
            <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold ${cor[m.estado]}`}>
              {simbolo[m.estado]}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium">
                {m.rotulo}
                {!m.bloqueia && <span className="text-tinta-2"> (informativa)</span>}
              </p>
              <p className="text-xs text-tinta-2">{m.detalhe}</p>
            </div>
          </div>
        ))}
      </div>

      {checkpoint.janela_capitulos.length > 0 && (
        <p className="mt-2 text-xs text-tinta-2">
          Janela medida: capítulos {checkpoint.janela_capitulos.join(', ')} (os {checkpoint.janela_alvo} mais recentes prontos).
        </p>
      )}
    </div>
  );
}

const STATUS_LOTE_CAP: Record<LoteCapitulo['status'], { texto: string; cor: string }> = {
  na_fila: { texto: 'Na fila', cor: 'text-tinta-2' },
  traduzindo: { texto: 'Traduzindo…', cor: 'text-indigo-forte' },
  qa: { texto: 'QA…', cor: 'text-indigo-forte' },
  concluido: { texto: 'Concluído', cor: 'text-jade-forte' },
  erro: { texto: 'Erro', cor: 'text-erro' },
  cancelado: { texto: 'Cancelado', cor: 'text-tinta-2' },
};

/** Fila do lote (fase de cruzeiro, doc 09 §5): inicia, acompanha ao vivo (SSE),
 * cancela e retoma a tradução em lote. Só aparece quando a obra está em cruzeiro. */
function PainelLote() {
  const { obraId } = useParams();
  const clienteQuery = useQueryClient();
  const [erro, setErro] = useState('');
  const [lote, setLote] = useState<Lote | null>(null);

  const { data: obra } = useQuery({
    queryKey: ['obra', obraId],
    queryFn: () => api<Obra>('GET', `/obras/${obraId}`),
  });
  const { data: loteInicial } = useQuery({
    queryKey: ['lote', obraId],
    queryFn: () => api<{ lote: Lote | null }>('GET', `/obras/${obraId}/lote`).then((r) => r.lote),
  });

  useEffect(() => {
    if (loteInicial !== undefined) setLote(loteInicial);
  }, [loteInicial]);

  // Assina o SSE agregado enquanto houver um lote executando.
  const executando = lote?.status === 'executando';
  useEffect(() => {
    if (!executando) return;
    const fonte = new EventSource(`/api/obras/${obraId}/lote/eventos`);
    const receber = (e: MessageEvent) => {
      const dados = JSON.parse(e.data) as Lote | null;
      setLote(dados);
      // Progresso das frases muda a lista de capítulos e o checkpoint.
      clienteQuery.invalidateQueries({ queryKey: ['capitulos', obraId] });
    };
    fonte.addEventListener('lote', receber);
    fonte.addEventListener('lote_encerrado', (e) => {
      receber(e as MessageEvent);
      clienteQuery.invalidateQueries({ queryKey: ['checkpoint', obraId] });
      fonte.close();
    });
    return () => fonte.close();
  }, [executando, obraId, clienteQuery]);

  const acao = useMutation({
    mutationFn: (o: 'iniciar' | 'cancelar' | 'retomar') =>
      o === 'iniciar'
        ? api<{ lote: Lote }>('POST', `/obras/${obraId}/lote`, {}).then((r) => r.lote)
        : o === 'retomar'
          ? api<{ lote: Lote }>('POST', `/obras/${obraId}/lote/retomar`, {}).then((r) => r.lote)
          : api('POST', `/obras/${obraId}/lote/cancelar`, {}),
    onSuccess: (r, o) => {
      setErro('');
      if (o !== 'cancelar' && r) setLote(r as Lote);
      clienteQuery.invalidateQueries({ queryKey: ['lote', obraId] });
    },
    onError: (e) => setErro((e as Error).message),
  });

  if (!obra || obra.fase_traducao !== 'cruzeiro') return null;

  const podeIniciar = !lote || lote.status !== 'executando';
  const interrompido = lote && (lote.status === 'interrompido' || lote.status === 'cancelado');
  const concluidos = lote?.capitulos.filter((c) => c.status === 'concluido').length ?? 0;
  const comErro = lote?.capitulos.filter((c) => c.status === 'erro').length ?? 0;

  return (
    <div className="mb-6 cartao p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Tradução em lote</h3>
          <p className="text-xs text-tinta-2">
            Traduz os capítulos pendentes em série, com failover entre provedores e retomada após falha.
          </p>
        </div>
        <div className="flex gap-2">
          {executando ? (
            <Botao variante="secundario" onClick={() => acao.mutate('cancelar')} disabled={acao.isPending}>
              Cancelar lote
            </Botao>
          ) : (
            <>
              {interrompido && lote!.capitulos.some((c) => c.status !== 'concluido') && (
                <Botao variante="secundario" onClick={() => acao.mutate('retomar')} disabled={acao.isPending}>
                  Retomar lote
                </Botao>
              )}
              {podeIniciar && (
                <Botao onClick={() => acao.mutate('iniciar')} disabled={acao.isPending}>
                  Iniciar lote
                </Botao>
              )}
            </>
          )}
        </div>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {lote && (
        <>
          <p className="mb-2 text-xs text-tinta-2">
            {lote.status === 'executando'
              ? 'Em execução'
              : lote.status === 'concluido'
                ? 'Concluído'
                : lote.status === 'cancelado'
                  ? 'Cancelado'
                  : 'Interrompido'}{' '}
            · {concluidos}/{lote.capitulos.length} capítulos
            {comErro > 0 && <span className="text-erro"> · {comErro} com erro</span>}
          </p>
          <div className="max-h-48 overflow-y-auto rounded border border-linha/60">
            {lote.capitulos.map((c) => {
              const s = STATUS_LOTE_CAP[c.status];
              return (
                <div
                  key={c.capitulo_id}
                  className="flex items-baseline gap-3 border-b border-linha/40 px-3 py-1.5 text-xs last:border-b-0"
                >
                  <Link
                    to={`/obras/${obraId}/capitulos/${c.capitulo_id}`}
                    className="w-8 shrink-0 text-right font-display font-semibold hover:text-jade-forte"
                  >
                    {c.numero}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-tinta-2">
                    {c.titulo ?? <span className="italic">sem título</span>}
                  </span>
                  <span className="font-mono tabular-nums text-tinta-2">
                    {c.frases_traduzidas}/{c.frases_total}
                  </span>
                  <span className={`w-24 shrink-0 text-right ${s.cor}`} title={c.erro ?? undefined}>
                    {s.texto}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Ficha da obra (guia §五.2): capa, sinopse, tags e IA visíveis; edição no ✎. */
function FichaObra() {
  const { obraId } = useParams();
  const [editando, setEditando] = useState(false);

  const { data: obra } = useQuery({
    queryKey: ['obra', obraId],
    queryFn: () => api<Obra>('GET', `/obras/${obraId}`),
  });

  if (!obra) return null;

  return (
    <div className="mb-6">
      <div className="cartao flex gap-4 p-4">
        {obra.tem_capa ? (
          <img
            src={`/api/obras/${obraId}/capa?v=${obra.atualizado_em}`}
            alt={`Capa de ${obra.titulo}`}
            className="h-40 w-28 shrink-0 rounded object-cover shadow-md shadow-tinta/20"
          />
        ) : (
          <div
            className="texto-zh grid h-40 w-28 shrink-0 place-items-center rounded bg-papel-fundo text-5xl text-tinta-2/50 shadow-md shadow-tinta/20"
            aria-hidden
          >
            道
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {obra.autor && <p className="mb-1 text-sm text-tinta-2">{obra.autor}</p>}
              <p className="olho mb-1">Sinopse</p>
              <p className="max-w-[62ch] text-sm">
                {obra.sinopse ?? <span className="text-tinta-2 italic">sem sinopse — clique em ✎ para escrever</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditando((v) => !v)}
              aria-pressed={editando}
              title="Editar ficha, capa e preferências de IA"
              className={`grid size-8 shrink-0 place-items-center rounded-md border ${
                editando
                  ? 'border-transparent bg-jade text-papel-alto'
                  : 'border-linha text-tinta-2 hover:border-jade hover:text-jade-forte'
              }`}
            >
              ✎
            </button>
          </div>
          {obra.tags.length > 0 && (
            <>
              <p className="olho mt-3 mb-1">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {obra.tags.map((tag) => (
                  <Etiqueta key={tag} cor="indigo">
                    {tag}
                  </Etiqueta>
                ))}
              </div>
            </>
          )}
          <p className="olho mt-3 mb-1">IA da obra</p>
          <p className="text-sm text-tinta-2">
            {obra.provedor_padrao
              ? `${obra.provedor_padrao}${obra.modelo_padrao ? ` · ${obra.modelo_padrao}` : ''}`
              : 'padrão global das Configurações'}
          </p>
        </div>
      </div>
      {editando && (
        <>
          <DetalhesObra />
          <PreferenciasObra />
        </>
      )}
    </div>
  );
}

function DetalhesObra() {
  const { obraId } = useParams();
  const clienteQuery = useQueryClient();
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState('');
  const inputCapa = useRef<HTMLInputElement>(null);

  const { data: obra } = useQuery({
    queryKey: ['obra', obraId],
    queryFn: () => api<Obra>('GET', `/obras/${obraId}`),
  });

  const [titulo, setTitulo] = useState<string | null>(null);
  const [tituloOriginal, setTituloOriginal] = useState<string | null>(null);
  const [autor, setAutor] = useState<string | null>(null);
  const [sinopse, setSinopse] = useState<string | null>(null);
  const [tags, setTags] = useState<string | null>(null);
  const tituloAtual = titulo ?? obra?.titulo ?? '';
  const tituloOriginalAtual = tituloOriginal ?? obra?.titulo_original ?? '';
  const autorAtual = autor ?? obra?.autor ?? '';
  const sinopseAtual = sinopse ?? obra?.sinopse ?? '';
  const tagsAtual = tags ?? obra?.tags.join(', ') ?? '';

  const aoMudarObra = () => {
    clienteQuery.invalidateQueries({ queryKey: ['obra', obraId] });
    clienteQuery.invalidateQueries({ queryKey: ['obras'] });
  };

  const salvar = useMutation({
    mutationFn: () =>
      api('PUT', `/obras/${obraId}`, {
        // Título é obrigatório no banco: só envia se preenchido (vazio mantém o atual).
        ...(tituloAtual.trim() ? { titulo: tituloAtual.trim() } : {}),
        titulo_original: tituloOriginalAtual.trim() || null,
        autor: autorAtual.trim() || null,
        sinopse: sinopseAtual.trim() || null,
        tags: tagsAtual.split(',').map((t) => t.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      aoMudarObra();
      setErro('');
      setSalvo(true);
      setTimeout(() => setSalvo(false), 3000);
    },
    onError: (e) => setErro((e as Error).message),
  });

  const enviarCapa = useMutation({
    mutationFn: async (arquivo: File) => {
      const resposta = await fetch(`/api/obras/${obraId}/capa`, {
        method: 'PUT',
        headers: { 'Content-Type': arquivo.type },
        body: arquivo,
      });
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => null);
        throw new Error(dados?.erro?.mensagem ?? `Erro ${resposta.status}`);
      }
    },
    onSuccess: () => {
      aoMudarObra();
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });

  const removerCapa = useMutation({
    mutationFn: () => api('DELETE', `/obras/${obraId}/capa`),
    onSuccess: aoMudarObra,
  });

  // Título original e/ou sinopse em chinês → traduz com o prompt e glossário da obra.
  const tituloEmChines = /[一-鿿]/.test(tituloOriginalAtual);
  const sinopseEmChines = /[一-鿿]/.test(sinopseAtual);
  const haChines = tituloEmChines || sinopseEmChines;
  const traduzirDetalhes = useMutation({
    mutationFn: () =>
      api<{ titulo_pt: string | null; sinopse_pt: string | null }>('POST', '/ia/traduzir-detalhes', {
        obra_id: Number(obraId),
        ...(tituloEmChines ? { titulo_zh: tituloOriginalAtual.trim() } : {}),
        ...(sinopseEmChines ? { sinopse_zh: sinopseAtual.trim() } : {}),
      }),
    onSuccess: (r) => {
      if (r.titulo_pt) setTitulo(r.titulo_pt);
      if (r.sinopse_pt) setSinopse(r.sinopse_pt);
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });

  if (!obra) return null;

  return (
    <div className="mt-6 cartao p-4">
      <h3 className="mb-3 text-sm font-semibold">Detalhes da obra</h3>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="flex flex-wrap gap-4">
        <div className="shrink-0">
          <input
            ref={inputCapa}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) enviarCapa.mutate(arquivo);
              e.target.value = '';
            }}
          />
          {obra.tem_capa ? (
            <img
              src={`/api/obras/${obraId}/capa?v=${obra.atualizado_em}`}
              alt={`Capa de ${obra.titulo}`}
              className="h-40 w-28 rounded object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-40 w-28 items-center justify-center rounded border border-dashed border-linha text-center text-xs text-tinta-2">
              sem capa
            </div>
          )}
          <div className="mt-2 flex flex-col gap-1">
            <Botao variante="secundario" onClick={() => inputCapa.current?.click()} disabled={enviarCapa.isPending}>
              {enviarCapa.isPending ? 'Enviando…' : obra.tem_capa ? 'Trocar capa' : 'Enviar capa'}
            </Botao>
            {obra.tem_capa && (
              <Botao variante="secundario" onClick={() => removerCapa.mutate()}>
                Remover capa
              </Botao>
            )}
          </div>
        </div>
        <div className="min-w-64 flex-1 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Título
              <input
                value={tituloAtual}
                onChange={(e) => setTitulo(e.target.value)}
                className="entrada mt-1 w-full"
                placeholder="Título em português"
              />
            </label>
            <label className="block text-sm">
              Título original (chinês)
              <input
                value={tituloOriginalAtual}
                onChange={(e) => setTituloOriginal(e.target.value)}
                className="texto-zh entrada mt-1 w-full"
                placeholder="十日终焉"
              />
            </label>
          </div>
          <label className="block text-sm">
            Autor do original
            <input
              value={autorAtual}
              onChange={(e) => setAutor(e.target.value)}
              className="entrada mt-1 w-full"
              placeholder="Nome do autor — vira o autor do EPUB"
            />
          </label>
          <label className="block text-sm">
            Sinopse
            <textarea
              value={sinopseAtual}
              onChange={(e) => setSinopse(e.target.value)}
              rows={4}
              className="entrada mt-1 w-full"
              placeholder="Resumo curto da obra…"
            />
          </label>
          <label className="block text-sm">
            Tags (separadas por vírgula)
            <input
              value={tagsAtual}
              onChange={(e) => setTags(e.target.value)}
              className="entrada mt-1 w-full"
              placeholder="xianxia, suspense, sistema"
            />
          </label>
          <div className="flex items-center gap-3">
            <Botao onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              Salvar detalhes
            </Botao>
            {haChines && (
              <Botao variante="secundario" onClick={() => traduzirDetalhes.mutate()} disabled={traduzirDetalhes.isPending}>
                {traduzirDetalhes.isPending
                  ? 'Traduzindo…'
                  : tituloEmChines && sinopseEmChines
                    ? 'Traduzir título e sinopse do chinês (IA)'
                    : tituloEmChines
                      ? 'Traduzir título do chinês (IA)'
                      : 'Traduzir sinopse do chinês (IA)'}
              </Botao>
            )}
            {salvo && <span className="text-sm text-jade-forte">Salvo.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreferenciasObra() {
  const { obraId } = useParams();
  const clienteQuery = useQueryClient();
  const [salvo, setSalvo] = useState(false);

  const { data: obra } = useQuery({
    queryKey: ['obra', obraId],
    queryFn: () => api<Obra>('GET', `/obras/${obraId}`),
  });
  const { data: provedores } = useQuery({
    queryKey: ['provedores'],
    queryFn: () => api<{ id: ProvedorId; nome: string; modelo_padrao: string }[]>('GET', '/provedores'),
  });

  const [provedor, setProvedor] = useState<string | null>(null);
  const [modelo, setModelo] = useState<string | null>(null);
  const provedorAtual = provedor ?? obra?.provedor_padrao ?? '';
  const modeloAtual = modelo ?? obra?.modelo_padrao ?? '';

  const salvar = useMutation({
    mutationFn: () =>
      api('PUT', `/obras/${obraId}`, {
        provedor_padrao: provedorAtual || null,
        modelo_padrao: modeloAtual || null,
      }),
    onSuccess: () => {
      clienteQuery.invalidateQueries({ queryKey: ['obra', obraId] });
      setSalvo(true);
      setTimeout(() => setSalvo(false), 3000);
    },
  });

  if (!obra || !provedores) return null;

  return (
    <div className="mt-6 cartao p-4">
      <h3 className="mb-1 text-sm font-semibold">Preferências de IA desta obra</h3>
      <p className="mb-3 text-xs text-tinta-2">
        Usadas em toda tradução e revisão da obra; deixe em branco para herdar o padrão global das Configurações. Cada
        tradução ainda pode escolher outro provedor na hora (útil para comparar modelos no mesmo texto).
      </p>
      {/* items-start: a descrição do modelo cresce para baixo sem desalinhar
          o provedor nem o botão (a descrição vem do SeletorModelo). */}
      <div className="flex flex-wrap items-start gap-3">
        <label className="block text-sm">
          Provedor
          <select
            value={provedorAtual}
            onChange={(e) => setProvedor(e.target.value)}
            className="mt-1 block entrada"
          >
            <option value="">Padrão global</option>
            {provedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block w-72 text-sm">
          Modelo (vazio = padrão do provedor)
          <SeletorModelo
            provedor={provedorAtual}
            valor={modeloAtual}
            aoMudar={setModelo}
            modeloPadraoProvedor={provedores.find((p) => p.id === provedorAtual)?.modelo_padrao ?? ''}
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Botao onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          Salvar
        </Botao>
        {salvo && <span className="text-sm text-jade-forte">Salvo.</span>}
      </div>
    </div>
  );
}

// A primeira linha do texto colado é sempre o título do capítulo (e o job
// traduz o título junto) — por isso não existe campo de título separado.
function separarTitulo(texto: string): { titulo: string; corpo: string } {
  const linhas = texto.split(/\r?\n/);
  const i = linhas.findIndex((l) => l.trim().length > 0);
  if (i === -1) return { titulo: '', corpo: '' };
  return { titulo: linhas[i].trim(), corpo: linhas.slice(i + 1).join('\n').trim() };
}

function FormularioNovoCapitulo({
  numeroSugerido,
  aoEnviar,
  enviando,
}: {
  numeroSugerido: number;
  aoEnviar: (dados: { numero: number; titulo?: string; texto_origem: string }) => void;
  enviando: boolean;
}) {
  const [numero, setNumero] = useState(numeroSugerido);
  const [texto, setTexto] = useState('');
  const inputArquivo = useRef<HTMLInputElement>(null);
  const { titulo, corpo } = separarTitulo(texto);

  async function carregarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (arquivo) setTexto(await arquivo.text());
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aoEnviar({ numero, titulo: titulo || undefined, texto_origem: corpo });
      }}
      className="mb-6 space-y-3 cartao p-4"
    >
      <label className="block w-40 text-sm">
        Número*
        <input
          type="number"
          required
          value={numero}
          onChange={(e) => setNumero(Number(e.target.value))}
          className="entrada mt-1 w-full"
        />
      </label>
      <label className="block text-sm">
        Texto chinês* (cole aqui ou carregue um arquivo — a primeira linha vira o título)
        <textarea
          required
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={10}
          className="texto-zh entrada mt-1 w-full"
        />
      </label>
      {titulo && (
        <p className="text-xs text-tinta-2">
          Título detectado: <span className="texto-zh text-tinta">{titulo}</span>
          {!corpo && <span className="text-erro"> — falta o corpo do capítulo abaixo do título.</span>}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Botao type="submit" disabled={enviando || !corpo}>
          {enviando ? 'Segmentando…' : 'Criar e segmentar'}
        </Botao>
        <input ref={inputArquivo} type="file" accept=".txt,.md" onChange={carregarArquivo} className="hidden" />
        <Botao type="button" variante="secundario" onClick={() => inputArquivo.current?.click()}>
          Carregar .txt / .md
        </Botao>
      </div>
    </form>
  );
}
