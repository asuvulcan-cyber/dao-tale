import type { EntradaGlossario } from '@dao-tale/shared';
import type {
  RequisicaoExtrairTermos,
  RequisicaoQa,
  RequisicaoRefinarPrompt,
  RequisicaoRevisao,
  RequisicaoTraducaoBloco,
} from './provedor.js';

// Montagem dos textos de sistema e usuário — compartilhada por todos os provedores.
// O bloco de sistema é idêntico em todas as chamadas de um capítulo (pré-requisito do prompt caching).

function formatarGlossario(glossario: EntradaGlossario[]): string {
  if (glossario.length === 0) return '(glossário ainda vazio)';
  const porId = new Map(glossario.map((e) => [e.id, e]));
  return glossario
    .map((e) => {
      let linha = `${e.termo_zh} → ${e.termo_pt} [${e.categoria}]${e.nota ? ` — ${e.nota}` : ''}`;
      // Variante: diz ao modelo que aponta para o mesmo referente da canônica,
      // ajudando a resolver referências (ex.: apelido/forma curta do nome).
      if (e.principal_id != null) {
        const p = porId.get(e.principal_id);
        linha += p ? ` · variante de ${p.termo_pt} (${p.termo_zh})` : ' · variante';
      }
      return linha;
    })
    .join('\n');
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
    não ajuda a traduzir este trecho e só gastaria tokens. */
export function filtrarGlossarioRelevante(
  glossario: EntradaGlossario[],
  textos: (string | undefined | null)[],
): EntradaGlossario[] {
  const corpo = textos.filter(Boolean).join('\n');
  return glossario.filter((e) => corpo.includes(e.termo_zh));
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
  req: Pick<RequisicaoTraducaoBloco, 'promptMae' | 'glossario' | 'glossarioNoUsuario' | 'modo'>,
): PartesSistema {
  const instrucoes =
    req.modo === 'detalhes'
      ? // Título/sinopse de obra: a sinopse chega já quebrada em parágrafos numerados
        // (modelos pequenos só devolviam o 1º parágrafo quando ela ia como item único).
        [
          'Você receberá itens numerados: o título da obra e/ou os parágrafos da sinopse, em chinês, para traduzir ao português brasileiro, seguindo integralmente as regras acima.',
          'Traduza CADA item numerado POR COMPLETO, mantendo o número. Não resuma, não corte e não omita nada.',
          '- Título da obra: traduza como título — conciso, evocativo e natural em PT-BR.',
          '- Parágrafos da sinopse: cada parágrafo vem como um item separado; traduza todos, com tom de contracapa e mantendo o encadeamento entre eles.',
          'Devolva um item traduzido para cada número recebido — nenhum pode faltar.',
          'Se encontrar termos novos relevantes (nomes próprios, técnicas, lugares, títulos) que NÃO estão no glossário, liste-os em termos_novos com a tradução que você adotou.',
          'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
        ]
      : [
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
  return { base: req.promptMae.trim(), operacional };
}

export function sistemaTraducao(req: Pick<RequisicaoTraducaoBloco, 'promptMae' | 'glossario' | 'glossarioNoUsuario' | 'modo'>): string {
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
  partes.push(req.modo === 'detalhes' ? '### Itens a traduzir:' : '### Frases a traduzir:');
  if (req.titulo) partes.push(`[-1] ${req.titulo} (título do capítulo — traduza como título)`);
  for (const f of req.frases) partes.push(f.rotulo ? `[${f.ordem}] (${f.rotulo})\n${f.texto_zh}` : `[${f.ordem}] ${f.texto_zh}`);
  if (req.proximas.length > 0) {
    partes.push('');
    partes.push('### Contexto futuro (apenas referência — não traduzir):');
    for (const zh of req.proximas) partes.push(zh);
  }
  return partes.join('\n');
}

export function sistemaRevisaoPartes(req: Pick<RequisicaoRevisao, 'promptMae' | 'glossario' | 'glossarioNoUsuario'>): PartesSistema {
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
    'Avalie a tradução questionada contra o texto-fonte chinês, as regras do prompt da obra e o glossário.',
    'Responda exclusivamente pelo formato estruturado, preenchendo:',
    '- trecho_zh: o trecho EXATO do chinês que fundamenta sua análise;',
    '- veredito: "correto" se a tradução atual está adequada, "incorreto" se precisa de correção;',
    '- justificativa: explicação objetiva citando a regra/seção do prompt da obra aplicável;',
    '- secao_regra: identificador curto e estável da seção/regra citada (ex.: "3.2-nomes-proprios"); use "geral" se nenhuma regra específica se aplica;',
    '- correcao_proposta: a frase COMPLETA corrigida em PT-BR se veredito for "incorreto"; null se "correto".',
  ].join('\n');
  return { base: req.promptMae.trim(), operacional };
}

export function sistemaRevisao(req: Pick<RequisicaoRevisao, 'promptMae' | 'glossario' | 'glossarioNoUsuario'>): string {
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
  partes.push('### PERGUNTA DO USUÁRIO:');
  partes.push(req.pergunta);
  return partes.join('\n');
}

// ── Extração exaustiva de termos de uma frase ──────────────────────────────

export function sistemaExtrairTermosPartes(
  req: Pick<RequisicaoExtrairTermos, 'promptMae' | 'glossario' | 'glossarioNoUsuario'>,
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
  return { base: req.promptMae.trim(), operacional };
}

export function sistemaExtrairTermos(req: Pick<RequisicaoExtrairTermos, 'promptMae' | 'glossario' | 'glossarioNoUsuario'>): string {
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

export function sistemaQaPartes(req: Pick<RequisicaoQa, 'promptMae' | 'glossario' | 'glossarioNoUsuario'>): PartesSistema {
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
  return { base: req.promptMae.trim(), operacional };
}

export function sistemaQa(req: Pick<RequisicaoQa, 'promptMae' | 'glossario' | 'glossarioNoUsuario'>): string {
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

export function sistemaRefinarPromptPartes(req: Pick<RequisicaoRefinarPrompt, 'promptMae' | 'deltaAtual'>): PartesSistema {
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
    '- NÃO reescreva regras que já funcionam; NÃO proponha nada genérico que a Seção 4 já cubra.',
    'Para cada proposta devolva: secao_regra (o identificador dos casos que a motivaram), regra_proposta (o texto pronto para entrar nas diretrizes) e justificativa (1 frase ligando aos casos).',
    'Se os casos não sustentarem nenhuma regra nova, devolva a lista vazia.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
  return { base: req.promptMae.trim(), operacional };
}

export function sistemaRefinarPrompt(req: Pick<RequisicaoRefinarPrompt, 'promptMae' | 'deltaAtual'>): string {
  return juntarPartes(sistemaRefinarPromptPartes(req));
}

export function usuarioRefinarPrompt(req: RequisicaoRefinarPrompt): string {
  const porSecao = new Map<string, RequisicaoRefinarPrompt['casos']>();
  for (const caso of req.casos) {
    const lista = porSecao.get(caso.secao_regra) ?? [];
    lista.push(caso);
    porSecao.set(caso.secao_regra, lista);
  }
  const partes: string[] = ['### Casos recorrentes do banco de testes:'];
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
  return partes.join('\n');
}

// Os JSON Schemas da saída estruturada e as instruções textuais de formato
// vivem em contratos.ts (fonte única — M7 da auditoria).
