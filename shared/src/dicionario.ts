// Dicionários locais de mandarim (doc 30): DCP (chinês → português) e CC-CEDICT
// (chinês → inglês). Tipos trocados entre servidor e interface, e as contas de
// pinyin — aqui, e não no servidor, porque a tela mostra a leitura com tons e o
// servidor confere a leitura que a IA deu com a mesma regra.

export const FONTES_DICIONARIO = ['dcp', 'cedict'] as const;
export type FonteDicionario = (typeof FONTES_DICIONARIO)[number];

export const ROTULO_FONTE: Record<FonteDicionario, string> = {
  dcp: 'DCP',
  cedict: 'CC-CEDICT',
};

/** Um sentido agrupado por classe gramatical. No CC-CEDICT não há classe. */
export interface Acepcao {
  classe: string | null;
  sentidos: string[];
  /** Nome próprio (sobrenome, lugar, marca) — fica fora do prompt quando há
   *  sentido comum: "sobrenome Lin" só confunde quem está lendo 林. */
  proprio: boolean;
}

export interface Verbete {
  fonte: FonteDicionario;
  simplificado: string;
  /** Só o CC-CEDICT traz a forma tradicional. */
  tradicional: string | null;
  /** Pinyin numérico, como a fonte escreve ("dao1", "ren4 shi5"). */
  pinyin: string;
  /** Pinyin com marcas de tom, para exibir. */
  leitura: string;
  acepcoes: Acepcao[];
  classificadores: string[];
  /** Frases de exemplo do DCP (origem e português). */
  exemplos: { origem: string; pt: string }[];
  /** Nível HSK do DCP ("1", "2,6", "7-9"); null fora da lista. */
  hsk: string | null;
  /** Observação da fonte sobre a leitura (ex.: mudança de tom de 一). */
  nota: string | null;
}

/** Uma palavra da frase com o que os dicionários dizem dela. */
export interface PalavraDicionario {
  texto: string;
  /** Posição (em caracteres) na frase. */
  inicio: number;
  verbetes: Verbete[];
  /** Termo do glossário da obra: a forma em português que vale na obra. Quando
   *  presente, o glossário decide — o dicionário diria o sentido comum de cada
   *  caractere de um nome próprio. */
  glossario: { termo_pt: string; categoria: string } | null;
}

export interface FonteInstalada {
  id: FonteDicionario;
  nome: string;
  licenca: string;
  url: string;
  versao: string | null;
  importado_em: string;
  total: number;
}

export interface EstadoDicionario {
  instalado: boolean;
  fontes: FonteInstalada[];
}

export interface DicionarioDaFrase extends EstadoDicionario {
  palavras: PalavraDicionario[];
}

/** O pinyin que a IA deu para um segmento não bate com nenhuma leitura do
 *  dicionário. Quem está no nível zero não tem como perceber o erro sozinho. */
export interface DivergenciaLeitura {
  /** Índice do segmento na explicação. */
  indice: number;
  texto: string;
  leitura_ia: string;
  /** Leituras do dicionário, com tons (até 4). */
  leituras_dicionario: string[];
}

// ── Pinyin numérico → com tons ─────────────────────────────────────────────

const MARCAS: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

function marcarSilaba(silaba: string, tom: number): string {
  const s = silaba.replace(/u:|v/g, 'ü').replace(/U:|V/g, 'Ü');
  if (tom < 1 || tom > 4) return s;
  const minusc = s.toLowerCase();
  // Regra de posição: a/e levam a marca; em "ou", o o; senão, a última vogal.
  let pos = minusc.search(/[ae]/);
  if (pos < 0) pos = minusc.indexOf('ou');
  if (pos < 0) {
    for (let i = minusc.length - 1; i >= 0; i--) {
      if ('iouü'.includes(minusc[i])) {
        pos = i;
        break;
      }
    }
  }
  if (pos < 0) return s;
  const vogal = minusc[pos];
  const marcada = MARCAS[vogal][tom - 1];
  const final = s[pos] === vogal ? marcada : marcada.toUpperCase();
  return s.slice(0, pos) + final + s.slice(pos + 1);
}

