import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposTermosSugeridos } from '../db/repos.js';
import { criarApp } from '../app.js';
// Namespace do módulo (não uma cópia importada) — só assim `vi.spyOn` intercepta
// a MESMA função que `curadoria.ts` chama, e prova a invocação em vez de só olhar
// o estado final. Mesmo padrão de recalcularConsistencia.test.ts.
import * as repos from '../db/repos.js';

// Smoke tests HTTP para as quatro rotas de glossário que ganharam recálculo
// automático e não tinham NENHUM teste que as exercitasse (achado da revisão
// final, item 2). Três delas ganharam lógica nova neste trabalho: o DELETE
// mudou a condição do 404 e passou a ler a entrada ANTES de apagar (senão não
// há como saber de qual obra ela era); PATCH e `aceitar` desreferenciam
// `obra_id` lido do banco. O typecheck cobre a FORMA dessas chamadas, não a
// ORDEM das leituras — só um teste HTTP de ponta a ponta pega uma inversão
// dessa ordem (ex.: excluir antes de ler, que quebraria o recálculo).

process.env.DAO_TALE_MOCK_LATENCIA = '0';
process.env.DAO_TALE_DIR = '/tmp/dao-tale-teste';

let db: BancoDados;
let app: Hono;

const json = async (r: Response) => (await r.json()) as any;
const post = (rota: string, corpo: unknown) =>
  app.request(rota, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });

async function criarObraComTermo(): Promise<{ obraId: number; entradaId: number }> {
  const obra = await json(await post('/api/obras', { titulo: 'Obra de teste' }));
  const entrada = await json(
    await post(`/api/obras/${obra.id}/glossario`, { termo_zh: '金鹏堡', termo_pt: 'Forte da Águia', categoria: 'lugar' }),
  );
  return { obraId: obra.id, entradaId: entrada.id };
}

beforeEach(() => {
  db = abrirBanco(':memory:');
  app = criarApp(db);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PATCH /glossario/:id', () => {
  it('200 no caminho feliz e dispara o recálculo uma vez, na obra dona da entrada', async () => {
    const { obraId, entradaId } = await criarObraComTermo();
    const spy = vi.spyOn(repos, 'recalcularConsistenciaDaObra');

    const r = await app.request(`/api/glossario/${entradaId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ termo_pt: 'Fortaleza da Águia Dourada' }),
    });

    expect(r.status).toBe(200);
    expect((await r.json()).termo_pt).toBe('Fortaleza da Águia Dourada');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(db, obraId);
  });

  it('id inexistente devolve 404 e não recalcula', async () => {
    const spy = vi.spyOn(repos, 'recalcularConsistenciaDaObra');
    const r = await app.request('/api/glossario/999999', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ termo_pt: 'Qualquer' }),
    });
    expect(r.status).toBe(404);
    expect(spy).toHaveBeenCalledTimes(0);
  });
});

describe('DELETE /glossario/:id', () => {
  it('200 no caminho feliz e dispara o recálculo uma vez, na obra dona da entrada', async () => {
    const { obraId, entradaId } = await criarObraComTermo();
    const spy = vi.spyOn(repos, 'recalcularConsistenciaDaObra');

    const r = await app.request(`/api/glossario/${entradaId}`, { method: 'DELETE' });

    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(db, obraId);
  });

  // A rota mudou a condição do 404 e passou a ler a entrada ANTES de excluir —
  // este teste é o que pegaria uma regressão que devolvesse 200 (ou 500) para
  // um id que nunca existiu.
  it('id inexistente ainda devolve 404, e não recalcula', async () => {
    const spy = vi.spyOn(repos, 'recalcularConsistenciaDaObra');
    const r = await app.request('/api/glossario/999999', { method: 'DELETE' });
    expect(r.status).toBe(404);
    expect(spy).toHaveBeenCalledTimes(0);
  });
});

describe('POST /glossario/:id/vincular', () => {
  it('200 no caminho feliz e dispara o recálculo uma vez, na obra dona da entrada', async () => {
    const { obraId, entradaId } = await criarObraComTermo();
    const variante = await json(
      await post(`/api/obras/${obraId}/glossario`, { termo_zh: '飞鹰堡', termo_pt: 'Forte da Águia', categoria: 'lugar' }),
    );
    const spy = vi.spyOn(repos, 'recalcularConsistenciaDaObra');

    const r = await app.request(`/api/glossario/${variante.id}/vincular`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ principal_id: entradaId }),
    });

    expect(r.status).toBe(200);
    expect((await r.json()).principal_id).toBe(entradaId);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(db, obraId);
  });

  it('id inexistente devolve 404 e não recalcula', async () => {
    const spy = vi.spyOn(repos, 'recalcularConsistenciaDaObra');
    const r = await app.request('/api/glossario/999999/vincular', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ principal_id: null }),
    });
    expect(r.status).toBe(404);
    expect(spy).toHaveBeenCalledTimes(0);
  });
});

describe('POST /termos-sugeridos/:id/aceitar', () => {
  it('200 no caminho feliz e dispara o recálculo uma vez, na obra dona da sugestão', async () => {
    const obra = await json(await post('/api/obras', { titulo: 'Obra com sugestão' }));
    const cap = await json(
      await post(`/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '金鹏堡很大。' }),
    );
    reposTermosSugeridos.registrar(db, obra.id, cap.capitulo.id, [
      { termo_zh: '金鹏堡', termo_pt: 'Forte da Águia' },
    ]);
    const sugestao = reposTermosSugeridos.listar(db, obra.id, 'pendente')[0];
    const spy = vi.spyOn(repos, 'recalcularConsistenciaDaObra');

    const r = await app.request(`/api/termos-sugeridos/${sugestao.id}/aceitar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(r.status).toBe(200);
    expect((await r.json()).termo_zh).toBe('金鹏堡');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(db, obra.id);
  });

  it('id inexistente devolve 404 e não recalcula', async () => {
    const spy = vi.spyOn(repos, 'recalcularConsistenciaDaObra');
    const r = await app.request('/api/termos-sugeridos/999999/aceitar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(r.status).toBe(404);
    expect(spy).toHaveBeenCalledTimes(0);
  });
});
