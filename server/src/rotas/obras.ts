import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { FASES_TRADUCAO, PROVEDORES_IDS, type EventoLote, type ProvedorId } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposCapitulos, reposLotes, reposObras, reposPrompts, reposPromptPadrao, reposConfig, reposGlossario, reposTestes, reposUso } from '../db/repos.js';
import { jobEmExecucao } from '../traducao/job.js';
import { cancelarLote, emissorDoLote, iniciarLote, loteEmExecucao, retomarLote } from '../traducao/lote.js';
import { checkpointDaObra } from '../traducao/checkpoint.js';
import { comporPromptMae, extrairCamadas } from '../db/promptPadraoInicial.js';
import { exportarObra, importarObra } from '../db/portabilidade.js';
import { backupSeArquivo } from '../db/backup.js';
import { obterProvedor } from '../ia/fabrica.js';
import { obterChave } from '../credenciais/index.js';
import { filtrarGlossarioRelevante, incluirPrincipais } from '../ia/prompts.js';
import type { FraseParaTraduzir } from '../ia/provedor.js';
import { registrarEvento } from '../telemetria/registrar.js';
import { telemetriaDaObra } from '../telemetria/painel.js';

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
  autor: z.string().nullable().optional(),
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
  // Delta pode ser vazio (obra sem diretriz específica ainda); a rota valida
  // que um prompt 'completo' não fique sem conteúdo.
  conteudo: z.string(),
  notas_versao: z.string().optional(),
  ativar: z.boolean().default(true),
  tipo: z.enum(['completo', 'delta']).optional(),
});

