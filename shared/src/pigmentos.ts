// Camada de pigmento "Tinta & Jade" como dado (docs/tokens-css.md §1).
//
// Por que isto existe em TypeScript, se os tokens já vivem em web/src/estilos.css:
// o EPUB gerado pelo servidor é um alvo de renderização FORA do app (e-reader, sem
// Tailwind e sem estilos.css), e o servidor não pode carregar hex solto — a regra
// de ouro é "nenhum componente usa valor hardcoded". Então o EPUB declara as mesmas
// custom properties a partir daqui e usa só var(--cor-…) nas regras.
//
// estilos.css continua sendo a fonte de verdade da INTERFACE; este objeto é o
// espelho dela para o alvo EPUB. Um teste (exportacao/estilo.test.ts) exige que
// todo hex daqui apareça em estilos.css, para o dia em que alguém mudar um dos dois
// e esquecer o outro.

export interface Pigmentos {
  papel: string;
  'papel-alto': string;
  'papel-fundo': string;
  tinta: string;
  'tinta-2': string;
  linha: string;
  jade: string;
  'jade-forte': string;
  selo: string;
}

export const PIGMENTOS_CLARO: Pigmentos = {
  papel: '#e9eae0',
  'papel-alto': '#f4f3ec',
  'papel-fundo': '#deded3',
  tinta: '#20241e',
  'tinta-2': '#565b4f',
  linha: '#cfcfc0',
  jade: '#2e7a63',
  'jade-forte': '#235f4d',
  selo: '#be3f2b',
};

export const PIGMENTOS_ESCURO: Pigmentos = {
  papel: '#17150f',
  'papel-alto': '#201d16',
  'papel-fundo': '#100e09',
  tinta: '#e9e4d5',
  'tinta-2': '#a09a89',
  linha: '#37332a',
  jade: '#5fb49c',
  'jade-forte': '#7ec8b1',
  selo: '#d66b52',
};

/** Famílias tipográficas (docs/tokens-css.md §"Outras famílias"). */
export const FONTES = {
  display:
    "'Iowan Old Style', 'Palatino Linotype', 'Palatino', 'Book Antiqua', Georgia, 'Times New Roman', serif",
  corpo: "'Iowan Old Style', 'Palatino Linotype', 'Palatino', Georgia, 'Times New Roman', serif",
  zh: "'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'STSong', 'SimSun', serif",
} as const;
