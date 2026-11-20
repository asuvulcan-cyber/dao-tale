import {
  agendarRevisao,
  somarDias,
  FACILIDADE_INICIAL,
  type CorrecaoTutor,
  type EstadoTutorFrase,
  type ExplicacaoTutor,
  type IdiomaOrigem,
  type NotaRevisao,
  type PalavraVocabulario,
  type ResumoVocabulario,
} from '@dao-tale/shared';
import type { BancoDados } from '../index.js';
import { dataLocalHoje } from './uso.js';

// Modo tutor (doc 29): o que foi estudado em cada frase e o vocabulário com a
// repetição espaçada. Nada aqui chama IA — as rotas chamam e gravam por aqui.

interface LinhaTutor {
  frase_id: number;
  texto_origem: string;
  explicacao: string | null;
  dicas_vistas: number;
  tentativa: string | null;
  correcao: string | null;
  tentativas: number;
  salva_em: string | null;
}

function lerJson<T>(texto: string | null): T | null {
  if (!texto) return null;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return null;
  }
}

function paraEstado(linha: LinhaTutor): EstadoTutorFrase {
  return {
    frase_id: linha.frase_id,
    explicacao: lerJson<ExplicacaoTutor>(linha.explicacao),
    dicas_vistas: linha.dicas_vistas,
    tentativa: linha.tentativa,
    correcao: lerJson<CorrecaoTutor>(linha.correcao),
    tentativas: linha.tentativas,
    salva_em: linha.salva_em,
    // Preenchida pela rota, que é quem tem o dicionário (doc 30).
    divergencias: [],
  };
}

const AGORA = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

