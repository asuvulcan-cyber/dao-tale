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
/** Marcadores opt-in do Alfa antidiuluição. O marcador legado continua intacto:
 * versões antigas recompõem os mesmos bytes e preservam a trilha histórica. */
export const MARCADOR_PREFERENCIAS_COMPACTAS = '{{PREFERENCIAS_OBRA_COMPACTAS}}';
export const MARCADOR_CHECKLIST_FINAL = '{{CHECKLIST_FINAL}}';
/** Marcadores versionados: uma nova regra não muda os bytes de Alfas históricos. */
export const MARCADOR_PREFERENCIAS_COMPACTAS_V2 = '{{PREFERENCIAS_OBRA_COMPACTAS_V2}}';
export const MARCADOR_CHECKLIST_FINAL_V2 = '{{CHECKLIST_FINAL_V2}}';
export const MARCADOR_PREFERENCIAS_COMPACTAS_V3 = '{{PREFERENCIAS_OBRA_COMPACTAS_V3}}';
export const MARCADOR_CHECKLIST_FINAL_V3 = '{{CHECKLIST_FINAL_V3}}';
/** Beta curta v4: só a anterioridade muda (ver renderizarPreferenciasCompactasV4). */
export const MARCADOR_PREFERENCIAS_COMPACTAS_V4 = '{{PREFERENCIAS_OBRA_COMPACTAS_V4}}';
/** Marcadores do perfil inglês. São próprios, e não uma v4, para `comporOmega`
 *  ganhar só mais um par de `replace` em vez de ramificar por idioma — e para
 *  nenhum byte dos Alfas mandarins históricos precisar mudar. */
export const MARCADOR_PREFERENCIAS_COMPACTAS_EN = '{{PREFERENCIAS_OBRA_EN}}';
export const MARCADOR_CHECKLIST_FINAL_EN = '{{CHECKLIST_FINAL_EN}}';

export type ModoDialogo = 'aspas' | 'travessao';
export type MarcaPensamento = 'italico' | 'aspas';
export type TempoPensamento = 'presente' | 'original';
export type PoliticaMaisQuePerfeito = 'evitar' | 'permitir';
export type PoliticaNotas = 'permitir' | 'proibir';
export type PoliticaOnomatopeia = 'adaptar' | 'manter';
export type PoliticaNomes = 'mesclar' | 'traduzir' | 'pinyin';
export type PoliticaCapitalizacao = 'norma-pt' | 'titulos-maiusculos';

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
  /** Capitalização de título, cargo e forma de tratamento: decidir por QUEM a
   *  palavra aponta vs O QUE ela diz (a norma do português), ou capitalizar
   *  sempre (convenção comum em wuxia traduzido). Ver o comentário do padrão
   *  em `PREFERENCIAS_PADRAO` — é a única chave desta obra cujo default não
   *  reproduz o comportamento antigo. */
  capitalizacao_titulos: PoliticaCapitalizacao;
  /** Chave de REGISTROS_PREDEFINIDOS ou texto livre descrevendo o público-alvo. */
  registro: string;
}

/** Público-alvo e o que ele implica de vocabulário e conectivo. O default
    reproduz o que estava fixo no cabeçalho do núcleo antigo. */
export const REGISTROS_PREDEFINIDOS: Record<string, string> = {
  // O público de webnovel traduzida tem NÚCLEO em 18–25 anos; 30–40 é a cauda,
  // não o alvo. Descrever o limite superior como se fosse o leitor médio puxava
  // o texto para um registro mais formal do que o gênero pede.
  'jovem-adulto':
    'leitor de webnovel — núcleo de 18 a 25 anos, lendo em série no celular. Período curto a médio e ritmo rápido; ' +
    'vocabulário contemporâneo, com os conectivos da fala ("mas", "só que", "então", "aí") no lugar dos formais repetidos ' +
    '("no entanto", "portanto", "outrossim"); termo de gênero preservado (jianghu, qi, dao), que este leitor já conhece e prefere. ' +
    'NÃO simplifique nem explique demais: é leitor voraz do gênero, e o que ele cobra é consistência de nomes e termos, não facilidade. ' +
    'Gíria: só onde o ORIGINAL é gíria, e sempre a de uso corrente; na dúvida entre uma gíria e a forma neutra, escolha a neutra',
  'adulto-literario':
    'leitor adulto de ficção literária — vocabulário amplo, período longo permitido e conectivos formais aceitos quando o ritmo pedir; sem coloquialismo forçado',
  juvenil:
    'público juvenil (12–16) — frases curtas, vocabulário simples e direto, sem termo raro desnecessário; o que for violento ou adulto no original permanece, só a linguagem é que é acessível',
};

