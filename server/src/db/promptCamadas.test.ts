import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { abrirBanco } from './index.js';
import { reposCapitulos, reposObras, reposPrompts, reposPromptPadrao } from './repos.js';
import {
  MARCADOR_DELTA,
  MARCADOR_PREFERENCIAS,
  NUCLEO_ENXUTO,
  PROMPT_PADRAO_INICIAL,
  comporOmega,
  extrairCamadas,
} from './promptPadraoInicial.js';

const NUCLEO = ['# Regras', '', '## 5. PARTÍCULAS', 'texto.', '', '---', '', MARCADOR_DELTA, '', '## 7. PROIBIÇÕES', 'tabela.'].join('\n');

describe('comporOmega', () => {
  it('insere o delta como Seção 6 no lugar do marcador', () => {
    const texto = comporOmega(NUCLEO, 'Lin Feng fala em gírias.');
    expect(texto).toContain('## 6. DIRETRIZES ESPECÍFICAS DA OBRA');
    expect(texto).toContain('Lin Feng fala em gírias.');
    expect(texto).not.toContain(MARCADOR_DELTA);
    // A Seção 6 entra entre a 5 e a 7, como no prompt original.
    expect(texto.indexOf('## 6.')).toBeGreaterThan(texto.indexOf('## 5.'));
    expect(texto.indexOf('## 6.')).toBeLessThan(texto.indexOf('## 7.'));
  });

  it('delta vazio: remove o marcador sem deixar buraco', () => {
    const texto = comporOmega(NUCLEO, '   ');
    expect(texto).not.toContain(MARCADOR_DELTA);
    expect(texto).not.toContain('## 6.');
    expect(texto).not.toContain('\n\n\n');
  });

  it('núcleo sem marcador: delta é anexado ao final', () => {
    const texto = comporOmega('# Regras\ncorpo.', 'Diretriz da obra.');
    expect(texto).toContain('## 6. DIRETRIZES ESPECÍFICAS DA OBRA');
    expect(texto.indexOf('Diretriz da obra.')).toBeGreaterThan(texto.indexOf('corpo.'));
  });

  it('é determinística (mesmos insumos ⇒ mesmos bytes — pré-requisito do cache)', () => {
    expect(comporOmega(NUCLEO, 'x')).toBe(comporOmega(NUCLEO, 'x'));
  });

  it('o núcleo semeado compõe sem marcador visível e com a Seção 6 no lugar', () => {
    const texto = comporOmega(PROMPT_PADRAO_INICIAL, 'Diretriz.');
    expect(texto).not.toContain(MARCADOR_DELTA);
    expect(texto.indexOf('## 6.')).toBeLessThan(texto.indexOf('## 7.'));
  });
});

