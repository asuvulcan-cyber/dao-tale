// Detecta se uma edição manual foi uma troca pontual de termo ("Nuwa" → "Nüwa"),
// para oferecer a correção rápida nas outras frases. Reescritas maiores (mais de
// um trecho alterado, trecho longo, quebra de linha) devolvem null — propagar
// essas seria perigoso.

const LETRA = /[\p{L}\p{N}]/u;

export function extrairTroca(antes: string, depois: string): { de: string; para: string } | null {
  if (!antes || antes === depois) return null;

  // Miolo alterado: descarta o prefixo e o sufixo comuns.
  let ini = 0;
  const menor = Math.min(antes.length, depois.length);
  while (ini < menor && antes[ini] === depois[ini]) ini++;
  let fimA = antes.length;
  let fimD = depois.length;
  while (fimA > ini && fimD > ini && antes[fimA - 1] === depois[fimD - 1]) {
    fimA--;
    fimD--;
  }

  // Expande até fronteiras de palavra: em "Nuwa"→"Nüwa" o miolo é só "u"→"ü",
  // e substituir "u" solto pela obra inteira seria um desastre. O prefixo e o
  // sufixo expandidos são idênticos nos dois textos, então os índices valem
  // para ambos.
  while (ini > 0 && LETRA.test(antes[ini - 1])) ini--;
  let extra = 0;
  while (fimA + extra < antes.length && LETRA.test(antes[fimA + extra])) extra++;

  const de = antes.slice(ini, fimA + extra);
  const para = depois.slice(ini, fimD + extra);

  if (!de.trim() || de === para) return null;
  if (de.length < 2 || de.length > 40 || de.includes('\n')) return null;
  if (!LETRA.test(de)) return null; // só pontuação/espaço — não é termo
  // Um termo não atravessa frases nem passa de umas poucas palavras —
  // acima disso foi reescrita, e propagar reescrita não faz sentido.
  if (/[.!?…;:]/.test(de)) return null;
  if (de.trim().split(/\s+/).length > 4) return null;
  // "para" contendo "de" (ex.: "Deus" → "Deus do jogo") tornaria a aplicação
  // em lote não idempotente: frases já corrigidas seriam corrigidas de novo.
  if (para.includes(de)) return null;
  return { de, para };
}
