// Segmentação de frases inglesas — irmã de `segmentar.ts` (mandarim), mesma
// máquina de estados caractere a caractere e mesmo contrato.
//
// Duas coisas que o mandarim não precisou resolver, e que são a razão de este
// arquivo existir em vez de uma tabela de pontuação a mais no outro:
//
// 1. O PONTO É AMBÍGUO. Em `。` não há dúvida; em `.` há três casos que não
//    encerram frase — abreviação ("Mr. Chen"), inicial ("J. R. R. Tolkien") e
//    abreviação desconhecida. Os dois primeiros saem por lista e por regra;
//    o terceiro sai olhando para a frente, porque minúscula depois de ponto
//    quase nunca é começo de frase.
// 2. AS ASPAS RETAS SÃO SIMÉTRICAS. `"` abre e fecha com o mesmo caractere, e
//    por isso alterna em vez de empilhar. A apóstrofe (`don't`, `John's`) usa o
//    mesmo caractere das aspas simples, então `'` NÃO delimita região — trata-la
//    como aspas quebraria quase toda frase com contração.

import type { FraseSegmentada, ResultadoSegmentacao } from './segmentar.js';

// Pares assimétricos: empilham, como no mandarim.
const PARES: Record<string, string> = {
  '“': '”',
  '‘': '’',
  '(': ')',
  '[': ']',
};

const FECHAMENTOS = new Set([...Object.values(PARES), '"', "'"]);

const PONTUACAO_FORTE = new Set(['.', '!', '?', '…']);

/** Sem o ponto final, e em minúsculas. `i.e`/`e.g` entram com o ponto interno
 *  porque é assim que o texto acumulado se apresenta no segundo ponto.
 *
 *  Nada que também seja palavra inglesa comum entra aqui. `no.` (de "número")
 *  é o exemplo que custou um teste: em prosa, `"no."` fechando uma fala é ordens
 *  de grandeza mais frequente do que a abreviação, e listá-lo fazia a frase
 *  seguinte grudar na fala. Abreviação rara perdida custa uma frase mal
 *  segmentada; palavra comum listada custa todas. */
const ABREVIACOES = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'sr', 'jr', 'rev', 'hon',
  'capt', 'lt', 'col', 'gen', 'sgt', 'maj', 'cmdr', 'adm', 'gov', 'pres',
  'vs', 'etc', 'cf', 'al', 'approx', 'inc', 'ltd',
  'vol', 'ch', 'pp', 'fig', 'dept', 'univ',
  'i.e', 'e.g', 'a.m', 'p.m', 'u.s', 'u.k',
]);

/** O ponto que acaba de entrar fecha uma abreviação ou uma inicial?
 *  `atual` é o texto da frase em construção, terminado nesse ponto. */
function pontoDeAbreviacao(atual: string): boolean {
  const m = atual.match(/(?:^|[\s("'\[“‘])([A-Za-z][A-Za-z.]*)\.$/u);
  if (!m) return false;
  const palavra = m[1];
  // Inicial de nome: uma letra só ("J. R. R."). Cobre também o primeiro ponto
  // de "i.e." e "e.g.", onde a palavra ainda é uma letra sozinha.
  if (palavra.length === 1) return true;
  return ABREVIACOES.has(palavra.toLowerCase());
}

export function segmentarEn(textoOrigem: string): ResultadoSegmentacao {
  const frases: FraseSegmentada[] = [];
  const avisos: string[] = [];

  // Um parágrafo por linha, como no mandarim; linhas em branco também separam.
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
  const chars = [...paragrafo];
  const pilha: string[] = [];
  let aspasAbertas = false;
  let atual = '';
  let desbalanceado = false;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    atual += c;

    // `encerra` separa "achei o fim da frase" de "achei pontuação forte", que no
    // inglês não são a mesma coisa — ver o caso do fecho de aspas abaixo.
    let encerra = false;
    let pontuacao = c;
    let veioDeFechamento = false;
    const anterior = chars[i - 1] ?? '';

    if (c === '"') {
      aspasAbertas = !aspasAbertas;
      // Acabou de FECHAR. Em inglês a pontuação da fala fica DENTRO das aspas
      // (`"no."`), ao contrário do mandarim (`「不行」。`), então quando o ponto
      // passou nós ainda estávamos protegidos: o fim da frase é aqui.
      if (!aspasAbertas && pilha.length === 0 && PONTUACAO_FORTE.has(anterior)) {
        encerra = true;
        pontuacao = anterior;
        veioDeFechamento = true;
      }
    } else if (PARES[c]) {
      pilha.push(PARES[c]);
    } else if (pilha.length > 0 && c === pilha[pilha.length - 1]) {
      pilha.pop();
      // Mesmo caso do fecho de aspas, para `(He left.)` e `‘Stop.’`.
      if (pilha.length === 0 && !aspasAbertas && PONTUACAO_FORTE.has(anterior)) {
        encerra = true;
        pontuacao = anterior;
        veioDeFechamento = true;
      }
    } else if (pilha.length === 0 && !aspasAbertas && PONTUACAO_FORTE.has(c)) {
      encerra = true;
    }

    if (!encerra) continue;

    // Ponto que não encerra: abreviação ou inicial. Quando o fim veio do fecho
    // de aspas, a pontuação está um caractere atrás do fim de `atual`.
    const ateAPontuacao = pontuacao === c ? atual : atual.slice(0, -1);
    if (pontuacao === '.' && pontoDeAbreviacao(ateAPontuacao)) continue;

    // Absorve a sequência: mais pontuação forte ("...", "?!") e os fechamentos
    // que pertencem à frase ("…" seguido de aspas, parêntese).
    let j = i;
    while (
      j + 1 < chars.length &&
      (PONTUACAO_FORTE.has(chars[j + 1]) || FECHAMENTOS.has(chars[j + 1]))
    ) {
      j++;
      atual += chars[j];
      if (chars[j] === '"') aspasAbertas = !aspasAbertas;
    }
    // Consumido é consumido: o que foi absorvido já está em `atual`, e o índice
    // avança AQUI — antes de qualquer saída — ou os mesmos caracteres entrariam
    // de novo na próxima volta.
    i = j;

    // Olhar à frente: minúscula depois do fim candidato quase nunca começa
    // frase. Vale em dois casos, por duas razões diferentes:
    //
    // - depois de PONTO solto, é abreviação que a lista não conhece
    //   ("approx. five", "Ave. runs north");
    // - depois de FECHAMENTO, é a oração dicendi continuando a mesma frase
    //   (`"Wait!" she shouted.`, `"Hello?" he asked.`) — o padrão mais comum do
    //   diálogo inglês, e a razão de fecho de aspas não encerrar sozinho.
    //
    // Fora daí a quebra está certa: em `Run! he shouted.` (sem aspas) o "!" é
    // pontuação expressiva e as duas frases são duas mesmo.
    if ((pontuacao === '.' || veioDeFechamento) && proximaLetraEhMinuscula(chars, i)) continue;

    const frase = atual.trim();
    if (frase) frasesDoParagrafo.push(frase);
    atual = '';
  }

  if (pilha.length > 0 || aspasAbertas) desbalanceado = true;
  const resto = atual.trim();
  if (resto) frasesDoParagrafo.push(resto);

  return { frasesDoParagrafo, desbalanceado };
}

function proximaLetraEhMinuscula(chars: string[], depois: number): boolean {
  for (let k = depois + 1; k < chars.length; k++) {
    const c = chars[k];
    if (/\s/u.test(c)) continue;
    return /\p{Ll}/u.test(c);
  }
  return false;
}
