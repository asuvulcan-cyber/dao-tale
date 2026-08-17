import type { EntradaGlossario } from '@dao-tale/shared';
import type {
  RequisicaoContracapa,
  RequisicaoExtrairTermos,
  RequisicaoPasseEstilo,
  RequisicaoQa,
  RequisicaoRefinarPrompt,
  RequisicaoRevisao,
  RequisicaoTraducaoBloco,
} from './provedor.js';
import { PROMPT_CONTRACAPA } from './promptContracapa.js';

// Montagem dos textos de sistema e usuário — compartilhada por todos os provedores.
// O bloco de sistema é idêntico em todas as chamadas de um capítulo (pré-requisito do prompt caching).

// As duas leis opostas do glossário (spec 2026-08-16 §2): identidade é forma fixa,
// lexical é palavra fixa com superfície livre. Medido na obra real, 杀手 saía 57 vezes
// em minúscula e 25 em maiúscula porque nada dizia qual das duas leis valia para ele.
const CABECALHO_IDENTIDADE = '### Nomes e termos fixos (use exatamente esta forma, maiúsculas inclusive)';
const CABECALHO_LEXICAL = '### Escolhas de palavra (use esta palavra; flexione número, gênero e caixa como o português pedir)';

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
  return linha;
}

export function formatarGlossario(glossario: EntradaGlossario[]): string {
  if (glossario.length === 0) return '(glossário ainda vazio)';
  const porId = new Map(glossario.map((e) => [e.id, e]));
  const linha = (e: EntradaGlossario) => linhaGlossario(e, porId);

  const lexicais = glossario.filter((e) => e.especie === 'lexical');
  if (lexicais.length === 0) {
    // Ninguém marcou nenhum termo como lexical — inclusive quem nunca abriu a
    // classificação (especie: null em todos, o estado dos 116 termos da obra real
    // hoje). Sem um lexical para contrastar, a distinção não tem o que ensinar, e a
    // saída fica idêntica à lista única de antes desta task: sem cabeçalho de bloco.
    return glossario.map(linha).join('\n');
  }

  const identidades = glossario.filter((e) => e.especie !== 'lexical');
  const blocos: string[] = [];
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
  req: Pick<RequisicaoTraducaoBloco, 'omega' | 'glossario' | 'glossarioNoUsuario'>,
): PartesSistema {
  const instrucoes = [
    'Você receberá frases numeradas em chinês para traduzir ao português brasileiro, seguindo integralmente as regras acima.',
    'Traduza cada frase numerada mantendo o número. Não traduza o contexto marcado como "já traduzido" nem o marcado como "contexto futuro".',
    'Se encontrar termos novos relevantes (nomes próprios, técnicas, lugares, títulos) que NÃO estão no glossário, liste-os em termos_novos com a tradução que você adotou.',
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
    for (const f of req.caudaAnterior) partes.push(`ZH: ${f.texto_zh}\nPT: ${f.texto_pt}`);
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
    for (const zh of req.proximas) partes.push(zh);
  }
  return partes.join('\n');
}

// ── Contracapa (título/sinopse da ficha da obra) ───────────────────────────
// A base NÃO é o prompt mãe da obra: é o prompt de contracapa fixo do app
// (`promptContracapa.ts`). O núcleo de capítulo proíbe justamente o que esta
// tarefa exige — localizar chengyu, termo de gênero e clichê de resenha. Da
// obra vem só o glossário, que continua sendo lei para nomes e termos.

