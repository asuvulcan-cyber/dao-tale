import { pinyinComTons, type Acepcao, type Verbete } from '@dao-tale/shared';

// Leitura dos arquivos-fonte dos dicionários (doc 30). Funções puras: recebem o
// texto já baixado e devolvem verbetes — o download e o banco ficam fora, para
// os testes rodarem sobre trechos reais sem rede.

// ── CC-CEDICT ──────────────────────────────────────────────────────────────
// Uma linha por verbete: `trad simp [pin1 yin1] /sentido 1/sentido 2/`.

const LINHA_CEDICT = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/;

/** "CL:個|个[ge4],位[wei4]" → ["个", "位"] (a forma simplificada). */
function classificadoresCedict(gloss: string): string[] {
  return gloss
    .slice(3)
    .split(',')
    .map((c) => {
      const semLeitura = c.replace(/\[[^\]]*\]/, '');
      const partes = semLeitura.split('|');
      return partes[partes.length - 1].trim();
    })
    .filter(Boolean);
}

export function lerLinhaCedict(linha: string): Verbete | null {
  if (linha.startsWith('#')) return null;
  const m = LINHA_CEDICT.exec(linha);
  if (!m) return null;
  const [, tradicional, simplificado, pinyin, corpo] = m;
  const sentidos: string[] = [];
  const classificadores: string[] = [];
  for (const g of corpo.split('/')) {
    const gloss = g.trim();
    if (!gloss) continue;
    if (gloss.startsWith('CL:')) classificadores.push(...classificadoresCedict(gloss));
    else sentidos.push(gloss);
  }
  if (sentidos.length === 0 && classificadores.length === 0) return null;
  // Pinyin com maiúscula = nome próprio (sobrenome, lugar): "Lin2", "Bei3 jing1".
  const proprio = /^[A-Z]/.test(pinyin);
  return {
    fonte: 'cedict',
    simplificado,
    tradicional: tradicional === simplificado ? null : tradicional,
    pinyin,
    leitura: pinyinComTons(pinyin),
    acepcoes: [{ classe: null, sentidos, proprio }],
    classificadores,
    exemplos: [],
    hsk: null,
    nota: null,
  };
}

export function lerCedict(texto: string): { verbetes: Verbete[]; versao: string | null } {
  const verbetes: Verbete[] = [];
  let versao: string | null = null;
  for (const linha of texto.split('\n')) {
    const data = /^#! date=(\S+)/.exec(linha);
    if (data) versao = data[1].slice(0, 10);
    const v = lerLinhaCedict(linha.replace(/\r$/, ''));
    if (v) verbetes.push(v);
  }
  return { verbetes, versao };
}

// ── DCP (Dicionário Chinês-Português, fontes LaTeX) ────────────────────────
// \begin{EntryWithPhonetic}{hanzi}{pinyin}[nota]{traços}{radicais}[HSK n][Kangxi n]
//   \definition[classificadores]{classe}{sentido | sentido}[exemplo===tradução | …]
//   \definition*{s.}{…}        ← asterisco = nome próprio
// \end{EntryWithPhonetic}

/** Lê um grupo delimitado a partir de `i` (que aponta para `{` ou `[`),
 *  respeitando aninhamento. Devolve o conteúdo e a posição depois do fecho. */
function grupo(texto: string, i: number): { conteudo: string; fim: number } | null {
  const abre = texto[i];
  const fecha = abre === '{' ? '}' : abre === '[' ? ']' : null;
  if (!fecha) return null;
  let nivel = 0;
  for (let j = i; j < texto.length; j++) {
    if (texto[j] === '\\') {
      j++;
      continue;
    }
    if (texto[j] === abre) nivel++;
    else if (texto[j] === fecha && --nivel === 0) return { conteudo: texto.slice(i + 1, j), fim: j + 1 };
  }
  return null;
}

const pular = (texto: string, i: number) => {
  while (i < texto.length && (texto[i] === ' ' || texto[i] === '\t')) i++;
  return i;
};

/** Grupos `{…}`/`[…]` seguidos, na ordem em que aparecem. */
function grupos(texto: string, i: number): { tipo: '{' | '['; conteudo: string }[] {
  const lidos: { tipo: '{' | '['; conteudo: string }[] = [];
  for (;;) {
    const j = pular(texto, i);
    if (texto[j] !== '{' && texto[j] !== '[') return lidos;
    const g = grupo(texto, j);
    if (!g) return lidos;
    lidos.push({ tipo: texto[j] as '{' | '[', conteudo: g.conteudo });
    i = g.fim;
  }
}

const TRIGRAMAS: Record<string, string> = {
  Heaven: '☰',
  Lake: '☱',
  Fire: '☲',
  Thunder: '☳',
  Wind: '☴',
  Water: '☵',
  Mountain: '☶',
  Earth: '☷',
};

