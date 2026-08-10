import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import {
  FASES_TRADUCAO,
  PROVEDORES_IDS,
  MODOS_THINKING,
  TEMPERATURA_MAX,
  camadaDoRotulo,
  normalizarPreferencias,
  resolverTemperatura,
  type Configuracoes,
  type EventoLote,
  type ParProvedor,
  type ProvedorId,
} from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposCapitulos, reposConsistencia, reposFrases, reposLotes, reposObras, reposPrompts, reposPromptPadrao, reposConfig, reposGlossario, reposTestes, reposUso } from '../db/repos.js';
import { amostrarEspalhado, classificarEdicoes } from '../traducao/edicoesManuais.js';
import { varrerConsistencia } from '../traducao/consistencia.js';
import { jobEmExecucao } from '../traducao/job.js';
import { cancelarLote, emissorDoLote, iniciarLote, loteEmExecucao, retomarLote } from '../traducao/lote.js';
import { checkpointDaObra } from '../traducao/checkpoint.js';
import { extrairCamadas } from '../db/promptPadraoInicial.js';
import { exportarObra, importarObra } from '../db/portabilidade.js';
import { avisosDaCamada, avisosDeAlfa } from './avisosCamada.js';
import { relatorioOmega } from './relatorioOmega.js';
import { backupSeArquivo } from '../db/backup.js';
import { obterProvedor } from '../ia/fabrica.js';
import { obterChave } from '../credenciais/index.js';
import { filtrarGlossarioRelevante, incluirPrincipais } from '../ia/prompts.js';
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
  // Override de amostragem da obra (doc 08 §13); null = padrão do papel.
  temperatura: z.number().min(0).max(TEMPERATURA_MAX).nullable().optional(),
  // Raciocínio do provedor nesta obra; null = o padrão dele.
  thinking: z.enum(MODOS_THINKING).nullable().optional(),
  // Vitrine pública (doc 14). Booleano estrito e sem `nullable`: publicar é um
  // sim ou um não explícito, e omitir mantém o que estava.
  publica: z.boolean().optional(),
});

const MIMES_CAPA = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const CAPA_MAX_BYTES = 2 * 1024 * 1024;

/** Par provedor/modelo da contracapa (doc 08 §5/§11). Ordem: pedido explícito →
    papel `provedor_detalhes` → cadeia normal (obra → global). A contracapa roda
    1× por obra: é o lugar barato de usar o melhor modelo. Modelo de um provedor
    nunca vai para outro — trocado o provedor, o modelo volta para o padrão dele. */
export function resolverParContracapa(
  config: Configuracoes,
  obra: { provedor_padrao: ProvedorId | null; modelo_padrao: string | null } | undefined,
  pedido: { provedor?: ProvedorId; modelo?: string },
): ParProvedor {
  const papelDetalhes = !pedido.provedor && !!config.provedor_detalhes;
  const provedor: ProvedorId =
    pedido.provedor ??
    (papelDetalhes ? (config.provedor_detalhes as ProvedorId) : (obra?.provedor_padrao ?? config.provedor_padrao));
  const padraoDoProvedor = obterProvedor(provedor).modeloPadrao;
  if (pedido.modelo) return { provedor, modelo: pedido.modelo };
  if (papelDetalhes) return { provedor, modelo: config.modelo_detalhes || padraoDoProvedor };
  // Cadeia normal, só enquanto o provedor for o mesmo de quem guardou o modelo.
  const daObra = obra?.provedor_padrao === provedor ? obra?.modelo_padrao : null;
  const daConfig = config.provedor_padrao === provedor ? config.modelo_padrao : '';
  return { provedor, modelo: daObra || daConfig || padraoDoProvedor };
}

