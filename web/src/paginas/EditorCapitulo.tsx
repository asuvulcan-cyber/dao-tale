import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
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
  RespostaRevisao,
  StatusCapitulo,
} from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, Etiqueta, MenuMais, STATUS_CAPITULO_ROTULO, STATUS_CASO_ROTULO } from '../App';
import { IndicadorCota } from '../componentes/IndicadorCota';
import {
  montarMarcadorGlossario,
  TextoMarcadoZh,
  TextoTraduzido,
  type MarcadorGlossario,
} from '../componentes/TextoRico';
import { extrairTroca } from '../util/troca';

interface DetalheCapitulo {
  capitulo: Capitulo;
  frases: Frase[];
  progresso: ProgressoTraducao;
}

interface TermoExtraido {
  termo_zh: string;
  termo_pt: string;
  categoria?: string;
  contexto?: string;
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
const MODOS_EDITOR = [
  { id: 'segmentado', rotulo: 'Segmentado' },
  { id: 'bilingue', rotulo: 'Bilíngue' },
  { id: 'leitura', rotulo: 'Leitura' },
] as const;
type ModoEditor = (typeof MODOS_EDITOR)[number]['id'];
const CHAVE_MODO = 'dao-tale-modo-editor';
const CHAVE_TERMOS = 'dao-tale-marcar-termos';

// ── Formatação da leitura: tamanho da fonte e largura do PAPEL ──────────────
// A largura é do papel (o cartão encolhe centrado; o texto preenche), em rem
// fixos — se fosse em ch, o zoom A+ faria média e cheia colidirem no teto.
const CHAVE_TAMANHO = 'dao-tale-leitura-tamanho';
const CHAVE_LARGURA = 'dao-tale-leitura-largura';
const TAMANHO_PADRAO = 1.06; // rem
const LARGURAS = {
  estreita: { rotulo: 'Estreita', css: '42rem' },
  media: { rotulo: 'Média', css: '56rem' },
  cheia: { rotulo: 'Cheia', css: '' },
} as const;
type LarguraLeitura = keyof typeof LARGURAS;

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
  const [mostrarQa, setMostrarQa] = useState(false);
  // Correção rápida (troca de termo detectada numa edição manual) — o banner
  // oferece aplicar a mesma troca nas outras frases do capítulo/obra.
  const [troca, setTroca] = useState<{ de: string; para: string; fraseId: number } | null>(null);
  const aoEditarTexto = (antes: string, depois: string, fraseId: number) => {
    const t = extrairTroca(antes, depois);
    if (t) setTroca({ ...t, fraseId });
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
              <MenuMais titulo="Mais ações: downloads, retraduzir, provedor">
                {frases.some((f) => f.status_traducao === 'traduzida') && (
                  <>
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
        tamanho={tamanhoLeitura}
        aoMudarTamanho={setTamanhoLeitura}
        largura={larguraLeitura}
        aoMudarLargura={setLarguraLeitura}
      />

      <div>
        <div>
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
          <PainelRevisao
            frase={selecionada}
            proxima={frases.find((f) => f.ordem === selecionada.ordem + 1) ?? null}
            capituloId={capituloId!}
            aoFechar={() => setFraseSelecionada(null)}
            aoEditarTexto={aoEditarTexto}
          />
        )}
        </div>
      </div>

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
    </div>
  );
}

// ── Paleta do editor: dois trilhos verticais rentes ao papel ────────────────
// Sem submenus (decisão do usuário): botões diretos com rótulo no hover.
// Esquerda: modos + ferramentas · Direita: zoom e largura (um botão cíclico).
// A posição horizontal acompanha a borda do conteúdo (max-w-6xl centrado),
// não a borda da tela. Em telas < xl vira barra horizontal.

function RotuloHover({ lado, children }: { lado: 'direita' | 'esquerda'; children: React.ReactNode }) {
  const posicao =
    lado === 'direita'
      ? 'left-full ml-2'
      : 'right-full mr-2';
  return (
    <span
      className={`pointer-events-none absolute top-1/2 z-30 hidden -translate-y-1/2 rounded-md border border-linha bg-papel-alto px-2 py-1 text-xs whitespace-nowrap text-tinta shadow-md group-hover:block ${posicao}`}
    >
      {children}
    </span>
  );
}

