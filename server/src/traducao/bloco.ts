import type { EntradaGlossario, Frase } from '@dao-tale/shared';
import { filtrarGlossarioRelevante, incluirPrincipais } from '../ia/prompts.js';
import type { RequisicaoTraducaoBloco } from '../ia/provedor.js';

// Montagem pura do contexto de um bloco de tradução (doc 09 §8 / M8 da
// auditoria): separada da orquestração para ser testável isoladamente e
// reutilizável pelos passes futuros (QA, análise prévia).

export interface ParametrosBloco {
  /** Todas as frases do capítulo, em ordem. */
  todas: Frase[];
  glossario: EntradaGlossario[];
  /** Termos adotados pela IA em blocos anteriores do mesmo job (zh → pt). */
  termosAdotados: ReadonlyMap<string, string>;
  /** Título do capítulo ainda por traduzir (undefined se já resolvido). */
  titulo: string | undefined;
  modelo: string;
  promptMae: string;
  tamanhoBloco: number;
  caudaContexto: number;
  glossarioRelevante: boolean;
}

export interface ContextoBloco {
  /** Frases pendentes que entram nesta chamada (vazio num job só de título). */
  bloco: Frase[];
  primeiraOrdem: number;
  ultimaOrdem: number;
  req: RequisicaoTraducaoBloco;
}

export function montarBloco(p: ParametrosBloco): ContextoBloco {
  const pendentes = p.todas.filter((f) => f.status_traducao === 'pendente');

  // Bloco pode ser vazio quando só o título falta (capítulo já traduzido):
  // as ordens-sentinela deixam a cauda com o fim do capítulo e zero "próximas".
  const bloco = pendentes.slice(0, p.tamanhoBloco);
  const primeiraOrdem = bloco[0]?.ordem ?? p.todas.length;
  const ultimaOrdem = bloco[bloco.length - 1]?.ordem ?? p.todas.length;

  // Cauda: últimas N frases traduzidas imediatamente antes do bloco.
  const caudaAnterior = p.todas
    .filter((f) => f.ordem < primeiraOrdem && f.status_traducao === 'traduzida')
    .slice(-p.caudaContexto)
    .map((f) => ({ texto_zh: f.texto_zh, texto_pt: f.texto_pt }));

  // Contexto futuro: próximas N frases em chinês após o bloco.
  const proximas = p.todas
    .filter((f) => f.ordem > ultimaOrdem)
    .slice(0, p.caudaContexto)
    .map((f) => f.texto_zh);

  // Glossário relevante: só os termos que aparecem no trecho enviado — em
  // glossários grandes isso corta a maior parte dos tokens de entrada.
  const glossarioDoBloco = p.glossarioRelevante
    ? incluirPrincipais(
        filtrarGlossarioRelevante(p.glossario, [
          p.titulo,
          ...bloco.map((f) => f.texto_zh),
          ...caudaAnterior.map((f) => f.texto_zh),
          ...proximas,
        ]),
        p.glossario,
      )
    : p.glossario;

  // Termos adotados que aparecem neste trecho e ainda não entraram no glossário
  // (se o usuário aprovou o termo no meio do job, a versão do glossário vence).
  const noGlossario = new Set(p.glossario.map((e) => e.termo_zh));
  const corpoDoBloco = [p.titulo, ...bloco.map((f) => f.texto_zh), ...proximas].filter(Boolean).join('\n');
  const termosAdotadosDoBloco = [...p.termosAdotados]
    .filter(([zh]) => !noGlossario.has(zh) && corpoDoBloco.includes(zh))
    .map(([termo_zh, termo_pt]) => ({ termo_zh, termo_pt }));

  return {
    bloco,
    primeiraOrdem,
    ultimaOrdem,
    req: {
      modelo: p.modelo,
      promptMae: p.promptMae,
      glossario: glossarioDoBloco,
      glossarioNoUsuario: p.glossarioRelevante,
      termosAdotados: termosAdotadosDoBloco,
      titulo: p.titulo,
      caudaAnterior,
      frases: bloco.map((f) => ({ ordem: f.ordem, texto_zh: f.texto_zh })),
      proximas,
    },
  };
}
