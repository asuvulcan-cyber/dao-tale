import type { Hono } from 'hono';
import { beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../app.js';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposObras } from '../db/repos.js';
import { lerZip, textosDoZip } from '../exportacao/leitorZip.js';

// Rotas de exportação da obra inteira (doc 12 §5). Zero IA: as frases já entram
// traduzidas no banco em memória.

process.env.DAO_TALE_DIR = '/tmp/dao-tale-teste';

let db: BancoDados;
let app: Hono;
let obraId: number;

/** Cria capítulo com as frases já traduzidas (dois parágrafos, um pendente). */
function capitulo(numero: number, status: 'finalizado' | 'traduzido' | 'rascunho' | 'parcial'): number {
  const cap = reposCapitulos.criar(
    db,
    obraId,
    { numero, titulo: `第${numero}章`, texto_origem: '原文。' },
    [
      { texto_zh: '他说：', paragrafo: 0 },
      { texto_zh: '「走。」', paragrafo: 0 },
      { texto_zh: '风停了。', paragrafo: 1 },
    ],
  );
  if (status !== 'rascunho') {
    db.prepare(
      `UPDATE frases SET texto_pt = CASE ordem WHEN 0 THEN 'Ele disse:' WHEN 1 THEN '«Vamos».' ELSE '' END,
         status_traducao = CASE ordem WHEN 2 THEN 'pendente' ELSE 'traduzida' END
       WHERE capitulo_id = ?`,
    ).run(cap.id);
    reposCapitulos.atualizar(db, cap.id, { status, titulo_pt: `Capítulo traduzido ${numero}` });
  }
  return cap.id;
}

beforeEach(() => {
  db = abrirBanco(':memory:');
  app = criarApp(db);
  obraId = reposObras.criar(db, {
    titulo: 'Dez Dias Até o Fim',
    titulo_original: '十日终焉',
    sinopse: 'Sinopse da obra.',
    tags: ['Horror'],
  }).id;
  reposObras.atualizar(db, obraId, { autor: '杀虫队队员' });
  capitulo(117, 'rascunho');
  capitulo(118, 'finalizado');
  capitulo(119, 'traduzido');
  capitulo(120, 'parcial');
});

describe('GET /obras/:id/epub', () => {
  it('entrega um .epub com os capítulos prontos e o nome pela faixa incluída', async () => {
    const r = await app.request(`/api/obras/${obraId}/epub`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/epub+zip');
    expect(r.headers.get('content-disposition')).toBe(
      'attachment; filename="dez-dias-ate-o-fim-118-119.epub"',
    );

    const epub = Buffer.from(await r.arrayBuffer());
    const nomes = lerZip(epub).map((e) => e.nome);
    expect(nomes[0]).toBe('mimetype');
    expect(nomes).toContain('OEBPS/cap-0118.xhtml');
    expect(nomes).toContain('OEBPS/cap-0119.xhtml');
    // 117 (rascunho) e 120 (parcial) ficam fora do escopo padrão.
    expect(nomes).not.toContain('OEBPS/cap-0117.xhtml');
    expect(nomes).not.toContain('OEBPS/cap-0120.xhtml');

    const arquivos = textosDoZip(epub);
    expect(arquivos.get('OEBPS/conteudo.opf')).toContain('<dc:creator id="autor">杀虫队队员</dc:creator>');
    expect(arquivos.get('OEBPS/cap-0118.xhtml')).toContain('<h1>Capítulo 118 — Capítulo traduzido 118</h1>');
    expect(arquivos.get('OEBPS/cap-0118.xhtml')).toContain('<p>Ele disse: «Vamos».</p>');
  });

  it('respeita status, intervalo e lista explícita', async () => {
    const nomesDe = async (consulta: string) => {
      const r = await app.request(`/api/obras/${obraId}/epub?${consulta}`);
      expect(r.status).toBe(200);
      return lerZip(Buffer.from(await r.arrayBuffer()))
        .map((e) => e.nome)
        .filter((n) => n.startsWith('OEBPS/cap-'));
    };
    expect(await nomesDe('ate=118')).toEqual(['OEBPS/cap-0118.xhtml']);
    expect(await nomesDe('numeros=119')).toEqual(['OEBPS/cap-0119.xhtml']);
    expect(await nomesDe('status=parcial')).toEqual(['OEBPS/cap-0120.xhtml']);
    expect(await nomesDe('status=rascunho,traduzido,finalizado')).toEqual([
      'OEBPS/cap-0117.xhtml',
      'OEBPS/cap-0118.xhtml',
      'OEBPS/cap-0119.xhtml',
    ]);
  });

  it('inclui a capa da obra quando existe', async () => {
    db.prepare('UPDATE obras SET capa = ?, capa_mime = ? WHERE id = ?').run(
      Buffer.from('bytes-da-capa'),
      'image/jpeg',
      obraId,
    );
    const epub = Buffer.from(await (await app.request(`/api/obras/${obraId}/epub`)).arrayBuffer());
    expect(lerZip(epub).map((e) => e.nome)).toContain('OEBPS/capa.jpg');
    expect(textosDoZip(epub).get('OEBPS/conteudo.opf')).toContain('properties="cover-image"');
  });

  it('explica o escopo vazio em vez de entregar livro em branco', async () => {
    const r = await app.request(`/api/obras/${obraId}/epub?de=500`);
    expect(r.status).toBe(400);
    const corpo = (await r.json()) as any;
    expect(corpo.erro.codigo).toBe('escopo-vazio');
    expect(corpo.erro.mensagem).toContain('4 capítulos');
    // A mensagem aponta o filtro que descartou tudo — aqui o intervalo, não o status.
    expect(corpo.erro.mensagem).toContain('intervalo: 500 a fim');
  });

  it('recusa escopo inválido e obra inexistente', async () => {
    const invalido = await app.request(`/api/obras/${obraId}/epub?status=quase`);
    expect(invalido.status).toBe(400);
    expect(((await invalido.json()) as any).erro.codigo).toBe('escopo-invalido');

    const semObra = await app.request('/api/obras/9999/epub');
    expect(semObra.status).toBe(404);
  });
});

describe('GET /obras/:id/markdown', () => {
  it('concatena a obra em PT com ficha e capítulos em ordem', async () => {
    const r = await app.request(`/api/obras/${obraId}/markdown`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    expect(r.headers.get('content-disposition')).toContain('dez-dias-ate-o-fim-118-119.md');
    const md = await r.text();
    expect(md).toContain('# Dez Dias Até o Fim');
    expect(md.indexOf('## Capítulo 118')).toBeLessThan(md.indexOf('## Capítulo 119'));
    expect(md).not.toContain('风停了。');
  });

  it('no formato bilíngue traz o chinês ao lado', async () => {
    const r = await app.request(`/api/obras/${obraId}/markdown?formato=bilingue&numeros=118`);
    const md = await r.text();
    expect(r.headers.get('content-disposition')).toContain('dez-dias-ate-o-fim-118.bilingue.md');
    expect(md).toContain('他说：「走。」');
    expect(md).toContain('*(pendente de tradução)*');
  });
});
