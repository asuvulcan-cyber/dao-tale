// Registro de temas: quem é dono de quê (doc 15 §7).
//
// A regra que governa as três camadas do prompt é uma PARTIÇÃO POR TEMA — cada tema
// pertence a exatamente uma camada. Quando duas falam do mesmo tema, quem decide é o
// modelo, e a decisão muda a cada chamada. Esta tabela é o que torna a partição
// verificável, em vez de disciplina que só existe na cabeça de quem escreveu.
//
// OS PADRÕES MIRAM A DECISÃO, NÃO O VOCABULÁRIO. Medido em 2026-08-06 contra o núcleo
// enxuto real: com padrões ingênuos, 6 dos 8 temas de Beta davam zero ocorrência (o Alfa
// está limpo), mas `nomes_proprios` dava três, e as três eram falso positivo de espécies
// diferentes:
//
//   "Alterne apenas entre nome próprio, pronome e sujeito oculto"  → variação elegante,
//                                                                     tema de Alfa
//   "Traduzir ou transliterar é decidido na Seção 5 (Nomes...)"    → remissão a Beta
//   "Nunca deixe a unidade transliterada"                          → unidade de medida,
//                                                                     tema de Alfa
//
// Daí as duas defesas: padrão que reconhece a forma em que a POLÍTICA é enunciada, e
// isenção para linhas de remissão. Não afrouxe nenhum padrão sem repetir as duas
// medições — a negativa (o Alfa distribuído continua limpo) e a positiva (cada variante
// de Beta acende o seu tema). Ambas estão em teste.

export type Camada = 'alfa' | 'beta' | 'delta';

export interface Tema {
  /** Para temas de Beta, é exatamente a chave de PreferenciasEstilo. */
  id: string;
  dono: Camada;
  /** Nome curto, para a mensagem de aviso. */
  titulo: string;
  /** Como o tema se resolve — entra na mensagem de aviso. */
  resolucao: string;
  /** Reconhece o tema em TEXTO CORRIDO. Estrito: mira a decisão, não a palavra. */
  padrao: RegExp;
  /** Reconhece o tema num RÓTULO de regra já normalizado (minúsculo, sem acento,
      sem numeração de seção) — entrada curta, onde falso positivo é improvável e o
      padrão estrito erraria por falta de contexto: o rótulo "notas tradutor" não
      contém o "do" que `padrao` exige. Ausente = usa `padrao`. */
  padraoRotulo?: RegExp;
  /** Entra no FILTRO de `preferenciaQueCobre`, que derruba candidatos em silêncio?
      `false` = só avisa. Ver o comentário de `nomes_proprios`. */
  filtravel: boolean;
}

export interface Ocorrencia {
  tema: Tema;
  /** 1-indexada, para apontar a linha na tela. */
  linha: number;
  /** O texto que casou, com contexto ao redor — é o que torna o aviso julgável
      de um olhar, em vez de uma acusação abstrata. */
  trecho: string;
}

/**
 * Uma linha que ENTREGA o tema a outra camada, ou que CEDE a ela, não está decidindo
 * nada — está fazendo a partição funcionar à vista, e é o oposto de sobreposição.
 *
 * Três formas, e as três apareceram no texto real:
 *
 *   remissão  "Traduzir ou transliterar é decidido na Seção 5 (Nomes próprios)"
 *   ressalva  "…valem estas — exceto o glossário, que é lei acima de todas as camadas"
 *   ressalva  "…no glossário é convenção de verbete e não decide nada aqui" (capitalizacao_titulos)
 *
 * A segunda é a linha que o conserto da hierarquia (doc 15 §6) pôs nos cabeçalhos de
 * Beta e Delta. Sem esta isenção ela acusaria sobreposição de `glossario` em TODA obra —
 * o conserto denunciando a si mesmo. A terceira é o mesmo problema por outra porta: o
 * bloco `norma-pt` de `capitalizacao_titulos` cita "glossário" ao dizer que a caixa de
 * verbete não decide nada — sem esta isenção, o PRÓPRIO default de Beta acusaria
 * sobreposição de `glossario` contra si mesmo em toda obra que não configurar nada
 * (achado ao rodar `relatorioOmega.test.ts` com a chave nova).
 */