function BotaoTrilho({
  rotulo,
  ladoRotulo = 'direita',
  ativo = false,
  corAtiva = 'bg-marca text-papel-alto',
  onClick,
  children,
}: {
  rotulo: string;
  ladoRotulo?: 'direita' | 'esquerda';
  ativo?: boolean;
  corAtiva?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      aria-label={rotulo}
      className={`group relative grid size-9 place-items-center rounded-lg border ${
        ativo ? `border-transparent ${corAtiva}` : 'border-transparent text-tinta-2 hover:border-linha hover:text-tinta'
      }`}
    >
      {children}
      <RotuloHover lado={ladoRotulo}>{rotulo}</RotuloHover>
    </button>
  );
}

const ICONE_MODO: Record<ModoEditor, React.ReactNode> = {
  segmentado: (
    // Tela dividida
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <line x1="8" y1="2.5" x2="8" y2="13.5" />
    </svg>
  ),
  bilingue: (
    // Tradução
    <span className="texto-zh text-[11px] leading-none">文A</span>
  ),
  leitura: (
    // Olho
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  ),
};

// Ícone de largura: barras horizontais de extensão crescente (0=estreita…2=cheia).
function IconeLargura({ nivel }: { nivel: number }) {
  const meia = 4 + nivel * 2.2;
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3">
      <line x1={8 - meia} y1="8" x2={8 + meia} y2="8" />
      <line x1={8 - meia} y1="5.5" x2={8 - meia} y2="10.5" />
      <line x1={8 + meia} y1="5.5" x2={8 + meia} y2="10.5" />
    </svg>
  );
}

// Trilhos rentes à borda do papel: o conteúdo é max-w-6xl (72rem) centrado com
// px-4; 50vw - 38.5rem posiciona o trilho logo fora dessa borda.
const POSICAO_TRILHO_ESQ = 'left-[max(0.25rem,calc(50vw-38.5rem))]';
const POSICAO_TRILHO_DIR = 'right-[max(0.25rem,calc(50vw-38.5rem))]';

