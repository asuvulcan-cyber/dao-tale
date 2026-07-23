// Tipos de domínio e contratos da API — fonte única de verdade entre server e web.

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
  sinopse: string | null;
  tags: string[];
  /** true quando a obra tem imagem de capa (o binário é servido em GET /obras/:id/capa). */
  tem_capa: boolean;
  provedor_padrao: ProvedorId | null;
  modelo_padrao: string | null;
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
  criado_em: string;
}

/** Versão do núcleo universal (prompt padrão global): regras zh→pt-BR comuns a
 * todas as obras; o delta de cada obra é inserido no marcador {{DELTA_OBRA}}. */
export type PromptPadrao = Omit<PromptMae, 'obra_id' | 'tipo' | 'nucleo_id'>;

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