export const PREFERENCIAS_PADRAO: PreferenciasEstilo = {
  dialogo: 'aspas',
  pensamento_marca: 'italico',
  pensamento_tempo: 'presente',
  mais_que_perfeito: 'evitar',
  notas_tradutor: 'permitir',
  onomatopeia: 'adaptar',
  nomes_proprios: 'mesclar',
  // EXCEÇÃO DELIBERADA à regra 1 do topo deste arquivo (default = comportamento
  // de hoje). O núcleo mandava "títulos e cargos exclusivos: sempre
  // capitalizados" — regra fixa, sem distinguir se a palavra aponta QUEM ou diz
  // O QUÊ — e a medição na obra real deu 46 maiúsculas contra 49 minúsculas
  // para a MESMA palavra, sem nenhuma correlação com o chinês: é ruído de
  // aplicação, não uma convenção que alguém escolheu. Manter isso como padrão
  // preservaria o defeito medido, não um comportamento de casa. Por isso
  // `norma-pt` é o padrão aqui, e não `titulos-maiusculos` (que reproduziria a
  // regra antiga); quem quer o "sempre maiúscula" do wuxia pede por ele.
  capitalizacao_titulos: 'norma-pt',
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
  capitalizacao_titulos: ['norma-pt', 'titulos-maiusculos'],
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
    '- Fala terminada em ponto: o ponto **desaparece** e a vírgula do inciso vai **depois** das aspas de fechamento — ela pertence à frase que emoldura, não à fala. — `"Não há saída", disse ele.` (nunca `"Não há saída," disse ele.`, que é convenção do inglês)',
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

// Regra de PROCEDIMENTO, não de proibição. A versão anterior dizia "evite a
// forma simples" e enterrava a melhor saída (o perfeito simples) no meio da
// frase: no capítulo 2 da 死人经 deu 11,7% de violação, toda em trecho denso de
// anterioridade. Proibição diz o que não fazer; ordem de escolha diz o que fazer.
// A ordem importa: converter tudo para "tinha + particípio" empilha perífrase e
// produz prosa PIOR que a violação — daí o perfeito simples vir primeiro.
//
// O gatilho pelo CHINÊS no passo 1 saiu da medição do capítulo 3 da 死人经:
// frase cujo ZH traz marcador lexical de anterioridade (曾经/已经/从来/向来/从小)
// violava a 41%, contra 13% nas demais — três vezes mais. Ou seja, o ponto em
// que o passo 1 mais se aplica era justamente onde ele mais falhava: o chinês
// marca a anterioridade no advérbio e o modelo marcava DE NOVO no verbo. Dizer
// "quando um advérbio já marcar" pede um julgamento sobre o português pronto;
// nomear os marcadores do original vira reconhecimento de padrão na fonte.
//
// O passo 3 descreve a forma proibida pelo SUFIXO em vez de citar verbos. A
// versão anterior citava `aprendera`, `fizera`, `dissera`, `estivera` — e numa
// varredura de 22 modelos (5 provedores, 6 famílias sem parentesco) rodando o
// mesmo trecho, 20 produziram justamente `dissera`. Duas leituras possíveis:
// citar a palavra a planta, ou `dissera` é só o mais-que-perfeito sintético mais
// frequente do português e aflora sozinho. Descrever sem nomear separa as duas.
const MAIS_QUE_PERFEITO: Record<PoliticaMaisQuePerfeito, string> = {
  evitar: [
    '**Anterioridade (o "mais-que-perfeito"):** quando a frase narra algo ANTERIOR ao momento da cena, escolha nesta ordem:',
    '1. **Perfeito simples**, sempre que um advérbio ou o próprio contexto já marquem a anterioridade — `nunca aprendeu esgrima`, `treinou anos antes disso`. É a forma mais curta e mais natural: prefira-a sempre que couber.',
    '   **Gatilho no original:** se o chinês trouxer 曾经, 已经, 从来(没), 向来, 从小, 自幼, 早已 ou o aspecto 过, a anterioridade **já está** no advérbio português que os traduz (`certa vez`, `já`, `nunca`, `sempre`, `desde pequeno`) — então o verbo vai no perfeito simples e **não** se marca de novo. `从来没关心过` → `nunca se importou`, nunca `nunca se importara`.',
    '2. **"tinha" ou "havia" + particípio**, quando a anterioridade precisa mesmo ser explicitada — `tinha aprendido com o pai`, `havia herdado o temperamento`. **Alterne os dois auxiliares:** três "tinha" seguidos pesam mais do que a forma que eles substituem.',
    '3. **Nunca a forma simples** — a de uma palavra só, terminada em *-ara*, *-era* ou *-ira*. Soa livresca e destoa do registro desta obra.',
    'Num trecho denso em passado anterior (contar o treino, a origem, o que ficou para trás), resolva a maioria no perfeito simples e reserve a perífrase para onde a anterioridade for o ponto da frase.',
  ].join('\n'),
  permitir: [
    '**Anterioridade (o "mais-que-perfeito"):** as três formas estão liberadas — perfeito simples (`aprendeu`), composta (`tinha/havia aprendido`) e simples (`aprendera`).',
    'Escolha pelo ritmo, sem empilhar a mesma: alterne, e prefira o perfeito simples quando o contexto já marcar a anterioridade.',
  ].join('\n'),
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
// HÍBRIDA dentro de um mesmo nome (少林寺 → "Templo Shaolin").
//
// APELIDO NÃO É NOME DE GENTE — a regra 1 dizia "Pessoa (nome, apelido, forma curta):
// sempre em pinyin" e a regra do desempate mandava traduzir o que dá imagem ao leitor.
// As duas se contradiziam exatamente em cima do apelido, que é escolhido PELA imagem.
// Na 死人经 o resultado foi 飞鹰 revisado para "Feiying" com base na regra 1, contra a
// prática que a própria obra já tinha (独步王 → Rei Incomparável, 老虎 → "tigre") e contra
// o que a IA produzira sozinha ("Águia"). Apelido agora cai na regra de título; o nome de
// nascimento continua em pinyin, e o desempate declara que não vale para ele.
const NOMES: Record<PoliticaNomes, string[]> = {
  mesclar: [
    '**Nomes próprios — decida por sentido ou som, nesta ordem:**',
    '1. **Pessoa — o nome de nascimento e suas formas curtas:** **sempre em pinyin**, sem tom — `铁心` → Tie Xin, `小青` → Xiao Qing. Vale mesmo quando os caracteres têm sentido pleno: em português não se traduz nome de gente.',
    '2. **Apelido, epíteto ou hao — o nome que a história DÁ a alguém:** resolva pela regra 3, como título. Ele foi escolhido pela imagem que evoca, e é essa imagem que o leitor do original recebe: `飞鹰` → Águia Voadora, nunca "Feiying". O contraste com a regra 1 é o ponto: `铁心` carrega sentido igual, mas é nome de nascimento e fica Tie Xin.',
    '3. **Lugar, seita, obra citada, técnica, título e cargo:** pergunte se os caracteres DESCREVEM o referente ou se são só transcrição de som.',
    '   - **Descrevem → traduza o sentido.** `中原` (centro + planície) → Planícies Centrais; `北庭` (norte + corte) → Corte do Norte; `天刀` → Sabre Celeste.',
    '   - **São transcrição fonética de um nome estrangeiro → mantenha em pinyin.** `疏勒` (Kashgar) → Shule. Traduzir "esparso" e "rédea" inventaria sentido que o original não tem.',
    '4. **Forma híbrida quando o nome tem classificador:** traduza o classificador e resolva o núcleo pela regra 3. `少林寺` → Templo Shaolin; `天山` → Montanhas Celestiais.',
    '5. **Termo de gênero já consagrado em português fica como está:** `江湖` → jianghu, `qi`, `dao`. Não traduza nem explique dentro da prosa.',
    '6. **Desempate — vale para as regras 2 e 3, nunca para a 1:** um leitor chinês recebe uma imagem ao ler este nome? Se sim, traduza. Se o nome só soa, translitere.',
  ],
  traduzir: [
    '**Nomes próprios — traduza tudo o que tiver sentido.** Lugares, seitas, técnicas, títulos e obras citadas vão para o português pelo significado dos caracteres, sem deixar pinyin: `中原` → Planícies Centrais, `江湖` → submundo das artes marciais.',
    '- **Nome de pessoa continua em pinyin** — isto vale em qualquer modo, porque em português não se traduz nome de gente.',
    '- Nome que é pura transcrição fonética (`疏勒` = Kashgar) não tem sentido a traduzir: use a forma consagrada em português, ou o pinyin se não houver. Não invente significado a partir dos caracteres.',
  ],
  pinyin: [
    '**Nomes próprios — mantenha em pinyin**, sem marcas de tom: `中原` → Zhongyuan, `北庭` → Beiting, `疏勒` → Shule, `少林寺` → Shaolinsi.',
    '- Vale para pessoa, lugar, seita, técnica e obra citada.',
    '- **Exceção: título e cargo** (`独步王`, `杨师父`) traduzem-se, porque funcionam como substantivo comum na frase e em pinyin virariam ilegíveis.',
    '- Não acrescente glosa nem explicação entre parênteses; o glossário do livro é que dá conta disso.',
  ],
};

// Capitalização de título/cargo/tratamento: o eixo é se a palavra aponta QUEM
// ou diz O QUÊ, não "é título, logo maiúscula" — esse padrão fixo foi
// justamente o defeito medido (ver o comentário do default em
// `PREFERENCIAS_PADRAO`). A convenção de verbete do glossário é outra coisa e
// não decide nada aqui: um termo pode entrar catalogado com maiúscula e ainda
// assim ir minúsculo numa ocorrência predicativa ("virou assassino").
const CAPITALIZACAO: Record<PoliticaCapitalizacao, string> = {
  'norma-pt': [
    '**Capitalização de títulos, cargos e formas de tratamento:** a pergunta é se a palavra aponta QUEM ou diz O QUÊ.',
    '1. **Maiúscula no chamado direto:** "Sim, Jovem Mestre.", "Mestre Yang!".',
    '2. **Maiúscula quando o termo substitui o nome de uma pessoa determinada**, como se fosse nome próprio: "o Patriarca ergueu a mão", "a Senhorita mandou chamar".',
    '3. **Minúscula em todo o resto** — antes de nome próprio ("o mestre Yang"), no predicativo ("virou assassino", "aprendiz de assassino") e no uso genérico ("uma organização de assassinos").',
    'A caixa em que um termo aparece no glossário é convenção de verbete e não decide nada aqui.',
  ].join('\n'),
  'titulos-maiusculos':
    '**Capitalização de títulos, cargos e formas de tratamento:** capitalize toda forma de tratamento e todo título de cargo, sempre — "o Jovem Mestre", "o Patriarca da família", "uma Senhorita qualquer". É a convenção de parte do wuxia traduzido, e nesta obra ela vale acima da norma do português.',
};

/** Título da seção que o núcleo reserva para as preferências (o delta é a 6). */
export const TITULO_SECAO_PREFERENCIAS = '## 5. PREFERÊNCIAS DE ESTILO DESTA OBRA';

// A ressalva do glossário no cabeçalho (doc 15 §6) conserta um conflito DECLARADO, não
// hipotético. O núcleo diz "Hierarquia: Glossário > Conteúdo > Forma natural. O glossário
// é lei"; este cabeçalho dizia que, conflitando com "as seções anteriores", valem estas —
// e a seção do glossário é uma seção anterior. Formalmente, uma chave derrubava o
// glossário. Com `nomes_proprios: mesclar` ("Pessoa: sempre em pinyin"), um nome de pessoa
// catalogado em forma traduzida punha as duas regras em guerra e quem decidia era o
// modelo, de chamada em chamada.
//
// A mesma ressalva vai no cabeçalho do delta, em `comporOmega`. São os dois cabeçalhos
// SUBORDINADOS que criavam o conflito; o do núcleo já dizia a coisa certa e não muda —
// mexer nele exigiria cortar uma versão nova, e versões são imutáveis.
//
// Sem número de seção de propósito: a composição aceita núcleos arbitrários, inclusive
// editados pelo usuário, e nada garante que o glossário seja a Seção 2 neles.
export const RESSALVA_GLOSSARIO = 'exceto o glossário, que é lei acima de todas as camadas';

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
    `*(Convenções de casa desta obra. Quando conflitarem com as seções anteriores, valem estas — ${RESSALVA_GLOSSARIO}.)*`,
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
    '',
    CAPITALIZACAO[prefs.capitalizacao_titulos],
  ].join('\n');
}

