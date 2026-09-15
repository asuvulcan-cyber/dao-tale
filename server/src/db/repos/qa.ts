import type { ApontamentoQa, Frase, StatusApontamentoQa } from '@dao-tale/shared';
import type { BancoDados } from '../index.js';

interface DependenciasQa {
  definirQaEm(db: BancoDados, capituloId: number): void;
  obterFrase(db: BancoDados, fraseId: number): Frase | undefined;
}

/** Mantém explícitas as duas operações de outros repositórios usadas pelo QA,
 * sem criar um ciclo entre os módulos internos e o agregador `repos.ts`. */
export function criarReposQa(deps: DependenciasQa) {
  return {
    listar(db: BancoDados, capituloId: number): ApontamentoQa[] {
      return db.prepare(
        `SELECT * FROM qa_apontamentos WHERE capitulo_id = ?
         ORDER BY CASE severidade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
                  CASE status WHEN 'pendente' THEN 0 ELSE 1 END, id`,
      ).all(capituloId) as ApontamentoQa[];
    },

    obter(db: BancoDados, id: number): ApontamentoQa | undefined {
      return db.prepare('SELECT * FROM qa_apontamentos WHERE id = ?').get(id) as ApontamentoQa | undefined;
    },

    substituirPendentes(
      db: BancoDados,
      capituloId: number,
      provedor: string,
      modelo: string,
      apontamentos: Omit<ApontamentoQa, 'id' | 'capitulo_id' | 'status' | 'provedor' | 'modelo' | 'criado_em'>[],
    ): number {
      return db.transaction(() => {
        db.prepare("DELETE FROM qa_apontamentos WHERE capitulo_id = ? AND status = 'pendente'").run(capituloId);
        const ins = db.prepare(
          `INSERT INTO qa_apontamentos (capitulo_id, frase_id, tipo, severidade, trecho_zh, observacao, sugestao, provedor, modelo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const a of apontamentos) {
          ins.run(
            capituloId,
            a.frase_id,
            a.tipo,
            a.severidade,
            a.trecho_zh,
            a.observacao,
            a.sugestao,
            provedor,
            modelo,
          );
        }
        deps.definirQaEm(db, capituloId);
        return apontamentos.length;
      })();
    },

    definirStatus(db: BancoDados, id: number, status: StatusApontamentoQa): ApontamentoQa | undefined {
      db.prepare('UPDATE qa_apontamentos SET status = ? WHERE id = ?').run(status, id);
      return this.obter(db, id);
    },

    aplicarSugestao(
      db: BancoDados,
      id: number,
    ): { apontamento: ApontamentoQa; frase: Frase } | 'sem-sugestao' | undefined {
      const a = this.obter(db, id);
      if (!a) return undefined;
      if (!a.sugestao || !a.frase_id) return 'sem-sugestao';
      return db.transaction(() => {
        db.prepare(
          "UPDATE frases SET texto_pt = ?, editado_manualmente = 1, origem_edicao = 'qa' WHERE id = ?",
        ).run(a.sugestao, a.frase_id);
        db.prepare("UPDATE qa_apontamentos SET status = 'aceito' WHERE id = ?").run(id);
        return { apontamento: this.obter(db, id)!, frase: deps.obterFrase(db, a.frase_id!)! };
      })();
    },

    pendentesPorCapitulo(db: BancoDados, obraId: number): Map<number, { total: number; altas: number }> {
      const linhas = db.prepare(
        `SELECT q.capitulo_id, COUNT(*) AS total,
           SUM(CASE WHEN q.severidade = 'alta' THEN 1 ELSE 0 END) AS altas
         FROM qa_apontamentos q JOIN capitulos c ON c.id = q.capitulo_id
         WHERE c.obra_id = ? AND q.status = 'pendente' GROUP BY q.capitulo_id`,
      ).all(obraId) as { capitulo_id: number; total: number; altas: number }[];
      return new Map(linhas.map((l) => [l.capitulo_id, { total: l.total, altas: l.altas }]));
    },
  };
}
