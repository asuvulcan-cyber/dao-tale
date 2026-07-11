import type { BancoDados } from './index.js';
import type {
  Obra,
  ObraComContadores,
  PromptMae,
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
} from '@dao-tale/shared';
import { CONFIG_PADRAO } from '@dao-tale/shared';

// Linhas cruas do SQLite (booleanos como 0/1) → tipos do domínio.
function paraPrompt(l: any): PromptMae {
  return { ...l, ativo: !!l.ativo };
}
function paraFrase(l: any): Frase {
  return { ...l, editado_manualmente: !!l.editado_manualmente };
}

// ── Obras ──────────────────────────────────────────────────────────────────

export const reposObras = {
  listar(db: BancoDados): ObraComContadores[] {
    return db
      .prepare(
        `SELECT o.*,
           (SELECT COUNT(*) FROM capitulos c WHERE c.obra_id = o.id) AS capitulos_total,
           (SELECT COUNT(*) FROM glossario g WHERE g.obra_id = o.id) AS glossario_total,
           (SELECT COUNT(*) FROM banco_testes t WHERE t.obra_id = o.id AND t.status = 'pendente') AS testes_pendentes,
           (SELECT COUNT(*) FROM termos_sugeridos s WHERE s.obra_id = o.id AND s.status = 'pendente') AS termos_sugeridos_pendentes
         FROM obras o ORDER BY o.criado_em DESC`,
      )
      .all() as ObraComContadores[];
  },

  obter(db: BancoDados, id: number): Obra | undefined {
    return db.prepare('SELECT * FROM obras WHERE id = ?').get(id) as Obra | undefined;
  },

  criar(db: BancoDados, payload: CriarObraPayload): Obra {
    return db.transaction(() => {
      const info = db
        .prepare('INSERT INTO obras (titulo, titulo_original) VALUES (?, ?)')
        .run(payload.titulo, payload.titulo_original ?? null);
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
    campos: Partial<Pick<Obra, 'titulo' | 'titulo_original' | 'provedor_padrao' | 'modelo_padrao'>>,
  ): Obra | undefined {
    const atual = this.obter(db, id);
    if (!atual) return undefined;
    db.prepare(
      `UPDATE obras SET titulo = ?, titulo_original = ?, provedor_padrao = ?, modelo_padrao = ?,
        atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(
      campos.titulo ?? atual.titulo,
      campos.titulo_original !== undefined ? campos.titulo_original : atual.titulo_original,
      campos.provedor_padrao !== undefined ? campos.provedor_padrao : atual.provedor_padrao,
      campos.modelo_padrao !== undefined ? campos.modelo_padrao : atual.modelo_padrao,
      id,
    );
    return this.obter(db, id);
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
    dados: { versao: string; conteudo: string; notas_versao?: string; ativar: boolean },
  ): PromptMae {
    return db.transaction(() => {
      if (dados.ativar) {
        db.prepare('UPDATE prompts SET ativo = 0 WHERE obra_id = ?').run(obraId);
      }
      const info = db
        .prepare(
          'INSERT INTO prompts (obra_id, versao, conteudo, notas_versao, ativo) VALUES (?, ?, ?, ?, ?)',
        )
        .run(obraId, dados.versao, dados.conteudo, dados.notas_versao ?? null, dados.ativar ? 1 : 0);
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
};

// ── Capítulos ──────────────────────────────────────────────────────────────

export const reposCapitulos = {
  listar(db: BancoDados, obraId: number): CapituloResumo[] {
    return db
      .prepare(
        `SELECT c.id, c.obra_id, c.numero, c.titulo, c.titulo_pt, c.status, c.provedor, c.modelo, c.prompt_id,
                c.criado_em, c.atualizado_em,
           (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id) AS frases_total,
           (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id AND f.status_traducao = 'traduzida') AS frases_traduzidas,
           (SELECT COUNT(*) FROM frases f WHERE f.capitulo_id = c.id AND f.status_traducao = 'erro') AS frases_erro
         FROM capitulos c WHERE c.obra_id = ? ORDER BY c.numero`,
      )
      .all(obraId) as CapituloResumo[];
  },

  obter(db: BancoDados, id: number): Capitulo | undefined {
    return db.prepare('SELECT * FROM capitulos WHERE id = ?').get(id) as Capitulo | undefined;
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
    campos: Partial<{ titulo: string | null; titulo_pt: string | null; status: StatusCapitulo; provedor: string | null; modelo: string | null; prompt_id: number | null }>,
  ): Capitulo | undefined {
    const atual = this.obter(db, id);
    if (!atual) return undefined;
    db.prepare(
      `UPDATE capitulos SET titulo = ?, titulo_pt = ?, status = ?, provedor = ?, modelo = ?, prompt_id = ?,
        atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(
      campos.titulo !== undefined ? campos.titulo : atual.titulo,
      campos.titulo_pt !== undefined ? campos.titulo_pt : atual.titulo_pt,
      campos.status ?? atual.status,
      campos.provedor !== undefined ? campos.provedor : atual.provedor,
      campos.modelo !== undefined ? campos.modelo : atual.modelo,
      campos.prompt_id !== undefined ? campos.prompt_id : atual.prompt_id,
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
    return db.prepare('DELETE FROM glossario WHERE id = ?').run(id).changes > 0;
  },

  existeTermo(db: BancoDados, obraId: number, termoZh: string): boolean {
    return !!db
      .prepare('SELECT 1 FROM glossario WHERE obra_id = ? AND termo_zh = ?')
      .get(obraId, termoZh);
  },
};

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
        nota: ajustes?.nota,
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
      db.prepare('UPDATE frases SET texto_pt = ? WHERE id = ?').run(caso.correcao_proposta, caso.frase_id);
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
    };
  },

  definir(db: BancoDados, valores: Partial<Configuracoes>): Configuracoes {
    const stmt = db.prepare(
      'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor',
    );
    db.transaction(() => {
      for (const [chave, valor] of Object.entries(valores)) {
        if (valor !== undefined) stmt.run(chave, String(valor));
      }
    })();
    return this.obterTodas(db);
  },
};