/** Beta curta para núcleos novos. Mantém todas as decisões das chaves, mas corta
 * explicações pedagógicas e exemplos redundantes que já pertencem à interface e
 * aos testes. O modelo recebe decisão + contraste, não um manual editorial. */
export function renderizarPreferenciasCompactas(prefs: PreferenciasEstilo): string {
  const registro = REGISTROS_PREDEFINIDOS[prefs.registro] ?? prefs.registro;
  const dialogo =
    prefs.dialogo === 'aspas'
      ? '**Diálogo:** aspas duplas retas, nunca travessão. Ponto antes de verbo de elocução vira vírgula depois das aspas: `"Fala", disse.`; ? ! … permanecem. Ação independente: `"Fala." Ele saiu.`'
      : '**Diálogo:** travessão. Verbo de elocução continua em minúscula; ação independente começa em maiúscula e a fala conserva o ponto.';
  const pensamento = `**Pensamento:** ${PENSAMENTO_MARCA[prefs.pensamento_marca]}${PENSAMENTO_TEMPO[prefs.pensamento_tempo]}.`;
  const anterioridade =
    prefs.mais_que_perfeito === 'evitar'
      ? '**Anterioridade:** prefira perfeito simples quando contexto/advérbio já a marcar; use “tinha/havia + particípio” só quando necessário e sem empilhar auxiliares; nunca o sintético em -ara/-era/-ira.'
      : '**Anterioridade:** perfeito simples, composto e sintético são permitidos; escolha pelo ritmo sem empilhar a mesma forma.';
  const notas =
    prefs.notas_tradutor === 'permitir'
      ? '**Notas:** `((texto))` apenas para dado linguístico/folclórico intraduzível; nunca para explicar trama ou escolha lexical.'
      : '**Notas:** proibidas; resolva tudo na prosa.';
  const onomatopeia =
    prefs.onomatopeia === 'adaptar'
      ? '**Onomatopeia:** equivalente natural do PT-BR, sempre em *itálico* e sem aspas.'
      : '**Onomatopeia:** pinyin sem tons, sempre em *itálico* e sem aspas.';
  const nomes =
    prefs.nomes_proprios === 'mesclar'
      ? '**Nomes:** pessoa em pinyin; apelido/epíteto e nomes descritivos traduzidos; transcrição fonética mantida; termos consagrados do gênero preservados. O Gama decide cada forma catalogada.'
      : prefs.nomes_proprios === 'traduzir'
        ? '**Nomes:** traduza o que tiver sentido; pessoa e transcrição puramente fonética ficam em pinyin. O Gama decide cada forma catalogada.'
        : '**Nomes:** pinyin sem tons, exceto títulos/cargos traduzidos. O Gama decide cada forma catalogada.';
  const caixa =
    prefs.capitalizacao_titulos === 'norma-pt'
      ? '**Títulos/cargos:** maiúscula no chamado direto ou quando substituem o nome de pessoa determinada; minúscula antes do nome, no predicativo e no uso genérico. A caixa do verbete do Gama não decide a frase.'
      : '**Títulos/cargos:** sempre com inicial maiúscula.';

  return [
    '## 5. BETA — CONVENÇÕES DESTA OBRA',
    '',
    `**Leitor e voz:** ${registro}. Não use flexão verbal de “tu” salvo se o original e a configuração a exigirem.`,
    dialogo,
    pensamento,
    anterioridade,
    notas,
    onomatopeia,
    nomes,
    caixa,
  ].join('\n\n');
}