const REMISSAO_OU_RESSALVA =
  /decidid[oa] n[ao] Se[çc][ãa]o \d|ver (?:a )?Se[çc][ãa]o \d|Se[çc][ãa]o \d \(|exceto o gloss[áa]rio|gloss[áa]rio .{0,20}convenç[ãa]o de verbete/i;

export const TEMAS: readonly Tema[] = [
  {
    id: 'dialogo',
    dono: 'beta',
    titulo: 'Diálogo',
    resolucao: 'resolve-se pela chave Diálogo (aspas ou travessão)',
    padrao: /travess[ãa]o|aspas duplas|aspas asi[áa]ticas|di[áa]logo|verbo de eloc|dicendi|「」/i,
    padraoRotulo: /dialogo|aspas|travessao/,
    filtravel: true,
  },
  {
    // Vem ANTES de `pensamento_marca` porque o padrão de rótulo dela é mais amplo
    // (`/pensamento/`) e engoliria este. O código antigo tinha só o amplo, e por isso
    // devolvia `pensamento_marca` para rótulos que falavam de tempo verbal — rótulo
    // errado, embora as duas chaves sejam filtradas do mesmo jeito.
    id: 'pensamento_tempo',
    dono: 'beta',
    titulo: 'Tempo do pensamento',
    resolucao: 'resolve-se pela chave Tempo do pensamento (presente ou do original)',
    // `\*{0,2}` porque no Beta renderizado o "presente" vem em negrito markdown.
    padrao:
      /pensamento[^.\n]{0,60}(no \*{0,2}presente|tempo verbal)|(no \*{0,2}presente|tempo verbal)[^.\n]{0,60}pensamento/i,
    padraoRotulo: /pensamento.*(tempo|verbal|presente|passado)/,
    filtravel: true,
  },
  {
    id: 'pensamento_marca',
    dono: 'beta',
    titulo: 'Marcação do pensamento',
    resolucao: 'resolve-se pela chave Pensamento (itálico ou aspas)',
    padrao: /pensamento[^.\n]{0,40}(it[áa]lico|aspas)|(it[áa]lico|aspas)[^.\n]{0,40}pensamento|sentiendi/i,
    padraoRotulo: /pensamento/,
    filtravel: true,
  },
  {
    id: 'mais_que_perfeito',
    dono: 'beta',
    titulo: 'Mais-que-perfeito',
    resolucao: 'resolve-se pela chave Mais-que-perfeito simples',
    padrao: /mais[-\s]que[-\s]perfeito|anterioridade|\bfizera\b|\bdissera\b/i,
    padraoRotulo: /perfeito/,
    filtravel: true,
  },
  {
    id: 'notas_tradutor',
    dono: 'beta',
    titulo: 'Notas do tradutor',
    resolucao: 'resolve-se pela chave Notas do tradutor (( ))',
    padrao: /notas? do tradutor|\(\(/i,
    padraoRotulo: /tradutor|\bnotas?\b/,
    filtravel: true,
  },
  {
    id: 'onomatopeia',
    dono: 'beta',
    titulo: 'Onomatopeias',
    resolucao: 'resolve-se pela chave Onomatopeias',
    padrao: /onomatopeia/i,
    filtravel: true,
  },
  {
    // `filtravel: false` de propósito, pelo MESMO motivo de `nomes_proprios` logo abaixo
    // (doc 15 §7, e a revisão de 2026-08-17 que achou o defeito): a POLÍTICA — norma do
    // português ou sempre maiúscula — é de Beta, mas se UM termo específico deve
    // capitalizar num contexto e não noutro é do glossário (`nota_uso` de um termo
    // `identidade`, ex.: "杀手 → Assassino: só quando for o posto da Fortaleza"). Filtrar
    // aqui descartaria esse candidato legítimo em silêncio — o mesmo risco que manteve
    // `nomes_proprios` fora do filtro.
    //
    // `padrao` mira a forma como a POLÍTICA é enunciada — "capitalização de título(s)"
    // como cabeçalho de regra —, e não qualquer menção solta a "capitalizar"/"maiúscula".
    // Isso importa aqui mais do que nos outros temas de Beta: o Alfa hoje TEM uma linha
    // ("Títulos e cargos exclusivos: sempre capitalizados", Seção 2) que decide este
    // mesmo tema por acidente — é o defeito medido que motivou esta chave — mas ela usa a
    // forma adjetiva ("capitalizados"), nunca o substantivo "capitalização de título"
    // que os dois blocos de Beta usam como cabeçalho. `temasNoTexto(NUCLEO_ENXUTO)`
    // continua limpo enquanto essa linha não muda de forma; o conserto DELA (remeter a
    // Seção 5, como já faz a linha dos locais duas acima) é uma versão nova de núcleo,
    // fora do escopo deste registro — núcleos são imutáveis.
    id: 'capitalizacao_titulos',
    dono: 'beta',
    titulo: 'Capitalização de títulos',
    resolucao: 'a política resolve-se pela chave Capitalização de títulos; o termo específico, pelo glossário (nota_uso)',
    padrao: /capitaliza[çc][ãa]o de t[íi]tulos?/i,
    // Sem acento nas alternativas: `normalizarSecaoRegra` já roda NFD e remove
    // diacríticos antes de testar, então o rótulo normalizado nunca traz í/ú —
    // mesma convenção de `dialogo`/`registro`/`nomes_proprios` acima.
    padraoRotulo: /capitaliza|titulos?.*maiuscul|maiuscul.*titulos?/,
    filtravel: false,
  },
  {
    // `filtravel: false` de propósito. Em `obras.ts` o filtro DERRUBA candidatos a
    // diretriz antes de gastar a chamada paga, e nomes próprios é o caso genuinamente
    // ambíguo do doc 15 §4: a POLÍTICA (traduzir ou transliterar) é chave de Beta, mas o
    // tratamento de UM nome é glossário. Filtrar ali descartaria candidato legítimo em
    // silêncio — exatamente o que este trabalho existe para impedir. No aviso ele entra.
    id: 'nomes_proprios',
    dono: 'beta',
    titulo: 'Nomes próprios',
    resolucao: 'a política resolve-se pela chave Nomes próprios; o nome específico, pelo glossário',
    padrao: /nomes? pr[óo]prios? *[—:]|(?:em|para) pinyin|pinyin, sem|translitera(?:r|ndo) o (?:nome|lugar)/i,
    // `padrao` depende de adjacência ("nome próprios —", "em pinyin") e por isso
    // nunca casa contra um RÓTULO normalizado: normalizarSecaoRegra ordena as
    // palavras alfabeticamente e junta por hífen, o que destrói qualquer sequência
    // de espaços que o padrão exija. Os outros temas multi-palavra de Beta (diálogo,
    // pensamento, registro) já tinham um padraoRotulo por isso; faltava este.
    //
    // SEM `translitera` solto: "unidade transliterada" é o falso positivo medido em
    // 2026-08-06 (comentário do topo deste arquivo) para o `padrao` de texto corrido —
    // um `padraoRotulo` com `translitera` solto reabre a MESMA ferida pelo outro
    // caminho, casando "unidade-transliterada", "decalque-transliterado" e
    // "termo-novo-transliterado", todos de temas de Alfa que vêm depois deste no
    // array. `pinyin` sozinho já cobre os casos reais de rótulo desta chave.
    padraoRotulo: /nomes?-?proprios?|pinyin/,
    filtravel: false,
  },
  {
    // `\bregistro\b` e não `/registro/`: "registre como termo novo" e "registrar" são do
    // glossário, tema de Alfa. E nada de `/leitor/` solto — o Alfa diz "o que um leitor
    // brasileiro sente" ao falar de unidades de medida, e casaria.
    id: 'registro',
    dono: 'beta',
    titulo: 'Registro / público-alvo',
    resolucao: 'resolve-se pela chave Registro / público-alvo',
    padrao: /\bregistro\b|p[úu]blico[-\s]?alvo|leitor de webnovel|p[úu]blico juvenil/i,
    padraoRotulo: /registro|publico|leitor/,
    filtravel: true,
  },
  {
    id: 'glossario',
    dono: 'alfa',
    titulo: 'Glossário',
    resolucao: 'o glossário é lei acima de todas as camadas; termos entram pelo glossário da obra',
    padrao: /gloss[áa]rio|termos? novos?/i,
    // O `padrao` já tentava reconhecer "termos novos" — mas exige a ordem e o espaço
    // exatos, que `normalizarSecaoRegra` nunca preserva (ordena as palavras e junta
    // por hífen). Achado da revisão da Task 6: sem este padraoRotulo, um rótulo como
    // "termo-novo-transliterado" (normaliza para "novo-termo-transliterado") não
    // reconhecia glossario — e como nada mais no registro reconhecia esse rótulo
    // também, ele caía em null em vez de alfa.
    padraoRotulo: /\bglossario\b|\bnovos?\b.*\btermos?\b/,
    filtravel: false,
  },
  {
    id: 'unidades',
    dono: 'alfa',
    titulo: 'Unidades de medida',
    resolucao: 'vive no Alfa: a conversão zh→pt-BR é objetiva e vale para qualquer obra',
    padrao: /unidades? de medida|时辰|\b里\b|\b丈\b|\b斤\b|tael/i,
    // Mesmo achado: "unidade-transliterada" é vocabulário legítimo do tema (é a
    // própria frase medida no cabeçalho deste arquivo), mas `padrao` exige "de
    // medida" junto, que a normalização derruba. `\bunidades?\b` sozinho já basta —
    // é palavra de domínio específica deste registro, sem colisão com outro tema.
    padraoRotulo: /\bunidades?\b/,
    filtravel: false,
  },
  {
    id: 'demonstrativos',
    dono: 'alfa',
    titulo: 'Demonstrativos (这 / 那)',
    resolucao: 'vive no Alfa: o teste da deleção e a linha dura do "aquele"',
    padrao: /demonstrativo|这|那样|teste da dele[çc][ãa]o/i,
    filtravel: false,
  },
  {
    id: 'decalque',
    dono: 'alfa',
    titulo: 'Decalque do chinês',
    resolucao: 'vive no Alfa: 对方, 开口, chengyu, partículas polissêmicas',
    padrao: /decalque|chengyu|part[íi]culas? poliss[êe]mica|对方|开口/i,
    filtravel: false,
  },
];

/** Todos os temas reconhecidos no texto, com a linha e o trecho que casaram.
    Linha que só faz remissão a outra camada é isenta. Função pura. */
export function temasNoTexto(texto: string): Ocorrencia[] {
  const achados: Ocorrencia[] = [];
  texto.split('\n').forEach((linha, n) => {
    if (REMISSAO_OU_RESSALVA.test(linha)) return;
    for (const tema of TEMAS) {
      const m = linha.match(tema.padrao);
      if (!m || m.index === undefined) continue;
      achados.push({
        tema,
        linha: n + 1,
        trecho: linha.slice(Math.max(0, m.index - 40), m.index + 60).trim(),
      });
    }
  });
  return achados;
}
