import type { BancoDados } from './index.js';
import type {
  Obra,
  ObraComContadores,
  PromptMae,
  PromptPadrao,
  PromptComposto,
  TipoPrompt,
  Capitulo,
  CapituloResumo,
  Frase,
  EntradaGlossario,
  TermoSugerido,
  CasoTeste,
  Configuracoes,
  CriarObraPayload,
  StatusCasoTeste,
  StatusCapitulo,
  FaseTraducao,
  Lote,
  StatusLote,
  StatusLoteCapitulo,
  ParProvedor,
  ProvedorId,
  ApontamentoQa,
  StatusApontamentoQa,
  PrecoModelo,
  PrecosModelos,
} from '@dao-tale/shared';
import { CONFIG_PADRAO } from '@dao-tale/shared';
import { comporPromptMae } from './promptPadraoInicial.js';

/** Substitui `de` por `para` só quando `de` é uma palavra isolada — não colada a
    letra/número (fronteira Unicode, então acentos contam como letra). Evita trocar
    "Rio" dentro de "Prioridade". */
function trocaPorPalavra(texto: string, de: string, para: string): string {
  const esc = de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return texto.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'gu'), para);
}

// Linhas cruas do SQLite (booleanos como 0/1) → tipos do domínio.
function paraPrompt(l: any): PromptMae {
  return { ...l, ativo: !!l.ativo };
}
function paraFrase(l: any): Frase {
  return { ...l, editado_manualmente: !!l.editado_manualmente };
}

// ── Obras ──────────────────────────────────────────────────────────────────

// Colunas sem o BLOB da capa (pesado e sem lugar em JSON); tem_capa o resume.
const COLUNAS_OBRA = `o.id, o.titulo, o.titulo_original, o.sinopse, o.tags, o.provedor_padrao,
  o.modelo_padrao, o.fase_traducao, o.criado_em, o.atualizado_em, (o.capa IS NOT NULL) AS tem_capa`;

function paraObra<T extends { tags: unknown; tem_capa: unknown }>(linha: T): T & { tags: string[]; tem_capa: boolean } {
  return { ...linha, tags: JSON.parse((linha.tags as string) || '[]'), tem_capa: !!linha.tem_capa };
}

