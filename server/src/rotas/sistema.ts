import { Hono } from 'hono';
import { z } from 'zod';
import { PROVEDORES_IDS, type EstadoConfiguracoes, type ProvedorId } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposConfig, reposUso } from '../db/repos.js';
import { definirChave, modoGuarda, removerChave, temChave, obterChave } from '../credenciais/index.js';
import { listarProvedores, obterProvedor } from '../ia/fabrica.js';
import { diretorioDados, ehInstanciaCanonica, PORTA } from '../config.js';
import { fazerBackup, listarBackups } from '../db/backup.js';
import { telemetriaDoDia } from '../telemetria/painel.js';
import { recalcularCustos } from '../telemetria/registrar.js';

const configSchema = z.object({
  provedor_padrao: z.enum(PROVEDORES_IDS).optional(),
  modelo_padrao: z.string().optional(),
  // A1: teto alinhado à capacidade real de saída dos provedores (~8K tokens) —
  // acima disso o truncamento era garantido e cada bloco pagava 5 chamadas
  // fadadas a falhar. O job ainda divide o bloco sozinho se truncar.
  tamanho_bloco: z.number().int().min(1).max(120).optional(),
  vizinhas_revisao: z.number().int().min(0).max(10).optional(),
  cauda_contexto: z.number().int().min(0).max(20).optional(),
  parar_no_limite: z.boolean().optional(),
  glossario_relevante: z.boolean().optional(),
  // Modelo por papel: revisão pode usar um provedor/modelo de raciocínio
  // próprio ('' = usar a cadeia normal).
  provedor_revisao: z.enum(PROVEDORES_IDS).or(z.literal('')).optional(),
  modelo_revisao: z.string().max(120).optional(),
  cotas_diarias: z.record(z.string(), z.number().int().min(0).max(1000000)).optional(),
  // Checkpoint de estabilidade (doc 09 §4): limiares do semáforo de liberação do lote.
  checkpoint_janela: z.number().int().min(1).max(50).optional(),
  checkpoint_termos_max: z.number().min(0).max(100).optional(),
  checkpoint_edicao_max: z.number().min(0).max(100).optional(),
  checkpoint_violacoes_max: z.number().min(0).max(100).optional(),
  // Lote / cruzeiro (doc 09 §5): paralelismo e cadeia de failover.
  lote_paralelo: z.number().int().min(1).max(8).optional(),
  failover: z
    .array(z.object({ provedor: z.enum(PROVEDORES_IDS), modelo: z.string().max(120) }))
    .max(6)
    .optional(),
  // QA por segunda IA (doc 09 §6): par próprio + automação opt-in.
  provedor_qa: z.enum(PROVEDORES_IDS).or(z.literal('')).optional(),
  modelo_qa: z.string().max(120).optional(),
  qa_automatica: z.boolean().optional(),
  // Telemetria (doc 11 §3): preços em USD por 1M tokens, chave "provedor:modelo"
  // (curinga "provedor:*" aceito). Teto alto o bastante para qualquer modelo de
  // ponta e baixo o bastante para pegar dedo trocado (preço por 1k em vez de 1M).
  precos_modelos: z
    .record(
      z.string().max(140),
      z.object({
        entrada: z.number().min(0).max(1000),
        saida: z.number().min(0).max(1000),
        cache_leitura: z.number().min(0).max(1000).optional(),
        cache_criacao: z.number().min(0).max(1000).optional(),
      }),
    )
    .optional(),
  taxa_usd_brl: z.number().min(0).max(1000).optional(),
});

export function rotasSistema(db: BancoDados): Hono {
  const app = new Hono();

  // Estado da instância (doc 10 §2): alimenta a tarja "instância de teste" e a
  // seção Dados. `canonico=false` avisa que não é a obra real na porta padrão.
  app.get('/saude', (c) => {
    const backups = listarBackups();
    return c.json({
      ok: true,
      versao: '0.1.0',
      porta: PORTA,
      caminho_dados: diretorioDados(),
      canonico: ehInstanciaCanonica(),
      backups: { total: backups.length, ultimo: backups[0]?.em ?? null },
    });
  });

  // Backup manual sob demanda (botão "Fazer backup agora").
  app.post('/sistema/backup', async (c) => {
    try {
      const caminho = await fazerBackup(db, 'manual');
      const info = listarBackups().find((b) => b.caminho === caminho) ?? null;
      return c.json({ ok: true, backup: info });
    } catch (e) {
      return c.json({ erro: { codigo: 'backup', mensagem: (e as Error).message } }, 500);
    }
  });

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

  // Consumo do dia com dinheiro e cota lado a lado (doc 11 §5, pergunta (c)).
  app.get('/telemetria/dia', (c) => c.json(telemetriaDoDia(db)));

  // Recalcula o custo do histórico com a tabela de preços vigente. Explícito de
  // propósito: cadastrar preço não reescreve o passado sozinho (doc 11 §2).
  app.post('/telemetria/recalcular', (c) => c.json(recalcularCustos(db)));

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
