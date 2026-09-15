import type { Lote, ParProvedor, StatusLote, StatusLoteCapitulo } from '@dao-tale/shared';
import type { BancoDados } from '../index.js';

interface LinhaLote {
  id: number;
  obra_id: number;
  status: StatusLote;
  qa_automatica: number;
  criado_em: string;
  encerrado_em: string | null;
}

export const reposLotes = {
  capituloIdsEmLote(db: BancoDados, obraId: number): number[] {
    return (
      db.prepare(
        `SELECT DISTINCT lc.capitulo_id FROM lote_capitulos lc
           JOIN lotes l ON l.id = lc.lote_id WHERE l.obra_id = ?`,
      ).all(obraId) as { capitulo_id: number }[]
    ).map((l) => l.capitulo_id);
  },

  atual(db: BancoDados, obraId: number): Lote | undefined {
    const linha = db.prepare(
      `SELECT * FROM lotes WHERE obra_id = ?
       ORDER BY (status = 'executando') DESC, criado_em DESC LIMIT 1`,
    ).get(obraId) as LinhaLote | undefined;
    return linha ? this.montar(db, linha) : undefined;
  },

  obter(db: BancoDados, loteId: number): Lote | undefined {
    const linha = db.prepare('SELECT * FROM lotes WHERE id = ?').get(loteId) as LinhaLote | undefined;
    return linha ? this.montar(db, linha) : undefined;
  },

  ativoDaObra(db: BancoDados, obraId: number): Lote | undefined {
    const linha = db.prepare("SELECT * FROM lotes WHERE obra_id = ? AND status = 'executando'").get(obraId) as
      | LinhaLote
      | undefined;
    return linha ? this.montar(db, linha) : undefined;
  },

  montar(db: BancoDados, linha: LinhaLote): Lote {
    const capitulos = db.prepare(
      `SELECT lc.capitulo_id, c.numero, c.titulo, lc.posicao, lc.status, lc.provedores_tentados, lc.erro,
         (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id) AS frases_total,
         (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id AND f.status_traducao = 'traduzida') AS frases_traduzidas,
         (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id AND f.status_traducao = 'erro') AS frases_erro
       FROM lote_capitulos lc JOIN capitulos c ON c.id = lc.capitulo_id
       WHERE lc.lote_id = ? ORDER BY lc.posicao`,
    ).all(linha.id).map((r: any) => ({
      capitulo_id: r.capitulo_id,
      numero: r.numero,
      titulo: r.titulo,
      posicao: r.posicao,
      status: r.status as StatusLoteCapitulo,
      provedores_tentados: JSON.parse(r.provedores_tentados) as ParProvedor[],
      erro: r.erro,
      frases_total: r.frases_total,
      frases_traduzidas: r.frases_traduzidas,
      frases_erro: r.frases_erro,
    }));
    return { ...linha, qa_automatica: !!linha.qa_automatica, capitulos };
  },

  criar(db: BancoDados, obraId: number, capituloIds: number[], qaAutomatica: boolean): Lote {
    return db.transaction(() => {
      const info = db.prepare('INSERT INTO lotes (obra_id, qa_automatica) VALUES (?, ?)').run(
        obraId,
        qaAutomatica ? 1 : 0,
      );
      const loteId = Number(info.lastInsertRowid);
      const ins = db.prepare('INSERT INTO lote_capitulos (lote_id, capitulo_id, posicao) VALUES (?, ?, ?)');
      capituloIds.forEach((cid, i) => ins.run(loteId, cid, i));
      return this.obter(db, loteId)!;
    })();
  },

  definirStatusCapitulo(
    db: BancoDados,
    loteId: number,
    capituloId: number,
    status: StatusLoteCapitulo,
    extra?: { erro?: string | null; tentado?: ParProvedor },
  ): void {
    db.transaction(() => {
      if (extra?.tentado) {
        const atual = db.prepare(
          'SELECT provedores_tentados FROM lote_capitulos WHERE lote_id = ? AND capitulo_id = ?',
        ).get(loteId, capituloId) as { provedores_tentados: string } | undefined;
        const lista = atual ? (JSON.parse(atual.provedores_tentados) as ParProvedor[]) : [];
        lista.push(extra.tentado);
        db.prepare(
          'UPDATE lote_capitulos SET provedores_tentados = ? WHERE lote_id = ? AND capitulo_id = ?',
        ).run(JSON.stringify(lista), loteId, capituloId);
      }
      db.prepare('UPDATE lote_capitulos SET status = ?, erro = ? WHERE lote_id = ? AND capitulo_id = ?').run(
        status,
        extra?.erro ?? null,
        loteId,
        capituloId,
      );
    })();
  },

  encerrar(db: BancoDados, loteId: number, status: Exclude<StatusLote, 'executando'>): void {
    db.prepare("UPDATE lotes SET status = ?, encerrado_em = datetime('now') WHERE id = ?").run(status, loteId);
  },

  marcarInterrompidosNoBoot(db: BancoDados): void {
    db.transaction(() => {
      const ativos = db.prepare("SELECT id FROM lotes WHERE status = 'executando'").all() as { id: number }[];
      for (const { id } of ativos) {
        db.prepare(
          "UPDATE lote_capitulos SET status = 'na_fila' WHERE lote_id = ? AND status IN ('traduzindo','qa')",
        ).run(id);
        db.prepare("UPDATE lotes SET status = 'interrompido', encerrado_em = datetime('now') WHERE id = ?").run(id);
      }
    })();
  },
};