const criarPromptPadraoSchema = z.object({
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
    // M4: mesmo bloqueio do delete de capítulo — excluir a obra com job em voo
    // (ou lote ativo) deixaria a chamada corrente pagar contra frases que já
    // não existem.
    if (loteEmExecucao(id) || reposCapitulos.listar(db, id).some((cap) => jobEmExecucao(cap.id))) {
      return c.json(
        { erro: { codigo: 'job-ativo', mensagem: 'Cancele o lote/traduções em andamento antes de excluir a obra.' } },
        409,
      );
    }
    const ok = reposObras.excluir(db, id);
    if (!ok) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json({ ok: true });
  });

  // ── Pipeline: checkpoint de estabilidade e fase (doc 09 §4) ──────────────

  app.get('/obras/:id/checkpoint', (c) => {
    const id = Number(c.req.param('id'));
    const obra = reposObras.obter(db, id);
    if (!obra) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json(checkpointDaObra(db, id, obra.fase_traducao, reposConfig.obterTodas(db)));
  });

  // Telemetria da obra (doc 11 §5): custo medido por capítulo lado a lado com a
  // qualidade, e os veredictos de cache e de lote.
  app.get('/obras/:id/telemetria', (c) => {
    const id = Number(c.req.param('id'));
    if (!reposObras.obter(db, id)) {
      return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    }
    return c.json(telemetriaDaObra(db, id));
  });

  app.put('/obras/:id/fase', async (c) => {
    const id = Number(c.req.param('id'));
    const corpo = z
      .object({ fase: z.enum(FASES_TRADUCAO) })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const obra = reposObras.definirFase(db, id, corpo.data.fase);
    if (!obra) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    return c.json(obra);
  });

  // ── Lote de tradução (fase de cruzeiro, doc 09 §5) ───────────────────────

  app.get('/obras/:id/lote', (c) => {
    const lote = reposLotes.atual(db, Number(c.req.param('id')));
    return c.json({ lote: lote ?? null });
  });

  app.post('/obras/:id/lote', async (c) => {
    const id = Number(c.req.param('id'));
    const corpo = z
      .object({ capitulo_ids: z.array(z.number().int()).optional(), qa_automatica: z.boolean().optional() })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!corpo.success) return c.json({ erro: { codigo: 'payload-invalido', mensagem: corpo.error.message } }, 400);
    const r = iniciarLote(db, id, { capituloIds: corpo.data.capitulo_ids, qaAutomatica: corpo.data.qa_automatica });
    if (!r.ok) {
      const codigo = r.erro?.includes('andamento') ? 409 : 400;
      return c.json({ erro: { codigo: 'lote', mensagem: r.erro } }, codigo);
    }
    return c.json({ lote: r.lote }, 202);
  });

  app.post('/obras/:id/lote/cancelar', (c) => {
    return c.json({ ok: cancelarLote(db, Number(c.req.param('id'))) });
  });

  app.post('/obras/:id/lote/retomar', (c) => {
    const r = retomarLote(db, Number(c.req.param('id')));
    if (!r.ok) return c.json({ erro: { codigo: 'lote', mensagem: r.erro } }, 400);
    return c.json({ lote: r.lote }, 202);
  });

  app.get('/obras/:id/lote/eventos', (c) => {
    const id = Number(c.req.param('id'));
    return streamSSE(c, async (stream) => {
      const emissor = emissorDoLote(id);
      let encerrar: (() => void) | null = null;
      const encerrado = new Promise<void>((resolve) => {
        encerrar = resolve;
      });

      let fila: Promise<unknown> = Promise.resolve();
      const escrever = (evento: string, dados: unknown, aoFim?: () => void) => {
        fila = fila
          .then(() => stream.writeSSE({ event: evento, data: JSON.stringify(dados) }))
          .then(() => aoFim?.())
          .catch(() => encerrar?.());
      };

      const ouvinte = (evento: EventoLote) => {
        escrever(evento.tipo, evento.dados, evento.tipo === 'lote_encerrado' ? () => encerrar?.() : undefined);
      };
      emissor.on('evento', ouvinte);
      stream.onAbort(() => encerrar?.());

      // Estado atual ao conectar; se não há lote rodando, encerra o stream.
      const lote = reposLotes.atual(db, id);
      if (lote) escrever('lote', lote);
      if (!loteEmExecucao(id)) escrever('lote_encerrado', lote ?? null, () => encerrar?.());

      await encerrado;
      emissor.off('evento', ouvinte);
    });
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
    // Snapshot antes de uma escrita em massa (doc 10 §1).
    backupSeArquivo(db, 'pre-import');
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
    const obraId = Number(c.req.param('id'));
    // Sem tipo explícito, a nova versão herda o tipo da ativa (delta continua
    // delta; prompt completo legado continua completo).
    const tipo = corpo.data.tipo ?? reposPrompts.ativo(db, obraId)?.tipo ?? 'completo';
    if (tipo === 'completo' && corpo.data.conteudo.trim().length === 0) {
      return c.json({ erro: { codigo: 'payload-invalido', mensagem: 'Um prompt completo não pode ser vazio.' } }, 400);
    }
    try {
      return c.json(
        reposPrompts.criar(db, obraId, {
          ...corpo.data,
          tipo,
          nucleo_id: tipo === 'delta' ? (reposPromptPadrao.ativo(db)?.id ?? null) : null,
        }),
        201,
      );
    } catch (e: any) {
      if (String(e.message).includes('UNIQUE')) {
        return c.json({ erro: { codigo: 'versao-duplicada', mensagem: 'Já existe uma versão com esse identificador nesta obra.' } }, 409);
      }
      throw e;
    }
  });

  // Prompt mãe efetivo (núcleo + delta compostos) — prévia na UI e medição.
  app.get('/obras/:id/prompt-composto', (c) => {
    const composto = reposPrompts.composto(db, Number(c.req.param('id')));
    if (!composto) {
      return c.json({ erro: { codigo: 'sem-prompt', mensagem: 'A obra não tem prompt mãe ativo e não há prompt padrão ativo.' } }, 404);
    }
    return c.json(composto);
  });

  // Prévia da conversão assistida (doc 08 §4): separa o prompt completo ativo em
  // rascunho de delta (Seção 6) + núcleo da obra, para o usuário comparar com o
  // núcleo global e decidir o que vai para onde. Não altera nada.
  app.get('/obras/:id/prompts/previa-conversao', (c) => {
    const ativo = reposPrompts.ativo(db, Number(c.req.param('id')));
    if (!ativo) return c.json({ erro: { codigo: 'sem-prompt', mensagem: 'A obra não tem prompt ativo.' } }, 404);
    if (ativo.tipo === 'delta') {
      return c.json({ erro: { codigo: 'ja-convertido', mensagem: 'O prompt ativo já está no formato em camadas.' } }, 409);
    }
    const camadas = extrairCamadas(ativo.conteudo);
    const nucleoAtivo = reposPromptPadrao.ativo(db);
    return c.json({
      convertivel: camadas !== null,
      delta_rascunho: camadas?.delta ?? '',
      // Restante do prompt da obra (com marcador no lugar da Seção 6) — é o que
      // se compara ao núcleo global para achar divergências a promover/absorver.
      nucleo_da_obra: camadas?.nucleo ?? ativo.conteudo,
      nucleo_global: nucleoAtivo?.conteudo ?? '',
      nucleo_global_versao: nucleoAtivo?.versao ?? null,
    });
  });

  app.post('/prompts/:id/ativar', (c) => {
    const prompt = reposPrompts.ativar(db, Number(c.req.param('id')));
    if (!prompt) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Versão não encontrada.' } }, 404);
    return c.json(prompt);
  });

  // Versionamento semiautomático (doc 08 §7): recorrências do banco de testes →
  // propostas concretas de regra para o delta. Usa o modelo do papel de revisão
  // (raciocínio) quando configurado; nada é gravado — o usuário decide na UI.
  app.post('/obras/:id/prompts/sugerir-refinamento', async (c) => {
    const obraId = Number(c.req.param('id'));
    const obra = reposObras.obter(db, obraId);
    if (!obra) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);

    const prompt = reposPrompts.composto(db, obraId);
    if (!prompt) {
      return c.json({ erro: { codigo: 'sem-prompt', mensagem: 'A obra não tem prompt mãe ativo e não há prompt padrão ativo.' } }, 400);
    }

    const recorrencias = reposTestes.recorrencias(db, obraId);
    if (recorrencias.length === 0) {
      return c.json({ erro: { codigo: 'sem-recorrencias', mensagem: 'Nenhuma seção/regra com 2+ casos não-confirmados no banco de testes — nada indica lacuna sistemática do prompt.' } }, 409);
    }

    // Até 5 casos por seção recorrente mantêm a chamada enxuta e representativa.
    const casos = recorrencias.flatMap((r) =>
      reposTestes
        .listar(db, obraId, { secao_regra: r.secao_regra, limite: 5 })
        .casos.filter((caso) => caso.status === 'pendente' || caso.status === 'regra-nova-necessaria')
        .map((caso) => ({
          secao_regra: r.secao_regra,
          trecho_zh: caso.trecho_zh,
          pergunta: caso.pergunta,
          veredito: caso.veredito,
          justificativa: caso.justificativa,
          correcao_proposta: caso.correcao_proposta,
        })),
    );

    const config = reposConfig.obterTodas(db);
    const provedorId: ProvedorId =
      (config.provedor_revisao || undefined) ?? obra.provedor_padrao ?? config.provedor_padrao;
    const provedor = obterProvedor(provedorId);
    const modelo = config.provedor_revisao
      ? config.modelo_revisao || provedor.modeloPadrao
      : (obra.modelo_padrao ?? (config.modelo_padrao || provedor.modeloPadrao));
    const chave = provedor.precisaChave ? await obterChave(provedorId) : null;
    if (provedor.precisaChave && !chave) {
      return c.json({ erro: { codigo: 'sem-chave', mensagem: `Nenhuma chave de API configurada para ${provedor.nome}.` } }, 400);
    }

    try {
      reposUso.registrar(db, provedorId, modelo);
      const resposta = await provedor.refinarPrompt(chave, {
        modelo,
        promptMae: prompt.texto,
        deltaAtual: prompt.prompt.tipo === 'delta' ? prompt.prompt.conteudo : (extrairCamadas(prompt.prompt.conteudo)?.delta ?? ''),
        casos,
      });
      registrarEvento(db, {
        obra_id: obraId,
        capitulo_id: null,
        papel: 'refinamento',
        provedor: provedorId,
        modelo,
        uso: resposta.uso,
      });
      return c.json({ propostas: resposta.propostas, recorrencias, provedor: provedorId, modelo });
    } catch (e) {
      return c.json({ erro: { codigo: 'provedor', mensagem: (e as Error).message } }, 502);
    }
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
    const corpo = criarPromptPadraoSchema.safeParse(await c.req.json());
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
    // Com obra: composição núcleo + delta dela. Sem obra (cadastro): o núcleo
    // ativo composto com delta vazio — a composição também remove o marcador.
    const nucleoAtivo = reposPromptPadrao.ativo(db);
    const promptTexto = obra
      ? reposPrompts.composto(db, obra.id)?.texto
      : nucleoAtivo
        ? comporPromptMae(nucleoAtivo.conteudo, '')
        : undefined;
    if (!promptTexto) {
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

    // Mesmo desenho da tradução de capítulo: glossário filtrado pelo trecho vai
    // na mensagem do usuário e o sistema fica estável (cacheável).
    const glossarioTodo = obra ? reposGlossario.listar(db, obra.id) : [];
    const glossario = config.glossario_relevante
      ? incluirPrincipais(
          filtrarGlossarioRelevante(glossarioTodo, [corpo.data.titulo_zh, corpo.data.sinopse_zh]),
          glossarioTodo,
        )
      : glossarioTodo;

    try {
      reposUso.registrar(db, provedorId, modelo);
      const resposta = await provedor.traduzirBloco(chave, {
        modelo,
        promptMae: promptTexto,
        modo: 'detalhes',
        glossario,
        glossarioNoUsuario: config.glossario_relevante,
        caudaAnterior: [],
        frases,
        proximas: [],
      });
      // No cadastro de obra nova ainda não existe obra_id: o gasto entra no total
      // do dia (e na conta da cota) sem ser atribuível a uma obra.
      registrarEvento(db, {
        obra_id: obra?.id ?? null,
        capitulo_id: null,
        papel: 'titulo',
        provedor: provedorId,
        modelo,
        uso: resposta.uso,
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
