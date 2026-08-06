// Onde o visitante parou, por obra (doc 14 §10).
//
// Fica no aparelho, e só no aparelho. A vitrine não tem conta de leitor e não
// aceita escrita de fora (doc 14 §8) — guardar isso no servidor exigiria
// identificar quem lê, que é exatamente o que a vitrine não faz. O preço é que
// a marca não atravessa de aparelho para aparelho, e é um preço barato: quem lê
// no celular continua no celular.

const PREFIXO = 'dao-tale-leitura:';

export function lerUltimoCapitulo(obraId: string | undefined): number | undefined {
  if (!obraId) return undefined;
  try {
    const salvo = Number(localStorage.getItem(PREFIXO + obraId));
    return Number.isInteger(salvo) && salvo > 0 ? salvo : undefined;
  } catch {
    // Safari em navegação privada nega o localStorage; ficar sem a marca de
    // leitura é aceitável, quebrar a página não.
    return undefined;
  }
}

export function guardarUltimoCapitulo(obraId: string | undefined, numero: number | undefined): void {
  if (!obraId || numero === undefined) return;
  try {
    localStorage.setItem(PREFIXO + obraId, String(numero));
  } catch {
    /* idem */
  }
}