/** Beta curta v2: explicita a convenção editorial de fala em vários parágrafos. */
export function renderizarPreferenciasCompactasV2(prefs: PreferenciasEstilo): string {
  const base = renderizarPreferenciasCompactas(prefs);
  if (prefs.dialogo !== 'aspas') return base;
  return base.replace(
    /^\*\*Diálogo:\*\*.*$/m,
    '**Diálogo:** aspas duplas retas, nunca travessão. Ponto antes de verbo de elocução vira vírgula depois das aspas: `"Fala", disse.`; ? ! … permanecem. Ação independente: `"Fala." Ele saiu.` Feche as aspas quando a fala terminar ou entrar narração. Se o mesmo falante continuar no parágrafo seguinte, não feche o parágrafo intermediário; abra novas aspas no início do próximo e feche somente no último.',
  );
}

/** Beta curta v3: o público-alvo calibra apenas acessibilidade. Tom, ritmo,
 * densidade e grau de formalidade são inferidos localmente do original. Isso
 * impede que o rótulo "webnovel" uniformize cenas secas, filosóficas, solenes
 * ou coloquiais numa voz global que o chinês não escolheu. */
export function renderizarPreferenciasCompactasV3(prefs: PreferenciasEstilo): string {
  const base = renderizarPreferenciasCompactasV2(prefs);
  const acessibilidade =
    prefs.registro === 'jovem-adulto'
      ? 'Entre equivalentes igualmente fiéis, prefira a formulação corrente e legível; isso não autoriza encurtar períodos, simplificar ideias nem modernizar a voz.'
      : prefs.registro === 'adulto-literario'
        ? 'Vocabulário amplo e períodos longos são permitidos quando o original os sustentar; não os introduza como ornamento.'
        : prefs.registro === 'juvenil'
          ? 'Prefira equivalentes acessíveis ao público juvenil, sem censurar conteúdo nem apagar complexidade necessária.'
          : `Acessibilidade configurada: ${prefs.registro}. Ela não substitui o tom do original.`;
  return base.replace(
    /^\*\*Leitor e voz:\*\*.*$/m,
    [
      '**Tom e registro local:** antes de redigir, identifique no chinês a voz, oralidade ou formalidade, densidade sintática, ritmo, distância emocional e intenção deste trecho. Reproduza esse efeito em PT-BR natural. Não imponha ao capítulo uma voz global de “webnovel” nem normalize tudo como moderno, simples, formal, rápido ou literário.',
      `**Acessibilidade:** ${acessibilidade} Não use flexão verbal de “tu” sem evidência no original e decisão editorial específica.`,
    ].join('\n\n'),
  );
}