describe('extrairCamadas (conversão de prompt completo legado)', () => {
  const completo = comporOmega(NUCLEO, 'Vício de fala do Lin Feng.');

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
    const legadoCompleto = comporOmega(NUCLEO, 'Diretriz que era do padrão.');

    // Banco "antigo": uma só versão de padrão, ativa, ainda com a Seção 6, e
    // nenhuma das flags de migração.
    const antes = abrirBanco(arquivo);
    antes.prepare('DELETE FROM prompt_padrao').run();
    antes
      .prepare("INSERT INTO prompt_padrao (versao, conteudo, ativo) VALUES ('1.0', ?, 1)")
      .run(legadoCompleto);
    antes.prepare("DELETE FROM configuracoes WHERE chave IN ('nucleo_migrado','nucleo_enxuto_semeado')").run();
    antes.close();

    const depois = abrirBanco(arquivo);
    const versoes = reposPromptPadrao.listar(depois);
    // v1.0 legada + v2.0 derivada (ativa) + v3.0 enxuta (inativa).
    expect(versoes).toHaveLength(3);
    const ativo = reposPromptPadrao.ativo(depois)!;
    expect(ativo.versao).toBe('2.0');
    expect(ativo.conteudo).toContain(MARCADOR_DELTA);
    expect(ativo.conteudo).not.toContain('Diretriz que era do padrão.');
    expect(versoes.find((v) => v.versao === '1.0')!.conteudo).toBe(legadoCompleto);

    // Reabrir de novo não cria versão nova (as duas flags persistem).
    depois.close();
    const denovo = abrirBanco(arquivo);
    expect(reposPromptPadrao.listar(denovo)).toHaveLength(3);
    denovo.close();
    fs.rmSync(path.dirname(arquivo), { recursive: true, force: true });
  });

  // Banco NOVO nasce com o enxuto ativo (não há histórico a preservar). Este teste é
  // sobre a INSTALAÇÃO ANTIGA, que tem o legado ativo e traduções feitas com ele — e por
  // isso precisa construir esse estado, em vez de tomar um banco novo por antigo.
  it('numa instalação com legado ativo, o enxuto entra INATIVO e não desativa o que estava em uso', () => {
    const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-')), 'teste.db');
    const antes = abrirBanco(arquivo);
    // Volta o banco ao estado de quem instalou antes do enxuto existir.
    antes.prepare('DELETE FROM prompt_padrao').run();
    antes
      .prepare("INSERT INTO prompt_padrao (versao, conteudo, notas_versao, ativo) VALUES ('1.0', ?, '', 1)")
      .run(PROMPT_PADRAO_INICIAL);
    antes.prepare("DELETE FROM configuracoes WHERE chave LIKE 'nucleo%'").run();
    antes.close();

    const depois = abrirBanco(arquivo);
    const enxuto = reposPromptPadrao.listar(depois).find((v) => v.conteudo === NUCLEO_ENXUTO)!;
    expect(enxuto).toBeDefined();
    expect(enxuto.ativo).toBe(false);
    // O ativo continua sendo o núcleo que já regia as traduções.
    expect(reposPromptPadrao.ativo(depois)!.conteudo).not.toContain(MARCADOR_PREFERENCIAS);
    depois.close();
    fs.rmSync(path.dirname(arquivo), { recursive: true, force: true });
  });

  // O banco novo recebe o enxuto UMA vez: `semearPromptPadrao` o põe ativo, e
  // `semearNucleoEnxuto` não pode duplicá-lo — versão que não distingue nada é ruído.
  it('banco novo nasce com o enxuto ATIVO, e sem versão duplicada', () => {
    const novo = abrirBanco(':memory:');
    const versoes = reposPromptPadrao.listar(novo);
    expect(versoes.filter((v) => v.conteudo === NUCLEO_ENXUTO)).toHaveLength(1);
    expect(reposPromptPadrao.ativo(novo)!.conteudo).toBe(NUCLEO_ENXUTO);
    expect(reposPromptPadrao.ativo(novo)!.conteudo).toContain(MARCADOR_PREFERENCIAS);
    novo.close();
  });

  // Doc 08 §12.5: a regra do lugar da cena voltou a ser um PASSO com pergunta —
  // era como o núcleo antigo a escrevia, e a medição real mostrou o enxuto
  // errando 2 de 2 quando ela virou afirmação solta.
  it('a regra do lugar da cena é um passo-teste, com pergunta e parada', () => {
    expect(NUCLEO_ENXUTO).toContain('os personagens estão nesse lugar agora?');
    expect(NUCLEO_ENXUTO).toContain('**Pare aqui.**');
  });

  it('conserta a linha do lugar da cena numa cópia que semeou o enxuto antes do conserto', () => {
    const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-')), 'teste.db');
    const antes = abrirBanco(arquivo);
    const idEnxuto = reposPromptPadrao.listar(antes).find((v) => v.conteudo.includes(MARCADOR_PREFERENCIAS))!.id;
    // Simula a cópia semeada antes: texto velho no lugar e a flag do conserto ausente.
    // O conserto só toca versão INATIVA (rascunho distribuído, não histórico de tradução),
    // então o cenário precisa de outro núcleo no comando — como numa instalação antiga.
    // A nota importa: o conserto reconhece o rascunho distribuído pelo prefixo que
    // `semearNucleoEnxuto` grava, e é esse o estado que se quer reproduzir aqui.
    antes
      .prepare('UPDATE prompt_padrao SET conteudo = ?, ativo = 0, notas_versao = ? WHERE id = ?')
      .run('NÚCLEO ENXUTO VELHO', 'Núcleo enxuto, INATIVO: semeado antes do conserto.', idEnxuto);
    antes
      .prepare("INSERT INTO prompt_padrao (versao, conteudo, notas_versao, ativo) VALUES ('0.9', ?, '', 1)")
      .run(PROMPT_PADRAO_INICIAL);
    antes.prepare("DELETE FROM configuracoes WHERE chave = 'nucleo_enxuto_lugar_da_cena'").run();
    antes.close();

    const depois = abrirBanco(arquivo);
    expect(reposPromptPadrao.listar(depois).find((v) => v.id === idEnxuto)!.conteudo).toBe(NUCLEO_ENXUTO);
    depois.close();
    fs.rmSync(path.dirname(arquivo), { recursive: true, force: true });
  });

  it('não reescreve um núcleo enxuto que já traduziu algum capítulo', () => {
    const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-')), 'teste.db');
    const antes = abrirBanco(arquivo);
    const idEnxuto = reposPromptPadrao.listar(antes).find((v) => v.conteudo.includes(MARCADOR_PREFERENCIAS))!.id;
    antes.prepare('UPDATE prompt_padrao SET conteudo = ? WHERE id = ?').run('NÚCLEO ENXUTO EM USO', idEnxuto);
    const obra = reposObras.criar(antes, { titulo: 'Obra' });
    const cap = reposCapitulos.criar(antes, obra.id, { numero: 1, texto_origem: '甲。' }, [
      { texto_zh: '甲。', paragrafo: 0 },
    ]);
    reposCapitulos.atualizar(antes, cap.id, { nucleo_id: idEnxuto });
    antes.prepare("DELETE FROM configuracoes WHERE chave = 'nucleo_enxuto_lugar_da_cena'").run();
    antes.close();

    const depois = abrirBanco(arquivo);
    // Histórico de tradução é imutável: o capítulo continua apontando para o
    // texto exato que o traduziu.
    expect(reposPromptPadrao.listar(depois).find((v) => v.id === idEnxuto)!.conteudo).toBe('NÚCLEO ENXUTO EM USO');
    depois.close();
    fs.rmSync(path.dirname(arquivo), { recursive: true, force: true });
  });

  it('a semeadura roda uma vez só: reabrir não cria outra versão', () => {
    const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-')), 'teste.db');
    const antes = abrirBanco(arquivo);
    const total = reposPromptPadrao.listar(antes).length;
    antes.close();
    const depois = abrirBanco(arquivo);
    expect(reposPromptPadrao.listar(depois)).toHaveLength(total);
    depois.close();
    fs.rmSync(path.dirname(arquivo), { recursive: true, force: true });
  });
});

