import { Hono } from 'hono';
import { z } from 'zod';
import { PROVEDORES_IDS, type EstadoConfiguracoes, type ProvedorId } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposConfig, reposUso } from '../db/repos.js';
import { definirChave, modoGuarda, removerChave, temChave, obterChave } from '../credenciais/index.js';
import { listarProvedores, obterProvedor } from '../ia/fabrica.js';
import { diretorioDados } from '../config.js';

const configSchema = z.object({
  provedor_padrao: z.enum(PROVEDORES_IDS).optional(),
  modelo_padrao: z.string().optional(),
  tamanho_bloco: z.number().int().min(1).max(100).optional(),
  vizinhas_revisao: z.number().int().min(0).max(10).optional(),
  cauda_contexto: z.number().int().min(0).max(10).optional(),
  parar_no_limite: z.boolean().optional(),
  glossario_relevante: z.boolean().optional(),
  cotas_diarias: z.record(z.string(), z.number().int().min(0).max(1000000)).optional(),
});

export function rotasSistema(db: BancoDados): Hono {
  const app = new Hono();

  app.get('/saude', (c) =>
    c.json({ ok: true, versao: '0.1.0', caminho_dados: diretorioDados() }),
  );

  app.get('/configuracoes', async (c) => {
    const credenciais = await Promise.all(
      listarProvedores()
        .filter((p) => p.precisaChave)
        .map(async (p) => ({ provedor: p.id, configurada: await temChave(p.id) })),
    );
    const estado: EstadoConfiguracoes = {
      configuracoes: reposConfig.obterTodas(db),
      credenciais,
      modo_guarda_chaves: await modoGuarda(),
      caminho_dados: diretorioDados(),
    };
    return c.json(estado);
  });

  app.put('/configuracoes', async (c) => {
    const corpo = configSchema.safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    return c.json(reposConfig.definir(db, corpo.data));
  });

  // Requisições de hoje por provedor/modelo — alimenta o indicador de cota gratuita.
  app.get('/uso/hoje', (c) => c.json(reposUso.hoje(db)));

  app.get('/provedores', (c) =>
    c.json(
      listarProvedores().map((p) => ({
        id: p.id,
        nome: p.nome,
        precisa_chave: p.precisaChave,
        modelo_padrao: p.modeloPadrao,
      })),
    ),
  );

  app.get('/provedores/:id/modelos', async (c) => {
    const id = c.req.param('id') as ProvedorId;
    try {
      const provedor = obterProvedor(id);
      const chave = provedor.precisaChave ? await obterChave(id) : null;
      return c.json(await provedor.listarModelos(chave));
    } catch (e) {
      return c.json({ erro: { codigo: 'provedor', mensagem: (e as Error).message } }, 502);
    }
  });

  app.put('/credenciais/:provedor', async (c) => {
    const corpo = z.object({ chave: z.string().min(1) }).safeParse(await c.req.json());
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: 'Chave vazia.' } }, 400);
    await definirChave(c.req.param('provedor'), corpo.data.chave);
    return c.json({ ok: true });
  });

  app.delete('/credenciais/:provedor', async (c) => {
    await removerChave(c.req.param('provedor'));
    return c.json({ ok: true });
  });

  app.post('/credenciais/:provedor/testar', async (c) => {
    const id = c.req.param('provedor') as ProvedorId;
    try {
      const provedor = obterProvedor(id);
      const chave = provedor.precisaChave ? await obterChave(id) : null;
      return c.json(await provedor.testarCredencial(chave));
    } catch (e) {
      return c.json({ ok: false, mensagem: (e as Error).message });
    }
  });

  return app;
}
