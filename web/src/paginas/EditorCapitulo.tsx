import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApontamentoQa,
  Capitulo,
  CapituloResumo,
  CasoTeste,
  EntradaGlossario,
  Frase,
  ProgressoTraducao,
  ProvedorId,
  StatusCapitulo,
  RevisaoLiteraria,
} from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, MenuMais, REGRA_ESTILO_ROTULO, STATUS_CAPITULO_ROTULO } from '../App';
import { orientacaoDaRegra } from '../util/rotuloRegra';
import { CapturaTermo } from '../componentes/CapturaTermo';
import { GavetaRevisao } from '../componentes/GavetaRevisao';
import { IndicadorCota } from '../componentes/IndicadorCota';
import { ComparacaoRevisaoLiteraria } from '../componentes/ComparacaoRevisaoLiteraria';
import {
  LARGURAS,
  MODOS_EDITOR,
  PaletaEditor,
  TAMANHO_PADRAO,
  type LarguraLeitura,
  type ModoEditor,
} from '../componentes/PaletaEditor';
import {
  montarMarcadorGlossario,
  TextoMarcadoZh,
  TextoTraduzido,
  type MarcadorGlossario,
} from '../componentes/TextoRico';
import { capturaDaSelecao, type Captura } from '../util/captura';
import { extrairTroca } from '../util/troca';
import type { ViolacaoEstilo } from '../util/passeEstilo';

// Seleção de texto → oferta de captura pro glossário (mesmo motivo do
// BannerTroca: cadastrar hoje custa sair do editor, ler a frase de memória e
// digitar os dois lados na aba Glossário). Um handler só, por delegação, no
// contêiner que envolve as duas visualizações (LinhaFrase e FraseSpan) — não um
// listener por frase, que o capítulo pode ter centenas.
function ladoDaSelecao(selecao: Selection): 'zh' | 'pt' | null {
  const no = selecao.anchorNode;
  const elemento = no instanceof Element ? no : no?.parentElement;
  const lado = elemento?.closest<HTMLElement>('[data-lado]')?.dataset.lado;
  return lado === 'zh' || lado === 'pt' ? lado : null;
}

// Soltar uma seleção de texto dispara um "click" sintético no mesmo elemento
// (mousedown+mouseup sem arrastar o suficiente para virar drag nativo). Sem
// esta guarda, capturar um termo TAMBÉM alternaria a linha (zh) ou entraria no
// modo de edição (pt) por baixo do painel que acabou de abrir.
function seSemSelecao(fn: () => void) {
  return () => {
    if (window.getSelection()?.toString()) return;
    fn();
  };
}

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

// ── Modos de visualização do capítulo (item 9 do backlog) ───────────────────
const CHAVE_MODO = 'dao-tale-modo-editor';
const CHAVE_TERMOS = 'dao-tale-marcar-termos';

// ── Formatação da leitura: tamanho da fonte e largura do PAPEL ──────────────
// A largura é do papel (o cartão encolhe centrado; o texto preenche), em rem
// fixos — se fosse em ch, o zoom A+ faria média e cheia colidirem no teto.
const CHAVE_TAMANHO = 'dao-tale-leitura-tamanho';
const CHAVE_LARGURA = 'dao-tale-leitura-largura';

// ── Estado da frase (item 7 do backlog, opção B aprovada) ───────────────────
// Lavagem de fundo esmaecendo + filete de pigmento + chip com o nome do estado.
// Prioridade: problemas primeiro (erro/regra), depois atenção (pergunta),
// depois intervenção humana (editada), depois selo de qualidade (confirmada).
// Frase "normal" (original da IA ou pendente) fica limpa.
type EstadoFrase = 'erro' | 'regra' | 'pergunta' | 'editada' | 'confirmada' | 'original' | 'pendente';

const ESTADO_FRASE_INFO: Partial<Record<EstadoFrase, { lava: string; chip: string; texto: string; rotulo: string }>> = {
  erro: { lava: 'frase-lava--erro', chip: 'bg-selo-tint text-selo-forte', texto: 'erro', rotulo: 'Erro na tradução' },
  regra: { lava: 'frase-lava--regra', chip: 'bg-selo-tint text-selo-forte', texto: 'regra', rotulo: 'Revisão pediu regra nova' },
  pergunta: { lava: 'frase-lava--pergunta', chip: 'bg-ocre-tint text-ocre-forte', texto: 'pergunta', rotulo: 'Pergunta de revisão pendente' },
  editada: { lava: 'frase-lava--editada', chip: 'bg-indigo-tint text-indigo-forte', texto: 'editada', rotulo: 'Editada à mão' },
  confirmada: { lava: 'frase-lava--confirmada', chip: 'bg-jade-tint text-jade-forte', texto: 'confirmada', rotulo: 'Confirmada na revisão' },
};

function estadoDaFrase(frase: Frase, casos: CasoTeste[] | undefined): EstadoFrase {
  if (frase.status_traducao === 'erro') return 'erro';
  if (frase.status_traducao === 'pendente') return 'pendente';
  if (casos?.some((c) => c.status === 'regra-nova-necessaria')) return 'regra';
  if (casos?.some((c) => c.status === 'pendente')) return 'pergunta';
  if (frase.editado_manualmente) return 'editada';
  if (casos?.some((c) => c.status === 'confirmado' || c.status === 'corrigido')) return 'confirmada';
  return 'original';
}

function ChipEstado({ estado }: { estado: EstadoFrase }) {
  const info = ESTADO_FRASE_INFO[estado];
  if (!info) return null;
  return (
    <span className={`chip-estado ${info.chip}`} title={info.rotulo}>
      {info.texto}
    </span>
  );
}

