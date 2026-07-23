import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  fazerBackup,
  fazerBackupSincrono,
  listarBackups,
  restaurarDe,
  rotacionar,
  verificarIntegridade,
} from './backup.js';

// Backups de arquivo, isolados numa pasta temporária própria — nunca tocam o
// diretório de dados real nem o DAO_TALE_DIR dos outros testes.

let raiz: string;

function bancoComDados(caminho: string, linhas: number): Database.Database {
  const db = new Database(caminho);
  db.pragma('journal_mode = WAL');
  db.exec('CREATE TABLE frases (id INTEGER PRIMARY KEY, texto TEXT NOT NULL)');
  const ins = db.prepare('INSERT INTO frases (texto) VALUES (?)');
  const tx = db.transaction((n: number) => {
    for (let i = 0; i < n; i++) ins.run(`frase ${i}`);
  });
  tx(linhas);
  return db;
}

beforeEach(() => {
  raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-backup-'));
});
afterEach(() => {
  fs.rmSync(raiz, { recursive: true, force: true });
});

describe('backup e integridade', () => {
  it('fazerBackup gera um .db íntegro e legível', async () => {
    const db = bancoComDados(path.join(raiz, 'app.db'), 5);
    const destino = await fazerBackup(db, 'teste', { dir: raiz });
    db.close();

    expect(fs.existsSync(destino)).toBe(true);
    const copia = new Database(destino, { readonly: true });
    expect(copia.pragma('integrity_check', { simple: true })).toBe('ok');
    expect((copia.prepare('SELECT COUNT(*) n FROM frases').get() as { n: number }).n).toBe(5);
    copia.close();
  });

  it('fazerBackupSincrono (serialize) gera um .db íntegro', () => {
    const db = bancoComDados(path.join(raiz, 'app.db'), 3);
    const destino = fazerBackupSincrono(db, 'pre-migracao', { dir: raiz });
    db.close();

    const copia = new Database(destino, { readonly: true });
    expect(copia.pragma('integrity_check', { simple: true })).toBe('ok');
    expect((copia.prepare('SELECT COUNT(*) n FROM frases').get() as { n: number }).n).toBe(3);
    copia.close();
  });

  it('rotacionar mantém só os N mais novos', async () => {
    const db = bancoComDados(path.join(raiz, 'app.db'), 1);
    const dir = path.join(raiz, 'backups');
    fs.mkdirSync(dir);
    // Nomes com carimbo crescente garantido (o carimbo tem resolução de ms).
    for (let i = 0; i < 5; i++) {
      const nome = `dao-tale-2026-07-23T00-00-0${i}-000Z-teste.db`;
      fs.writeFileSync(path.join(dir, nome), db.serialize());
    }
    db.close();
    rotacionar(dir, 3);
    const restantes = fs.readdirSync(dir).sort();
    expect(restantes).toEqual([
      'dao-tale-2026-07-23T00-00-02-000Z-teste.db',
      'dao-tale-2026-07-23T00-00-03-000Z-teste.db',
      'dao-tale-2026-07-23T00-00-04-000Z-teste.db',
    ]);
  });

  it('verificarIntegridade devolve ok num banco saudável', () => {
    const db = bancoComDados(path.join(raiz, 'app.db'), 2);
    expect(verificarIntegridade(db)).toBe('ok');
    db.close();
  });

  it('listarBackups lista do mais novo para o mais antigo', async () => {
    const db = bancoComDados(path.join(raiz, 'app.db'), 1);
    await fazerBackup(db, 'a', { dir: raiz });
    await new Promise((r) => setTimeout(r, 5));
    await fazerBackup(db, 'b', { dir: raiz });
    db.close();
    const lista = listarBackups(raiz);
    expect(lista.length).toBe(2);
    expect(lista[0].nome > lista[1].nome).toBe(true); // mais novo primeiro
  });
});

describe('restauração (o backup que não restaura é teatro)', () => {
  it('round-trip: backup → perda de dados → restaura → dados voltam e íntegro', async () => {
    const caminho = path.join(raiz, 'app.db');
    const db = bancoComDados(caminho, 10);
    const backup = await fazerBackup(db, 'antes', { dir: raiz });

    // Simula a perda: apaga tudo e fecha (deixando WAL/SHM órfãos para trás).
    db.exec('DELETE FROM frases');
    expect((db.prepare('SELECT COUNT(*) n FROM frases').get() as { n: number }).n).toBe(0);
    db.close();

    const resultado = restaurarDe(backup, caminho);
    expect(resultado.ok).toBe(true);
    expect(resultado.copiaSeguranca).toBeTruthy();
    expect(fs.existsSync(resultado.copiaSeguranca!)).toBe(true);

    const reaberto = new Database(caminho, { readonly: true });
    expect(reaberto.pragma('integrity_check', { simple: true })).toBe('ok');
    expect((reaberto.prepare('SELECT COUNT(*) n FROM frases').get() as { n: number }).n).toBe(10);
    reaberto.close();
  });

  it('recusa restaurar de um arquivo que não é banco válido', () => {
    const caminho = path.join(raiz, 'app.db');
    bancoComDados(caminho, 1).close();
    const lixo = path.join(raiz, 'lixo.db');
    fs.writeFileSync(lixo, 'isto não é um banco sqlite');

    const resultado = restaurarDe(lixo, caminho);
    expect(resultado.ok).toBe(false);
    // O destino original continua íntegro (nada foi sobrescrito).
    const db = new Database(caminho, { readonly: true });
    expect(db.pragma('integrity_check', { simple: true })).toBe('ok');
    db.close();
  });
});
