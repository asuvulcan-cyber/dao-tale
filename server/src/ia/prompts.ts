import {
  CATEGORIAS_GLOSSARIO,
  DESCRICOES_CATEGORIAS_GLOSSARIO,
  perfilDe,
  type CategoriaGlossarioPadrao,
  type EntradaGlossario,
} from '@dao-tale/shared';
import type {
  RequisicaoContracapa,
  RequisicaoExtrairTermos,
  RequisicaoPasseEstilo,
  RequisicaoQa,
  RequisicaoRefinarPrompt,
  RequisicaoRevisao,
  RequisicaoRevisaoLiteraria,
  RequisicaoAdjudicacaoLiteraria,
  RequisicaoTraducaoBloco,
} from './provedor.js';
import { PROMPT_CONTRACAPA } from './promptContracapa.js';

const TAXONOMIA_GAMA = CATEGORIAS_GLOSSARIO.map(
  (categoria) => `- ${categoria}: ${DESCRICOES_CATEGORIAS_GLOSSARIO[categoria as CategoriaGlossarioPadrao]}`,
).join('\n');

// Montagem dos textos de sistema e usuário — compartilhada por todos os provedores.
// O bloco de sistema é idêntico em todas as chamadas de um capítulo (pré-requisito do prompt caching).

// As duas leis opostas do glossário (spec 2026-08-16 §2): identidade é forma fixa,
// lexical é palavra fixa com superfície livre. Medido na obra real, 杀手 saía 57 vezes
// em minúscula e 25 em maiúscula porque nada dizia qual das duas leis valia para ele.
const CABECALHO_IDENTIDADE =
  '### Nomes próprios (designam um referente específico — use esta designação, sem trocar por sinônimo)';
const CABECALHO_LEXICAL =
  '### Escolhas de palavra (use esta palavra; a forma flexiona como o português pedir)';

// O glossário diz QUAL PALAVRA, não como escrevê-la.
//
// Esta linha existe porque a lista abaixo mente por construção: as entradas são
// cadastradas em caixa alta como convenção de verbete, e um modelo que lê 139
// linhas todas capitalizadas conclui que deve capitalizar. Foi o que se mediu —
// 杀手 saiu 57 vezes em minúscula e 25 em maiúscula, sem correlação com o chinês.
// Caixa, número e gênero são norma do português e chave de estilo da obra; o
// glossário nunca decidiu isso e não pode parecer decidir.
const AVISO_CAIXA =
  'A CAIXA e o número em que os termos aparecem nesta lista são convenção de verbete, não instrução: ' +
  'maiúscula ou minúscula, singular ou plural seguem a norma do português e as regras de estilo desta obra.';

// A nota nunca é regra de tradução para o sentido comum da palavra — só diz QUANDO
// aquele termo específico se aplica (spec §2b). "Só é 'cuidado' quando..." seria mais
// tentador de escrever, mas fixaria uma palavra fora do glossário: viraria um glossário
// clandestino, sem passar por `especie` nem pela varredura de consistência.
const INSTRUCAO_NOTA_USO =
  'A nota de um termo delimita SÓ QUANDO ele se aplica — não é tradução do sentido comum da palavra nos demais casos; esses ficam livres.';

function linhaGlossario(e: EntradaGlossario, porId: Map<number, EntradaGlossario>): string {
  let linha = `${e.termo_zh} → ${e.termo_pt} [${e.categoria}]${e.nota ? ` — ${e.nota}` : ''}`;
  // nota_uso vale nas DUAS espécies: mesmo em identidade, a forma continuar sendo lei
  // não dispensa dizer quando ela se aplica (小心 é identidade E ambíguo ao mesmo tempo —
  // 7 das 8 ocorrências do gatilho chinês não são a personagem Xiao Xin).
  if (e.nota_uso) linha += ` · nota de uso: ${e.nota_uso}`;
  // Variante: diz ao modelo que aponta para o mesmo referente da canônica,
  // ajudando a resolver referências (ex.: apelido/forma curta do nome).
  if (e.principal_id != null) {
    const p = porId.get(e.principal_id);
    linha += p ? ` · variante de ${p.termo_pt} (${p.termo_zh})` : ' · variante';
  }
  if (e.termo_pai_id != null) {
    const pai = porId.get(e.termo_pai_id);
    linha += pai ? ` · pertence a/fica em ${pai.termo_pt} (${pai.termo_zh})` : ' · possui termo pai';
  }
  if (e.relacoes && e.relacoes.length > 0) linha += ` · relações: ${e.relacoes.join('; ')}`;
  return linha;
}

export function formatarGlossario(glossario: EntradaGlossario[]): string {
  if (glossario.length === 0) return '(glossário ainda vazio)';
  const porId = new Map(glossario.map((e) => [e.id, e]));
  const linha = (e: EntradaGlossario) => linhaGlossario(e, porId);

  const lexicais = glossario.filter((e) => e.especie === 'lexical');
  if (lexicais.length === 0) {
    // Sem lexical não há dois blocos para contrastar, mas o aviso de caixa vale
    // igual: ele fala da LISTA, e a lista existe nos dois casos.
    // Ninguém marcou nenhum termo como lexical — inclusive quem nunca abriu a
    // classificação (especie: null em todos, o estado dos 116 termos da obra real
    // hoje). Sem um lexical para contrastar, a distinção não tem o que ensinar, e a
    // saída fica idêntica à lista única de antes desta task: sem cabeçalho de bloco.
    return [AVISO_CAIXA, '', ...glossario.map(linha)].join('\n');
  }

  const identidades = glossario.filter((e) => e.especie !== 'lexical');
  const blocos: string[] = [AVISO_CAIXA];
  if (identidades.length > 0) blocos.push([CABECALHO_IDENTIDADE, ...identidades.map(linha)].join('\n'));
  blocos.push([CABECALHO_LEXICAL, ...lexicais.map(linha)].join('\n'));
  // Só entra se alguma nota_uso existir de fato — glossário sem nenhuma não paga o token.
  if (glossario.some((e) => e.nota_uso)) blocos.push(INSTRUCAO_NOTA_USO);
  return blocos.join('\n\n');
}

/** Garante que a canônica de cada variante selecionada esteja no conjunto — assim,
    no modo glossário-relevante, o modelo enxerga a relação mesmo que só a variante
    tenha aparecido no trecho. */
