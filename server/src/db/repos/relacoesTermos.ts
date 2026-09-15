import {
  DEFINICOES_RELACOES_TERMO,
  type RelacaoTermo,
  type TipoRelacaoTermo,
} from '@dao-tale/shared';
import type { BancoDados } from '../index.js';

type ResultadoCriacao = RelacaoTermo | 'invalida' | 'duplicada';

const definicoes = new Map(DEFINICOES_RELACOES_TERMO.map((d) => [d.tipo, d]));
const tiposProgenitor = new Set<TipoRelacaoTermo>(['pai-filha', 'pai-filho', 'mae-filha', 'mae-filho']);

function canonico(db: BancoDados, id: number): { id: number; obra_id: number } | undefined {
  const e = db.prepare('SELECT id, obra_id, principal_id FROM glossario WHERE id=?').get(id) as
    | { id: number; obra_id: number; principal_id: number | null }
    | undefined;
  if (!e) return undefined;
  return { id: e.principal_id ?? e.id, obra_id: e.obra_id };
}

export const reposRelacoesTermos = {
  listar(db: BancoDados, obraId: number): RelacaoTermo[] {
    return db.prepare('SELECT * FROM relacoes_termos WHERE obra_id=? ORDER BY tipo, id').all(obraId) as RelacaoTermo[];
  },

  criar(
    db: BancoDados,
    obraId: number,
    dados: {
      origem_termo_id: number;
      destino_termo_id: number;
      tipo: TipoRelacaoTermo;
      nota?: string | null;
      capitulo_inicio?: number | null;
      capitulo_fim?: number | null;
      confirmado_por?: RelacaoTermo['confirmado_por'];
    },
  ): ResultadoCriacao {
    const origem = canonico(db, dados.origem_termo_id);
    const destino = canonico(db, dados.destino_termo_id);
    const definicao = definicoes.get(dados.tipo);
    if (!origem || !destino || !definicao || origem.obra_id !== obraId || destino.obra_id !== obraId || origem.id === destino.id) {
      return 'invalida';
    }
    let origemId = origem.id;
    let destinoId = destino.id;
    // Relação simétrica é um par sem direção: ordem canônica impede A↔B e B↔A
    // de virarem dois fatos aparentemente diferentes.
    if (definicao.simetrica && origemId > destinoId) [origemId, destinoId] = [destinoId, origemId];
    if (tiposProgenitor.has(dados.tipo)) {
      const existentes = db.prepare(`
        SELECT origem_termo_id origem, destino_termo_id destino
        FROM relacoes_termos WHERE obra_id=? AND tipo IN ('pai-filha','pai-filho','mae-filha','mae-filho')
      `).all(obraId) as Array<{ origem: number; destino: number }>;
      if (existentes.some((r) => r.origem === origemId && r.destino === destinoId)) return 'duplicada';
      const filhos = new Map<number, number[]>();
      for (const r of existentes) filhos.set(r.origem, [...(filhos.get(r.origem) ?? []), r.destino]);
      const visitar = [destinoId];
      const vistos = new Set<number>();
      while (visitar.length) {
        const atual = visitar.pop()!;
        if (atual === origemId) return 'invalida';
        if (vistos.has(atual)) continue;
        vistos.add(atual);
        visitar.push(...(filhos.get(atual) ?? []));
      }
    }
    try {
      const info = db.prepare(`
        INSERT INTO relacoes_termos
          (obra_id, origem_termo_id, destino_termo_id, tipo, nota, capitulo_inicio, capitulo_fim, confirmado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        obraId, origemId, destinoId, dados.tipo, dados.nota?.trim() || null,
        dados.capitulo_inicio ?? null, dados.capitulo_fim ?? null, dados.confirmado_por ?? 'humano',
      );
      return db.prepare('SELECT * FROM relacoes_termos WHERE id=?').get(Number(info.lastInsertRowid)) as RelacaoTermo;
    } catch (e) {
      if (String((e as Error).message).includes('UNIQUE')) return 'duplicada';
      throw e;
    }
  },

  excluir(db: BancoDados, id: number): boolean {
    return db.prepare('DELETE FROM relacoes_termos WHERE id=?').run(id).changes > 0;
  },
};
