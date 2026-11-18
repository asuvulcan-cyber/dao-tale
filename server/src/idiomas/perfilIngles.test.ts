import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { criarApp } from '../app.js';
import { reposPromptPadrao } from '../db/repos.js';
import type { Hono } from 'hono';

// Ponta a ponta do perfil inglês pela API, e a garantia de que ele convive com o
// mandarim em vez de substituí-lo.

process.env.DAO_TALE_MOCK_LATENCIA = '0';
process.env.DAO_TALE_DIR = '/tmp/dao-tale-teste';

let db: BancoDados;
let app: Hono;

const json = async (r: Response) => (await r.json()) as any;
const chamar = (metodo: string, rota: string, corpo?: unknown) =>
  app.request(rota, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

beforeEach(() => {
  db = abrirBanco(':memory:');
  app = criarApp(db);
});

describe('os dois perfis convivem', () => {
  it('cada idioma tem o seu Alfa ativo, semeado e independente', () => {
    const zh = reposPromptPadrao.ativo(db, 'zh');
    const en = reposPromptPadrao.ativo(db, 'en');
    expect(zh).toBeDefined();
    expect(en).toBeDefined();
    expect(zh!.id).not.toBe(en!.id);
    expect(zh!.conteudo).toContain('CHINÊS');
    expect(en!.conteudo).toContain('INGLÊS → PT-BR');
  });

  it('ativar um Alfa inglês não derruba o mandarim ativo', () => {
    const mandarimAntes = reposPromptPadrao.ativo(db, 'zh')!;
    const novo = reposPromptPadrao.criar(db, {
      versao: 'EN 9.0',
      conteudo: '# ALFA — TESTE INGLÊS\n\n{{DELTA_OBRA_V2}}\n',
      ativar: true,
      idioma_origem: 'en',
    });
    expect(reposPromptPadrao.ativo(db, 'en')!.id).toBe(novo.id);
    // O índice único da migração 029 é por idioma; sem ele, este INSERT teria
    // derrubado o núcleo que governa as obras mandarins.
    expect(reposPromptPadrao.ativo(db, 'zh')!.id).toBe(mandarimAntes.id);
  });

  it('a listagem de núcleos é por perfil, e sem parâmetro vale o mandarim', async () => {
    const padrao = await json(await chamar('GET', '/api/prompt-padrao'));
    const ingles = await json(await chamar('GET', '/api/prompt-padrao?idioma=en'));
    expect(padrao.every((v: any) => v.idioma_origem === 'zh')).toBe(true);
    expect(ingles.every((v: any) => v.idioma_origem === 'en')).toBe(true);
    expect(ingles).toHaveLength(1);
  });
});

describe('obra inglesa, de ponta a ponta', () => {
  it('segmenta pelo perfil da obra, sem picotar em abreviação', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', { titulo: 'The Bronze Tower', idioma_origem: 'en' }),
    );
    expect(obra.idioma_origem).toBe('en');

    const resposta = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, {
        numero: 1,
        texto_origem: 'Mr. Chen bowed to Dr. Li. "Wait!" she shouted. He walked away.',
      }),
    );
    // A máquina do mandarim não quebraria nada aqui (não há 。), e devolveria uma
    // frase só — é justamente o que o despacho por perfil evita.
    expect(resposta.frases_total).toBe(3);

    const detalhe = await json(await chamar('GET', `/api/capitulos/${resposta.capitulo.id}`));
    expect(detalhe.frases.map((f: any) => f.texto_zh)).toEqual([
      'Mr. Chen bowed to Dr. Li.',
      '"Wait!" she shouted.',
      'He walked away.',
    ]);
  });

  it('o Ômega da obra inglesa é composto sobre o Alfa inglês, com Beta e checklist próprios', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', { titulo: 'The Bronze Tower', idioma_origem: 'en' }),
    );
    const composto = await json(await chamar('GET', `/api/obras/${obra.id}/prompt-composto`));
    const texto = composto.texto as string;

    expect(texto).toContain('INGLÊS → PT-BR');
    expect(texto).not.toContain('CHINÊS');
    // Os marcadores próprios do perfil foram resolvidos, não deixados crus.
    expect(texto).not.toContain('{{');
    // Beta e checklist ingleses entraram no lugar dos mandarins.
    expect(texto).toContain('Nenhuma medida imperial ficou sem converter');
    expect(texto).not.toContain('caractere chinês vazou');
  });

  it('traduz o capítulo inteiro com o Simulado e captura termo por palavra', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', { titulo: 'The Bronze Tower', idioma_origem: 'en' }),
    );
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, {
        numero: 1,
        titulo: 'The Bronze Tower',
        texto_origem: 'He woke at the end of all things. The tower stood silent above him.',
      }),
    );
    const capId = criado.capitulo.id;

    expect((await chamar('POST', `/api/capitulos/${capId}/traduzir`, { provedor: 'mock' })).status).toBe(202);

    let frases: any[] = [];
    for (let i = 0; i < 100; i++) {
      frases = (await json(await chamar('GET', `/api/capitulos/${capId}`))).frases;
      if (frases.every((f: any) => f.status_traducao === 'traduzida')) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(frases.every((f) => f.status_traducao === 'traduzida')).toBe(true);

    // O termo sugerido pelo Simulado é recorte por PALAVRA. Fatiado por
    // caractere, como no mandarim, sairia "He" virando "H" — pedaço de palavra,
    // não termo, e o caminho de teste sem chave de API não valeria nada aqui.
    const sugestoes = await json(await chamar('GET', `/api/obras/${obra.id}/termos-sugeridos?status=pendente`));
    expect(sugestoes.length).toBeGreaterThan(0);
    expect(sugestoes[0].termo_zh).toMatch(/^\p{L}+(?: \p{L}+)?$/u);
  });

  it('a obra mandarim continua composta sobre o Alfa mandarim', async () => {
    const obra = await json(await chamar('POST', '/api/obras', { titulo: '青铜塔' }));
    expect(obra.idioma_origem).toBe('zh');
    const composto = await json(await chamar('GET', `/api/obras/${obra.id}/prompt-composto`));
    expect(composto.texto).toContain('CHINÊS');
    expect(composto.texto).not.toContain('INGLÊS → PT-BR');
  });
});