function PaletaEditor({
  modo,
  aoMudarModo,
  marcarTermos,
  aoAlternarTermos,
  consistenciaDisponivel,
  aoAbrirConsistencia,
  tamanho,
  aoMudarTamanho,
  largura,
  aoMudarLargura,
}: {
  modo: ModoEditor;
  aoMudarModo: (m: ModoEditor) => void;
  marcarTermos: boolean;
  aoAlternarTermos: () => void;
  consistenciaDisponivel: boolean;
  aoAbrirConsistencia: () => void;
  tamanho: number;
  aoMudarTamanho: React.Dispatch<React.SetStateAction<number>>;
  largura: LarguraLeitura;
  aoMudarLargura: (l: LarguraLeitura) => void;
}) {
  const diminuir = () => aoMudarTamanho((t) => Math.max(0.8, Number((t - 0.08).toFixed(2))));
  const aumentar = () => aoMudarTamanho((t) => Math.min(1.6, Number((t + 0.08).toFixed(2))));
  const pctTexto = `${Math.round((tamanho / TAMANHO_PADRAO) * 100)}%`;
  const mostrarTexto = modo !== 'segmentado';

  // Um botão só alterna entre as três larguras, em ciclo.
  const ordemLarguras = Object.keys(LARGURAS) as LarguraLeitura[];
  const nivelLargura = ordemLarguras.indexOf(largura);
  const proximaLargura = ordemLarguras[(nivelLargura + 1) % ordemLarguras.length];

  return (
    <>
      {/* Trilho esquerdo (xl+): modos e ferramentas */}
      <div className={`fixed top-1/2 z-20 hidden -translate-y-1/2 xl:block ${POSICAO_TRILHO_ESQ}`}>
        <div className="cartao flex flex-col items-center gap-1 p-1.5 shadow-lg shadow-tinta/10">
          {MODOS_EDITOR.map((m) => (
            <BotaoTrilho key={m.id} rotulo={m.rotulo} ativo={modo === m.id} onClick={() => aoMudarModo(m.id)}>
              {ICONE_MODO[m.id]}
            </BotaoTrilho>
          ))}
          <div className="my-0.5 w-6 border-t border-linha/60" />
          <BotaoTrilho
            rotulo={marcarTermos ? 'Termos do glossário: marcados' : 'Termos do glossário: ocultos'}
            ativo={marcarTermos}
            corAtiva="bg-ocre-tint text-ocre-forte"
            onClick={aoAlternarTermos}
          >
            <span className="termo-gloss text-sm leading-none">T</span>
          </BotaoTrilho>
          {consistenciaDisponivel && (
            <BotaoTrilho rotulo="Consistência do glossário" onClick={aoAbrirConsistencia}>
              <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.3">
                <circle cx="8" cy="8" r="6.2" />
                <path d="m5.2 8.2 2 2 3.6-4" />
              </svg>
            </BotaoTrilho>
          )}
        </div>
      </div>

      {/* Trilho direito (xl+): zoom e largura — só nos modos de leitura */}
      {mostrarTexto && (
        <div className={`fixed top-1/2 z-20 hidden -translate-y-1/2 xl:block ${POSICAO_TRILHO_DIR}`}>
          <div className="cartao flex flex-col items-center gap-1 p-1.5 shadow-lg shadow-tinta/10">
            <BotaoTrilho rotulo="Aumentar texto" ladoRotulo="esquerda" onClick={aumentar}>
              <span className="text-xs font-semibold">A+</span>
            </BotaoTrilho>
            <span className="font-mono text-[10px] text-tinta-2 tabular-nums" title="Tamanho do texto">
              {pctTexto}
            </span>
            <BotaoTrilho rotulo="Diminuir texto" ladoRotulo="esquerda" onClick={diminuir}>
              <span className="text-xs font-semibold">A−</span>
            </BotaoTrilho>
            <div className="my-0.5 w-6 border-t border-linha/60" />
            <BotaoTrilho
              rotulo={`Largura: ${LARGURAS[largura].rotulo.toLowerCase()} — clique para alternar`}
              ladoRotulo="esquerda"
              onClick={() => aoMudarLargura(proximaLargura)}
            >
              <IconeLargura nivel={nivelLargura} />
            </BotaoTrilho>
          </div>
        </div>
      )}

      {/* Barra horizontal (telas < xl) */}
      <div className="cartao mb-4 flex flex-wrap items-center gap-2 px-3 py-2 xl:hidden">
        <div className="seg" role="group" aria-label="Modo de visualização">
          {MODOS_EDITOR.map((m) => (
            <button key={m.id} type="button" onClick={() => aoMudarModo(m.id)} aria-pressed={modo === m.id}>
              {m.rotulo}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ferramenta"
          onClick={aoAlternarTermos}
          aria-pressed={marcarTermos}
          title="Marcar termos do glossário no texto"
        >
          Termos
        </button>
        {consistenciaDisponivel && (
          <button type="button" className="ferramenta" onClick={aoAbrirConsistencia}>
            Consistência
          </button>
        )}
        {mostrarTexto && (
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" className="ferramenta" onClick={diminuir} aria-label="Diminuir texto">
              A−
            </button>
            <span className="font-mono text-[11px] text-tinta-2 tabular-nums">{pctTexto}</span>
            <button type="button" className="ferramenta" onClick={aumentar} aria-label="Aumentar texto">
              A+
            </button>
            <button
              type="button"
              className="ferramenta"
              onClick={() => aoMudarLargura(proximaLargura)}
              title="Alternar largura do texto"
            >
              Largura: {LARGURAS[largura].rotulo}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function LinhaFrase({
  frase,
  estado,
  marcador,
  selecionada,
  aoSelecionar,
  capituloId,
  aoEditarTexto,
  emVoo = false,
}: {
  frase: Frase;
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
        className="texto-zh cursor-pointer select-text break-words border-r border-linha/50 py-1 pr-4 text-tinta-2"
        onClick={aoSelecionar}
        title="Clique para revisar esta frase"
      >
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
            onClick={() => setEditando(true)}
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
        onClick={aoSelecionar}
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

function PainelRevisao({
  frase,
  proxima,
  capituloId,
  aoFechar,
  aoEditarTexto,
}: {
  frase: Frase;
  proxima: Frase | null;
  capituloId: string;
  aoFechar: () => void;
  aoEditarTexto: (antes: string, depois: string, fraseId: number) => void;
}) {
  const clienteQuery = useQueryClient();
  const { obraId } = useParams();
  const [pergunta, setPergunta] = useState('');
  const [resultado, setResultado] = useState<{ revisao: RespostaRevisao; caso: CasoTeste } | null>(null);
  const [erro, setErro] = useState('');
  const [dividindo, setDividindo] = useState(false);
  const [textoPt, setTextoPt] = useState(frase.texto_pt);

  // Limpa o painel ao trocar de frase.
  useEffect(() => {
    setPergunta('');
    setResultado(null);
    setErro('');
    setDividindo(false);
    setCandidatos(null);
  }, [frase.id]);

  // Edição direta da tradução pelo painel — é assim que se edita nos modos de
  // leitura, onde as frases não têm textarea próprio (item 9 do backlog).
  useEffect(() => setTextoPt(frase.texto_pt), [frase.texto_pt, frase.id]);
  const salvarPt = useMutation({
    mutationFn: (texto_pt: string) => api<Frase>('PATCH', `/frases/${frase.id}`, { texto_pt }),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] }),
    onError: (e) => setErro((e as Error).message),
  });

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
      clienteQuery.invalidateQueries({ queryKey: ['testes-capitulo', capituloId] });
    },
    onError: (e) => setErro((e as Error).message),
  });

  const aplicarCorrecao = useMutation({
    mutationFn: () => api('POST', `/testes/${resultado!.caso.id}/aplicar-correcao`),
    onSuccess: () => {
      if (resultado?.revisao.correcao_proposta) {
        aoEditarTexto(frase.texto_pt, resultado.revisao.correcao_proposta, frase.id);
      }
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
      clienteQuery.invalidateQueries({ queryKey: ['testes-frase', frase.id] });
      clienteQuery.invalidateQueries({ queryKey: ['testes-capitulo', capituloId] });
      setResultado((r) => (r ? { ...r, caso: { ...r.caso, status: 'corrigido' } } : r));
    },
    onError: (e) => setErro((e as Error).message),
  });

  const reverter = useMutation({
    mutationFn: () => api('POST', `/frases/${frase.id}/reverter-ia`),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] }),
  });

  // Curadoria sob demanda: varre a frase atrás de termos que o pipeline deixou
  // passar (o termos_novos da tradução é oportunista e ignora muita coisa). A IA
  // alinha ZH↔PT, então você escolhe pelo português e adiciona num clique.
  const [candidatos, setCandidatos] = useState<TermoExtraido[] | null>(null);
  const sugerirTermos = useMutation({
    mutationFn: () => api<{ termos: TermoExtraido[] }>('POST', `/frases/${frase.id}/sugerir-termos`, {}),
    onSuccess: (r) => {
      setCandidatos(r.termos);
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });
  const adicionarAoGlossario = useMutation({
    mutationFn: (t: TermoExtraido) =>
      api('POST', `/obras/${obraId}/glossario`, {
        termo_zh: t.termo_zh,
        termo_pt: t.termo_pt,
        categoria: t.categoria || 'outro',
        nota: t.contexto || undefined,
      }),
    onSuccess: (_r, t) => {
      setCandidatos((cs) => cs?.filter((c) => c.termo_zh !== t.termo_zh) ?? null);
      clienteQuery.invalidateQueries({ queryKey: ['glossario', obraId] });
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });

  // ── Arrasto da gaveta ──────────────────────────────────────────────────
  // Puxa pelo cabeçalho; a posição fica em localStorage para a próxima sessão.
  const [posicao, setPosicao] = useState<{ x: number; y: number } | null>(() => {
    try {
      const salvo = localStorage.getItem('dao-tale-gaveta-pos');
      return salvo ? (JSON.parse(salvo) as { x: number; y: number }) : null;
    } catch {
      return null;
    }
  });
  const arrasto = useRef<{ dx: number; dy: number } | null>(null);
  const ultimaPosicao = useRef(posicao);

  function aoIniciarArrasto(e: React.PointerEvent<HTMLDivElement>) {
    // O ✕ (e qualquer botão no cabeçalho) não inicia arrasto — a captura de
    // ponteiro engoliria o clique e o botão nunca dispararia.
    if ((e.target as Element).closest('button')) return;
    const alvo = e.currentTarget.closest('aside');
    if (!alvo) return;
    const r = alvo.getBoundingClientRect();
    arrasto.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function aoMoverArrasto(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrasto.current) return;
    const x = Math.min(Math.max(4, e.clientX - arrasto.current.dx), window.innerWidth - 80);
    const y = Math.min(Math.max(4, e.clientY - arrasto.current.dy), window.innerHeight - 60);
    ultimaPosicao.current = { x, y };
    setPosicao(ultimaPosicao.current);
  }
  function aoSoltarArrasto() {
    if (!arrasto.current) return;
    arrasto.current = null;
    if (ultimaPosicao.current) {
      localStorage.setItem('dao-tale-gaveta-pos', JSON.stringify(ultimaPosicao.current));
    }
  }

  return (
    // Gaveta flutuante: sobre o papel, nunca reflui o texto. Arrastável pelo cabeçalho.
    <aside
      className="fixed z-20 w-96 max-w-[calc(100vw-1.5rem)]"
      style={
        posicao
          ? { left: posicao.x, top: posicao.y, maxHeight: `calc(100vh - ${posicao.y + 12}px)` }
          : { top: '4rem', right: '0.75rem', maxHeight: 'calc(100vh - 5rem)' }
      }
    >
      <div className="cartao max-h-[inherit] space-y-3 overflow-y-auto p-4 shadow-xl shadow-tinta/10">
        <div
          className="-m-4 mb-0 flex cursor-grab touch-none items-start justify-between rounded-t-[9px] border-b border-linha bg-papel-fundo/60 px-4 py-2.5 active:cursor-grabbing"
          onPointerDown={aoIniciarArrasto}
          onPointerMove={aoMoverArrasto}
          onPointerUp={aoSoltarArrasto}
          title="Arraste para mover a gaveta"
        >
          <h3 className="font-display font-semibold">Protocolo de Revisão</h3>
          <button onClick={aoFechar} aria-label="Fechar revisão" className="text-tinta-2 hover:text-tinta">
            ✕
          </button>
        </div>

        <p className="texto-zh rounded bg-papel-fundo/60 px-2 py-1.5 text-sm">{frase.texto_zh}</p>
        <textarea
          value={textoPt}
          onChange={(e) => setTextoPt(e.target.value)}
          onBlur={() => {
            if (textoPt !== frase.texto_pt) {
              salvarPt.mutate(textoPt, {
                onSuccess: () => aoEditarTexto(frase.texto_pt, textoPt, frase.id),
              });
            }
          }}
          rows={Math.max(2, Math.ceil(textoPt.length / 44))}
          placeholder="(sem tradução — escreva aqui)"
          title="A tradução desta frase; alterações são salvas ao sair do campo"
          className="w-full resize-none rounded border border-transparent bg-papel-fundo/60 px-2 py-1.5 text-sm leading-relaxed hover:border-linha focus:border-jade focus:outline-none"
        />
        {frase.editado_manualmente && frase.texto_pt_original_ia && (
          <button onClick={() => reverter.mutate()} className="text-xs text-tinta-2 underline hover:text-tinta">
            Reverter para a tradução original da IA
          </button>
        )}

        <div className="space-y-1.5 border-t border-linha/60 pt-3">
          <button
            onClick={() => sugerirTermos.mutate()}
            disabled={sugerirTermos.isPending}
            className="text-xs text-jade-forte underline hover:text-jade disabled:opacity-50"
          >
            {sugerirTermos.isPending ? 'Procurando termos…' : 'Sugerir termos desta frase para o glossário (IA)'}
          </button>
          {candidatos?.length === 0 && (
            <p className="text-xs text-tinta-2">Nenhum termo novo digno de glossário nesta frase.</p>
          )}
          {candidatos && candidatos.length > 0 && (
            <div className="space-y-1.5">
              {candidatos.map((t) => (
                <div key={t.termo_zh} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate" title={t.contexto ?? undefined}>
                    <span className="font-medium">{t.termo_pt}</span>
                    <span className="texto-zh ml-1.5 text-xs text-tinta-2">{t.termo_zh}</span>
                  </span>
                  <button
                    onClick={() => adicionarAoGlossario.mutate(t)}
                    disabled={adicionarAoGlossario.isPending}
                    title={t.contexto ? `Nota: ${t.contexto}` : 'Adicionar ao glossário'}
                    className="shrink-0 rounded border border-linha px-2 py-0.5 text-xs text-jade-forte hover:border-jade disabled:opacity-50"
                  >
                    + glossário
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <textarea
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          rows={3}
          placeholder="Pergunte sobre a escolha de tradução desta frase…"
          className="entrada w-full text-sm"
        />
        <Botao onClick={() => revisar.mutate()} disabled={!pergunta.trim() || revisar.isPending} className="w-full">
          {revisar.isPending ? 'Consultando a IA…' : 'Perguntar'}
        </Botao>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {resultado && (
          <div className="space-y-2 border-t border-linha/60 pt-3 text-sm">
            <div>
              <Etiqueta cor={resultado.revisao.veredito === 'correto' ? 'jade' : 'selo'}>
                {resultado.revisao.veredito === 'correto' ? 'Correto' : 'Incorreto'}
              </Etiqueta>
              <span className="ml-2 text-xs text-tinta-2">regra: {resultado.revisao.secao_regra}</span>
            </div>
            <p className="texto-zh rounded bg-papel-fundo/60 px-2 py-1 text-xs">{resultado.revisao.trecho_zh}</p>
            <p>{resultado.revisao.justificativa}</p>
            {resultado.revisao.correcao_proposta && (
              <div className="rounded border border-ocre/50 bg-ocre-tint p-2">
                <p className="mb-2">{resultado.revisao.correcao_proposta}</p>
                {resultado.caso.status !== 'corrigido' ? (
                  <Botao onClick={() => aplicarCorrecao.mutate()} disabled={aplicarCorrecao.isPending}>
                    Aplicar correção
                  </Botao>
                ) : (
                  <Etiqueta cor="indigo">Correção aplicada</Etiqueta>
                )}
              </div>
            )}
            <p className="text-xs text-tinta-2">Caso #{resultado.caso.id} salvo no banco de testes.</p>
          </div>
        )}

        {/* Consultas anteriores desta frase */}
        {historico && historico.length > 0 && (
          <details className="border-t border-linha/60 pt-3" open={historico.length <= 2 && !resultado}>
            <summary className="cursor-pointer text-xs font-medium text-tinta-2 hover:text-tinta">
              Revisões anteriores desta frase ({historico.length})
            </summary>
            <div className="mt-2 space-y-2">
              {historico.map((caso) => (
                <div key={caso.id} className="rounded border border-linha/60 bg-papel-fundo/60 p-2 text-xs">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Etiqueta cor={caso.veredito === 'correto' ? 'jade' : 'selo'}>
                      {caso.veredito === 'correto' ? 'Correto' : 'Incorreto'}
                    </Etiqueta>
                    {STATUS_CASO_ROTULO[caso.status] && (
                      <Etiqueta cor={STATUS_CASO_ROTULO[caso.status].cor}>
                        {STATUS_CASO_ROTULO[caso.status].texto}
                      </Etiqueta>
                    )}
                    <span className="text-tinta-2">
                      {new Date(caso.criado_em).toLocaleDateString('pt-BR')} · caso #{caso.id}
                    </span>
                  </div>
                  <p className="font-medium text-tinta">{caso.pergunta}</p>
                  <p className="mt-0.5 text-tinta-2">{caso.justificativa}</p>
                  {caso.correcao_proposta && (
                    <p className="mt-0.5 text-tinta-2">
                      <span className="font-medium">Proposta:</span> {caso.correcao_proposta}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Correção de segmentação */}
        <div className="border-t border-linha/60 pt-3">
          <p className="mb-2 text-xs font-medium text-tinta-2">Segmentação errada?</p>
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
                  <Botao variante="secundario" onClick={() => aoIrParaFrase(v.frase_id)}>
                    Ir à frase
                  </Botao>
                </div>
              ))}
            </div>
            <p className="text-xs text-tinta-2">
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
      <div className="w-[36rem] max-w-full space-y-3 cartao p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">Dividir frase</h3>
        <p className="text-sm text-tinta-2">Clique no caractere onde a segunda frase deve começar:</p>
        <p className="texto-zh rounded bg-papel-fundo/60 p-2 text-lg leading-loose">
          {caracteres.map((ch, i) => (
            <span
              key={i}
              onClick={() => i > 0 && setCorte(i)}
              className={`cursor-pointer ${i === corte ? 'border-l-2 border-selo' : ''} ${
                i >= corte ? 'bg-ocre-tint' : ''
              }`}
            >
              {ch}
            </span>
          ))}
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="texto-zh mb-1 rounded bg-papel-fundo/60 px-2 py-1 text-xs">{caracteres.slice(0, corte).join('')}</p>
            <textarea
              value={pt1}
              onChange={(e) => setPt1(e.target.value)}
              rows={3}
              placeholder="Tradução da 1ª parte"
              className="entrada w-full"
            />
          </div>
          <div>
            <p className="texto-zh mb-1 rounded bg-ocre-tint px-2 py-1 text-xs">{caracteres.slice(corte).join('')}</p>
            <textarea
              value={pt2}
              onChange={(e) => setPt2(e.target.value)}
              rows={3}
              placeholder="Tradução da 2ª parte (vazio = pendente)"
              className="entrada w-full"
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
