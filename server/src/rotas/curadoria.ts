import { Hono } from 'hono';
import { z } from 'zod';
import type { BancoDados } from '../db/index.js';
import { reposGlossario, reposTermosSugeridos, reposTestes } from '../db/repos.js';

const categoriaSchema = z.enum(['local', 'poder-habilidade', 'entidade', 'titulo-cargo', 'personagem', 'outro']);

const criarEntradaSchema = z.object({
  termo_zh: z.string().min(1),
  termo_pt: z.string().min(1),
  categoria: categoriaSchema.optional(),
  nota: z.string().optional(),
});

const atualizarEntradaSchema = z.object({
  termo_zh: z.string().min(1).optional(),
  termo_pt: z.string().min(1).optional(),
  categoria: categoriaSchema.optional(),
  nota: z.string().nullable().optional(),
});

// Parser de linha CSV minimalista com suporte a aspas duplas.
function parsearLinhaCsv(linha: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let entreAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (entreAspas) {
      if (ch === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (ch === '"') {
        entreAspas = false;
      } else {
        atual += ch;
      }
    } else if (ch === '"') {
      entreAspas = true;
    } else if (ch === ',') {
      campos.push(atual);
      atual = '';
    } else {
      atual += ch;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

function campoCsv(valor: string | null): string {
  const v = valor ?? '';
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function rotasCuradoria(db: BancoDados): Hono {
  const app = new Hono();

  // ── Glossário ───────────────────────────────────────────────────────────

  app.get('/obras/:obraId/glossario', (c) => {
    let entradas = reposGlossario.listar(db, Number(c.req.param('obraId')));
    const categoria = c.req.query('categoria');
    const busca = c.req.query('busca');
    if (categoria) entradas = entradas.filter((e) => e.categoria === categoria);
    if (busca) {
      const b = busca.toLowerCase();
      entradas = entradas.filter(
        (e) => e.termo_zh.includes(busca) || e.termo_pt.toLowerCase().includes(b),
      );
    }
    return c.json(entradas);
  });

  app.post('/obras/:obraId/glossario', async (c) => {
    const corpo = criarEntradaSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const resultado = reposGlossario.criar(db, Number(c.req.param('obraId')), corpo.data);
    if (resultado === 'duplicado') {
      return c.json({ erro: { codigo: 'termo-duplicado', mensagem: 'Esse termo chinês já existe no glossário desta obra.' } }, 409);
    }
    return c.json(resultado, 201);
  });

  app.patch('/glossario/:id', async (c) => {
    const corpo = atualizarEntradaSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const entrada = reposGlossario.atualizar(db, Number(c.req.param('id')), corpo.data);
    if (!entrada) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Entrada não encontrada.' } }, 404);
    return c.json(entrada);
  });

  app.delete('/glossario/:id', (c) => {
    const ok = reposGlossario.excluir(db, Number(c.req.param('id')));
    if (!ok) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Entrada não encontrada.' } }, 404);
    return c.json({ ok: true });
  });

  app.post('/obras/:obraId/glossario/importar', async (c) => {
    const corpo = z.object({ csv: z.string().min(1) }).safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: 'Envie o conteúdo CSV.' } }, 400);
    const obraId = Number(c.req.param('obraId'));
    const linhas = corpo.data.csv.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    let inseridos = 0;
    let duplicados = 0;
    let invalidos = 0;
    for (const [i, linha] of linhas.entries()) {
      const [termo_zh, termo_pt, categoria, nota] = parsearLinhaCsv(linha);
      // Pula cabeçalho se a primeira linha não parecer um termo chinês.
      if (i === 0 && /termo|zh|chin/i.test(termo_zh ?? '')) continue;
      if (!termo_zh || !termo_pt) {
        invalidos++;
        continue;
      }
      const cat = categoriaSchema.safeParse(categoria);
      const resultado = reposGlossario.criar(db, obraId, {
        termo_zh,
        termo_pt,
        categoria: cat.success ? cat.data : 'outro',
        nota: nota || undefined,
      });
      if (resultado === 'duplicado') duplicados++;
      else inseridos++;
    }
    return c.json({ inseridos, duplicados, invalidos });
  });

  app.get('/obras/:obraId/glossario/exportar', (c) => {
    const entradas = reposGlossario.listar(db, Number(c.req.param('obraId')));
    const linhas = ['termo_zh,termo_pt,categoria,nota'];
    for (const e of entradas) {
      linhas.push([campoCsv(e.termo_zh), campoCsv(e.termo_pt), e.categoria, campoCsv(e.nota)].join(','));
    }
    // BOM: necessário para o Excel no Windows abrir chinês corretamente (doc 03).
    return c.body('﻿' + linhas.join('\n'), 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="glossario.csv"',
    });
  });

  // ── Termos sugeridos ────────────────────────────────────────────────────

  app.get('/obras/:obraId/termos-sugeridos', (c) =>
    c.json(reposTermosSugeridos.listar(db, Number(c.req.param('obraId')), c.req.query('status'))),
  );

  app.post('/termos-sugeridos/:id/aceitar', async (c) => {
    const corpo = z
      .object({ termo_pt: z.string().min(1).optional(), categoria: categoriaSchema.optional(), nota: z.string().optional() })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const resultado = reposTermosSugeridos.aceitar(db, Number(c.req.param('id')), corpo.data);
    if (resultado === undefined) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Sugestão não encontrada.' } }, 404);
    if (resultado === 'duplicado') {
      return c.json({ erro: { codigo: 'termo-duplicado', mensagem: 'Esse termo já entrou no glossário — sugestão marcada como aceita.' } }, 409);
    }
    return c.json(resultado);
  });

  app.post('/termos-sugeridos/:id/rejeitar', (c) => {
    const ok = reposTermosSugeridos.rejeitar(db, Number(c.req.param('id')));
    if (!ok) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Sugestão não encontrada.' } }, 404);
    return c.json({ ok: true });
  });

  // ── Banco de testes ─────────────────────────────────────────────────────

  app.get('/obras/:obraId/testes', (c) => {
    const pagina = Math.max(1, Number(c.req.query('pagina') ?? 1));
    const limite = Math.min(200, Math.max(1, Number(c.req.query('limite') ?? 50)));
    const filtros = {
      status: c.req.query('status'),
      veredito: c.req.query('veredito'),
      secao_regra: c.req.query('secao_regra'),
      capitulo_id: c.req.query('capitulo') ? Number(c.req.query('capitulo')) : undefined,
      de: c.req.query('de'),
      ate: c.req.query('ate'),
      limite,
      offset: (pagina - 1) * limite,
    };
    const { casos, total } = reposTestes.listar(db, Number(c.req.param('obraId')), filtros);
    return c.json({ casos, total, pagina, limite });
  });

  app.get('/obras/:obraId/testes/recorrencias', (c) =>
    c.json(reposTestes.recorrencias(db, Number(c.req.param('obraId')))),
  );

  app.patch('/testes/:id', async (c) => {
    const corpo = z
      .object({ status: z.enum(['confirmado', 'corrigido', 'pendente', 'regra-nova-necessaria']) })
      .safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const caso = reposTestes.atualizarStatus(db, Number(c.req.param('id')), corpo.data.status);
    if (!caso) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Caso não encontrado.' } }, 404);
    return c.json(caso);
  });

  app.post('/testes/:id/aplicar-correcao', (c) => {
    const resultado = reposTestes.aplicarCorrecao(db, Number(c.req.param('id')));
    if (resultado === undefined) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Caso não encontrado.' } }, 404);
    if (resultado === 'sem-correcao') {
      return c.json({ erro: { codigo: 'sem-correcao', mensagem: 'Este caso não tem correção proposta.' } }, 400);
    }
    return c.json(resultado);
  });

  app.get('/obras/:obraId/testes/exportar', (c) => {
    const { casos } = reposTestes.listar(db, Number(c.req.param('obraId')), { limite: 1_000_000 });
    const linhas = ['id,frase_id,trecho_zh,pergunta,veredito,justificativa,secao_regra,correcao_proposta,status,provedor,modelo,criado_em'];
    for (const t of casos) {
      linhas.push(
        [
          t.id,
          t.frase_id,
          campoCsv(t.trecho_zh),
          campoCsv(t.pergunta),
          t.veredito,
          campoCsv(t.justificativa),
          campoCsv(t.secao_regra),
          campoCsv(t.correcao_proposta),
          t.status,
          t.provedor,
          t.modelo,
          t.criado_em,
        ].join(','),
      );
    }
    return c.body('﻿' + linhas.join('\n'), 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="banco_testes.csv"',
    });
  });

  return app;
}