export function incluirPrincipais(selecionados: EntradaGlossario[], todos: EntradaGlossario[]): EntradaGlossario[] {
  const porId = new Map(todos.map((e) => [e.id, e]));
  const ids = new Set(selecionados.map((e) => e.id));
  const extra: EntradaGlossario[] = [];
  for (const e of selecionados) {
    if (e.principal_id != null && !ids.has(e.principal_id)) {
      const p = porId.get(e.principal_id);
      if (p) {
        extra.push(p);
        ids.add(p.id);
      }
    }
  }
  return extra.length > 0 ? [...selecionados, ...extra] : selecionados;
}

/** Entradas cujo termo chinês aparece em algum dos textos — o resto do glossário
    não ajuda a traduzir este trecho e só gastaria tokens.

    Exceção: o PAI (termo_pai_id) de um termo presente entra junto, mesmo que o
    chinês dele não apareça no trecho. Sem 金鹏堡 ao lado, um trecho que diz só
    西堡 não informa que um fica dentro do outro — é a única exceção à regra de
    "só o que está no texto", e a razão de a coluna existir.

    UM nível, nunca a raiz: dois níveis entregariam a obra inteira num trecho com
    topônimo aninhado, e o filtro existe para encolher o prompt, não para subir
    a árvore toda. */
export function filtrarGlossarioRelevante(
  glossario: EntradaGlossario[],
  textos: (string | undefined | null)[],
): EntradaGlossario[] {
  const corpo = textos.filter(Boolean).join('\n');
  const presentes = glossario.filter((e) => corpo.includes(e.termo_zh));

  // Map por id preserva a ordem de inserção: presentes primeiro (ordem original do
  // glossário), pais acrescentados ao fim. A saída alimenta um prompt cacheado por
  // prefixo — ordem instável quebra o cache e custa dinheiro real.
  const porId = new Map(glossario.map((e) => [e.id, e]));
  const escolhidos = new Map(presentes.map((e) => [e.id, e]));
  for (const e of presentes) {
    if (e.termo_pai_id == null) continue;
    const pai = porId.get(e.termo_pai_id);
    // `!escolhidos.has` cobre tanto "pai já estava presente no texto" quanto "dois
    // filhos do mesmo pai" — nos dois casos o pai só pode entrar uma vez.
    if (pai && !escolhidos.has(pai.id)) escolhidos.set(pai.id, pai);
  }
  return [...escolhidos.values()];
}

// O bloco de sistema é montado em DUAS partes (doc 08 §3): `base` é o prompt mãe
// composto (núcleo + delta) — idêntico entre tradução, revisão e extração da
// mesma obra —, e `operacional` são as instruções da tarefa. No Claude, cada
// parte vira um bloco com cache_control próprio: o breakpoint da base permite
// que tarefas diferentes compartilhem o prefixo do cache; os demais provedores
// juntam as partes numa string (o cache implícito deles é por prefixo, então a
// ordem estável já basta).

export interface PartesSistema {
  base: string;
  operacional: string;
}

export function juntarPartes(p: PartesSistema): string {
  return `${p.base}\n\n${p.operacional}`;
}

export function sistemaTraducaoPartes(
  req: Pick<RequisicaoTraducaoBloco, 'omega' | 'glossario' | 'glossarioNoUsuario' | 'idioma_origem'>,
): PartesSistema {
  const perfil = perfilDe(req.idioma_origem);
  const origem = perfil.rotulo.toLowerCase();
  const instrucoes = [
    `Você receberá frases numeradas em ${origem} para traduzir ao português brasileiro, seguindo integralmente as regras acima.`,
    'Leia o bloco e os contextos por inteiro antes de redigir. Resolva primeiro continuidade, referentes, progressão lógica e o tom local de cada passagem; só então traduza as frases numeradas.',
    `Antes de entregar, faça uma segunda leitura silenciosa: compare cada tradução com o ${origem} para recuperar omissões e intensidade; depois leia a sequência apenas em português e corrija decalques, formalidade sem apoio, fragmentos acidentais e construções mecânicas. Não mostre essa análise.`,
    'Traduza cada frase numerada mantendo o número. Não traduza o contexto marcado como "já traduzido" nem o marcado como "contexto futuro".',
    'Se encontrar termos novos relevantes (nomes próprios, técnicas, lugares, títulos) que NÃO estão no glossário, liste-os em termos_novos com a tradução que você adotou.',
    'Classifique cada termo novo em exatamente uma categoria da taxonomia abaixo, escolhendo a mais específica; nunca crie categoria nem use “outro”:',
    TAXONOMIA_GAMA,
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ];
  const operacional = [
    ...(req.glossarioNoUsuario
      ? // Glossário filtrado por bloco vai na mensagem do usuário: o sistema fica
        // idêntico entre blocos (pré-requisito do prompt caching).
        ['## GLOSSÁRIO DA OBRA', 'Os termos do glossário presentes neste trecho virão na mensagem do usuário. Uso obrigatório e consistente.']
      : ['## GLOSSÁRIO DA OBRA (uso obrigatório e consistente)', formatarGlossario(req.glossario)]),
    '',
    '## INSTRUÇÕES OPERACIONAIS DO APLICATIVO',
    ...instrucoes,
  ].join('\n');
  return { base: req.omega.trim(), operacional };
}

export function sistemaTraducao(req: Pick<RequisicaoTraducaoBloco, 'omega' | 'glossario' | 'glossarioNoUsuario'>): string {
  return juntarPartes(sistemaTraducaoPartes(req));
}

export function usuarioTraducao(req: RequisicaoTraducaoBloco): string {
  const sigla = perfilDe(req.idioma_origem).sigla;
  const partes: string[] = [];
  if (req.glossarioNoUsuario && req.glossario.length > 0) {
    partes.push('### Glossário (termos presentes neste trecho — uso obrigatório):');
    partes.push(formatarGlossario(req.glossario));
    partes.push('');
  }
  if (req.termosAdotados && req.termosAdotados.length > 0) {
    // Termos escolhidos pela própria IA em blocos anteriores do mesmo capítulo:
    // ainda não estão no glossário, mas mudar a tradução no meio do capítulo é pior.
    partes.push('### Termos já adotados neste capítulo (mantenha exatamente estas traduções):');
    for (const t of req.termosAdotados) partes.push(`${t.termo_zh} → ${t.termo_pt}`);
    partes.push('');
  }
  if (req.caudaAnterior.length > 0) {
    partes.push('### Contexto anterior (já traduzido — não retraduzir):');
    for (const f of req.caudaAnterior) partes.push(`${sigla}: ${f.texto_zh}\nPT: ${f.texto_pt}`);
    partes.push('');
  }
  partes.push('### Frases a traduzir:');
  if (req.titulo)
    partes.push(
      `[-1] ${req.titulo} (título do capítulo — traduza SÓ o título, sem "Capítulo N": a numeração é posta pelo aplicativo. ` +
        'Se o original for só a designação, sem nome — 第一章, 楔子 —, devolva a designação traduzida: "Prólogo", "Capítulo 1".)',
    );
  for (const f of req.frases) partes.push(`[${f.ordem}] ${f.texto_zh}`);
  if (req.proximas.length > 0) {
    partes.push('');
    partes.push('### Contexto futuro (apenas referência — não traduzir):');
    for (const bruta of req.proximas) partes.push(bruta);
  }
  return partes.join('\n');
}

