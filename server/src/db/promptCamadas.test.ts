import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { abrirBanco } from './index.js';
import { reposObras, reposPrompts, reposPromptPadrao } from './repos.js';
import { MARCADOR_DELTA, PROMPT_PADRAO_INICIAL, comporPromptMae, extrairCamadas } from './promptPadraoInicial.js';

const NUCLEO = ['# Regras', '', '## 5. PARTÍCULAS', 'texto.', '', '---', '', MARCADOR_DELTA, '', '## 7. PROIBIÇÕES', 'tabela.'].join('\n');

describe('comporPromptMae', () => {
  it('insere o delta como Seção 6 no lugar do marcador', () => {
    const texto = comporPromptMae(NUCLEO, 'Lin Feng fala em gírias.');
    expect(texto).toContain('## 6. DIRETRIZES ESPECÍFICAS DA OBRA');
    expect(texto).toContain('Lin Feng fala em gírias.');
    expect(texto).not.toContain(MARCADOR_DELTA);
    // A Seção 6 entra entre a 5 e a 7, como no prompt original.
    expect(texto.indexOf('## 6.')).toBeGreaterThan(texto.indexOf('## 5.'));
    expect(texto.indexOf('## 6.')).toBeLessThan(texto.indexOf('## 7.'));
  });

  it('delta vazio: remove o marcador sem deixar buraco', () => {
    const texto = comporPromptMae(NUCLEO, '   ');
    expect(texto).not.toContain(MARCADOR_DELTA);
    expect(texto).not.toContain('## 6.');
    expect(texto).not.toContain('\n\n\n');
  });

  it('núcleo sem marcador: delta é anexado ao final', () => {
    const texto = comporPromptMae('# Regras\ncorpo.', 'Diretriz da obra.');
    expect(texto).toContain('## 6. DIRETRIZES ESPECÍFICAS DA OBRA');
    expect(texto.indexOf('Diretriz da obra.')).toBeGreaterThan(texto.indexOf('corpo.'));
  });

  it('é determinística (mesmos insumos ⇒ mesmos bytes — pré-requisito do cache)', () => {
    expect(comporPromptMae(NUCLEO, 'x')).toBe(comporPromptMae(NUCLEO, 'x'));
  });

  it('o núcleo semeado compõe sem marcador visível e com a Seção 6 no lugar', () => {
    const texto = comporPromptMae(PROMPT_PADRAO_INICIAL, 'Diretriz.');
    expect(texto).not.toContain(MARCADOR_DELTA);
    expect(texto.indexOf('## 6.')).toBeLessThan(texto.indexOf('## 7.'));
  });
});

describe('extrairCamadas (conversão de prompt completo legado)', () => {
  const completo = comporPromptMae(NUCLEO, 'Vício de fala do Lin Feng.');

  it('separa a Seção 6 como delta e devolve o núcleo com marcador', () => {
    const camadas = extrairCamadas(completo)!;
    expect(camadas.delta).toContain('Vício de fala do Lin Feng.');
    expect(camadas.delta).not.toContain('## 6');
    expect(camadas.nucleo).toContain(MARCADOR_DELTA);
    expect(camadas.nucleo).not.toContain('Vício de fala do Lin Feng.');
  });

  it('cabeçalho com outro título de Seção 6 também ancora (caso da obra real)', () => {
    const outro = completo.replace('## 6. DIRETRIZES ESPECÍFICAS DA OBRA', '## 6. DIRETRIZES ESPECÍFICAS DE PERSONAGEM');
    const camadas = extrairCamadas(outro)!;
    expect(camadas.delta).toContain('Vício de fala do Lin Feng.');
  });

  it('sem Seção 6 devolve null (conversão precisa ser manual)', () => {
    expect(extrairCamadas('# Prompt sem seções numeradas')).toBeNull();
  });
});

describe('migração de boot: padrão legado (com Seção 6) vira núcleo', () => {
  it('na reabertura, deriva uma versão-núcleo ativa e preserva o histórico', () => {
    const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-')), 'teste.db');
    const legadoCompleto = comporPromptMae(NUCLEO, 'Diretriz que era do padrão.');

    // Banco "antigo": padrão ativo ainda carrega a Seção 6 e a flag não existe.
    const antes = abrirBanco(arquivo);
    antes.prepare('UPDATE prompt_padrao SET conteudo = ?').run(legadoCompleto);
    antes.prepare("DELETE FROM configuracoes WHERE chave = 'nucleo_migrado'").run();
    antes.close();

    const depois = abrirBanco(arquivo);
    const versoes = reposPromptPadrao.listar(depois);
    expect(versoes).toHaveLength(2);
    const ativo = reposPromptPadrao.ativo(depois)!;
    expect(ativo.versao).toBe('2.0');
    expect(ativo.conteudo).toContain(MARCADOR_DELTA);
    expect(ativo.conteudo).not.toContain('Diretriz que era do padrão.');
    expect(versoes.find((v) => !v.ativo)!.conteudo).toBe(legadoCompleto);

    // Reabrir de novo não cria terceira versão (flag persiste).
    depois.close();
    const denovo = abrirBanco(arquivo);
    expect(reposPromptPadrao.listar(denovo)).toHaveLength(2);
    denovo.close();
    fs.rmSync(path.dirname(arquivo), { recursive: true, force: true });
  });
});

describe('reposPrompts.composto', () => {
  it("prompt 'completo' legado vai como está; delta compõe com o núcleo ATIVO do momento", () => {
    const db = abrirBanco(':memory:');

    const legado = reposObras.criar(db, { titulo: 'Legada' });
    reposPrompts.criar(db, legado.id, { versao: '1.0', conteudo: 'Prompt inteiro da obra.', ativar: true });
    expect(reposPrompts.composto(db, legado.id)!.texto).toBe('Prompt inteiro da obra.');

    const nova = reposObras.criar(db, { titulo: 'Nova' });
    const delta = reposPrompts.adotarPadrao(db, nova.id)!;
    expect(delta.tipo).toBe('delta');
    const antes = reposPrompts.composto(db, nova.id)!;
    expect(antes.nucleo).not.toBeNull();
    expect(antes.texto).toContain('## 7. PROIBIÇÕES ABSOLUTAS');

    // Nova versão do núcleo flui para a obra sem tocar no delta dela.
    reposPromptPadrao.criar(db, { versao: '9.0', conteudo: `Regra nova do núcleo.\n\n${MARCADOR_DELTA}`, ativar: true });
    const depois = reposPrompts.composto(db, nova.id)!;
    expect(depois.texto).toContain('Regra nova do núcleo.');
    expect(depois.nucleo!.versao).toBe('9.0');
    expect(depois.prompt.id).toBe(delta.id);
  });
});
