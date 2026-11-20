import type { ModeloInfo } from '@dao-tale/shared';

// Classificação local dos modelos listados pela API do provedor: o que serve
// para tradução de texto, o que é recomendado e uma descrição curta de
// custo/qualidade. Baseada em padrões dos ids (famílias), não em versões
// específicas — modelos novos caem no grupo certo sem precisar atualizar aqui.

export interface ModeloClassificado extends ModeloInfo {
  grupo: 'recomendado' | 'outro';
  descricao: string;
}

/** Modelos que não geram texto (áudio, imagem, robótica…) ficam fora do seletor. */
const NAO_TEXTO = /tts|image|imagen|banana|robotics|computer-use|embedding|veo|audio|live|omni/i;

function descreverGemini(id: string): { descricao: string; recomendado: boolean } {
  const previa = /preview|exp/.test(id);
  const sufixo = previa ? ' Versão prévia — pode mudar ou ser desativada sem aviso.' : '';
  if (/flash-lite|flash_lite/.test(id)) {
    return {
      descricao: `O mais barato e rápido da geração — qualidade menor; serve para rascunho ou volume alto.${sufixo}`,
      recomendado: !previa,
    };
  }
  if (/flash/.test(id)) {
    return {
      descricao: `Equilíbrio entre qualidade e custo — boa escolha para tradução; na cota gratuita é o que tem os limites diários mais generosos.${sufixo}`,
      recomendado: !previa,
    };
  }
  if (/pro/.test(id)) {
    return {
      descricao: `Qualidade máxima — mais caro e mais lento; na cota gratuita o limite diário é bem menor.${sufixo}`,
      recomendado: !previa,
    };
  }
  return { descricao: `Modelo de texto sem família conhecida.${sufixo}`, recomendado: false };
}

function descreverClaude(id: string): { descricao: string; recomendado: boolean } {
  if (/opus|fable|mythos/.test(id)) {
    return { descricao: 'Qualidade máxima — o mais caro da família.', recomendado: true };
  }
  if (/sonnet/.test(id)) {
    return { descricao: 'Equilíbrio entre qualidade e custo — boa escolha para tradução.', recomendado: true };
  }
  if (/haiku/.test(id)) {
    return { descricao: 'O mais barato e rápido — qualidade menor; serve para rascunho.', recomendado: true };
  }
  return { descricao: 'Modelo de texto da Anthropic.', recomendado: false };
}

// Claude pela assinatura: os três apelidos do Claude Code. As descrições vêm da
// comparação no cap. 1 do Sutra dos Mortos (20/11/2026), lida frase a frase.
function descreverClaudeCode(id: string): { descricao: string; recomendado: boolean } {
  if (/opus/.test(id)) {
    return {
      descricao:
        'O melhor na comparação: tempo verbal estável, unidades convertidas e expressões naturalizadas. Gasta o limite do plano cerca de 2× mais rápido que o Sonnet. Indicado para tradução, revisão e contracapa.',
      recomendado: true,
    };
  }
  if (/sonnet/.test(id)) {
    return {
      descricao:
        'Fluente e mais rápido, mas na tradução deixou unidades sem converter e expressões ao pé da letra. Usado no QA, como segunda opinião de um modelo diferente do tradutor.',
      recomendado: true,
    };
  }
  if (/haiku/.test(id)) {
    return {
      descricao: 'O mais leve. Na tradução escorregou no tempo verbal e no tratamento; serve para tarefas curtas.',
      recomendado: false,
    };
  }
  return { descricao: 'Modelo do Claude pela assinatura.', recomendado: false };
}

function descreverDeepSeek(id: string): { descricao: string; recomendado: boolean } {
  if (/flash|chat/.test(id)) {
    return { descricao: 'Muito barato e forte em chinês — excelente custo-benefício para tradução.', recomendado: true };
  }
  if (/pro|reasoner/.test(id)) {
    return { descricao: 'Mais capaz (com raciocínio) — mais caro e mais lento; bom para revisão.', recomendado: true };
  }
  return { descricao: 'Modelo de texto da DeepSeek.', recomendado: false };
}

