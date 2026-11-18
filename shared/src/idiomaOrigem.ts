// Perfil de idioma de origem — a metade PURA, que a interface e o servidor
// enxergam. A outra metade (segmentador, Alfa semente, detectores, simulado)
// vive em server/src/idiomas, porque depende de coisas que não cabem aqui. As
// duas juntas são o perfil; a regra é que nenhuma decisão de idioma more fora
// delas.
//
// O aplicativo nasceu só com mandarim e por isso nunca precisou dizer isso em
// lugar nenhum: o idioma estava ASSUMIDO em ~15 pontos, cada um decidindo do
// seu jeito — quatro regexes Han com faixas diferentes, substring CJK no
// casamento de glossário, pontuação CJK na segmentação. Este arquivo é o lugar
// onde essas decisões passam a ser ditas uma vez.
//
// O perfil é ORTOGONAL às camadas do prompt (doc 15): não é uma camada nova —
// ele seleciona qual Alfa vale, do mesmo jeito que a obra seleciona seu Delta.

export const IDIOMAS_ORIGEM = ['zh', 'en'] as const;
export type IdiomaOrigem = (typeof IDIOMAS_ORIGEM)[number];

/** Idioma de toda obra que existia antes dos perfis. É o default da coluna
 *  `obras.idioma_origem` e o fallback de todo ponto que recebe um valor solto. */
export const IDIOMA_ORIGEM_PADRAO: IdiomaOrigem = 'zh';

export interface PerfilIdioma {
  id: IdiomaOrigem;
  /** Nome na tela: "Mandarim", "Inglês". */
  rotulo: string;
  /** Prefixo das linhas de original no prompt ("ZH:", "EN:"). */
  sigla: string;
  /** `lang=` do texto de origem no EPUB. O idioma de DESTINO continua pt-BR. */
  bcp47: string;
  /** Tipografia do texto de origem, como valores de variável CSS.
   *
   *  São variáveis, e não uma classe por idioma, porque `.texto-zh` aparece em
   *  ~30 pontos de quinze arquivos. A classe continua uma só e lê
   *  `var(--fonte-origem)`; quem define a variável é o container da obra, e a
   *  herança do CSS resolve os trinta sítios de uma vez. Trocar a classe em cada
   *  um deles daria o mesmo resultado com trinta chances de esquecer um. */
  tipografia: { fonte: string; entrelinha: string };

  /** Remonta um parágrafo a partir das frases da origem. O mandarim não usa
   *  espaço entre frases (a pontuação já separa); o inglês usa. */
  juntarFrases(frases: string[]): string;

  /** "Este campo está no idioma de origem, logo precisa ser traduzido?" — é o
   *  que decide se o botão de traduzir título/sinopse aparece. */
  ehDaOrigem(texto: string): boolean;

  /** Termo curto demais para ser procurado sem encher a tela de falso positivo. */
  termoCurtoDemais(termo: string): boolean;

  /** O termo de glossário aparece neste texto de origem? */
  casaTermo(fonte: string, termo: string): boolean;

  /** Um termo contém outro? Serve ao descarte do termo já coberto por um mais
   *  longo também presente na frase. */
  termoContem(maior: string, menor: string): boolean;
}

// ── Mandarim ───────────────────────────────────────────────────────────────

/** Faixa Han. Antes dos perfis havia QUATRO testes de "isto é chinês" com
 *  faixas diferentes — `一-鿿` (U+4E00) na interface e em mock.ts, `㐀-鿿`
 *  (U+3400) em revisao/literaria.ts. Unificadas na mais larga, que é a correta:
 *  U+3400–U+4DBF é a Extensão A, ideogramas raros mas legítimos, e a faixa
 *  estreita os classificava como "não é chinês". */
export const FAIXA_HAN = /[㐀-鿿]/u;

