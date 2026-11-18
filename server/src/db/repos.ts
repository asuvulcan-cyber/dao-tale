import type { BancoDados } from './index.js';
import type {
  Obra,
  ObraComContadores,
  VersaoDelta,
  PromptPadrao,
  PromptComposto,
  TipoPrompt,
  Capitulo,
  CapituloResumo,
  Frase,
  EntradaGlossario,
  EspecieTermo,
  TermoSugerido,
  CasoTeste,
  CriarObraPayload,
  StatusCasoTeste,
  StatusCapitulo,
  FaseTraducao,
  PreferenciasEstilo,
  Camada,
  IdiomaOrigem,
} from '@dao-tale/shared';
import {
  IDIOMA_ORIGEM_PADRAO,
  ehIdiomaOrigem,
  aplicarCorrecao,
  camadaDoRotulo,
  normalizarSecaoRegra,
  normalizarPreferencias,
  temperaturaValida,
  ehCategoriaGlossarioPadrao,
  DEFINICOES_RELACOES_TERMO,
} from '@dao-tale/shared';
import { comporOmega } from './promptPadraoInicial.js';
import { varrerConsistencia } from '../traducao/consistencia.js';
import { separarPorChecagem } from '../traducao/glossarioChecavel.js';
import { reposConfig } from './repos/config.js';
import { reposLotes } from './repos/lotes.js';
import { criarReposQa } from './repos/qa.js';
import { dataLocalHoje, reposUso } from './repos/uso.js';

/** Substitui `de` por `para` só quando `de` é uma palavra isolada — não colada a
    letra/número (fronteira Unicode, então acentos contam como letra). Evita trocar
    "Rio" dentro de "Prioridade". */
