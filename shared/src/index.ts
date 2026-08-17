// Tipos de domínio e contratos da API — fonte única de verdade entre server e web.

import type { PreferenciasEstilo } from './preferenciasEstilo.js';
import { TEMAS, type Camada, type Tema } from './temasDoPrompt.js';
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
// Vitrine pública (doc 14): os únicos formatos que saem sem sessão.
export * from './publico.js';
// Registro de temas (doc 15 §7): qual camada é dona de cada tema, e como reconhecê-lo
// em texto. É o que torna verificável a partição entre Alfa, Beta e Delta.
export * from './temasDoPrompt.js';
// Catálogo de erros comuns zh→pt-BR (doc 2026-08-10): entradas com aferição
// medida no corpus real, e não intuição de prompt.
export * from './catalogoErros.js';
// Regras de flexão de termo do glossário (plural, gênero, conector): fonte única
// para a varredura de consistência e o grifo do editor.
export * from './flexaoTermo.js';

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
// 'escolha-legitima': a tradução não está errada, mas também não é a única leitura
// defensável. Sem ela isso era espremido em 'correto' com uma regra inventada em cima.
export type Veredito = 'correto' | 'incorreto' | 'escolha-legitima';

export type StatusCasoTeste =
  | 'confirmado'
  | 'corrigido'
  | 'pendente'
  | 'regra-nova-necessaria'
  // O revisor discordou do veredito. Sai das recorrências e dos rótulos oferecidos
  // ao modelo: veredito recusado não deve continuar empurrando regra nova.
  | 'rejeitado';
export type StatusTermoSugerido = 'pendente' | 'aceito' | 'rejeitado';

/**
 * A regra recorrente é, na verdade, uma CHAVE das preferências da obra?
 *
 * Diálogo, marcação do pensamento, mais-que-perfeito, nota do tradutor,
 * onomatopeia e registro não se resolvem escrevendo diretriz: são toggles da
 * Seção 5. O prompt de refinamento já proíbe propor regra sobre eles — mas a
 * proibição só era descoberta DEPOIS da chamada paga. Na 死人经 isso custou três
 * chamadas seguidas para ouvir "nenhuma regra sustentada": 7 dos 10 casos
 * recorrentes eram mais-que-perfeito, ou seja, predestinados a não render nada.
 *
 * Devolve a chave de preferência coberta, ou null quando o caso é mesmo
 * candidato a virar diretriz nova.
 *
 * Lê o registro de temas (`temasDoPrompt.ts`), mas só as entradas `filtravel` — este é
 * o caminho que DERRUBA candidatos em silêncio, e por isso é mais conservador que o
 * aviso. `nomes_proprios` fica de fora de propósito: a política é chave de Beta, mas o
 * tratamento de um nome específico é glossário, e descartar aqui perderia caso legítimo.
 */
export function preferenciaQueCobre(rotulo: string): keyof PreferenciasEstilo | null {
  const n = normalizarSecaoRegra(rotulo);
  const tema = TEMAS.find((t) => t.dono === 'beta' && t.filtravel && (t.padraoRotulo ?? t.padrao).test(n));
  return (tema?.id as keyof PreferenciasEstilo) ?? null;
}

/**
 * Qual tema do registro este rótulo de regra invoca, e qual camada é dona dele.
 *
 * `preferenciaQueCobre` NÃO é reescrita em cima desta. As duas parecem a mesma
 * busca, mas o `find` para no primeiro casamento da ordem do array: um rótulo que
 * casasse com `nomes_proprios` (beta, filtravel: false) e com `registro` devolveria
 * `registro` hoje e `null` na versão delegada — regressão silenciosa num caminho
 * que descarta candidato pago. As duas compartilham o registro e a normalização, e
 * mantêm o predicado próprio.
 *
 * null = rótulo sem tema conhecido, ou seja, candidato legítimo a diretriz de obra.
 */
export function camadaDoRotulo(rotulo: string): { tema: Tema; camada: Camada } | null {
  const n = normalizarSecaoRegra(rotulo);
  const tema = TEMAS.find((t) => (t.padraoRotulo ?? t.padrao).test(n));
  return tema ? { tema, camada: tema.dono } : null;
}

