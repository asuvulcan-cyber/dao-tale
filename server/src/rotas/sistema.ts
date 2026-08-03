import { Hono } from 'hono';
import { z } from 'zod';
import { normalizarTemperaturas, type EstadoConfiguracoes, type ProvedorId } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { configSchema, mensagemDeValidacao } from '../db/configuracoes.js';
import { reposConfig, reposUso } from '../db/repos.js';
import { definirChave, modoGuarda, removerChave, temChave, obterChave } from '../credenciais/index.js';
import { listarProvedores, obterProvedor } from '../ia/fabrica.js';
import { diretorioDados, ehInstanciaCanonica, PORTA } from '../config.js';
import { fazerBackup, listarBackups } from '../db/backup.js';
import { telemetriaDoDia } from '../telemetria/painel.js';
import { recalcularCustos } from '../telemetria/registrar.js';

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
    // Mensagem legível com o campo culpado: a tela de Configurações mostra isto
    // literalmente, e um salvar recusado precisa dizer QUAL campo recusou.
    if (!corpo.success)
      return c.json({ erro: { codigo: 'payload-invalido', mensagem: mensagemDeValidacao(corpo.error) } }, 400);
    const { temperaturas, ...resto } = corpo.data;
    return c.json(
      reposConfig.definir(db, {
        ...resto,
        // A tabela de temperaturas é guardada como um valor só (JSON): um PUT com
        // uma chave apenas precisa ser mesclado sobre o que já está gravado,
        // senão salvar "tradução" devolveria os outros papéis ao padrão.
        ...(temperaturas
          ? { temperaturas: normalizarTemperaturas({ ...reposConfig.obterTodas(db).temperaturas, ...temperaturas }) }
          : {}),
      }),
    );
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
