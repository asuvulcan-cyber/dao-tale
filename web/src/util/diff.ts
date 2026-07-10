// Diff linha a linha por subsequência comum mais longa (LCS).
// Suficiente para prompts mãe (centenas de linhas); sem dependências.

export interface LinhaDiff {
  tipo: 'igual' | 'adicionada' | 'removida';
  texto: string;
}

export function diffLinhas(antes: string, depois: string): LinhaDiff[] {
  const a = antes.split('\n');
  const b = depois.split('\n');
  const n = a.length;
  const m = b.length;

  // lcs[i][j] = tamanho da LCS de a[i..] e b[j..]
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const resultado: LinhaDiff[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      resultado.push({ tipo: 'igual', texto: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      resultado.push({ tipo: 'removida', texto: a[i] });
      i++;
    } else {
      resultado.push({ tipo: 'adicionada', texto: b[j] });
      j++;
    }
  }
  while (i < n) resultado.push({ tipo: 'removida', texto: a[i++] });
  while (j < m) resultado.push({ tipo: 'adicionada', texto: b[j++] });
  return resultado;
}
