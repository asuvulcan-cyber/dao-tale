import {
  perfilDe,
  ROTULO_NIVEL,
  type EntradaGlossario,
  type ExplicacaoTutor,
  type IdiomaOrigem,
  type NivelIdioma,
} from '@dao-tale/shared';
import { formatarGlossario, type PartesSistema } from './prompts.js';

// Prompts do modo tutor (doc 29). Doutrina fixa no código, como a contracapa:
// não é house-style da obra (que se versiona em `prompts`), é a doutrina de uma
// tarefa do aplicativo. O que a obra tem de particular entra como referência —
// o prompt mãe (para a tradução sugerida e o julgamento de estilo) e o
// glossário (que continua sendo lei para nomes e termos).
//
// Cache: `base` = doutrina do idioma/nível + regras da obra, idêntica entre
// explicar e corrigir; `operacional` = a tarefa. A frase, o contexto e o
// glossário relevante vão na mensagem do usuário.

export interface RequisicaoTutorBase {
  modelo: string;
  idioma_origem: IdiomaOrigem;
  nivel: NivelIdioma;
  temperatura?: number;
  /** Prompt mãe composto da obra — referência, não instrução de papel. */
  omega: string;
  /** Glossário já filtrado para os termos presentes no trecho. */
  glossario: EntradaGlossario[];
  frase: string;
  /** Frases anteriores (original e tradução atual, quando houver). */
  antes: { origem: string; pt: string }[];
  /** Frases seguintes, só o original. */
  depois: string[];
}

export type RequisicaoExplicarTutor = RequisicaoTutorBase;

export interface RequisicaoCorrigirTutor extends RequisicaoTutorBase {
  tentativa: string;
  /** Explicação já gerada para a frase: a tradução sugerida vira referência. */
  explicacao: ExplicacaoTutor | null;
}

const NIVEL_ZH: Record<NivelIdioma, string> = {
  zero:
    'Não lê caracteres nem pinyin. Dê pinyin com marcas de tom (mā, má, mǎ, mà) para TODA palavra. ' +
    'Explique partículas (了, 的, 着, 过, 把, 被, 吗…) e classificadores pelo que FAZEM na frase, sem forçar tradução. ' +
    'Palavras de dois ou mais caracteres que formam uma palavra só ficam num segmento só, com o significado do conjunto; ' +
    'quando ajudar a memorizar, dê o sentido de cada caractere na nota. Diga quando um segmento é nome próprio.',
  basico:
    'Reconhece caracteres e palavras muito frequentes. Dê pinyin para todas as palavras; explique com cuidado o que ' +
    'passar do vocabulário básico, e as partículas pelo que fazem.',
  intermediario:
    'Lê frases simples. Ainda dê pinyin em todas as palavras; concentre as notas em estruturas, expressões fixas e ' +
    'vocabulário literário.',
  avancado: 'Lê com fluência. Foque em nuance, registro literário, chengyu e alusões; notas só onde houver sutileza.',
};

const NIVEL_EN: Record<NivelIdioma, string> = {
  zero: 'Não sabe inglês. Explique toda palavra, inclusive artigos e preposições, e a ordem da frase passo a passo.',
  basico:
    'Entende palavras comuns, mas frases já ficam difíceis — lê como uma criança pequena. Dê o significado de TODA ' +
    'palavra ou expressão (é rápido e tira a insegurança), mas gaste a explicação na ESTRUTURA: quem faz o quê, o ' +
    'tempo verbal e como ele fica em português, orações encaixadas, phrasal verbs e expressões idiomáticas.',
  intermediario:
    'Lê frases simples sem ajuda. Dê significado das palavras menos comuns; foque em estruturas longas, tempos ' +
    'verbais compostos, phrasal verbs e expressões idiomáticas.',
  avancado: 'Lê com fluência. Foque em nuance, registro, ironia e expressões idiomáticas; notas só onde houver sutileza.',
};

const SEGMENTACAO: Record<IdiomaOrigem, string> = {
  zh:
    'Segmentação: a frase inteira, em ordem, sem pular nada; cada pontuação é um segmento próprio ' +
    '(leitura null, significado vazio, classe "pontuação"). O campo leitura é o pinyin com marcas de tom.',
  en:
    'Segmentação: a frase inteira, em ordem, sem pular nada; cada segmento é uma palavra ou uma expressão que só ' +
    'faz sentido junta (phrasal verb, expressão idiomática, nome composto). Pontuação pode ficar colada à palavra. ' +
    'O campo leitura é sempre null.',
};

export function sistemaTutorBase(req: Pick<RequisicaoTutorBase, 'idioma_origem' | 'nivel' | 'omega'>): string {
  const idioma = perfilDe(req.idioma_origem).rotulo.toLowerCase();
  const nivel = (req.idioma_origem === 'en' ? NIVEL_EN : NIVEL_ZH)[req.nivel];
  return [
    `# TUTOR DE ${idioma.toUpperCase()} PARA QUEM FALA PORTUGUÊS`,
    '',
    `Você é um tutor paciente e preciso. Quem estuda com você é brasileiro(a) e está aprendendo ${idioma} ` +
      'traduzindo para o português, frase a frase, um romance (webnovel). A tradução final entra na obra — então ' +
      'precisa ficar boa —, mas o objetivo aqui é a pessoa APRENDER a ler o original.',
    '',
    `## Nível de quem aprende: ${ROTULO_NIVEL[req.nivel].toLowerCase()}`,
    nivel,
    '',
    '## Como ensinar',
    '- Português simples, frases curtas, sem jargão de linguística. Quando usar um termo técnico (classificador, ' +
      'partícula de aspecto, phrasal verb), diga logo em seguida o que ele faz.',
    '- Seja exato. Quem está começando não tem como perceber um erro seu: na dúvida sobre uma leitura ou um ' +
      'sentido, fique com o mais comum e diga que há outra possibilidade.',
    '- Significado no CONTEXTO desta frase, não o verbete inteiro do dicionário.',
    '- Nomes, técnicas, lugares e títulos que estão no glossário da obra: use a forma em português do glossário.',
    '- Não invente conteúdo que o original não tem.',
    `- ${SEGMENTACAO[req.idioma_origem]}`,
    '',
    '## REGRAS DE TRADUÇÃO DESTA OBRA (referência)',
    'As regras abaixo foram escritas para o tradutor da obra. Aqui elas valem para a tradução sugerida e para ' +
      'julgar o estilo da tentativa — não mudam o seu papel de tutor.',
    '',
    req.omega.trim(),
  ].join('\n');
}

