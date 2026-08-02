// Tipos de domínio e contratos da API — fonte única de verdade entre server e web.

import type { PreferenciasEstilo } from './preferenciasEstilo.js';
import { TEMPERATURAS_PADRAO, type TemperaturasPapel } from './temperatura.js';

// Tokens de pigmento/tipografia como dado, para o alvo EPUB (doc 12 §6).
export * from './pigmentos.js';
// Formatação inline da tradução (*itálico*, **negrito**), usada pelo editor, pelo
// modo leitura e pelo XHTML do EPUB.
export * from './inline.js';
// Regras do livro: remontagem de parágrafos, cabeçalho e escopo de exportação.
export * from './livro.js';
// Preferências de estilo por obra (doc 08 §12): a camada de chaves entre o núcleo
// universal e o delta em texto livre.
export * from './preferenciasEstilo.js';
// Temperatura por papel (doc 08 §13): amostragem, não texto — por isso fica na
// configuração e na obra, e não na versão do prompt.
export * from './temperatura.js';

// ── Domínio ────────────────────────────────────────────────────────────────

export const PROVEDORES_IDS = ['claude', 'gemini', 'deepseek', 'openrouter', 'groq', 'mistral', 'mock'] as const;
export type ProvedorId = (typeof PROVEDORES_IDS)[number];

// 'parcial': job terminou com frases em erro ou foi interrompido no meio —
// nunca fica preso em 'traduzindo' sem job rodando (M6 da auditoria).
export const STATUS_CAPITULO = ['rascunho', 'traduzindo', 'parcial', 'traduzido', 'revisado', 'finalizado'] as const;
export type StatusCapitulo = (typeof STATUS_CAPITULO)[number];
export type StatusTraducaoFrase = 'pendente' | 'traduzida' | 'erro';
// Fase do pipeline por obra (doc 09): calibração (sequencial, glossário em
// formação) → cruzeiro (lote), promovida/regredida pelo usuário.
export const FASES_TRADUCAO = ['calibracao', 'cruzeiro'] as const;
export type FaseTraducao = (typeof FASES_TRADUCAO)[number];
// Categoria é texto livre: o usuário pode criar as suas; as padrão ficam em
// CATEGORIAS_GLOSSARIO como sugestão. "Apagar" uma categoria = nenhum termo usá-la.
export type CategoriaGlossario = string;
export type Veredito = 'correto' | 'incorreto';
export type StatusCasoTeste = 'confirmado' | 'corrigido' | 'pendente' | 'regra-nova-necessaria';
export type StatusTermoSugerido = 'pendente' | 'aceito' | 'rejeitado';

export interface Obra {
  id: number;
  titulo: string;
  titulo_original: string | null;
  /** Autor do original (dc:creator no EPUB, doc 12 §4). */
  autor: string | null;
  sinopse: string | null;
  tags: string[];
  /** true quando a obra tem imagem de capa (o binário é servido em GET /obras/:id/capa). */
  tem_capa: boolean;
  provedor_padrao: ProvedorId | null;
  modelo_padrao: string | null;
  /** Override de temperatura desta obra (doc 08 §13); null = padrão do papel,
   * vindo das Configurações. Vale para todos os papéis da obra. */
  temperatura: number | null;
  fase_traducao: FaseTraducao;
  criado_em: string;
  atualizado_em: string;
}

/** Requisições feitas hoje a um provedor/modelo (indicador de cota gratuita). */
export interface UsoIaDia {
  provedor: ProvedorId;
  modelo: string;
  requisicoes: number;
}

export interface ObraComContadores extends Obra {
  capitulos_total: number;
  glossario_total: number;
  testes_pendentes: number;
  termos_sugeridos_pendentes: number;
}

/** 'completo': prompt inteiro legado. 'delta': só as diretrizes específicas da
 * obra (Seção 6) — o prompt enviado à IA é composto com o núcleo ativo. */
export type TipoPrompt = 'completo' | 'delta';