/** Tira a marcação LaTeX do texto de um sentido. */
export function limparLatex(s: string): string {
  return s
    .replace(/\\dpy\{([^}]*)\}/g, (_m, p: string) => pinyinComTons(p))
    .replace(/\\(?:emph|textit|underline)\{([^{}]*)\}/g, '$1')
    .replace(/\\Trigram([A-Za-z]+)\\?/g, (_m, n: string) => TRIGRAMAS[n] ?? '')
    .replace(/\\Yang\\?/g, '⚊')
    .replace(/\\Yin\\?/g, '⚋')
    .replace(/\\dots\\?/g, '…')
    .replace(/\$\+\$/g, '+')
    .replace(/``/g, '“')
    .replace(/''/g, '”')
    .replace(/"-/g, '-')
    .replace(/\\ /g, ' ')
    .replace(/\\([{}%&#_])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parte opcional entre parênteses no hanzi vira duas chaves: 差（一）点儿 se
 * procura como 差点儿 e como 差一点儿. Parêntese sem par (há um no DCP,
 * 接电话）) é erro de digitação: some.
 */
export function expandirOpcional(hanzi: string, pinyin: string): { hanzi: string; pinyin: string }[] {
  const h = /^(.*?)[（(]([^）)]*)[）)](.*)$/.exec(hanzi);
  const p = /^(.*?)\(([^)]*)\)(.*)$/.exec(pinyin);
  if (h && p) {
    return [
      { hanzi: h[1] + h[3], pinyin: p[1] + p[3] },
      { hanzi: h[1] + h[2] + h[3], pinyin: p[1] + p[2] + p[3] },
    ];
  }
  return [{ hanzi: hanzi.replace(/[（）()]/g, ''), pinyin: pinyin.replace(/[()]/g, '') }];
}

function lerDefinicao(
  texto: string,
  i: number,
): { acepcao: Acepcao; classificadores: string[]; exemplos: Verbete['exemplos'] } | null {
  let j = i;
  const proprio = texto[j] === '*';
  if (proprio) j++;
  const gs = grupos(texto, j);
  let k = 0;
  let classificadores: string[] = [];
  if (gs[k]?.tipo === '[') {
    classificadores = gs[k].conteudo
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    k++;
  }
  const classe = gs[k]?.tipo === '{' ? gs[k].conteudo.trim() : null;
  const corpo = gs[k + 1]?.tipo === '{' ? gs[k + 1].conteudo : null;
  if (corpo === null) return null;
  const sentidos = corpo.split('|').map(limparLatex).filter(Boolean);
  const exemplos: Verbete['exemplos'] = [];
  if (gs[k + 2]?.tipo === '[') {
    for (const par of gs[k + 2].conteudo.split('|')) {
      const [origem, pt] = par.split('===');
      if (origem?.trim() && pt?.trim()) exemplos.push({ origem: limparLatex(origem), pt: limparLatex(pt) });
    }
  }
  return { acepcao: { classe: classe || null, sentidos, proprio }, classificadores, exemplos };
}

export function lerDcp(texto: string): Verbete[] {
  const verbetes: Verbete[] = [];
  const INICIO = '\\begin{EntryWithPhonetic}';
  const FIM = '\\end{EntryWithPhonetic}';
  let i = texto.indexOf(INICIO);
  while (i >= 0) {
    const fim = texto.indexOf(FIM, i);
    if (fim < 0) break;
    const bloco = texto.slice(i + INICIO.length, fim);
    i = texto.indexOf(INICIO, fim);

    const cab = grupos(bloco, 0);
    // {hanzi}{pinyin}[nota]?{traços}{radicais}[HSK]?[Kangxi]?
    if (cab.length < 2 || cab[0].tipo !== '{' || cab[1].tipo !== '{') continue;
    const hanziBruto = cab[0].conteudo.trim();
    const pinyinBruto = cab[1].conteudo.trim();
    const nota = cab[2]?.tipo === '[' ? limparLatex(cab[2].conteudo).replace(/^\((.*)\)$/, '$1') : null;
    const hsk = cab.map((g) => /^HSK (.+)$/.exec(g.conteudo.trim())?.[1] ?? null).find(Boolean) ?? null;

    const acepcoes: Acepcao[] = [];
    const classificadores: string[] = [];
    const exemplos: Verbete['exemplos'] = [];
    const DEF = '\\definition';
    for (let d = bloco.indexOf(DEF); d >= 0; d = bloco.indexOf(DEF, d + DEF.length)) {
      const lida = lerDefinicao(bloco, d + DEF.length);
      if (!lida || lida.acepcao.sentidos.length === 0) continue;
      acepcoes.push(lida.acepcao);
      for (const c of lida.classificadores) if (!classificadores.includes(c)) classificadores.push(c);
      exemplos.push(...lida.exemplos);
    }
    // Sem \definition sobram só remissões (伯 bǎi → "ver bó"). A leitura ainda
    // serve para conferir o pinyin da IA, então o verbete fica, com a remissão.
    const remissoes = [
      ...[...bloco.matchAll(/\\variantof\{([^}]*)\}/g)].map((m) => `variante de ${m[1]}`),
      ...[...bloco.matchAll(/\\seeref\{([^}]*)\}/g)].map((m) => `ver ${pinyinComTons(m[1])}`),
    ];
    const notaFinal = [nota, ...(acepcoes.length === 0 ? remissoes : [])].filter(Boolean).join('; ') || null;

    for (const { hanzi, pinyin } of expandirOpcional(hanziBruto, pinyinBruto)) {
      if (!hanzi) continue;
      verbetes.push({
        fonte: 'dcp',
        simplificado: hanzi,
        tradicional: null,
        pinyin,
        leitura: pinyinComTons(pinyin),
        acepcoes,
        classificadores,
        exemplos,
        hsk,
        nota: notaFinal,
      });
    }
  }
  return verbetes;
}