function descreverOpenRouter(id: string): { descricao: string; recomendado: boolean } {
  if (id.startsWith('~')) {
    return { descricao: 'Apelido sempre-atual do fabricante — pago, cobrado pelos créditos do OpenRouter.', recomendado: false };
  }
  if (id.endsWith(':free')) {
    const zh = /deepseek|qwen|glm|kimi|moonshot/.test(id) ? ' Família forte em chinês.' : '';
    return { descricao: `Gratuito no OpenRouter (50 req/dia sem créditos; 1000 com US$ 10 de recarga).${zh}`, recomendado: true };
  }
  if (/deepseek|qwen|glm|kimi|moonshot|minimax/.test(id)) {
    return { descricao: 'Família forte em chinês — pago, cobrado pelos créditos do OpenRouter.', recomendado: false };
  }
  return { descricao: 'Modelo pago via créditos do OpenRouter.', recomendado: false };
}

function descreverGroq(id: string): { descricao: string; recomendado: boolean } {
  if (/qwen/.test(id)) {
    return { descricao: 'Família forte em chinês — rápido no Groq, com faixa gratuita diária.', recomendado: true };
  }
  if (/llama-3\.3|llama-4|gpt-oss/.test(id)) {
    return { descricao: 'Modelo aberto veloz — na faixa gratuita do Groq serve bem para rascunho.', recomendado: true };
  }
  return { descricao: 'Modelo de texto servido pelo Groq.', recomendado: false };
}

function descreverMistral(id: string): { descricao: string; recomendado: boolean } {
  if (/large/.test(id)) return { descricao: 'O mais capaz da Mistral — coberto pelo tier gratuito de experimentação.', recomendado: true };
  if (/small|medium/.test(id)) {
    return { descricao: 'Equilíbrio entre qualidade e custo — coberto pelo tier gratuito de experimentação.', recomendado: true };
  }
  return { descricao: 'Modelo de texto da Mistral.', recomendado: false };
}

/** Extrai o número de geração do id (ex.: gemini-2.5-flash → 2.5) para ordenar. */
function geracao(id: string): number {
  const m = id.match(/-(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

export function classificarModelos(provedor: string, modelos: ModeloInfo[]): ModeloClassificado[] {
  const texto = modelos.filter((m) => !NAO_TEXTO.test(m.id) && !NAO_TEXTO.test(m.nome));

  const descritores: Record<string, (id: string) => { descricao: string; recomendado: boolean }> = {
    gemini: descreverGemini,
    'claude-code': descreverClaudeCode,
    claude: descreverClaude,
    deepseek: descreverDeepSeek,
    openrouter: descreverOpenRouter,
    groq: descreverGroq,
    mistral: descreverMistral,
  };

  const classificados = texto.map((m) => {
    const info = descritores[provedor]
      ? descritores[provedor](m.id)
      : { descricao: 'Provedor simulado — traduções de mentira, sem custo.', recomendado: true };
    // Apelidos "-latest" acompanham sempre a versão mais recente da família:
    // recomendados por natureza (não desatualizam). Os "~vendor/…" do OpenRouter
    // ficam de fora — são pagos e não devem subir acima dos gratuitos.
    const alias = /-latest$/.test(m.id) && !m.id.startsWith('~');
    return {
      ...m,
      grupo: (info.recomendado || alias ? 'recomendado' : 'outro') as 'recomendado' | 'outro',
      descricao: alias ? `${info.descricao} Este apelido aponta sempre para a versão mais recente da família.` : info.descricao,
    };
  });

  // Recomendados primeiro, cada grupo da geração mais nova para a mais antiga.
  return classificados.sort((a, b) => {
    if (a.grupo !== b.grupo) return a.grupo === 'recomendado' ? -1 : 1;
    return geracao(b.id) - geracao(a.id);
  });
}
