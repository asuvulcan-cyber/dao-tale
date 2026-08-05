import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { criarApp } from '../app.js';
import { definirSenha } from '../auth/senha.js';
import { limparCacheSegredo } from '../auth/sessao.js';

// Vitrine pública (doc 14). Estes testes são a trava de verdade: a vitrine é a
// ÚNICA superfície do app aberta à internet, e o que ela não devolve aqui é o
// que ninguém consegue arrancar dela lá.
//
// Toda requisição abaixo vai SEM cookie, de propósito.

const SENHA = 'a-senha-longa-do-dono';
const BASE = 'https://tale.exemplo.com';

let dir: string;
let db: BancoDados;
let app: Hono;

const pedir = (rota: string) => app.request(`${BASE}${rota}`);

/** Uma obra com um capítulo em cada status que interessa. Devolve os ids. */
function semear(opcoes: { publica: boolean }): { obraId: number; privadaId: number } {
  const obraId = Number(
    db.prepare("INSERT INTO obras (titulo, titulo_original, autor, sinopse, tags) VALUES (?,?,?,?,?)")
      .run('A Torre de Bronze', '青铜塔', 'Autor Exemplo', 'Sinopse curta.', '["wuxia"]').lastInsertRowid,
  );
  db.prepare('UPDATE obras SET publica = ? WHERE id = ?').run(opcoes.publica ? 1 : 0, obraId);

  // Capítulo publicável.
  const cap1 = Number(
    db.prepare("INSERT INTO capitulos (obra_id, numero, titulo, titulo_pt, status, texto_origem) VALUES (?,?,?,?,?,?)")
      .run(obraId, 1, '第一章', 'A porta de ferro', 'finalizado', '铁门。').lastInsertRowid,
  );
  db.prepare('INSERT INTO frases (capitulo_id, ordem, paragrafo, texto_zh, texto_pt) VALUES (?,?,?,?,?)')
    .run(cap1, 1, 1, '铁门在风里响。', 'O portão de ferro rangeu ao vento.');
  db.prepare('INSERT INTO frases (capitulo_id, ordem, paragrafo, texto_zh, texto_pt) VALUES (?,?,?,?,?)')
    .run(cap1, 2, 2, '没有人来。', 'Ninguém veio.');

  // Capítulo AINDA não finalizado: existe, tem tradução, e não pode sair.
  const cap2 = Number(
    db.prepare("INSERT INTO capitulos (obra_id, numero, titulo, titulo_pt, status, texto_origem) VALUES (?,?,?,?,?,?)")
      .run(obraId, 2, '第二章', 'O segredo inédito', 'revisado', '秘密。').lastInsertRowid,
  );
  db.prepare('INSERT INTO frases (capitulo_id, ordem, paragrafo, texto_zh, texto_pt) VALUES (?,?,?,?,?)')
    .run(cap2, 1, 1, '秘密还在。', 'O segredo continuava ali.');

  // Uma segunda obra, privada, também com capítulo finalizado.
  const privadaId = Number(
    db.prepare("INSERT INTO obras (titulo, tags) VALUES (?, '[]')").run('Obra Reservada').lastInsertRowid,
  );
  const cap3 = Number(
    db.prepare("INSERT INTO capitulos (obra_id, numero, titulo_pt, status, texto_origem) VALUES (?,?,?,?,?)")
      .run(privadaId, 1, 'Capítulo reservado', 'finalizado', '私。').lastInsertRowid,
  );
  db.prepare('INSERT INTO frases (capitulo_id, ordem, paragrafo, texto_zh, texto_pt) VALUES (?,?,?,?,?)')
    .run(cap3, 1, 1, '私密。', 'Texto que não pode vazar.');

  return { obraId, privadaId };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-publico-'));
  process.env.DAO_TALE_DIR = dir;
  process.env.DAO_TALE_MODO = 'hospedado';
  process.env.DAO_TALE_HOST_PUBLICO = 'tale.exemplo.com';
  limparCacheSegredo();
  definirSenha(SENHA);
  db = abrirBanco(':memory:');
  app = criarApp(db, { limiteLogin: { atrasoPorFalhaMs: 0 } });
});