export const PERFIL_MANDARIM: PerfilIdioma = {
  id: 'zh',
  rotulo: 'Mandarim',
  sigla: 'ZH',
  bcp47: 'zh-Hans',
  // Entrelinha 1.9 é calibrada para a altura do glifo Han.
  tipografia: { fonte: "var(--fonte-zh)", entrelinha: '1.9' },
  juntarFrases: (frases) => frases.join(''),
  ehDaOrigem: (texto) => FAIXA_HAN.test(texto),
  // Termo de 1 caractere aparece dentro de dezenas de palavras comuns.
  termoCurtoDemais: (termo) => [...termo].length < 2,
  casaTermo: (fonte, termo) => fonte.includes(termo),
  termoContem: (maior, menor) => maior.includes(menor),
};

// ── Inglês ─────────────────────────────────────────────────────────────────

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Casamento por limite de PALAVRA. É a diferença que não podia ser ignorada:
 *  `includes` do mandarim, aplicado ao inglês, acha "art" dentro de "start" e
 *  "go" dentro de "good" — o detector de consistência acusaria a obra inteira.
 *  Insensível à caixa de propósito: o termo aparece capitalizado em início de
 *  frase sem deixar de ser o mesmo termo, e aqui o que importa é recall. */
function casaPalavraEn(fonte: string, termo: string): boolean {
  const alvo = termo.trim();
  if (!alvo) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaparRegex(alvo)}(?![\\p{L}\\p{N}])`, 'iu').test(fonte);
}

export const PERFIL_INGLES: PerfilIdioma = {
  id: 'en',
  rotulo: 'Inglês',
  sigla: 'EN',
  bcp47: 'en',
  // A pilha CJK e a entrelinha larga deixam texto latino frouxo e com serifa
  // errada; o inglês usa o corpo de leitura do aplicativo.
  tipografia: { fonte: "var(--fonte-corpo)", entrelinha: '1.6' },
  juntarFrases: (frases) => frases.join(' '),
  // Português e inglês dividem o alfabeto latino: não há heurística honesta que
  // distinga "o original ainda não foi traduzido" de "já está em português".
  // Quem decide é quem colou o texto — o botão aparece com o campo preenchido.
  ehDaOrigem: (texto) => texto.trim().length > 0,
  // O limite de palavra já resolve o falso positivo por substring, então aqui
  // só sai o que não é termo nenhum. "Qi" tem 2 caracteres e é legítimo.
  termoCurtoDemais: (termo) => termo.trim().length < 2,
  casaTermo: casaPalavraEn,
  termoContem: (maior, menor) => casaPalavraEn(maior, menor),
};

// ── Registro ───────────────────────────────────────────────────────────────

export const PERFIS_IDIOMA: Record<IdiomaOrigem, PerfilIdioma> = {
  zh: PERFIL_MANDARIM,
  en: PERFIL_INGLES,
};

export function ehIdiomaOrigem(valor: unknown): valor is IdiomaOrigem {
  return typeof valor === 'string' && (IDIOMAS_ORIGEM as readonly string[]).includes(valor);
}

/** Perfil de um idioma, tolerante a valor solto vindo do banco ou da API: o que
 *  não for reconhecido cai no mandarim, que é o que toda obra anterior é. */
export function perfilDe(idioma: string | null | undefined): PerfilIdioma {
  return ehIdiomaOrigem(idioma) ? PERFIS_IDIOMA[idioma] : PERFIS_IDIOMA[IDIOMA_ORIGEM_PADRAO];
}

/** As variáveis que `.texto-zh` lê, prontas para o atributo `style` de um
 *  container. Tudo que estiver dentro dele renderiza o original na tipografia
 *  deste perfil, sem precisar saber que perfis existem. */
export function estiloDoOriginal(perfil: PerfilIdioma): Record<string, string> {
  return {
    '--fonte-origem': perfil.tipografia.fonte,
    '--entrelinha-origem': perfil.tipografia.entrelinha,
  };
}
