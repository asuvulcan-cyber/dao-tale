import { Hono } from 'hono';
import { z } from 'zod';
import { PROVEDORES_IDS, type ProvedorId } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposObras, reposPrompts, reposPromptPadrao, reposConfig, reposGlossario, reposUso } from '../db/repos.js';
import { exportarObra, importarObra } from '../db/portabilidade.js';
import { obterProvedor } from '../ia/fabrica.js';
import { obterChave } from '../credenciais/index.js';
import type { FraseParaTraduzir } from '../ia/provedor.js';

const criarObraSchema = z.object({
  titulo: z.string().min(1),
  titulo_original: z.string().optional(),
  sinopse: z.string().optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
  prompt_inicial: z.object({ versao: z.string().min(1), conteudo: z.string().min(1) }).optional(),
  glossario_inicial: z
    .array(
      z.object({
        termo_zh: z.string().min(1),
        termo_pt: z.string().min(1),
        categoria: z.string().trim().min(1).max(30).optional(),
        nota: z.string().optional(),
      }),
    )
    .optional(),
});

const atualizarObraSchema = z.object({
  titulo: z.string().min(1).optional(),
  titulo_original: z.string().nullable().optional(),
  sinopse: z.string().nullable().optional(),
  tags: z.array(z.string().min(1)).max(20).optional(),
  provedor_padrao: z.enum(PROVEDORES_IDS).nullable().optional(),
  modelo_padrao: z.string().nullable().optional(),
});

const MIMES_CAPA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const CAPA_MAX_BYTES = 2 * 1024 * 1024;

/** Quebra a sinopse em parágrafos. Modelos pequenos (ex.: Flash Lite) só devolviam
    o 1º parágrafo quando a sinopse ia como um item único; enviada como parágrafos
    numerados (o mesmo formato confiável da tradução de capítulo), o modelo completa
    todos. Usa linhas em branco como fronteira; sem elas, cai para quebra por linha. */
export function dividirParagrafos(texto: string): string[] {
  const porBlocos = texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const base = porBlocos.length > 1 ? porBlocos : texto.split('\n');
  return base.map((p) => p.trim()).filter(Boolean);
}

const criarPromptSchema = z.object({
  versao: z.string().min(1),
  conteudo: z.string().min(1),
  notas_versao: z.string().optional(),
  ativar: z.boolean().default(true),
});

