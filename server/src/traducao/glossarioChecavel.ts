import type { EntradaGlossario } from '@dao-tale/shared';

/** Separa o que a varredura de consistência PODE checar do que ela erraria.
 *
 *  A varredura pergunta "o chinês tem o termo, logo o português tem o canônico?".
 *  Para um homógrafo essa pergunta está errada na maioria das vezes: 小心 é
 *  "cuidado" em 7 das 8 ocorrências da obra 1, e a criada Xiao Xin em 1.
 *
 *  A separação é aqui, no chamador, e NÃO dentro de `varrerConsistencia`: aquela
 *  função é pura e usada por cinco pontos, e mexer nela para acomodar um caso de
 *  glossário misturaria duas responsabilidades. */
export function separarPorChecagem(glossario: EntradaGlossario[]): {
  checaveis: EntradaGlossario[];
  ambiguos: EntradaGlossario[];
} {
  return {
    checaveis: glossario.filter((e) => !e.ambiguo),
    ambiguos: glossario.filter((e) => e.ambiguo),
  };
}
