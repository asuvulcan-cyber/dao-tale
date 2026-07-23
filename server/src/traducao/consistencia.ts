import type { EntradaGlossario, Frase } from '@dao-tale/shared';

// Varredura reversa de consistência do glossário (doc 05 §4.2, D5): para cada
// termo do glossário presente no chinês de uma frase traduzida, a tradução PT
// deve conter o termo canônico. Função pura, sem IA — usada pela rota manual e
// pela varredura automática ao concluir o capítulo (doc 09 §3).

export interface ViolacaoConsistencia {
  frase_id: number;
  ordem: number;
  termo_zh: string;
  termo_pt: string;
  texto_zh: string;
  texto_pt: string;
}

export interface ResultadoConsistencia {
  ocorrencias: number;
  violacoes: ViolacaoConsistencia[];
  termos_curtos_ignorados: number;
}

const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

export function varrerConsistencia(frases: Frase[], glossario: EntradaGlossario[]): ResultadoConsistencia {
  // Dois filtros contra falso positivo: termos de 1 caractere (aparecem dentro
  // de dezenas de palavras comuns) e um termo que é parte de outro termo mais
  // longo também presente na frase (coberto pelo mais longo).
  const curtos = new Set(glossario.filter((g) => [...g.termo_zh].length < 2).map((g) => g.termo_zh));
  const utilizaveis = glossario.filter((g) => !curtos.has(g.termo_zh));

  const violacoes: ViolacaoConsistencia[] = [];
  let ocorrencias = 0;

  for (const f of frases) {
    if (f.status_traducao !== 'traduzida') continue;
    const presentes = utilizaveis.filter((g) => f.texto_zh.includes(g.termo_zh));
    for (const g of presentes) {
      if (presentes.some((outro) => outro.termo_zh !== g.termo_zh && outro.termo_zh.includes(g.termo_zh))) continue;
      ocorrencias++;
      if (!normalizar(f.texto_pt).includes(normalizar(g.termo_pt))) {
        violacoes.push({
          frase_id: f.id,
          ordem: f.ordem,
          termo_zh: g.termo_zh,
          termo_pt: g.termo_pt,
          texto_zh: f.texto_zh,
          texto_pt: f.texto_pt,
        });
      }
    }
  }

  return { ocorrencias, violacoes, termos_curtos_ignorados: curtos.size };
}
