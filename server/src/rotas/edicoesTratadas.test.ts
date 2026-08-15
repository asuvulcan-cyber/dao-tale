import { beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposObras } from '../db/repos.js';
import { criarApp } from '../app.js';

// O canal do banco de testes já consumia sozinho (`recorrencias` filtra por
// status); o das edições manuais nasceu sem equivalente, então as mesmas
// candidatas voltavam para sempre — 87 na obra real, contra uma amostra de 15
// por chamada PAGA. Estes testes travam as duas pontas do consumo: a aceitação
// de um refinamento e a limpeza do acúmulo herdado.

process.env.DAO_TALE_MOCK_LATENCIA = '0';
process.env.DAO_TALE_DIR = '/tmp/dao-tale-teste-edicoes-tratadas';

let db: BancoDados;
let app: Hono;
let obraId: number;
let frases: number[];

/** Reescritas à mão de um jeito que não casa tipografia, glossário, tema nem
 *  scanner de camada — ou seja, caem em `diretriz`, que é a rota que alimenta o
 *  refinamento pago. */
const EDICOES: [ia: string, voce: string][] = [
  ['o ancião elevou a espada lentamente', 'o velho ergueu a lâmina devagar'],
  ['ela sorriu sem entusiasmo', 'ela riu sem vontade'],
  ['a brisa cessou subitamente', 'o vento parou de repente'],
];

beforeEach(() => {
  db = abrirBanco(':memory:');
  app = criarApp(db);
  obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
  const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲。乙。丙。' }, [
    { texto_zh: '甲。', paragrafo: 0 },
    { texto_zh: '乙。', paragrafo: 0 },
    { texto_zh: '丙。', paragrafo: 0 },
  ]);
  frases = db
    .prepare('SELECT id FROM frases WHERE capitulo_id = ? ORDER BY ordem')
    .all(cap.id)
    .map((l) => (l as { id: number }).id);

  const editar = db.prepare(
    `UPDATE frases SET texto_pt = ?, texto_pt_original_ia = ?, editado_manualmente = 1,
            origem_edicao = NULL, status_traducao = 'traduzida' WHERE id = ?`,
  );
  EDICOES.forEach(([ia, voce], i) => editar.run(voce, ia, frases[i]));
});

async function candidatas(): Promise<{ frase_id: number }[]> {
  const todas = (await (await app.request(`/api/obras/${obraId}/edicoes-manuais`)).json()) as {
    rota: string;
    frase_id: number;
  }[];
  return todas.filter((e) => e.rota === 'diretriz');
}

describe('consumo das edições manuais', () => {
  it('o cenário começa com as três como candidatas a diretriz', async () => {
    expect(await candidatas()).toHaveLength(3);
  });

  it('tratar-candidatas zera o acúmulo de uma vez', async () => {
    const r = await app.request(`/api/obras/${obraId}/edicoes-manuais/tratar-candidatas`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ tratadas: 3 });
    expect(await candidatas()).toHaveLength(0);
  });

  it('reescrever a frase depois a devolve à lista', async () => {
    // A marca vale para AQUELE texto: um sinalizador booleano silenciaria a frase
    // para sempre, e a lição nova sobre ela nunca mais seria vista.
    await app.request(`/api/obras/${obraId}/edicoes-manuais/tratar-candidatas`, { method: 'POST' });
    expect(await candidatas()).toHaveLength(0);

    db.prepare('UPDATE frases SET texto_pt = ? WHERE id = ?').run('o velho ergueu a lâmina bem devagar', frases[0]);
    expect(await candidatas()).toHaveLength(1);
  });

  it('obra inexistente devolve 404 em vez de marcar coisa nenhuma', async () => {
    const r = await app.request('/api/obras/9999/edicoes-manuais/tratar-candidatas', { method: 'POST' });
    expect(r.status).toBe(404);
    expect(await candidatas()).toHaveLength(3);
  });

  it('criar versão com edicoes_tratadas consome só as informadas', async () => {
    const r = await app.request(`/api/obras/${obraId}/prompts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ versao: 'v2.0', conteudo: 'regra nova', edicoes_tratadas: [frases[0]] }),
    });
    expect(r.status).toBe(201);
    expect((await r.json()).edicoes_tratadas).toBe(1);
    const restantes = await candidatas();
    expect(restantes).toHaveLength(2);
    expect(restantes.map((e) => e.frase_id)).not.toContain(frases[0]);
  });

  it('versão escrita à mão não consome nada', async () => {
    // `edicoes_tratadas` ausente é o caso de quem só editou o delta. Consumir
    // aqui apagaria sinal que ninguém transformou em regra.
    const r = await app.request(`/api/obras/${obraId}/prompts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ versao: 'v2.0', conteudo: 'escrita à mão' }),
    });
    expect(r.status).toBe(201);
    expect((await r.json()).edicoes_tratadas).toBe(0);
    expect(await candidatas()).toHaveLength(3);
  });

  it('versão duplicada não consome — a criação falhou', async () => {
    // Marcar ANTES de `criar` deixaria o sinal consumido numa versão que não
    // existe. O 409 é o caminho em que isso apareceria.
    await app.request(`/api/obras/${obraId}/prompts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ versao: 'v2.0', conteudo: 'primeira' }),
    });
    const r = await app.request(`/api/obras/${obraId}/prompts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ versao: 'v2.0', conteudo: 'colide', edicoes_tratadas: [frases[0]] }),
    });
    expect(r.status).toBe(409);
    expect(await candidatas()).toHaveLength(3);
  });
});
