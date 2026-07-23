import type { EntradaGlossario, ModeloInfo, ProvedorId, RespostaRevisao } from '@dao-tale/shared';

// ── Requisições montadas pela orquestração (independentes de provedor) ─────

export interface FraseParaTraduzir {
  ordem: number;
  texto_zh: string;
  /** Rótulo do item quando não é uma frase de capítulo (ex.: "título da obra"),
   * apresentado ao modelo fora do texto-fonte para não contaminá-lo. */
  rotulo?: string;
}

export interface RequisicaoTraducaoBloco {
  modelo: string;
  promptMae: string;
  /** 'capitulo' (padrão): frases numeradas de um capítulo. 'detalhes': título e/ou
   * sinopse de obra — muda as instruções operacionais (traduzir o item inteiro,
   * não frase a frase). */
  modo?: 'capitulo' | 'detalhes';
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
}

export interface RequisicaoRevisao {
  modelo: string;
  promptMae: string;
  glossario: EntradaGlossario[];
  /** true quando o glossário foi filtrado pela frase questionada: ele entra na
   * mensagem do usuário e o sistema fica estável entre revisões (cacheável). */
  glossarioNoUsuario?: boolean;
  vizinhasAntes: { texto_zh: string; texto_pt: string }[];
  vizinhasDepois: { texto_zh: string; texto_pt: string }[];
  frase: { texto_zh: string; texto_pt: string; texto_pt_original_ia: string | null };
  pergunta: string;
}

export interface RespostaRevisaoProvedor extends RespostaRevisao {
  bruta: string;
}

// ── Extração exaustiva de termos de uma frase (curadoria manual do glossário) ─
// Distinta do termos_novos oportunista da tradução: aqui a instrução é varrer a
// frase inteira e devolver TODO nome próprio/entidade que mereça glossário —
// para pegar o que o pipeline deixou passar.

export interface RequisicaoExtrairTermos {
  modelo: string;
  promptMae: string;
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
}

// ── Refinamento do prompt da obra (versionamento semiautomático, doc 08 §7) ─
// Recorrências do banco de testes → proposta concreta de regra nova para o
// delta (Seção 6); o usuário revisa e aprova como nova versão.

export interface RequisicaoRefinarPrompt {
  modelo: string;
  /** Prompt mãe composto (núcleo + delta) vigente na obra. */
  promptMae: string;
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
  promptMae: string;
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
  revisarFrase(chave: string | null, req: RequisicaoRevisao): Promise<RespostaRevisaoProvedor>;
  extrairTermos(chave: string | null, req: RequisicaoExtrairTermos): Promise<RespostaExtrairTermos>;
  refinarPrompt(chave: string | null, req: RequisicaoRefinarPrompt): Promise<RespostaRefinarPrompt>;
  analisarQa(chave: string | null, req: RequisicaoQa): Promise<RespostaQa>;
}
