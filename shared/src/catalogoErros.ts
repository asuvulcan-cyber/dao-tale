// Catálogo de erros comuns de tradução zh→pt-BR — vale para qualquer obra, ao
// contrário do glossário (que é por obra) e das preferências de estilo (que são
// escolha do revisor). Ver docs/superpowers/specs/2026-08-10-catalogo-erros-zh-pt-design.md.
//
// A REGRA QUE GOVERNA ESTA LISTA: uma entrada só existe com número medido. O
// número é a precisão no corpus real — frases que o detector acusaria no texto
// que a IA produziu e que DEIXARAM de ser acusadas no texto final, ou seja,
// casos em que o revisor, sem ser avisado por ninguém, corrigiu exatamente
// aquilo. É conservador na direção certa: subestima (o revisor pode ter deixado
// passar), nunca superestima.
//
// A tabela de nove partículas do prompt completo foi medida assim em 2026-08-10
// contra a obra 1 (561 frases traduzidas) e reprovou inteira menos uma linha:
// das 85 frases que ela acusaria, o revisor tinha mudado 5. As reprovadas ficam
// em REPROVADAS, com a medição ao lado — apagá-las faria alguém repropor
// `都 → todos` de boa-fé em três meses e refazer a medição do zero.

/** O que sustenta uma entrada. Sem isto ela não pode estar em CATALOGO. */
export interface AfericaoCatalogo {
  obra_id: number;
  /** Frases acusadas no `texto_pt_original_ia`. */
  acusadas: number;
  /** Dessas, quantas o revisor já tinha consertado por conta própria. */
  corrigidas: number;
  /** ISO curto (YYYY-MM-DD) de quando a aferição rodou. */
  em: string;
}

export interface EntradaCatalogo {
  /** kebab-case estável. Vira o `regra` da violação — e a trinca de dispensa
   *  guardada no banco depende dele, então renomear um id é migração. */
  id: string;
  /** Rótulo curto para a tela. */
  titulo: string;
  /** O gatilho no ORIGINAL. A regra só dispara quando ele está no chinês — é o
   *  que separa este detector de `analisarEstilo`, que nunca vê o zh. */
  gatilho_zh: string;
  /** O reflexo errado no português. NUNCA com a flag `g`: o mesmo objeto é
   *  reusado em todas as frases e `lastIndex` sobreviveria entre elas. */
  evitar_pt: RegExp;
  /** O que é certo, em uma frase. Entregue no ponto do uso (dentro do passe de
   *  estilo), não no prompt de tradução. */
  certo: string;
  aferido: AfericaoCatalogo;
}

/** Piso de precisão. Abaixo disto o revisor aprende a ignorar a lista, que é o
 *  mesmo modo de falha da varredura de consistência com falso positivo. */
export const PRECISAO_MINIMA = 0.5;

/** Piso de amostra. Sem ele, uma única ocorrência corrigida entra com 100% de
 *  "precisão" e o critério deixa de ser critério. */
export const AMOSTRA_MINIMA = 3;

export const precisaoAferida = (a: AfericaoCatalogo): number =>
  a.acusadas === 0 ? 0 : a.corrigidas / a.acusadas;

/** O portão que uma entrada tem de passar para existir em CATALOGO. Função, e
 *  não expressão solta no teste, porque o teste do catálogo real é
 *  auto-referente por natureza — ele só sabe comparar contra as constantes
 *  correntes. Com dados sintéticos aqui, baixar um piso vira teste vermelho. */
export function entradaAprovada(a: AfericaoCatalogo): boolean {
  return a.acusadas >= AMOSTRA_MINIMA && precisaoAferida(a) >= PRECISAO_MINIMA;
}

export const CATALOGO: readonly EntradaCatalogo[] = [
  {
    id: 'particula-yizhi',
    titulo: '一直 traduzido como "sempre"',
    gatilho_zh: '一直',
    evitar_pt: /\bsempre\b/i,
    certo:
      '一直 é continuidade ininterrupta até aquele momento — "até então", "vinha …ndo", ' +
      '"esse tempo todo". "Sempre" é a glosa de 总, que é impressão abstrata e atemporal; ' +
      'confundir os dois foi o que produziu vereditos opostos para a mesma frase (casos #23/#24).',
    aferido: { obra_id: 1, acusadas: 4, corrigidas: 3, em: '2026-08-10' },
  },
];

/** Medidas e reprovadas. Ficam aqui para ninguém repropor de boa-fé. */
export const REPROVADAS: readonly (EntradaCatalogo & { motivo: string })[] = [
  {
    id: 'particula-hai',
    titulo: '还 traduzido como "ainda"',
    gatilho_zh: '还',
    evitar_pt: /\bainda\b/i,
    certo: '还 pode ser indignação ("ainda por cima") ou comparativo, não só continuidade.',
    aferido: { obra_id: 1, acusadas: 34, corrigidas: 1, em: '2026-08-10' },
    motivo: 'O maior emissor de alarme da tabela e o menos útil: "ainda" é a tradução certa quase sempre.',
  },
  {
    id: 'particula-dou',
    titulo: '都 traduzido como "todos"',
    gatilho_zh: '都',
    evitar_pt: /\btodos\b|\btudo\b/i,
    certo: '都 pode ser intensificador de surpresa ("até", "nem mesmo"), não só totalidade.',
    aferido: { obra_id: 1, acusadas: 31, corrigidas: 0, em: '2026-08-10' },
    motivo: '31 alarmes, zero correções. O revisor não tocou em nenhum.',
  },
  {
    id: 'particula-zong',
    titulo: '总 traduzido como "sempre"',
    gatilho_zh: '总',
    evitar_pt: /\bsempre\b/i,
    certo: '总 é sensação persistente ou inevitabilidade; "sempre" só quando a recorrência é real.',
    aferido: { obra_id: 1, acusadas: 12, corrigidas: 1, em: '2026-08-10' },
    motivo: 'Justamente o par de 一直 — e aqui "sempre" é o acerto, não o erro.',
  },
  {
    id: 'particula-cai',
    titulo: '才 traduzido como "só então"',
    gatilho_zh: '才',
    evitar_pt: /\bs[óo] ent[ãa]o\b/i,
    certo: '才 marca demora, alívio ou condição necessária; "só então" neutro é reflexo.',
    aferido: { obra_id: 1, acusadas: 2, corrigidas: 0, em: '2026-08-10' },
    motivo: 'Zero correções, e amostra abaixo do piso — nem daria para decidir.',
  },
  {
    id: 'particula-you',
    titulo: '又 traduzido como "de novo"',
    gatilho_zh: '又',
    evitar_pt: /\bde novo\b/i,
    certo: '又 pode ser contradição ou concessão (又…又…), não só repetição.',
    aferido: { obra_id: 1, acusadas: 2, corrigidas: 0, em: '2026-08-10' },
    motivo: 'Zero correções, e amostra abaixo do piso.',
  },
];