/** "dao1" → "dāo"; "ren4 shi5" → "rèn shi"; "da1//shan4" → "dāshàn". */
export function pinyinComTons(numerico: string): string {
  return numerico
    .replace(/\/\//g, '')
    .replace(/([a-zA-ZüÜ:]+)([1-5])/g, (_m, silaba: string, tom: string) => marcarSilaba(silaba, Number(tom)));
}

// ── Conferência da leitura da IA ───────────────────────────────────────────

interface Silaba {
  base: string;
  tom: number;
}

/** Sílabas de uma leitura numérica de dicionário; letra sem número = tom neutro. */
function silabasNumericas(numerico: string): Silaba[] {
  const limpo = numerico
    .toLowerCase()
    .replace(/u:/g, 'v')
    .replace(/ü/g, 'v')
    .replace(/[^a-z1-5]+/g, ' ');
  const silabas: Silaba[] = [];
  for (const m of limpo.matchAll(/([a-z]+)([1-5])?/g)) {
    silabas.push({ base: m[1], tom: m[2] ? Number(m[2]) : 5 });
  }
  return silabas;
}

const TOM_DA_MARCA: Record<string, number> = { '\u0304': 1, '\u0301': 2, '\u030c': 3, '\u0300': 4 };

/** Letras (minúsculas, ü = v) e, para cada letra marcada, o tom. Aceita também
 *  pinyin numérico, caso a IA escreva assim. */
function letrasMarcadas(leitura: string): { letras: string; tons: Map<number, number> } {
  const tons = new Map<number, number>();
  let letras = '';
  for (const ch of leitura.normalize('NFD').toLowerCase()) {
    if (ch >= 'a' && ch <= 'z') letras += ch === 'v' ? 'v' : ch;
    else if (ch === '\u0308') letras = letras.replace(/u$/, 'v');
    else if (TOM_DA_MARCA[ch] && letras.length > 0) tons.set(letras.length - 1, TOM_DA_MARCA[ch]);
    else if (ch >= '1' && ch <= '4' && letras.length > 0) {
      // "dao1": o número fecha a sílaba; marca a última letra dela.
      tons.set(letras.length - 1, Number(ch));
    }
  }
  return { letras, tons };
}

/** Mudança de tom que o pinyin escrito costuma mostrar (yí ge, bú shì). */
const TONS_ACEITOS: Record<string, number[]> = { 一: [1, 2, 4], 不: [2, 4] };

/**
 * A leitura da IA é uma das do dicionário? Compara sílaba a sílaba, alinhando
 * pelas letras. Tom neutro, de qualquer lado, não acusa: os dicionários marcam
 * neutro onde a fala varia, e a IA às vezes dá o tom de citação — avisar disso
 * seria alarme falso para quem não tem como julgar.
 */
export function leituraConfere(leituraIa: string, pinyinDicionario: string, hanzi?: string): boolean {
  const ia = letrasMarcadas(leituraIa);
  const silabas = silabasNumericas(pinyinDicionario);
  if (silabas.length === 0 || ia.letras !== silabas.map((s) => s.base).join('')) return false;
  const caracteres = hanzi ? [...hanzi] : [];
  const porCaractere = caracteres.length === silabas.length;
  let pos = 0;
  for (let i = 0; i < silabas.length; i++) {
    const { base, tom } = silabas[i];
    let tomIa = 5;
    for (let p = pos; p < pos + base.length; p++) {
      const t = ia.tons.get(p);
      if (t) tomIa = t;
    }
    pos += base.length;
    if (tom === 5 || tomIa === 5 || tom === tomIa) continue;
    const aceitos = porCaractere ? TONS_ACEITOS[caracteres[i]] : undefined;
    if (aceitos?.includes(tom) && aceitos.includes(tomIa)) continue;
    return false;
  }
  return true;
}

/** Caractere chinês (ideograma CJK, inclusive extensões). */
export function ehHanzi(ch: string): boolean {
  return /\p{Script=Han}/u.test(ch);
}
