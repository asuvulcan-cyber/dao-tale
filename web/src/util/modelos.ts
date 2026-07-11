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
const NAO_TEXTO = /tts|image|imagen|banana|robotics|computer-use|embedding|veo|audio|live/i;

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

/** Extrai o número de geração do id (ex.: gemini-2.5-flash → 2.5) para ordenar. */
function geracao(id: string): number {
  const m = id.match(/-(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

export function classificarModelos(provedor: string, modelos: ModeloInfo[]): ModeloClassificado[] {
  const texto = modelos.filter((m) => !NAO_TEXTO.test(m.id) && !NAO_TEXTO.test(m.nome));

  const classificados = texto.map((m) => {
    const info =
      provedor === 'gemini'
        ? descreverGemini(m.id)
        : provedor === 'claude'
          ? descreverClaude(m.id)
          : { descricao: 'Provedor simulado — traduções de mentira, sem custo.', recomendado: true };
    // Apelidos "-latest" acompanham sempre a versão mais recente da família:
    // recomendados por natureza (não desatualizam).
    const alias = /-latest$/.test(m.id);
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
