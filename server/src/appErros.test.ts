import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarApp } from './app.js';
import { abrirBanco, type BancoDados } from './db/index.js';

let db: BancoDados;

beforeEach(() => {
  delete process.env.DAO_TALE_MODO;
  delete process.env.DAO_TALE_HOST_PUBLICO;
  db = abrirBanco(':memory:');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  if (db.open) db.close();
  delete process.env.DAO_TALE_MODO;
  delete process.env.DAO_TALE_HOST_PUBLICO;
  vi.restoreAllMocks();
});

describe('erros HTTP globais', () => {
  it('JSON malformado é payload inválido, não erro interno', async () => {
    const resposta = await criarApp(db).request('/api/obras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"titulo":',
    });

    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toEqual({
      erro: {
        codigo: 'payload-invalido',
        mensagem: 'O corpo da requisição não contém JSON válido.',
      },
    });
  });

  it('mantém o diagnóstico do erro no modo local', async () => {
    const app = criarApp(db);
    db.close();

    const resposta = await app.request('/api/publico/obras');
    const corpo = (await resposta.json()) as { erro: { mensagem: string } };

    expect(resposta.status).toBe(500);
    expect(corpo.erro.mensagem).toMatch(/database connection is not open/i);
  });

  it('não expõe o diagnóstico interno no modo hospedado', async () => {
    process.env.DAO_TALE_MODO = 'hospedado';
    process.env.DAO_TALE_HOST_PUBLICO = 'tale.exemplo.com';
    const app = criarApp(db);
    db.close();

    const resposta = await app.request('https://tale.exemplo.com/api/publico/obras');

    expect(resposta.status).toBe(500);
    expect(await resposta.json()).toEqual({
      erro: { codigo: 'interno', mensagem: 'Ocorreu um erro interno.' },
    });
  });
});