/**
 * Rótulo de regra reduzido à sua identidade, para agrupar casos do banco de
 * testes.
 *
 * O contrato pede um identificador "curto e estável", mas o modelo devolve uma
 * variação nova a cada chamada: numa mesma obra apareceram "5-mais-que-perfeito",
 * "5.mais-que-perfeito", "5.estilo-mais-que-perfeito" e "mais-que-perfeito" para
 * a MESMA regra. Agrupando pelo texto cru, 7 ocorrências viravam 4 grupos e o
 * limiar de 2 nunca disparava — o refinamento dizia "nada indica lacuna
 * sistemática" justamente quando o padrão era gritante.
 *
 * Normaliza: minúsculas, sem acento, sem prefixo de numeração de seção, sem
 * pontuação, e descarta as palavras de moldura que o modelo enfeita ("estilo",
 * "regra", "secao") — o que sobra é o miolo que identifica a regra.
 */
export function normalizarSecaoRegra(rotulo: string): string {
  const semAcento = rotulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const palavras = semAcento
    .replace(/^[\s\d.\-_]+/, '') // "5-", "3.2 ", "5." …
    .split(/[\s.\-_/]+/)
    .filter((p) => p.length > 0 && !/^\d+$/.test(p) && !MOLDURA_REGRA.has(p));
  return palavras.sort().join('-');
}

const MOLDURA_REGRA = new Set(['estilo', 'regra', 'regras', 'secao', 'preferencia', 'preferencias', 'de', 'da', 'do']);

/** Resultado de aplicar uma correção de revisão a uma frase. */
export type ResultadoCorrecao =
  | { tipo: 'cirurgica'; texto: string }
  | { tipo: 'frase-inteira'; texto: string; encurtaMuito: boolean }
  | { tipo: 'impossivel'; motivo: string };

/**
 * Aplica a correção trocando SÓ o trecho apontado, quando dá.
 *
 * A substituição pela frase inteira destruiu conteúdo em casos reais: numa
 * frase de três orações o modelo devolveu só a que consertou (as outras duas
 * sumiram), e numa fala ele devolveu o texto sem as aspas de diálogo. O par
 * `trecho_pt_errado`/`trecho_pt_corrigido` existe para a troca ser cirúrgica —
 * tudo que está fora do trecho fica intocado por construção.
 *
 * O trecho precisa aparecer EXATAMENTE UMA vez no texto atual. Zero vezes = o
 * modelo não copiou de verdade (parafraseou, ou revisou um texto que mudou
 * desde então). Mais de uma = ambíguo, e trocar a ocorrência errada é pior que
 * não trocar. Nos dois casos caímos para a frase inteira, que aí é escolha
 * consciente do usuário e não efeito colateral.
 */
export function aplicarCorrecao(
  textoAtual: string,
  correcao: { trecho_pt_errado?: string | null; trecho_pt_corrigido?: string | null; correcao_proposta?: string | null },
): ResultadoCorrecao {
  const errado = correcao.trecho_pt_errado?.trim();
  const corrigido = correcao.trecho_pt_corrigido;
  if (errado && corrigido != null) {
    const primeira = textoAtual.indexOf(errado);
    if (primeira >= 0 && textoAtual.indexOf(errado, primeira + 1) === -1) {
      return {
        tipo: 'cirurgica',
        texto: textoAtual.slice(0, primeira) + corrigido + textoAtual.slice(primeira + errado.length),
      };
    }
  }
  const inteira = correcao.correcao_proposta;
  if (inteira == null || inteira.trim() === '') {
    return { tipo: 'impossivel', motivo: 'A revisão não trouxe correção aplicável.' };
  }
  return { tipo: 'frase-inteira', texto: inteira, encurtaMuito: propostaPareceTrecho(textoAtual, inteira) };
}

/**
 * O menor trecho que difere entre dois textos: corta o prefixo e o sufixo comuns,
 * depois expande até a fronteira de palavra.
 *
 * É o INVERSO de `aplicarCorrecao` — dela sai o par que a correção cirúrgica
 * consumiria. Serve para ler o que o revisor mudou à mão sem despejar a frase
 * inteira no relatório: `morto -> cadáver` ensina; `ara -> ou` não (ilegível).
 *
 * O corte por caractere é minimal mas pode partir palavras no meio. A expansão
 * até espaço em branco devolve trechos legíveis: `errara -> errou` em vez de
 * `ara -> ou`. Serve tanto para humanos lerem num relatório quanto para ir dentro
 * de um prompt como exemplo do que mudou.
 */