export function EditorCapitulo() {
  const { obraId, capituloId } = useParams();
  const clienteQuery = useQueryClient();
  const [fraseSelecionada, setFraseSelecionada] = useState<number | null>(null);
  const [progressoVivo, setProgressoVivo] = useState<ProgressoTraducao | null>(null);
  const [erroJob, setErroJob] = useState('');
  const [provedorEscolhido, setProvedorEscolhido] = useState('');
  const [mostrarConsistencia, setMostrarConsistencia] = useState(false);
  const [mostrarEstilo, setMostrarEstilo] = useState(false);
  const [mostrarQa, setMostrarQa] = useState(false);
  const [mostrarRevisaoLiteraria, setMostrarRevisaoLiteraria] = useState(false);
  // Correção rápida (troca de termo detectada numa edição manual) — o banner
  // oferece aplicar a mesma troca nas outras frases do capítulo/obra.
  const [troca, setTroca] = useState<{ de: string; para: string; fraseId: number } | null>(null);
  const aoEditarTexto = (antes: string, depois: string, fraseId: number) => {
    const t = extrairTroca(antes, depois);
    if (t) setTroca({ ...t, fraseId });
  };
  // Captura de termo pela seleção (spec da task 6): o painel só nasce se a
  // seleção passar pela mesma trava da correção rápida — vazio/curto demais/
  // frase inteira não vira oferta.
  const [captura, setCaptura] = useState<Captura | null>(null);
  const aoSoltarSelecao = () => {
    const selecao = window.getSelection();
    const texto = selecao?.toString() ?? '';
    if (!texto.trim() || !selecao) return;
    const lado = ladoDaSelecao(selecao);
    if (!lado) return;
    const c = capturaDaSelecao(lado, texto);
    if (c) setCaptura(c);
  };
  const [modo, setModo] = useState<ModoEditor>(() => {
    const salvo = localStorage.getItem(CHAVE_MODO);
    return MODOS_EDITOR.some((m) => m.id === salvo) ? (salvo as ModoEditor) : 'segmentado';
  });
  const [marcarTermos, setMarcarTermos] = useState(() => localStorage.getItem(CHAVE_TERMOS) !== 'nao');
  const [tamanhoLeitura, setTamanhoLeitura] = useState(() => {
    const salvo = Number(localStorage.getItem(CHAVE_TAMANHO));
    return salvo >= 0.8 && salvo <= 1.6 ? salvo : TAMANHO_PADRAO;
  });
  const [larguraLeitura, setLarguraLeitura] = useState<LarguraLeitura>(() => {
    const salvo = localStorage.getItem(CHAVE_LARGURA);
    return salvo && salvo in LARGURAS ? (salvo as LarguraLeitura) : 'cheia';
  });
  const fonteEventos = useRef<EventSource | null>(null);

  useEffect(() => localStorage.setItem(CHAVE_MODO, modo), [modo]);
  useEffect(() => localStorage.setItem(CHAVE_TERMOS, marcarTermos ? 'sim' : 'nao'), [marcarTermos]);
  useEffect(() => localStorage.setItem(CHAVE_TAMANHO, String(tamanhoLeitura)), [tamanhoLeitura]);
  useEffect(() => localStorage.setItem(CHAVE_LARGURA, larguraLeitura), [larguraLeitura]);

  const { data: provedores } = useQuery({
    queryKey: ['provedores'],
    queryFn: () => api<{ id: ProvedorId; nome: string }[]>('GET', '/provedores'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['capitulo', capituloId],
    queryFn: () => api<DetalheCapitulo>('GET', `/capitulos/${capituloId}`),
  });

  const { data: revisoesLiterarias = [] } = useQuery({
    queryKey: ['revisoes-literarias', capituloId],
    queryFn: () => api<RevisaoLiteraria[]>('GET', `/capitulos/${capituloId}/revisoes-literarias`),
  });

  // Glossário da obra → marcação ocre dos termos no texto (item 13).
  const { data: glossario } = useQuery({
    queryKey: ['glossario', obraId],
    queryFn: () => api<EntradaGlossario[]>('GET', `/obras/${obraId}/glossario`),
  });
  const marcador = useMemo(
    () => (marcarTermos ? montarMarcadorGlossario(glossario) : null),
    [glossario, marcarTermos],
  );

  // Deep-link "ir à frase" (?frase=<id>), vindo do glossário: seleciona e rola
  // até ela quando o capítulo carrega; depois limpa o parâmetro da URL.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const alvo = searchParams.get('frase');
    if (!alvo || !data?.frases.some((f) => f.id === Number(alvo))) return;
    const id = Number(alvo);
    setFraseSelecionada(id);
    requestAnimationFrame(() =>
      document.getElementById(`frase-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
    setSearchParams(
      (p) => {
        p.delete('frase');
        return p;
      },
      { replace: true },
    );
  }, [searchParams, data, setSearchParams]);

  // Casos de teste do capítulo → selo-ponto de pergunta/regra/confirmação (item 7).
  const { data: casosDoCapitulo } = useQuery({
    queryKey: ['testes-capitulo', capituloId],
    queryFn: () =>
      api<{ casos: CasoTeste[] }>('GET', `/obras/${obraId}/testes?capitulo=${capituloId}&limite=200`),
  });
  const casosPorFrase = useMemo(() => {
    const mapa = new Map<number, CasoTeste[]>();
    for (const caso of casosDoCapitulo?.casos ?? []) {
      const lista = mapa.get(caso.frase_id) ?? [];
      lista.push(caso);
      mapa.set(caso.frase_id, lista);
    }
    return mapa;
  }, [casosDoCapitulo]);

  // Capítulos da obra → navegação ‹ anterior / próximo › sem voltar à lista.
  const { data: capitulosDaObra } = useQuery({
    queryKey: ['capitulos', obraId],
    queryFn: () => api<CapituloResumo[]>('GET', `/obras/${obraId}/capitulos`),
  });
  const vizinhos = useMemo(() => {
    if (!capitulosDaObra || !data) return { anterior: null, proximo: null };
    const ordenados = [...capitulosDaObra].sort((a, b) => a.numero - b.numero);
    const i = ordenados.findIndex((c) => c.id === data.capitulo.id);
    return {
      anterior: i > 0 ? ordenados[i - 1] : null,
      proximo: i >= 0 && i < ordenados.length - 1 ? ordenados[i + 1] : null,
    };
  }, [capitulosDaObra, data]);

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

  // O cancelamento só surte efeito quando o bloco em voo termina; enquanto
  // isso o botão mostra "Cancelando…". Quando o job para, o estado é limpo
  // para a próxima execução.
  const emExecucaoAgora = (progressoVivo ?? data?.progresso)?.em_execucao ?? false;
  useEffect(() => {
    if (!emExecucaoAgora && (cancelar.isSuccess || cancelar.isPending)) cancelar.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emExecucaoAgora]);

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

  if (isLoading || !data) return <p className="text-tinta-2">Carregando…</p>;

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
      {/* Barra de contexto — onde estou e o que faço: capítulo, ‹ ›, contagem,
          status, cota e a ação primária. A exibição vive na paleta lateral. */}
      <div className="cartao mb-3 flex flex-wrap items-center gap-3 px-4 py-2">
        {/* Título trunca numa linha só; o original chinês fica no hover —
            nada de quebra de layout com títulos longos. */}
        <h2
          className="flex min-w-40 flex-1 items-baseline gap-2 font-display font-semibold"
          title={
            capitulo.titulo_pt && capitulo.titulo && capitulo.titulo !== capitulo.titulo_pt
              ? `${capitulo.titulo_pt} · ${capitulo.titulo}`
              : (capitulo.titulo_pt ?? capitulo.titulo ?? undefined)
          }
        >
          <span className="shrink-0">Capítulo {capitulo.numero}</span>
          {(capitulo.titulo_pt || capitulo.titulo) && (
            <span className="truncate font-normal text-tinta-2">{capitulo.titulo_pt ?? capitulo.titulo}</span>
          )}
        </h2>
        <span className="flex gap-0.5">
          {vizinhos.anterior ? (
            <Link
              to={`/obras/${obraId}/capitulos/${vizinhos.anterior.id}`}
              title={`Capítulo ${vizinhos.anterior.numero}`}
              className="grid size-7 place-items-center rounded-md border border-linha text-tinta-2 hover:border-jade hover:text-jade-forte"
            >
              ‹
            </Link>
          ) : (
            <span className="grid size-7 place-items-center rounded-md border border-linha/50 text-linha">‹</span>
          )}
          {vizinhos.proximo ? (
            <Link
              to={`/obras/${obraId}/capitulos/${vizinhos.proximo.id}`}
              title={`Capítulo ${vizinhos.proximo.numero}`}
              className="grid size-7 place-items-center rounded-md border border-linha text-tinta-2 hover:border-jade hover:text-jade-forte"
            >
              ›
            </Link>
          ) : (
            <span className="grid size-7 place-items-center rounded-md border border-linha/50 text-linha">›</span>
          )}
        </span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <span className="text-sm text-tinta-2 tabular-nums">
            {frases.length - pendentes - comErro}/{frases.length} frases
            {comErro > 0 && <span className="text-erro"> · {comErro} com erro</span>}
            {palavrasPt > 0 && (
              <span title={`${caracteresZh.toLocaleString('pt-BR')} caracteres no original chinês`}>
                {' '}· {palavrasPt.toLocaleString('pt-BR')} palavras
              </span>
            )}
          </span>
          <select
            value={capitulo.status}
            onChange={(e) => mudarStatus.mutate(e.target.value as StatusCapitulo)}
            className="entrada"
            title="Etapa do fluxo de trabalho deste capítulo"
          >
            {Object.entries(STATUS_CAPITULO_ROTULO).map(([valor, r]) => (
              <option key={valor} value={valor}>
                {r.texto}
              </option>
            ))}
          </select>
          <IndicadorCota compacto />
          {emExecucao ? (
            <>
              <div
                className="relative h-2 w-32 overflow-hidden rounded-full bg-papel-fundo"
                title={
                  progresso.em_voo
                    ? `${pct}% traduzido — aguardando o provedor responder as frases ${progresso.em_voo.de + 1}–${progresso.em_voo.ate + 1}`
                    : `${pct}% traduzido`
                }
              >
                <div
                  className="h-full rounded-full bg-info transition-all duration-700"
                  style={{ width: `${Math.max(pct, 3)}%` }}
                />
                {/* Bloco em voo: trecho pulsante logo após o já concluído — mostra
                    que há trabalho acontecendo mesmo sem o percentual mudar. */}
                {progresso.em_voo && progresso.frases_total > 0 && (
                  <div
                    className="absolute inset-y-0 animate-pulse rounded-full bg-info/40"
                    style={{
                      left: `${Math.max(pct, 3)}%`,
                      width: `${Math.round(((progresso.em_voo.ate - progresso.em_voo.de + 1) / progresso.frases_total) * 100)}%`,
                    }}
                  />
                )}
              </div>
              <span className="text-sm tabular-nums text-info">
                {progresso.frases_prontas}/{progresso.frases_total} · {pct}%
                {progresso.em_voo && (
                  <span className="animate-pulse"> · traduzindo {progresso.em_voo.de + 1}–{progresso.em_voo.ate + 1}…</span>
                )}
              </span>
              <Botao
                variante="secundario"
                onClick={() => cancelar.mutate()}
                disabled={cancelar.isPending || cancelar.isSuccess}
                title="Para ao fim do bloco em andamento — a chamada já em voo não pode ser abortada"
              >
                {cancelar.isPending || cancelar.isSuccess ? 'Cancelando…' : 'Cancelar'}
              </Botao>
            </>
          ) : (
            <>
              {(pendentes > 0 || comErro > 0) && (
                <Botao onClick={() => traduzir.mutate({})} disabled={traduzir.isPending}>
                  {frases.some((f) => f.status_traducao === 'traduzida') ? 'Retomar tradução' : 'Traduzir'}
                </Botao>
              )}
              {pendentes === 0 && comErro === 0 && capitulo.titulo && !capitulo.titulo_pt && (
                <Botao
                  onClick={() => traduzir.mutate({})}
                  disabled={traduzir.isPending}
                  title="O capítulo já está traduzido — isto pede à IA apenas a tradução do título"
                >
                  Traduzir título
                </Botao>
              )}
              <MenuMais titulo="Mais ações: ler, downloads, retraduzir, provedor">
                {frases.some((f) => f.status_traducao === 'traduzida') && (
                  <>
                    <Link
                      to={`/ler/${obraId}/${capitulo.numero}`}
                      className="rounded px-2 py-1.5 text-sm text-tinta hover:bg-papel-fundo"
                      title="Modo leitura: este capítulo sem as ferramentas da bancada"
                    >
                      Ler este capítulo
                    </Link>
                    <a
                      href={`/api/capitulos/${capitulo.id}/baixar?formato=md`}
                      download
                      className="rounded px-2 py-1.5 text-sm text-tinta hover:bg-papel-fundo"
                      title="Markdown: preserva itálico/negrito, com título do capítulo"
                    >
                      Baixar .md
                    </a>
                    <a
                      href={`/api/capitulos/${capitulo.id}/baixar`}
                      download
                      className="rounded px-2 py-1.5 text-sm text-tinta hover:bg-papel-fundo"
                      title="Texto puro corrido, com os parágrafos originais"
                    >
                      Baixar .txt
                    </a>
                    <a
                      href={`/api/capitulos/${capitulo.id}/baixar?formato=bilingue`}
                      download
                      className="rounded px-2 py-1.5 text-sm text-tinta hover:bg-papel-fundo"
                      title="Pares chinês/português por parágrafo, para revisão externa"
                    >
                      Baixar bilíngue
                    </a>
                    <button
                      type="button"
                      onClick={() => setMostrarQa(true)}
                      className="rounded px-2 py-1.5 text-left text-sm text-tinta hover:bg-papel-fundo"
                      title="Revisão por uma segunda IA (aponta problemas; não reescreve)"
                    >
                      QA por segunda IA…
                    </button>
                    {revisoesLiterarias.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMostrarRevisaoLiteraria(true)}
                        className="rounded px-2 py-1.5 text-left text-sm text-tinta hover:bg-papel-fundo"
                      >
                        Revisão literária… ({revisoesLiterarias.filter((r) => r.status === 'pendente' || r.status === 'conflito').length})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => retraduzirTudo(frases)}
                      disabled={traduzir.isPending}
                      className="rounded px-2 py-1.5 text-left text-sm text-erro hover:bg-selo-tint"
                    >
                      Retraduzir tudo…
                    </button>
                    <div className="my-1 border-t border-linha" />
                  </>
                )}
                <label className="flex flex-col gap-1 px-2 py-1 text-xs text-tinta-2">
                  Provedor desta tradução
                  <select
                    value={provedorEscolhido}
                    onChange={(e) => setProvedorEscolhido(e.target.value)}
                    className="entrada"
                    title="Vazio = padrão da obra/global"
                  >
                    <option value="">Provedor padrão</option>
                    {provedores?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </label>
                {capitulo.provedor && (
                  <p className="px-2 py-1 text-xs text-tinta-2">
                    Última tradução: {capitulo.provedor} · {capitulo.modelo}
                  </p>
                )}
              </MenuMais>
            </>
          )}
        </div>
      </div>

      {erroJob && <Aviso tipo="erro">{erroJob}</Aviso>}

      {/* Trilho de ícones flutuante FORA do papel (xl+): Exibição / Ferramentas /
          Texto, cada um abrindo um submenu de ícones com rótulo no hover. Em
          telas menores vira uma barra horizontal simples acima do texto. */}
      <PaletaEditor
        modo={modo}
        aoMudarModo={setModo}
        marcarTermos={marcarTermos}
        aoAlternarTermos={() => setMarcarTermos((v) => !v)}
        consistenciaDisponivel={frases.some((f) => f.status_traducao === 'traduzida') && !emExecucao}
        aoAbrirConsistencia={() => setMostrarConsistencia(true)}
        aoAbrirEstilo={() => setMostrarEstilo(true)}
        tamanho={tamanhoLeitura}
        aoMudarTamanho={setTamanhoLeitura}
        largura={larguraLeitura}
        aoMudarLargura={setLarguraLeitura}
      />

      <div>
        {/* onMouseUp aqui em vez de por frase: delegação — soltar uma seleção em
            qualquer LinhaFrase/FraseSpan (marcadas com data-lado) borbulha até aqui. */}
        <div onMouseUp={aoSoltarSelecao}>
          {modo === 'segmentado' ? (
            /* Folha contínua: uma única superfície; parágrafos separados por
               respiro, não por molduras. */
            <div className="cartao py-3">
              {paragrafos.map(([idx, frasesDoParagrafo]) => (
                // content-visibility: parágrafos fora da tela não são renderizados —
                // mantém capítulos muito longos (600+ frases) fluidos sem virtualização.
                <div
                  key={idx}
                  className="mt-5 first:mt-0 [contain-intrinsic-size:auto_120px] [content-visibility:auto]"
                >
                  {frasesDoParagrafo.map((frase) => (
                    <LinhaFrase
                      key={frase.id}
                      frase={frase}
                      capituloNumero={capitulo.numero}
                      estado={estadoDaFrase(frase, casosPorFrase.get(frase.id))}
                      marcador={marcador}
                      selecionada={frase.id === fraseSelecionada}
                      aoSelecionar={() => setFraseSelecionada(frase.id === fraseSelecionada ? null : frase.id)}
                      capituloId={capituloId!}
                      aoEditarTexto={aoEditarTexto}
                      emVoo={
                        !!progresso.em_voo &&
                        frase.ordem >= progresso.em_voo.de &&
                        frase.ordem <= progresso.em_voo.ate
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            /* Modos de leitura (item 9): a segmentação some visualmente; clicar
               numa frase continua abrindo o Protocolo de Revisão. */
            /* O papel é a moldura estável; a largura escolhida é da coluna de
               texto dentro dele (margens generosas, como um livro). Em rem
               fixos, o zoom A+ nunca faz média e cheia colidirem. */
            <div className="cartao px-5 py-6 md:px-10 md:py-8">
              <div
                className={`space-y-5 font-corpo leading-[1.75] ${larguraLeitura !== 'cheia' ? 'mx-auto' : ''}`}
                style={{
                  fontSize: `${tamanhoLeitura}rem`,
                  maxWidth: LARGURAS[larguraLeitura].css || undefined,
                }}
              >
                {(capitulo.titulo_pt || capitulo.titulo) && (
                  <h3 className="font-display text-xl font-semibold">
                    {capitulo.titulo_pt ?? capitulo.titulo}
                  </h3>
                )}
                {paragrafos.map(([idx, frasesDoParagrafo]) => (
                  <div key={idx} className="[contain-intrinsic-size:auto_80px] [content-visibility:auto]">
                    {modo === 'bilingue' && (
                      <p className="texto-zh mb-1.5 text-[0.95em] text-tinta-2">
                        {frasesDoParagrafo.map((frase) => (
                          <FraseSpan
                            key={frase.id}
                            frase={frase}
                            lado="zh"
                            marcador={marcador}
                            selecionada={frase.id === fraseSelecionada}
                            aoSelecionar={() => setFraseSelecionada(frase.id === fraseSelecionada ? null : frase.id)}
                          />
                        ))}
                      </p>
                    )}
                    <p>
                      {frasesDoParagrafo.map((frase) => (
                        <FraseSpan
                          key={frase.id}
                          frase={frase}
                          lado="pt"
                          marcador={marcador}
                          selecionada={frase.id === fraseSelecionada}
                          aoSelecionar={() => setFraseSelecionada(frase.id === fraseSelecionada ? null : frase.id)}
                        />
                      ))}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Rodapé: continuar o trabalho sem voltar à lista */}
        {(vizinhos.anterior || vizinhos.proximo) && (
          <div className="mt-4 flex items-center justify-between text-sm">
            {vizinhos.anterior ? (
              <Link
                to={`/obras/${obraId}/capitulos/${vizinhos.anterior.id}`}
                className="text-jade-forte hover:underline"
              >
                ‹ Capítulo {vizinhos.anterior.numero}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-tinta-2">fim do capítulo {capitulo.numero}</span>
            {vizinhos.proximo ? (
              <Link
                to={`/obras/${obraId}/capitulos/${vizinhos.proximo.id}`}
                className="text-jade-forte hover:underline"
              >
                Capítulo {vizinhos.proximo.numero} ›
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}

        {/* Gaveta de revisão (flutuante) */}
        {selecionada && (
          <GavetaRevisao
            frase={selecionada}
            referencia={`${capitulo.numero}.${selecionada.ordem}`}
            proxima={frases.find((f) => f.ordem === selecionada.ordem + 1) ?? null}
            capituloId={capituloId!}
            aoFechar={() => setFraseSelecionada(null)}
            aoEditarTexto={aoEditarTexto}
          />
        )}
        </div>
      </div>

      {captura && (
        // key força remontar ao trocar de seleção: sem isto, capturar um trecho
        // novo enquanto o painel de outro ainda está aberto herdaria o estado
        // (categoria/espécie já escolhidas) do anterior em vez de abrir limpo.
        <CapturaTermo
          key={`${captura.lado}:${captura.trecho}`}
          captura={captura}
          obraId={obraId!}
          glossario={glossario}
          aoFechar={() => setCaptura(null)}
        />
      )}

      {troca && (
        <BannerTroca
          troca={troca}
          obraId={obraId!}
          capituloId={capituloId!}
          frases={frases}
          aoFechar={() => setTroca(null)}
        />
      )}

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

      {mostrarEstilo && (
        <ModalEstilo
          capituloId={capituloId!}
          aoFechar={() => setMostrarEstilo(false)}
          aoIrParaFrase={(fraseId) => {
            setMostrarEstilo(false);
            setFraseSelecionada(fraseId);
            requestAnimationFrame(() =>
              document.getElementById(`frase-${fraseId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
            );
          }}
        />
      )}

      {mostrarQa && (
        <ModalQa
          capituloId={capituloId!}
          aoFechar={() => setMostrarQa(false)}
          aoIrParaFrase={(fraseId) => {
            setFraseSelecionada(fraseId);
            requestAnimationFrame(() =>
              document.getElementById(`frase-${fraseId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
            );
          }}
        />
      )}
      {mostrarRevisaoLiteraria && (
        <ComparacaoRevisaoLiteraria
          revisoes={revisoesLiterarias}
          frases={data.frases}
          capituloId={capituloId!}
          capituloNumero={data.capitulo.numero}
          aoFechar={() => setMostrarRevisaoLiteraria(false)}
          aoIrParaFrase={(fraseId) => {
            setMostrarRevisaoLiteraria(false);
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
  capituloNumero,
  estado,
  marcador,
  selecionada,
  aoSelecionar,
  capituloId,
  aoEditarTexto,
  emVoo = false,
}: {
  frase: Frase;
  capituloNumero: number;
  estado: EstadoFrase;
  marcador: MarcadorGlossario | null;
  selecionada: boolean;
  aoSelecionar: () => void;
  capituloId: string;
  /** Avisa a página da edição manual — alimenta a correção rápida de termo. */
  aoEditarTexto: (antes: string, depois: string, fraseId: number) => void;
  /** A frase está no bloco enviado ao provedor, aguardando resposta. */
  emVoo?: boolean;
}) {
  const clienteQuery = useQueryClient();
  const [texto, setTexto] = useState(frase.texto_pt);
  const [editando, setEditando] = useState(false);

  // Sincroniza quando a tradução chega por fora (job em lote, correção aplicada).
  useEffect(() => setTexto(frase.texto_pt), [frase.texto_pt]);

  const salvar = useMutation({
    mutationFn: (texto_pt: string) => api<Frase>('PATCH', `/frases/${frase.id}`, { texto_pt }),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] }),
  });

  const info = ESTADO_FRASE_INFO[estado];

  return (
    <div
      id={`frase-${frase.id}`}
      className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 px-4 py-1 ${
        selecionada ? 'bg-jade-tint/50' : 'hover:bg-papel-fundo/40'
      }`}
    >
      <div
        data-lado="zh"
        className="texto-zh cursor-pointer select-text break-words border-r border-linha/50 py-1 pr-4 text-tinta-2"
        onClick={seSemSelecao(aoSelecionar)}
        title="Clique para revisar esta frase"
      >
        <span
          className="mr-2 font-mono text-[10px] tabular-nums text-tinta-2/70"
          title="Referência capítulo.frase"
        >
          [{capituloNumero}.{frase.ordem}]
        </span>
        <TextoMarcadoZh texto={frase.texto_zh} marcador={marcador} />
      </div>
      {/* Estado B aprovado: lavagem + filete na célula da tradução. */}
      <div className={`frase-lava ${info?.lava ?? ''} rounded-r py-1`}>
        {editando ? (
          <textarea
            value={texto}
            autoFocus
            placeholder={frase.status_traducao === 'pendente' ? '(pendente de tradução)' : ''}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={() => {
              setEditando(false);
              if (texto !== frase.texto_pt) {
                // A detecção da troca só dispara com a edição salva — a prévia
                // no servidor não pode contar a própria frase corrigida.
                salvar.mutate(texto, {
                  onSuccess: () => aoEditarTexto(frase.texto_pt, texto, frase.id),
                });
              }
            }}
            rows={Math.max(2, Math.ceil(texto.length / 60))}
            className="w-full resize-none rounded border border-jade bg-papel-alto px-1 py-0.5 text-sm leading-relaxed focus:outline-none"
          />
        ) : (
          // Markdown renderizado (itálico/negrito visíveis); clique para editar o texto cru.
          <div
            data-lado="pt"
            onClick={seSemSelecao(() => setEditando(true))}
            title="Clique para editar"
            className="min-h-6 cursor-text break-words text-sm leading-relaxed"
          >
            {frase.texto_pt ? (
              <>
                <TextoTraduzido texto={frase.texto_pt} marcador={marcador} />
                <ChipEstado estado={estado} />
              </>
            ) : emVoo && frase.status_traducao === 'pendente' ? (
              <span className="animate-pulse italic text-info">(traduzindo…)</span>
            ) : (
              <span className="italic text-tinta-2">
                {frase.status_traducao === 'pendente' ? '(pendente de tradução)' : '(vazio)'}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Frase nos modos de leitura: um span clicável, sem borda — a segmentação
// desaparece visualmente mas a seleção (e o painel de revisão) continua.
function FraseSpan({
  frase,
  lado,
  marcador,
  selecionada,
  aoSelecionar,
}: {
  frase: Frase;
  lado: 'zh' | 'pt';
  marcador: MarcadorGlossario | null;
  selecionada: boolean;
  aoSelecionar: () => void;
}) {
  const texto = lado === 'zh' ? frase.texto_zh : frase.texto_pt;
  const pendente = lado === 'pt' && !texto.trim();
  return (
    <>
      <span
        id={lado === 'pt' ? `frase-${frase.id}` : undefined}
        data-lado={lado}
        onClick={seSemSelecao(aoSelecionar)}
        title="Clique para revisar esta frase"
        className={`cursor-pointer rounded-xs decoration-linha underline-offset-4 hover:underline ${
          selecionada ? 'bg-jade-tint' : ''
        } ${pendente ? 'text-tinta-2 italic' : ''}`}
      >
        {pendente ? (
          '[…]'
        ) : lado === 'zh' ? (
          <TextoMarcadoZh texto={texto} marcador={marcador} />
        ) : (
          <TextoTraduzido texto={texto} marcador={marcador} />
        )}
      </span>
      {lado === 'pt' ? ' ' : ''}
    </>
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
  const clienteQuery = useQueryClient();
  const dispensar = useMutation({
    mutationFn: (d: { frase_id: number; termo_zh: string }) =>
      api('POST', `/frases/${d.frase_id}/consistencia/dispensar`, { termo_zh: d.termo_zh }),
    onSuccess: () => {
      clienteQuery.invalidateQueries({ queryKey: ['consistencia', capituloId] });
      clienteQuery.invalidateQueries({ queryKey: ['capitulos'] });
    },
  });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40" onClick={aoFechar}>
      <div className="max-h-[80vh] w-[42rem] max-w-full space-y-3 overflow-auto cartao p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="font-semibold">Consistência do glossário</h3>
          <button onClick={aoFechar} className="text-tinta-2 hover:text-tinta">
            ✕
          </button>
        </div>
        {isLoading && <p className="text-sm text-tinta-2">Verificando…</p>}
        {data && (
          <>
            <p className="text-sm text-tinta-2">
              {data.ocorrencias} ocorrência{data.ocorrencias === 1 ? '' : 's'} de termos do glossário neste capítulo ·{' '}
              {data.violacoes.length === 0 ? (
                <span className="font-medium text-jade-forte">todas seguem o cânone.</span>
              ) : (
                <span className="font-medium text-selo-forte">{data.violacoes.length} fora do cânone:</span>
              )}
            </p>
            <div className="space-y-2">
              {data.violacoes.map((v, i) => (
                <div key={i} className="rounded border border-selo/40 bg-selo-tint p-3 text-sm">
                  <p className="mb-1">
                    <span className="texto-zh font-medium">{v.termo_zh}</span> deveria virar{' '}
                    <span className="font-medium">“{v.termo_pt}”</span> (frase {v.ordem + 1})
                  </p>
                  <p className="texto-zh text-xs text-tinta-2">{v.texto_zh}</p>
                  <p className="mb-2 text-xs text-tinta-2">{v.texto_pt}</p>
                  <div className="flex flex-wrap gap-2">
                    <Botao variante="secundario" onClick={() => aoIrParaFrase(v.frase_id)}>
                      Ir à frase
                    </Botao>
                    {/* Nem toda ausência é erro: com o referente já estabelecido,
                        o português OMITE em vez de repetir. Sem um jeito de dizer
                        "já conferi", o indicador fica aceso para sempre e o
                        revisor aprende a ignorá-lo. */}
                    <Botao
                      variante="secundario"
                      onClick={() => dispensar.mutate({ frase_id: v.frase_id, termo_zh: v.termo_zh })}
                      disabled={dispensar.isPending}
                    >
                      Dispensar — está certo assim
                    </Botao>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-tinta-2">
              Verificação heurística: ignora maiúsculas e acentos e aceita flexão (plural, artigo) — mas continua
              sendo sinalização, não veredito. Quando a ausência for legítima (o referente já está estabelecido e
              repetir pioraria a prosa), use <strong>Dispensar</strong>: some daqui e do contador do capítulo.
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

/** Varredura de estilo: determinística, sem IA e sem custo — ela já achava tudo
 *  isso, só não tinha onde aparecer, e o revisor relia o capítulo à mão
 *  procurando o que uma regex encontra em milissegundos. */
function ModalEstilo({
  capituloId,
  aoFechar,
  aoIrParaFrase,
}: {
  capituloId: string;
  aoFechar: () => void;
  aoIrParaFrase: (fraseId: number) => void;
}) {
  const { obraId } = useParams();
  const navegar = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['estilo', capituloId],
    queryFn: () =>
      api<{ frases_total: number; violacoes: ViolacaoEstilo[]; por_terco: [number, number, number]; ignoradas: number }>(
        'GET',
        `/capitulos/${capituloId}/estilo`,
      ),
    staleTime: 0,
  });
  const clienteQuery = useQueryClient();
  const ignorar = useMutation({
    mutationFn: (d: { frase_id: number; regra: string; trecho: string }) =>
      api('POST', `/frases/${d.frase_id}/estilo/dispensar`, { regra: d.regra, trecho: d.trecho }),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['estilo', capituloId] }),
  });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40" onClick={aoFechar}>
      <div className="max-h-[80vh] w-[42rem] max-w-full space-y-3 overflow-auto cartao p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h3 className="font-semibold">Estilo da obra</h3>
          <button onClick={aoFechar} className="text-tinta-2 hover:text-tinta">
            ✕
          </button>
        </div>
        {isLoading && <p className="text-sm text-tinta-2">Verificando…</p>}
        {data && (
          <>
            <p className="text-sm text-tinta-2">
              {data.frases_total} frase{data.frases_total === 1 ? '' : 's'} ·{' '}
              {data.violacoes.length === 0 ? (
                <span className="font-medium text-jade-forte">nada fora das preferências.</span>
              ) : (
                <span className="font-medium text-selo-forte">{data.violacoes.length} fora das preferências:</span>
              )}
              {data.ignoradas > 0 && <> · {data.ignoradas} ignorada{data.ignoradas === 1 ? '' : 's'}</>}
            </p>
            {data.violacoes.length > 0 && (
              /* Concentração no fim acusa bloco grande demais (decaimento ao
                 longo de uma geração longa); espalhado acusa outra coisa. */
              <p className="text-xs text-tinta-2">
                Por terço do capítulo: {data.por_terco[0]} · {data.por_terco[1]} · {data.por_terco[2]}
                {data.por_terco[2] > data.por_terco[0] + data.por_terco[1] && ' — concentrado no fim, típico de bloco grande demais.'}
              </p>
            )}
            {/* A saída deste modal para o conserto. Esta lista sempre soube
                apontar e nunca soube ajudar: dispensar ou ir à frase, e o
                revisor consertava 57 à mão. O passe pede à IA o par cirúrgico
                de cada uma — e por isso é tela própria, não mais um botão
                aqui dentro. */}
            {data.violacoes.length > 0 && (
              <div>
                <Botao onClick={() => navegar(`/obras/${obraId}/capitulos/${capituloId}/estilo`)}>
                  Propor consertos com a IA…
                </Botao>
              </div>
            )}
            <div className="space-y-2">
              {data.violacoes.map((v, i) => {
                // A orientação só existe nas regras do catálogo, e é a única
                // coisa aqui que diz o que é CERTO em vez de só apontar.
                const orientacao = orientacaoDaRegra(v.regra);
                return (
                <div key={i} className="rounded border border-selo/40 bg-selo-tint p-3 text-sm">
                  <p className="mb-2">
                    <span className="font-medium">“{v.trecho}”</span> — {REGRA_ESTILO_ROTULO[v.regra] ?? v.regra} (frase{' '}
                    {v.ordem + 1})
                  </p>
                  {orientacao && <p className="mb-2 text-xs text-tinta-2">{orientacao}</p>}
                  <div className="flex flex-wrap gap-2">
                    {v.frase_id != null && (
                      <>
                        <Botao variante="secundario" onClick={() => aoIrParaFrase(v.frase_id!)}>
                          Ir à frase
                        </Botao>
                        <Botao
                          variante="secundario"
                          onClick={() => ignorar.mutate({ frase_id: v.frase_id!, regra: v.regra, trecho: v.trecho })}
                          disabled={ignorar.isPending}
                        >
                          Ignorar alerta
                        </Botao>
                      </>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
            <p className="text-xs text-tinta-2">
              A varredura sinaliza, não julga. <strong>Ignorar alerta</strong> tira daqui e da contagem sem tocar no
              texto. As regras de estilo são heurística por sufixo: palavras que caem aqui sempre (nome de árvore,
              advérbio) são caso para a lista de exceções da varredura, que conserta para todas as obras de uma vez —
              não para ignorar uma a uma. E ela não vê tudo: <em>fora</em>, <em>era</em>, <em>vira</em> e{' '}
              <em>dera</em> são ambíguas demais para acusar, então continuam por sua conta. Os alertas com uma linha
              de orientação vêm do catálogo de erros zh→pt-BR: esses comparam o original com a tradução, e o passe de
              estilo conserta cada um com o chinês à vista.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// QA por segunda IA (doc 09 §6): roda a auditoria e tria os apontamentos. A IA
// só aponta — "Aplicar sugestão" é decisão humana (marca editado_manualmente).
const TIPO_QA_ROTULO: Record<ApontamentoQa['tipo'], string> = {
  glossario: 'Glossário',
  'pronome-genero': 'Pronome/gênero',
  repeticao: 'Repetição',
  omissao: 'Omissão',
  outro: 'Outro',
};
const SEV_QA: Record<ApontamentoQa['severidade'], { rotulo: string; classe: string }> = {
  alta: { rotulo: 'alta', classe: 'bg-selo-tint text-selo-forte' },
  media: { rotulo: 'média', classe: 'bg-ocre-tint text-ocre-forte' },
  baixa: { rotulo: 'baixa', classe: 'bg-papel-fundo text-tinta-2' },
};

function ModalQa({
  capituloId,
  aoFechar,
  aoIrParaFrase,
}: {
  capituloId: string;
  aoFechar: () => void;
  aoIrParaFrase: (fraseId: number) => void;
}) {
  const clienteQuery = useQueryClient();
  const [erro, setErro] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['qa', capituloId],
    queryFn: () => api<{ qa_em: string | null; apontamentos: ApontamentoQa[] }>('GET', `/capitulos/${capituloId}/qa`),
    staleTime: 0,
  });

  const invalidar = () => {
    clienteQuery.invalidateQueries({ queryKey: ['qa', capituloId] });
    clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
  };

  const rodar = useMutation({
    mutationFn: (forcar: boolean) =>
      api('POST', `/capitulos/${capituloId}/qa${forcar ? '?forcar=1' : ''}`, {}),
    onSuccess: () => {
      setErro('');
      invalidar();
    },
    onError: (e: any) => {
      // par-igual (409): oferece forçar.
      if (e?.status === 409) {
        if (window.confirm('O QA usaria o mesmo modelo que traduziu o capítulo (pontos cegos iguais). Rodar assim mesmo?'))
          rodar.mutate(true);
      } else {
        setErro((e as Error).message);
      }
    },
  });

  const triar = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'aceito' | 'descartado' }) =>
      api('PUT', `/qa/${id}`, { status }),
    onSuccess: invalidar,
  });
  const aplicar = useMutation({
    mutationFn: (id: number) => api('POST', `/qa/${id}/aplicar`, {}),
    onSuccess: invalidar,
    onError: (e) => setErro((e as Error).message),
  });

  const apontamentos = data?.apontamentos ?? [];
  const pendentes = apontamentos.filter((a) => a.status === 'pendente');

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40" onClick={aoFechar}>
      <div className="max-h-[80vh] w-[46rem] max-w-full space-y-3 overflow-auto cartao p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold">QA por segunda IA</h3>
            <p className="text-xs text-tinta-2">
              Uma IA diferente da que traduziu aponta problemas de glossário, gênero, repetição e omissão. Ela não
              reescreve — você decide cada apontamento.
            </p>
          </div>
          <button onClick={aoFechar} className="text-tinta-2 hover:text-tinta">
            ✕
          </button>
        </div>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="flex items-center gap-3">
          <Botao onClick={() => rodar.mutate(false)} disabled={rodar.isPending}>
            {rodar.isPending ? 'Analisando…' : data?.qa_em ? 'Rodar QA de novo' : 'Rodar QA'}
          </Botao>
          {data?.qa_em && (
            <span className="text-xs text-tinta-2">
              Última passada: {new Date(data.qa_em + 'Z').toLocaleString('pt-BR')} · {pendentes.length} pendente
              {pendentes.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {isLoading && <p className="text-sm text-tinta-2">Carregando…</p>}
        {data && apontamentos.length === 0 && !rodar.isPending && (
          <p className="text-sm text-tinta-2">
            {data.qa_em ? 'Nenhum apontamento — a tradução passou no QA.' : 'QA ainda não rodou neste capítulo.'}
          </p>
        )}

        <div className="space-y-2">
          {apontamentos.map((a) => {
            const sev = SEV_QA[a.severidade];
            const triado = a.status !== 'pendente';
            return (
              <div
                key={a.id}
                className={`rounded border border-linha/60 p-3 text-sm ${triado ? 'opacity-50' : ''}`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${sev.classe}`}>{sev.rotulo}</span>
                  <span className="text-xs font-medium text-tinta-2">{TIPO_QA_ROTULO[a.tipo]}</span>
                  {triado && <span className="text-xs text-tinta-2">· {a.status === 'aceito' ? 'aceito' : 'descartado'}</span>}
                </div>
                <p>{a.observacao}</p>
                {a.trecho_zh && <p className="texto-zh mt-1 text-xs text-tinta-2">{a.trecho_zh}</p>}
                {a.sugestao && (
                  <p className="mt-1 rounded bg-jade-tint px-2 py-1 text-xs text-jade-forte">Sugestão: {a.sugestao}</p>
                )}
                {!triado && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {a.sugestao && a.frase_id && (
                      <Botao onClick={() => aplicar.mutate(a.id)} disabled={aplicar.isPending}>
                        Aplicar sugestão
                      </Botao>
                    )}
                    {a.frase_id && (
                      <Botao variante="secundario" onClick={() => aoIrParaFrase(a.frase_id!)}>
                        Ir à frase
                      </Botao>
                    )}
                    <Botao variante="secundario" onClick={() => triar.mutate({ id: a.id, status: 'aceito' })}>
                      Aceitar sem aplicar
                    </Botao>
                    <Botao variante="secundario" onClick={() => triar.mutate({ id: a.id, status: 'descartado' })}>
                      Descartar
                    </Botao>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Correção rápida (troca de termo): quando uma edição manual troca um termo,
// oferece aplicar a mesma troca nas outras frases do capítulo ou da obra.
function BannerTroca({
  troca,
  obraId,
  capituloId,
  frases,
  aoFechar,
}: {
  troca: { de: string; para: string; fraseId: number };
  obraId: string;
  capituloId: string;
  frases: Frase[];
  aoFechar: () => void;
}) {
  const clienteQuery = useQueryClient();
  const [erro, setErro] = useState('');
  const [aplicado, setAplicado] = useState<number | null>(null);

  // Ocorrências restantes neste capítulo — fora a frase recém-corrigida (a
  // lista local pode ainda não ter sido recarregada após o salvamento).
  const noCapitulo = frases.filter((f) => f.id !== troca.fraseId && f.texto_pt.includes(troca.de)).length;

  const { data: naObra } = useQuery({
    queryKey: ['troca-previa', obraId, troca.de, troca.para],
    queryFn: () =>
      api<{ frases: number; capitulos: number }>('POST', `/obras/${obraId}/substituir`, {
        de: troca.de,
        para: troca.para,
        previa: true,
      }),
  });

  const aplicar = useMutation({
    mutationFn: (escopo: 'capitulo' | 'obra') =>
      api<{ frases: number; capitulos: number }>('POST', `/obras/${obraId}/substituir`, {
        de: troca.de,
        para: troca.para,
        ...(escopo === 'capitulo' ? { capitulo_id: Number(capituloId) } : {}),
      }),
    onSuccess: (r) => {
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
      setAplicado(r.frases);
      setTimeout(aoFechar, 4000);
    },
    onError: (e) => setErro((e as Error).message),
  });

  // Nada a propagar (a prévia da obra já chegou e não há outras ocorrências).
  if (naObra && naObra.frases === 0 && noCapitulo === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-30 w-[36rem] max-w-[calc(100vw-2rem)] -translate-x-1/2">
      <div className="cartao space-y-2 border-ocre/60 p-3 text-sm shadow-xl shadow-tinta/10">
        {aplicado !== null ? (
          <p>
            <span className="font-medium text-jade-forte">Aplicado</span> em {aplicado} frase
            {aplicado === 1 ? '' : 's'}.
          </p>
        ) : (
          <>
            <p>
              Você trocou <span className="rounded bg-selo-tint px-1 font-medium">{troca.de}</span> por{' '}
              <span className="rounded bg-jade-tint px-1 font-medium">{troca.para}</span>
              {noCapitulo > 0 && (
                <>
                  {' '}
                  — aparece em mais <strong>{noCapitulo}</strong> frase{noCapitulo === 1 ? '' : 's'} deste capítulo
                </>
              )}
              {naObra && naObra.frases > noCapitulo && (
                <>
                  {noCapitulo > 0 ? ' e' : ' — aparece'} em <strong>{naObra.frases - noCapitulo}</strong> frase
                  {naObra.frases - noCapitulo === 1 ? '' : 's'} de outros capítulos
                </>
              )}
              .
            </p>
            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            <div className="flex flex-wrap items-center gap-2">
              {noCapitulo > 0 && (
                <Botao onClick={() => aplicar.mutate('capitulo')} disabled={aplicar.isPending}>
                  Aplicar no capítulo ({noCapitulo})
                </Botao>
              )}
              {naObra && naObra.frases > 0 && naObra.frases !== noCapitulo && (
                <Botao variante="secundario" onClick={() => aplicar.mutate('obra')} disabled={aplicar.isPending}>
                  Aplicar na obra inteira ({naObra.frases} frase{naObra.frases === 1 ? '' : 's'} em {naObra.capitulos}{' '}
                  capítulo{naObra.capitulos === 1 ? '' : 's'})
                </Botao>
              )}
              <button onClick={aoFechar} className="ml-auto text-xs text-tinta-2 underline hover:text-tinta">
                Ignorar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