export function rotasObras(db: BancoDados): Hono {
  const app = new Hono();

  app.get('/obras', (c) => c.json(reposObras.listar(db)));

  app.post('/obras', async (c) => {
    const corpo = criarObraSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    return c.json(reposObras.criar(db, corpo.data), 201);
  });

  app.get('/obras/:id', (c) => {
    const obra = reposObras.obter(db, Number(c.req.param('id')));
    if (!obra) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json(obra);
  });

  app.put('/obras/:id', async (c) => {
    const corpo = atualizarObraSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const obra = reposObras.atualizar(db, Number(c.req.param('id')), corpo.data);
    if (!obra) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json(obra);
  });

  // ── Capa (imagem enviada como corpo binário; servida direto do banco) ────

  app.get('/obras/:id/capa', (c) => {
    const capa = reposObras.obterCapa(db, Number(c.req.param('id')));
    if (!capa) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra sem capa.' } }, 404);
    return c.body(new Uint8Array(capa.capa), 200, {
      'Content-Type': capa.mime,
      'Cache-Control': 'no-cache',
    });
  });

  app.put('/obras/:id/capa', async (c) => {
    const mime = c.req.header('content-type') ?? '';
    if (!MIMES_CAPA.has(mime)) {
      return c.json(
        { erro: { codigo: 'formato-invalido', mensagem: 'Envie uma imagem JPEG, PNG, WebP ou GIF.' } },
        415,
      );
    }
    const corpo = Buffer.from(await c.req.arrayBuffer());
    if (corpo.length === 0 || corpo.length > CAPA_MAX_BYTES) {
      return c.json({ erro: { codigo: 'tamanho-invalido', mensagem: 'A capa deve ter entre 1 byte e 2 MB.' } }, 413);
    }
    const ok = reposObras.definirCapa(db, Number(c.req.param('id')), corpo, mime);
    if (!ok) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json({ ok: true });
  });

  app.delete('/obras/:id/capa', (c) => {
    const ok = reposObras.definirCapa(db, Number(c.req.param('id')), null, null);
    if (!ok) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json({ ok: true });
  });

  app.delete('/obras/:id', (c) => {
    const id = Number(c.req.param('id'));
    if (c.req.query('simular') === '1') {
      return c.json(reposObras.simularExclusao(db, id));
    }
    const ok = reposObras.excluir(db, id);
    if (!ok) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json({ ok: true });
  });

  // ── Exportação / reimportação completa (formato dao-tale-export v1) ──────

  app.get('/obras/:id/exportar', (c) => {
    const id = Number(c.req.param('id'));
    const dados = exportarObra(db, id);
    if (!dados) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    const nomeArquivo = `dao-tale-obra-${id}.json`;
    return c.body(JSON.stringify(dados, null, 2), 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
    });
  });

  app.post('/obras/importar', async (c) => {
    const dados = await c.req.json().catch(() => null);
    if (!dados) return c.json({ erro: { codigo: 'payload-invalido', mensagem: 'Envie o JSON exportado.' } }, 400);
    const resultado = importarObra(db, dados);
    if ('erro' in resultado) {
      return c.json({ erro: { codigo: 'import-invalido', mensagem: resultado.erro } }, 400);
    }
    return c.json(resultado, 201);
  });

  // ── Prompt mãe ──────────────────────────────────────────────────────────

  app.get('/obras/:id/prompts', (c) => c.json(reposPrompts.listar(db, Number(c.req.param('id')))));

  app.post('/obras/:id/prompts', async (c) => {
    const corpo = criarPromptSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    try {
      return c.json(reposPrompts.criar(db, Number(c.req.param('id')), corpo.data), 201);
    } catch (e: any) {
      if (String(e.message).includes('UNIQUE')) {
        return c.json({ erro: { codigo: 'versao-duplicada', mensagem: 'Já existe uma versão com esse identificador nesta obra.' } }, 409);
      }
      throw e;
    }
  });

  app.post('/prompts/:id/ativar', (c) => {
    const prompt = reposPrompts.ativar(db, Number(c.req.param('id')));
    if (!prompt) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Versão não encontrada.' } }, 404);
    return c.json(prompt);
  });

  // Copia o prompt padrão ativo como v1.0 da obra (só quando ela não tem versões).
  app.post('/obras/:id/prompts/adotar-padrao', (c) => {
    const obraId = Number(c.req.param('id'));
    if (!reposObras.obter(db, obraId)) {
      return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    }
    const prompt = reposPrompts.adotarPadrao(db, obraId);
    if (!prompt) {
      return c.json(
        { erro: { codigo: 'adocao-invalida', mensagem: 'A obra já tem versões de prompt ou não há prompt padrão ativo.' } },
        409,
      );
    }
    return c.json(prompt, 201);
  });

  // ── Prompt padrão global ────────────────────────────────────────────────

  app.get('/prompt-padrao', (c) => c.json(reposPromptPadrao.listar(db)));

  app.post('/prompt-padrao', async (c) => {
    const corpo = criarPromptSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    try {
      return c.json(reposPromptPadrao.criar(db, corpo.data), 201);
    } catch (e: any) {
      if (String(e.message).includes('UNIQUE')) {
        return c.json({ erro: { codigo: 'versao-duplicada', mensagem: 'Já existe uma versão do prompt padrão com esse identificador.' } }, 409);
      }
      throw e;
    }
  });

  app.post('/prompt-padrao/:id/ativar', (c) => {
    const prompt = reposPromptPadrao.ativar(db, Number(c.req.param('id')));
    if (!prompt) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Versão não encontrada.' } }, 404);
    return c.json(prompt);
  });

  // ── Tradução de título/sinopse (cadastro e ficha da obra) ───────────────
  // Sem obra_id (cadastro) usa o prompt padrão; com obra_id usa o prompt da
  // obra (adotando o padrão se ela ainda não tiver um) e o glossário dela.

  const traduzirDetalhesSchema = z
    .object({
      obra_id: z.number().int().optional(),
      titulo_zh: z.string().trim().min(1).optional(),
      sinopse_zh: z.string().trim().min(1).optional(),
      provedor: z.enum(PROVEDORES_IDS).optional(),
      modelo: z.string().optional(),
    })
    .refine((d) => d.titulo_zh || d.sinopse_zh, { message: 'Envie titulo_zh e/ou sinopse_zh.' });

  app.post('/ia/traduzir-detalhes', async (c) => {
    const corpo = traduzirDetalhesSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);

    const obra = corpo.data.obra_id ? reposObras.obter(db, corpo.data.obra_id) : undefined;
    if (corpo.data.obra_id && !obra) {
      return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    }
    const prompt = obra ? reposPrompts.ativoOuAdotado(db, obra.id) : reposPromptPadrao.ativo(db);
    if (!prompt) {
      return c.json({ erro: { codigo: 'sem-prompt', mensagem: 'Não há prompt padrão ativo para orientar a tradução.' } }, 400);
    }

    const config = reposConfig.obterTodas(db);
    const provedorId: ProvedorId = corpo.data.provedor ?? obra?.provedor_padrao ?? config.provedor_padrao;
    const provedor = obterProvedor(provedorId);
    const modelo = corpo.data.modelo ?? obra?.modelo_padrao ?? (config.modelo_padrao || provedor.modeloPadrao);
    const chave = provedor.precisaChave ? await obterChave(provedorId) : null;
    if (provedor.precisaChave && !chave) {
      return c.json({ erro: { codigo: 'sem-chave', mensagem: `Nenhuma chave de API configurada para ${provedor.nome}.` } }, 400);
    }

    // Título e sinopse viajam como itens numerados no modo "detalhes": o rótulo
    // fica fora do texto-fonte. A sinopse é quebrada em parágrafos numerados (1..N)
    // porque modelos pequenos só devolvem o 1º parágrafo quando ela vai como item
    // único — numerada, cada parágrafo é completado como na tradução de capítulo.
    const frases: FraseParaTraduzir[] = [];
    if (corpo.data.titulo_zh) frases.push({ ordem: 0, texto_zh: corpo.data.titulo_zh, rotulo: 'título da obra' });
    const paragrafosSinopse = corpo.data.sinopse_zh ? dividirParagrafos(corpo.data.sinopse_zh) : [];
    paragrafosSinopse.forEach((p, i) => {
      frases.push({
        ordem: i + 1,
        texto_zh: p,
        rotulo: paragrafosSinopse.length > 1 ? `sinopse da obra — parágrafo ${i + 1} de ${paragrafosSinopse.length}` : 'sinopse da obra',
      });
    });

    try {
      reposUso.registrar(db, provedorId, modelo);
      const resposta = await provedor.traduzirBloco(chave, {
        modelo,
        promptMae: prompt.conteudo,
        modo: 'detalhes',
        glossario: obra ? reposGlossario.listar(db, obra.id) : [],
        glossarioNoUsuario: false,
        caudaAnterior: [],
        frases,
        proximas: [],
      });
      const porOrdem = new Map<number, string>();
      for (const t of resposta.traducoes) {
        const texto = t.texto_pt?.trim();
        if (texto) porOrdem.set(t.ordem, texto);
      }
      // Remonta a sinopse na ordem dos parágrafos enviados; ignora o que o modelo
      // não devolveu (melhor perder um parágrafo do que a sinopse inteira).
      const partesSinopse = paragrafosSinopse.map((_, i) => porOrdem.get(i + 1)).filter(Boolean);
      return c.json({
        titulo_pt: corpo.data.titulo_zh ? (porOrdem.get(0) ?? null) : null,
        sinopse_pt: partesSinopse.length > 0 ? partesSinopse.join('\n\n') : null,
      });
    } catch (e) {
      return c.json({ erro: { codigo: 'provedor', mensagem: (e as Error).message } }, 502);
    }
  });

  return app;
}
