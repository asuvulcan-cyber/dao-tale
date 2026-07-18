import type { EntradaGlossario } from '@dao-tale/shared';
import type { RequisicaoExtrairTermos, RequisicaoRevisao, RequisicaoTraducaoBloco } from './provedor.js';

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

export function sistemaTraducao(req: Pick<RequisicaoTraducaoBloco, 'promptMae' | 'glossario' | 'glossarioNoUsuario' | 'modo'>): string {
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
  return [
    req.promptMae.trim(),
    '',
    ...(req.glossarioNoUsuario
      ? // Glossário filtrado por bloco vai na mensagem do usuário: o sistema fica
        // idêntico entre blocos (pré-requisito do prompt caching).
        ['## GLOSSÁRIO DA OBRA', 'Os termos do glossário presentes neste trecho virão na mensagem do usuário. Uso obrigatório e consistente.']
      : ['## GLOSSÁRIO DA OBRA (uso obrigatório e consistente)', formatarGlossario(req.glossario)]),
    '',
    '## INSTRUÇÕES OPERACIONAIS DO APLICATIVO',
    ...instrucoes,
  ].join('\n');
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

export function sistemaRevisao(req: Pick<RequisicaoRevisao, 'promptMae' | 'glossario'>): string {
  return [
    req.promptMae.trim(),
    '',
    '## GLOSSÁRIO DA OBRA',
    formatarGlossario(req.glossario),
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
}

export function usuarioRevisao(req: RequisicaoRevisao): string {
  const partes: string[] = [];
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

export function sistemaExtrairTermos(req: Pick<RequisicaoExtrairTermos, 'promptMae' | 'glossario'>): string {
  return [
    req.promptMae.trim(),
    '',
    '## GLOSSÁRIO ATUAL DA OBRA (já catalogado — NÃO repita estes)',
    formatarGlossario(req.glossario),
    '',
    '## TAREFA: CURADORIA DO GLOSSÁRIO',
    'Você está ajudando a curar o glossário da obra. Receberá UMA frase em chinês e sua tradução em português.',
    'Liste EXAUSTIVAMENTE todos os termos da frase que merecem entrar no glossário — nomes próprios, lugares, personagens, técnicas/poderes, títulos/cargos, entidades, organizações — mesmo os secundários ou de aparência corriqueira.',
    'Inclua nomes de lugar mantidos em pinyin (ex.: transliterações), que costumam passar despercebidos e precisam de consistência.',
    'NÃO liste: palavras comuns, verbos, adjetivos genéricos, nem termos que já estão no glossário acima.',
    'Para cada termo devolva: termo_zh (como no original), termo_pt (exatamente como aparece na tradução), categoria e uma descrição curta em PT (o que é/papel na história) para a nota do glossário.',
    'Se não houver nenhum termo novo digno de glossário, devolva a lista vazia.',
    'Responda exclusivamente pela ferramenta/formato estruturado fornecido.',
  ].join('\n');
}

export function usuarioExtrairTermos(req: RequisicaoExtrairTermos): string {
  return [`ZH: ${req.frase.texto_zh}`, `PT: ${req.frase.texto_pt || '(sem tradução)'}`].join('\n');
}

export const SCHEMA_EXTRAIR_TERMOS = {
  type: 'object' as const,
  properties: {
    termos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          termo_zh: { type: 'string' },
          termo_pt: { type: 'string' },
          categoria: {
            type: 'string',
            enum: ['local', 'poder-habilidade', 'entidade', 'titulo-cargo', 'personagem', 'outro'],
          },
          contexto: { type: 'string', description: 'Descrição curta em PT do termo, para a nota do glossário' },
        },
        required: ['termo_zh', 'termo_pt'],
      },
    },
  },
  required: ['termos'],
};

export const INSTRUCAO_JSON_EXTRAIR = [
  '## FORMATO DA RESPOSTA (obrigatório)',
  'Responda APENAS com um objeto JSON válido, sem texto fora dele e sem cercas de código, no formato:',
  '{"termos": [{"termo_zh": "<termo em chinês>", "termo_pt": "<tradução como na frase>", "categoria": "<local|poder-habilidade|entidade|titulo-cargo|personagem|outro>", "contexto": "<descrição curta em PT do termo>"}]}',
  'Se não houver termos novos, use "termos": [].',
].join('\n');

// JSON Schemas da saída estruturada (tool use / responseSchema)

export const SCHEMA_TRADUCAO = {
  type: 'object' as const,
  properties: {
    traducoes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ordem: { type: 'integer', description: 'Número da frase, exatamente como recebido' },
          texto_pt: { type: 'string', description: 'Tradução da frase em português brasileiro' },
        },
        required: ['ordem', 'texto_pt'],
      },
    },
    termos_novos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          termo_zh: { type: 'string' },
          termo_pt: { type: 'string' },
          categoria: {
            type: 'string',
            enum: ['local', 'poder-habilidade', 'entidade', 'titulo-cargo', 'personagem', 'outro'],
          },
          contexto: {
            type: 'string',
            description:
              'Descrição curta do termo em português (1 frase) para lembrança no glossário — o que é, papel na história. NÃO copie o trecho chinês.',
          },
        },
        required: ['termo_zh', 'termo_pt'],
      },
    },
  },
  required: ['traducoes', 'termos_novos'],
};

// Instruções textuais de formato para provedores compatíveis com OpenAI
// (chat completions + JSON mode) — sem tool use nem responseSchema garantidos,
// o formato precisa estar descrito no próprio prompt.

export const INSTRUCAO_JSON_TRADUCAO = [
  '## FORMATO DA RESPOSTA (obrigatório)',
  'Responda APENAS com um objeto JSON válido, sem texto fora dele e sem cercas de código, no formato:',
  '{"traducoes": [{"ordem": <número da frase, como recebido>, "texto_pt": "<tradução em PT-BR>"}],',
  ' "termos_novos": [{"termo_zh": "<termo em chinês>", "termo_pt": "<tradução adotada>", "categoria": "<local|poder-habilidade|entidade|titulo-cargo|personagem|outro>", "contexto": "<descrição curta em PT do termo, para o glossário — não o trecho chinês>"}]}',
  'Se não houver termos novos, use "termos_novos": [].',
].join('\n');

export const INSTRUCAO_JSON_REVISAO = [
  '## FORMATO DA RESPOSTA (obrigatório)',
  'Responda APENAS com um objeto JSON válido, sem texto fora dele e sem cercas de código, no formato:',
  '{"trecho_zh": "<trecho exato do chinês>", "veredito": "correto" | "incorreto",',
  ' "justificativa": "<explicação objetiva>", "secao_regra": "<id curto da regra ou \'geral\'>",',
  ' "correcao_proposta": "<frase corrigida completa>" ou null}',
].join('\n');

export const SCHEMA_REVISAO = {
  type: 'object' as const,
  properties: {
    trecho_zh: { type: 'string' },
    veredito: { type: 'string', enum: ['correto', 'incorreto'] },
    justificativa: { type: 'string' },
    secao_regra: { type: 'string' },
    correcao_proposta: { type: ['string', 'null'] },
  },
  required: ['trecho_zh', 'veredito', 'justificativa', 'secao_regra'],
};