export const reposObras = {
  listar(db: BancoDados): ObraComContadores[] {
    return (
      db
        .prepare(
          `SELECT ${COLUNAS_OBRA},
           (SELECT COUNT(*) FROM capitulos c WHERE c.obra_id = o.id) AS capitulos_total,
           (SELECT COUNT(*) FROM glossario g WHERE g.obra_id = o.id) AS glossario_total,
           (SELECT COUNT(*) FROM banco_testes t WHERE t.obra_id = o.id AND t.status = 'pendente') AS testes_pendentes,
           (SELECT COUNT(*) FROM termos_sugeridos s WHERE s.obra_id = o.id AND s.status = 'pendente') AS termos_sugeridos_pendentes
         FROM obras o ORDER BY o.criado_em DESC`,
        )
        .all() as any[]
    ).map(paraObra) as ObraComContadores[];
  },

  obter(db: BancoDados, id: number): Obra | undefined {
    const linha = db.prepare(`SELECT ${COLUNAS_OBRA} FROM obras o WHERE o.id = ?`).get(id) as any;
    return linha ? (paraObra(linha) as Obra) : undefined;
  },

  criar(db: BancoDados, payload: CriarObraPayload): Obra {
    return db.transaction(() => {
      const info = db
        .prepare('INSERT INTO obras (titulo, titulo_original, sinopse, tags) VALUES (?, ?, ?, ?)')
        .run(
          payload.titulo,
          payload.titulo_original ?? null,
          payload.sinopse ?? null,
          JSON.stringify(payload.tags ?? []),
        );
      const obraId = Number(info.lastInsertRowid);
      if (payload.prompt_inicial) {
        db.prepare(
          'INSERT INTO prompts (obra_id, versao, conteudo, ativo) VALUES (?, ?, ?, 1)',
        ).run(obraId, payload.prompt_inicial.versao, payload.prompt_inicial.conteudo);
      }
      for (const e of payload.glossario_inicial ?? []) {
        db.prepare(
          `INSERT INTO glossario (obra_id, termo_zh, termo_pt, categoria, nota)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (obra_id, termo_zh) DO NOTHING`,
        ).run(obraId, e.termo_zh, e.termo_pt, e.categoria ?? 'outro', e.nota ?? null);
      }
      return this.obter(db, obraId)!;
    })();
  },

  atualizar(
    db: BancoDados,
    id: number,
    campos: Partial<Pick<Obra, 'titulo' | 'titulo_original' | 'sinopse' | 'tags' | 'provedor_padrao' | 'modelo_padrao'>>,
  ): Obra | undefined {
    const atual = this.obter(db, id);
    if (!atual) return undefined;
    db.prepare(
      `UPDATE obras SET titulo = ?, titulo_original = ?, sinopse = ?, tags = ?, provedor_padrao = ?, modelo_padrao = ?,
        atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(
      campos.titulo ?? atual.titulo,
      campos.titulo_original !== undefined ? campos.titulo_original : atual.titulo_original,
      campos.sinopse !== undefined ? campos.sinopse : atual.sinopse,
      JSON.stringify(campos.tags !== undefined ? campos.tags : atual.tags),
      campos.provedor_padrao !== undefined ? campos.provedor_padrao : atual.provedor_padrao,
      campos.modelo_padrao !== undefined ? campos.modelo_padrao : atual.modelo_padrao,
      id,
    );
    return this.obter(db, id);
  },

  /** Muda a fase do pipeline da obra (doc 09 §2). */
  definirFase(db: BancoDados, id: number, fase: FaseTraducao): Obra | undefined {
    const alterou = db
      .prepare(`UPDATE obras SET fase_traducao = ?, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
      .run(fase, id).changes;
    return alterou ? this.obter(db, id) : undefined;
  },

  obterCapa(db: BancoDados, id: number): { capa: Buffer; mime: string } | undefined {
    const linha = db.prepare('SELECT capa, capa_mime FROM obras WHERE id = ?').get(id) as
      | { capa: Buffer | null; capa_mime: string | null }
      | undefined;
    if (!linha?.capa || !linha.capa_mime) return undefined;
    return { capa: linha.capa, mime: linha.capa_mime };
  },

  definirCapa(db: BancoDados, id: number, capa: Buffer | null, mime: string | null): boolean {
    return (
      db
        .prepare(
          `UPDATE obras SET capa = ?, capa_mime = ?, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
        )
        .run(capa, mime, id).changes > 0
    );
  },

  /** Contagem do que cai em cascata — usada na confirmação de exclusão. */
  simularExclusao(db: BancoDados, id: number) {
    const conta = (sql: string) => (db.prepare(sql).get(id) as { n: number }).n;
    return {
      capitulos: conta('SELECT COUNT(*) n FROM capitulos WHERE obra_id = ?'),
      frases: conta(
        'SELECT COUNT(*) n FROM frases WHERE capitulo_id IN (SELECT id FROM capitulos WHERE obra_id = ?)',
      ),
      glossario: conta('SELECT COUNT(*) n FROM glossario WHERE obra_id = ?'),
      casos_teste: conta('SELECT COUNT(*) n FROM banco_testes WHERE obra_id = ?'),
      termos_sugeridos: conta('SELECT COUNT(*) n FROM termos_sugeridos WHERE obra_id = ?'),
    };
  },

  excluir(db: BancoDados, id: number): boolean {
    return db.prepare('DELETE FROM obras WHERE id = ?').run(id).changes > 0;
  },
};

// ── Prompts (prompt mãe versionado) ────────────────────────────────────────

export const reposPrompts = {
  listar(db: BancoDados, obraId: number): PromptMae[] {
    return (
      db.prepare('SELECT * FROM prompts WHERE obra_id = ? ORDER BY criado_em DESC').all(obraId) as any[]
    ).map(paraPrompt);
  },

  obter(db: BancoDados, id: number): PromptMae | undefined {
    const l = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
    return l ? paraPrompt(l) : undefined;
  },

  ativo(db: BancoDados, obraId: number): PromptMae | undefined {
    const l = db.prepare('SELECT * FROM prompts WHERE obra_id = ? AND ativo = 1').get(obraId);
    return l ? paraPrompt(l) : undefined;
  },

  criar(
    db: BancoDados,
    obraId: number,
    dados: {
      versao: string;
      conteudo: string;
      notas_versao?: string;
      ativar: boolean;
      tipo?: TipoPrompt;
      nucleo_id?: number | null;
    },
  ): PromptMae {
    return db.transaction(() => {
      if (dados.ativar) {
        db.prepare('UPDATE prompts SET ativo = 0 WHERE obra_id = ?').run(obraId);
      }
      const info = db
        .prepare(
          'INSERT INTO prompts (obra_id, versao, conteudo, notas_versao, ativo, tipo, nucleo_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          obraId,
          dados.versao,
          dados.conteudo,
          dados.notas_versao ?? null,
          dados.ativar ? 1 : 0,
          dados.tipo ?? 'completo',
          dados.nucleo_id ?? null,
        );
      return this.obter(db, Number(info.lastInsertRowid))!;
    })();
  },

  ativar(db: BancoDados, id: number): PromptMae | undefined {
    const alvo = this.obter(db, id);
    if (!alvo) return undefined;
    db.transaction(() => {
      db.prepare('UPDATE prompts SET ativo = 0 WHERE obra_id = ?').run(alvo.obra_id);
      db.prepare('UPDATE prompts SET ativo = 1 WHERE id = ?').run(id);
    })();
    return this.obter(db, id);
  },

  /** Cria o delta inicial (vazio) da obra sobre o núcleo ativo — a obra passa a
      usar o núcleo global + o próprio delta, sem copiar o prompt inteiro.
      Devolve undefined se a obra já tem versões ou se não há núcleo ativo. */
  adotarPadrao(db: BancoDados, obraId: number): PromptMae | undefined {
    return db.transaction(() => {
      if (this.listar(db, obraId).length > 0) return undefined;
      const nucleo = reposPromptPadrao.ativo(db);
      if (!nucleo) return undefined;
      return this.criar(db, obraId, {
        versao: '1.0',
        conteudo: '',
        notas_versao: `Delta criado sobre o prompt padrão (núcleo) v${nucleo.versao} — registre aqui só o que é específico da obra.`,
        ativar: true,
        tipo: 'delta',
        nucleo_id: nucleo.id,
      });
    })();
  },

  /** Prompt que governa a tradução da obra: o ativo dela ou, se ela ainda não
      tem nenhum, o delta adotado automaticamente na hora. */
  ativoOuAdotado(db: BancoDados, obraId: number): PromptMae | undefined {
    return this.ativo(db, obraId) ?? this.adotarPadrao(db, obraId);
  },

  /** Prompt mãe efetivo da obra: 'completo' legado vai como está; 'delta' é
      composto com o núcleo ATIVO no momento (melhorias do núcleo fluem para
      todas as obras; a proveniência exata fica registrada no capítulo). */
  composto(db: BancoDados, obraId: number): PromptComposto | undefined {
    const prompt = this.ativoOuAdotado(db, obraId);
    if (!prompt) return undefined;
    if (prompt.tipo !== 'delta') return { texto: prompt.conteudo, prompt, nucleo: null };
    const nucleo = reposPromptPadrao.ativo(db);
    // Sem núcleo ativo (estado excepcional), o delta sozinho é o que há.
    if (!nucleo) return { texto: comporPromptMae('', prompt.conteudo), prompt, nucleo: null };
    return { texto: comporPromptMae(nucleo.conteudo, prompt.conteudo), prompt, nucleo };
  },
};

// ── Prompt padrão global (mesmas regras de versões imutáveis) ──────────────

export const reposPromptPadrao = {
  listar(db: BancoDados): PromptPadrao[] {
    return (db.prepare('SELECT * FROM prompt_padrao ORDER BY criado_em DESC').all() as any[]).map(paraPrompt);
  },

  obter(db: BancoDados, id: number): PromptPadrao | undefined {
    const l = db.prepare('SELECT * FROM prompt_padrao WHERE id = ?').get(id);
    return l ? paraPrompt(l) : undefined;
  },

  ativo(db: BancoDados): PromptPadrao | undefined {
    const l = db.prepare('SELECT * FROM prompt_padrao WHERE ativo = 1').get();
    return l ? paraPrompt(l) : undefined;
  },

  criar(
    db: BancoDados,
    dados: { versao: string; conteudo: string; notas_versao?: string; ativar: boolean },
  ): PromptPadrao {
    return db.transaction(() => {
      if (dados.ativar) db.prepare('UPDATE prompt_padrao SET ativo = 0').run();
      const info = db
        .prepare('INSERT INTO prompt_padrao (versao, conteudo, notas_versao, ativo) VALUES (?, ?, ?, ?)')
        .run(dados.versao, dados.conteudo, dados.notas_versao ?? null, dados.ativar ? 1 : 0);
      return this.obter(db, Number(info.lastInsertRowid))!;
    })();
  },

  ativar(db: BancoDados, id: number): PromptPadrao | undefined {
    if (!this.obter(db, id)) return undefined;
    db.transaction(() => {
      db.prepare('UPDATE prompt_padrao SET ativo = 0').run();
      db.prepare('UPDATE prompt_padrao SET ativo = 1 WHERE id = ?').run(id);
    })();
    return this.obter(db, id);
  },
};

// ── Capítulos ──────────────────────────────────────────────────────────────

export const reposCapitulos = {
  listar(db: BancoDados, obraId: number): CapituloResumo[] {
    return db
      .prepare(
        `SELECT c.id, c.obra_id, c.numero, c.titulo, c.titulo_pt, c.status, c.provedor, c.modelo, c.prompt_id, c.nucleo_id,
                c.consistencia_violacoes, c.qa_em, c.criado_em, c.atualizado_em,
           (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id) AS frases_total,
           (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id AND f.status_traducao = 'traduzida') AS frases_traduzidas,
           (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id AND f.status_traducao = 'erro') AS frases_erro,
           (SELECT COUNT(*) FROM qa_apontamentos q WHERE q.capitulo_id = c.id AND q.status = 'pendente') AS qa_pendentes
         FROM capitulos c WHERE c.obra_id = ? ORDER BY c.numero`,
      )
      .all(obraId) as CapituloResumo[];
  },

  obter(db: BancoDados, id: number): Capitulo | undefined {
    return db.prepare('SELECT * FROM capitulos WHERE id = ?').get(id) as Capitulo | undefined;
  },

  /** Grava a contagem da última varredura de consistência (D5). */
  definirConsistencia(db: BancoDados, id: number, violacoes: number): void {
    db.prepare('UPDATE capitulos SET consistencia_violacoes = ? WHERE id = ?').run(violacoes, id);
  },

  /** Marca a data da última passada de QA (doc 09 §6). */
  definirQaEm(db: BancoDados, id: number): void {
    db.prepare("UPDATE capitulos SET qa_em = datetime('now') WHERE id = ?").run(id);
  },

  /** Agregados por capítulo para o checkpoint (doc 09 §4): contagens de frases,
   * frases editadas manualmente e termos sugeridos registrados. */
  agregadosCheckpoint(db: BancoDados, obraId: number): {
    id: number;
    numero: number;
    status: StatusCapitulo;
    frases_total: number;
    frases_editadas: number;
    termos_sugeridos: number;
  }[] {
    return db
      .prepare(
        `SELECT c.id, c.numero, c.status,
           (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id) AS frases_total,
           (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id AND f.editado_manualmente = 1) AS frases_editadas,
           (SELECT COUNT(*) FROM termos_sugeridos s WHERE s.capitulo_id = c.id) AS termos_sugeridos
         FROM capitulos c WHERE c.obra_id = ? ORDER BY c.numero`,
      )
      .all(obraId) as {
      id: number;
      numero: number;
      status: StatusCapitulo;
      frases_total: number;
      frases_editadas: number;
      termos_sugeridos: number;
    }[];
  },

  criar(
    db: BancoDados,
    obraId: number,
    dados: { numero: number; titulo?: string; texto_origem: string },
    frases: { texto_zh: string; paragrafo: number }[],
  ): Capitulo {
    return db.transaction(() => {
      const info = db
        .prepare('INSERT INTO capitulos (obra_id, numero, titulo, texto_origem) VALUES (?, ?, ?, ?)')
        .run(obraId, dados.numero, dados.titulo ?? null, dados.texto_origem);
      const capId = Number(info.lastInsertRowid);
      const ins = db.prepare(
        'INSERT INTO frases (capitulo_id, ordem, paragrafo, texto_zh) VALUES (?, ?, ?, ?)',
      );
      frases.forEach((f, i) => ins.run(capId, i, f.paragrafo, f.texto_zh));
      return this.obter(db, capId)!;
    })();
  },

  atualizar(
    db: BancoDados,
    id: number,
    campos: Partial<{ titulo: string | null; titulo_pt: string | null; status: StatusCapitulo; provedor: string | null; modelo: string | null; prompt_id: number | null; nucleo_id: number | null }>,
  ): Capitulo | undefined {
    const atual = this.obter(db, id);
    if (!atual) return undefined;
    db.prepare(
      `UPDATE capitulos SET titulo = ?, titulo_pt = ?, status = ?, provedor = ?, modelo = ?, prompt_id = ?, nucleo_id = ?,
        atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(
      campos.titulo !== undefined ? campos.titulo : atual.titulo,
      campos.titulo_pt !== undefined ? campos.titulo_pt : atual.titulo_pt,
      campos.status ?? atual.status,
      campos.provedor !== undefined ? campos.provedor : atual.provedor,
      campos.modelo !== undefined ? campos.modelo : atual.modelo,
      campos.prompt_id !== undefined ? campos.prompt_id : atual.prompt_id,
      campos.nucleo_id !== undefined ? campos.nucleo_id : atual.nucleo_id,
      id,
    );
    return this.obter(db, id);
  },

  simularExclusao(db: BancoDados, id: number) {
    const conta = (sql: string) => (db.prepare(sql).get(id) as { n: number }).n;
    return {
      frases: conta('SELECT COUNT(*) n FROM frases WHERE capitulo_id = ?'),
      casos_teste: conta(
        'SELECT COUNT(*) n FROM banco_testes WHERE frase_id IN (SELECT id FROM frases WHERE capitulo_id = ?)',
      ),
      termos_sugeridos: conta('SELECT COUNT(*) n FROM termos_sugeridos WHERE capitulo_id = ?'),
    };
  },

  excluir(db: BancoDados, id: number): boolean {
    return db.prepare('DELETE FROM capitulos WHERE id = ?').run(id).changes > 0;
  },
};

// ── Frases ─────────────────────────────────────────────────────────────────

export const reposFrases = {
  listarPorCapitulo(db: BancoDados, capituloId: number): Frase[] {
    return (
      db.prepare('SELECT * FROM frases WHERE capitulo_id = ? ORDER BY ordem').all(capituloId) as any[]
    ).map(paraFrase);
  },

  obter(db: BancoDados, id: number): Frase | undefined {
    const l = db.prepare('SELECT * FROM frases WHERE id = ?').get(id);
    return l ? paraFrase(l) : undefined;
  },

  editarTexto(db: BancoDados, id: number, textoPt: string): Frase | undefined {
    db.prepare('UPDATE frases SET texto_pt = ?, editado_manualmente = 1 WHERE id = ?').run(textoPt, id);
    return this.obter(db, id);
  },

  /** Correção rápida (usada pelo EditorCapitulo): troca o termo nas traduções do
      escopo, marcando as frases como editadas manualmente. A3: troca por PALAVRA
      (fronteira Unicode, como substituirTermoGlossario) — nunca dentro de outra
      palavra ("Rio" em "Riordan"). Com `previa`, só conta as frases REALMENTE
      afetadas por essa regra, batendo com o que a aplicação de fato muda (a
      prévia antiga contava frases por substring e subestimava/superestimava). */
  substituirTermo(
    db: BancoDados,
    opcoes: { obraId: number; capituloId?: number; de: string; para: string; previa?: boolean },
  ): { frases: number; capitulos: number } {
    const candidatas = db
      .prepare(
        `SELECT f.id, f.texto_pt, f.capitulo_id FROM frases f JOIN capitulos c ON c.id = f.capitulo_id
         WHERE c.obra_id = ? AND (? IS NULL OR f.capitulo_id = ?) AND instr(f.texto_pt, ?) > 0`,
      )
      .all(opcoes.obraId, opcoes.capituloId ?? null, opcoes.capituloId ?? null, opcoes.de) as {
      id: number;
      texto_pt: string;
      capitulo_id: number;
    }[];

    const afetadas: { id: number; texto: string; capitulo_id: number }[] = [];
    for (const f of candidatas) {
      const novo = trocaPorPalavra(f.texto_pt, opcoes.de, opcoes.para);
      if (novo !== f.texto_pt) afetadas.push({ id: f.id, texto: novo, capitulo_id: f.capitulo_id });
    }
    const capitulos = new Set(afetadas.map((a) => a.capitulo_id)).size;

    if (!opcoes.previa && afetadas.length > 0) {
      const upd = db.prepare('UPDATE frases SET texto_pt = ?, editado_manualmente = 1 WHERE id = ?');
      db.transaction(() => {
        for (const a of afetadas) upd.run(a.texto, a.id);
      })();
    }
    return { frases: afetadas.length, capitulos };
  },

  /** Troca a tradução de um termo do glossário nas frases JÁ traduzidas, com duas
      travas contra troca errada: (1) só nas frases cujo texto-fonte contém o termo
      chinês; (2) só ocorrências isoladas por palavra (fronteira Unicode), nunca
      dentro de outra palavra. `previa` só conta. Marca as frases como editadas. */
  substituirTermoGlossario(
    db: BancoDados,
    opcoes: { obraId: number; termoZh: string; de: string; para: string; previa: boolean },
  ): { frases: number; capitulos: number } {
    const candidatas = db
      .prepare(
        `SELECT f.id, f.texto_pt, f.capitulo_id FROM frases f JOIN capitulos c ON c.id = f.capitulo_id
         WHERE c.obra_id = ? AND instr(f.texto_zh, ?) > 0 AND instr(f.texto_pt, ?) > 0`,
      )
      .all(opcoes.obraId, opcoes.termoZh, opcoes.de) as { id: number; texto_pt: string; capitulo_id: number }[];

    const afetadas: { id: number; texto: string; capitulo_id: number }[] = [];
    for (const f of candidatas) {
      const novo = trocaPorPalavra(f.texto_pt, opcoes.de, opcoes.para);
      if (novo !== f.texto_pt) afetadas.push({ id: f.id, texto: novo, capitulo_id: f.capitulo_id });
    }
    const capitulos = new Set(afetadas.map((a) => a.capitulo_id)).size;

    if (!opcoes.previa && afetadas.length > 0) {
      const upd = db.prepare('UPDATE frases SET texto_pt = ?, editado_manualmente = 1 WHERE id = ?');
      db.transaction(() => {
        for (const a of afetadas) upd.run(a.texto, a.id);
      })();
    }
    return { frases: afetadas.length, capitulos };
  },

  reverterParaIa(db: BancoDados, id: number): Frase | undefined {
    db.prepare(
      `UPDATE frases SET texto_pt = COALESCE(texto_pt_original_ia, ''), editado_manualmente = 0
       WHERE id = ? AND texto_pt_original_ia IS NOT NULL`,
    ).run(id);
    return this.obter(db, id);
  },

  /** Aplica a tradução vinda da IA (bloco de tradução ou correção aceita). */
  aplicarTraducaoIa(db: BancoDados, id: number, textoPt: string): void {
    db.prepare(
      `UPDATE frases SET texto_pt = ?,
        texto_pt_original_ia = COALESCE(texto_pt_original_ia, ?),
        status_traducao = 'traduzida'
       WHERE id = ?`,
    ).run(textoPt, textoPt, id);
  },

  marcarErro(db: BancoDados, ids: number[]): void {
    const stmt = db.prepare("UPDATE frases SET status_traducao = 'erro' WHERE id = ?");
    const tx = db.transaction(() => ids.forEach((id) => stmt.run(id)));
    tx();
  },

  /**
   * Renumera `ordem` de todo o capítulo em duas fases (negativos → finais) para
   * não violar UNIQUE(capitulo_id, ordem) no meio da atualização.
   */
  renumerar(db: BancoDados, capituloId: number): void {
    const ids = (
      db.prepare('SELECT id FROM frases WHERE capitulo_id = ? ORDER BY ordem').all(capituloId) as { id: number }[]
    ).map((l) => l.id);
    const negativa = db.prepare('UPDATE frases SET ordem = ? WHERE id = ?');
    ids.forEach((id, i) => negativa.run(-(i + 1), id));
    db.prepare('UPDATE frases SET ordem = -ordem - 1 WHERE capitulo_id = ? AND ordem < 0').run(capituloId);
  },

  /**
   * Mescla frases adjacentes numa só (correção de segmentação). Casos de teste
   * das frases absorvidas são religados à frase resultante.
   */
  mesclar(db: BancoDados, fraseIds: number[]): Frase | 'invalido' {
    if (fraseIds.length < 2) return 'invalido';
    const frases = fraseIds
      .map((id) => this.obter(db, id))
      .filter((f): f is Frase => f !== undefined)
      .sort((a, b) => a.ordem - b.ordem);
    if (frases.length !== fraseIds.length) return 'invalido';
    const capituloId = frases[0].capitulo_id;
    if (!frases.every((f) => f.capitulo_id === capituloId)) return 'invalido';
    const adjacentes = frases.every((f, i) => i === 0 || f.ordem === frases[i - 1].ordem + 1);
    if (!adjacentes) return 'invalido';

    const primeira = frases[0];
    return db.transaction(() => {
      const textoZh = frases.map((f) => f.texto_zh).join('');
      const textoPt = frases.map((f) => f.texto_pt).filter(Boolean).join(' ');
      const originais = frases.map((f) => f.texto_pt_original_ia).filter(Boolean);
      const todasTraduzidas = frases.every((f) => f.status_traducao === 'traduzida');
      db.prepare(
        `UPDATE frases SET texto_zh = ?, texto_pt = ?, texto_pt_original_ia = ?,
          editado_manualmente = ?, status_traducao = ? WHERE id = ?`,
      ).run(
        textoZh,
        textoPt,
        originais.length > 0 ? originais.join(' ') : null,
        frases.some((f) => f.editado_manualmente) ? 1 : 0,
        todasTraduzidas ? 'traduzida' : 'pendente',
        primeira.id,
      );
      const absorvidas = frases.slice(1).map((f) => f.id);
      const marcadores = absorvidas.map(() => '?').join(',');
      db.prepare(`UPDATE banco_testes SET frase_id = ? WHERE frase_id IN (${marcadores})`).run(
        primeira.id,
        ...absorvidas,
      );
      db.prepare(`DELETE FROM frases WHERE id IN (${marcadores})`).run(...absorvidas);
      this.renumerar(db, capituloId);
      return this.obter(db, primeira.id)!;
    })();
  },

  /**
   * Divide uma frase em duas (correção de segmentação). As metades zh precisam
   * reconstituir exatamente o texto original; casos de teste ficam na primeira.
   */
  dividir(
    db: BancoDados,
    id: number,
    partes: { texto_zh_1: string; texto_zh_2: string; texto_pt_1: string; texto_pt_2: string },
  ): { primeira: Frase; segunda: Frase } | 'invalido' | undefined {
    const frase = this.obter(db, id);
    if (!frase) return undefined;
    if (partes.texto_zh_1 + partes.texto_zh_2 !== frase.texto_zh) return 'invalido';
    if (!partes.texto_zh_1.trim() || !partes.texto_zh_2.trim()) return 'invalido';

    return db.transaction(() => {
      // Abre espaço: desloca as ordens seguintes em duas fases (UNIQUE-safe).
      db.prepare('UPDATE frases SET ordem = -(ordem + 1) WHERE capitulo_id = ? AND ordem > ?').run(
        frase.capitulo_id,
        frase.ordem,
      );
      db.prepare('UPDATE frases SET ordem = -ordem WHERE capitulo_id = ? AND ordem < 0').run(frase.capitulo_id);

      db.prepare(
        `UPDATE frases SET texto_zh = ?, texto_pt = ?, editado_manualmente = 1,
          status_traducao = ? WHERE id = ?`,
      ).run(partes.texto_zh_1, partes.texto_pt_1, partes.texto_pt_1.trim() ? 'traduzida' : 'pendente', id);
      const info = db
        .prepare(
          `INSERT INTO frases (capitulo_id, ordem, paragrafo, texto_zh, texto_pt, editado_manualmente, status_traducao)
           VALUES (?, ?, ?, ?, ?, 1, ?)`,
        )
        .run(
          frase.capitulo_id,
          frase.ordem + 1,
          frase.paragrafo,
          partes.texto_zh_2,
          partes.texto_pt_2,
          partes.texto_pt_2.trim() ? 'traduzida' : 'pendente',
        );
      return {
        primeira: this.obter(db, id)!,
        segunda: this.obter(db, Number(info.lastInsertRowid))!,
      };
    })();
  },

  /** Reabre frases para retradução (respeitando edições manuais, salvo ordem em contrário). */
  reabrirParaTraducao(
    db: BancoDados,
    capituloId: number,
    opcoes: { sobrescrever: boolean; sobrescreverEditadas: boolean },
  ): void {
    // Frases que falharam voltam à fila em qualquer retomada — sem isso, um bloco
    // com erro ficaria travado para sempre, já que o job só processa 'pendente'.
    db.prepare(
      "UPDATE frases SET status_traducao = 'pendente' WHERE capitulo_id = ? AND status_traducao = 'erro'",
    ).run(capituloId);
    if (!opcoes.sobrescrever) return; // padrão: só pendente/erro são retraduzidas
    if (opcoes.sobrescreverEditadas) {
      db.prepare("UPDATE frases SET status_traducao = 'pendente' WHERE capitulo_id = ?").run(capituloId);
    } else {
      db.prepare(
        "UPDATE frases SET status_traducao = 'pendente' WHERE capitulo_id = ? AND editado_manualmente = 0",
      ).run(capituloId);
    }
  },
};

// ── Glossário ──────────────────────────────────────────────────────────────

export const reposGlossario = {
  listar(db: BancoDados, obraId: number): EntradaGlossario[] {
    return db
      .prepare('SELECT * FROM glossario WHERE obra_id = ? ORDER BY termo_zh')
      .all(obraId) as EntradaGlossario[];
  },

  obter(db: BancoDados, id: number): EntradaGlossario | undefined {
    return db.prepare('SELECT * FROM glossario WHERE id = ?').get(id) as EntradaGlossario | undefined;
  },

  criar(
    db: BancoDados,
    obraId: number,
    dados: { termo_zh: string; termo_pt: string; categoria?: string; nota?: string; origem?: string },
  ): EntradaGlossario | 'duplicado' {
    try {
      const info = db
        .prepare(
          'INSERT INTO glossario (obra_id, termo_zh, termo_pt, categoria, nota, origem) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(
          obraId,
          dados.termo_zh,
          dados.termo_pt,
          dados.categoria ?? 'outro',
          dados.nota ?? null,
          dados.origem ?? 'manual',
        );
      return this.obter(db, Number(info.lastInsertRowid))!;
    } catch (e: any) {
      if (String(e.message).includes('UNIQUE')) return 'duplicado';
      throw e;
    }
  },

  atualizar(
    db: BancoDados,
    id: number,
    campos: Partial<Pick<EntradaGlossario, 'termo_zh' | 'termo_pt' | 'categoria' | 'nota'>>,
  ): EntradaGlossario | undefined {
    const atual = this.obter(db, id);
    if (!atual) return undefined;
    db.prepare('UPDATE glossario SET termo_zh = ?, termo_pt = ?, categoria = ?, nota = ? WHERE id = ?').run(
      campos.termo_zh ?? atual.termo_zh,
      campos.termo_pt ?? atual.termo_pt,
      campos.categoria ?? atual.categoria,
      campos.nota !== undefined ? campos.nota : atual.nota,
      id,
    );
    return this.obter(db, id);
  },

  excluir(db: BancoDados, id: number): boolean {
    // Solta as variantes antes de apagar (redundante com ON DELETE SET NULL, mas
    // vale mesmo se a checagem de FK estiver desligada em algum caminho).
    db.prepare('UPDATE glossario SET principal_id = NULL WHERE principal_id = ?').run(id);
    return db.prepare('DELETE FROM glossario WHERE id = ?').run(id).changes > 0;
  },

  /** Marca `id` como variante de `principalId` (ou desvincula com null). Vínculo
      é de um nível só: a canônica não pode ser ela mesma uma variante, e um termo
      que já tem variantes não pode virar variante. Devolve 'invalido' se violar. */
  vincular(db: BancoDados, id: number, principalId: number | null): EntradaGlossario | 'invalido' | undefined {
    const entrada = this.obter(db, id);
    if (!entrada) return undefined;
    if (principalId === null) {
      db.prepare('UPDATE glossario SET principal_id = NULL WHERE id = ?').run(id);
      return this.obter(db, id)!;
    }
    if (principalId === id) return 'invalido';
    const principal = this.obter(db, principalId);
    if (!principal || principal.obra_id !== entrada.obra_id) return 'invalido';
    if (principal.principal_id !== null) return 'invalido'; // canônica não pode ser variante
    const temVariantes = db.prepare('SELECT 1 FROM glossario WHERE principal_id = ?').get(id);
    if (temVariantes) return 'invalido'; // este termo já é canônica de outras
    db.prepare('UPDATE glossario SET principal_id = ? WHERE id = ?').run(principalId, id);
    return this.obter(db, id)!;
  },

  existeTermo(db: BancoDados, obraId: number, termoZh: string): boolean {
    return !!db
      .prepare('SELECT 1 FROM glossario WHERE obra_id = ? AND termo_zh = ?')
      .get(obraId, termoZh);
  },

  /** Primeira e última aparição de cada termo do glossário no texto-fonte da obra,
      por (capítulo, ordem da frase). Calculado sob demanda — nada é gravado, então
      sobrevive a retradução, divisão/mescla e reordenação de capítulos. */
  aparicoes(db: BancoDados, obraId: number): Record<number, { primeira: AparicaoTermo | null; ultima: AparicaoTermo | null }> {
    const termos = db.prepare('SELECT id, termo_zh FROM glossario WHERE obra_id = ?').all(obraId) as {
      id: number;
      termo_zh: string;
    }[];
    const frases = db
      .prepare(
        `SELECT f.id AS frase_id, f.ordem AS frase_ordem, f.texto_zh, c.id AS capitulo_id, c.numero AS capitulo_numero
         FROM frases f JOIN capitulos c ON c.id = f.capitulo_id
         WHERE c.obra_id = ? ORDER BY c.numero, f.ordem`,
      )
      .all(obraId) as (AparicaoTermo & { texto_zh: string })[];
    const resultado: Record<number, { primeira: AparicaoTermo | null; ultima: AparicaoTermo | null }> = {};
    for (const t of termos) {
      let primeira: AparicaoTermo | null = null;
      let ultima: AparicaoTermo | null = null;
      for (const f of frases) {
        if (f.texto_zh.includes(t.termo_zh)) {
          const ap = { capitulo_id: f.capitulo_id, capitulo_numero: f.capitulo_numero, frase_id: f.frase_id, frase_ordem: f.frase_ordem };
          if (!primeira) primeira = ap;
          ultima = ap;
        }
      }
      resultado[t.id] = { primeira, ultima };
    }
    return resultado;
  },
};

export interface AparicaoTermo {
  capitulo_id: number;
  capitulo_numero: number;
  frase_id: number;
  frase_ordem: number;
}

// ── Termos sugeridos ───────────────────────────────────────────────────────

export const reposTermosSugeridos = {
  listar(db: BancoDados, obraId: number, status?: string): TermoSugerido[] {
    if (status) {
      return db
        .prepare('SELECT * FROM termos_sugeridos WHERE obra_id = ? AND status = ? ORDER BY criado_em DESC')
        .all(obraId, status) as TermoSugerido[];
    }
    return db
      .prepare('SELECT * FROM termos_sugeridos WHERE obra_id = ? ORDER BY criado_em DESC')
      .all(obraId) as TermoSugerido[];
  },

  obter(db: BancoDados, id: number): TermoSugerido | undefined {
    return db.prepare('SELECT * FROM termos_sugeridos WHERE id = ?').get(id) as TermoSugerido | undefined;
  },

  /** Registra sugestão se o termo não existe no glossário nem já está pendente. Retorna quantas entraram. */
  registrar(
    db: BancoDados,
    obraId: number,
    capituloId: number,
    termos: { termo_zh: string; termo_pt: string; categoria?: string; contexto?: string }[],
  ): number {
    let novos = 0;
    const tx = db.transaction(() => {
      for (const t of termos) {
        if (!t.termo_zh || !t.termo_pt) continue;
        if (reposGlossario.existeTermo(db, obraId, t.termo_zh)) continue;
        const pendente = db
          .prepare("SELECT 1 FROM termos_sugeridos WHERE obra_id = ? AND termo_zh = ? AND status = 'pendente'")
          .get(obraId, t.termo_zh);
        if (pendente) continue;
        db.prepare(
          'INSERT INTO termos_sugeridos (obra_id, capitulo_id, termo_zh, termo_pt, categoria, contexto) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(obraId, capituloId, t.termo_zh, t.termo_pt, t.categoria ?? null, t.contexto ?? null);
        novos++;
      }
    });
    tx();
    return novos;
  },

  aceitar(
    db: BancoDados,
    id: number,
    ajustes?: { termo_pt?: string; categoria?: string; nota?: string },
  ): EntradaGlossario | 'duplicado' | undefined {
    const sugestao = this.obter(db, id);
    if (!sugestao) return undefined;
    return db.transaction(() => {
      const resultado = reposGlossario.criar(db, sugestao.obra_id, {
        termo_zh: sugestao.termo_zh,
        termo_pt: ajustes?.termo_pt ?? sugestao.termo_pt,
        categoria: ajustes?.categoria ?? (ehCategoriaValida(sugestao.categoria) ? sugestao.categoria! : 'outro'),
        // Sem nota editada, aproveita a descrição da IA (contexto) como nota —
        // antes ela era exibida na triagem e descartada ao aceitar.
        nota: ajustes?.nota ?? sugestao.contexto ?? undefined,
        origem: 'sugerido-ia',
      });
      db.prepare("UPDATE termos_sugeridos SET status = 'aceito' WHERE id = ?").run(id);
      return resultado;
    })();
  },

  rejeitar(db: BancoDados, id: number): boolean {
    return db.prepare("UPDATE termos_sugeridos SET status = 'rejeitado' WHERE id = ?").run(id).changes > 0;
  },
};

function ehCategoriaValida(c: string | null): boolean {
  return !!c && ['local', 'poder-habilidade', 'entidade', 'titulo-cargo', 'personagem', 'outro'].includes(c);
}

// ── Banco de testes ────────────────────────────────────────────────────────

export const reposTestes = {
  listar(
    db: BancoDados,
    obraId: number,
    filtros: {
      status?: string;
      veredito?: string;
      secao_regra?: string;
      capitulo_id?: number;
      de?: string;
      ate?: string;
      limite?: number;
      offset?: number;
    } = {},
  ): { casos: CasoTeste[]; total: number } {
    const clausulas = ['t.obra_id = ?'];
    const params: unknown[] = [obraId];
    if (filtros.status) {
      clausulas.push('t.status = ?');
      params.push(filtros.status);
    }
    if (filtros.veredito) {
      clausulas.push('t.veredito = ?');
      params.push(filtros.veredito);
    }
    if (filtros.secao_regra) {
      clausulas.push('t.secao_regra = ?');
      params.push(filtros.secao_regra);
    }
    if (filtros.capitulo_id) {
      clausulas.push('t.frase_id IN (SELECT id FROM frases WHERE capitulo_id = ?)');
      params.push(filtros.capitulo_id);
    }
    if (filtros.de) {
      clausulas.push('t.criado_em >= ?');
      params.push(`${filtros.de}T00:00:00.000Z`);
    }
    if (filtros.ate) {
      clausulas.push('t.criado_em <= ?');
      params.push(`${filtros.ate}T23:59:59.999Z`);
    }
    const onde = clausulas.join(' AND ');
    const total = (db.prepare(`SELECT COUNT(*) n FROM banco_testes t WHERE ${onde}`).get(...params) as { n: number }).n;
    const casos = db
      .prepare(`SELECT t.* FROM banco_testes t WHERE ${onde} ORDER BY t.criado_em DESC LIMIT ? OFFSET ?`)
      .all(...params, filtros.limite ?? 50, filtros.offset ?? 0) as CasoTeste[];
    return { casos, total };
  },

  obter(db: BancoDados, id: number): CasoTeste | undefined {
    return db.prepare('SELECT * FROM banco_testes WHERE id = ?').get(id) as CasoTeste | undefined;
  },

  listarPorFrase(db: BancoDados, fraseId: number): CasoTeste[] {
    return db
      .prepare('SELECT * FROM banco_testes WHERE frase_id = ? ORDER BY criado_em DESC')
      .all(fraseId) as CasoTeste[];
  },

  criar(
    db: BancoDados,
    dados: Omit<CasoTeste, 'id' | 'criado_em' | 'status'> & { resposta_bruta: string },
  ): CasoTeste {
    const status: StatusCasoTeste = dados.veredito === 'correto' ? 'confirmado' : 'pendente';
    const info = db
      .prepare(
        `INSERT INTO banco_testes
          (frase_id, obra_id, trecho_zh, pergunta, veredito, justificativa, secao_regra,
           correcao_proposta, status, provedor, modelo, resposta_bruta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dados.frase_id,
        dados.obra_id,
        dados.trecho_zh,
        dados.pergunta,
        dados.veredito,
        dados.justificativa,
        dados.secao_regra,
        dados.correcao_proposta,
        status,
        dados.provedor,
        dados.modelo,
        dados.resposta_bruta,
      );
    return this.obter(db, Number(info.lastInsertRowid))!;
  },

  atualizarStatus(db: BancoDados, id: number, status: StatusCasoTeste): CasoTeste | undefined {
    db.prepare('UPDATE banco_testes SET status = ? WHERE id = ?').run(status, id);
    return this.obter(db, id);
  },

  /** Aceita a correção proposta: atualiza a frase e marca o caso como corrigido. */
  aplicarCorrecao(db: BancoDados, id: number): { caso: CasoTeste; frase: Frase } | 'sem-correcao' | undefined {
    const caso = this.obter(db, id);
    if (!caso) return undefined;
    if (!caso.correcao_proposta) return 'sem-correcao';
    return db.transaction(() => {
      // M3: aceitar a correção do Protocolo de Revisão é uma decisão humana —
      // marca editado_manualmente para que "sobrescrever preservando editadas"
      // não reabra a frase e a IA não apague a correção; e conta certo na
      // métrica de edição do checkpoint (doc 09 §4).
      db.prepare('UPDATE frases SET texto_pt = ?, editado_manualmente = 1 WHERE id = ?').run(
        caso.correcao_proposta,
        caso.frase_id,
      );
      db.prepare("UPDATE banco_testes SET status = 'corrigido' WHERE id = ?").run(id);
      return { caso: this.obter(db, id)!, frase: reposFrases.obter(db, caso.frase_id)! };
    })();
  },

  /** Casos não-confirmados agregados por seção/regra — alimenta o alerta de recorrência. */
  recorrencias(db: BancoDados, obraId: number): { secao_regra: string; casos: number }[] {
    return db
      .prepare(
        `SELECT secao_regra, COUNT(*) AS casos FROM banco_testes
         WHERE obra_id = ? AND status IN ('pendente','regra-nova-necessaria') AND secao_regra IS NOT NULL
         GROUP BY secao_regra HAVING COUNT(*) >= 2 ORDER BY casos DESC`,
      )
      .all(obraId) as { secao_regra: string; casos: number }[];
  },
};

// ── Configurações (chave-valor) ────────────────────────────────────────────

export const reposConfig = {
  obterTodas(db: BancoDados): Configuracoes {
    const linhas = db.prepare('SELECT chave, valor FROM configuracoes').all() as {
      chave: string;
      valor: string;
    }[];
    const mapa = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
    return {
      provedor_padrao: (mapa.provedor_padrao as Configuracoes['provedor_padrao']) ?? CONFIG_PADRAO.provedor_padrao,
      modelo_padrao: mapa.modelo_padrao ?? CONFIG_PADRAO.modelo_padrao,
      tamanho_bloco: mapa.tamanho_bloco ? Number(mapa.tamanho_bloco) : CONFIG_PADRAO.tamanho_bloco,
      vizinhas_revisao: mapa.vizinhas_revisao ? Number(mapa.vizinhas_revisao) : CONFIG_PADRAO.vizinhas_revisao,
      cauda_contexto: mapa.cauda_contexto ? Number(mapa.cauda_contexto) : CONFIG_PADRAO.cauda_contexto,
      parar_no_limite: mapa.parar_no_limite ? mapa.parar_no_limite === 'true' : CONFIG_PADRAO.parar_no_limite,
      glossario_relevante: mapa.glossario_relevante
        ? mapa.glossario_relevante === 'true'
        : CONFIG_PADRAO.glossario_relevante,
      provedor_revisao: (mapa.provedor_revisao as Configuracoes['provedor_revisao']) ?? CONFIG_PADRAO.provedor_revisao,
      modelo_revisao: mapa.modelo_revisao ?? CONFIG_PADRAO.modelo_revisao,
      cotas_diarias: lerCotasDiarias(mapa),
      checkpoint_janela: numeroConfig(mapa.checkpoint_janela, CONFIG_PADRAO.checkpoint_janela),
      checkpoint_termos_max: numeroConfig(mapa.checkpoint_termos_max, CONFIG_PADRAO.checkpoint_termos_max),
      checkpoint_edicao_max: numeroConfig(mapa.checkpoint_edicao_max, CONFIG_PADRAO.checkpoint_edicao_max),
      checkpoint_violacoes_max: numeroConfig(mapa.checkpoint_violacoes_max, CONFIG_PADRAO.checkpoint_violacoes_max),
      lote_paralelo: numeroConfig(mapa.lote_paralelo, CONFIG_PADRAO.lote_paralelo),
      failover: lerFailover(mapa),
      provedor_qa: (mapa.provedor_qa as Configuracoes['provedor_qa']) ?? CONFIG_PADRAO.provedor_qa,
      modelo_qa: mapa.modelo_qa ?? CONFIG_PADRAO.modelo_qa,
      qa_automatica: mapa.qa_automatica ? mapa.qa_automatica === 'true' : CONFIG_PADRAO.qa_automatica,
      precos_modelos: lerPrecos(mapa),
      taxa_usd_brl: numeroConfig(mapa.taxa_usd_brl, CONFIG_PADRAO.taxa_usd_brl),
    };
  },

  definir(db: BancoDados, valores: Partial<Configuracoes>): Configuracoes {
    const stmt = db.prepare(
      'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor',
    );
    db.transaction(() => {
      for (const [chave, valor] of Object.entries(valores)) {
        if (valor === undefined) continue;
        stmt.run(chave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor));
      }
    })();
    return this.obterTodas(db);
  },
};

/** Config numérica com guarda de NaN (B9): valor corrompido cai no padrão. */
function numeroConfig(valor: string | undefined, padrao: number): number {
  if (valor === undefined) return padrao;
  const n = Number(valor);
  return Number.isFinite(n) ? n : padrao;
}

/** Cadeia de failover (JSON de pares {provedor, modelo}); valor corrompido = vazia. */
function lerFailover(mapa: Record<string, string>): ParProvedor[] {
  if (!mapa.failover) return [...CONFIG_PADRAO.failover];
  try {
    const lista = JSON.parse(mapa.failover);
    if (!Array.isArray(lista)) return [];
    return lista
      .filter((p) => p && typeof p.provedor === 'string')
      .map((p) => ({ provedor: p.provedor as ProvedorId, modelo: typeof p.modelo === 'string' ? p.modelo : '' }));
  } catch {
    return [];
  }
}

/** Tabela de preços (JSON de `"provedor:modelo"` → USD/1M). Entrada malformada é
 * DESCARTADA em vez de virar 0 — um preço zero silencioso mentiria dizendo que o
 * modelo é grátis (doc 11 §3). Valor corrompido cai nos padrões de fábrica. */
function lerPrecos(mapa: Record<string, string>): PrecosModelos {
  if (!mapa.precos_modelos) return { ...CONFIG_PADRAO.precos_modelos };
  try {
    const bruto = JSON.parse(mapa.precos_modelos) as Record<string, unknown>;
    if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return {};
    const precos: PrecosModelos = {};
    for (const [chave, valor] of Object.entries(bruto)) {
      const p = valor as Partial<PrecoModelo> | null;
      if (!p || typeof p !== 'object') continue;
      if (!Number.isFinite(p.entrada) || !Number.isFinite(p.saida)) continue;
      precos[chave] = {
        entrada: p.entrada!,
        saida: p.saida!,
        ...(Number.isFinite(p.cache_leitura) ? { cache_leitura: p.cache_leitura! } : {}),
        ...(Number.isFinite(p.cache_criacao) ? { cache_criacao: p.cache_criacao! } : {}),
      };
    }
    return precos;
  } catch {
    return { ...CONFIG_PADRAO.precos_modelos };
  }
}

/** Cotas por provedor (JSON) com migração das chaves antigas cota_diaria_gemini/claude. */
function lerCotasDiarias(mapa: Record<string, string>): Record<string, number> {
  if (mapa.cotas_diarias) {
    try {
      return JSON.parse(mapa.cotas_diarias) as Record<string, number>;
    } catch {
      /* valor corrompido: cai para os padrões */
    }
  }
  const cotas = { ...CONFIG_PADRAO.cotas_diarias };
  if (mapa.cota_diaria_gemini !== undefined) cotas.gemini = Number(mapa.cota_diaria_gemini);
  if (mapa.cota_diaria_claude !== undefined) cotas.claude = Number(mapa.cota_diaria_claude);
  return cotas;
}

// ── Uso de IA (indicador de cota gratuita) ─────────────────────────────────

/** Data local YYYY-MM-DD — cotas diárias dos provedores renovam por dia-calendário.
 * Fonte única da chave de dia: `uso_ia` e `eventos_ia` precisam concordar para o
 * painel comparar tentativas com chamadas faturadas (doc 11 §2). */
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

// ── Lotes de tradução (fase de cruzeiro, doc 09 §5) ────────────────────────

interface LinhaLote {
  id: number;
  obra_id: number;
  status: StatusLote;
  qa_automatica: number;
  criado_em: string;
  encerrado_em: string | null;
}

export const reposLotes = {
  /** Capítulos da obra que em algum momento passaram por um lote — define os dois
   * grupos da pergunta "o lote compensou em dinheiro?" (doc 11 §5) sem precisar
   * de coluna nova em capitulos. */
  capituloIdsEmLote(db: BancoDados, obraId: number): number[] {
    return (
      db
        .prepare(
          `SELECT DISTINCT lc.capitulo_id FROM lote_capitulos lc
             JOIN lotes l ON l.id = lc.lote_id
           WHERE l.obra_id = ?`,
        )
        .all(obraId) as { capitulo_id: number }[]
    ).map((l) => l.capitulo_id);
  },

  /** Lote atual (executando) ou o último encerrado da obra, com seus capítulos. */
  atual(db: BancoDados, obraId: number): Lote | undefined {
    const linha = db
      .prepare(
        `SELECT * FROM lotes WHERE obra_id = ?
         ORDER BY (status = 'executando') DESC, criado_em DESC LIMIT 1`,
      )
      .get(obraId) as LinhaLote | undefined;
    return linha ? this.montar(db, linha) : undefined;
  },

  obter(db: BancoDados, loteId: number): Lote | undefined {
    const linha = db.prepare('SELECT * FROM lotes WHERE id = ?').get(loteId) as LinhaLote | undefined;
    return linha ? this.montar(db, linha) : undefined;
  },

  ativoDaObra(db: BancoDados, obraId: number): Lote | undefined {
    const linha = db
      .prepare("SELECT * FROM lotes WHERE obra_id = ? AND status = 'executando'")
      .get(obraId) as LinhaLote | undefined;
    return linha ? this.montar(db, linha) : undefined;
  },

  montar(db: BancoDados, linha: LinhaLote): Lote {
    const capitulos = db
      .prepare(
        `SELECT lc.capitulo_id, c.numero, c.titulo, lc.posicao, lc.status, lc.provedores_tentados, lc.erro,
           (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id) AS frases_total,
           (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id AND f.status_traducao = 'traduzida') AS frases_traduzidas,
           (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id AND f.status_traducao = 'erro') AS frases_erro
         FROM lote_capitulos lc JOIN capitulos c ON c.id = lc.capitulo_id
         WHERE lc.lote_id = ? ORDER BY lc.posicao`,
      )
      .all(linha.id)
      .map((r: any) => ({
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
    return {
      id: linha.id,
      obra_id: linha.obra_id,
      status: linha.status,
      qa_automatica: !!linha.qa_automatica,
      criado_em: linha.criado_em,
      encerrado_em: linha.encerrado_em,
      capitulos,
    };
  },

  /** Cria o lote e enfileira os capítulos na ordem dada. */
  criar(db: BancoDados, obraId: number, capituloIds: number[], qaAutomatica: boolean): Lote {
    return db.transaction(() => {
      const info = db
        .prepare('INSERT INTO lotes (obra_id, qa_automatica) VALUES (?, ?)')
        .run(obraId, qaAutomatica ? 1 : 0);
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
        const atual = db
          .prepare('SELECT provedores_tentados FROM lote_capitulos WHERE lote_id = ? AND capitulo_id = ?')
          .get(loteId, capituloId) as { provedores_tentados: string } | undefined;
        const lista = atual ? (JSON.parse(atual.provedores_tentados) as ParProvedor[]) : [];
        lista.push(extra.tentado);
        db.prepare('UPDATE lote_capitulos SET provedores_tentados = ? WHERE lote_id = ? AND capitulo_id = ?').run(
          JSON.stringify(lista),
          loteId,
          capituloId,
        );
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

  /** No boot: nenhum job sobrevive ao processo, então lotes 'executando' de uma
   * sessão anterior estão interrompidos (doc 09 §5). Capítulos que ficaram em
   * 'traduzindo'/'qa' voltam para 'na_fila' para a retomada reprocessá-los. */
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

// ── Apontamentos de QA (doc 09 §6) ─────────────────────────────────────────

export const reposQa = {
  listar(db: BancoDados, capituloId: number): ApontamentoQa[] {
    return db
      .prepare(
        `SELECT * FROM qa_apontamentos WHERE capitulo_id = ?
         ORDER BY CASE severidade WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
                  CASE status WHEN 'pendente' THEN 0 ELSE 1 END, id`,
      )
      .all(capituloId) as ApontamentoQa[];
  },

  obter(db: BancoDados, id: number): ApontamentoQa | undefined {
    return db.prepare('SELECT * FROM qa_apontamentos WHERE id = ?').get(id) as ApontamentoQa | undefined;
  },

  /** Substitui os apontamentos PENDENTES do capítulo pelos novos (uma nova
   * passada de QA re-aponta do zero; os já triados ficam como histórico). */
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
        ins.run(capituloId, a.frase_id, a.tipo, a.severidade, a.trecho_zh, a.observacao, a.sugestao, provedor, modelo);
      }
      reposCapitulos.definirQaEm(db, capituloId);
      return apontamentos.length;
    })();
  },

  definirStatus(db: BancoDados, id: number, status: StatusApontamentoQa): ApontamentoQa | undefined {
    db.prepare('UPDATE qa_apontamentos SET status = ? WHERE id = ?').run(status, id);
    return this.obter(db, id);
  },

  /** Aplica a sugestão do apontamento na frase (marca editado_manualmente, M3)
   * e marca o apontamento como aceito. */
  aplicarSugestao(db: BancoDados, id: number): { apontamento: ApontamentoQa; frase: Frase } | 'sem-sugestao' | undefined {
    const a = this.obter(db, id);
    if (!a) return undefined;
    if (!a.sugestao || !a.frase_id) return 'sem-sugestao';
    return db.transaction(() => {
      db.prepare('UPDATE frases SET texto_pt = ?, editado_manualmente = 1 WHERE id = ?').run(a.sugestao, a.frase_id);
      db.prepare("UPDATE qa_apontamentos SET status = 'aceito' WHERE id = ?").run(id);
      return { apontamento: this.obter(db, id)!, frase: reposFrases.obter(db, a.frase_id!)! };
    })();
  },

  /** Pendentes por capítulo para os badges da lista. */
  pendentesPorCapitulo(db: BancoDados, obraId: number): Map<number, { total: number; altas: number }> {
    const linhas = db
      .prepare(
        `SELECT q.capitulo_id, COUNT(*) AS total,
           SUM(CASE WHEN q.severidade = 'alta' THEN 1 ELSE 0 END) AS altas
         FROM qa_apontamentos q JOIN capitulos c ON c.id = q.capitulo_id
         WHERE c.obra_id = ? AND q.status = 'pendente' GROUP BY q.capitulo_id`,
      )
      .all(obraId) as { capitulo_id: number; total: number; altas: number }[];
    return new Map(linhas.map((l) => [l.capitulo_id, { total: l.total, altas: l.altas }]));
  },
};
