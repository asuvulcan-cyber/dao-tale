import { beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposFrases, reposObras, reposTestes } from '../db/repos.js';
import { criarApp } from '../app.js';
import { montarTurnos, TETO_TURNOS } from './frases.js';

// Mesmo padrão do app.test.ts: latência zero para o provedor mock não deixar
// os testes de rota lentos.
process.env.DAO_TALE_MOCK_LATENCIA = '0';

let db: BancoDados;
let obraId: number;
let fraseId: number;

beforeEach(() => {
  db = abrirBanco(':memory:');
  obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
  const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲说。' }, [
    { texto_zh: '甲说。', paragrafo: 0 },
  ]);
  fraseId = reposFrases.listarPorCapitulo(db, cap.id)[0].id;
});

function caso(pergunta: string, pai: number | null) {
  return reposTestes.criar(db, {
    frase_id: fraseId,
    obra_id: obraId,
    caso_pai_id: pai,
    trecho_zh: '甲',
    pergunta,
    veredito: 'incorreto',
    resposta: `resposta de ${pergunta}`,
    justificativa: '',
    secao_regra: null,
    correcao_proposta: null,
    trecho_pt_errado: null,
    trecho_pt_corrigido: null,
    motivo_rejeicao: null,
    provedor: 'mock',
    modelo: 'mock-v1',
    resposta_bruta: '{}',
  });
}

describe('fio de réplicas', () => {
  it('devolve a cadeia da raiz até a folha', () => {
    const a = caso('primeira', null);
    const b = caso('segunda', a.id);
    const c = caso('terceira', b.id);
    expect(reposTestes.fio(db, c.id).map((x) => x.pergunta)).toEqual(['primeira', 'segunda', 'terceira']);
  });

  it('sabe quem tem filho', () => {
    const a = caso('primeira', null);
    const b = caso('segunda', a.id);
    expect(reposTestes.temFilho(db, a.id)).toBe(true);
    expect(reposTestes.temFilho(db, b.id)).toBe(false);
  });

  it('apagar a raiz leva o fio inteiro (ON DELETE CASCADE)', () => {
    const a = caso('primeira', null);
    const b = caso('segunda', a.id);
    db.prepare('DELETE FROM banco_testes WHERE id = ?').run(a.id);
    expect(reposTestes.obter(db, b.id)).toBeUndefined();
  });
});

describe('turnos enviados ao modelo', () => {
  it('converte o fio em turnos, do mais antigo ao mais recente', () => {
    const a = caso('primeira', null);
    const b = caso('segunda', a.id);
    const turnos = montarTurnos(reposTestes.fio(db, b.id));
    expect(turnos.map((t) => t.pergunta)).toEqual(['primeira', 'segunda']);
    expect(turnos[0].resposta).toBe('resposta de primeira');
    expect(turnos[0].recusado).toBe(false);
  });

  it('acima do teto mantém o primeiro turno e os mais recentes', () => {
    let pai: number | null = null;
    for (let i = 1; i <= 9; i++) pai = caso(`p${i}`, pai).id;
    const turnos = montarTurnos(reposTestes.fio(db, pai!));
    expect(turnos).toHaveLength(TETO_TURNOS);
    // O primeiro fixa a dúvida; os demais são os mais recentes.
    expect(turnos[0].pergunta).toBe('p1');
    expect(turnos.at(-1)!.pergunta).toBe('p9');
  });

  it('leva a justificativa do banco até o turno', () => {
    // Encanamento CasoTeste.justificativa -> TurnoRevisao.justificativa. A mutação
    // `justificativa: ''` em montarTurnos passava pela suíte inteira: os testes de
    // prompts.test.ts constroem o turno à mão e os daqui usavam justificativa vazia.
    const c = reposTestes.criar(db, {
      frase_id: fraseId,
      obra_id: obraId,
      caso_pai_id: null,
      trecho_zh: '甲',
      pergunta: 'p',
      veredito: 'incorreto',
      resposta: 'trata do seu motivo',
      justificativa: 'Conforme a regra 5-mais-que-perfeito.',
      secao_regra: '5-mais-que-perfeito',
      correcao_proposta: null,
      trecho_pt_errado: null,
      trecho_pt_corrigido: null,
      motivo_rejeicao: null,
      provedor: 'mock',
      modelo: 'mock-v1',
      resposta_bruta: '{}',
    });
    const turnos = montarTurnos(reposTestes.fio(db, c.id));
    expect(turnos[0].justificativa).toBe('Conforme a regra 5-mais-que-perfeito.');
    expect(turnos[0].resposta).toBe('trata do seu motivo');
  });
});

