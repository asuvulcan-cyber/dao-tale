import type { DivergenciaLeitura } from './dicionario.js';
import type { IdiomaOrigem } from './idiomaOrigem.js';

// Modo tutor de idioma (doc 29): tipos trocados entre servidor e interface, e a
// conta da repetição espaçada — aqui, e não no servidor, porque a tela mostra
// em cada botão o intervalo que aquela resposta vai dar.

// ── Nível de quem aprende ──────────────────────────────────────────────────

export const NIVEIS_IDIOMA = ['zero', 'basico', 'intermediario', 'avancado'] as const;
export type NivelIdioma = (typeof NIVEIS_IDIOMA)[number];

export const ROTULO_NIVEL: Record<NivelIdioma, string> = {
  zero: 'Do zero',
  basico: 'Básico',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
};

/** Perfil declarado em 20/11/2026: mandarim do zero, inglês básico. */
export const NIVEL_IDIOMA_PADRAO: Record<IdiomaOrigem, NivelIdioma> = { zh: 'zero', en: 'basico' };

// ── Explicação da frase (as três dicas vêm de uma chamada só) ──────────────

export interface SegmentoTutor {
  /** Palavra ou expressão, copiada do original. */
  texto: string;
  /** Pinyin com marcas de tom (mandarim); null no inglês e na pontuação. */
  leitura: string | null;
  /** Significado em português NESTE contexto; vazio na pontuação. */
  significado: string;
  /** Classe curta: "verbo", "partícula", "nome próprio", "pontuação"… */
  classe: string;
  /** O que a palavra FAZ quando não dá para traduzir (partículas, classificadores). */
  nota: string | null;
}

export interface ExplicacaoTutor {
  segmentos: SegmentoTutor[];
  /** Como a frase se monta, em português simples. */
  estrutura: string;
  /** Versão palavra por palavra. */
  literal: string;
  /** Tradução natural, seguindo as regras e o glossário da obra. */
  traducao: string;
  /** Até três armadilhas da frase (expressão idiomática, unidade, tratamento). */
  armadilhas: string[];
}

// ── Correção da tentativa ──────────────────────────────────────────────────

export const VEREDITOS_TUTOR = ['certo', 'quase', 'errado'] as const;
export type VereditoTutor = (typeof VEREDITOS_TUTOR)[number];

export const TIPOS_PROBLEMA_TUTOR = [
  'sentido',
  'omissao',
  'acrescimo',
  'gramatica',
  'naturalidade',
  'glossario',
  'estilo',
] as const;
export type TipoProblemaTutor = (typeof TIPOS_PROBLEMA_TUTOR)[number];

export const ROTULO_PROBLEMA_TUTOR: Record<TipoProblemaTutor, string> = {
  sentido: 'sentido',
  omissao: 'faltou',
  acrescimo: 'sobrou',
  gramatica: 'gramática',
  naturalidade: 'naturalidade',
  glossario: 'glossário',
  estilo: 'estilo da obra',
};

export interface ProblemaTutor {
  /** Pedaço da SUA tradução (vazio quando o problema é algo que faltou). */
  trecho: string;
  tipo: TipoProblemaTutor;
  explicacao: string;
  sugestao: string;
}

export interface PalavraParaEstudar {
  texto: string;
  leitura: string | null;
  significado: string;
}

export interface CorrecaoTutor {
  veredito: VereditoTutor;
  /** O que a tentativa acertou — concreto, não elogio vazio. */
  acertos: string;
  problemas: ProblemaTutor[];
  /** A sua tentativa com o mínimo de mudanças para ficar certa e natural. */
  versao_corrigida: string;
  palavras_para_estudar: PalavraParaEstudar[];
}

// ── Estado guardado por frase ──────────────────────────────────────────────

export interface EstadoTutorFrase {
  frase_id: number;
  explicacao: ExplicacaoTutor | null;
  /** Quantas dicas você já abriu (0–3). */
  dicas_vistas: number;
  tentativa: string | null;
  correcao: CorrecaoTutor | null;
  tentativas: number;
  /** Quando a tradução desta frase foi salva pelo tutor. */
  salva_em: string | null;
  /** Segmentos cujo pinyin não bate com o dicionário local (doc 30). Calculado
   *  a cada leitura, não guardado: atualizar o dicionário reconfere explicações
   *  antigas. Vazio sem dicionário instalado e no inglês. */
  divergencias: DivergenciaLeitura[];
}

