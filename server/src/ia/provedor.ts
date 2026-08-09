import type { EntradaGlossario, ModeloInfo, ModoThinking, ProvedorId, RespostaRevisao } from '@dao-tale/shared';

// ── Consumo real de uma chamada (telemetria, doc 11 §1) ────────────────────
// Toda resposta de provedor carrega o `usage` que a API devolveu, normalizado:
// `tokens_entrada` é sempre a entrada paga a PREÇO CHEIO (sem o que veio do
// cache), independente de o provedor somar ou não o cache no prompt. `null`
// significa "a API não expõe este campo" — diferente de 0, que é medição.

export interface UsoChamada {
  tokens_entrada: number | null;
  tokens_saida: number | null;
  /** Entrada servida do cache (~0,1× do preço de entrada). */
  tokens_cache_leitura: number | null;
  /** Entrada gravada no cache (~1,25× do preço de entrada). */
  tokens_cache_criacao: number | null;
  /** Modelo que DE FATO atendeu, quando o provedor informa. Pedir
   *  `gemini-flash-latest` é pedir um apelido: o painel do Google contabiliza no
   *  modelo concreto, e sem guardar isto não há como cruzar o nosso consumo com
   *  o limite de cota dele — nem saber qual linha da tabela foi gasta. */
  modelo_resolvido?: string | null;
}

// ── Requisições montadas pela orquestração (independentes de provedor) ─────
// Toda requisição carrega `temperatura` (doc 08 §13): a amostragem já resolvida
// (padrão do papel + override da obra). `undefined` = não mandar o parâmetro e
// ficar no padrão do modelo — que é 1.0 e foi o comportamento do app até aqui.

export interface FraseParaTraduzir {
  ordem: number;
  texto_zh: string;
}

export interface RequisicaoTraducaoBloco {
  modelo: string;
  temperatura?: number;
  /** Raciocínio prolongado; `undefined` = não mandar nada (padrão do provedor). */
  thinking?: ModoThinking;
  omega: string;
  glossario: EntradaGlossario[];
  /** true quando o glossário foi filtrado por bloco (só termos presentes no trecho):
   * ele entra na mensagem do usuário e o sistema fica estável para o prompt caching. */
  glossarioNoUsuario?: boolean;
  /** Título do capítulo ainda sem tradução: entra no bloco como frase de número -1. */
  titulo?: string;
  /** Termos que a IA adotou em blocos anteriores deste mesmo job e que aparecem
   * neste trecho — ainda não confirmados no glossário, mas obrigatórios para a
   * consistência dentro do capítulo. */
  termosAdotados?: { termo_zh: string; termo_pt: string }[];
  /** Últimas frases já traduzidas antes do bloco (continuidade de tom). */
  caudaAnterior: { texto_zh: string; texto_pt: string }[];
  frases: FraseParaTraduzir[];
  /** Frases seguintes ainda em chinês (contexto futuro, não traduzir). */
  proximas: string[];
}

export interface TermoNovoDetectado {
  termo_zh: string;
  termo_pt: string;
  categoria?: string;
  /** Descrição curta em PT do termo (vira a nota do glossário ao aceitar). */
  contexto?: string;
}

export interface RespostaTraducaoBloco {
  traducoes: { ordem: number; texto_pt: string }[];
  termos_novos: TermoNovoDetectado[];
  /** JSON bruto retornado pelo provedor. */
  bruta: string;
  uso: UsoChamada;
}

// ── Contracapa: título e sinopse da ficha da obra ──────────────────────────
// Tarefa própria, não um modo da tradução de capítulo: prompt próprio
// (`promptContracapa.ts`, interpretativo em vez de literal), sinopse INTEIRA em
// um campo só (para os versos serem traduzidos juntos) e saída já no formato da
// ficha. Roda 1× por obra — daí valer um modelo forte (`provedor_detalhes`).

