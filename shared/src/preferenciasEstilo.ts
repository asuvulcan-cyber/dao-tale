// Preferências de estilo da obra (doc 08 §12) — a camada entre o núcleo universal
// e o delta em texto livre.
//
// O núcleo responde à pergunta objetiva "como se traduz do chinês para o português
// sem decalque"; o delta responde "o que esta obra tem de particular". No meio
// sobravam escolhas ESTÉTICAS de casa (aspas ou travessão, itálico no pensamento,
// "fizera", nota do tradutor, onomatopeia, público-alvo) que não são nem universais
// nem particularidades: são chaves. Aqui elas viram chaves.
//
// Duas regras governam este arquivo:
//   1. DEFAULT = COMPORTAMENTO DE HOJE. Uma obra existente, sem nada configurado,
//      recebe exatamente as regras que o núcleo antigo lhe dava.
//   2. RENDERIZAÇÃO DETERMINÍSTICA. Mesmas preferências ⇒ mesmos bytes, sempre —
//      é pré-requisito do prompt caching (doc 08 §1). Nada de data, contador ou
//      ordenação dependente de chave de objeto.
//
// Cada chave carrega o BLOCO INTEIRO da sua convenção, nunca meia-regra: o modo
// travessão, por exemplo, muda também o mapeamento de 「」 — deixar essa metade
// para trás produziria texto híbrido.

/** Ponto do núcleo onde o bloco de preferências é inserido (Seção 5). Um núcleo
    sem este marcador ignora as chaves — é o que torna a troca de núcleo reversível.
    Vive aqui, e não no servidor, porque a UI precisa dele para avisar quando as
    chaves não estão valendo. */
export const MARCADOR_PREFERENCIAS = '{{PREFERENCIAS_OBRA}}';

export type ModoDialogo = 'aspas' | 'travessao';
export type MarcaPensamento = 'italico' | 'aspas';
export type TempoPensamento = 'presente' | 'original';
export type PoliticaMaisQuePerfeito = 'evitar' | 'permitir';
export type PoliticaNotas = 'permitir' | 'proibir';
export type PoliticaOnomatopeia = 'adaptar' | 'manter';

export interface PreferenciasEstilo {
  /** Aspas duplas (padrão editorial do app) ou travessão. */
  dialogo: ModoDialogo;
  /** Como o pensamento é marcado — independente do modo de diálogo. */
  pensamento_marca: MarcaPensamento;
  /** Tempo verbal do pensamento: presente sempre, ou o do original. */
  pensamento_tempo: TempoPensamento;
  /** "fizera" liberado ou não. */
  mais_que_perfeito: PoliticaMaisQuePerfeito;
  /** Notas do tradutor no formato `((texto))`. */
  notas_tradutor: PoliticaNotas;
  /** Onomatopeia adaptada ao PT-BR ou mantida em pinyin. */
  onomatopeia: PoliticaOnomatopeia;
  /** Chave de REGISTROS_PREDEFINIDOS ou texto livre descrevendo o público-alvo. */
  registro: string;
}

/** Público-alvo e o que ele implica de vocabulário e conectivo. O default
    reproduz o que estava fixo no cabeçalho do núcleo antigo. */
export const REGISTROS_PREDEFINIDOS: Record<string, string> = {
  'jovem-adulto':
    'público jovem adulto (até 30–40 anos) — vocabulário contemporâneo e conectivos de fala corrente ("mas", "então", "só que", "aí") no lugar de formalismos repetidos ("no entanto", "portanto"); sem gíria datada',
  'adulto-literario':
    'leitor adulto de ficção literária — vocabulário amplo, período longo permitido e conectivos formais aceitos quando o ritmo pedir; sem coloquialismo forçado',
  juvenil:
    'público juvenil — frases mais curtas, vocabulário simples e direto, sem termo raro desnecessário',
};

export const PREFERENCIAS_PADRAO: PreferenciasEstilo = {
  dialogo: 'aspas',
  pensamento_marca: 'italico',
  pensamento_tempo: 'presente',
  mais_que_perfeito: 'evitar',
  notas_tradutor: 'permitir',
  onomatopeia: 'adaptar',
  registro: 'jovem-adulto',
};

const OPCOES = {
  dialogo: ['aspas', 'travessao'],
  pensamento_marca: ['italico', 'aspas'],
  pensamento_tempo: ['presente', 'original'],
  mais_que_perfeito: ['evitar', 'permitir'],
  notas_tradutor: ['permitir', 'proibir'],
  onomatopeia: ['adaptar', 'manter'],
} as const;

/** JSON guardado no banco (ou vindo de um export antigo) → preferências completas.
    Valor ausente, nulo ou desconhecido cai no padrão: nenhuma entrada de banco
    consegue produzir um prompt sem as regras de diálogo. */
