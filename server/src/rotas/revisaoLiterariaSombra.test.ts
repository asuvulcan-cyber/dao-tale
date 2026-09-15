import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { criarApp } from '../app.js';
import { provedorMock } from '../ia/mock.js';
import { reposConfig } from '../db/repos.js';

process.env.DAO_TALE_MOCK_LATENCIA = '0';
process.env.DAO_TALE_DIR = '/tmp/dao-tale-teste';

let db: BancoDados;
let app: Hono;

const json = async (r: Response) => await r.json() as any;
const chamar = async (metodo: string, rota: string, corpo?: unknown) => app.request(rota, {
  method: metodo,
  headers: corpo ? { 'content-type': 'application/json' } : undefined,
  body: corpo ? JSON.stringify(corpo) : undefined,
});

describe('pipeline de revisão literária em sombra', () => {
  let capituloId: number;
  let fraseId: number;

  beforeEach(async () => {
    vi.restoreAllMocks();
    db = abrirBanco(':memory:');
    app = criarApp(db);
    const obra = await json(await chamar('POST', '/api/obras', { titulo: 'Obra de teste' }));
    const criado = await json(await chamar('POST', `/api/obras/${obra.id}/capitulos`, {
      numero: 1,
      texto_origem: 'MOCK_REVISAR甲。乙。',
    }));
    capituloId = criado.capitulo.id;
    const frases = (await json(await chamar('GET', `/api/capitulos/${capituloId}`))).frases;
    fraseId = frases[0].id;
    await chamar('PATCH', `/api/frases/${frases[0].id}`, { texto_pt: 'Ele falou.' });
    await chamar('PATCH', `/api/frases/${frases[1].id}`, { texto_pt: 'Ela saiu.' });
  });

  it('grava somente candidato pendente e não toca no texto vigente', async () => {
    const resposta = await chamar('POST', `/api/capitulos/${capituloId}/revisao-literaria/sombra`, {
      inicio: 0, quantidade: 2, provedor: 'mock', modelo: 'mock-v1', adjudicar: false,
    });
    expect(resposta.status).toBe(200);
    const corpo = await json(resposta);
    expect(corpo.gravadas).toHaveLength(1);
    expect(corpo.sem_mudanca).toHaveLength(1);
    expect(corpo.gravadas[0]).toMatchObject({ status: 'pendente', texto_vigente_base: 'Ele falou.' });
    expect(db.prepare('SELECT texto_pt FROM frases WHERE id=?').get(fraseId)).toEqual({ texto_pt: 'Ele falou.' });
  });

  it('reúne blocos sucessivos no mesmo lote para revisar o capítulo inteiro', async () => {
    const primeiro = await json(await chamar('POST', `/api/capitulos/${capituloId}/revisao-literaria/sombra`, {
      inicio: 0, quantidade: 1, provedor: 'mock', modelo: 'mock-v1', adjudicar: false,
    }));
    const segundo = await json(await chamar('POST', `/api/capitulos/${capituloId}/revisao-literaria/sombra`, {
      inicio: 1, quantidade: 1, provedor: 'mock', modelo: 'mock-v1', adjudicar: false, lote_id: primeiro.lote_id,
    }));
    expect(segundo.lote_id).toBe(primeiro.lote_id);
    expect(db.prepare('SELECT COUNT(*) n FROM revisao_literaria_lotes').get()).toEqual({ n: 1 });
  });

  it('bloqueia proposta que perde número antes de chegar ao staging', async () => {
    vi.spyOn(provedorMock, 'revisarLiterariamente').mockResolvedValueOnce({
      propostas: [{ ordem: 0, texto_revisado: 'Ele falou.', justificativa: 'removeu', categorias: ['naturalidade'], confianca: 'alta' }],
      bruta: '{}',
      uso: { tokens_entrada: 1, tokens_saida: 1, tokens_cache_leitura: 0, tokens_cache_criacao: 0 },
    });
    db.prepare('UPDATE frases SET texto_pt=? WHERE id=?').run('Ele falou por 3 dias.', fraseId);
    const resposta = await chamar('POST', `/api/capitulos/${capituloId}/revisao-literaria/sombra`, {
      inicio: 0, quantidade: 1, provedor: 'mock', modelo: 'mock-v1', adjudicar: false,
    });
    const corpo = await json(resposta);
    expect(corpo.gravadas).toHaveLength(0);
    expect(corpo.bloqueadas[0].travas.some((t: any) => t.codigo === 'numero-perdido')).toBe(true);
    expect(db.prepare('SELECT COUNT(*) n FROM revisoes_literarias').get()).toEqual({ n: 0 });
  });

  it('usa um segundo modelo como adjudicador e bloqueia falha grave', async () => {
    reposConfig.definir(db, { provedor_qa: 'mock', modelo_qa: 'mock-juiz' });
    vi.spyOn(provedorMock, 'adjudicarRevisaoLiteraria').mockResolvedValueOnce({
      julgamentos: [{ ordem: 0, veredito: 'regressao', justificativa: 'Perdeu uma relação causal.', riscos: ['omissao'] }],
      bruta: '{}',
      uso: { tokens_entrada: 1, tokens_saida: 1, tokens_cache_leitura: 0, tokens_cache_criacao: 0 },
    });
    const resposta = await chamar('POST', `/api/capitulos/${capituloId}/revisao-literaria/sombra`, {
      inicio: 0, quantidade: 1, provedor: 'mock', modelo: 'mock-v1', adjudicar: true,
    });
    expect(resposta.status).toBe(200);
    const corpo = await json(resposta);
    expect(corpo.gravadas).toHaveLength(0);
    expect(corpo.bloqueadas[0].travas).toContainEqual(expect.objectContaining({ codigo: 'adjudicacao', gravidade: 'bloqueio' }));
  });

  it('limita o contexto a oito frases de cada lado e não dilui os alvos', async () => {
    db.prepare('DELETE FROM frases WHERE capitulo_id=?').run(capituloId);
    const inserir = db.prepare(`
      INSERT INTO frases (capitulo_id, ordem, paragrafo, texto_zh, texto_pt, status_traducao)
      VALUES (?, ?, ?, ?, ?, 'traduzida')
    `);
    for (let ordem = 0; ordem < 25; ordem += 1) inserir.run(capituloId, ordem, ordem, `中${ordem}`, `Texto ${ordem}.`);
    const revisar = vi.spyOn(provedorMock, 'revisarLiterariamente').mockImplementationOnce(async (_chave, req) => ({
      propostas: req.alvos.map((alvo) => ({ ordem: alvo.ordem, texto_revisado: null, justificativa: 'sem ganho', categorias: [], confianca: 'alta' })),
      bruta: '{}',
      uso: { tokens_entrada: 1, tokens_saida: 1, tokens_cache_leitura: 0, tokens_cache_criacao: 0 },
    }));
    const resposta = await chamar('POST', `/api/capitulos/${capituloId}/revisao-literaria/sombra`, {
      inicio: 10, quantidade: 2, provedor: 'mock', modelo: 'mock-v1', adjudicar: false,
    });
    expect(resposta.status).toBe(200);
    const req = revisar.mock.calls[0][1];
    expect(req.contextoAntes.map((f) => f.ordem)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(req.alvos.map((f) => f.ordem)).toEqual([10, 11]);
    expect(req.contextoDepois.map((f) => f.ordem)).toEqual([12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('no modo seletivo não chama IA nem cria lote quando a janela está limpa', async () => {
    const revisar = vi.spyOn(provedorMock, 'revisarLiterariamente');
    const resposta = await chamar('POST', `/api/capitulos/${capituloId}/revisao-literaria/sombra`, {
      inicio: 0, quantidade: 2, provedor: 'mock', modelo: 'mock-v1', adjudicar: false, seletiva: true,
    });
    expect(resposta.status).toBe(200);
    const corpo = await json(resposta);
    expect(corpo.detector).toMatchObject({ examinadas: 2, selecionadas: 0 });
    expect(revisar).not.toHaveBeenCalled();
    expect(db.prepare('SELECT COUNT(*) n FROM revisao_literaria_lotes').get()).toEqual({ n: 0 });
  });

  it('no modo seletivo envia ao staging apenas frases diagnosticadas', async () => {
    db.prepare('UPDATE frases SET texto_pt=? WHERE id=?').run('Ele fez um kowtow.', fraseId);
    const revisar = vi.spyOn(provedorMock, 'revisarLiterariamente');
    const resposta = await chamar('POST', `/api/capitulos/${capituloId}/revisao-literaria/sombra`, {
      inicio: 0, quantidade: 2, provedor: 'mock', modelo: 'mock-v1', adjudicar: false, seletiva: true,
    });
    expect(resposta.status).toBe(200);
    const corpo = await json(resposta);
    expect(corpo.detector).toMatchObject({ examinadas: 2, selecionadas: 1 });
    const req = revisar.mock.calls[0][1];
    expect(req.foco).toBe('seletiva');
    expect(req.alvos).toHaveLength(1);
    expect(req.alvos[0].diagnostico!.fenomenos).toContain('literalidade');
    expect(db.prepare('SELECT texto_pt FROM frases WHERE id=?').get(fraseId)).toEqual({ texto_pt: 'Ele fez um kowtow.' });
  });
});
