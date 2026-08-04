import type { EntradaGlossario } from '@dao-tale/shared';

// Glossário como APÊNDICE do livro (doc 12 §5). Num wuxia traduzido, nomes,
// seitas, técnicas e armas são metade do que confunde quem chega — o glossário
// já existe no aplicativo como instrumento de consistência da tradução, e como
// apêndice ele vira o que o leitor consulta.
//
// Uma fonte só para os três alvos (EPUB, Markdown e PDF/HTML): quem monta o
// arquivo escolhe a embalagem, mas a ordem, o agrupamento e o que entra são
// decididos aqui.

export const TITULO_GLOSSARIO = 'Glossário';

/** Rótulo de exibição das categorias. Categoria criada pelo usuário aparece
 *  como ele escreveu (só com a primeira letra maiúscula). */
const ROTULOS: Record<string, string> = {
  personagem: 'Personagens',
  local: 'Lugares',
  'poder-habilidade': 'Poderes e habilidades',
  entidade: 'Entidades e organizações',
  'titulo-cargo': 'Títulos e cargos',
  objeto: 'Objetos',
  outro: 'Outros',
};

export interface GrupoGlossario {
  rotulo: string;
  entradas: EntradaGlossario[];
}

/** Agrupa por categoria e ordena por termo em português — a ordem que serve a
 *  quem LÊ o livro (o app ordena por termo chinês, que serve a quem traduz).
 *  Variantes (`principal_id`) ficam de fora: no livro elas só repetiriam a
 *  entrada principal com outra grafia. */
export function agruparGlossario(entradas: EntradaGlossario[]): GrupoGlossario[] {
  const principais = entradas.filter((e) => e.principal_id == null);
  const porCategoria = new Map<string, EntradaGlossario[]>();
  for (const e of principais) {
    const cat = e.categoria || 'outro';
    (porCategoria.get(cat) ?? porCategoria.set(cat, []).get(cat)!).push(e);
  }

  const coletor = new Intl.Collator('pt-BR', { sensitivity: 'base' });
  // Categorias conhecidas na ordem de ROTULOS; as criadas pelo usuário depois,
  // em ordem alfabética, e 'outro' sempre por último.
  const conhecidas = Object.keys(ROTULOS).filter((c) => c !== 'outro');
  const presentes = [...porCategoria.keys()];
  const ordenadas = [
    ...conhecidas.filter((c) => porCategoria.has(c)),
    ...presentes.filter((c) => !ROTULOS[c]).sort(coletor.compare),
    ...(porCategoria.has('outro') ? ['outro'] : []),
  ];

  return ordenadas.map((cat) => ({
    rotulo: ROTULOS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1),
    entradas: porCategoria.get(cat)!.sort((a, b) => coletor.compare(a.termo_pt, b.termo_pt)),
  }));
}

/** Apêndice em Markdown; string vazia quando não há o que listar. */
export function glossarioMarkdown(entradas: EntradaGlossario[]): string {
  const grupos = agruparGlossario(entradas);
  if (grupos.length === 0) return '';
  const partes: string[] = [`## ${TITULO_GLOSSARIO}`];
  for (const g of grupos) {
    partes.push(`### ${g.rotulo}`);
    for (const e of g.entradas) {
      const nota = e.nota ? ` — ${e.nota}` : '';
      partes.push(`- **${e.termo_pt}** (${e.termo_zh})${nota}`);
    }
  }
  return partes.join('\n\n');
}