/** Beta curta v4: diz QUANDO a perífrase é obrigatória. A v1–v3 dizia "use
 * tinha/havia só quando necessário" sem dizer quando é necessário. Na auditoria
 * integral da 死人经 (20/11/2026), 9 frases conferidas saíram no perfeito simples
 * sem nada que marcasse a anterioridade ("não sabiam o que aconteceu", "a parte
 * que combinaram antes"). A IA tinha escrito o sintético proibido ("acontecera");
 * a revisão literária, impedida de trocá-lo mecanicamente por "tinha +
 * particípio", caiu no perfeito simples, que torna simultâneo o fato anterior. */
export function renderizarPreferenciasCompactasV4(prefs: PreferenciasEstilo): string {
  const base = renderizarPreferenciasCompactasV3(prefs);
  if (prefs.mais_que_perfeito !== 'evitar') return base;
  return base.replace(
    /^\*\*Anterioridade:\*\*.*$/m,
    '**Anterioridade:** quando um advérbio ou o contexto já marcam a anterioridade, use o perfeito simples (`nunca aprendeu`, `treinou anos antes disso`). Sem esse marcador, o perfeito simples a apaga: use “tinha/havia + particípio”, sobretudo em oração ligada a verbo de saber, perceber ou contar no passado (`não sabiam o que tinha acontecido`, não `o que aconteceu`). Alterne os dois auxiliares e não os empilhe; nunca o sintético em -ara/-era/-ira.',
  );
}

