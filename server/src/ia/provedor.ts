import type { EntradaGlossario, ModeloInfo, ProvedorId, RespostaRevisao } from '@dao-tale/shared';

// ── Requisições montadas pela orquestração (independentes de provedor) ─────

export interface FraseParaTraduzir {
  ordem: number;
  texto_zh: string;
}

export interface RequisicaoTraducaoBloco {
  modelo: string;
  promptMae: string;
  glossario: EntradaGlossario[];
  /** true quando o glossário foi filtrado por bloco (só termos presentes no trecho):
   * ele entra na mensagem do usuário e o sistema fica estável para o prompt caching. */
  glossarioNoUsuario?: boolean;
  /** Título do capítulo ainda sem tradução: entra no bloco como frase de número -1. */
  titulo?: string;
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
  vizinhasAntes: { texto_zh: string; texto_pt: string }[];
  vizinhasDepois: { texto_zh: string; texto_pt: string }[];
  frase: { texto_zh: string; texto_pt: string; texto_pt_original_ia: string | null };
  pergunta: string;
}

export interface RespostaRevisaoProvedor extends RespostaRevisao {
  bruta: string;
}

// ── Erros classificados (doc 05 §2: transitório vs fatal; 'limite' é o 429 —
// transitório por natureza, mas com tratamento próprio quando o usuário optou
// por não passar da cota gratuita) ──────────────────────────────────────────

export class ErroProvedor extends Error {
  constructor(
    mensagem: string,
    public readonly tipo: 'transitorio' | 'fatal' | 'limite',
  ) {
    super(mensagem);
    this.name = 'ErroProvedor';
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
}
