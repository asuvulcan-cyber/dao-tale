import type { CasoTeste } from '@dao-tale/shared';

/** Agrupa os casos de uma frase em fios de réplica: cada fio vai da raiz à folha,
    e os fios vêm do mais recente para o mais antigo. Caso cujo pai não está na
    lista (import parcial) vira raiz — sumir da tela seria pior que ficar solto. */
export function agruparEmFios(casos: CasoTeste[]): CasoTeste[][] {
  const porId = new Map(casos.map((c) => [c.id, c]));
  const filhos = new Map<number, CasoTeste[]>();
  const raizes: CasoTeste[] = [];
  for (const c of casos) {
    if (c.caso_pai_id != null && porId.has(c.caso_pai_id)) {
      filhos.set(c.caso_pai_id, [...(filhos.get(c.caso_pai_id) ?? []), c]);
    } else {
      raizes.push(c);
    }
  }
  const cadeia = (raiz: CasoTeste): CasoTeste[] => {
    const fio = [raiz];
    for (let atual = raiz; ; ) {
      const proximo = (filhos.get(atual.id) ?? []).sort((a, b) => a.criado_em.localeCompare(b.criado_em))[0];
      if (!proximo) return fio;
      fio.push(proximo);
      atual = proximo;
    }
  };
  return raizes
    .map(cadeia)
    .sort((a, b) => b.at(-1)!.criado_em.localeCompare(a.at(-1)!.criado_em));
}
