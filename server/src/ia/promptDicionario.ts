import { ROTULO_FONTE, type FonteDicionario, type PalavraDicionario, type Verbete } from '@dao-tale/shared';

// Dicionário no prompt (doc 30). O que entra e com que doutrina — o tutor e a
// revisão por frase usam o mesmo bloco, com fontes diferentes:
//
// - tutor: DCP (português) primeiro, CC-CEDICT de complemento. Quem aprende
//   precisa do sentido em português, e o DCP é o que mais se aproxima disso;
// - revisão: só CC-CEDICT. O revisor julga uma tradução já escrita; glosas em
//   português na frente dele puxam a redação para o português de dicionário
//   ("decalque do verbete"), e o inglês dá o sentido sem sugerir as palavras.
//
// O bloco vai na mensagem do usuário, nunca no sistema: muda a cada frase, e no
// sistema quebraria o cache do prompt da obra.

export interface OpcoesDicionarioPrompt {
  fontes: FonteDicionario[];
  /** Teto de palavras no bloco. */
  maxPalavras: number;
}

export const DICIONARIO_TUTOR: OpcoesDicionarioPrompt = { fontes: ['dcp', 'cedict'], maxPalavras: 40 };
export const DICIONARIO_REVISAO: OpcoesDicionarioPrompt = { fontes: ['cedict'], maxPalavras: 25 };

const TETO_GLOSA = 110;

function cortar(s: string, teto: number): string {
  if (s.length <= teto) return s;
  const corte = s.slice(0, teto);
  const ultimo = Math.max(corte.lastIndexOf(';'), corte.lastIndexOf(','));
  return `${(ultimo > teto / 2 ? corte.slice(0, ultimo) : corte).trimEnd()}…`;
}

/** Sentidos de uma fonte para uma leitura, nome próprio por último e só se não
 *  houver outro: "sobrenome Dao" ao lado de 刀 é ruído. */
function glosa(verbetes: Verbete[]): string {
  const acepcoes = verbetes.flatMap((v) => v.acepcoes);
  const comuns = acepcoes.filter((a) => !a.proprio);
  const usadas = comuns.length > 0 ? comuns : acepcoes;
  const sentidos = usadas.flatMap((a) =>
    a.sentidos.map((s) =>
      // DCP: cada sentido costuma ser "sinônimo; sinônimo; explicação longa" —
      // os dois primeiros pedaços bastam para conferir.
      s.split(';').slice(0, 2).join(';').trim(),
    ),
  );
  const texto = [...new Set(sentidos)].join('; ');
  const prefixo = comuns.length === 0 && acepcoes.length > 0 ? 'nome próprio: ' : '';
  return texto ? prefixo + cortar(texto, TETO_GLOSA) : '';
}

const chaveLeitura = (v: Verbete) => v.leitura.replace(/\s+/g, '').toLowerCase();

/** Uma linha por palavra: cada leitura com o sentido de cada fonte. */
function linhaPalavra(p: PalavraDicionario, fontes: FonteDicionario[]): string | null {
  const verbetes = p.verbetes.filter((v) => fontes.includes(v.fonte));
  if (verbetes.length === 0) return null;
  const porLeitura = new Map<string, Verbete[]>();
  for (const v of verbetes) {
    const k = chaveLeitura(v);
    porLeitura.set(k, [...(porLeitura.get(k) ?? []), v]);
  }
  const leituras = [...porLeitura.values()]
    .map((vs) => {
      const partes = fontes
        .map((f) => {
          const g = glosa(vs.filter((v) => v.fonte === f));
          return g ? (fontes.length > 1 ? `${f === 'dcp' ? 'PT' : 'EN'}: ${g}` : g) : null;
        })
        .filter(Boolean);
      if (partes.length === 0) return null;
      // A grafia do verbete de sentido comum: o de sobrenome vem com maiúscula
      // ("Dāo") e às vezes é o primeiro da fonte.
      const comum = vs.filter((v) => v.acepcoes.some((a) => !a.proprio));
      const exibida = (comum.find((v) => v.fonte === 'dcp') ?? comum[0] ?? vs[0]).leitura.replace(/\s+/g, '');
      return `${exibida} — ${partes.join(' · ')}`;
    })
    .filter(Boolean);
  if (leituras.length === 0) return null;
  return `- ${p.texto}: ${leituras.join(' | ')}`;
}

/** HSK 1 de um caractere só (的, 了, 是, 我…): a revisão não precisa do verbete. */
const basico = (p: PalavraDicionario) =>
  [...p.texto].length === 1 && p.verbetes.some((v) => v.fonte === 'dcp' && v.hsk === '1');

/**
 * As palavras que vão ao prompt. Termos do glossário saem (o glossário já está
 * na mensagem e é lei); na revisão, também as palavras básicas — a não ser que
 * a pergunta do usuário fale delas.
 */
export function selecionarPalavras(
  palavras: PalavraDicionario[],
  papel: 'tutor' | 'revisao',
  pergunta = '',
): PalavraDicionario[] {
  const opcoes = papel === 'tutor' ? DICIONARIO_TUTOR : DICIONARIO_REVISAO;
  return palavras
    .filter((p) => !p.glossario)
    .filter((p) => p.verbetes.some((v) => opcoes.fontes.includes(v.fonte)))
    .filter((p) => papel === 'tutor' || !basico(p) || pergunta.includes(p.texto))
    .slice(0, opcoes.maxPalavras);
}

/** O bloco inteiro, ou [] quando não há o que mostrar. */
export function blocoDicionario(palavras: PalavraDicionario[] | undefined, papel: 'tutor' | 'revisao'): string[] {
  if (!palavras || palavras.length === 0) return [];
  const opcoes = papel === 'tutor' ? DICIONARIO_TUTOR : DICIONARIO_REVISAO;
  const linhas = palavras.map((p) => linhaPalavra(p, opcoes.fontes)).filter((l): l is string => !!l);
  if (linhas.length === 0) return [];
  const fontes = opcoes.fontes.map((f) => ROTULO_FONTE[f]).join(' e ');
  return [
    `## DICIONÁRIO (${fontes}) — referência para conferir leitura e sentido`,
    'Verbetes das palavras desta frase. A divisão em palavras é automática e pode errar.',
    '- Leitura: o pinyin que você der precisa ser uma das leituras listadas para aquela palavra; se o contexto ' +
      'pedir uma que não está aqui, diga isso.',
    '- Sentido: dicionário de uso geral, não de gênero literário. Às vezes junta o que o wuxia/xianxia separa ' +
      '(刀 aparece como "faca; espada", mas no gênero 刀 é sabre/lâmina de um gume e 剑 é a espada reta). O ' +
      'contexto, o glossário e as regras da obra decidem; o dicionário só confere.',
    '- Não copie a redação do verbete para a tradução.',
    ...linhas,
    '',
  ];
}