export function trechoQueMudou(antes: string, depois: string): { de: string; para: string } {
  let i = 0;
  while (i < antes.length && i < depois.length && antes[i] === depois[i]) i++;
  // O sufixo comum não pode invadir o que o prefixo já contou ("aa" -> "aaa"),
  // senão os índices se cruzam e o slice devolve lixo.
  let j = 0;
  while (j < antes.length - i && j < depois.length - i && antes[antes.length - 1 - j] === depois[depois.length - 1 - j]) j++;

  // Textos iguais: nada a expandir, e expandir aqui comeria a última palavra.
  if (i === antes.length && i === depois.length) return { de: '', para: '' };

  // O corte por caractere parte palavras no meio ("ara" -> "ou", "M" -> "O ato de m").
  // Isso é minimal e ilegível: a função existe para um humano ler o par no relatório
  // e para ele ir dentro de um prompt. Expandir até a fronteira de palavra devolve
  // "errara" -> "errou" e "Matar" -> "O ato de matar".
  while (i > 0 && !/\s/.test(antes[i - 1])) i--;
  while (j > 0 && !/\s/.test(antes[antes.length - j])) j--;

  return { de: antes.slice(i, antes.length - j), para: depois.slice(i, depois.length - j) };
}

/**
 * A correção proposta parece ser só um PEDAÇO da frase, e não a frase inteira?
 *
 * O contrato manda a IA devolver "a frase COMPLETA corrigida", mas ela nem
 * sempre obedece: numa frase de três orações, o modelo devolveu apenas a oração
 * que consertou. Aplicar aquilo apagou as outras duas em silêncio — o pior tipo
 * de perda, porque o texto que sobra continua bem formado e não parece um erro.
 *
 * Heurística deliberadamente frouxa: só acusa quando a proposta é bem menor que
 * o texto atual E a diferença é grande o bastante para não ser aperto de estilo.
 * Encurtar de verdade é legítimo (retirar redundância), então isto pede
 * confirmação, nunca bloqueia.
 */
export function propostaPareceTrecho(textoAtual: string, proposta: string): boolean {
  const atual = textoAtual.trim().length;
  const nova = proposta.trim().length;
  if (atual === 0) return false;
  return nova < atual * 0.6 && atual - nova >= 40;
}

/** Raciocínio prolongado do provedor: 'desligado' economiza saída (que é quase
 * toda a conta) e tempo; 'ligado' força mesmo onde o padrão do app economizaria.
 * Ausente/null = não mandar nada e ficar com o padrão do provedor. */
export type ModoThinking = 'ligado' | 'desligado';
export const MODOS_THINKING = ['ligado', 'desligado'] as const;

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
  /** Modo de raciocínio do provedor nesta obra; null = o padrão dele.
   * Medido: com thinking ligado, 86% dos tokens de saída de um capítulo eram
   * raciocínio — e saída é ~99% da conta. */
  thinking: ModoThinking | null;
  fase_traducao: FaseTraducao;
  /** Obra visível na vitrine pública, sem sessão (doc 14). Padrão false, e só
   * os capítulos em 'finalizado' saem. */
  publica: boolean;
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