const criarPromptSchema = z.object({
  versao: z.string().min(1),
  // Delta pode ser vazio (obra sem diretriz específica ainda); a rota valida
  // que um prompt 'completo' não fique sem conteúdo.
  conteudo: z.string(),
  notas_versao: z.string().optional(),
  ativar: z.boolean().default(true),
  tipo: z.enum(['completo', 'delta']).optional(),
  // Preferências de estilo (doc 08 §12). Omitidas, a nova versão HERDA as da
  // ativa — editar o texto do delta não pode virar acidentalmente a chave do
  // diálogo de volta para o padrão.
  preferencias: z
    .object({
      dialogo: z.enum(['aspas', 'travessao']).optional(),
      pensamento_marca: z.enum(['italico', 'aspas']).optional(),
      pensamento_tempo: z.enum(['presente', 'original']).optional(),
      mais_que_perfeito: z.enum(['evitar', 'permitir']).optional(),
      notas_tradutor: z.enum(['permitir', 'proibir']).optional(),
      onomatopeia: z.enum(['adaptar', 'manter']).optional(),
      nomes_proprios: z.enum(['mesclar', 'traduzir', 'pinyin']).optional(),
      registro: z.string().trim().min(1).max(200).optional(),
    })
    .optional(),
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

  // ── Varredura de consistência do glossário na OBRA inteira (doc 05 §4.2) ──
  // GET /capitulos/:id/consistencia (capitulos.ts) já existe por capítulo; esta
  // é a mesma varredura pura (traducao/consistencia.ts) rodada sobre a obra
  // toda. Agrupar por TERMO e não por frase é a decisão central: o conserto é
  // por termo (`POST /glossario/:id/substituir` troca na obra inteira), então
  // o relatório precisa estar organizado do jeito que o conserto funciona —
  // uma lista por frase obrigaria o revisor a reconstruir mentalmente qual
  // termo é qual antes de poder agir.
  app.get('/obras/:id/consistencia', (c) => {
    const obraId = Number(c.req.param('id'));
    if (!reposObras.obter(db, obraId)) {
      return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    }
    const frases = reposFrases.listarPorObra(db, obraId);
    const glossario = reposGlossario.listar(db, obraId);
    const resultado = varrerConsistencia(frases, glossario, reposConsistencia.ignoradasDaObra(db, obraId));

    const porFrase = new Map(frases.map((f) => [f.id, f]));
    interface ViolacaoNaObra {
      frase_id: number;
      capitulo_id: number | null;
      capitulo_numero: number | null;
      ordem: number;
      texto_zh: string;
      texto_pt: string;
    }
    const porTermo = new Map<
      string,
      { glossario_id: number; termo_zh: string; termo_pt: string; violacoes: ViolacaoNaObra[] }
    >();
    for (const v of resultado.violacoes) {
      const entrada = glossario.find((g) => g.termo_zh === v.termo_zh);
      const grupo = porTermo.get(v.termo_zh) ?? {
        glossario_id: entrada?.id ?? 0,
        termo_zh: v.termo_zh,
        termo_pt: v.termo_pt,
        violacoes: [],
      };
      const f = porFrase.get(v.frase_id);
      grupo.violacoes.push({
        frase_id: v.frase_id,
        capitulo_id: f?.capitulo_id ?? null,
        capitulo_numero: f?.capitulo_numero ?? null,
        ordem: v.ordem,
        texto_zh: v.texto_zh,
        texto_pt: v.texto_pt,
      });
      porTermo.set(v.termo_zh, grupo);
    }

    // Mais violações primeiro; empate pelo termo em PT, para a lista não dançar
    // entre duas chamadas iguais.
    const por_termo = [...porTermo.values()].sort(
      (a, b) => b.violacoes.length - a.violacoes.length || a.termo_pt.localeCompare(b.termo_pt, 'pt-BR'),
    );

    return c.json({
      ocorrencias: resultado.ocorrencias,
      termos_curtos_ignorados: resultado.termos_curtos_ignorados,
      frases_examinadas: frases.filter((f) => f.status_traducao === 'traduzida').length,
      por_termo,
    });
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
    const ativo = reposPrompts.ativo(db, obraId);
    // Sem tipo explícito, a nova versão herda o tipo da ativa (delta continua
    // delta; prompt completo legado continua completo).
    const tipo = corpo.data.tipo ?? ativo?.tipo ?? 'completo';
    if (tipo === 'completo' && corpo.data.conteudo.trim().length === 0) {
      return c.json({ erro: { codigo: 'payload-invalido', mensagem: 'Um prompt completo não pode ser vazio.' } }, 400);
    }
    try {
      const criado = reposPrompts.criar(db, obraId, {
        ...corpo.data,
        tipo,
        nucleo_id: tipo === 'delta' ? (reposPromptPadrao.ativo(db)?.id ?? null) : null,
        preferencias: normalizarPreferencias({ ...(ativo?.preferencias ?? {}), ...(corpo.data.preferencias ?? {}) }),
      });
      // Aviso, nunca bloqueio (doc 15 §7): a versão fica salva de qualquer jeito. Um
      // prompt `completo` legado não é Delta — nele o tema de Beta está no lugar certo.
      const avisos = tipo === 'delta' ? avisosDaCamada(corpo.data.conteudo, 'delta') : [];
      return c.json({ ...criado, avisos }, 201);
    } catch (e: any) {
      if (String(e.message).includes('UNIQUE')) {
        return c.json({ erro: { codigo: 'versao-duplicada', mensagem: 'Já existe uma versão com esse identificador nesta obra.' } }, 409);
      }
      throw e;
    }
  });

  // Relatório do Ômega (doc 15 §7): o único lugar onde as três camadas se encontram, e
  // por isso o único que enxerga sobreposição. As checagens de salvar olham uma camada
  // por vez e não veriam um Delta impecável que ainda assim repete o que Beta decide.
  app.get('/obras/:id/omega/relatorio', (c) => {
    const composto = reposPrompts.composto(db, Number(c.req.param('id')));
    if (!composto) {
      return c.json(
        { erro: { codigo: 'sem-prompt', mensagem: 'A obra não tem Ômega: falta prompt ativo ou Alfa ativo.' } },
        404,
      );
    }
    return c.json(relatorioOmega(composto.texto));
  });

  // Ômega efetivo (Alfa + Beta + Delta compostos) — prévia na UI e medição.
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

    // Achado da revisão final: os dois portões abaixo dependiam SÓ do banco de
    // testes, mas a chamada usa DOIS canais de sinal — `casos` (recorrências do
    // banco de testes) e `edicoes` (edições manuais classificadas como
    // `diretriz`, ver edicoesManuais.ts). Na obra real da 死人经 eram 146 edições
    // manuais contra 25 casos no banco de testes: o canal escasso era o único
    // que abria o portão, e um clique em "Incluir no próximo refinamento" caía
    // numa parede que só falava do banco de testes, sem mencionar as edições —
    // que nunca tinham sido sequer olhadas. `edicoes` precisa estar calculado
    // ANTES dos dois `return 409`, para que a presença de candidatas por esse
    // canal baste para a chamada seguir mesmo sem recorrência nenhuma.
    const prefs = normalizarPreferencias(reposPrompts.ativo(db, obraId)?.preferencias);
    const edicoesDiretriz = classificarEdicoes(
      reposFrases.paraMineracao(db, obraId),
      reposGlossario.listar(db, obraId),
      prefs,
    ).filter((e) => e.rota === 'diretriz');
    // Teto de 15, ESPALHADAS pela obra — não "as mais recentes": `paraMineracao`
    // ordena por posição no livro (capítulo, ordem), e a tabela `frases` não tem
    // carimbo de tempo de edição, então "recente" não é uma amostra que o schema
    // consiga dar. Um `slice` do fim privilegiaria só o último capítulo revisado;
    // espalhar mostra repetição ao longo da obra inteira, que é o próprio
    // critério que separa gosto isolado de regra (ver instrução em
    // `sistemaRefinarPromptPartes`).
    const edicoes = amostrarEspalhado(edicoesDiretriz, 15).map((e) => ({
      trecho_zh: e.texto_zh,
      ia: e.ia,
      voce: e.voce,
      mudou: { de: e.de, para: e.para },
    }));

    const todasRecorrencias = reposTestes.recorrencias(db, obraId);
    if (todasRecorrencias.length === 0 && edicoes.length === 0) {
      return c.json({ erro: { codigo: 'sem-recorrencias', mensagem: 'Nenhuma seção/regra com 2+ casos recorrentes no banco de testes, e nenhuma edição manual candidata a diretriz — nada indica lacuna sistemática do prompt.' } }, 409);
    }

    // Roteamento por camada dona (doc 15 §7). A partição por tema diz que cada
    // assunto pertence a UMA camada: recorrência de chave de estilo se resolve
    // virando a chave, e recorrência de tema do núcleo é versão nova de Alfa ou
    // desobediência do modelo — nenhuma das duas vira diretriz de obra. Filtrar
    // aqui evita pagar uma chamada cuja resposta já se sabe.
    const classificadas = todasRecorrencias.map((r) => ({ ...r, camada: camadaDoRotulo(r.secao_regra)?.camada ?? null }));
    const daObra = classificadas.filter((r) => r.camada === null || r.camada === 'delta');
    const deChave = classificadas.filter((r) => r.camada === 'beta');
    const deNucleo = classificadas.filter((r) => r.camada === 'alfa');

    if (daObra.length === 0 && edicoes.length === 0) {
      const lista = (l: typeof classificadas) => l.map((r) => `${r.secao_regra} (${r.casos})`).join(', ');
      const partes: string[] = [];
      if (deChave.length > 0) {
        partes.push(
          `Chaves de estilo: ${lista(deChave)}. Isso se resolve virando a chave em "Preferências de estilo" — ou o erro é o modelo desobedecendo uma regra que já existe.`,
        );
      }
      if (deNucleo.length > 0) {
        partes.push(
          `Regras universais do núcleo: ${lista(deNucleo)}. Ou a regra do núcleo tem buraco — e aí é uma versão nova de Alfa, com as duas medições do registro de temas — ou o modelo desobedeceu, e aí o conserto é temperatura, modelo ou posição no prompt. Escrever diretriz de obra sobre isso criaria sobreposição entre camadas.`,
        );
      }
      return c.json(
        {
          erro: {
            codigo: 'so-camadas-donas',
            mensagem: `${partes.join(' ')} Nenhuma recorrência é candidata a diretriz de obra, e nenhuma edição manual candidata também — por isso nem gastei a chamada.`,
          },
        },
        409,
      );
    }
    const recorrencias = daObra;

    // Até 5 casos por seção recorrente mantêm a chamada enxuta e representativa.
    const casos = recorrencias.flatMap((r) =>
      reposTestes
        .listar(db, obraId, { secao_regra: r.secao_regra, limite: 5 })
        // Mesmo conjunto de status que `recorrencias` conta: corrigido é o erro
        // que o humano validou, e é o que mais ensina.
        .casos.filter((caso) => caso.status !== 'confirmado' && caso.status !== 'rejeitado' && !reposTestes.temFilho(db, caso.id))
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

    // O motivo da recusa é o único lugar do app onde o revisor diz POR ESCRITO
    // que a IA errou. Sem isso, o refinador só vê os casos em que ela acertou.
    const recusados = reposTestes
      .listar(db, obraId, { status: 'rejeitado', limite: 10 })
      .casos.map((caso) => ({
        trecho_zh: caso.trecho_zh,
        pergunta: caso.pergunta,
        veredito: caso.veredito,
        resposta: caso.resposta,
        motivo_rejeicao: caso.motivo_rejeicao,
      }));

    // `edicoes` (só a rota `diretriz`: o resto tem dono em outra camada e o
    // refinador é proibido de propor sobre eles) já foi calculada mais acima,
    // antes dos dois portões — precisa estar pronta ANTES deles, não aqui.
    try {
      reposUso.registrar(db, provedorId, modelo);
      const resposta = await provedor.refinarPrompt(chave, {
        modelo,
        // Amostragem (doc 08 §13): a única tarefa em que variedade é o produto —
        // propor regra nova a partir dos casos —, por isso a mais solta.
        temperatura: resolverTemperatura(config.temperaturas, 'refinamento', obra.temperatura),
        omega: prompt.texto,
        deltaAtual: prompt.prompt.tipo === 'delta' ? prompt.prompt.conteudo : (extrairCamadas(prompt.prompt.conteudo)?.delta ?? ''),
        casos,
        recusados,
        edicoes,
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

  // Leitura para a tela: todas as edições manuais já classificadas por rota,
  // incluindo as que NÃO viram diretriz (têm dono em outra camada) — a tela
  // mostra o quadro inteiro, e só o refinamento acima filtra por 'diretriz'.
  app.get('/obras/:id/edicoes-manuais', (c) => {
    const obraId = Number(c.req.param('id'));
    if (!reposObras.obter(db, obraId)) return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    const prefs = normalizarPreferencias(reposPrompts.ativo(db, obraId)?.preferencias);
    return c.json(classificarEdicoes(reposFrases.paraMineracao(db, obraId), reposGlossario.listar(db, obraId), prefs));
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
      // Os dois avisos que teriam evitado o sintoma de 2026-08-05: um Alfa que decide
      // tema de Beta, e um Alfa sem o marcador que faz as chaves valerem.
      return c.json({ ...reposPromptPadrao.criar(db, corpo.data), avisos: avisosDeAlfa(corpo.data.conteudo) }, 201);
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

  // ── Tradução de contracapa: título/sinopse (cadastro e ficha da obra) ───
  // NÃO usa o prompt mãe da obra: contracapa tem prompt próprio (doc 08 §11) —
  // o núcleo de capítulo proíbe justamente a interpretação que esta tarefa
  // exige. Da obra vem só o glossário. Sem obra_id (cadastro) não há glossário.

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

    const config = reposConfig.obterTodas(db);
    const par = resolverParContracapa(config, obra, corpo.data);
    const provedor = obterProvedor(par.provedor);
    const chave = provedor.precisaChave ? await obterChave(par.provedor) : null;
    if (provedor.precisaChave && !chave) {
      return c.json({ erro: { codigo: 'sem-chave', mensagem: `Nenhuma chave de API configurada para ${provedor.nome}.` } }, 400);
    }

    // Mesmo desenho das demais tarefas: glossário filtrado pelo texto vai na
    // mensagem do usuário e o bloco de sistema fica estável (cacheável).
    const glossarioTodo = obra ? reposGlossario.listar(db, obra.id) : [];
    const glossario = config.glossario_relevante
      ? incluirPrincipais(
          filtrarGlossarioRelevante(glossarioTodo, [corpo.data.titulo_zh, corpo.data.sinopse_zh]),
          glossarioTodo,
        )
      : glossarioTodo;

    try {
      reposUso.registrar(db, par.provedor, par.modelo);
      // A sinopse vai INTEIRA, com as quebras originais: picotada em parágrafos
      // numerados, os versos paralelos da abertura eram traduzidos isolados e
      // viravam prosa. Um campo, uma leitura, uma intenção.
      const resposta = await provedor.traduzirContracapa(chave, {
        modelo: par.modelo,
        // Amostragem (doc 08 §13): a tarefa declaradamente interpretativa do app
        // (§11) — um pouco mais solta que a tradução, longe do 1.0 que fez ~2 de
        // 8 chamadas saírem degeneradas na medição da contracapa.
        temperatura: resolverTemperatura(config.temperaturas, 'titulo', obra?.temperatura),
        tituloZh: corpo.data.titulo_zh,
        sinopseZh: corpo.data.sinopse_zh,
        glossario,
        glossarioNoUsuario: config.glossario_relevante,
      });
      // No cadastro de obra nova ainda não existe obra_id: o gasto entra no total
      // do dia (e na conta da cota) sem ser atribuível a uma obra.
      registrarEvento(db, {
        obra_id: obra?.id ?? null,
        capitulo_id: null,
        papel: 'titulo',
        provedor: par.provedor,
        modelo: par.modelo,
        uso: resposta.uso,
      });
      const limpar = (texto: string | null) => {
        const t = texto?.trim();
        return t ? t : null;
      };
      return c.json({
        titulo_pt: corpo.data.titulo_zh ? limpar(resposta.titulo_pt) : null,
        sinopse_pt: corpo.data.sinopse_zh ? limpar(resposta.sinopse_pt) : null,
      });
    } catch (e) {
      return c.json({ erro: { codigo: 'provedor', mensagem: (e as Error).message } }, 502);
    }
  });

  return app;
}