afterEach(() => {
  delete process.env.DAO_TALE_MODO;
  delete process.env.DAO_TALE_HOST_PUBLICO;
  delete process.env.DAO_TALE_DIR;
  limparCacheSegredo();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('o padrão é privado', () => {
  it('obra nova nasce fora da vitrine', async () => {
    semear({ publica: false });
    const r = await pedir('/api/publico/obras');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([]);
  });

  it('obra privada responde 404 — igual a uma que não existe, sem confirmar que está lá', async () => {
    const { obraId } = semear({ publica: false });
    const direta = await pedir(`/api/publico/obras/${obraId}`);
    const inexistente = await pedir('/api/publico/obras/99999');
    expect(direta.status).toBe(404);
    expect(await direta.json()).toEqual(await inexistente.json());
  });

  it('o sumário e o texto de obra privada também são 404', async () => {
    const { obraId } = semear({ publica: false });
    expect((await pedir(`/api/publico/obras/${obraId}/capitulos`)).status).toBe(404);
    expect((await pedir(`/api/publico/obras/${obraId}/capitulos/1`)).status).toBe(404);
  });
});

describe('obra publicada', () => {
  it('aparece na estante, com a contagem do que está publicado', async () => {
    semear({ publica: true });
    const lista = (await (await pedir('/api/publico/obras')).json()) as any[];
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ titulo: 'A Torre de Bronze', capitulos_publicos: 1 });
  });

  it('a estante não expõe uma obra privada junto', async () => {
    semear({ publica: true });
    const lista = (await (await pedir('/api/publico/obras')).json()) as any[];
    expect(lista.map((o) => o.titulo)).not.toContain('Obra Reservada');
  });

  it('entrega o texto do capítulo finalizado, em parágrafos prontos', async () => {
    const { obraId } = semear({ publica: true });
    const cap = (await (await pedir(`/api/publico/obras/${obraId}/capitulos/1`)).json()) as any;
    expect(cap.numero).toBe(1);
    expect(cap.titulo).toBe('A porta de ferro');
    expect(cap.paragrafos).toEqual(['O portão de ferro rangeu ao vento.', 'Ninguém veio.']);
  });

  it('NÃO entrega o capítulo que ainda não foi finalizado', async () => {
    const { obraId } = semear({ publica: true });
    const sumario = (await (await pedir(`/api/publico/obras/${obraId}/capitulos`)).json()) as any[];
    expect(sumario.map((c) => c.numero)).toEqual([1]);

    const r = await pedir(`/api/publico/obras/${obraId}/capitulos/2`);
    expect(r.status).toBe(404);
    expect(JSON.stringify(await r.json())).not.toContain('segredo');
  });
});

describe('o que a vitrine nunca devolve', () => {
  it('nada do maquinário da tradução vem junto da obra', async () => {
    const { obraId } = semear({ publica: true });
    const obra = (await (await pedir(`/api/publico/obras/${obraId}`)).json()) as any;
    for (const campo of [
      'provedor_padrao',
      'modelo_padrao',
      'temperatura',
      'thinking',
      'fase_traducao',
      'publica',
      'criado_em',
      'atualizado_em',
    ]) {
      expect(obra).not.toHaveProperty(campo);
    }
  });

  it('o capítulo sai sem o chinês, sem ids e sem status', async () => {
    const { obraId } = semear({ publica: true });
    const bruto = await (await pedir(`/api/publico/obras/${obraId}/capitulos/1`)).text();
    expect(bruto).not.toContain('铁门');
    expect(bruto).not.toContain('texto_zh');
    expect(bruto).not.toContain('capitulo_id');
    expect(bruto).not.toContain('status');
  });

  it('o sumário não conta quantos capítulos inéditos existem', async () => {
    const { obraId } = semear({ publica: true });
    const bruto = await (await pedir(`/api/publico/obras/${obraId}/capitulos`)).text();
    expect(bruto).not.toContain('frases_total');
    expect(bruto).not.toContain('qa_pendentes');
    expect(bruto).not.toContain('status');
  });
});

