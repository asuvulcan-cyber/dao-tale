import { normalizarSecaoRegra } from '@dao-tale/shared';
import type { BancoDados } from './index.js';

// Unificação dos rótulos de regra já gravados no banco de testes.
//
// O modelo devolve uma variação por chamada para a MESMA regra — numa obra real
// apareceram "5-mais-que-perfeito", "5.mais-que-perfeito",
// "5.estilo-mais-que-perfeito" e "mais-que-perfeito". O agrupamento já tolera
// isso (normaliza antes de contar), mas a LISTA do Banco de Testes mostra o
// rótulo cru e o filtro por seção é exato: filtrar por um rótulo escondia os
// casos gravados com as outras grafias.
//
// Regra: dentro de cada grupo equivalente, todos passam a usar a grafia MAIS
// FREQUENTE — a que a obra de fato consagrou. Idempotente por flag; a operação
// em si também converge sozinha se rodar duas vezes.

export function unificarRotulosDeRegra(db: BancoDados): number {
  const feito = db.prepare("SELECT valor FROM configuracoes WHERE chave = 'rotulos_regra_unificados'").get() as
    | { valor: string }
    | undefined;
  if (feito?.valor === '1') return 0;

  const linhas = db
    .prepare(
      `SELECT obra_id, secao_regra, COUNT(*) n FROM banco_testes
       WHERE secao_regra IS NOT NULL GROUP BY obra_id, secao_regra ORDER BY n DESC`,
    )
    .all() as { obra_id: number; secao_regra: string; n: number }[];

  // Por obra: chave normalizada → grafia vencedora (a primeira que aparece, já
  // que a consulta vem ordenada por frequência).
  const vencedor = new Map<string, string>();
  for (const l of linhas) {
    const chave = `${l.obra_id} ${normalizarSecaoRegra(l.secao_regra)}`;
    if (!vencedor.has(chave)) vencedor.set(chave, l.secao_regra);
  }

  let alterados = 0;
  db.transaction(() => {
    const atualizar = db.prepare('UPDATE banco_testes SET secao_regra = ? WHERE obra_id = ? AND secao_regra = ?');
    for (const l of linhas) {
      const alvo = vencedor.get(`${l.obra_id} ${normalizarSecaoRegra(l.secao_regra)}`);
      if (!alvo || alvo === l.secao_regra) continue;
      alterados += atualizar.run(alvo, l.obra_id, l.secao_regra).changes;
    }
    db.prepare(
      "INSERT INTO configuracoes (chave, valor) VALUES ('rotulos_regra_unificados', '1') ON CONFLICT (chave) DO UPDATE SET valor = '1'",
    ).run();
  })();
  return alterados;
}
