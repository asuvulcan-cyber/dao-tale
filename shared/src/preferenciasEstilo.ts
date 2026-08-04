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
export type PoliticaNomes = 'mesclar' | 'traduzir' | 'pinyin';

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
  /** Nome próprio: traduzir por sentido, transliterar, ou decidir caso a caso
   *  pelo critério sentido/som (o padrão, e o único que serve a wuxia). */
  nomes_proprios: PoliticaNomes;
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
  nomes_proprios: 'mesclar',
  registro: 'jovem-adulto',
};

const OPCOES = {
  dialogo: ['aspas', 'travessao'],
  pensamento_marca: ['italico', 'aspas'],
  pensamento_tempo: ['presente', 'original'],
  mais_que_perfeito: ['evitar', 'permitir'],
  notas_tradutor: ['permitir', 'proibir'],
  onomatopeia: ['adaptar', 'manter'],
  nomes_proprios: ['mesclar', 'traduzir', 'pinyin'],
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

// Nome próprio: o eixo é SENTIDO vs SOM, não gosto.
//
// 中原 é 中 (centro) + 原 (planície): os caracteres descrevem o lugar, e deixá-los
// em pinyin tira do leitor uma informação que o original entrega de graça.
// 疏勒 é transcrição fonética de Kashgar — 疏 ("esparso") e 勒 ("rédea") foram
// escolhidos pelo SOM e não dizem nada sobre o lugar; traduzir inventaria um
// sentido que o original não tem. Daí "Planícies Centrais" e "Shule" na mesma obra
// não serem incoerência, e sim a mesma regra aplicada duas vezes.
//
// O modo `mesclar` é o padrão porque é o único que serve ao gênero — e é também o
// mais difícil de escrever, porque a decisão não é só lexical: depende da
// CATEGORIA (pessoa translitera-se mesmo tendo sentido pleno) e admite forma
// HÍBRIDA dentro de um mesmo nome (金鹏堡 → "Fortaleza do Peng Dourado").
const NOMES: Record<PoliticaNomes, string[]> = {
  mesclar: [
    '**Nomes próprios — decida por sentido ou som, nesta ordem:**',
    '1. **Pessoa** (nome, apelido, forma curta): **sempre em pinyin**, sem tom — `顾慎为` → Gu Shenwei, `欢儿` → Huan\'er. Vale mesmo quando os caracteres têm sentido pleno: em português não se traduz nome de gente.',
    '2. **Lugar, seita, obra citada, técnica, título e cargo:** pergunte se os caracteres DESCREVEM o referente ou se são só transcrição de som.',
    '   - **Descrevem → traduza o sentido.** `中原` (centro + planície) → Planícies Centrais; `北庭` (norte + corte) → Corte do Norte; `独步王` → Rei Incomparável.',
    '   - **São transcrição fonética de um nome estrangeiro → mantenha em pinyin.** `疏勒` (Kashgar) → Shule. Traduzir "esparso" e "rédea" inventaria sentido que o original não tem.',
    '3. **Forma híbrida quando o nome tem classificador:** traduza o classificador e resolva o núcleo pela regra 2. `金鹏堡` → Fortaleza do Peng Dourado; `天山` → Montanhas Celestiais.',
    '4. **Termo de gênero já consagrado em português fica como está:** `江湖` → jianghu, `qi`, `dao`. Não traduza nem explique dentro da prosa.',
    '5. Na dúvida entre os dois, pergunte-se: um leitor chinês recebe uma imagem ao ler este nome? Se sim, traduza. Se o nome só soa, translitere.',
  ],
  traduzir: [
    '**Nomes próprios — traduza tudo o que tiver sentido.** Lugares, seitas, técnicas, títulos e obras citadas vão para o português pelo significado dos caracteres, sem deixar pinyin: `中原` → Planícies Centrais, `江湖` → submundo das artes marciais.',
    '- **Nome de pessoa continua em pinyin** — isto vale em qualquer modo, porque em português não se traduz nome de gente.',
    '- Nome que é pura transcrição fonética (`疏勒` = Kashgar) não tem sentido a traduzir: use a forma consagrada em português, ou o pinyin se não houver. Não invente significado a partir dos caracteres.',
  ],
  pinyin: [
    '**Nomes próprios — mantenha em pinyin**, sem marcas de tom: `中原` → Zhongyuan, `北庭` → Beiting, `疏勒` → Shule, `金鹏堡` → Jinpengbao.',
    '- Vale para pessoa, lugar, seita, técnica e obra citada.',
    '- **Exceção: título e cargo** (`独步王`, `杨师父`) traduzem-se, porque funcionam como substantivo comum na frase e em pinyin virariam ilegíveis.',
    '- Não acrescente glosa nem explicação entre parênteses; o glossário do livro é que dá conta disso.',
  ],
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
    '',
    ...NOMES[prefs.nomes_proprios],
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
  nomes_proprios: {
    titulo: 'Nomes próprios',
    opcoes: { mesclar: 'mesclar (sentido ou som)', traduzir: 'traduzir o que tem sentido', pinyin: 'manter em pinyin' },
  },
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