describe('reposPrompts.composto', () => {
  it("prompt 'completo' legado vai como está; delta compõe com o núcleo ATIVO do momento", () => {
    const db = abrirBanco(':memory:');

    const legado = reposObras.criar(db, { titulo: 'Legada' });
    reposPrompts.criar(db, legado.id, { versao: '1.0', conteudo: 'Prompt inteiro da obra.', ativar: true });
    expect(reposPrompts.composto(db, legado.id)!.texto).toBe('Prompt inteiro da obra.');

    // O enxuto vem semeado inativo; este teste é sobre a composição com ele.
    const enxuto = reposPromptPadrao.listar(db).find((v) => v.conteudo.includes(MARCADOR_PREFERENCIAS))!;
    reposPromptPadrao.ativar(db, enxuto.id);

    const nova = reposObras.criar(db, { titulo: 'Nova' });
    const delta = reposPrompts.adotarPadrao(db, nova.id)!;
    expect(delta.tipo).toBe('delta');
    const antes = reposPrompts.composto(db, nova.id)!;
    expect(antes.nucleo).not.toBeNull();
    expect(antes.texto).toContain('## 3. DEMONSTRATIVOS');

    // Nova versão do núcleo flui para a obra sem tocar no delta dela.
    reposPromptPadrao.criar(db, { versao: '9.0', conteudo: `Regra nova do núcleo.\n\n${MARCADOR_DELTA}`, ativar: true });
    const depois = reposPrompts.composto(db, nova.id)!;
    expect(depois.texto).toContain('Regra nova do núcleo.');
    expect(depois.nucleo!.versao).toBe('9.0');
    expect(depois.prompt.id).toBe(delta.id);
  });
});

// Doc 15. Havia dois caminhos para criar obra e eles divergiam em silêncio: sem prompt
// inicial, `adotarPadrao` fazia um delta; COM prompt inicial, a coluna caía no default
// 'completo' da migração 006 e a obra nascia fora das camadas — sem preferências, sem
// receber melhorias do núcleo, sem as checagens.
describe('obra nova nasce em camadas', () => {
  it('com prompt inicial, o conteúdo digitado vira o DELTA — não um prompt completo', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra Nova', prompt_inicial: { versao: '1.0', conteudo: 'Lin Feng fala em gírias.' } });
    const ativo = reposPrompts.ativo(db, obra.id)!;
    expect(ativo.tipo).toBe('delta');
    expect(ativo.nucleo_id).toBe(reposPromptPadrao.ativo(db)!.id);
    // E o Ômega dela já traz as três camadas.
    const composto = reposPrompts.composto(db, obra.id)!;
    expect(composto.texto).toContain('## 5. PREFERÊNCIAS');
    expect(composto.texto).toContain('Lin Feng fala em gírias.');
  });

  it('sem prompt inicial, o delta é adotado na primeira composição (caminho que já funcionava)', () => {
    const db = abrirBanco(':memory:');
    const obra = reposObras.criar(db, { titulo: 'Obra Sem Prompt' });
    expect(reposPrompts.composto(db, obra.id)!.prompt.tipo).toBe('delta');
  });
});