export interface PromptMae {
  id: number;
  obra_id: number;
  versao: string;
  conteudo: string;
  notas_versao: string | null;
  ativo: boolean;
  tipo: TipoPrompt;
  /** Versão do núcleo sobre a qual o delta foi escrito (informativo). */
  nucleo_id: number | null;
  /** Preferências de estilo desta versão (doc 08 §12). Virar uma chave cria uma
   * versão nova, então o capítulo já traduzido guarda as que o traduziram. */
  preferencias: PreferenciasEstilo;
  criado_em: string;
}

/** Versão do núcleo universal (prompt padrão global): regras zh→pt-BR comuns a
 * todas as obras; o delta de cada obra é inserido no marcador {{DELTA_OBRA}}. */
export type PromptPadrao = Omit<PromptMae, 'obra_id' | 'tipo' | 'nucleo_id' | 'preferencias'>;

/** Prompt mãe efetivo de uma obra (núcleo + delta compostos), com proveniência. */
export interface PromptComposto {
  texto: string;
  prompt: PromptMae;
  nucleo: PromptPadrao | null;
}

export interface Capitulo {
  id: number;
  obra_id: number;
  numero: number;
  titulo: string | null;
  /** Título traduzido pela IA (junto com o primeiro bloco do capítulo). */
  titulo_pt: string | null;
  status: StatusCapitulo;
  texto_origem: string;
  provedor: ProvedorId | null;
  modelo: string | null;
  prompt_id: number | null;
  /** Versão do núcleo usada no último job de tradução (par com prompt_id). */
  nucleo_id: number | null;
  /** Violações de consistência do glossário na última varredura local (doc 09
   * §3); null = ainda não varrido. */
  consistencia_violacoes: number | null;
  /** Data da última passada de QA (doc 09 §6); null = QA nunca rodou. */
  qa_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface CapituloResumo extends Omit<Capitulo, 'texto_origem'> {
  frases_total: number;
  frases_traduzidas: number;
  frases_erro: number;
  /** Apontamentos de QA pendentes de triagem (doc 09 §6). */
  qa_pendentes: number;
}

export interface Frase {
  id: number;
  capitulo_id: number;
  ordem: number;
  paragrafo: number;
  texto_zh: string;
  texto_pt: string;
  texto_pt_original_ia: string | null;
  editado_manualmente: boolean;
  status_traducao: StatusTraducaoFrase;
}

export interface EntradaGlossario {
  id: number;
  obra_id: number;
  termo_zh: string;
  termo_pt: string;
  categoria: CategoriaGlossario;
  nota: string | null;
  origem: 'manual' | 'sugerido-ia';
  /** Entrada canônica da qual esta é uma variante (ex.: 芊芊 → 林芊); null se é
   * canônica. Cada variante guarda a própria tradução; o vínculo só diz que
   * apontam para o mesmo referente. */
  principal_id: number | null;
  criado_em: string;
}

export interface TermoSugerido {
  id: number;
  obra_id: number;
  capitulo_id: number;
  termo_zh: string;
  termo_pt: string;
  categoria: string | null;
  contexto: string | null;
  status: StatusTermoSugerido;
  criado_em: string;
}

export interface CasoTeste {
  id: number;
  frase_id: number;
  obra_id: number;
  trecho_zh: string;
  pergunta: string;
  veredito: Veredito;
  justificativa: string;
  secao_regra: string | null;
  correcao_proposta: string | null;
  status: StatusCasoTeste;
  provedor: string;
  modelo: string;
  criado_em: string;
}

// ── Lote de tradução (fase de cruzeiro, doc 09 §5) ─────────────────────────

export type StatusLote = 'executando' | 'concluido' | 'cancelado' | 'interrompido';
export type StatusLoteCapitulo = 'na_fila' | 'traduzindo' | 'qa' | 'concluido' | 'erro' | 'cancelado';

/** Par provedor/modelo — unidade da cadeia de failover (modelo nunca é
 * misturado entre provedores). Modelo vazio = padrão do provedor. */
export interface ParProvedor {
  provedor: ProvedorId;
  modelo: string;
}

export interface LoteCapitulo {
  capitulo_id: number;
  numero: number;
  titulo: string | null;
  posicao: number;
  status: StatusLoteCapitulo;
  provedores_tentados: ParProvedor[];
  erro: string | null;
  frases_total: number;
  frases_traduzidas: number;
  frases_erro: number;
}

export interface Lote {
  id: number;
  obra_id: number;
  status: StatusLote;
  qa_automatica: boolean;
  criado_em: string;
  encerrado_em: string | null;
  capitulos: LoteCapitulo[];
}

// ── QA por segunda IA (doc 09 §6) ──────────────────────────────────────────

export type TipoApontamentoQa = 'glossario' | 'pronome-genero' | 'repeticao' | 'omissao' | 'outro';
export type SeveridadeQa = 'alta' | 'media' | 'baixa';
export type StatusApontamentoQa = 'pendente' | 'aceito' | 'descartado';

export interface ApontamentoQa {
  id: number;
  capitulo_id: number;
  frase_id: number | null;
  tipo: TipoApontamentoQa;
  severidade: SeveridadeQa;
  trecho_zh: string | null;
  observacao: string;
  sugestao: string | null;
  status: StatusApontamentoQa;
  provedor: string;
  modelo: string;
  criado_em: string;
}

// ── Telemetria de custo e qualidade (doc 11) ───────────────────────────────

/** Papel da chamada de IA — o "para quê" de cada token gasto. */
export const PAPEIS_IA = [
  'traducao',
  'revisao',
  'qa',
  'extracao',
  'refinamento',
  'titulo',
  'comparador',
] as const;
export type PapelIa = (typeof PAPEIS_IA)[number];

/** Preço de um modelo em USD por 1 milhão de tokens. Sem `cache_*`, valem os
 * padrões da indústria: leitura 0,1× e escrita 1,25× o preço de entrada. */
export interface PrecoModelo {
  entrada: number;
  saida: number;
  cache_leitura?: number;
  cache_criacao?: number;
}

/** Chave `"<provedor>:<modelo>"`, com curinga `"<provedor>:*"` como fallback.
 * Ausência = preço desconhecido (nunca "grátis"). */
export type PrecosModelos = Record<string, PrecoModelo>;

/** Soma de consumo e custo — usada em todos os níveis do painel. */
export interface SomaUso {
  chamadas: number;
  tokens_entrada: number;
  tokens_saida: number;
  tokens_cache_leitura: number;
  tokens_cache_criacao: number;
  /** USD das chamadas COM preço cadastrado. */
  custo_usd: number;
  /** Chamadas sem preço cadastrado: custo desconhecido, nunca exibido como 0. */
  chamadas_sem_preco: number;
}

export interface TelemetriaPapel extends SomaUso {
  papel: PapelIa;
}

export interface TelemetriaModelo extends SomaUso {
  provedor: string;
  modelo: string;
}

export interface TelemetriaCapitulo extends SomaUso {
  capitulo_id: number;
  numero: number;
  titulo_pt: string | null;
  status: StatusCapitulo;
  /** Passou por um lote — define os grupos da pergunta "o lote compensou?". */
  em_lote: boolean;
  // Qualidade: vem de onde já é computada (checkpoint.ts, consistencia.ts, qa.ts).
  frases_total: number;
  frases_editadas: number;
  termos_sugeridos: number;
  consistencia_violacoes: number | null;
  qa_pendentes: number;
  /** Torna capítulos de tamanhos diferentes comparáveis. */
  custo_por_mil_frases: number | null;
}

/** (a) O prompt caching está acertando? */
export interface VereditoCache {
  estado: EstadoMetrica;
  /** % da entrada total servida do cache. */
  acerto_pct: number | null;
  /** Quanto o cache poupou em dinheiro (vs. pagar tudo a preço de entrada). */
  economia_usd: number | null;
  /** Pares que pagam escrita de cache e nunca leem — patologia A4 da auditoria.
   * Agrupado por papel, e não só por modelo: no A4 era a revisão que perdia a
   * escrita enquanto a tradução no mesmo modelo lia normalmente. */
  escrita_perdida: { provedor: string; modelo: string; papel: string; tokens: number }[];
  detalhe: string;
}

/** (b) O lote compensou em dinheiro? */
export interface VereditoLote {
  estado: EstadoMetrica;
  lote: { capitulos: number; custo_por_mil_frases: number | null };
  sequencial: { capitulos: number; custo_por_mil_frases: number | null };
  /** Negativa = lote mais barato por frase. */
  diferenca_pct: number | null;
  detalhe: string;
}

export interface TelemetriaObra {
  obra_id: number;
  total: SomaUso;
  por_papel: TelemetriaPapel[];
  por_modelo: TelemetriaModelo[];
  capitulos: TelemetriaCapitulo[];
  cache: VereditoCache;
  lote: VereditoLote;
  /** Pares sem preço cadastrado (alimenta o aviso do painel). */
  sem_preco: { provedor: string; modelo: string; chamadas: number }[];
  taxa_usd_brl: number;
}

/** (c) Consumo do dia por provedor — dinheiro e cota lado a lado. */
export interface TelemetriaDiaProvedor extends SomaUso {
  provedor: string;
  /** Tentativas contadas em `uso_ia` (inclui retries e falhas). A diferença
   * contra `chamadas` é o desperdício: 429, truncamento, retries. */
  tentativas: number;
  /** 0 = sem limite configurado. */
  cota_diaria: number;
  pct_cota: number | null;
}

export interface TelemetriaDia {
  data: string;
  provedores: TelemetriaDiaProvedor[];
  total: SomaUso;
  tentativas: number;
  taxa_usd_brl: number;
}

// ── Configurações ──────────────────────────────────────────────────────────

export interface Configuracoes {
  provedor_padrao: ProvedorId;
  modelo_padrao: string;
  tamanho_bloco: number;
  vizinhas_revisao: number;
  cauda_contexto: number;
  /** Se true, a tradução para (em vez de insistir) ao receber 429 do provedor —
   * útil para quem quer ficar só na cota gratuita. */
  parar_no_limite: boolean;
  /** Se true, cada chamada à IA leva só os termos do glossário que aparecem no
   * trecho enviado (economia grande de tokens em glossários longos). */
  glossario_relevante: boolean;
  /** Modelo por papel: a revisão (baixo volume, alto valor) pode usar um
   * provedor/modelo de raciocínio diferente do da tradução. Vazio = usar a
   * cadeia normal (capítulo → obra → padrão global). */
  provedor_revisao: ProvedorId | '';
  modelo_revisao: string;
  /** Modelo por papel: a contracapa (título + sinopse) roda UMA vez por obra e é
   * a tarefa mais interpretativa do app — o melhor modelo disponível aqui custa
   * frações de centavo. Vazio = cadeia normal (obra → padrão global). */
  provedor_detalhes: ProvedorId | '';
  modelo_detalhes: string;
  /** Temperatura por papel (doc 08 §13). É o padrão de todas as obras; cada obra
   * pode sobrepor com `Obra.temperatura`. Baixa = consistente entre execuções. */
  temperaturas: TemperaturasPapel;
  /** Limite diário de requisições por provedor para o indicador de cota
   * (ausente ou 0 = não mostrar). */
  cotas_diarias: Record<string, number>;
  // ── Checkpoint de estabilidade (doc 09 §4) — liberação do lote por taxas
  // medidas, não por número fixo de capítulos. Limiares ajustáveis por obra. ──
  /** Tamanho da janela móvel (capítulos recentes) sobre a qual as taxas são medidas. */
  checkpoint_janela: number;
  /** Teto de termos sugeridos novos por 100 frases (métrica bloqueante). */
  checkpoint_termos_max: number;
  /** Teto de % de frases editadas manualmente (métrica bloqueante). */
  checkpoint_edicao_max: number;
  /** Teto de violações de consistência por 100 frases (0 = só informativa). */
  checkpoint_violacoes_max: number;
  // ── Lote / cruzeiro (doc 09 §5/§11) ──
  /** Capítulos traduzidos em paralelo no lote (blocos dentro do capítulo seguem sequenciais). */
  lote_paralelo: number;
  /** Cadeia de failover: pares tentados em ordem quando o par corrente falha
   * (ordenada por custo — faixas gratuitas primeiro). Vazia = sem failover. */
  failover: ParProvedor[];
  // ── QA por segunda IA (doc 09 §6) ──
  /** Par do QA; vazio = cai no par da revisão (doc 08 §5). O QA exige par
   * diferente do tradutor do capítulo. */
  provedor_qa: ProvedorId | '';
  modelo_qa: string;
  /** QA automática ao fim de cada capítulo do lote. Padrão desligado: como a
   * revisão humana é integral, o QA é compra separada (feedback do usuário). */
  qa_automatica: boolean;
  // ── Telemetria de custo (doc 11 §3) ──
  /** Preços por modelo (USD/1M tokens) — sem isto não existe "custo em dinheiro". */
  precos_modelos: PrecosModelos;
  /** Cotação para exibir custo em reais no painel (0 = mostrar só em USD). */
  taxa_usd_brl: number;
}

export const CONFIG_PADRAO: Configuracoes = {
  provedor_padrao: 'mock',
  modelo_padrao: '',
  // Bloco grande cobre capítulos típicos em 1–3 chamadas — junto com os termos
  // adotados realimentados entre blocos, mantém a terminologia consistente sem
  // arriscar estourar o limite de tokens de saída num capítulo muito longo.
  tamanho_bloco: 60,
  vizinhas_revisao: 3,
  cauda_contexto: 5,
  parar_no_limite: false,
  glossario_relevante: true,
  provedor_revisao: '',
  modelo_revisao: '',
  provedor_detalhes: '',
  modelo_detalhes: '',
  temperaturas: { ...TEMPERATURAS_PADRAO },
  // Valores da cota gratuita de cada provedor (jul/2026) — ajustáveis em Configurações.
  // Gemini: 250 req/dia no Flash; OpenRouter: 50 req/dia em modelos :free (1000 com
  // US$ 10 de crédito); Groq: 1000 req/dia por modelo na faixa gratuita.
  cotas_diarias: { gemini: 250, openrouter: 50, groq: 1000 },
  checkpoint_janela: 3,
  checkpoint_termos_max: 2,
  checkpoint_edicao_max: 10,
  checkpoint_violacoes_max: 0,
  lote_paralelo: 2,
  failover: [],
  provedor_qa: '',
  modelo_qa: '',
  qa_automatica: false,
  // Só a família Claude vem de fábrica — são os preços que dá para afirmar sem
  // inventar (USD/1M, jul/2026). Todo outro provedor começa SEM preço: o painel
  // conta "N chamadas sem preço" em vez de exibir US$ 0,00 como se fosse grátis.
  // Faixa gratuita se cadastra explicitamente com zeros. O Sonnet 5 tem preço
  // promocional de 2/10 até 31/08/2026 — aqui fica o cheio (melhor superestimar
  // custo que subestimar); ajuste em Configurações se quiser o promocional.
  precos_modelos: {
    'claude:claude-fable-5': { entrada: 10, saida: 50 },
    'claude:claude-opus-5': { entrada: 5, saida: 25 },
    'claude:claude-opus-4-8': { entrada: 5, saida: 25 },
    'claude:claude-sonnet-5': { entrada: 3, saida: 15 },
    'claude:claude-haiku-4-5': { entrada: 1, saida: 5 },
  },
  taxa_usd_brl: 0,
};

// ── Checkpoint de estabilidade (doc 09 §4) ─────────────────────────────────

export type EstadoMetrica = 'ok' | 'acima' | 'amostra-insuficiente';

export interface MetricaCheckpoint {
  chave: 'termos' | 'edicao' | 'violacoes';
  rotulo: string;
  /** Valor medido (por 100 frases, ou % conforme a métrica); null se sem amostra. */
  valor: number | null;
  limiar: number;
  estado: EstadoMetrica;
  /** Bloqueia a liberação do lote (violações são informativas por padrão). */
  bloqueia: boolean;
  detalhe: string;
}

export interface CheckpointObra {
  obra_id: number;
  fase: FaseTraducao;
  /** Capítulos que entraram na janela (por número), e quantos faltam se incompleta. */
  janela_capitulos: number[];
  janela_alvo: number;
  metricas: MetricaCheckpoint[];
  /** Todas as métricas bloqueantes ok e amostra suficiente. */
  aprovado: boolean;
}

export interface EstadoConfiguracoes {
  configuracoes: Configuracoes;
  credenciais: { provedor: ProvedorId; configurada: boolean }[];
  modo_guarda_chaves: 'keyring' | 'arquivo';
  caminho_dados: string;
}

// GET /api/saude — estado da instância (doc 10 §2): porta, pasta de dados, se é a
// instância canônica (real, porta padrão) e um resumo dos backups.
export interface EstadoSaude {
  ok: boolean;
  versao: string;
  porta: number;
  caminho_dados: string;
  canonico: boolean;
  backups: { total: number; ultimo: string | null };
}

// GET /api/sessao — única rota pública em modo hospedado (doc 13 §3). Diz só o
// necessário para a interface escolher entre login e app.
export interface EstadoSessao {
  modo: 'local' | 'hospedado';
  autenticado: boolean;
  senha_definida: boolean;
}

export interface InfoBackup {
  nome: string;
  caminho: string;
  tamanho: number;
  em: string;
}

// ── Protocolo de Revisão ───────────────────────────────────────────────────

export interface RespostaRevisao {
  trecho_zh: string;
  veredito: Veredito;
  justificativa: string;
  secao_regra: string;
  correcao_proposta: string | null;
}

// ── Tradução (progresso via SSE) ───────────────────────────────────────────

export interface ProgressoTraducao {
  capitulo_id: number;
  em_execucao: boolean;
  frases_total: number;
  frases_prontas: number;
  frases_erro: number;
  erro_fatal: string | null;
  /** Bloco enviado ao provedor e ainda sem resposta (ordens, inclusivas) —
   * permite à interface mostrar atividade entre um bloco e outro. */
  em_voo?: { de: number; ate: number } | null;
}

export type EventoTraducao =
  | { tipo: 'progresso'; dados: ProgressoTraducao }
  | { tipo: 'termos_sugeridos'; dados: { quantidade: number } }
  | { tipo: 'job_concluido'; dados: ProgressoTraducao }
  // tipo distingue pausa de cota ('limite') de erro real ('fatal') na UI e no lote.
  | { tipo: 'job_erro'; dados: { mensagem: string; tipo?: 'fatal' | 'limite' } };

/** Eventos SSE agregados do lote (doc 09 §5). */
export type EventoLote =
  | { tipo: 'lote'; dados: Lote }
  | { tipo: 'lote_encerrado'; dados: Lote };

// ── Payloads de criação/edição ─────────────────────────────────────────────

export interface CriarObraPayload {
  titulo: string;
  titulo_original?: string;
  sinopse?: string;
  tags?: string[];
  prompt_inicial?: { versao: string; conteudo: string };
  glossario_inicial?: { termo_zh: string; termo_pt: string; categoria?: CategoriaGlossario; nota?: string }[];
}

export interface CriarCapituloPayload {
  numero: number;
  titulo?: string;
  texto_origem: string;
}

export interface TraduzirPayload {
  provedor?: ProvedorId;
  modelo?: string;
  sobrescrever?: boolean;
  sobrescrever_editadas?: boolean;
}

export interface RevisarPayload {
  pergunta: string;
  provedor?: ProvedorId;
  modelo?: string;
}

export interface ModeloInfo {
  id: string;
  nome: string;
}

export const CATEGORIAS_GLOSSARIO: CategoriaGlossario[] = [
  'local',
  'poder-habilidade',
  'entidade',
  'titulo-cargo',
  'personagem',
  'outro',
];