// Achado da revisão: a validação de caso_pai_id na rota não tinha teste — um
// refactor que trocasse `pai.frase_id !== frase.id` por uma checagem mais fraca
// (ex.: só `obra_id`) deixaria a discussão de UMA frase vazar para outra sem
// que a suíte acusasse nada. É exatamente a costura que existe para não repetir
// os vereditos contraditórios dos casos #23/#24.
describe('POST /frases/:id/revisar com caso_pai_id', () => {
  let app: Hono;

  const chamar = (metodo: string, rota: string, corpo?: unknown) =>
    app.request(rota, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  const json = async (resposta: Response) => (await resposta.json()) as any;

  beforeEach(() => {
    app = criarApp(db);
  });

  it('recusa pai inexistente', async () => {
    const resposta = await chamar('POST', `/api/frases/${fraseId}/revisar`, {
      pergunta: 'Isso está correto?',
      provedor: 'mock',
      caso_pai_id: 999999,
    });
    expect(resposta.status).toBe(400);
    expect((await json(resposta)).erro.codigo).toBe('pai-invalido');
  });

  it('recusa pai de OUTRA frase — a discussão de uma frase não pode vazar para outra', async () => {
    const cap2 = reposCapitulos.criar(db, obraId, { numero: 2, texto_origem: '乙说。' }, [
      { texto_zh: '乙说。', paragrafo: 0 },
    ]);
    const fraseId2 = reposFrases.listarPorCapitulo(db, cap2.id)[0].id;
    const paiDeOutraFrase = reposTestes.criar(db, {
      frase_id: fraseId2,
      obra_id: obraId,
      caso_pai_id: null,
      trecho_zh: '乙',
      pergunta: 'pergunta sobre outra frase',
      veredito: 'incorreto',
      resposta: 'resposta',
      justificativa: '',
      secao_regra: null,
      correcao_proposta: null,
      trecho_pt_errado: null,
      trecho_pt_corrigido: null,
      motivo_rejeicao: null,
      provedor: 'mock',
      modelo: 'mock-v1',
      resposta_bruta: '{}',
    });
    const resposta = await chamar('POST', `/api/frases/${fraseId}/revisar`, {
      pergunta: 'Isso está correto?',
      provedor: 'mock',
      caso_pai_id: paiDeOutraFrase.id,
    });
    expect(resposta.status).toBe(400);
    expect((await json(resposta)).erro.codigo).toBe('pai-invalido');
  });

  it('recusa pai que já tem filho — replicar no meio do fio criaria um ramo morto', async () => {
    const a = caso('primeira', null);
    caso('segunda', a.id);
    const resposta = await chamar('POST', `/api/frases/${fraseId}/revisar`, {
      pergunta: 'Outra pergunta',
      provedor: 'mock',
      caso_pai_id: a.id,
    });
    expect(resposta.status).toBe(400);
    expect((await json(resposta)).erro.codigo).toBe('pai-invalido');
  });

  it('caminho feliz: replicar num pai válido responde 200 e o caso criado aponta para o pai', async () => {
    const a = caso('primeira', null);
    const resposta = await chamar('POST', `/api/frases/${fraseId}/revisar`, {
      pergunta: 'Isso está errado?',
      provedor: 'mock',
      caso_pai_id: a.id,
    });
    expect(resposta.status).toBe(200);
    const corpo = await json(resposta);
    expect(corpo.caso.caso_pai_id).toBe(a.id);
  });
});