export function normalizarPreferencias(bruto: unknown): PreferenciasEstilo {
  const fonte = (typeof bruto === 'string' ? seguroJson(bruto) : bruto) as Record<string, unknown> | null;
  if (!fonte || typeof fonte !== 'object') return { ...PREFERENCIAS_PADRAO };
  const saida = { ...PREFERENCIAS_PADRAO };
  for (const [chave, validas] of Object.entries(OPCOES)) {
    const valor = fonte[chave];
    if (typeof valor === 'string' && (validas as readonly string[]).includes(valor)) {
      (saida as Record<string, string>)[chave] = valor;
    }
  }
  const registro = fonte.registro;
  if (typeof registro === 'string' && registro.trim()) saida.registro = registro.trim();
  return saida;
}

function seguroJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

export function preferenciasSaoPadrao(p: PreferenciasEstilo): boolean {
  return (Object.keys(PREFERENCIAS_PADRAO) as (keyof PreferenciasEstilo)[]).every(
    (k) => p[k] === PREFERENCIAS_PADRAO[k],
  );
}

// ── Renderização ──────────────────────────────────────────────────────────

const DIALOGO: Record<ModoDialogo, string[]> = {
  aspas: [
    '**Diálogo — aspas duplas.** Toda fala vai entre aspas duplas retas (" "), nunca travessão. Aspas asiáticas convertem: 「」 e “” → " " ; 『』 e ‘’ → \' \'.',
    '- O verbo de elocução (*dicendi*: dizer, perguntar, gritar, murmurar) fica sempre em **minúscula** depois da fala.',
    '- Fala terminada em ponto: o ponto vira **vírgula**, dentro das aspas. — `"Não há saída", disse ele.`',
    '- Fala terminada em ? ! …: a pontuação se mantém, sem vírgula. — `"Quem está aí?" perguntou ela.`',
    '- Inciso no meio, com a fala continuando depois: vírgula antes e depois do inciso, cada trecho de fala com suas aspas. — `"Não há saída", disse ele, "e você sabe."`',
    '- Ação que não é elocução (sorrir, virar-se, erguer a espada) não é inciso: a fala fecha com **ponto dentro das aspas** e a ação é frase nova. — `"Fala." Ele sorriu.`',
    '- Não invente quebras de parágrafo: a divisão vem do texto de origem.',
  ],
  travessao: [
    '**Diálogo — travessão.** Toda fala é aberta por travessão (—) seguido de espaço, nunca por aspas. Aspas asiáticas: 「」 que marca fala → travessão; 「」 que marca citação ou termo destacado → aspas duplas retas (" "); 『』 → \' \'.',
    '- O verbo de elocução (*dicendi*: dizer, perguntar, gritar, murmurar) fica sempre em **minúscula** depois do travessão.',
    '- O **ponto final** da fala é absorvido pelo travessão do inciso. — `— Não há saída — disse ele.`',
    '- ? ! … se mantêm, antes do travessão. — `— Quem está aí? — perguntou ela.`',
    '- Inciso no meio, com a fala continuando: fecha com um segundo travessão, e a pontuação que caberia à fala vai **depois** dele. — `— Não há saída — disse ele —, e você sabe.`',
    '- **Regra-mestra:** minúscula depois do travessão = verbo de elocução, e o ponto da fala cai. Maiúscula depois do travessão = ação ou narração independente, e a fala **mantém** o próprio ponto. — `— Não há saída. — Ele deu de ombros.`',
    '- Não invente quebras de parágrafo: a divisão vem do texto de origem.',
  ],
};

// O pensamento não depende do modo de diálogo: mesmo em travessão ele é inline,
// nunca aberto por travessão, então a pontuação do *sentiendi* segue sempre a
// regra "ponto → vírgula".
const PENSAMENTO_MARCA: Record<MarcaPensamento, string> = {
  italico: 'sem aspas, sempre em *itálico*',
  aspas: 'entre aspas duplas retas (" "), sem itálico',
};

const PENSAMENTO_TEMPO: Record<TempoPensamento, string> = {
  presente: ', sempre no **presente** — mesmo que o original narre no passado',
  original: ', mantendo o **tempo verbal do original**',
};

const PENSAMENTO_EXEMPLO: Record<MarcaPensamento, string> = {
  italico: '`*Não há saída*, pensou ele.` / `*O que isso significa?* pensou Lin Feng.`',
  aspas: '`"Não há saída", pensou ele.` / `"O que isso significa?" pensou Lin Feng.`',
};

const MAIS_QUE_PERFEITO: Record<PoliticaMaisQuePerfeito, string> = {
  evitar:
    '**Mais-que-perfeito:** use a forma composta ("tinha feito") ou o perfeito simples ("fez"); evite a forma simples ("fizera"), que soa livresca.',
  permitir:
    '**Mais-que-perfeito:** a forma simples ("fizera", "dissera") é permitida quando o ritmo pedir; alterne com a composta ("tinha feito") sem empilhar.',
};