// ── Vocabulário ────────────────────────────────────────────────────────────

export interface PalavraVocabulario {
  id: number;
  idioma: IdiomaOrigem;
  termo: string;
  leitura: string | null;
  significado: string;
  nota: string | null;
  exemplo_origem: string | null;
  exemplo_pt: string | null;
  obra_id: number | null;
  frase_id: number | null;
  criado_em: string;
  intervalo_dias: number;
  facilidade: number;
  repeticoes: number;
  /** Data local AAAA-MM-DD. */
  proxima_revisao: string;
  ultima_revisao: string | null;
  total_revisoes: number;
  total_erros: number;
}

export interface ResumoVocabulario {
  idioma: IdiomaOrigem;
  total: number;
  para_hoje: number;
  revisadas_hoje: number;
}

// ── Repetição espaçada (SM-2 simplificado) ─────────────────────────────────

export const NOTAS_REVISAO = [0, 1, 2, 3] as const;
export type NotaRevisao = (typeof NOTAS_REVISAO)[number];

export const ROTULO_NOTA: Record<NotaRevisao, string> = { 0: 'Errei', 1: 'Difícil', 2: 'Bom', 3: 'Fácil' };

export interface EstadoRepeticao {
  intervalo_dias: number;
  facilidade: number;
  repeticoes: number;
}

export const FACILIDADE_INICIAL = 2.5;
const FACILIDADE_MIN = 1.3;
const FACILIDADE_MAX = 3.0;

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const arredondar = (v: number) => Math.round(v * 100) / 100;

/**
 * Próximo estado de um cartão. "Errei" zera a sequência e devolve o cartão para
 * hoje (ele reaparece na mesma sessão); as outras três respostas sempre empurram
 * para o futuro, com "Difícil" crescendo devagar e "Fácil" pulando mais longe.
 */
export function agendarRevisao(atual: EstadoRepeticao, nota: NotaRevisao): EstadoRepeticao {
  const { intervalo_dias: intervalo, facilidade, repeticoes } = atual;
  if (nota === 0) {
    return { intervalo_dias: 0, facilidade: arredondar(limitar(facilidade - 0.2, FACILIDADE_MIN, FACILIDADE_MAX)), repeticoes: 0 };
  }
  if (nota === 1) {
    return {
      intervalo_dias: Math.max(1, Math.round(intervalo * 1.2)),
      facilidade: arredondar(limitar(facilidade - 0.15, FACILIDADE_MIN, FACILIDADE_MAX)),
      repeticoes: repeticoes + 1,
    };
  }
  const base = repeticoes === 0 ? 1 : repeticoes === 1 ? 3 : Math.round(intervalo * facilidade);
  if (nota === 2) {
    return { intervalo_dias: Math.max(1, base), facilidade, repeticoes: repeticoes + 1 };
  }
  return {
    intervalo_dias: Math.max(repeticoes === 0 ? 4 : 1, Math.round(base * 1.3)),
    facilidade: arredondar(limitar(facilidade + 0.15, FACILIDADE_MIN, FACILIDADE_MAX)),
    repeticoes: repeticoes + 1,
  };
}

/** Soma dias a uma data local AAAA-MM-DD (sem fuso: meio-dia UTC não vira a data). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + dias);
  return t.toISOString().slice(0, 10);
}

/** "hoje", "1 dia", "3 dias", "2 meses" — rótulo do intervalo nos botões. */
export function rotuloIntervalo(dias: number): string {
  if (dias <= 0) return 'hoje';
  if (dias === 1) return '1 dia';
  if (dias < 30) return `${dias} dias`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? '1 mês' : `${meses} meses`;
}

// ── Leitura em ruby: os segmentos cobrem a frase? ──────────────────────────

const semEspaco = (s: string) => s.replace(/\s+/g, '');

/**
 * true quando os segmentos, em ordem, reconstroem o original (ignorando
 * espaços). Só assim dá para desenhar o pinyin em cima de cada palavra da
 * própria frase; quando o modelo pula ou reordena algo, a tela cai para a
 * lista de palavras, que não promete correspondência posicional.
 */
export function segmentosCobremFrase(original: string, segmentos: Pick<SegmentoTutor, 'texto'>[]): boolean {
  if (segmentos.length === 0) return false;
  return semEspaco(segmentos.map((s) => s.texto).join('')) === semEspaco(original);
}