export const reposTutor = {
  /**
   * Estado da frase, ou null se nunca foi estudada. Quando o original mudou
   * desde a explicação (divisão/mescla), a linha velha é apagada: explicar a
   * frase antiga ao lado da nova ensinaria errado.
   */
  obter(db: BancoDados, fraseId: number, textoOrigemAtual: string): EstadoTutorFrase | null {
    const linha = db.prepare('SELECT * FROM tutor_frases WHERE frase_id = ?').get(fraseId) as LinhaTutor | undefined;
    if (!linha) return null;
    if (linha.texto_origem !== textoOrigemAtual) {
      db.prepare('DELETE FROM tutor_frases WHERE frase_id = ?').run(fraseId);
      return null;
    }
    return paraEstado(linha);
  },

  /** Frases do capítulo já estudadas (para o editor marcar o progresso). */
  listarPorCapitulo(db: BancoDados, capituloId: number): { frase_id: number; tentativas: number; salva_em: string | null }[] {
    return db
      .prepare(
        `SELECT t.frase_id, t.tentativas, t.salva_em FROM tutor_frases t
         JOIN frases f ON f.id = t.frase_id
         WHERE f.capitulo_id = ? AND t.texto_origem = f.texto_zh`,
      )
      .all(capituloId) as { frase_id: number; tentativas: number; salva_em: string | null }[];
  },

  /** Garante a linha da frase (criada na primeira interação). */
  garantir(db: BancoDados, fraseId: number, textoOrigem: string): void {
    db.prepare(
      `INSERT INTO tutor_frases (frase_id, texto_origem) VALUES (?, ?)
       ON CONFLICT (frase_id) DO UPDATE SET
         -- Original mudou: recomeça do zero em vez de misturar duas frases.
         explicacao   = CASE WHEN texto_origem = excluded.texto_origem THEN explicacao   ELSE NULL END,
         dicas_vistas = CASE WHEN texto_origem = excluded.texto_origem THEN dicas_vistas ELSE 0    END,
         correcao     = CASE WHEN texto_origem = excluded.texto_origem THEN correcao     ELSE NULL END,
         texto_origem = excluded.texto_origem`,
    ).run(fraseId, textoOrigem);
  },

  gravarExplicacao(db: BancoDados, fraseId: number, textoOrigem: string, explicacao: ExplicacaoTutor): void {
    this.garantir(db, fraseId, textoOrigem);
    db.prepare(`UPDATE tutor_frases SET explicacao = ?, atualizado_em = ${AGORA} WHERE frase_id = ?`).run(
      JSON.stringify(explicacao),
      fraseId,
    );
  },

  /** Só sobe: fechar uma dica na tela não "desvê" o que já foi visto. */
  registrarDicas(db: BancoDados, fraseId: number, textoOrigem: string, dicas: number): void {
    this.garantir(db, fraseId, textoOrigem);
    db.prepare(
      `UPDATE tutor_frases SET dicas_vistas = MAX(dicas_vistas, ?), atualizado_em = ${AGORA} WHERE frase_id = ?`,
    ).run(Math.min(3, Math.max(0, dicas)), fraseId);
  },

  gravarCorrecao(db: BancoDados, fraseId: number, textoOrigem: string, tentativa: string, correcao: CorrecaoTutor): void {
    this.garantir(db, fraseId, textoOrigem);
    db.prepare(
      `UPDATE tutor_frases SET tentativa = ?, correcao = ?, tentativas = tentativas + 1, atualizado_em = ${AGORA}
       WHERE frase_id = ?`,
    ).run(tentativa, JSON.stringify(correcao), fraseId);
  },

  /**
   * Grava a tradução de quem aprende na frase. Ela vira "traduzida" (o botão
   * Traduzir do capítulo não passa por cima) com origem 'tutor' (a mineração de
   * edições manuais não lê aprendizado como correção da IA). Se com isso o
   * capítulo inteiro ficou traduzido, o status dele acompanha.
   */
  salvarTraducao(db: BancoDados, fraseId: number, textoOrigem: string, textoPt: string): void {
    db.transaction(() => {
      this.garantir(db, fraseId, textoOrigem);
      db.prepare(
        `UPDATE frases SET texto_pt = ?, editado_manualmente = 1, origem_edicao = 'tutor', status_traducao = 'traduzida'
         WHERE id = ?`,
      ).run(textoPt, fraseId);
      db.prepare(`UPDATE tutor_frases SET tentativa = ?, salva_em = ${AGORA}, atualizado_em = ${AGORA} WHERE frase_id = ?`).run(
        textoPt,
        fraseId,
      );
      const { capitulo_id } = db.prepare('SELECT capitulo_id FROM frases WHERE id = ?').get(fraseId) as { capitulo_id: number };
      const faltam = (
        db
          .prepare("SELECT count(*) AS n FROM frases WHERE capitulo_id = ? AND status_traducao != 'traduzida'")
          .get(capitulo_id) as { n: number }
      ).n;
      if (faltam === 0) {
        db.prepare("UPDATE capitulos SET status = 'traduzido' WHERE id = ? AND status IN ('rascunho','parcial')").run(
          capitulo_id,
        );
      }
    })();
  },
};

// ── Vocabulário ────────────────────────────────────────────────────────────

export interface NovaPalavra {
  idioma: IdiomaOrigem;
  termo: string;
  leitura?: string | null;
  significado: string;
  nota?: string | null;
  exemplo_origem?: string | null;
  exemplo_pt?: string | null;
  obra_id?: number | null;
  frase_id?: number | null;
}

