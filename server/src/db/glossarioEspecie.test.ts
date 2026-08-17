import { describe, expect, it } from 'vitest';
import type { Hono } from 'hono';
import { abrirBanco, type BancoDados } from './index.js';
import { reposObras, reposGlossario } from './repos.js';
import { criarApp } from '../app.js';

// Migração 026 (spec 2026-08-16): espécie do termo, nota de caixa, marca de
// ambiguidade e pertencimento. `especie` fica NULL até o revisor classificar —
// é o que deixa os 116 termos existentes sem heurística de backfill e sem
// travar a tela de quem já respondeu.

describe('glossário — espécie, nota_uso, ambiguo e termo_pai_id (migração 026)', () => {
  it('termo criado sem especie fica com null — nunca classificado, estado dos termos existentes', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra' });
    const entrada = reposGlossario.criar(db, obra.id, { termo_zh: '刀', termo_pt: 'sabre' });
    expect(entrada).not.toBe('duplicado');
    expect((entrada as any).especie).toBeNull();
  });

  it('especie: "lexical" é gravada e volta na leitura', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra' });
    const criada = reposGlossario.criar(db, obra.id, {
      termo_zh: '刀',
      termo_pt: 'sabre',
      especie: 'lexical',
    });
    expect(criada).not.toBe('duplicado');
    const id = (criada as any).id;
    const lida = reposGlossario.obter(db, id)!;
    expect(lida.especie).toBe('lexical');
  });

  it('atualizar muda a espécie sem tocar nos outros campos', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra' });
    const criada = reposGlossario.criar(db, obra.id, {
      termo_zh: '金鹏堡',
      termo_pt: 'Fortaleza do Peng Dourado',
      categoria: 'local',
      nota: 'sede da seita',
    });
    expect(criada).not.toBe('duplicado');
    const id = (criada as any).id;

    const atualizada = reposGlossario.atualizar(db, id, { especie: 'identidade' })!;

    expect(atualizada.especie).toBe('identidade');
    // Nada mais mudou — atualizar 1 campo não pode arrastar os outros.
    expect(atualizada.termo_zh).toBe('金鹏堡');
    expect(atualizada.termo_pt).toBe('Fortaleza do Peng Dourado');
    expect(atualizada.categoria).toBe('local');
    expect(atualizada.nota).toBe('sede da seita');
  });

  it('nota_uso e termo_pai_id sobrevivem ao ciclo criar → ler', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra' });
    const pai = reposGlossario.criar(db, obra.id, {
      termo_zh: '金鹏堡',
      termo_pt: 'Fortaleza do Peng Dourado',
      especie: 'identidade',
    });
    expect(pai).not.toBe('duplicado');
    const paiId = (pai as any).id;

    const filho = reposGlossario.criar(db, obra.id, {
      termo_zh: '西堡',
      termo_pt: 'Fortaleza Oeste',
      especie: 'identidade',
      nota_uso: 'Só maiúsculo quando é o nome do local, minúsculo em "o lado oeste".',
      termo_pai_id: paiId,
    });
    expect(filho).not.toBe('duplicado');
    const filhoId = (filho as any).id;

    const lido = reposGlossario.obter(db, filhoId)!;
    expect(lido.nota_uso).toBe('Só maiúsculo quando é o nome do local, minúsculo em "o lado oeste".');
    expect(lido.termo_pai_id).toBe(paiId);
  });

  // `termo_pai_id` é `REFERENCES glossario(id)` SEM `ON DELETE CASCADE` (e sem
  // `ON DELETE SET NULL`, ao contrário de `principal_id`). Com `foreign_keys =
  // ON` (ligado em abrirBanco), o comportamento REAL observado é que o SQLite
  // RECUSA o DELETE do pai enquanto existir filho apontando para ele — não
  // apaga em cascata, não solta o filho: lança SQLITE_CONSTRAINT_FOREIGNKEY, e
  // `reposGlossario.excluir` não captura esse erro, então ele sobe para quem
  // chamou. Registrado aqui como comportamento observado, não desejado — não é
  // desta task decidir se `excluir` deveria soltar `termo_pai_id` antes de
  // apagar (como já faz com `principal_id`).
  it('termo_pai_id: apagar o pai com filho pendurado é recusado pelo banco (comportamento observado, não desejado)', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra' });
    const pai = reposGlossario.criar(db, obra.id, { termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado' });
    expect(pai).not.toBe('duplicado');
    const paiId = (pai as any).id;
    const filho = reposGlossario.criar(db, obra.id, {
      termo_zh: '西堡',
      termo_pt: 'Fortaleza Oeste',
      termo_pai_id: paiId,
    });
    expect(filho).not.toBe('duplicado');
    const filhoId = (filho as any).id;

    expect(() => reposGlossario.excluir(db, paiId)).toThrowError(/FOREIGN KEY constraint failed/);

    // Nada foi apagado: o pai continua lá e o filho ainda aponta para ele.
    expect(reposGlossario.obter(db, paiId)).toBeDefined();
    expect(reposGlossario.obter(db, filhoId)!.termo_pai_id).toBe(paiId);
  });

  it('espécie inválida ("qualquer") é recusada pelo schema da rota com 400', async () => {
    const db: BancoDados = abrirBanco(':memory:');
    const app: Hono = criarApp(db);
    const obra = reposObras.criar(db, { titulo: 'Obra' });

    const r = await app.request(`/api/obras/${obra.id}/glossario`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ termo_zh: '刀', termo_pt: 'sabre', especie: 'qualquer' }),
    });

    expect(r.status).toBe(400);
  });
});
