// Segmentação de frases chinesas (doc 05 §1).
// Máquina de estados caractere a caractere: pontuação forte encerra frase apenas
// fora de regiões protegidas (aspas/parênteses asiáticos); fechamentos imediatamente
// após a pontuação são absorvidos pela frase corrente.

export interface FraseSegmentada {
  texto_zh: string;
  paragrafo: number;
}

export interface ResultadoSegmentacao {
  frases: FraseSegmentada[];
  avisos: string[];
}

// abertura → fechamento esperado
const PARES: Record<string, string> = {
  '「': '」',
  '『': '』',
  '“': '”',
  '‘': '’',
  '（': '）',
  '《': '》',
  '(': ')',
  '【': '】',
};

const FECHAMENTOS = new Set(Object.values(PARES));

const PONTUACAO_FORTE = new Set(['。', '！', '？', '…', '⋯', '‼', '⁉', '!', '?']);

export function segmentar(textoOrigem: string): ResultadoSegmentacao {
  const frases: FraseSegmentada[] = [];
  const avisos: string[] = [];

  // Webnovels chinesas usam um parágrafo por linha; linhas em branco também separam.
  const paragrafos = textoOrigem
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  paragrafos.forEach((paragrafo, idx) => {
    const { frasesDoParagrafo, desbalanceado } = segmentarParagrafo(paragrafo);
    if (desbalanceado) {
      avisos.push(`Parágrafo ${idx + 1}: aspas/parênteses desbalanceados — tratado como frase única no trecho afetado.`);
    }
    for (const f of frasesDoParagrafo) {
      frases.push({ texto_zh: f, paragrafo: idx });
    }
  });

  return { frases, avisos };
}

function segmentarParagrafo(paragrafo: string): { frasesDoParagrafo: string[]; desbalanceado: boolean } {
  const frasesDoParagrafo: string[] = [];
  const chars = [...paragrafo]; // itera por code points, não por UTF-16 units
  const pilha: string[] = [];
  let atual = '';
  let desbalanceado = false;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    atual += c;

    if (PARES[c]) {
      pilha.push(PARES[c]);
      continue;
    }
    if (pilha.length > 0 && c === pilha[pilha.length - 1]) {
      pilha.pop();
      continue;
    }
    if (pilha.length === 0 && PONTUACAO_FORTE.has(c)) {
      // Absorve a sequência: mais pontuação forte (……, ？！) e fechamentos soltos (…」, 。”)
      while (
        i + 1 < chars.length &&
        (PONTUACAO_FORTE.has(chars[i + 1]) || FECHAMENTOS.has(chars[i + 1]))
      ) {
        i++;
        atual += chars[i];
      }
      const frase = atual.trim();
      if (frase) frasesDoParagrafo.push(frase);
      atual = '';
    }
  }

  // Fim do parágrafo: sobra sem pontuação vira frase; pilha aberta é zerada à força.
  if (pilha.length > 0) desbalanceado = true;
  const resto = atual.trim();
  if (resto) frasesDoParagrafo.push(resto);

  return { frasesDoParagrafo, desbalanceado };
}
