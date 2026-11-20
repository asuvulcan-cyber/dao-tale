import { Hono } from 'hono';
import { z } from 'zod';
import {
  IDIOMAS_ORIGEM,
  NOTAS_REVISAO,
  resolverTemperatura,
  type EstadoTutorFrase,
  type Frase,
  type ProvedorId,
} from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import {
  reposCapitulos,
  reposConfig,
  reposFrases,
  reposGlossario,
  reposObras,
  reposPrompts,
  reposTutor,
  reposUso,
  reposVocabulario,
} from '../db/repos.js';
import { obterProvedor } from '../ia/fabrica.js';
import { filtrarGlossarioRelevante, incluirPrincipais } from '../ia/prompts.js';
import type { RequisicaoTutorBase } from '../ia/promptTutor.js';
import { ErroProvedor } from '../ia/provedor.js';
import { obterChave } from '../credenciais/index.js';
import { registrarEvento } from '../telemetria/registrar.js';
import { lerJson } from './json.js';

// Modo tutor de idioma (doc 29): explicação e correção por frase, gravação da
// tradução de quem aprende e o vocabulário com repetição espaçada.

/** Frases de contexto de cada lado: o bastante para resolver referente e tempo
 *  verbal sem transformar uma chamada por frase em uma chamada por capítulo. */
const VIZINHAS_TUTOR = 2;

const vazio = (fraseId: number): EstadoTutorFrase => ({
  frase_id: fraseId,
  explicacao: null,
  dicas_vistas: 0,
  tentativa: null,
  correcao: null,
  tentativas: 0,
  salva_em: null,
});

const erro = (codigo: string, mensagem: string) => ({ erro: { codigo, mensagem } });

const palavraSchema = z.object({
  idioma: z.enum(IDIOMAS_ORIGEM),
  termo: z.string().trim().min(1).max(80),
  leitura: z.string().max(120).nullable().optional(),
  significado: z.string().trim().min(1).max(400),
  nota: z.string().max(600).nullable().optional(),
  exemplo_origem: z.string().max(2000).nullable().optional(),
  exemplo_pt: z.string().max(2000).nullable().optional(),
  obra_id: z.number().int().nullable().optional(),
  frase_id: z.number().int().nullable().optional(),
});

