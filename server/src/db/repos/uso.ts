import type { BancoDados } from '../index.js';

/** Data local YYYY-MM-DD — cotas diárias dos provedores renovam por dia-calendário. */
export function dataLocalHoje(): string {
  return new Date().toLocaleDateString('sv');
}

export const reposUso = {
  registrar(db: BancoDados, provedor: string, modelo: string): void {
    db.prepare(
      `INSERT INTO uso_ia (data, provedor, modelo, requisicoes) VALUES (?, ?, ?, 1)
       ON CONFLICT (data, provedor, modelo) DO UPDATE SET requisicoes = requisicoes + 1`,
    ).run(dataLocalHoje(), provedor, modelo);
  },

  hoje(db: BancoDados): { provedor: string; modelo: string; requisicoes: number }[] {
    return db
      .prepare('SELECT provedor, modelo, requisicoes FROM uso_ia WHERE data = ? ORDER BY requisicoes DESC')
      .all(dataLocalHoje()) as { provedor: string; modelo: string; requisicoes: number }[];
  },
};