export function sistemaContracapaPartes(
  req: Pick<RequisicaoContracapa, 'glossario' | 'glossarioNoUsuario' | 'tituloZh' | 'sinopseZh'>,
): PartesSistema {
  const operacional = [
    ...(req.glossarioNoUsuario
      ? ['## GLOSSÁRIO DA OBRA', 'Os termos do glossário presentes neste texto virão na mensagem do usuário. Uso obrigatório e consistente.']
      : ['## GLOSSÁRIO DA OBRA (uso obrigatório e consistente)', formatarGlossario(req.glossario)]),
    '',
    '## INSTRUÇÕES OPERACIONAIS DO APLICATIVO',
    'Você receberá o título e/ou a sinopse da obra em chinês — cada um por inteiro, sem numeração.',
    'A sinopse vem completa de uma vez: leia-a toda antes de traduzir, para que os versos e o encadeamento sejam resolvidos juntos. Traduza-a inteira, sem resumir, cortar ou omitir nada.',
    'Preencha titulo_pt com o título traduzido e sinopse_pt com a sinopse traduzida, mantendo em sinopse_pt as mesmas quebras de linha e de parágrafo do original.',
    'Deixe em null o campo cujo texto não foi enviado — nunca invente um título ou uma sinopse que você não recebeu.',
    'Os dois campos recebem o texto FINAL, pronto para a ficha da obra: sem rótulos, sem aspas em volta, sem notas e sem alternativas.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
  return { base: PROMPT_CONTRACAPA.trim(), operacional };
}

export function sistemaContracapa(
  req: Pick<RequisicaoContracapa, 'glossario' | 'glossarioNoUsuario' | 'tituloZh' | 'sinopseZh'>,
): string {
  return juntarPartes(sistemaContracapaPartes(req));
}

export function usuarioContracapa(req: RequisicaoContracapa): string {
  const partes: string[] = [];
  if (req.glossarioNoUsuario && req.glossario.length > 0) {
    partes.push('### Glossário (termos presentes neste texto — uso obrigatório):');
    partes.push(formatarGlossario(req.glossario));
    partes.push('');
  }
  if (req.tituloZh) {
    partes.push('### Título da obra (chinês):');
    partes.push(req.tituloZh);
    partes.push('');
  }
  if (req.sinopseZh) {
    // Inteira e com as quebras originais — é o que permite ver os versos juntos.
    partes.push('### Sinopse da obra (chinês, completa):');
    partes.push(req.sinopseZh);
  }
  return partes.join('\n').trimEnd();
}

export function sistemaRevisaoPartes(req: Pick<RequisicaoRevisao, 'omega' | 'glossario' | 'glossarioNoUsuario'>): PartesSistema {
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
    'Se a pergunta declara um motivo ("o original diz X", "isto soa Y", "no capítulo anterior ficou Z"), sua resposta DEVE tratar desse motivo — confirmando-o ou refutando-o pelo texto-fonte chinês. Nunca substitua o motivo do usuário por outro argumento.',
    'Se o motivo dele não procede, diga isso e mostre onde no chinês. Concordar por concordar é pior que discordar.',
    'Quando houver "Discussão até aqui", diga explicitamente se você MANTÉM ou REVISA o veredito anterior, e por quê. Repetir o argumento já contestado sem endereçar a contestação é o pior desfecho possível.',
    'Responda exclusivamente pelo formato estruturado, preenchendo:',
    '- trecho_zh: o trecho EXATO do chinês que fundamenta sua análise;',
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
  const partes: string[] = [];
  if (req.glossarioNoUsuario && req.glossario.length > 0) {
    partes.push('### Glossário (termos presentes neste trecho — uso obrigatório):');
    partes.push(formatarGlossario(req.glossario));
    partes.push('');
  }
  if (req.vizinhasAntes.length > 0) {
    partes.push('### Frases anteriores (contexto):');
    for (const f of req.vizinhasAntes) partes.push(`ZH: ${f.texto_zh}\nPT: ${f.texto_pt || '(sem tradução)'}`);
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
  partes.push(`ZH: ${req.frase.texto_zh}`);
  partes.push(`PT atual: ${req.frase.texto_pt || '(sem tradução)'}`);
  if (req.frase.texto_pt_original_ia && req.frase.texto_pt_original_ia !== req.frase.texto_pt) {
    partes.push(`PT original da IA (antes de edições): ${req.frase.texto_pt_original_ia}`);
  }
  partes.push('');
  if (req.vizinhasDepois.length > 0) {
    partes.push('### Frases seguintes (contexto):');
    for (const f of req.vizinhasDepois) partes.push(`ZH: ${f.texto_zh}\nPT: ${f.texto_pt || '(sem tradução)'}`);
    partes.push('');
  }
  partes.push('### PERGUNTA DO USUÁRIO (a premissa da sua análise — trate do motivo que ela declara):');
  partes.push(req.pergunta);
  return partes.join('\n');
}

// ── Extração exaustiva de termos de uma frase ──────────────────────────────

export function sistemaExtrairTermosPartes(
  req: Pick<RequisicaoExtrairTermos, 'omega' | 'glossario' | 'glossarioNoUsuario'>,
): PartesSistema {
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
    'Você está ajudando a curar o glossário da obra. Receberá UMA frase em chinês e sua tradução em português.',
    'Liste EXAUSTIVAMENTE todos os termos da frase que merecem entrar no glossário — nomes próprios, lugares, personagens, técnicas/poderes, títulos/cargos, entidades, organizações — mesmo os secundários ou de aparência corriqueira.',
    'Inclua nomes de lugar mantidos em pinyin (ex.: transliterações), que costumam passar despercebidos e precisam de consistência.',
    'NÃO liste: palavras comuns, verbos, adjetivos genéricos, nem termos que já estão no glossário.',
    'Para cada termo devolva: termo_zh (como no original), termo_pt (exatamente como aparece na tradução), categoria e uma descrição curta em PT (o que é/papel na história) para a nota do glossário.',
    'Se não houver nenhum termo novo digno de glossário, devolva a lista vazia.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
  return { base: req.omega.trim(), operacional };
}

export function sistemaExtrairTermos(req: Pick<RequisicaoExtrairTermos, 'omega' | 'glossario' | 'glossarioNoUsuario'>): string {
  return juntarPartes(sistemaExtrairTermosPartes(req));
}

export function usuarioExtrairTermos(req: RequisicaoExtrairTermos): string {
  const partes: string[] = [];
  if (req.glossarioNoUsuario && req.glossario.length > 0) {
    partes.push('### Termos já no glossário presentes nesta frase (NÃO repetir):');
    partes.push(formatarGlossario(req.glossario));
    partes.push('');
  }
  partes.push(`ZH: ${req.frase.texto_zh}`, `PT: ${req.frase.texto_pt || '(sem tradução)'}`);
  return partes.join('\n');
}

// ── QA por segunda IA (doc 09 §6) ──────────────────────────────────────────
// Um modelo diferente do tradutor compara cada par zh↔pt e aponta problemas nos
// quatro eixos — só aponta, nunca reescreve. Mesmo desenho de camadas/cache.

export function sistemaQaPartes(req: Pick<RequisicaoQa, 'omega' | 'glossario' | 'glossarioNoUsuario'>): PartesSistema {
  const operacional = [
    ...(req.glossarioNoUsuario
      ? ['## GLOSSÁRIO DA OBRA', 'Os termos do glossário presentes neste trecho virão na mensagem do usuário. Uso obrigatório e consistente.']
      : ['## GLOSSÁRIO DA OBRA', formatarGlossario(req.glossario)]),
    '',
    '## TAREFA: CONTROLE DE QUALIDADE (QA) DA TRADUÇÃO',
    'Você é um revisor de qualidade independente. Receberá pares de frases (chinês original + tradução em português) já traduzidos e deve APONTAR problemas — NUNCA reescrever o texto por conta própria.',
    'Analise cada par e aponte SOMENTE onde houver problema real, em um destes eixos:',
    '- glossario: termo do glossário traduzido fora do padrão canônico (inclui flexões);',
    '- pronome-genero: pronome/gênero errado ou trocado no meio do trecho (他/她/它 e concordância de adjetivos — crítico em zh→pt);',
    '- repeticao: eco anômalo (mesma tradução PT para chinês diferente) ou tique repetido de linguagem;',
    '- omissao: parte da frase chinesa sem correspondência na tradução.',
    'Para cada apontamento devolva: ordem (o número da frase), tipo (um dos eixos acima), severidade (alta/media/baixa), trecho_zh (o trecho do chinês que evidencia), observacao (o problema em uma frase) e sugestao (uma tradução corrigida completa da frase, OPCIONAL — null se preferir só apontar).',
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
  const partes: string[] = [];
  if (req.glossarioNoUsuario && req.glossario.length > 0) {
    partes.push('### Glossário (termos presentes neste trecho — padrão obrigatório):');
    partes.push(formatarGlossario(req.glossario));
    partes.push('');
  }
  if (req.caudaAnterior.length > 0) {
    partes.push('### Contexto anterior (apenas referência — NÃO apontar):');
    for (const p of req.caudaAnterior) partes.push(`ZH: ${p.texto_zh}\nPT: ${p.texto_pt}`);
    partes.push('');
  }
  partes.push('### Pares a auditar (número, chinês, tradução):');
  for (const p of req.pares) partes.push(`[${p.ordem}]\nZH: ${p.texto_zh}\nPT: ${p.texto_pt || '(sem tradução)'}`);
  return partes.join('\n');
}

// ── Refinamento semiautomático do prompt (doc 08 §7) ───────────────────────
// Casos recorrentes do banco de testes → propostas concretas de regra para o
// delta da obra. A IA propõe; o usuário edita/aprova como nova versão.

export function sistemaRefinarPromptPartes(req: Pick<RequisicaoRefinarPrompt, 'omega' | 'deltaAtual'>): PartesSistema {
  const operacional = [
    '## TAREFA: REFINAR AS DIRETRIZES DA OBRA',
    'O prompt acima rege a tradução da obra. O revisor registrou casos recorrentes em que a tradução saiu errada ou dúbia — agrupados por seção/regra, eles indicam lacunas sistemáticas das DIRETRIZES ESPECÍFICAS DA OBRA (Seção 6).',
    'As diretrizes atuais da obra são exatamente estas (vazias se nada aparecer):',
    '```',
    req.deltaAtual.trim() || '(nenhuma diretriz específica ainda)',
    '```',
    'Com base nos casos que virão na mensagem do usuário, proponha regras NOVAS ou AJUSTADAS para essas diretrizes:',
    '- Uma proposta por lacuna identificada; frase imperativa, curta e testável, no estilo das regras existentes.',
    '- A regra deve prevenir os erros dos casos apresentados sem contradizer as demais seções do prompt.',
    '- NÃO reescreva regras que já funcionam; NÃO proponha nada genérico que as seções universais já cubram.',
    '- NÃO proponha regra sobre aspas/travessão no diálogo, marcação do pensamento, mais-que-perfeito, nota do tradutor, onomatopeia ou público-alvo: isso é configuração da obra (a Seção 5, quando presente), resolvida por uma chave e não por texto de diretriz.',
    'A mensagem do usuário pode trazer casos RECUSADOS pelo revisor. Eles são correção de rumo, não material a generalizar: NÃO proponha regra que reproduza o erro apontado neles.',
    'A mensagem pode trazer CORREÇÕES QUE O REVISOR FEZ À MÃO. São o padrão que ele pratica sem pedir, e portanto o sinal mais forte — mas também o mais bruto: uma correção isolada é gosto, não regra. Só proponha regra quando o mesmo tipo de correção se repetir em casos diferentes.',
    'As fontes podem vir juntas ou separadas: casos recorrentes do banco de testes, casos recusados pelo revisor, e correções que ele fez à mão. Quando NÃO houver casos recorrentes e só vierem correções à mão, proponha um secao_regra NOVO e descritivo do padrão que você observou — não cite um identificador que não foi enviado.',
    'Para cada proposta devolva: secao_regra (o identificador dos casos que a motivaram), regra_proposta (o texto pronto para entrar nas diretrizes) e justificativa (1 frase ligando aos casos).',
    'Se os casos não sustentarem nenhuma regra nova, devolva a lista vazia.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
  return { base: req.omega.trim(), operacional };
}

export function sistemaRefinarPrompt(req: Pick<RequisicaoRefinarPrompt, 'omega' | 'deltaAtual'>): string {
  return juntarPartes(sistemaRefinarPromptPartes(req));
}

export function usuarioRefinarPrompt(
  req: Pick<RequisicaoRefinarPrompt, 'casos' | 'recusados' | 'edicoes'>,
): string {
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
        partes.push(`- ZH: ${c.trecho_zh}`);
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
      partes.push(`- ZH: ${r.trecho_zh}`);
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

// Os JSON Schemas da saída estruturada e as instruções textuais de formato
// vivem em contratos.ts (fonte única — M7 da auditoria).
