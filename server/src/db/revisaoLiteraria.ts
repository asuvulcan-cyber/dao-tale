import type { RevisaoLiteraria } from '@dao-tale/shared';
import type { BancoDados } from './index.js';

type LinhaRevisao = Omit<RevisaoLiteraria, 'categorias'> & { categorias: string };

function paraRevisao(linha: LinhaRevisao): RevisaoLiteraria {
  let categorias: string[] = [];
  try {
    const valor = JSON.parse(linha.categorias);
    if (Array.isArray(valor) && valor.every((v) => typeof v === 'string')) categorias = valor;
  } catch {
    // Migração e escrita da aplicação garantem JSON; banco importado não deve
    // derrubar toda a tela por uma célula antiga malformada.
  }
  return { ...linha, categorias };
}

const SELECT_REVISAO = `
  SELECT r.*, l.rotulo lote_rotulo, f.capitulo_id, c.numero capitulo_numero,
         f.ordem, f.paragrafo, f.texto_zh, f.texto_pt_original_ia,
         f.texto_pt texto_vigente_atual
  FROM revisoes_literarias r
  JOIN revisao_literaria_lotes l ON l.id = r.lote_id
  JOIN frases f ON f.id = r.frase_id
  JOIN capitulos c ON c.id = f.capitulo_id`;

export const reposRevisaoLiteraria = {
  listarPorCapitulo(db: BancoDados, capituloId: number): RevisaoLiteraria[] {
    return (db
      .prepare(`${SELECT_REVISAO} WHERE f.capitulo_id = ? ORDER BY f.ordem ASC, r.criado_em DESC`)
      .all(capituloId) as LinhaRevisao[]).map(paraRevisao);
  },

  obter(db: BancoDados, id: number): RevisaoLiteraria | undefined {
    const linha = db.prepare(`${SELECT_REVISAO} WHERE r.id = ?`).get(id) as LinhaRevisao | undefined;
    return linha ? paraRevisao(linha) : undefined;
  },

  criarLote(
    db: BancoDados,
    dados: { obraId: number; rotulo: string; criterios?: string | null },
  ): number {
    return Number(
      db
        .prepare('INSERT INTO revisao_literaria_lotes (obra_id, rotulo, criterios) VALUES (?, ?, ?)')
        .run(dados.obraId, dados.rotulo, dados.criterios ?? null).lastInsertRowid,
    );
  },

  propor(
    db: BancoDados,
    dados: {
      loteId: number;
      fraseId: number;
      textoRevisado: string;
      justificativa?: string | null;
      categorias?: string[];
    },
  ): RevisaoLiteraria {
    const frase = db.prepare('SELECT texto_pt FROM frases WHERE id = ?').get(dados.fraseId) as
      | { texto_pt: string }
      | undefined;
    if (!frase) throw new Error('Frase não encontrada.');
    const id = Number(
      db
        .prepare(
          `INSERT INTO revisoes_literarias
             (lote_id, frase_id, texto_vigente_base, texto_revisado, justificativa, categorias)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          dados.loteId,
          dados.fraseId,
          frase.texto_pt,
          dados.textoRevisado,
          dados.justificativa ?? null,
          JSON.stringify(dados.categorias ?? []),
        ).lastInsertRowid,
    );
    return this.obter(db, id)!;
  },

  editarProposta(
    db: BancoDados,
    id: number,
    dados: { textoRevisado: string; justificativa?: string | null; categorias?: string[] },
  ): RevisaoLiteraria | undefined {
    const atual = this.obter(db, id);
    if (!atual || (atual.status !== 'pendente' && atual.status !== 'conflito')) return atual;
    db.prepare(
      `UPDATE revisoes_literarias
       SET texto_revisado=?, justificativa=?, categorias=?, status='pendente',
           texto_vigente_base=(SELECT texto_pt FROM frases WHERE id=frase_id),
           atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id=?`,
    ).run(
      dados.textoRevisado,
      dados.justificativa ?? null,
      JSON.stringify(dados.categorias ?? []),
      id,
    );
    return this.obter(db, id)!;
  },

  decidir(db: BancoDados, id: number, decisao: 'aprovar' | 'rejeitar'): RevisaoLiteraria | 'conflito' | undefined {
    const atual = this.obter(db, id);
    if (!atual) return undefined;
    if (atual.status !== 'pendente' && atual.status !== 'conflito') return atual;

    if (decisao === 'rejeitar') {
      db.prepare(
        "UPDATE revisoes_literarias SET status='rejeitada', decidido_em=strftime('%Y-%m-%dT%H:%M:%fZ','now'), atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
      ).run(id);
      return this.obter(db, id)!;
    }

    // Compare-and-swap editorial: uma alteração feita depois da proposta nunca
    // é silenciosamente perdida. O usuário vê o conflito e pode gerar nova base.
    if (atual.texto_vigente_atual !== atual.texto_vigente_base) {
      db.prepare(
        "UPDATE revisoes_literarias SET status='conflito', atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
      ).run(id);
      return 'conflito';
    }

    db.transaction(() => {
      db.prepare(
        "UPDATE frases SET texto_pt=?, editado_manualmente=1, origem_edicao='revisao-literaria' WHERE id=? AND texto_pt=?",
      ).run(atual.texto_revisado, atual.frase_id, atual.texto_vigente_base);
      db.prepare(
        "UPDATE revisoes_literarias SET status='aprovada', decidido_em=strftime('%Y-%m-%dT%H:%M:%fZ','now'), atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",
      ).run(id);
      db.prepare("UPDATE capitulos SET atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(
        atual.capitulo_id,
      );
    })();
    return this.obter(db, id)!;
  },
};