export const reposVocabulario = {
  listar(db: BancoDados, idioma?: IdiomaOrigem): PalavraVocabulario[] {
    return (
      idioma
        ? db.prepare('SELECT * FROM vocabulario WHERE idioma = ? ORDER BY criado_em DESC, id DESC').all(idioma)
        : db.prepare('SELECT * FROM vocabulario ORDER BY criado_em DESC, id DESC').all()
    ) as PalavraVocabulario[];
  },

  obter(db: BancoDados, id: number): PalavraVocabulario | undefined {
    return db.prepare('SELECT * FROM vocabulario WHERE id = ?').get(id) as PalavraVocabulario | undefined;
  },

  /**
   * Adiciona; se a palavra já existe no idioma, não mexe no progresso dela —
   * só preenche o que estava vazio (leitura, nota, exemplo).
   */
  adicionar(db: BancoDados, p: NovaPalavra, hoje = dataLocalHoje()): { palavra: PalavraVocabulario; nova: boolean } {
    const termo = p.termo.trim();
    const existente = db.prepare('SELECT * FROM vocabulario WHERE idioma = ? AND termo = ?').get(p.idioma, termo) as
      | PalavraVocabulario
      | undefined;
    if (existente) {
      db.prepare(
        `UPDATE vocabulario SET
           leitura        = COALESCE(leitura, ?),
           nota           = COALESCE(nota, ?),
           exemplo_origem = COALESCE(exemplo_origem, ?),
           exemplo_pt     = COALESCE(exemplo_pt, ?)
         WHERE id = ?`,
      ).run(p.leitura ?? null, p.nota ?? null, p.exemplo_origem ?? null, p.exemplo_pt ?? null, existente.id);
      return { palavra: this.obter(db, existente.id)!, nova: false };
    }
    const r = db
      .prepare(
        `INSERT INTO vocabulario
           (idioma, termo, leitura, significado, nota, exemplo_origem, exemplo_pt, obra_id, frase_id,
            facilidade, proxima_revisao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        p.idioma,
        termo,
        p.leitura ?? null,
        p.significado.trim(),
        p.nota ?? null,
        p.exemplo_origem ?? null,
        p.exemplo_pt ?? null,
        p.obra_id ?? null,
        p.frase_id ?? null,
        FACILIDADE_INICIAL,
        hoje,
      );
    return { palavra: this.obter(db, Number(r.lastInsertRowid))!, nova: true };
  },

  editar(
    db: BancoDados,
    id: number,
    campos: Partial<Pick<PalavraVocabulario, 'leitura' | 'significado' | 'nota'>>,
  ): PalavraVocabulario | undefined {
    const atual = this.obter(db, id);
    if (!atual) return undefined;
    db.prepare('UPDATE vocabulario SET leitura = ?, significado = ?, nota = ? WHERE id = ?').run(
      campos.leitura !== undefined ? campos.leitura : atual.leitura,
      campos.significado !== undefined ? campos.significado : atual.significado,
      campos.nota !== undefined ? campos.nota : atual.nota,
      id,
    );
    return this.obter(db, id);
  },

  remover(db: BancoDados, id: number): boolean {
    return db.prepare('DELETE FROM vocabulario WHERE id = ?').run(id).changes > 0;
  },

  /** Cartões vencidos (até hoje), os mais atrasados primeiro. */
  paraRevisar(db: BancoDados, idioma: IdiomaOrigem, limite = 50, hoje = dataLocalHoje()): PalavraVocabulario[] {
    return db
      .prepare(
        `SELECT * FROM vocabulario WHERE idioma = ? AND proxima_revisao <= ?
         ORDER BY proxima_revisao, repeticoes, id LIMIT ?`,
      )
      .all(idioma, hoje, limite) as PalavraVocabulario[];
  },

  revisar(db: BancoDados, id: number, nota: NotaRevisao, hoje = dataLocalHoje()): PalavraVocabulario | undefined {
    const atual = this.obter(db, id);
    if (!atual) return undefined;
    const novo = agendarRevisao(atual, nota);
    db.prepare(
      `UPDATE vocabulario SET intervalo_dias = ?, facilidade = ?, repeticoes = ?, proxima_revisao = ?,
         ultima_revisao = ?, total_revisoes = total_revisoes + 1, total_erros = total_erros + ?
       WHERE id = ?`,
    ).run(
      novo.intervalo_dias,
      novo.facilidade,
      novo.repeticoes,
      somarDias(hoje, novo.intervalo_dias),
      hoje,
      nota === 0 ? 1 : 0,
      id,
    );
    return this.obter(db, id);
  },

  resumo(db: BancoDados, hoje = dataLocalHoje()): ResumoVocabulario[] {
    return (['zh', 'en'] as const).map((idioma) => {
      const r = db
        .prepare(
          `SELECT count(*) AS total,
                  coalesce(sum(proxima_revisao <= ?), 0) AS para_hoje,
                  coalesce(sum(ultima_revisao = ?), 0) AS revisadas_hoje
             FROM vocabulario WHERE idioma = ?`,
        )
        .get(hoje, hoje, idioma) as { total: number; para_hoje: number; revisadas_hoje: number };
      return { idioma, ...r };
    });
  },
};