/** Recência deliberada: este bloco entra no FIM do Alfa novo, depois do Delta.
 * Ele não ensina regras novas; só força a inspeção das decisões já tomadas. */
export function renderizarChecklistFinal(prefs: PreferenciasEstilo): string {
  const dialogo = prefs.dialogo === 'aspas' ? 'aspas duplas retas e balanceadas' : 'travessões consistentes';
  const pensamento = prefs.pensamento_marca === 'italico' ? 'pensamentos em itálico, sem aspas' : 'pensamentos entre aspas, sem itálico';
  const anterioridade =
    prefs.mais_que_perfeito === 'evitar'
      ? 'nenhum mais-que-perfeito sintético em -ara/-era/-ira e nenhuma pilha de “tinha”'
      : 'tempos de anterioridade naturais e sem repetição mecânica';
  const onomatopeia = prefs.onomatopeia === 'adaptar' ? 'onomatopeias em PT-BR e itálico' : 'onomatopeias em pinyin e itálico';
  return [
    '## CHECKLIST FINAL — CONFIRA ANTES DE ENTREGAR',
    '',
    '1. Todo sentido do chinês está presente, sem invenção, explicação ou intensificação.',
    '2. Todo termo recebido no Gama foi usado na forma aplicável ao contexto.',
    `3. Diálogo: ${dialogo}; incisos e pontuação seguem o PT-BR.`,
    `4. ${pensamento}; ${onomatopeia}.`,
    `5. Anterioridade: ${anterioridade}.`,
    '6. Nenhuma unidade chinesa ficou transliterada; nenhum caractere chinês vazou para o português.',
    '7. Releia só o português: sem decalque, epíteto repetido mecanicamente, eco lexical evitável ou marca tipográfica aberta.',
  ].join('\n');
}