function trocaPorPalavra(texto: string, de: string, para: string): string {
  const esc = de.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return texto.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc}(?![\\p{L}\\p{N}])`, 'gu'), para);
}

// Linhas cruas do SQLite (booleanos como 0/1) → tipos do domínio.
/** Serve às duas tabelas de prompt, que divergiram nas colunas: `prompts` tem
 *  `preferencias`, `prompt_padrao` tem `idioma_origem`. O genérico existe para o
 *  chamador dizer qual das duas está lendo, já que a linha entra como `any`. */
function paraPrompt<T = VersaoDelta>(l: any): T {
  const prompt = { ...l, ativo: !!l.ativo };
  // Só linhas de `prompts` têm preferências; as de `prompt_padrao` (núcleo) não —
  // e um PromptPadrao não deve ganhar o campo do nada.
  if ('preferencias' in l) prompt.preferencias = normalizarPreferencias(l.preferencias);
  return prompt as T;
}
function paraFrase(l: any): Frase {
  return { ...l, editado_manualmente: !!l.editado_manualmente };
}
// `ambiguo` é a única coluna booleana do glossário (migração 026); as demais
// colunas novas (especie, nota_uso, termo_pai_id) já saem como TEXT/INTEGER
// anuláveis do SQLite e batem direto com o tipo do domínio.
function paraGlossario(l: any): EntradaGlossario {
  return { ...l, ambiguo: !!l.ambiguo };
}

// ── Obras ──────────────────────────────────────────────────────────────────

// Colunas sem o BLOB da capa (pesado e sem lugar em JSON); tem_capa o resume.
const COLUNAS_OBRA = `o.id, o.titulo, o.titulo_original, o.idioma_origem, o.autor, o.sinopse, o.tags, o.provedor_padrao,
  o.modelo_padrao, o.temperatura, o.thinking, o.fase_traducao, o.publica, o.criado_em, o.atualizado_em,
  (o.capa IS NOT NULL) AS tem_capa`;

/** Perfil de idioma da obra, direto da coluna — é o que escolhe qual Alfa vale.
 *  Obra inexistente ou valor solto cai no mandarim, como toda obra anterior. */
function idiomaDaObra(db: BancoDados, obraId: number): IdiomaOrigem {
  const l = db.prepare('SELECT idioma_origem FROM obras WHERE id = ?').get(obraId) as
    | { idioma_origem: string }
    | undefined;
  return ehIdiomaOrigem(l?.idioma_origem) ? l.idioma_origem : IDIOMA_ORIGEM_PADRAO;
}

function paraObra<T extends { tags: unknown; tem_capa: unknown; publica: unknown }>(
  linha: T,
): T & { tags: string[]; tem_capa: boolean; publica: boolean } {
  return {
    ...linha,
    tags: JSON.parse((linha.tags as string) || '[]'),
    tem_capa: !!linha.tem_capa,
    publica: !!linha.publica,
  };
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
      const idiomaOrigem = payload.idioma_origem ?? IDIOMA_ORIGEM_PADRAO;
      const info = db
        .prepare('INSERT INTO obras (titulo, titulo_original, sinopse, tags, idioma_origem) VALUES (?, ?, ?, ?, ?)')
        .run(
          payload.titulo,
          payload.titulo_original ?? null,
          payload.sinopse ?? null,
          JSON.stringify(payload.tags ?? []),
          idiomaOrigem,
        );
      const obraId = Number(info.lastInsertRowid);
      if (payload.prompt_inicial) {
        // Obra nova NASCE EM CAMADAS (doc 15). A coluna `tipo` tem default 'completo' por
        // causa da migração 006, que precisava preservar o legado — mas herdar esse default
        // aqui fazia toda obra criada COM prompt inicial nascer no modelo antigo, fora de
        // tudo: sem preferências de estilo, sem receber melhorias do núcleo, sem as
        // checagens de partição. Obra criada SEM o campo já nascia em camadas, via
        // `adotarPadrao` — os dois caminhos divergiam em silêncio.
        //
        // O que o usuário digita ao cadastrar uma obra é, por definição, específico dela:
        // é Delta. Se ele colar um prompt inteiro ali, a checagem de Delta avisa que aquilo
        // decide temas de Alfa/Beta, e a conversão assistida separa — que é o caminho certo,
        // em vez de nascer legado e ninguém perceber.
        //
        // Sem núcleo ativo não há com o que compor: aí o conteúdo precisa mesmo bastar-se,
        // e 'completo' é o registro honesto disso.
        //
        // O núcleo é o do PERFIL DA OBRA: compor um Delta inglês sobre o Alfa
        // mandarim produziria um Ômega que manda traduzir do chinês um texto
        // que não é chinês.
        const nucleo = reposPromptPadrao.ativo(db, idiomaOrigem);
        db.prepare(
          'INSERT INTO prompts (obra_id, versao, conteudo, ativo, tipo, nucleo_id) VALUES (?, ?, ?, 1, ?, ?)',
        ).run(
          obraId,
          payload.prompt_inicial.versao,
          payload.prompt_inicial.conteudo,
          nucleo ? 'delta' : 'completo',
          nucleo?.id ?? null,
        );
      }
      for (const e of payload.glossario_inicial ?? []) {
        db.prepare(
          `INSERT INTO glossario (obra_id, termo_zh, termo_pt, categoria, nota)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (obra_id, termo_zh) DO NOTHING`,
        ).run(obraId, e.termo_zh, e.termo_pt, e.categoria ?? 'lexico-geral', e.nota ?? null);
      }
      return this.obter(db, obraId)!;
    })();
  },

  atualizar(
    db: BancoDados,
    id: number,
    campos: Partial<
      Pick<
        Obra,
        | 'titulo'
        | 'titulo_original'
        | 'autor'
        | 'sinopse'
        | 'tags'
        | 'provedor_padrao'
        | 'modelo_padrao'
        | 'temperatura'
        | 'thinking'
        | 'publica'
      >
    >,
  ): Obra | undefined {
    const atual = this.obter(db, id);
    if (!atual) return undefined;
    db.prepare(
      `UPDATE obras SET titulo = ?, titulo_original = ?, autor = ?, sinopse = ?, tags = ?, provedor_padrao = ?, modelo_padrao = ?,
        temperatura = ?, thinking = ?, publica = ?, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(
      campos.titulo ?? atual.titulo,
      campos.titulo_original !== undefined ? campos.titulo_original : atual.titulo_original,
      campos.autor !== undefined ? campos.autor : atual.autor,
      campos.sinopse !== undefined ? campos.sinopse : atual.sinopse,
      JSON.stringify(campos.tags !== undefined ? campos.tags : atual.tags),
      campos.provedor_padrao !== undefined ? campos.provedor_padrao : atual.provedor_padrao,
      campos.modelo_padrao !== undefined ? campos.modelo_padrao : atual.modelo_padrao,
      // Guarda de fronteira: valor fora da faixa aceita não vira chamada rejeitada.
      campos.temperatura !== undefined ? temperaturaValida(campos.temperatura) : atual.temperatura,
      campos.thinking !== undefined ? campos.thinking : atual.thinking,
      // Publicar/despublicar passa por aqui como qualquer campo, mas o padrão
      // ao OMITIR é sempre "mantém o que estava" — nunca "publica".
      (campos.publica !== undefined ? campos.publica : atual.publica) ? 1 : 0,
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
  listar(db: BancoDados, obraId: number): VersaoDelta[] {
    return (
      db.prepare('SELECT * FROM prompts WHERE obra_id = ? ORDER BY criado_em DESC').all(obraId) as any[]
    ).map(paraPrompt);
  },

  obter(db: BancoDados, id: number): VersaoDelta | undefined {
    const l = db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
    return l ? paraPrompt(l) : undefined;
  },

  ativo(db: BancoDados, obraId: number): VersaoDelta | undefined {
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
      preferencias?: PreferenciasEstilo;
    },
  ): VersaoDelta {
    return db.transaction(() => {
      if (dados.ativar) {
        db.prepare('UPDATE prompts SET ativo = 0 WHERE obra_id = ?').run(obraId);
      }
      const info = db
        .prepare(
          'INSERT INTO prompts (obra_id, versao, conteudo, notas_versao, ativo, tipo, nucleo_id, preferencias) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          obraId,
          dados.versao,
          dados.conteudo,
          dados.notas_versao ?? null,
          dados.ativar ? 1 : 0,
          dados.tipo ?? 'completo',
          dados.nucleo_id ?? null,
          // NULL quando nada foi escolhido: a leitura resolve para os padrões, e o
          // banco continua dizendo a verdade sobre o que o usuário decidiu.
          dados.preferencias ? JSON.stringify(dados.preferencias) : null,
        );
      return this.obter(db, Number(info.lastInsertRowid))!;
    })();
  },

  ativar(db: BancoDados, id: number): VersaoDelta | undefined {
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
  adotarPadrao(db: BancoDados, obraId: number): VersaoDelta | undefined {
    return db.transaction(() => {
      if (this.listar(db, obraId).length > 0) return undefined;
      const nucleo = reposPromptPadrao.ativo(db, idiomaDaObra(db, obraId));
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
  ativoOuAdotado(db: BancoDados, obraId: number): VersaoDelta | undefined {
    return this.ativo(db, obraId) ?? this.adotarPadrao(db, obraId);
  },

  /** Prompt mãe efetivo da obra: 'completo' legado vai como está; 'delta' é
      composto com o núcleo ATIVO no momento (melhorias do núcleo fluem para
      todas as obras; a proveniência exata fica registrada no capítulo).
      `nucleoId` força uma versão específica do núcleo — usado pelo portão A/B do
      comparador, nunca pelo pipeline. */
  composto(db: BancoDados, obraId: number, nucleoId?: number): PromptComposto | undefined {
    const prompt = this.ativoOuAdotado(db, obraId);
    if (!prompt) return undefined;
    if (prompt.tipo !== 'delta') return { texto: prompt.conteudo, prompt, nucleo: null };
    const nucleo =
      nucleoId != null ? reposPromptPadrao.obter(db, nucleoId) : reposPromptPadrao.ativo(db, idiomaDaObra(db, obraId));
    // Sem núcleo ativo (estado excepcional), o delta sozinho é o que há.
    if (!nucleo) return { texto: comporOmega('', prompt.conteudo, prompt.preferencias), prompt, nucleo: null };
    return {
      texto: comporOmega(nucleo.conteudo, prompt.conteudo, prompt.preferencias),
      prompt,
      nucleo,
    };
  },
};

// ── Prompt padrão global (mesmas regras de versões imutáveis) ──────────────

// Desde a migração 029 o núcleo ativo é um POR IDIOMA DE ORIGEM, não um no banco
// inteiro: o Alfa mandarim e o Alfa inglês governam ao mesmo tempo, cada um as
// obras do seu perfil. Por isso `ativo` e `ativar` passaram a exigir o idioma —
// a assinatura mudou de propósito, para o compilador apontar cada chamador em
// vez de a mudança passar em silêncio num `WHERE ativo = 1` que agora casa duas
// linhas.
export const reposPromptPadrao = {
  /** `idioma` ausente = todos os núcleos, de todos os perfis. */
  listar(db: BancoDados, idioma?: IdiomaOrigem): PromptPadrao[] {
    const linhas = idioma
      ? db.prepare('SELECT * FROM prompt_padrao WHERE idioma_origem = ? ORDER BY criado_em DESC').all(idioma)
      : db.prepare('SELECT * FROM prompt_padrao ORDER BY criado_em DESC').all();
    return (linhas as any[]).map((l) => paraPrompt<PromptPadrao>(l));
  },

  obter(db: BancoDados, id: number): PromptPadrao | undefined {
    const l = db.prepare('SELECT * FROM prompt_padrao WHERE id = ?').get(id);
    return l ? paraPrompt<PromptPadrao>(l) : undefined;
  },

  ativo(db: BancoDados, idioma: IdiomaOrigem = IDIOMA_ORIGEM_PADRAO): PromptPadrao | undefined {
    const l = db.prepare('SELECT * FROM prompt_padrao WHERE ativo = 1 AND idioma_origem = ?').get(idioma);
    return l ? paraPrompt<PromptPadrao>(l) : undefined;
  },

  criar(
    db: BancoDados,
    dados: {
      versao: string;
      conteudo: string;
      notas_versao?: string;
      ativar: boolean;
      idioma_origem?: IdiomaOrigem;
    },
  ): PromptPadrao {
    const idioma = dados.idioma_origem ?? IDIOMA_ORIGEM_PADRAO;
    return db.transaction(() => {
      // Desativa só dentro do mesmo perfil: criar um Alfa inglês não pode
      // derrubar o mandarim que está traduzindo a obra ao lado.
      if (dados.ativar) db.prepare('UPDATE prompt_padrao SET ativo = 0 WHERE idioma_origem = ?').run(idioma);
      const info = db
        .prepare(
          'INSERT INTO prompt_padrao (versao, conteudo, notas_versao, ativo, idioma_origem) VALUES (?, ?, ?, ?, ?)',
        )
        .run(dados.versao, dados.conteudo, dados.notas_versao ?? null, dados.ativar ? 1 : 0, idioma);
      return this.obter(db, Number(info.lastInsertRowid))!;
    })();
  },

  ativar(db: BancoDados, id: number): PromptPadrao | undefined {
    const alvo = this.obter(db, id);
    if (!alvo) return undefined;
    // O idioma sai do próprio núcleo, não de quem chamou: ativar é sempre
    // dentro do perfil a que aquela versão pertence.
    const idioma = alvo.idioma_origem ?? IDIOMA_ORIGEM_PADRAO;
    db.transaction(() => {
      db.prepare('UPDATE prompt_padrao SET ativo = 0 WHERE idioma_origem = ?').run(idioma);
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

/**
 * Recalcula `capitulos.consistencia_violacoes` de todos os capítulos da obra.
 *
 * Sem isto, o número exibido responde a uma pergunta feita ANTES de o glossário
 * mudar: cadastra-se um termo e os capítulos seguem mostrando o "0 violações"
 * calculado quando o termo não existia. Zero calculado cedo demais é pior que
 * nenhum número, porque parece resposta.
 *
 * Custa 10–38 ms na obra inteira (medido: 561 frases, glossário de 57 a 1500
 * termos), então recalcular vale mais que inventar um estado "precisa reconferir".
 * Respeita as dispensas do revisor.
 *
 * Mora aqui (e não em `traducao/consistencia.ts`, ao lado de `varrerConsistencia`)
 * porque a proteção que importa não é "existe ciclo?" — é que `varrerConsistencia`
 * precisa continuar testável sem carregar `better-sqlite3` (binário nativo).
 * `consistencia.ts` importar `repos.js` não fechava ciclo nenhum (verificado por
 * varredura estática do grafo), mas arrastava o binário do banco para dentro de um
 * módulo que hoje não depende dele — quem quisesse testar `varrerConsistencia`
 * isolada passaria a precisar do SQLite mesmo assim. Aqui, `repos.ts` (que já
 * depende do banco) importa a função pura de `traducao/`, não o contrário — é
 * o módulo que CONHECE o banco chamando o módulo que não conhece, a única
 * direção que não obriga ninguém a carregar o binário à toa.
 */
export function recalcularConsistenciaDaObra(db: BancoDados, obraId: number): void {
  const frases = reposFrases.listarPorObra(db, obraId);
  // Termo `ambiguo` (小心: "cuidado" em 7 de 8 ocorrências da obra 1) sai da
  // varredura direta — ela erraria a maioria das vezes (doc da Task 7).
  const { checaveis } = separarPorChecagem(reposGlossario.listar(db, obraId));
  const ignoradas = reposConsistencia.ignoradasDaObra(db, obraId);
  // `push` no array já guardado no Map — o spread `[...(porCapitulo.get(id) ?? []), f]`
  // copiava o acumulado inteiro a cada frase (O(k²) na obra).
  const porCapitulo = new Map<number, typeof frases>();
  for (const f of frases) {
    const doCapitulo = porCapitulo.get(f.capitulo_id);
    if (doCapitulo) doCapitulo.push(f);
    else porCapitulo.set(f.capitulo_id, [f]);
  }
  db.transaction(() => {
    for (const [capituloId, doCapitulo] of porCapitulo) {
      // Capítulo 100% pendente não tem nenhuma frase para a varredura conferir —
      // gravar 0 diria "varrido e limpo" sobre um capítulo nunca varrido, que é
      // exatamente o estado que NULL existe para distinguir (docs/11 e a tela de
      // Telemetria mostram "—" só para NULL; um 0 forjado apagaria essa distinção,
      // o próprio argumento do spec, "zero calculado cedo demais parece resposta",
      // no sentido inverso).
      if (!doCapitulo.some((f) => f.status_traducao === 'traduzida')) continue;
      const r = varrerConsistencia(doCapitulo, checaveis, ignoradas);
      reposCapitulos.definirConsistencia(db, capituloId, r.violacoes.length);
    }
  })();
}

// ── Frases ─────────────────────────────────────────────────────────────────

/** Forma que `paraMineracao` devolve (subconjunto de `Frase` + `capitulo_numero`,
    que não existe no domínio `Frase`) — nomeada para tipar o SELECT e o mapa de
    booleano sem recorrer a `as never`, que anulava a checagem da query inteira. */
type LinhaMineracao = {
  id: number;
  ordem: number;
  capitulo_numero: number;
  texto_zh: string;
  texto_pt_original_ia: string | null;
  texto_pt: string;
  origem_edicao: string | null;
  edicao_tratada_texto: string | null;
};

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

  /** Todas as frases da obra com o número do capítulo junto. `varrerConsistencia`
      é pura e não sabe o que é capítulo — o de-para fica aqui, como já acontece
      na rota por capítulo. */
  listarPorObra(db: BancoDados, obraId: number): (Frase & { capitulo_numero: number })[] {
    return db
      .prepare(
        `SELECT f.*, c.numero capitulo_numero
         FROM frases f JOIN capitulos c ON c.id = f.capitulo_id
         WHERE c.obra_id = ? ORDER BY c.numero, f.ordem`,
      )
      .all(obraId)
      .map((l) => paraFrase(l as never)) as (Frase & { capitulo_numero: number })[];
  },

  /** Frases da obra com o que a mineração de edições manuais precisa, já com o
      número do capítulo — a classificação é pura e não consulta o banco. */
  paraMineracao(db: BancoDados, obraId: number): (LinhaMineracao & { editado_manualmente: boolean })[] {
    const linhas = db
      .prepare(
        `SELECT f.id, f.ordem, c.numero capitulo_numero, f.texto_zh,
                f.texto_pt_original_ia, f.texto_pt, f.editado_manualmente, f.origem_edicao,
                f.edicao_tratada_texto
         FROM frases f JOIN capitulos c ON c.id = f.capitulo_id
         WHERE c.obra_id = ? ORDER BY c.numero, f.ordem`,
      )
      .all(obraId) as (LinhaMineracao & { editado_manualmente: number })[];
    // Mesmo padrão de `paraFrase` (linha ~60): SQLite guarda booleano como 0/1;
    // o domínio usa `boolean`.
    return linhas.map((l) => ({ ...l, editado_manualmente: !!l.editado_manualmente }));
  },

  /** Marca as edições destas frases como já tratadas, gravando o texto CORRENTE.
   *
   *  Grava o texto e não um sinalizador porque a marca vale para aquele texto:
   *  reescrever a frase depois é lição nova, e ela precisa voltar a ser candidata
   *  (mesmo princípio da dispensa por trinca em `estilo_ignorado`).
   *
   *  Devolve quantas frases foram marcadas — a tela precisa do número para dizer
   *  o que aconteceu, e um zero silencioso esconderia ids que não existem. */
  marcarEdicoesTratadas(db: BancoDados, ids: number[]): number {
    if (ids.length === 0) return 0;
    const marcar = db.prepare('UPDATE frases SET edicao_tratada_texto = texto_pt WHERE id = ?');
    // Transação: marcar metade seria pior que não marcar nada — o revisor veria
    // a lista encolher pela metade e não saberia se o resto foi consumido.
    const emLote = db.transaction((lista: number[]) => lista.reduce((n, id) => n + marcar.run(id).changes, 0));
    return emLote(ids);
  },

  editarTexto(db: BancoDados, id: number, textoPt: string, origem: string | null = null): Frase | undefined {
    // `origem` NULA é edição digitada pelo revisor — é o que a mineração de edições
    // manuais lê. Quem aplica por botão (revisão, passe de estilo, QA) passa a sua
    // origem, para a mesma lição não ser contada duas vezes.
    db.prepare('UPDATE frases SET texto_pt = ?, editado_manualmente = 1, origem_edicao = ? WHERE id = ?').run(
      textoPt,
      origem,
      id,
    );
    return this.obter(db, id);
  },

  /** Correção rápida (usada pelo EditorCapitulo): troca o termo nas traduções do
      escopo, marcando as frases como editadas manualmente. A3: troca por PALAVRA
      (fronteira Unicode, como substituirTermoGlossario) — nunca dentro de outra
      palavra ("Rio" em "Riordan"). Com `previa`, só conta as frases REALMENTE
      afetadas por essa regra, batendo com o que a aplicação de fato muda (a
      prévia antiga contava frases por substring e subestimava/superestimava).
      Grava `origem_edicao = 'substituicao'` (achado da revisão da Task 6): sem
      isso, uma troca em lote de dezenas de frases parecia dezenas de edições
      DIGITADAS pelo revisor para `classificarEdicoes`, ensinando a mesma lição
      dezenas de vezes e inundando o relatório de refinamento. */
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
      const upd = db.prepare(
        "UPDATE frases SET texto_pt = ?, editado_manualmente = 1, origem_edicao = 'substituicao' WHERE id = ?",
      );
      db.transaction(() => {
        for (const a of afetadas) upd.run(a.texto, a.id);
      })();
    }
    return { frases: afetadas.length, capitulos };
  },

  /** Troca a tradução de um termo do glossário nas frases JÁ traduzidas, com duas
      travas contra troca errada: (1) só nas frases cujo texto-fonte contém o termo
      chinês; (2) só ocorrências isoladas por palavra (fronteira Unicode), nunca
      dentro de outra palavra. `previa` só conta. Marca as frases como editadas, com
      `origem_edicao = 'substituicao'` pelo mesmo motivo de `substituirTermo`. */
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
      const upd = db.prepare(
        "UPDATE frases SET texto_pt = ?, editado_manualmente = 1, origem_edicao = 'substituicao' WHERE id = ?",
      );
      db.transaction(() => {
        for (const a of afetadas) upd.run(a.texto, a.id);
      })();
    }
    return { frases: afetadas.length, capitulos };
  },

  reverterParaIa(db: BancoDados, id: number): Frase | undefined {
    // Zera origem_edicao junto (achado da revisão final): sem isso, uma frase que
    // tinha vindo de um botão (revisao/qa/passe-estilo/substituicao) e foi revertida
    // para o texto da IA ficava sem edição nenhuma, mas ainda carregando a origem
    // antiga — um estado que não corresponde a nada real.
    db.prepare(
      `UPDATE frases SET texto_pt = COALESCE(texto_pt_original_ia, ''), editado_manualmente = 0, origem_edicao = NULL
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
      // Achado da revisão final: `aplicarTraducaoIa` preserva `texto_pt_original_ia`
      // por COALESCE (é a 1ª passada da IA, nunca sobrescrita). Quando a frase tinha
      // sido editada À MÃO (origem_edicao NULL) e esta retradução vai substituir
      // esse texto por uma 2ª passada da IA, o par que sobra para a mineração é
      // IA-1ª-passada -> IA-2ª-passada — sinonímia arbitrária entre duas traduções
      // da própria IA, não uma correção do revisor. Marcar a origem aqui impede
      // `classificarEdicoes` de ler isso como "o revisor digitou".
      //
      // Zerar `editado_manualmente` em vez disso foi CONSIDERADO e descartado: a
      // métrica "edição humana %" do checkpoint (doc 09 §4) soma
      // `frases.editado_manualmente` sobre os capítulos da janela — apagar o fato
      // de que a frase já recebeu edição humana em algum momento reescreveria
      // histórico que outra parte do app lê. `origem_edicao` resolve a mineração
      // sem tocar nisso. Só toca frase que ainda estava com origem NULL (edição
      // genuinamente digitada) — uma já aprovada por outro botão (revisão/QA/
      // substituição) mantém a origem mais informativa que já tinha, e já era
      // excluída da mineração de qualquer forma.
      db.prepare(
        `UPDATE frases SET origem_edicao = 'retraducao'
         WHERE capitulo_id = ? AND editado_manualmente = 1 AND origem_edicao IS NULL`,
      ).run(capituloId);
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
    const entradas = (
      db.prepare('SELECT * FROM glossario WHERE obra_id = ? ORDER BY termo_zh').all(obraId) as any[]
    ).map(paraGlossario);
    const porId = new Map(entradas.map((e) => [e.id, e]));
    const fatos = db.prepare('SELECT * FROM relacoes_termos WHERE obra_id=?').all(obraId) as Array<{
      origem_termo_id: number; destino_termo_id: number; tipo: string;
    }>;
    const relacoes = new Map<number, string[]>();
    const adicionar = (id: number, texto: string) => relacoes.set(id, [...(relacoes.get(id) ?? []), texto]);
    for (const fato of fatos) {
      const origem = porId.get(fato.origem_termo_id);
      const destino = porId.get(fato.destino_termo_id);
      const definicao = DEFINICOES_RELACOES_TERMO.find((d) => d.tipo === fato.tipo);
      if (!origem || !destino || !definicao) continue;
      adicionar(origem.id, `${definicao.rotulo_direto} ${destino.termo_pt}`);
      adicionar(destino.id, `${definicao.rotulo_inverso} ${origem.termo_pt}`);
    }
    return entradas.map((e) => ({ ...e, relacoes: relacoes.get(e.principal_id ?? e.id) ?? [] }));
  },

  obter(db: BancoDados, id: number): EntradaGlossario | undefined {
    const linha = db.prepare('SELECT * FROM glossario WHERE id = ?').get(id) as any;
    return linha ? paraGlossario(linha) : undefined;
  },

  /** Confere pertencimento antes de gravar. O FK sozinho aceita pai de outra
      obra e não enxerga ciclos, ambos capazes de falsear a árvore visual. */
  termoPaiValido(db: BancoDados, id: number, termoPaiId: number | null): boolean {
    if (termoPaiId === null) return true;
    const entrada = this.obter(db, id);
    const pai = this.obter(db, termoPaiId);
    if (!entrada || !pai || entrada.obra_id !== pai.obra_id || id === termoPaiId) return false;
    const visitados = new Set<number>();
    let atual: EntradaGlossario | undefined = pai;
    while (atual?.termo_pai_id != null) {
      if (atual.id === id || visitados.has(atual.id)) return false;
      visitados.add(atual.id);
      atual = this.obter(db, atual.termo_pai_id);
    }
    return atual?.id !== id;
  },

  criar(
    db: BancoDados,
    obraId: number,
    dados: {
      termo_zh: string;
      termo_pt: string;
      categoria?: string;
      nota?: string;
      origem?: string;
      // Espécie/nota_uso/ambiguo/termo_pai_id (migração 026): opcionais aqui —
      // `especie` nasce NULL quando ausente, e é assim que o termo fica "nunca
      // classificado" em vez de herdar um palpite.
      especie?: EspecieTermo;
      nota_uso?: string;
      ambiguo?: boolean;
      termo_pai_id?: number | null;
    },
  ): EntradaGlossario | 'duplicado' {
    try {
      const info = db
        .prepare(
          `INSERT INTO glossario (obra_id, termo_zh, termo_pt, categoria, nota, origem, especie, nota_uso, ambiguo, termo_pai_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          obraId,
          dados.termo_zh,
          dados.termo_pt,
          dados.categoria ?? 'lexico-geral',
          dados.nota ?? null,
          dados.origem ?? 'manual',
          dados.especie ?? null,
          dados.nota_uso ?? null,
          dados.ambiguo ? 1 : 0,
          dados.termo_pai_id ?? null,
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
    campos: Partial<
      Pick<
        EntradaGlossario,
        'termo_zh' | 'termo_pt' | 'categoria' | 'nota' | 'especie' | 'nota_uso' | 'ambiguo' | 'termo_pai_id'
      >
    >,
  ): EntradaGlossario | undefined {
    const atual = this.obter(db, id);
    if (!atual) return undefined;
    db.prepare(
      `UPDATE glossario SET termo_zh = ?, termo_pt = ?, categoria = ?, nota = ?,
       especie = ?, nota_uso = ?, ambiguo = ?, termo_pai_id = ? WHERE id = ?`,
    ).run(
      campos.termo_zh ?? atual.termo_zh,
      campos.termo_pt ?? atual.termo_pt,
      campos.categoria ?? atual.categoria,
      campos.nota !== undefined ? campos.nota : atual.nota,
      campos.especie !== undefined ? campos.especie : atual.especie,
      campos.nota_uso !== undefined ? campos.nota_uso : atual.nota_uso,
      (campos.ambiguo !== undefined ? campos.ambiguo : atual.ambiguo) ? 1 : 0,
      campos.termo_pai_id !== undefined ? campos.termo_pai_id : atual.termo_pai_id,
      id,
    );
    return this.obter(db, id);
  },

  excluir(db: BancoDados, id: number): boolean {
    // Solta as variantes antes de apagar (redundante com ON DELETE SET NULL, mas
    // vale mesmo se a checagem de FK estiver desligada em algum caminho).
    db.prepare('UPDATE glossario SET principal_id = NULL WHERE principal_id = ?').run(id);
    // E solta os filhos. Aqui NÃO é redundante: `termo_pai_id` foi criado sem
    // `ON DELETE`, então com foreign_keys ligado o SQLite RECUSA o DELETE
    // enquanto houver filho — o erro subia cru e virava 500 sem explicação ao
    // apagar um termo que por acaso é pai. Soltar é o mesmo tratamento das
    // variantes: o filho continua existindo, só perde o vínculo.
    db.prepare('UPDATE glossario SET termo_pai_id = NULL WHERE termo_pai_id = ?').run(id);

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
        categoria:
          ajustes?.categoria ??
          (ehCategoriaGlossarioPadrao(sugestao.categoria) ? sugestao.categoria : 'lexico-geral'),
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
    // 'escolha-legitima' nasce confirmado, como 'correto': não há o que fazer.
    const status: StatusCasoTeste = dados.veredito === 'incorreto' ? 'pendente' : 'confirmado';
    // Converge o rótulo: se a obra já usa uma grafia equivalente ("5-mais-que-
    // perfeito" quando o modelo devolveu "5.mais-que-perfeito"), grava a que já
    // existe. Assim o filtro por seção no Banco de Testes acha os casos todos,
    // em vez de espalhá-los por quatro rótulos que dizem a mesma coisa.
    const secao_regra = dados.secao_regra ? rotuloConvergido(db, dados.obra_id, dados.secao_regra) : dados.secao_regra;
    const info = db
      .prepare(
        `INSERT INTO banco_testes
          (frase_id, obra_id, caso_pai_id, trecho_zh, pergunta, veredito, resposta, justificativa, secao_regra,
           correcao_proposta, trecho_pt_errado, trecho_pt_corrigido, status, motivo_rejeicao, provedor, modelo, resposta_bruta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dados.frase_id,
        dados.obra_id,
        dados.caso_pai_id ?? null,
        dados.trecho_zh,
        dados.pergunta,
        dados.veredito,
        dados.resposta,
        dados.justificativa,
        secao_regra,
        dados.correcao_proposta,
        dados.trecho_pt_errado ?? null,
        dados.trecho_pt_corrigido ?? null,
        status,
        dados.motivo_rejeicao ?? null,
        dados.provedor,
        dados.modelo,
        dados.resposta_bruta,
      );
    return this.obter(db, Number(info.lastInsertRowid))!;
  },

  atualizarStatus(db: BancoDados, id: number, status: StatusCasoTeste, motivo: string | null = null): CasoTeste | undefined {
    // O motivo só faz sentido na recusa; em qualquer outro status ele é limpo,
    // senão um caso reaberto carrega a justificativa de uma recusa desfeita.
    db.prepare('UPDATE banco_testes SET status = ?, motivo_rejeicao = ? WHERE id = ?').run(
      status,
      status === 'rejeitado' ? motivo : null,
      id,
    );
    return this.obter(db, id);
  },

  /** Aceita a correção proposta: atualiza a frase e marca o caso como corrigido. */
  aplicarCorrecao(db: BancoDados, id: number): { caso: CasoTeste; frase: Frase } | 'sem-correcao' | undefined {
    const caso = this.obter(db, id);
    if (!caso) return undefined;
    const frase = reposFrases.obter(db, caso.frase_id);
    if (!frase) return undefined;
    // Troca só o trecho apontado quando ele ancora no texto atual; a frase
    // inteira é o caminho de reserva, não o normal (ver `aplicarCorrecao`).
    const resultado = aplicarCorrecao(frase.texto_pt ?? '', caso);
    if (resultado.tipo === 'impossivel') return 'sem-correcao';
    return db.transaction(() => {
      // M3: aceitar a correção do Protocolo de Revisão é uma decisão humana —
      // marca editado_manualmente para que "sobrescrever preservando editadas"
      // não reabra a frase e a IA não apague a correção; e conta certo na
      // métrica de edição do checkpoint (doc 09 §4).
      // origem_edicao = 'revisao': aceitar pelo botão é decisão registrada em outro
      // canal (banco_testes) — não pode entrar na mineração de edições manuais como
      // se o revisor tivesse digitado, senão a mesma lição é contada duas vezes.
      db.prepare(
        "UPDATE frases SET texto_pt = ?, editado_manualmente = 1, origem_edicao = 'revisao' WHERE id = ?",
      ).run(resultado.texto, caso.frase_id);
      db.prepare("UPDATE banco_testes SET status = 'corrigido' WHERE id = ?").run(id);
      return { caso: this.obter(db, id)!, frase: reposFrases.obter(db, caso.frase_id)! };
    })();
  },

  /**
   * Erros recorrentes agrupados por regra — alimenta o refinamento do prompt.
   *
   * Conta `corrigido` junto com `pendente` e `regra-nova-necessaria`. Corrigido é
   * a evidência MAIS forte que existe: o revisor apontou o erro e o humano
   * concordou a ponto de aplicar. Pendente é o oposto — pode ser falso positivo
   * que ninguém julgou ainda. Excluir corrigido deixava a função cega justamente
   * para os erros confirmados, e como o fluxo normal é corrigir direto do editor,
   * na prática quase nada sobrava para contar. Só `confirmado` fica de fora, e
   * esse é o único em que a IA disse que estava tudo certo.
   *
   * O agrupamento normaliza o rótulo (ver `normalizarSecaoRegra`): o modelo devolve
   * "5-mais-que-perfeito", "5.mais-que-perfeito" e "mais-que-perfeito" para a mesma
   * regra, e agrupar pelo texto cru fragmentava 7 ocorrências em 4 grupos que nunca
   * batiam no limiar de 2.
   */
  recorrencias(db: BancoDados, obraId: number): { secao_regra: string; casos: number }[] {
    const linhas = db
      .prepare(
        `SELECT secao_regra FROM banco_testes t
         WHERE obra_id = ? AND status IN ('pendente','regra-nova-necessaria','corrigido')
           AND secao_regra IS NOT NULL
           -- Só a FOLHA de cada fio: uma discussão de quatro réplicas sobre a mesma
           -- regra é uma lacuna, não quatro.
           AND NOT EXISTS (SELECT 1 FROM banco_testes f WHERE f.caso_pai_id = t.id)`,
      )
      .all(obraId) as { secao_regra: string }[];

    // Agrupa pelo rótulo normalizado, mas devolve o rótulo ORIGINAL mais comum:
    // é o que o usuário vê na tela e o que a busca por secao_regra encontra.
    const grupos = new Map<string, { casos: number; rotulos: Map<string, number> }>();
    for (const { secao_regra } of linhas) {
      const chave = normalizarSecaoRegra(secao_regra);
      if (!chave) continue;
      const g = grupos.get(chave) ?? { casos: 0, rotulos: new Map() };
      g.casos += 1;
      g.rotulos.set(secao_regra, (g.rotulos.get(secao_regra) ?? 0) + 1);
      grupos.set(chave, g);
    }

    return [...grupos.values()]
      .filter((g) => g.casos >= 2)
      .map((g) => ({
        secao_regra: [...g.rotulos.entries()].sort((a, b) => b[1] - a[1])[0][0],
        casos: g.casos,
      }))
      .sort((a, b) => b.casos - a.casos);
  },

  /** Rótulo equivalente já em uso na obra, se houver; senão o próprio. */
  rotuloConvergidoDe(db: BancoDados, obraId: number, rotulo: string): string {
    return rotuloConvergido(db, obraId, rotulo);
  },

  /** Rótulos já usados na obra, com a camada dona de cada um.
      A SELEÇÃO continua por frequência — numa obra com 200 rótulos, cortar
      alfabeticamente descartaria tudo depois do "m". O que muda é a APRESENTAÇÃO:
      a lista sai ordenada alfabeticamente, para o modelo não ver o ranking e
      realimentar o rótulo mais usado. */
  rotulosDeRegra(db: BancoDados, obraId: number): { rotulo: string; camada: Camada | null }[] {
    const linhas = db
      .prepare(
        `SELECT secao_regra, COUNT(*) n FROM banco_testes
         WHERE obra_id = ? AND secao_regra IS NOT NULL AND status <> 'rejeitado'
         GROUP BY secao_regra ORDER BY n DESC LIMIT 30`,
      )
      .all(obraId) as { secao_regra: string }[];
    return linhas
      .map((l) => ({ rotulo: l.secao_regra, camada: camadaDoRotulo(l.secao_regra)?.camada ?? null }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  },

  /** A cadeia de réplicas da raiz até o caso dado, inclusive. Recursiva por
      caso_pai_id — sem ela a segunda pergunta sobre a mesma frase não sabe o que
      a primeira respondeu, e o modelo já devolveu vereditos opostos por isso. */
  fio(db: BancoDados, casoId: number): CasoTeste[] {
    return db
      .prepare(
        `WITH RECURSIVE cadeia(id) AS (
           SELECT ?
           UNION ALL
           SELECT t.caso_pai_id FROM banco_testes t JOIN cadeia c ON t.id = c.id
           WHERE t.caso_pai_id IS NOT NULL
         )
         SELECT b.* FROM banco_testes b JOIN cadeia ON b.id = cadeia.id
         ORDER BY b.criado_em, b.id`,
      )
      .all(casoId) as CasoTeste[];
  },

  temFilho(db: BancoDados, casoId: number): boolean {
    const l = db.prepare('SELECT 1 n FROM banco_testes WHERE caso_pai_id = ? LIMIT 1').get(casoId);
    return l !== undefined;
  },
};

/** Rótulo de regra equivalente já usado na obra (o mais frequente), ou o próprio
 *  quando é inédito. Mantém a grafia que a obra já consagrou em vez de deixar o
 *  modelo criar uma variação por chamada. */
function rotuloConvergido(db: BancoDados, obraId: number, rotulo: string): string {
  const alvo = normalizarSecaoRegra(rotulo);
  if (!alvo) return rotulo;
  const usados = db
    .prepare(
      `SELECT secao_regra, COUNT(*) n FROM banco_testes
       WHERE obra_id = ? AND secao_regra IS NOT NULL GROUP BY secao_regra ORDER BY n DESC`,
    )
    .all(obraId) as { secao_regra: string }[];
  return usados.find((u) => normalizarSecaoRegra(u.secao_regra) === alvo)?.secao_regra ?? rotulo;
}

// ── Estilo dispensado (trinca frase+regra+trecho já conferida) ────────────

export const reposEstiloIgnorado = {
  /** Chaves `frase|regra|trecho` ignoradas no capítulo — para filtrar a varredura. */
  doCapitulo(db: BancoDados, capituloId: number): Set<string> {
    const linhas = db
      .prepare(
        `SELECT i.frase_id, i.regra, i.trecho FROM estilo_ignorado i
         JOIN frases f ON f.id = i.frase_id WHERE f.capitulo_id = ?`,
      )
      .all(capituloId) as { frase_id: number; regra: string; trecho: string }[];
    return new Set(linhas.map((l) => `${l.frase_id}|${l.regra}|${l.trecho}`));
  },

  dispensar(db: BancoDados, fraseId: number, regra: string, trecho: string): void {
    db.prepare(
      'INSERT INTO estilo_ignorado (frase_id, regra, trecho) VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
    ).run(fraseId, regra, trecho);
  },

  restaurar(db: BancoDados, fraseId: number, regra: string, trecho: string): void {
    db.prepare('DELETE FROM estilo_ignorado WHERE frase_id = ? AND regra = ? AND trecho = ?').run(
      fraseId,
      regra,
      trecho,
    );
  },
};

// ── Consistência dispensada (par frase+termo já conferido) ────────────────

export const reposConsistencia = {
  /** Chaves `frase|termo` dispensadas no capítulo — formato que a varredura consome. */
  ignoradasDoCapitulo(db: BancoDados, capituloId: number): Set<string> {
    const linhas = db
      .prepare(
        `SELECT i.frase_id, i.termo_zh FROM consistencia_ignorada i
         JOIN frases f ON f.id = i.frase_id WHERE f.capitulo_id = ?`,
      )
      .all(capituloId) as { frase_id: number; termo_zh: string }[];
    return new Set(linhas.map((l) => `${l.frase_id}|${l.termo_zh}`));
  },

  ignoradasDaObra(db: BancoDados, obraId: number): Set<string> {
    const linhas = db
      .prepare(
        `SELECT i.frase_id, i.termo_zh FROM consistencia_ignorada i
         JOIN frases f ON f.id = i.frase_id
         JOIN capitulos c ON c.id = f.capitulo_id WHERE c.obra_id = ?`,
      )
      .all(obraId) as { frase_id: number; termo_zh: string }[];
    return new Set(linhas.map((l) => `${l.frase_id}|${l.termo_zh}`));
  },

  dispensar(db: BancoDados, fraseId: number, termoZh: string): void {
    db.prepare(
      'INSERT INTO consistencia_ignorada (frase_id, termo_zh) VALUES (?, ?) ON CONFLICT DO NOTHING',
    ).run(fraseId, termoZh);
  },

  restaurar(db: BancoDados, fraseId: number, termoZh: string): void {
    db.prepare('DELETE FROM consistencia_ignorada WHERE frase_id = ? AND termo_zh = ?').run(fraseId, termoZh);
  },
};

// ── Repositórios extraídos ─────────────────────────────────────────────────

export { dataLocalHoje, reposConfig, reposLotes, reposUso };

export const reposQa = criarReposQa({
  definirQaEm: (db, capituloId) => reposCapitulos.definirQaEm(db, capituloId),
  obterFrase: (db, fraseId) => reposFrases.obter(db, fraseId),
});