const NOTAS: Record<PoliticaNotas, string> = {
  permitir:
    '**Notas do tradutor:** permitidas no formato `((texto))`, no ponto exato da ocorrência, e **apenas** para significado linguístico ou folclórico (trocadilho, referência cultural, termo sem equivalente). Proibido interpretar trama ou intenção de personagem, e proibido explicar o que o texto já deixa claro.',
  proibir:
    '**Notas do tradutor:** proibidas. Nada de `((...))`, colchetes, asteriscos explicativos ou pinyin entre parênteses — o que precisar ser entendido se resolve dentro da prosa.',
};

const ONOMATOPEIA: Record<PoliticaOnomatopeia, string> = {
  adaptar:
    '**Onomatopeias:** adapte para o equivalente sonoro natural do PT-BR (*Baque!*, *Bum!*, *Crack!*); nunca deixe o pinyin. Em itálico, isoladas, sem aspas.',
  manter:
    '**Onomatopeias:** mantenha o som do original transliterado em pinyin sem marcas de tom (*Peng!*, *Hong!*), em itálico, isoladas, sem aspas — não substitua por equivalente brasileiro.',
};

/** Título da seção que o núcleo reserva para as preferências (o delta é a 6). */
export const TITULO_SECAO_PREFERENCIAS = '## 5. PREFERÊNCIAS DE ESTILO DESTA OBRA';

/** Preferências → o bloco de markdown que entra no prompt mãe, com cabeçalho.
    Função pura: nada de data, aleatoriedade ou estado. */
export function renderizarPreferencias(prefs: PreferenciasEstilo): string {
  const registro = REGISTROS_PREDEFINIDOS[prefs.registro] ?? prefs.registro;
  const pensamento =
    `**Pensamento:** ${PENSAMENTO_MARCA[prefs.pensamento_marca]}${PENSAMENTO_TEMPO[prefs.pensamento_tempo]}. ` +
    `O verbo de percepção (*sentiendi*: pensar, sentir) vem depois, em minúscula, com a pontuação do inciso: o ponto do pensamento vira vírgula e ? ! … se mantêm. ${PENSAMENTO_EXEMPLO[prefs.pensamento_marca]}`;
  return [
    TITULO_SECAO_PREFERENCIAS,
    '',
    '*(Convenções de casa desta obra. Quando conflitarem com as seções anteriores, valem estas.)*',
    '',
    `**Registro:** prosa para ${registro}.`,
    '',
    ...DIALOGO[prefs.dialogo],
    '',
    pensamento,
    '',
    MAIS_QUE_PERFEITO[prefs.mais_que_perfeito],
    '',
    NOTAS[prefs.notas_tradutor],
    '',
    ONOMATOPEIA[prefs.onomatopeia],
  ].join('\n');
}

/** Rótulos curtos para a UI e para as notas de versão ("Diálogo: travessão"). */
export const ROTULOS_PREFERENCIAS: Record<keyof PreferenciasEstilo, { titulo: string; opcoes: Record<string, string> }> = {
  dialogo: { titulo: 'Diálogo', opcoes: { aspas: 'aspas duplas', travessao: 'travessão' } },
  pensamento_marca: { titulo: 'Pensamento', opcoes: { italico: 'itálico', aspas: 'aspas' } },
  pensamento_tempo: { titulo: 'Tempo do pensamento', opcoes: { presente: 'presente', original: 'do original' } },
  mais_que_perfeito: { titulo: 'Mais-que-perfeito simples', opcoes: { evitar: 'evitar ("fizera")', permitir: 'permitir ("fizera")' } },
  notas_tradutor: { titulo: 'Notas do tradutor (( ))', opcoes: { permitir: 'permitir', proibir: 'proibir' } },
  onomatopeia: { titulo: 'Onomatopeias', opcoes: { adaptar: 'adaptar ao PT-BR', manter: 'manter em pinyin' } },
  registro: {
    titulo: 'Registro / público-alvo',
    opcoes: { 'jovem-adulto': 'jovem adulto (30–40)', 'adulto-literario': 'adulto literário', juvenil: 'juvenil' },
  },
};

/** Diferenças entre duas preferências, em texto curto — vira nota de versão. */
export function descreverMudancas(antes: PreferenciasEstilo, depois: PreferenciasEstilo): string[] {
  const mudancas: string[] = [];
  for (const chave of Object.keys(PREFERENCIAS_PADRAO) as (keyof PreferenciasEstilo)[]) {
    if (antes[chave] === depois[chave]) continue;
    const rotulo = ROTULOS_PREFERENCIAS[chave];
    const de = rotulo.opcoes[antes[chave]] ?? antes[chave];
    const para = rotulo.opcoes[depois[chave]] ?? depois[chave];
    mudancas.push(`${rotulo.titulo}: ${de} → ${para}`);
  }
  return mudancas;
}