/** Checklist v2 correspondente à Beta curta v2. */
export function renderizarChecklistFinalV2(prefs: PreferenciasEstilo): string {
  const base = renderizarChecklistFinal(prefs);
  if (prefs.dialogo !== 'aspas') return base;
  return base.replace(
    /^3\. Diálogo:.*$/m,
    '3. Diálogo: aspas coerentes. Só deixe a aspa sem par no fim de um parágrafo intermediário da mesma fala; reabra no seguinte e feche no último. Incisos e pontuação seguem o PT-BR.',
  );
}

/** Checklist v3: torna o tom local uma verificação objetiva no ponto de maior
 * recência, sem acrescentar uma nova preferência de estilo. */
export function renderizarChecklistFinalV3(prefs: PreferenciasEstilo): string {
  return renderizarChecklistFinalV2(prefs).replace(
    '7. Releia só o português: sem decalque, epíteto repetido mecanicamente, eco lexical evitável ou marca tipográfica aberta.',
    '7. Compare o efeito local com o chinês: voz, formalidade, densidade e ritmo continuam os deste trecho; depois releia só o português, sem decalque, epíteto mecânico, eco evitável ou marca tipográfica aberta.',
  );
}

// ── Beta e checklist do perfil inglês ──────────────────────────────────────
//
// Derivam da v3 e trocam SÓ o que não existe quando a origem é o inglês. Não
// são uma v4: as versões mandarins acima continuam byte a byte imutáveis, e o
// Alfa inglês usa marcadores próprios (ver MARCADOR_*_EN) justamente para que
// `comporOmega` não precise ramificar por idioma.
//
// O que muda, e por quê:
// - **Nomes** e **Onomatopeia** falam em pinyin, que é transcrição do mandarim.
//   Em inglês o nome já chega em alfabeto latino, e a decisão é outra: manter a
//   grafia do original ou traduzir o que é descritivo.
// - O **checklist** cita "caractere chinês vazado" e "unidade chinesa". Entre
//   inglês e português não há escrita a vazar; o que escapa é unidade imperial
//   e, no lugar do caractere, a palavra inglesa não traduzida.