const OPERACIONAL_EXPLICAR = [
  '## TAREFA: EXPLICAR A FRASE EM TRÊS DICAS',
  'A pessoa abre as dicas uma de cada vez, só quando trava. Cada parte tem de funcionar sozinha.',
  '1. segmentos — a frase INTEIRA, em ordem: cada palavra (ou expressão que só faz sentido junta) com leitura, ' +
    'significado neste contexto, classe e, quando ajudar, uma nota sobre o que ela faz. Concatenando os textos dos ' +
    'segmentos, a frase original tem de sair igual.',
  '2. estrutura — como a frase se monta: quem faz o quê, a ordem, o papel das partículas ou dos tempos verbais, e o ' +
    'que muda ao passar para o português. De 2 a 5 frases curtas.',
  '3. literal — palavra por palavra, na ordem do original. Pode soar estranho: é para mostrar a montagem.',
  '4. traducao — tradução natural e completa da frase, seguindo as regras da obra e o glossário. Use o contexto para ' +
    'resolver referentes, tratamento e tempo verbal. Não traduza o contexto.',
  '5. armadilhas — até 3 pontos onde é fácil errar nesta frase (expressão que não se traduz ao pé da letra, unidade ' +
    'de medida, tratamento entre personagens, falso cognato). Lista vazia se não houver.',
  'Responda exclusivamente pelo formato estruturado fornecido.',
].join('\n');

const OPERACIONAL_CORRIGIR = [
  '## TAREFA: CORRIGIR A TENTATIVA',
  'Você recebe a frase, uma tradução sugerida (referência — não é a única certa) e a TENTATIVA de quem aprende.',
  '- Julgue primeiro o SENTIDO: a tentativa diz o que o original diz? Uma tradução diferente da sugerida, mas ' +
    'correta, é CERTA.',
  '- acertos: o que a pessoa acertou, de forma concreta (ex.: "você reconheceu que 了 marca ação concluída"). ' +
    'Nada de elogio vazio; se nada se salvou, diga o que ela pode aproveitar da tentativa.',
  '- problemas: um por erro real, do mais importante para o menos. Para cada: o trecho da tentativa, o tipo, a ' +
    'explicação citando a palavra do original que decide, e como fica. Estilo da obra entra como "estilo", por ' +
    'último. Quando o sentido estiver errado, não afogue a pessoa em polimento: no máximo 2 itens de ' +
    'naturalidade/estilo.',
  '- versao_corrigida: a TENTATIVA consertada com o mínimo de mudanças — mantenha as escolhas da pessoa que estão ' +
    'certas, mesmo que você escrevesse diferente. Se estiver tudo certo, repita a tentativa.',
  '- palavras_para_estudar: as palavras do original por trás dos erros (no máximo 5), com leitura e significado.',
  'Responda exclusivamente pelo formato estruturado fornecido.',
].join('\n');

export function sistemaExplicarTutorPartes(req: RequisicaoExplicarTutor): PartesSistema {
  return { base: sistemaTutorBase(req), operacional: OPERACIONAL_EXPLICAR };
}

export function sistemaCorrigirTutorPartes(req: RequisicaoCorrigirTutor): PartesSistema {
  return { base: sistemaTutorBase(req), operacional: OPERACIONAL_CORRIGIR };
}

function contexto(req: RequisicaoTutorBase): string[] {
  const sigla = perfilDe(req.idioma_origem).sigla;
  const linhas: string[] = [];
  if (req.glossario.length > 0) {
    linhas.push('## GLOSSÁRIO DA OBRA (termos presentes neste trecho; uso obrigatório)', formatarGlossario(req.glossario), '');
  }
  if (req.antes.length > 0) {
    linhas.push('## CONTEXTO ANTERIOR (não explicar)');
    for (const a of req.antes) {
      linhas.push(`${sigla} ${a.origem}`);
      if (a.pt.trim()) linhas.push(`PT: ${a.pt}`);
    }
    linhas.push('');
  }
  linhas.push('## FRASE PARA ESTUDAR', req.frase, '');
  if (req.depois.length > 0) {
    linhas.push('## CONTEXTO SEGUINTE (não explicar)', ...req.depois.map((d) => `${sigla} ${d}`), '');
  }
  return linhas;
}

export function usuarioExplicarTutor(req: RequisicaoExplicarTutor): string {
  return [...contexto(req), 'Explique a frase para estudar em três dicas.'].join('\n');
}

export function usuarioCorrigirTutor(req: RequisicaoCorrigirTutor): string {
  return [
    ...contexto(req),
    ...(req.explicacao ? ['## TRADUÇÃO SUGERIDA (referência, não a única certa)', req.explicacao.traducao, ''] : []),
    '## TENTATIVA DE QUEM ESTÁ APRENDENDO',
    req.tentativa.trim(),
    '',
    'Corrija a tentativa.',
  ].join('\n');
}
