import { z } from 'zod';
import type { BancoDados } from './index.js';
import type { Obra } from '@dao-tale/shared';
import { reposObras } from './repos.js';

// Exportação/reimportação completa da obra (formato dao-tale-export v1, doc 03).
// O arquivo usa chaves naturais (versão do prompt, número do capítulo, ordem da
// frase) em vez de ids internos — a reimportação sempre cria ids novos.

export const VERSAO_SCHEMA = 1;

const exportSchema = z.object({
  formato: z.literal('dao-tale-export'),
  versao_schema: z.literal(VERSAO_SCHEMA),
  exportado_em: z.string(),
  obra: z.object({
    titulo: z.string().min(1),
    titulo_original: z.string().nullable(),
    provedor_padrao: z.string().nullable(),
    modelo_padrao: z.string().nullable(),
  }),
  prompts: z.array(
    z.object({
      versao: z.string(),
      conteudo: z.string(),
      notas_versao: z.string().nullable(),
      ativo: z.boolean(),
      criado_em: z.string(),
    }),
  ),
  capitulos: z.array(
    z.object({
      numero: z.number().int(),
      titulo: z.string().nullable(),
      status: z.enum(['rascunho', 'traduzindo', 'revisado', 'finalizado']),
      texto_origem: z.string(),
      provedor: z.string().nullable(),
      modelo: z.string().nullable(),
      prompt_versao: z.string().nullable(),
      criado_em: z.string(),
      frases: z.array(
        z.object({
          ordem: z.number().int(),
          paragrafo: z.number().int(),
          texto_zh: z.string(),
          texto_pt: z.string(),
          texto_pt_original_ia: z.string().nullable(),
          editado_manualmente: z.boolean(),
          status_traducao: z.enum(['pendente', 'traduzida', 'erro']),
        }),
      ),
    }),
  ),
  glossario: z.array(
    z.object({
      termo_zh: z.string(),
      termo_pt: z.string(),
      categoria: z.string(),
      nota: z.string().nullable(),
      origem: z.string(),
      criado_em: z.string(),
    }),
  ),
  termos_sugeridos: z.array(
    z.object({
      capitulo_numero: z.number().int(),
      termo_zh: z.string(),
      termo_pt: z.string(),
      categoria: z.string().nullable(),
      contexto: z.string().nullable(),
      status: z.enum(['pendente', 'aceito', 'rejeitado']),
      criado_em: z.string(),
    }),
  ),
  banco_testes: z.array(
    z.object({
      capitulo_numero: z.number().int(),
      frase_ordem: z.number().int(),
      trecho_zh: z.string(),
      pergunta: z.string(),
      veredito: z.enum(['correto', 'incorreto']),
      justificativa: z.string(),
      secao_regra: z.string().nullable(),
      correcao_proposta: z.string().nullable(),
      status: z.enum(['confirmado', 'corrigido', 'pendente', 'regra-nova-necessaria']),
      provedor: z.string(),
      modelo: z.string(),
      resposta_bruta: z.string(),
      criado_em: z.string(),
    }),
  ),
});

export type ExportObra = z.infer<typeof exportSchema>;

export function exportarObra(db: BancoDados, obraId: number): ExportObra | undefined {
  const obra = reposObras.obter(db, obraId);
  if (!obra) return undefined;

  const prompts = db.prepare('SELECT * FROM prompts WHERE obra_id = ? ORDER BY criado_em').all(obraId) as any[];
  const promptVersaoPorId = new Map(prompts.map((p) => [p.id, p.versao as string]));
  const capitulos = db.prepare('SELECT * FROM capitulos WHERE obra_id = ? ORDER BY numero').all(obraId) as any[];

  const casos = db.prepare('SELECT * FROM banco_testes WHERE obra_id = ? ORDER BY criado_em').all(obraId) as any[];
  const infoFrase = new Map<number, { capitulo_numero: number; frase_ordem: number }>();
  for (const cap of capitulos) {
    const frases = db.prepare('SELECT id, ordem FROM frases WHERE capitulo_id = ?').all(cap.id) as any[];
    for (const f of frases) infoFrase.set(f.id, { capitulo_numero: cap.numero, frase_ordem: f.ordem });
  }
  const numeroPorCapituloId = new Map(capitulos.map((c) => [c.id, c.numero as number]));

  return {
    formato: 'dao-tale-export',
    versao_schema: VERSAO_SCHEMA,
    exportado_em: new Date().toISOString(),
    obra: {
      titulo: obra.titulo,
      titulo_original: obra.titulo_original,
      provedor_padrao: obra.provedor_padrao,
      modelo_padrao: obra.modelo_padrao,
    },
    prompts: prompts.map((p) => ({
      versao: p.versao,
      conteudo: p.conteudo,
      notas_versao: p.notas_versao,
      ativo: !!p.ativo,
      criado_em: p.criado_em,
    })),
    capitulos: capitulos.map((cap) => ({
      numero: cap.numero,
      titulo: cap.titulo,
      status: cap.status,
      texto_origem: cap.texto_origem,
      provedor: cap.provedor,
      modelo: cap.modelo,
      prompt_versao: cap.prompt_id ? (promptVersaoPorId.get(cap.prompt_id) ?? null) : null,
      criado_em: cap.criado_em,
      frases: (db.prepare('SELECT * FROM frases WHERE capitulo_id = ? ORDER BY ordem').all(cap.id) as any[]).map(
        (f) => ({
          ordem: f.ordem,
          paragrafo: f.paragrafo,
          texto_zh: f.texto_zh,
          texto_pt: f.texto_pt,
          texto_pt_original_ia: f.texto_pt_original_ia,
          editado_manualmente: !!f.editado_manualmente,
          status_traducao: f.status_traducao,
        }),
      ),
    })),
    glossario: (db.prepare('SELECT * FROM glossario WHERE obra_id = ? ORDER BY termo_zh').all(obraId) as any[]).map(
      (g) => ({
        termo_zh: g.termo_zh,
        termo_pt: g.termo_pt,
        categoria: g.categoria,
        nota: g.nota,
        origem: g.origem,
        criado_em: g.criado_em,
      }),
    ),
    termos_sugeridos: (
      db.prepare('SELECT * FROM termos_sugeridos WHERE obra_id = ? ORDER BY criado_em').all(obraId) as any[]
    ).map((t) => ({
      capitulo_numero: numeroPorCapituloId.get(t.capitulo_id) ?? -1,
      termo_zh: t.termo_zh,
      termo_pt: t.termo_pt,
      categoria: t.categoria,
      contexto: t.contexto,
      status: t.status,
      criado_em: t.criado_em,
    })),
    banco_testes: casos.flatMap((c) => {
      const info = infoFrase.get(c.frase_id);
      if (!info) return [];
      return [
        {
          capitulo_numero: info.capitulo_numero,
          frase_ordem: info.frase_ordem,
          trecho_zh: c.trecho_zh,
          pergunta: c.pergunta,
          veredito: c.veredito,
          justificativa: c.justificativa,
          secao_regra: c.secao_regra,
          correcao_proposta: c.correcao_proposta,
          status: c.status,
          provedor: c.provedor,
          modelo: c.modelo,
          resposta_bruta: c.resposta_bruta,
          criado_em: c.criado_em,
        },
      ];
    }),
  };
}