describe('a vitrine não afrouxa a porta de trás', () => {
  const fechadas = [
    '/api/obras',
    '/api/configuracoes',
    '/api/provedores',
    '/api/saude',
    '/api/prompt-padrao',
  ];

  for (const rota of fechadas) {
    it(`${rota} continua exigindo sessão`, async () => {
      semear({ publica: true });
      const r = await pedir(rota);
      expect(r.status).toBe(401);
    });
  }

  it('o glossário da obra PUBLICADA continua fechado', async () => {
    const { obraId } = semear({ publica: true });
    expect((await pedir(`/api/obras/${obraId}/glossario`)).status).toBe(401);
  });

  it('a exportação da obra publicada continua fechada — vitrine é leitura, não download', async () => {
    const { obraId } = semear({ publica: true });
    expect((await pedir(`/api/obras/${obraId}/exportar`)).status).toBe(401);
    expect((await pedir(`/api/obras/${obraId}/livro.epub`)).status).toBe(401);
  });

  it('não existe rota pública que escreva', async () => {
    const { obraId } = semear({ publica: true });
    for (const metodo of ['POST', 'PUT', 'DELETE']) {
      const r = await app.request(`${BASE}/api/publico/obras/${obraId}`, {
        method: metodo,
        headers: { origin: BASE, 'Content-Type': 'application/json' },
        body: '{}',
      });
      // 404 (rota inexistente para o método) ou 401 — nunca 2xx.
      expect(r.status).toBeGreaterThanOrEqual(400);
    }
  });

  it('publicar exige sessão: um estranho não consegue publicar a obra dele mesmo', async () => {
    const { privadaId } = semear({ publica: true });
    const r = await app.request(`${BASE}/api/obras/${privadaId}`, {
      method: 'PUT',
      headers: { origin: BASE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publica: true }),
    });
    expect(r.status).toBe(401);
    const conferir = db.prepare('SELECT publica FROM obras WHERE id = ?').get(privadaId) as { publica: number };
    expect(conferir.publica).toBe(0);
  });
});

describe('fora do índice dos buscadores', () => {
  it('robots.txt pede para não varrer', async () => {
    const r = await pedir('/robots.txt');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('Disallow: /');
  });

  it('toda resposta manda não indexar — inclusive a página e a vitrine', async () => {
    const { obraId } = semear({ publica: true });
    for (const rota of ['/', '/api/publico/obras', `/api/publico/obras/${obraId}/capitulos/1`]) {
      const r = await pedir(rota);
      expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    }
  });
});

describe('regras de aparecer na estante', () => {
  it('obra pública SEM capítulo finalizado não aparece nem abre', async () => {
    const obraId = Number(
      db.prepare("INSERT INTO obras (titulo, tags, publica) VALUES ('Só promessa', '[]', 1)").run().lastInsertRowid,
    );
    db.prepare("INSERT INTO capitulos (obra_id, numero, status, texto_origem) VALUES (?,1,'traduzido','x')").run(obraId);

    expect(await (await pedir('/api/publico/obras')).json()).toEqual([]);
    expect((await pedir(`/api/publico/obras/${obraId}`)).status).toBe(404);
  });

  it('despublicar tira do ar na hora', async () => {
    const { obraId } = semear({ publica: true });
    expect((await (await pedir('/api/publico/obras')).json()) as any[]).toHaveLength(1);

    db.prepare('UPDATE obras SET publica = 0 WHERE id = ?').run(obraId);
    expect(await (await pedir('/api/publico/obras')).json()).toEqual([]);
    expect((await pedir(`/api/publico/obras/${obraId}/capitulos/1`)).status).toBe(404);
  });

  it('id malformado não vira erro 500', async () => {
    semear({ publica: true });
    for (const id of ['abc', '-1', '0', '1e9999']) {
      const r = await pedir(`/api/publico/obras/${id}`);
      expect(r.status).toBe(404);
    }
  });
});