export interface RequisicaoContracapa {
  modelo: string;
  temperatura?: number;
  /** Ausente quando o usuário só quer a sinopse. */
  tituloZh?: string;
  /** Vai inteira, com as quebras de linha originais. */
  sinopseZh?: string;
  /** Nomes e termos já catalogados — a única parte da obra que entra aqui. */
  glossario: EntradaGlossario[];
  /** true quando o glossário foi filtrado pelo texto enviado: ele vai na
   * mensagem do usuário e o bloco de sistema fica estável (cacheável). */
  glossarioNoUsuario?: boolean;
}

export interface RespostaContracapa {
  titulo_pt: string | null;
  sinopse_pt: string | null;
  bruta: string;
  uso: UsoChamada;
}

export interface RequisicaoRevisao {
  modelo: string;
  temperatura?: number;
  omega: string;
  glossario: EntradaGlossario[];
  /** true quando o glossário foi filtrado pela frase questionada: ele entra na
   * mensagem do usuário e o sistema fica estável entre revisões (cacheável). */
  glossarioNoUsuario?: boolean;
  vizinhasAntes: { texto_zh: string; texto_pt: string }[];
  vizinhasDepois: { texto_zh: string; texto_pt: string }[];
  frase: { texto_zh: string; texto_pt: string; texto_pt_original_ia: string | null };
  pergunta: string;
  /** Rótulos de `secao_regra` já usados nesta obra, com a camada dona. Vão na
   *  mensagem do usuário AGRUPADOS por camada e em ordem alfabética: quando iam
   *  ordenados por frequência, o rótulo mais usado era o mais oferecido, o mais
   *  escolhido, e voltava maior ainda. */
  rotulosConhecidos?: { rotulo: string; camada: 'alfa' | 'beta' | 'delta' | null }[];
  /** Turnos anteriores do fio, do mais antigo ao mais recente. Sem eles a réplica
   *  reinicia a dúvida — foi o que produziu vereditos opostos na mesma frase. */
  turnosAnteriores?: {
    pergunta: string;
    resposta: string;
    /** O argumento por trás de secao_regra, quando uma regra decidiu o turno.
     *  Sem ela o modelo vê o RÓTULO da regra mas não a TESE que defendeu com
     *  ela — e "diga se MANTÉM ou REVISA" fica sem o que contestar. */
    justificativa: string;
    veredito: string;
    secao_regra: string | null;
    correcao_proposta: string | null;
    recusado: boolean;
    motivo_rejeicao: string | null;
  }[];
  /** Quantos turnos ficaram de fora pelo teto — vai dito ao modelo. */
  turnosOmitidos?: number;
}

export interface RespostaRevisaoProvedor extends RespostaRevisao {
  bruta: string;
  uso: UsoChamada;
}

// ── Extração exaustiva de termos de uma frase (curadoria manual do glossário) ─
// Distinta do termos_novos oportunista da tradução: aqui a instrução é varrer a
// frase inteira e devolver TODO nome próprio/entidade que mereça glossário —
// para pegar o que o pipeline deixou passar.

export interface RequisicaoExtrairTermos {
  modelo: string;
  temperatura?: number;
  omega: string;
  /** Termos já catalogados que o modelo não deve repetir. Com `glossarioNoUsuario`,
   * chega filtrado pela frase (os ausentes dela não ajudam a deduplicar nada). */
  glossario: EntradaGlossario[];
  /** true quando o glossário filtrado vai na mensagem do usuário — o sistema
   * fica estável por obra e cacheável entre frases da curadoria. */
  glossarioNoUsuario?: boolean;
  frase: { texto_zh: string; texto_pt: string };
}

export interface RespostaExtrairTermos {
  termos: TermoNovoDetectado[];
  bruta: string;
  uso: UsoChamada;
}

// ── Refinamento do prompt da obra (versionamento semiautomático, doc 08 §7) ─
// Recorrências do banco de testes → proposta concreta de regra nova para o
// delta (Seção 6); o usuário revisa e aprova como nova versão.

export interface RequisicaoRefinarPrompt {
  modelo: string;
  temperatura?: number;
  /** Prompt mãe composto (núcleo + delta) vigente na obra. */
  omega: string;
  /** Delta atual (Seção 6) — é o que a proposta deve refinar. */
  deltaAtual: string;
  casos: {
    secao_regra: string;
    trecho_zh: string;
    pergunta: string;
    veredito: string;
    justificativa: string;
    correcao_proposta: string | null;
  }[];
  /** Casos em que o revisor RECUSOU o veredito da IA (doc 15 §9): é o único
      lugar do app onde ele escreve POR ESCRITO por que ela errou — correção de
      rumo, não material a generalizar. */
  recusados?: { trecho_zh: string; pergunta: string; veredito: string; resposta: string; motivo_rejeicao: string | null }[];
}

