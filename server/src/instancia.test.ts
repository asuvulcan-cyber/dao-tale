import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { adquirirLock, caminhoLock, lerLock } from './instancia.js';

// Instância única por pasta (doc 10 §2), isolada numa pasta temporária própria.

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-lock-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('lockfile de instância', () => {
  it('adquire, grava e libera o lock', () => {
    const r = adquirirLock(8317, dir);
    expect(r.ok).toBe(true);
    const lock = lerLock(caminhoLock(dir));
    expect(lock?.pid).toBe(process.pid);
    expect(lock?.porta).toBe(8317);

    if (r.ok) r.liberar();
    expect(fs.existsSync(caminhoLock(dir))).toBe(false);
  });

  it('recusa quando um processo VIVO já detém o lock', () => {
    // Lock de outro pid vivo: o próprio processo pai do node (ppid) serve.
    const donoVivo = { pid: process.ppid, porta: 8399, iniciado_em: new Date().toISOString() };
    fs.writeFileSync(caminhoLock(dir), JSON.stringify(donoVivo));

    const r = adquirirLock(8317, dir);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.dono.pid).toBe(process.ppid);
  });

  it('sobrescreve um lock órfão (dono morto)', () => {
    // pid altíssimo e improvável de existir → tratado como órfão.
    const orfao = { pid: 2 ** 30, porta: 8412, iniciado_em: '2026-01-01T00:00:00.000Z' };
    fs.writeFileSync(caminhoLock(dir), JSON.stringify(orfao));

    const r = adquirirLock(8317, dir);
    expect(r.ok).toBe(true);
    expect(lerLock(caminhoLock(dir))?.pid).toBe(process.pid);
    if (r.ok) r.liberar();
  });

  it('lock corrompido é tratado como ausente', () => {
    fs.writeFileSync(caminhoLock(dir), 'isto não é json');
    expect(lerLock(caminhoLock(dir))).toBeNull();
    const r = adquirirLock(8317, dir);
    expect(r.ok).toBe(true);
    if (r.ok) r.liberar();
  });
});