export function renderizarPreferenciasCompactasEn(prefs: PreferenciasEstilo): string {
  return renderizarPreferenciasCompactasV3(prefs)
    .replace(
      /^\*\*Onomatopeia:\*\*.*$/m,
      prefs.onomatopeia === 'adaptar'
        ? '**Onomatopeia:** equivalente natural do PT-BR, sempre em *itálico* e sem aspas.'
        : '**Onomatopeia:** conserve a forma do original, sempre em *itálico* e sem aspas.',
    )
    .replace(
      /^\*\*Nomes:\*\*.*$/m,
      prefs.nomes_proprios === 'traduzir'
        ? '**Nomes:** traduza o que tiver sentido descritivo; antropônimo e topônimo sem carga semântica ficam na grafia do original. O Gama decide cada forma catalogada.'
        : prefs.nomes_proprios === 'mesclar'
          ? '**Nomes:** pessoa na grafia do original; apelido, epíteto e nome descritivo traduzidos; termo consagrado do gênero preservado. O Gama decide cada forma catalogada.'
          : '**Nomes:** conserve a grafia do original, exceto títulos e cargos, que são traduzidos. O Gama decide cada forma catalogada.',
    )
    .replace('identifique no chinês a voz', 'identifique no inglês a voz');
}

export function renderizarChecklistFinalEn(prefs: PreferenciasEstilo): string {
  return renderizarChecklistFinalV3(prefs)
    .replace(
      '1. Todo sentido do chinês está presente, sem invenção, explicação ou intensificação.',
      '1. Todo sentido do inglês está presente, sem invenção, explicação ou intensificação.',
    )
    .replace(
      '6. Nenhuma unidade chinesa ficou transliterada; nenhum caractere chinês vazou para o português.',
      '6. Nenhuma medida imperial ficou sem converter (pés, milhas, libras, °F); nenhuma palavra do inglês ficou sem traduzir por descuido.',
    )
    .replace('7. Compare o efeito local com o chinês:', '7. Compare o efeito local com o inglês:');
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
  capitalizacao_titulos: {
    titulo: 'Capitalização de títulos',
    opcoes: { 'norma-pt': 'norma do português (quem vs. o quê)', 'titulos-maiusculos': 'sempre maiúscula' },
  },
  registro: {
    titulo: 'Registro / público-alvo',
    // A CHAVE continua 'jovem-adulto' de propósito: trocá-la invalidaria a
    // preferência gravada nas versões de prompt existentes. O rótulo é que
    // estava mentindo — descrevia a cauda do público (30–40) como se fosse o alvo.
    opcoes: {
      'jovem-adulto': 'leitor de webnovel (18–25)',
      'adulto-literario': 'adulto literário',
      juvenil: 'juvenil (12–16)',
    },
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