export function rotasTutor(db: BancoDados): Hono {
  const app = new Hono();

  /**
   * Tudo que uma chamada do tutor precisa saber sobre a frase. Par provedor/
   * modelo: o do papel tutor, se configurado; senão a cadeia normal (capítulo →
   * obra → padrão global), como na revisão.
   */
  async function prepararChamada(frase: Frase) {
    const capitulo = reposCapitulos.obter(db, frase.capitulo_id)!;
    const obra = reposObras.obter(db, capitulo.obra_id)!;
    const config = reposConfig.obterTodas(db);

    const papel = !!config.provedor_tutor;
    const provedorId: ProvedorId = papel
      ? (config.provedor_tutor as ProvedorId)
      : ((capitulo.provedor as ProvedorId | null) ?? obra.provedor_padrao ?? config.provedor_padrao);
    const provedor = obterProvedor(provedorId);
    const modelo = papel
      ? config.modelo_tutor || provedor.modeloPadrao
      : (capitulo.modelo ?? obra.modelo_padrao ?? (config.modelo_padrao || provedor.modeloPadrao));
    const chave = provedor.precisaChave ? await obterChave(provedorId) : null;
    if (provedor.precisaChave && !chave) {
      throw new ErroProvedor(`Nenhuma chave de API configurada para ${provedor.nome}.`, 'fatal');
    }

    const todas = reposFrases.listarPorCapitulo(db, frase.capitulo_id);
    const antes = todas
      .filter((f) => f.ordem < frase.ordem)
      .slice(-VIZINHAS_TUTOR)
      .map((f) => ({ origem: f.texto_zh, pt: f.texto_pt }));
    const depois = todas
      .filter((f) => f.ordem > frase.ordem)
      .slice(0, VIZINHAS_TUTOR)
      .map((f) => f.texto_zh);

    const glossarioTodo = reposGlossario.listar(db, obra.id);
    const glossario = incluirPrincipais(
      filtrarGlossarioRelevante(glossarioTodo, [frase.texto_zh, ...antes.map((a) => a.origem), ...depois]),
      glossarioTodo,
    );

    const req: RequisicaoTutorBase = {
      modelo,
      idioma_origem: obra.idioma_origem,
      nivel: config.nivel_idioma[obra.idioma_origem],
      // Explicação e correção são veredito, não criação: a temperatura da revisão.
      temperatura: resolverTemperatura(config.temperaturas, 'revisao', obra.temperatura),
      omega: reposPrompts.composto(db, obra.id)?.texto ?? '(esta obra ainda não tem regras de tradução próprias)',
      glossario,
      frase: frase.texto_zh,
      antes,
      depois,
    };
    return { obra, provedor, provedorId, modelo, chave, req };
  }

  function obterFrase(id: string) {
    return reposFrases.obter(db, Number(id));
  }

  // ── Estado por frase ────────────────────────────────────────────────────

  app.get('/capitulos/:id/tutor', (c) => c.json(reposTutor.listarPorCapitulo(db, Number(c.req.param('id')))));

  app.get('/frases/:id/tutor', (c) => {
    const frase = obterFrase(c.req.param('id'));
    if (!frase) return c.json(erro('nao-encontrado', 'Frase não encontrada.'), 404);
    return c.json(reposTutor.obter(db, frase.id, frase.texto_zh) ?? vazio(frase.id));
  });

  app.post('/frases/:id/tutor/explicar', async (c) => {
    const corpo = z.object({ refazer: z.boolean().default(false) }).safeParse(await lerJson(c).catch(() => ({})));
    if (!corpo.success) return c.json(erro('payload-invalido', corpo.error.message), 400);
    const frase = obterFrase(c.req.param('id'));
    if (!frase) return c.json(erro('nao-encontrado', 'Frase não encontrada.'), 404);

    // Já explicada: devolve a guardada. Reabrir a frase não gasta de novo.
    const atual = reposTutor.obter(db, frase.id, frase.texto_zh);
    if (atual?.explicacao && !corpo.data.refazer) return c.json(atual);

    try {
      const { obra, provedor, provedorId, modelo, chave, req } = await prepararChamada(frase);
      reposUso.registrar(db, provedorId, modelo);
      const resposta = await provedor.explicarFraseTutor(chave, req);
      registrarEvento(db, { obra_id: obra.id, capitulo_id: frase.capitulo_id, papel: 'tutor', provedor: provedorId, modelo, uso: resposta.uso });
      const { bruta: _bruta, uso: _uso, ...explicacao } = resposta;
      reposTutor.gravarExplicacao(db, frase.id, frase.texto_zh, explicacao);
      return c.json(reposTutor.obter(db, frase.id, frase.texto_zh)!);
    } catch (e) {
      const mensagem = e instanceof ErroProvedor ? e.message : `Falha na explicação: ${(e as Error).message}`;
      return c.json(erro('tutor', mensagem), 502);
    }
  });

  app.post('/frases/:id/tutor/dicas', async (c) => {
    const corpo = z.object({ dicas: z.number().int().min(0).max(3) }).safeParse(await lerJson(c));
    if (!corpo.success) return c.json(erro('payload-invalido', corpo.error.message), 400);
    const frase = obterFrase(c.req.param('id'));
    if (!frase) return c.json(erro('nao-encontrado', 'Frase não encontrada.'), 404);
    reposTutor.registrarDicas(db, frase.id, frase.texto_zh, corpo.data.dicas);
    return c.json(reposTutor.obter(db, frase.id, frase.texto_zh)!);
  });

  app.post('/frases/:id/tutor/corrigir', async (c) => {
    const corpo = z.object({ tentativa: z.string().trim().min(1).max(4000) }).safeParse(await lerJson(c));
    if (!corpo.success) return c.json(erro('payload-invalido', 'Escreva a sua tradução antes de pedir correção.'), 400);
    const frase = obterFrase(c.req.param('id'));
    if (!frase) return c.json(erro('nao-encontrado', 'Frase não encontrada.'), 404);

    try {
      const { obra, provedor, provedorId, modelo, chave, req } = await prepararChamada(frase);
      const explicacao = reposTutor.obter(db, frase.id, frase.texto_zh)?.explicacao ?? null;
      reposUso.registrar(db, provedorId, modelo);
      const resposta = await provedor.corrigirTentativaTutor(chave, { ...req, tentativa: corpo.data.tentativa, explicacao });
      registrarEvento(db, { obra_id: obra.id, capitulo_id: frase.capitulo_id, papel: 'tutor', provedor: provedorId, modelo, uso: resposta.uso });
      const { bruta: _bruta, uso: _uso, ...correcao } = resposta;
      reposTutor.gravarCorrecao(db, frase.id, frase.texto_zh, corpo.data.tentativa, correcao);
      return c.json(reposTutor.obter(db, frase.id, frase.texto_zh)!);
    } catch (e) {
      const mensagem = e instanceof ErroProvedor ? e.message : `Falha na correção: ${(e as Error).message}`;
      return c.json(erro('tutor', mensagem), 502);
    }
  });

  app.post('/frases/:id/tutor/salvar', async (c) => {
    const corpo = z.object({ texto_pt: z.string().trim().min(1).max(4000) }).safeParse(await lerJson(c));
    if (!corpo.success) return c.json(erro('payload-invalido', 'A tradução está vazia.'), 400);
    const frase = obterFrase(c.req.param('id'));
    if (!frase) return c.json(erro('nao-encontrado', 'Frase não encontrada.'), 404);
    reposTutor.salvarTraducao(db, frase.id, frase.texto_zh, corpo.data.texto_pt);
    return c.json({ frase: reposFrases.obter(db, frase.id)!, estado: reposTutor.obter(db, frase.id, frase.texto_zh)! });
  });

  // ── Vocabulário ─────────────────────────────────────────────────────────

  const idiomaDaConsulta = (valor: string | undefined) =>
    IDIOMAS_ORIGEM.includes(valor as (typeof IDIOMAS_ORIGEM)[number]) ? (valor as (typeof IDIOMAS_ORIGEM)[number]) : undefined;

  app.get('/vocabulario', (c) => c.json(reposVocabulario.listar(db, idiomaDaConsulta(c.req.query('idioma')))));

  app.get('/vocabulario/resumo', (c) => c.json(reposVocabulario.resumo(db)));

  app.get('/vocabulario/revisao', (c) => {
    const idioma = idiomaDaConsulta(c.req.query('idioma'));
    if (!idioma) return c.json(erro('payload-invalido', 'Informe o idioma (zh ou en).'), 400);
    const limite = Math.min(200, Math.max(1, Number(c.req.query('limite')) || 50));
    return c.json(reposVocabulario.paraRevisar(db, idioma, limite));
  });

  app.post('/vocabulario', async (c) => {
    const corpo = palavraSchema.safeParse(await lerJson(c));
    if (!corpo.success) return c.json(erro('payload-invalido', corpo.error.message), 400);
    const r = reposVocabulario.adicionar(db, corpo.data);
    return c.json(r, r.nova ? 201 : 200);
  });

  app.patch('/vocabulario/:id', async (c) => {
    const corpo = palavraSchema.pick({ leitura: true, significado: true, nota: true }).partial().safeParse(await lerJson(c));
    if (!corpo.success) return c.json(erro('payload-invalido', corpo.error.message), 400);
    const palavra = reposVocabulario.editar(db, Number(c.req.param('id')), corpo.data);
    if (!palavra) return c.json(erro('nao-encontrado', 'Palavra não encontrada.'), 404);
    return c.json(palavra);
  });

  app.delete('/vocabulario/:id', (c) => {
    if (!reposVocabulario.remover(db, Number(c.req.param('id')))) {
      return c.json(erro('nao-encontrado', 'Palavra não encontrada.'), 404);
    }
    return c.json({ ok: true });
  });

  app.post('/vocabulario/:id/revisar', async (c) => {
    const corpo = z
      .object({ nota: z.number().int().refine((n) => (NOTAS_REVISAO as readonly number[]).includes(n)) })
      .safeParse(await lerJson(c));
    if (!corpo.success) return c.json(erro('payload-invalido', 'Nota de revisão inválida (0 a 3).'), 400);
    const palavra = reposVocabulario.revisar(db, Number(c.req.param('id')), corpo.data.nota as 0 | 1 | 2 | 3);
    if (!palavra) return c.json(erro('nao-encontrado', 'Palavra não encontrada.'), 404);
    return c.json(palavra);
  });

  return app;
}