export interface VersaoDelta {
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
export type PromptPadrao = Omit<VersaoDelta, 'obra_id' | 'tipo' | 'nucleo_id' | 'preferencias'>;

/** Prompt mãe efetivo de uma obra (núcleo + delta compostos), com proveniência. */
export interface PromptComposto {
  texto: string;
  prompt: VersaoDelta;
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
  /** De onde veio a última edição: null = digitada pelo revisor; 'revisao',
   *  'passe-estilo', 'qa' ou 'substituicao' (troca de termo em lote) = aprovada
   *  num botão; 'retraducao' = o texto era uma edição manual, mas foi
   *  sobrescrito por uma nova tradução da IA (retradução com "sobrescrever
   *  também as editadas") — não é mais o que o revisor digitou. */
  origem_edicao: string | null;
}

/** Que tipo de lei o termo tem.
 *
 *  `identidade` — a FORMA é a resposta, maiúsculas inclusive (金鹏堡 → Fortaleza
 *  do Peng Dourado). `lexical` — a PALAVRA é a resposta e a forma flexiona à
 *  vontade (刀 → sabre; "sabres" e "Sabre" são o mesmo acerto).
 *
 *  Enum fechado, e não `CategoriaGlossario` (que é string livre), porque o prompt
 *  ramifica nele: categoria livre viraria `Identidade`, `identidade `, `id`. */
export type EspecieTermo = 'identidade' | 'lexical';
export const ESPECIES_TERMO: readonly EspecieTermo[] = ['identidade', 'lexical'];

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
  /** `null` = nunca classificado; comporta-se como `identidade`, que é o
   *  comportamento anterior a esta coluna existir. */
  especie: EspecieTermo | null;
  /** A regra daquele termo em uma frase — quando capitalizar, ou quando o
   *  gatilho chinês NÃO é este termo. Entregue na linha dele, no prompt. */
  nota_uso: string | null;
  /** O gatilho chinês nem sempre é este termo: 小心 é "cuidado" e também a criada
   *  Xiao Xin — medido, 7 de 8 ocorrências não são a personagem. Tira o termo da
   *  varredura direta, que erraria a maioria das vezes. */
  ambiguo: boolean;
  /** O termo do qual este faz parte. NÃO é `principal_id`: pai é pertencimento
   *  (西堡 dentro de 金鹏堡), principal é variante do mesmo referente. */
  termo_pai_id: number | null;
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
  /** Turno anterior do fio; null = raiz. */
  caso_pai_id: number | null;
  trecho_zh: string;
  pergunta: string;
  veredito: Veredito;
  /** Trata do motivo declarado na pergunta. Texto principal na tela. */
  resposta: string;
  /** Só quando uma regra decide o caso; '' caso contrário. */
  justificativa: string;
  secao_regra: string | null;
  correcao_proposta: string | null;
  /** Par cirúrgico (ver `aplicarCorrecao`); nulo nos casos anteriores a ele. */
  trecho_pt_errado: string | null;
  trecho_pt_corrigido: string | null;
  status: StatusCasoTeste;
  motivo_rejeicao: string | null;
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
  'estilo',
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

/** Descontos padrão da indústria para quando o preço de cache NÃO é informado
 * (campo ausente ≠ campo zero). Ficam aqui, e não só no cálculo do servidor,
 * porque a tela de Preços precisa mostrar exatamente o número que vai ser
 * cobrado — senão o usuário não tem como saber que existe um padrão implícito.
 * Nem todo provedor segue a proporção: a DeepSeek cobra cache a ~2% da entrada,
 * não 10%, e é justamente por isso que o campo explícito existe. */
export const FATOR_CACHE_LEITURA = 0.1;
export const FATOR_CACHE_CRIACAO = 1.25;

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
/** Que código está rodando. Tudo `null` em desenvolvimento — o VPS não tem git
 *  (o `.git` fica fora do rsync), então o carimbo é gravado no envio. */
export interface CarimboVersao {
  commit: string | null;
  publicado_em: string | null;
  assunto: string | null;
}

export interface EstadoSaude {
  ok: boolean;
  versao: CarimboVersao;
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
  /** Este endereço pode ao menos TENTAR a senha (doc 14 §7). Falso quando há
   * lista de IPs e o visitante está fora dela — a interface então não desenha o
   * botão de entrar nem a rota /entrar. */
  pode_entrar: boolean;
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
  /** Trata do motivo declarado na pergunta. Texto principal na tela. */
  resposta: string;
  /** Só quando uma regra decide o caso; '' caso contrário. */
  justificativa: string;
  secao_regra: string | null;
  correcao_proposta: string | null;
  /** Par cirúrgico: o menor trecho do PT que muda e o que ele vira. A correção
   * é aplicada por aqui (ver `aplicarCorrecao`); nulo = modelo não cooperou. */
  trecho_pt_errado?: string | null;
  trecho_pt_corrigido?: string | null;
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
