// Tipos de domínio e contratos da API — fonte única de verdade entre server e web.

// ── Domínio ────────────────────────────────────────────────────────────────

export type ProvedorId = 'claude' | 'gemini' | 'mock';

export type StatusCapitulo = 'rascunho' | 'traduzindo' | 'revisado' | 'finalizado';
export type StatusTraducaoFrase = 'pendente' | 'traduzida' | 'erro';
export type CategoriaGlossario =
  | 'local'
  | 'poder-habilidade'
  | 'entidade'
  | 'titulo-cargo'
  | 'personagem'
  | 'outro';
export type Veredito = 'correto' | 'incorreto';
export type StatusCasoTeste = 'confirmado' | 'corrigido' | 'pendente' | 'regra-nova-necessaria';
export type StatusTermoSugerido = 'pendente' | 'aceito' | 'rejeitado';

export interface Obra {
  id: number;
  titulo: string;
  titulo_original: string | null;
  provedor_padrao: ProvedorId | null;
  modelo_padrao: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface ObraComContadores extends Obra {
  capitulos_total: number;
  glossario_total: number;
  testes_pendentes: number;
  termos_sugeridos_pendentes: number;
}

export interface PromptMae {
  id: number;
  obra_id: number;
  versao: string;
  conteudo: string;
  notas_versao: string | null;
  ativo: boolean;
  criado_em: string;
}

export interface Capitulo {
  id: number;
  obra_id: number;
  numero: number;
  titulo: string | null;
  status: StatusCapitulo;
  texto_origem: string;
  provedor: ProvedorId | null;
  modelo: string | null;
  prompt_id: number | null;
  criado_em: string;
  atualizado_em: string;
}

export interface CapituloResumo extends Omit<Capitulo, 'texto_origem'> {
  frases_total: number;
  frases_traduzidas: number;
  frases_erro: number;
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

// ── Configurações ──────────────────────────────────────────────────────────

export interface Configuracoes {
  provedor_padrao: ProvedorId;
  modelo_padrao: string;
  tamanho_bloco: number;
  vizinhas_revisao: number;
  cauda_contexto: number;
}

export const CONFIG_PADRAO: Configuracoes = {
  provedor_padrao: 'mock',
  modelo_padrao: '',
  tamanho_bloco: 20,
  vizinhas_revisao: 3,
  cauda_contexto: 2,
};

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
}

export type EventoTraducao =
  | { tipo: 'progresso'; dados: ProgressoTraducao }
  | { tipo: 'termos_sugeridos'; dados: { quantidade: number } }
  | { tipo: 'job_concluido'; dados: ProgressoTraducao }
  | { tipo: 'job_erro'; dados: { mensagem: string } };

// ── Payloads de criação/edição ─────────────────────────────────────────────

export interface CriarObraPayload {
  titulo: string;
  titulo_original?: string;
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