export interface PropostaRefinamento {
  secao_regra: string;
  /** Texto pronto para entrar no delta (uma regra/linha nova ou ajustada). */
  regra_proposta: string;
  justificativa: string;
}

export interface RespostaRefinarPrompt {
  propostas: PropostaRefinamento[];
  bruta: string;
  uso: UsoChamada;
}

// ── QA por segunda IA (doc 09 §6) ──────────────────────────────────────────
// Um modelo/provedor DIFERENTE do tradutor compara cada par zh↔pt e aponta
// problemas por frase — nunca reescreve. Blocos de pares, glossário filtrado
// no usuário (mesmo desenho de cache das outras tarefas).

export interface ParParaQa {
  ordem: number;
  texto_zh: string;
  texto_pt: string;
}

export interface RequisicaoQa {
  modelo: string;
  temperatura?: number;
  omega: string;
  glossario: EntradaGlossario[];
  /** true quando o glossário filtrado vai na mensagem do usuário (sistema estável). */
  glossarioNoUsuario?: boolean;
  /** Pares anteriores só como contexto (repetição/omissão de fronteira) — não auditar. */
  caudaAnterior: ParParaQa[];
  pares: ParParaQa[];
}

export type TipoApontamentoQa = 'glossario' | 'pronome-genero' | 'repeticao' | 'omissao' | 'outro';

export interface ApontamentoQa {
  ordem: number;
  tipo: TipoApontamentoQa;
  severidade: 'alta' | 'media' | 'baixa';
  trecho_zh: string;
  observacao: string;
  sugestao: string | null;
}

export interface RespostaQa {
  apontamentos: ApontamentoQa[];
  bruta: string;
  uso: UsoChamada;
}

// ── Erros classificados (doc 05 §2: transitório vs fatal; 'limite' é o 429 —
// transitório por natureza, mas com tratamento próprio quando o usuário optou
// por não passar da cota gratuita; 'truncado' é resposta cortada por
// max_tokens — repetir a chamada igual só paga de novo, o bloco precisa
// encolher — doc 09 / A1 da auditoria) ─────────────────────────────────────

export class ErroProvedor extends Error {
  /** Espera sugerida pelo provedor antes de tentar de novo (cabeçalho
   * Retry-After de um 429), em ms. */
  public readonly retryAfterMs?: number;

  constructor(
    mensagem: string,
    public readonly tipo: 'transitorio' | 'fatal' | 'limite' | 'truncado',
    opcoes?: { retryAfterMs?: number },
  ) {
    super(mensagem);
    this.name = 'ErroProvedor';
    this.retryAfterMs = opcoes?.retryAfterMs;
  }
}

// ── Interface comum ────────────────────────────────────────────────────────

export interface ProvedorIA {
  id: ProvedorId;
  nome: string;
  precisaChave: boolean;
  modeloPadrao: string;
  listarModelos(chave: string | null): Promise<ModeloInfo[]>;
  testarCredencial(chave: string | null): Promise<{ ok: boolean; mensagem: string }>;
  traduzirBloco(chave: string | null, req: RequisicaoTraducaoBloco): Promise<RespostaTraducaoBloco>;
  traduzirContracapa(chave: string | null, req: RequisicaoContracapa): Promise<RespostaContracapa>;
  revisarFrase(chave: string | null, req: RequisicaoRevisao): Promise<RespostaRevisaoProvedor>;
  extrairTermos(chave: string | null, req: RequisicaoExtrairTermos): Promise<RespostaExtrairTermos>;
  refinarPrompt(chave: string | null, req: RequisicaoRefinarPrompt): Promise<RespostaRefinarPrompt>;
  analisarQa(chave: string | null, req: RequisicaoQa): Promise<RespostaQa>;
}
