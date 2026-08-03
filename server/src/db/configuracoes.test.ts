import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { abrirBanco, type BancoDados } from './index.js';
import { sanearConfiguracoes } from './configuracoes.js';
import { reposConfig } from './repos.js';
import { criarApp } from '../app.js';

process.env.DAO_TALE_DIR = '/tmp/dao-tale-teste';

// Instalação antiga: escreve direto na tabela, sem passar pelo schema — é assim
// que o valor de 400 sobreviveu ao aperto do teto para 120 na auditoria A1.
function gravarCru(db: BancoDados, chave: string, valor: string): void {
  db.prepare(
    'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor',
  ).run(chave, valor);
}

describe('saneamento das configurações no boot', () => {
  let pasta: string;
  let caminho: string;

  beforeEach(() => {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-config-'));
    caminho = path.join(pasta, 'teste.db');
  });

  afterEach(() => {
    fs.rmSync(pasta, { recursive: true, force: true });
  });

  it('clampa no boot o tamanho_bloco de uma instalação anterior ao teto de 120, e aí o salvar volta a funcionar', async () => {
    // Instância antiga: 400 era válido quando foi gravado.
    const antigo = abrirBanco(caminho);
    gravarCru(antigo, 'tamanho_bloco', '400');
    antigo.close();

    // Boot seguinte, já com o teto novo.
    const db = abrirBanco(caminho);
    expect(reposConfig.obterTodas(db).tamanho_bloco).toBe(120);

    // E o que a tela de Configurações faz ao salvar: reenviar a config INTEIRA.
    // Antes do saneamento isto voltava 400 (too_big) e o salvar morria calado.
    const app = criarApp(db);
    const resposta = await app.request('/api/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reposConfig.obterTodas(db)),
    });
    expect(resposta.status).toBe(200);
    db.close();
  });

  it('encosta no limite em vez de resetar para o padrão de fábrica', () => {
    const db = abrirBanco(caminho);
    gravarCru(db, 'tamanho_bloco', '400');
    sanearConfiguracoes(db);
    // 120 é o teto; 60 seria o padrão. Quem pediu blocos grandes continua com o
    // maior bloco possível.
    expect(reposConfig.obterTodas(db).tamanho_bloco).toBe(120);
    expect(reposConfig.obterTodas(db).tamanho_bloco).not.toBe(60);
    db.close();
  });

  it('é idempotente: o segundo boot não tem nada a ajustar', () => {
    const db = abrirBanco(caminho);
    gravarCru(db, 'tamanho_bloco', '400');
    expect(sanearConfiguracoes(db)).toEqual([{ chave: 'tamanho_bloco', de: '400', para: '120' }]);
    expect(sanearConfiguracoes(db)).toEqual([]);
    db.close();
  });

  it('não toca em valor dentro da faixa nem em chave que não é numérica', () => {
    const db = abrirBanco(caminho);
    gravarCru(db, 'tamanho_bloco', '90');
    gravarCru(db, 'modelo_padrao', 'claude-opus-5');
    gravarCru(db, 'parar_no_limite', 'true');
    // Flag interna de migração: não está no schema, não é da nossa conta.
    gravarCru(db, 'nucleo_migrado', '1');
    expect(sanearConfiguracoes(db)).toEqual([]);
    const config = reposConfig.obterTodas(db);
    expect(config.tamanho_bloco).toBe(90);
    expect(config.modelo_padrao).toBe('claude-opus-5');
    db.close();
  });

  it('desce nas faixas de dentro das tabelas JSON e preserva as chaves desconhecidas', () => {
    const db = abrirBanco(caminho);
    gravarCru(db, 'cotas_diarias', JSON.stringify({ gemini: 9000000, groq: 1000 }));
    gravarCru(db, 'precos_modelos', JSON.stringify({ 'claude:x': { entrada: 5000, saida: 3 } }));
    sanearConfiguracoes(db);
    const config = reposConfig.obterTodas(db);
    expect(config.cotas_diarias).toEqual({ gemini: 1000000, groq: 1000 });
    expect(config.precos_modelos['claude:x']).toEqual({ entrada: 1000, saida: 3 });
    db.close();
  });

  it('arredonda o que deveria ser inteiro antes de encostar no limite', () => {
    const db = abrirBanco(caminho);
    gravarCru(db, 'tamanho_bloco', '120.7');
    gravarCru(db, 'lote_paralelo', '2.4');
    sanearConfiguracoes(db);
    const config = reposConfig.obterTodas(db);
    expect(config.tamanho_bloco).toBe(120);
    expect(config.lote_paralelo).toBe(2);
    db.close();
  });

  it('deixa valor corrompido para a guarda de leitura, sem inventar número', () => {
    const db = abrirBanco(caminho);
    gravarCru(db, 'tamanho_bloco', 'abacaxi');
    expect(sanearConfiguracoes(db)).toEqual([]);
    expect(reposConfig.obterTodas(db).tamanho_bloco).toBe(60); // padrão, via numeroConfig
    db.close();
  });
});

describe('erro de validação da config', () => {
  it('recusa valor fora da faixa dizendo QUAL campo — a tela mostra isto', async () => {
    const db = abrirBanco(':memory:');
    const app = criarApp(db);
    const resposta = await app.request('/api/configuracoes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tamanho_bloco: 400 }),
    });
    expect(resposta.status).toBe(400);
    const corpo = (await resposta.json()) as { erro: { codigo: string; mensagem: string } };
    expect(corpo.erro.codigo).toBe('payload-invalido');
    expect(corpo.erro.mensagem).toContain('tamanho_bloco');
    expect(corpo.erro.mensagem).toContain('120');
    db.close();
  });
});