// ── Contracapa (título/sinopse da ficha da obra) ───────────────────────────
// A base NÃO é o prompt mãe da obra: é o prompt de contracapa fixo do app
// (`promptContracapa.ts`). O núcleo de capítulo proíbe justamente o que esta
// tarefa exige — localizar chengyu, termo de gênero e clichê de resenha. Da
// obra vem só o glossário, que continua sendo lei para nomes e termos.

export function sistemaContracapaPartes(
  req: Pick<RequisicaoContracapa, 'glossario' | 'glossarioNoUsuario' | 'tituloZh' | 'sinopseZh' | 'idioma_origem'>,
): PartesSistema {
  const origem = perfilDe(req.idioma_origem).rotulo.toLowerCase();
  const operacional = [
    ...(req.glossarioNoUsuario
      ? ['## GLOSSÁRIO DA OBRA', 'Os termos do glossário presentes neste texto virão na mensagem do usuário. Uso obrigatório e consistente.']
      : ['## GLOSSÁRIO DA OBRA (uso obrigatório e consistente)', formatarGlossario(req.glossario)]),
    '',
    '## INSTRUÇÕES OPERACIONAIS DO APLICATIVO',
    `Você receberá o título e/ou a sinopse da obra em ${origem} — cada um por inteiro, sem numeração.`,
    'A sinopse vem completa de uma vez: leia-a toda antes de traduzir, para que os versos e o encadeamento sejam resolvidos juntos. Traduza-a inteira, sem resumir, cortar ou omitir nada.',
    'Preencha titulo_pt com o título traduzido e sinopse_pt com a sinopse traduzida, mantendo em sinopse_pt as mesmas quebras de linha e de parágrafo do original.',
    'Deixe em null o campo cujo texto não foi enviado — nunca invente um título ou uma sinopse que você não recebeu.',
    'Os dois campos recebem o texto FINAL, pronto para a ficha da obra: sem rótulos, sem aspas em volta, sem notas e sem alternativas.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
  return { base: PROMPT_CONTRACAPA.trim(), operacional };
}

export function sistemaContracapa(
  req: Pick<RequisicaoContracapa, 'glossario' | 'glossarioNoUsuario' | 'tituloZh' | 'sinopseZh' | 'idioma_origem'>,
): string {
  return juntarPartes(sistemaContracapaPartes(req));
}

export function usuarioContracapa(req: RequisicaoContracapa): string {
  const origem = perfilDe(req.idioma_origem).rotulo.toLowerCase();
  const partes: string[] = [];
  if (req.glossarioNoUsuario && req.glossario.length > 0) {
    partes.push('### Glossário (termos presentes neste texto — uso obrigatório):');
    partes.push(formatarGlossario(req.glossario));
    partes.push('');
  }
  if (req.tituloZh) {
    partes.push(`### Título da obra (${origem}):`);
    partes.push(req.tituloZh);
    partes.push('');
  }
  if (req.sinopseZh) {
    // Inteira e com as quebras originais — é o que permite ver os versos juntos.
    partes.push(`### Sinopse da obra (${origem}, completa):`);
    partes.push(req.sinopseZh);
  }
  return partes.join('\n').trimEnd();
}

export function sistemaRevisaoPartes(req: Pick<RequisicaoRevisao, 'omega' | 'glossario' | 'glossarioNoUsuario' | 'idioma_origem'>): PartesSistema {
  const origem = perfilDe(req.idioma_origem).rotulo.toLowerCase();
  const operacional = [
    ...(req.glossarioNoUsuario
      ? // Mesmo desenho da tradução (A4 da auditoria): glossário filtrado por frase
        // vai na mensagem do usuário — o sistema fica idêntico entre revisões da
        // obra e o cache passa a acertar de verdade.
        ['## GLOSSÁRIO DA OBRA', 'Os termos do glossário presentes neste trecho virão na mensagem do usuário. Uso obrigatório e consistente.']
      : ['## GLOSSÁRIO DA OBRA', formatarGlossario(req.glossario)]),
    '',
    '## PROTOCOLO DE REVISÃO (instruções do aplicativo)',
    'Você é o revisor da tradução acima descrita. O usuário questionará uma escolha de tradução de UMA frase específica.',
    'A PERGUNTA DO USUÁRIO é a premissa da sua análise, não apenas o endereço da frase.',
    `Se a pergunta declara um motivo ("o original diz X", "isto soa Y", "no capítulo anterior ficou Z"), sua resposta DEVE tratar desse motivo — confirmando-o ou refutando-o pelo texto-fonte em ${origem}. Nunca substitua o motivo do usuário por outro argumento.`,
    `Se o motivo dele não procede, diga isso e mostre onde no ${origem}. Concordar por concordar é pior que discordar.`,
    'Quando houver "Discussão até aqui", diga explicitamente se você MANTÉM ou REVISA o veredito anterior, e por quê. Repetir o argumento já contestado sem endereçar a contestação é o pior desfecho possível.',
    'Responda exclusivamente pelo formato estruturado, preenchendo:',
    `- trecho_zh: o trecho EXATO do ${origem} que fundamenta sua análise;`,
    '- resposta: a resposta à dúvida, endereçando o motivo declarado. É o que o revisor lê primeiro;',
    '- veredito: "correto" se a tradução atual está adequada; "incorreto" se precisa de correção; "escolha-legitima" quando ela não está errada mas também não é a única leitura defensável (o que está em jogo é preferência, não regra);',
    '- secao_regra: identificador curto e estável da regra, SOMENTE quando uma regra do prompt é o que decide o caso. Caso contrário, null — a maior parte das dúvidas de tradução não tem regra por trás, e forçar uma faz a resposta ficar sobre um assunto que o usuário não levantou;',
    '- justificativa: a regra e por que ela se aplica. String vazia quando secao_regra for null;',
    '- correcao_proposta: a frase COMPLETA corrigida em PT-BR se veredito for "incorreto"; null nos demais.',
    '- trecho_pt_errado: o MENOR pedaço da tradução ATUAL que precisa mudar, copiado dela letra por letra (mesmos acentos e pontuação). É por ele que a correção é aplicada: o app troca SÓ esse pedaço e conserva todo o resto da frase.',
    '- trecho_pt_corrigido: o que esse pedaço deve virar.',
    '- Não inclua aspas de diálogo, travessão nem a pontuação final da frase no trecho, a menos que o erro seja justamente essa marca. Se o problema for a frase inteira (ordem das orações, sentido trocado), aí sim o trecho pode ser a frase toda.',
  ].join('\n');
  return { base: req.omega.trim(), operacional };
}

export function sistemaRevisao(req: Pick<RequisicaoRevisao, 'omega' | 'glossario' | 'glossarioNoUsuario'>): string {
  return juntarPartes(sistemaRevisaoPartes(req));
}

export function usuarioRevisao(req: RequisicaoRevisao): string {
  const sigla = perfilDe(req.idioma_origem).sigla;
  const partes: string[] = [];
  if (req.glossarioNoUsuario && req.glossario.length > 0) {
    partes.push('### Glossário (termos presentes neste trecho — uso obrigatório):');
    partes.push(formatarGlossario(req.glossario));
    partes.push('');
  }
  if (req.vizinhasAntes.length > 0) {
    partes.push('### Frases anteriores (contexto):');
    for (const f of req.vizinhasAntes) partes.push(`${sigla}: ${f.texto_zh}\nPT: ${f.texto_pt || '(sem tradução)'}`);
    partes.push('');
  }
  if (req.rotulosConhecidos && req.rotulosConhecidos.length > 0) {
    const diretriz = req.rotulosConhecidos.filter((r) => r.camada === null || r.camada === 'delta');
    const chaves = req.rotulosConhecidos.filter((r) => r.camada === 'beta');
    const nucleo = req.rotulosConhecidos.filter((r) => r.camada === 'alfa');
    partes.push('### Rótulos de regra já usados nesta obra');
    const linha = (t: string, l: typeof diretriz) =>
      l.length > 0 && partes.push(`${t}: ${l.map((r) => r.rotulo).join(', ')}`);
    linha('Diretrizes da obra', diretriz);
    linha('Chaves de estilo (Seção 5)', chaves);
    linha('Regras universais do núcleo', nucleo);
    partes.push(
      'Use um destes SÓ se a regra em questão for exatamente a mesma. A maior parte das dúvidas não é de regra — nesse caso deixe secao_regra em null.',
    );
    partes.push('');
  }
  if (req.turnosAnteriores && req.turnosAnteriores.length > 0) {
    partes.push('### Discussão até aqui (você já respondeu isto; o usuário replicou):');
    if (req.turnosOmitidos && req.turnosOmitidos > 0) {
      partes.push(`(${req.turnosOmitidos} turno(s) intermediário(s) omitido(s) por tamanho.)`);
    }
    req.turnosAnteriores.forEach((t, i) => {
      partes.push(`[turno ${i + 1}] usuário: ${t.pergunta}`);
      const regra = t.secao_regra ? ` · regra: ${t.secao_regra}` : '';
      partes.push(`[turno ${i + 1}] você: (${t.veredito}${regra}) ${t.resposta}`);
      // O rótulo de secao_regra sozinho não basta: sem o ARGUMENTO, "diga se
      // MANTÉM ou REVISA o veredito anterior" fica sem objeto — o modelo pode
      // reformular a mesma tese sem perceber que é a tese já contestada. Guard
      // igual ao de GavetaRevisao.tsx: nos casos migrados da base antiga
      // (022) justificativa === resposta, e repetir aqui seria só ruído.
      if (t.justificativa && t.justificativa !== t.resposta) {
        partes.push(`[turno ${i + 1}] justificativa da regra: ${t.justificativa}`);
      }
      if (t.correcao_proposta) partes.push(`[turno ${i + 1}] correção que você propôs: ${t.correcao_proposta}`);
      if (t.recusado) {
        partes.push(`[turno ${i + 1}] o usuário RECUSOU esse veredito${t.motivo_rejeicao ? `: ${t.motivo_rejeicao}` : '.'}`);
      }
    });
    partes.push('');
  }
  partes.push('### FRASE QUESTIONADA:');
  partes.push(`${sigla}: ${req.frase.texto_zh}`);
  partes.push(`PT atual: ${req.frase.texto_pt || '(sem tradução)'}`);
  if (req.frase.texto_pt_original_ia && req.frase.texto_pt_original_ia !== req.frase.texto_pt) {
    partes.push(`PT original da IA (antes de edições): ${req.frase.texto_pt_original_ia}`);
  }
  partes.push('');
  if (req.vizinhasDepois.length > 0) {
    partes.push('### Frases seguintes (contexto):');
    for (const f of req.vizinhasDepois) partes.push(`${sigla}: ${f.texto_zh}\nPT: ${f.texto_pt || '(sem tradução)'}`);
    partes.push('');
  }
  partes.push('### PERGUNTA DO USUÁRIO (a premissa da sua análise — trate do motivo que ela declara):');
  partes.push(req.pergunta);
  return partes.join('\n');
}

// ── Extração exaustiva de termos de uma frase ──────────────────────────────

export function sistemaExtrairTermosPartes(
  req: Pick<RequisicaoExtrairTermos, 'omega' | 'glossario' | 'glossarioNoUsuario' | 'idioma_origem'>,
): PartesSistema {
  const origem = perfilDe(req.idioma_origem).rotulo.toLowerCase();
  const operacional = [
    ...(req.glossarioNoUsuario
      ? // M2 da auditoria: em vez do glossário INTEIRO no sistema a cada frase,
        // só os termos presentes na frase vão na mensagem do usuário — o sistema
        // fica estável por obra e cacheável (a curadoria é o fluxo com mais
        // chamadas por minuto do app).
        ['## GLOSSÁRIO ATUAL DA OBRA', 'Os termos já catalogados presentes na frase virão na mensagem do usuário — NÃO os repita.']
      : ['## GLOSSÁRIO ATUAL DA OBRA (já catalogado — NÃO repita estes)', formatarGlossario(req.glossario)]),
    '',
    '## TAREFA: CURADORIA DO GLOSSÁRIO',
    `Você está ajudando a curar o glossário da obra. Receberá UMA frase em ${origem} e sua tradução em português.`,
    'Liste EXAUSTIVAMENTE todos os termos da frase que merecem entrar no glossário — nomes próprios, lugares, personagens, técnicas/poderes, títulos/cargos, entidades, organizações — mesmo os secundários ou de aparência corriqueira.',
    'Inclua nomes de lugar mantidos em pinyin (ex.: transliterações), que costumam passar despercebidos e precisam de consistência.',
    'NÃO liste: palavras comuns, verbos, adjetivos genéricos, nem termos que já estão no glossário.',
    'Para cada termo devolva: termo_zh (como no original), termo_pt (exatamente como aparece na tradução), categoria e uma descrição curta em PT (o que é/papel na história) para a nota do glossário.',
    'Use exatamente uma categoria da taxonomia abaixo, sempre a mais específica; nunca invente categoria nem use “outro”:',
    TAXONOMIA_GAMA,
    'Se não houver nenhum termo novo digno de glossário, devolva a lista vazia.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
  return { base: req.omega.trim(), operacional };
}

export function sistemaExtrairTermos(req: Pick<RequisicaoExtrairTermos, 'omega' | 'glossario' | 'glossarioNoUsuario'>): string {
  return juntarPartes(sistemaExtrairTermosPartes(req));
}

export function usuarioExtrairTermos(req: RequisicaoExtrairTermos): string {
  const sigla = perfilDe(req.idioma_origem).sigla;
  const partes: string[] = [];
  if (req.glossarioNoUsuario && req.glossario.length > 0) {
    partes.push('### Termos já no glossário presentes nesta frase (NÃO repetir):');
    partes.push(formatarGlossario(req.glossario));
    partes.push('');
  }
  partes.push(`${sigla}: ${req.frase.texto_zh}`, `PT: ${req.frase.texto_pt || '(sem tradução)'}`);
  return partes.join('\n');
}

// ── QA por segunda IA (doc 09 §6) ──────────────────────────────────────────
// Um modelo diferente do tradutor compara cada par zh↔pt e aponta problemas nos
// quatro eixos — só aponta, nunca reescreve. Mesmo desenho de camadas/cache.

export function sistemaQaPartes(req: Pick<RequisicaoQa, 'omega' | 'glossario' | 'glossarioNoUsuario' | 'idioma_origem'>): PartesSistema {
  const origem = perfilDe(req.idioma_origem).rotulo.toLowerCase();
  const operacional = [
    ...(req.glossarioNoUsuario
      ? ['## GLOSSÁRIO DA OBRA', 'Os termos do glossário presentes neste trecho virão na mensagem do usuário. Uso obrigatório e consistente.']
      : ['## GLOSSÁRIO DA OBRA', formatarGlossario(req.glossario)]),
    '',
    '## TAREFA: CONTROLE DE QUALIDADE (QA) DA TRADUÇÃO',
    `Você é um revisor de qualidade independente. Receberá pares de frases (original em ${origem} + tradução em português) já traduzidos e deve APONTAR problemas — NUNCA reescrever o texto por conta própria.`,
    'Analise cada par e aponte SOMENTE onde houver problema real, em um destes eixos:',
    '- glossario: termo do glossário traduzido fora do padrão canônico (inclui flexões);',
    '- pronome-genero: pronome/gênero errado ou trocado no meio do trecho (他/她/它 e concordância de adjetivos — crítico em zh→pt);',
    `- repeticao: eco anômalo (mesma tradução PT para original diferente) ou tique repetido de linguagem;`,
    `- omissao: parte da frase em ${origem} sem correspondência na tradução.`,
    `Para cada apontamento devolva: ordem (o número da frase), tipo (um dos eixos acima), severidade (alta/media/baixa), trecho_zh (o trecho do ${origem} que evidencia), observacao (o problema em uma frase) e sugestao (uma tradução corrigida completa da frase, OPCIONAL — null se preferir só apontar).`,
    'Os pares marcados como "contexto anterior" servem só para avaliar repetição/continuidade — NÃO os aponte.',
    'Se a tradução estiver boa, devolva a lista de apontamentos vazia.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
  return { base: req.omega.trim(), operacional };
}

export function sistemaQa(req: Pick<RequisicaoQa, 'omega' | 'glossario' | 'glossarioNoUsuario'>): string {
  return juntarPartes(sistemaQaPartes(req));
}

export function usuarioQa(req: RequisicaoQa): string {
  const origem = perfilDe(req.idioma_origem).rotulo.toLowerCase();
  const sigla = perfilDe(req.idioma_origem).sigla;
  const partes: string[] = [];
  if (req.glossarioNoUsuario && req.glossario.length > 0) {
    partes.push('### Glossário (termos presentes neste trecho — padrão obrigatório):');
    partes.push(formatarGlossario(req.glossario));
    partes.push('');
  }
  if (req.caudaAnterior.length > 0) {
    partes.push('### Contexto anterior (apenas referência — NÃO apontar):');
    for (const p of req.caudaAnterior) partes.push(`${sigla}: ${p.texto_zh}\nPT: ${p.texto_pt}`);
    partes.push('');
  }
  partes.push(`### Pares a auditar (número, ${origem}, tradução):`);
  for (const p of req.pares) partes.push(`[${p.ordem}]\n${sigla}: ${p.texto_zh}\nPT: ${p.texto_pt || '(sem tradução)'}`);
  return partes.join('\n');
}

// ── Refinamento semiautomático do prompt (doc 08 §7) ───────────────────────
// Casos recorrentes do banco de testes → propostas concretas de regra para o
// delta da obra. A IA propõe; o usuário edita/aprova como nova versão.

export function sistemaRefinarPromptPartes(req: Pick<RequisicaoRefinarPrompt, 'omega' | 'deltaAtual' | 'idioma_origem'>): PartesSistema {
  const origem = perfilDe(req.idioma_origem).rotulo.toLowerCase();
  const operacional = [
    '## TAREFA: REFINAR AS DIRETRIZES DA OBRA',
    'O prompt acima rege a tradução da obra. Casos recorrentes e edições humanas são EVIDÊNCIA de lacuna, não prova de que a solução pertença ao Delta.',
    'As diretrizes atuais da obra são exatamente estas (vazias se nada aparecer):',
    '```',
    req.deltaAtual.trim() || '(nenhuma diretriz específica ainda)',
    '```',
    'Antes de propor texto, classifique a camada proprietária de cada achado:',
    `- Alfa: regra universal de tradução ${origem} → PT-BR ou de prosa natural, aplicável a muitas obras.`,
    '- Beta: escolha configurável da obra (diálogo, pensamento, registro, tempos, notas, onomatopeia, nomes ou capitalização).',
    '- Gama: equivalência individual de termo, nome, lugar, epíteto, cargo ou conceito.',
    '- Delta: exceção ou comportamento recorrente realmente específico desta obra e não representável no Gama/Beta.',
    '- Nenhuma: preferência isolada, evidência insuficiente, regra já existente ou mera desobediência do modelo.',
    '- Uma proposta por lacuna identificada; frase imperativa, curta e testável, no estilo das regras existentes.',
    '- A regra deve prevenir os erros dos casos apresentados sem contradizer as demais seções do prompt.',
    '- NÃO reescreva regras que já funcionam. NÃO envie ao Delta nada genérico coberto pelo Alfa, nenhuma escolha de Beta e nenhuma equivalência de Gama.',
    '- NÃO proponha regra sobre aspas/travessão no diálogo, marcação do pensamento, mais-que-perfeito, nota do tradutor, onomatopeia, capitalização de títulos/cargos/formas de tratamento ou público-alvo: isso é configuração da obra (a Seção 5, quando presente), resolvida por uma chave e não por texto de diretriz.',
    'A mensagem do usuário pode trazer casos RECUSADOS pelo revisor. Eles são correção de rumo, não material a generalizar: NÃO proponha regra que reproduza o erro apontado neles.',
    'A mensagem pode trazer CORREÇÕES QUE O REVISOR FEZ À MÃO. São o padrão que ele pratica sem pedir, e portanto o sinal mais forte — mas também o mais bruto: uma correção isolada é gosto, não regra. Só proponha regra quando o mesmo tipo de correção se repetir em casos diferentes.',
    'As fontes podem vir juntas ou separadas: casos recorrentes do banco de testes, casos recusados pelo revisor, e correções que ele fez à mão. Quando NÃO houver casos recorrentes e só vierem correções à mão, proponha um secao_regra NOVO e descritivo do padrão que você observou — não cite um identificador que não foi enviado.',
    'Para cada achado devolva: camada, secao_regra, regra_proposta e justificativa. Em camada=delta, regra_proposta deve estar pronta para o Delta. Nas demais, descreva concisamente a ação correta na camada dona; ela será exibida, mas bloqueada para inclusão no Delta.',
    'Se os casos não sustentarem nenhuma regra nova, devolva a lista vazia.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
  return { base: req.omega.trim(), operacional };
}

export function sistemaRefinarPrompt(req: Pick<RequisicaoRefinarPrompt, 'omega' | 'deltaAtual'>): string {
  return juntarPartes(sistemaRefinarPromptPartes(req));
}

export function usuarioRefinarPrompt(
  req: Pick<RequisicaoRefinarPrompt, 'casos' | 'recusados' | 'edicoes' | 'idioma_origem'>,
): string {
  const sigla = perfilDe(req.idioma_origem).sigla;
  const partes: string[] = [];
  if (req.casos.length > 0) {
    // Cabeçalho só quando há casos: o refinamento agora também roda só com
    // edições manuais, e cabeçalho vazio faz o modelo procurar o que não veio.
    partes.push('### Casos recorrentes do banco de testes:');
    const porSecao = new Map<string, RequisicaoRefinarPrompt['casos']>();
    for (const caso of req.casos) {
      const lista = porSecao.get(caso.secao_regra) ?? [];
      lista.push(caso);
      porSecao.set(caso.secao_regra, lista);
    }
    for (const [secao, casos] of porSecao) {
      partes.push('');
      partes.push(`#### Seção/regra: ${secao} (${casos.length} casos)`);
      for (const c of casos) {
        partes.push(`- ${sigla}: ${c.trecho_zh}`);
        partes.push(`  Pergunta do revisor: ${c.pergunta}`);
        partes.push(`  Veredito: ${c.veredito} — ${c.justificativa}`);
        if (c.correcao_proposta) partes.push(`  Correção aplicada: ${c.correcao_proposta}`);
      }
    }
  }
  if (req.recusados && req.recusados.length > 0) {
    partes.push('');
    partes.push('### Casos em que o revisor RECUSOU o veredito da IA');
    for (const r of req.recusados) {
      partes.push(`- ${sigla}: ${r.trecho_zh}`);
      partes.push(`  Pergunta do revisor: ${r.pergunta}`);
      partes.push(`  Veredito recusado: ${r.veredito} — ${r.resposta}`);
      if (r.motivo_rejeicao) partes.push(`  Motivo da recusa: ${r.motivo_rejeicao}`);
    }
  }
  if (req.edicoes && req.edicoes.length > 0) {
    partes.push('');
    partes.push('### Correções que o revisor fez à mão (a IA nunca soube)');
    for (const e of req.edicoes) {
      partes.push(`- ZH: ${e.trecho_zh}`);
      partes.push(`  A IA escreveu: ${e.ia}`);
      partes.push(`  O revisor deixou: ${e.voce}`);
      partes.push(`  O que mudou: "${e.mudou.de}" → "${e.mudou.para}"`);
    }
  }
  return partes.join('\n');
}

// ── Passe de estilo ────────────────────────────────────────────────────────
// A varredura de estilo já aponta as violações e não tinha como ajudar a
// consertar: na 死人经 o revisor desfez 57 mais-que-perfeitos à mão, um por um.
// Este passe propõe o conserto PONTUAL de cada uma — nunca retradução, porque
// retraduzir apagaria as correções que o revisor já tinha feito na mesma frase.

export function sistemaPasseEstiloPartes(req: Pick<RequisicaoPasseEstilo, 'omega'>): PartesSistema {
  const operacional = [
    '## TAREFA: PASSE DE ESTILO',
    'Você receberá frases já traduzidas com uma ou mais VIOLAÇÕES DE ESTILO apontadas por uma varredura automática, e o trecho que disparou cada uma.',
    'Conserte APENAS A VIOLAÇÃO apontada. NÃO retraduza a frase, não melhore o que não foi apontado, não mexa em pontuação, aspas ou ordem das orações que estejam fora da violação.',
    'Para cada violação devolva o par: trecho_pt_errado (cópia EXATA de um pedaço do texto atual, e ÚNICO na frase — se a palavra se repetir, inclua as vizinhas necessárias) e trecho_pt_corrigido.',
    'A varredura é heurística e erra: se a ocorrência apontada NÃO for uma violação de verdade, devolva descartar: true e deixe o par em null. Isso é resposta legítima e esperada.',
    'As frases marcadas como contexto servem só para você entender o trecho — NÃO as corrija.',
    'Quando a violação trouxer uma ORIENTAÇÃO, ela descreve o erro exato: o ORIGINAL em chinês é o árbitro — confira nele o sentido antes de propor o conserto ou o descarte.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
  return { base: req.omega.trim(), operacional };
}

export function sistemaPasseEstilo(req: Pick<RequisicaoPasseEstilo, 'omega'>): string {
  return juntarPartes(sistemaPasseEstiloPartes(req));
}

export function usuarioPasseEstilo(req: RequisicaoPasseEstilo): string {
  const partes: string[] = [];
  if (req.vizinhas.length > 0) {
    partes.push('### Contexto (NÃO corrigir):');
    for (const v of req.vizinhas) partes.push(`[${v.ordem}] ${v.texto_pt}`);
    partes.push('');
  }
  partes.push('### Frases a consertar:');
  for (const a of req.alvos) {
    partes.push(`[${a.ordem}] ZH: ${a.texto_zh}`);
    partes.push(`     PT: ${a.texto_pt}`);
    for (const v of a.violacoes) {
      partes.push(`     violação: ${v.regra} — trecho acusado: "${v.trecho}"`);
      if (v.orientacao) partes.push(`     orientação: ${v.orientacao}`);
    }
  }
  return partes.join('\n');
}

// ── Revisão literária em sombra ───────────────────────────────────────────
// Tarefa distinta da tradução e do passe cirúrgico. Ela pode reestruturar uma
// frase, mas só produz candidatos versionados: nunca escreve no texto vigente.

export function sistemaRevisaoLiterariaPartes(req: Pick<RequisicaoRevisaoLiteraria, 'omega' | 'foco'>): PartesSistema {
  const foco = req.foco ?? 'integral';
  const instrucaoFoco = foco === 'fidelidade'
    ? [
        '## ESCOPO DESTE PASSE: FIDELIDADE',
        'Corrija somente erro ou perda demonstrável de sentido: omissão, invenção, referente, relação lógica/temporal, intensidade ou aplicação contextual do Gama.',
        'Não faça polimento estilístico. Se a formulação transmitir corretamente o chinês, devolva null mesmo que você prefira outra redação.',
      ]
    : foco === 'tom-naturalidade'
      ? [
          '## ESCOPO DESTE PASSE: TOM LOCAL E NATURALIDADE',
          'Trate o sentido da versão recebida como já verificado. Corrija somente português que soe traduzido ou registro, voz, ritmo e diálogo incompatíveis com o trecho chinês local.',
          'Não acrescente imagem, intensidade ou explicação; não altere fatos, referentes, relações lógicas, Gama ou conteúdo para obter fluência.',
          'Prefira vocabulário corrente quando o original não sustentar solenidade, tecnicismo ou rebuscamento. Não uniformize trechos que tenham tons diferentes.',
        ]
      : foco === 'seletiva'
        ? [
            '## ESCOPO DESTE PASSE: REVISÃO SELETIVA DIAGNOSTICADA',
            'Cada alvo traz sinais de triagem. Verifique-os contra o chinês e o contexto; eles são suspeitas, não ordens de substituição.',
            'Corrija somente quando o diagnóstico revelar problema real. Não procure motivos adicionais para reescrever uma frase boa e devolva null diante de falso positivo.',
            'Quando houver correção, altere o menor trecho suficiente para resolver exatamente o diagnóstico e preserve literalmente todo o restante que continuar correto. Não aproveite a abertura para trocar sinônimos, aspas, pontuação, tempo verbal ou ritmo não acusados.',
            'Nunca substitua mecanicamente mais-que-perfeito simples por "tinha/havia + particípio". Se a forma simples soar inadequada, reconstrua com o tempo e o aspecto naturais ao contexto; se isso não puder ser feito sem uma reescrita ampla ou perda temporal, devolva null para adjudicação humana.',
            'Isso não proíbe passado composto: quando o diagnóstico exigir corrigir uma relação temporal, preserve a anterioridade necessária e explique essa relação na justificativa. Não transforme um fato anterior em simultâneo apenas para evitar "tinha/havia + particípio".',
            'Antes de entregar, compare palavra por palavra com o vigente: se alguma mudança não for necessária para sanar uma das razões listadas no DIAGNÓSTICO, desfaça-a.',
          ]
        : [];
  const operacional = [
    '## TAREFA: REVISÃO LITERÁRIA EM SOMBRA',
    ...instrucaoFoco,
    'Compare o chinês, a primeira saída da IA e o texto vigente. O vigente pode conter boas edições humanas: preserve-as.',
    'Antes de revisar cada alvo, infira do trecho chinês e do contexto o tom LOCAL: voz do narrador ou personagem, grau de oralidade/formalidade, densidade sintática, ritmo, distância emocional e intenção. Não imponha ao capítulo um registro global.',
    'Proponha mudança somente quando houver ganho concreto de fidelidade, naturalidade brasileira, coesão, ritmo, diálogo, léxico, Gama ou tipografia.',
    'Naturalize interferências do chinês para que o português não soe traduzido, mas não simplifique, modernize, formalize, embeleze ou intensifique sem evidência no original. Uma frase pode ser coloquial, seca, filosófica, solene ou áspera quando o trecho local assim for.',
    'Não reescreva para exibir variedade. Não troque palavra corrente por rara, não fragmente a prosa e não explique o que o original apenas sugere. Mudança de registro sem evidência local é regressão.',
    'Preserve fatos, intensidade, ponto de vista, relações temporais, números e notas ((...)). O chinês é o árbitro semântico; o texto vigente é a base editorial.',
    'Leia todo o contexto antes de decidir cada alvo. Resolva sujeitos, referentes, falas multiparágrafo e continuidade entre frases.',
    'Respeite as fronteiras indicadas por §. Se uma fala e sua atribuição estiverem em parágrafos diferentes, não inicie o novo parágrafo com dicendi dependente ("disse ele", "gritou alguém"). Construa uma oração autônoma com sujeito explícito ("Ele disse aquilo", "O grito partiu de alguém"). Só use `"...", disse ele` quando fala e atribuição pertencerem ao mesmo parágrafo.',
    'Para texto já bom, devolva null. Uma revisão conservadora com poucos acertos é melhor que muitas paráfrases indiferentes.',
    'Checklist por alvo: (1) sentido/omissões; (2) Gama contextual; (3) referentes/tempo; (4) tom local preservado; (5) PT-BR natural e fluido; (6) ritmo, parágrafo, diálogo e notas; (7) ganho demonstrável, não preferência.',
    'A saída será submetida a validadores e aprovação humana; nada será publicado automaticamente.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
  return { base: req.omega.trim(), operacional };
}

export function sistemaRevisaoLiteraria(req: Pick<RequisicaoRevisaoLiteraria, 'omega' | 'foco'>): string {
  return juntarPartes(sistemaRevisaoLiterariaPartes(req));
}

function linhaRevisaoLiteraria(f: RequisicaoRevisaoLiteraria['alvos'][number]): string[] {
  const linhas = [
    `[${f.ordem} §${f.paragrafo}${f.inicio_paragrafo ? ' início' : ''}] ZH: ${f.texto_zh}`,
    `     IA original: ${f.texto_pt_original_ia ?? '(indisponível)'}`,
    `     Vigente: ${f.texto_pt}`,
  ];
  if (f.diagnostico) {
    linhas.push(`     DIAGNÓSTICO: ${f.diagnostico.fenomenos.join(', ')}`);
    for (const razao of f.diagnostico.razoes) linhas.push(`       - ${razao}`);
  }
  return linhas;
}

function linhaContextoLiterario(f: RequisicaoRevisaoLiteraria['alvos'][number]): string[] {
  // O contexto serve para continuidade, não para comparar versões. Repetir ali
  // a primeira saída da IA dobra ruído e compete com as frases realmente alvo.
  return [`[${f.ordem} §${f.paragrafo}${f.inicio_paragrafo ? ' início' : ''}] ZH: ${f.texto_zh}`, `     Vigente: ${f.texto_pt}`];
}

export function usuarioRevisaoLiteraria(req: RequisicaoRevisaoLiteraria): string {
  const partes: string[] = [];
  if (req.glossario.length) partes.push('### Gama relevante — equivalências e usos aplicáveis aos alvos', formatarGlossario(req.glossario), '');
  if (req.exemplosContrastivos?.length) {
    partes.push('### Memória contrastiva recuperada — imite o critério, não a redação');
    for (const exemplo of req.exemplosContrastivos) {
      partes.push(`[cap. ${exemplo.capitulo}, frase ${exemplo.ordem}] ZH: ${exemplo.texto_zh}`);
      partes.push(`     REJEITADO: ${exemplo.texto_rejeitado}`);
      partes.push(`     APROVADO: ${exemplo.texto_aprovado}`);
      if (exemplo.justificativa) partes.push(`     RAZÃO: ${exemplo.justificativa}`);
      if (exemplo.categorias.length) partes.push(`     CATEGORIAS: ${exemplo.categorias.join(', ')}`);
    }
    partes.push('');
  }
  if (req.contextoAntes.length) {
    partes.push('### Contexto anterior — não propor mudanças');
    for (const f of req.contextoAntes) partes.push(...linhaContextoLiterario(f));
    partes.push('');
  }
  partes.push('### Frases-alvo');
  for (const f of req.alvos) partes.push(...linhaRevisaoLiteraria(f));
  if (req.contextoDepois.length) {
    partes.push('', '### Contexto posterior — não propor mudanças');
    for (const f of req.contextoDepois) partes.push(...linhaContextoLiterario(f));
  }
  return partes.join('\n');
}

export function sistemaAdjudicacaoLiterariaPartes(req: Pick<RequisicaoAdjudicacaoLiteraria, 'omega'>): PartesSistema {
  const operacional = [
    '## TAREFA: ADJUDICAÇÃO LITERÁRIA INDEPENDENTE',
    'Para cada item, compare TEXTO VIGENTE e CANDIDATO contra o CHINÊS e o contexto.',
    'Julgue melhora apenas quando o candidato for simultaneamente fiel, natural em português brasileiro e superior sem mudar o tom local evidenciado pelo original.',
    'Avalie explicitamente voz, oralidade/formalidade, densidade sintática, ritmo, distância emocional e intensidade. Naturalidade não autoriza simplificar, modernizar, formalizar, ornamentar ou uniformizar o texto.',
    'Use equivalente quando só houver preferência pessoal ou variação sem ganho; use regressao diante de perda, invenção, normalização de tom, palavra desnecessariamente rara, frase truncada ou piora de ritmo; use incerto quando o contexto não permitir decidir.',
    'Não favoreça o candidato por ser mais novo. Não reescreva nenhum texto. Identifique concretamente o que ganhou ou perdeu.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
  return { base: req.omega.trim(), operacional };
}

export function sistemaAdjudicacaoLiteraria(req: Pick<RequisicaoAdjudicacaoLiteraria, 'omega'>): string {
  return juntarPartes(sistemaAdjudicacaoLiterariaPartes(req));
}

export function usuarioAdjudicacaoLiteraria(req: RequisicaoAdjudicacaoLiteraria): string {
  const partes: string[] = [];
  if (req.glossario.length) partes.push(formatarGlossario(req.glossario), '');
  if (req.contextoAntes.length) {
    partes.push('### Contexto anterior');
    for (const f of req.contextoAntes) partes.push(`[${f.ordem}] ${f.texto_pt}`);
    partes.push('');
  }
  partes.push('### Comparações');
  for (const f of req.comparacoes) {
    partes.push(`[${f.ordem}] ZH: ${f.texto_zh}`);
    partes.push(`     VIGENTE: ${f.texto_vigente}`);
    partes.push(`     CANDIDATO: ${f.texto_candidato}`);
  }
  if (req.contextoDepois.length) {
    partes.push('', '### Contexto posterior');
    for (const f of req.contextoDepois) partes.push(`[${f.ordem}] ${f.texto_pt}`);
  }
  return partes.join('\n');
}

// Os JSON Schemas da saída estruturada e as instruções textuais de formato
// vivem em contratos.ts (fonte única — M7 da auditoria).