export function importarObra(db: BancoDados, dadosBrutos: unknown): Obra | { erro: string } {
  const validacao = exportSchema.safeParse(dadosBrutos);
  if (!validacao.success) {
    return { erro: `Arquivo inválido ou de versão incompatível: ${validacao.error.issues[0]?.message ?? ''}` };
  }
  const dados = validacao.data;

  return db.transaction((): Obra => {
    const infoObra = db
      .prepare('INSERT INTO obras (titulo, titulo_original, provedor_padrao, modelo_padrao) VALUES (?, ?, ?, ?)')
      .run(dados.obra.titulo, dados.obra.titulo_original, dados.obra.provedor_padrao, dados.obra.modelo_padrao);
    const obraId = Number(infoObra.lastInsertRowid);

    const promptIdPorVersao = new Map<string, number>();
    for (const p of dados.prompts) {
      const info = db
        .prepare(
          'INSERT INTO prompts (obra_id, versao, conteudo, notas_versao, ativo, criado_em) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(obraId, p.versao, p.conteudo, p.notas_versao, p.ativo ? 1 : 0, p.criado_em);
      promptIdPorVersao.set(p.versao, Number(info.lastInsertRowid));
    }

    const capituloIdPorNumero = new Map<number, number>();
    const fraseIdPorChave = new Map<string, number>();
    for (const cap of dados.capitulos) {
      const info = db
        .prepare(
          `INSERT INTO capitulos (obra_id, numero, titulo, status, texto_origem, provedor, modelo, prompt_id, criado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          obraId,
          cap.numero,
          cap.titulo,
          cap.status,
          cap.texto_origem,
          cap.provedor,
          cap.modelo,
          cap.prompt_versao ? (promptIdPorVersao.get(cap.prompt_versao) ?? null) : null,
          cap.criado_em,
        );
      const capId = Number(info.lastInsertRowid);
      capituloIdPorNumero.set(cap.numero, capId);
      for (const f of cap.frases) {
        const infoFrase = db
          .prepare(
            `INSERT INTO frases (capitulo_id, ordem, paragrafo, texto_zh, texto_pt, texto_pt_original_ia, editado_manualmente, status_traducao)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            capId,
            f.ordem,
            f.paragrafo,
            f.texto_zh,
            f.texto_pt,
            f.texto_pt_original_ia,
            f.editado_manualmente ? 1 : 0,
            f.status_traducao,
          );
        fraseIdPorChave.set(`${cap.numero}:${f.ordem}`, Number(infoFrase.lastInsertRowid));
      }
    }

    for (const g of dados.glossario) {
      db.prepare(
        `INSERT INTO glossario (obra_id, termo_zh, termo_pt, categoria, nota, origem, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (obra_id, termo_zh) DO NOTHING`,
      ).run(obraId, g.termo_zh, g.termo_pt, g.categoria, g.nota, g.origem, g.criado_em);
    }

    for (const t of dados.termos_sugeridos) {
      const capId = capituloIdPorNumero.get(t.capitulo_numero);
      if (!capId) continue;
      db.prepare(
        `INSERT INTO termos_sugeridos (obra_id, capitulo_id, termo_zh, termo_pt, categoria, contexto, status, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(obraId, capId, t.termo_zh, t.termo_pt, t.categoria, t.contexto, t.status, t.criado_em);
    }

    for (const c of dados.banco_testes) {
      const fraseId = fraseIdPorChave.get(`${c.capitulo_numero}:${c.frase_ordem}`);
      if (!fraseId) continue;
      db.prepare(
        `INSERT INTO banco_testes (frase_id, obra_id, trecho_zh, pergunta, veredito, justificativa, secao_regra,
           correcao_proposta, status, provedor, modelo, resposta_bruta, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        fraseId,
        obraId,
        c.trecho_zh,
        c.pergunta,
        c.veredito,
        c.justificativa,
        c.secao_regra,
        c.correcao_proposta,
        c.status,
        c.provedor,
        c.modelo,
        c.resposta_bruta,
        c.criado_em,
      );
    }

    return reposObras.obter(db, obraId)!;
  })();
}
