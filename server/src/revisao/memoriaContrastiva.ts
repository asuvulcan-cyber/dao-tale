import type { EntradaGlossario } from '@dao-tale/shared';
import type { AlvoRevisaoLiteraria, ExemploContrastivo } from '../ia/provedor.js';

const FORMAIS = /\b(?:nutrindo|alimentando|tais|desferiu|permaneceu|contemplou|fitou|tragicamente|inequívoco|doravante|deveras)\b/giu;
const TIQUES = /\b(?:tornou a|passou a|pôs-se a|tinha\s+\p{L}+(?:ado|ido))\b/giu;
const PALAVRA = /[\p{L}\p{N}]+/gu;

function tokens(texto: string): Set<string> {
  return new Set((texto.toLocaleLowerCase('pt-BR').match(PALAVRA) ?? []).filter((t) => t.length >= 4));
}

function intersecao(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const item of a) if (b.has(item)) n += 1;
  return n;
}

function categoriaNormalizada(categoria: string): string {
  const c = categoria.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
  if (c === 'glossario') return 'gama';
  if (c === 'voz' || c === 'tratamento') return 'dialogo';
  if (c === 'acao' || c === 'precisao' || c === 'clareza') return 'fidelidade';
  if (c === 'tempo verbal') return 'coesao';
  return c;
}

function categoriasProvaveis(alvos: AlvoRevisaoLiteraria[]): Set<string> {
  const resultado = new Set<string>();
  const texto = alvos.map((a) => a.texto_pt).join('\n');
  if (FORMAIS.test(texto)) resultado.add('lexico');
  FORMAIS.lastIndex = 0;
  if (TIQUES.test(texto)) resultado.add('ritmo');
  TIQUES.lastIndex = 0;
  if (/["“”]/u.test(texto)) resultado.add('dialogo');
  return resultado;
}

/** Recupera poucos exemplos humanos de calibração. O algoritmo é deliberadamente
 * simples e determinístico: categoria, vocabulário PT e termos Gama compartilhados.
 * Referências da partição de teste nunca devem entrar em `memoria`. */
export function selecionarMemoriaContrastiva(
  alvos: AlvoRevisaoLiteraria[],
  memoria: ExemploContrastivo[],
  glossario: EntradaGlossario[],
  limite = 4,
): ExemploContrastivo[] {
  if (limite <= 0 || memoria.length === 0) return [];
  const categorias = categoriasProvaveis(alvos);
  const tokensAlvo = tokens(alvos.map((a) => a.texto_pt).join(' '));
  const zhAlvo = alvos.map((a) => a.texto_zh).join('');
  const termosAlvo = glossario.filter((g) => zhAlvo.includes(g.termo_zh)).map((g) => g.termo_zh);

  return memoria
    .map((exemplo) => {
      let pontos = exemplo.categorias.map(categoriaNormalizada).filter((c) => categorias.has(c)).length * 4;
      pontos += Math.min(4, intersecao(tokensAlvo, tokens(exemplo.texto_rejeitado)));
      pontos += termosAlvo.filter((termo) => exemplo.texto_zh.includes(termo)).length * 6;
      if (/["“”]/u.test(alvos.map((a) => a.texto_pt).join('')) === /["“”]/u.test(exemplo.texto_rejeitado)) pontos += 1;
      return { exemplo, pontos };
    })
    .sort((a, b) => b.pontos - a.pontos || a.exemplo.capitulo - b.exemplo.capitulo || a.exemplo.ordem - b.exemplo.ordem)
    .slice(0, limite)
    .map((x) => x.exemplo);
}
