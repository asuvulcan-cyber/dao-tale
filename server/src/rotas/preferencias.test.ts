import { beforeEach, describe, expect, it } from 'vitest';
import { PREFERENCIAS_PADRAO } from '@dao-tale/shared';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { criarApp } from '../app.js';
import { exportarObra, importarObra } from '../db/portabilidade.js';
import { reposPrompts, reposPromptPadrao } from '../db/repos.js';
import { _thinkingMock, _zerarCacheMock } from '../ia/mock.js';
import type { Hono } from 'hono';

// Preferências de estilo pela API (doc 08 §12): virar uma chave é criar uma versão
// nova do prompt da obra — só assim o capítulo já traduzido continua sabendo com
// que convenções foi traduzido.

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

async function obraComDelta() {
  // O núcleo enxuto vem semeado INATIVO (a ativação é decisão do usuário, após o
  // portão A/B); estes testes são sobre ele, então ativam explicitamente.
  const enxuto = reposPromptPadrao.listar(db).find((v) => v.conteudo.includes('{{PREFERENCIAS_OBRA}}'))!;
  reposPromptPadrao.ativar(db, enxuto.id);
  const obra = await json(await chamar('POST', '/api/obras', { titulo: 'Obra' }));
  await chamar('POST', `/api/obras/${obra.id}/prompts/adotar-padrao`);
  return obra;
}

describe('preferências de estilo na API', () => {
  it('delta recém-criado já vem com os padrões — obra nova traduz como sempre', async () => {
    const obra = await obraComDelta();
    const [ativo] = await json(await chamar('GET', `/api/obras/${obra.id}/prompts`));
    expect(ativo.preferencias).toEqual(PREFERENCIAS_PADRAO);

    const composto = await json(await chamar('GET', `/api/obras/${obra.id}/prompt-composto`));
    expect(composto.texto).toContain('## 5. PREFERÊNCIAS DE ESTILO DESTA OBRA');
    expect(composto.texto).toContain('aspas duplas retas');
  });

  it('virar uma chave cria versão nova e muda o prompt composto', async () => {
    const obra = await obraComDelta();
    const nova = await json(
      await chamar('POST', `/api/obras/${obra.id}/prompts`, {
        versao: '1.1',
        conteudo: '',
        ativar: true,
        preferencias: { dialogo: 'travessao' },
      }),
    );
    expect(nova.preferencias.dialogo).toBe('travessao');
    // O resto continua no padrão: uma chave por vez, sem efeito colateral.
    expect(nova.preferencias.onomatopeia).toBe('adaptar');

    const composto = await json(await chamar('GET', `/api/obras/${obra.id}/prompt-composto`));
    expect(composto.texto).toContain('— Não há saída — disse ele.');
    expect(composto.texto).not.toContain('"Não há saída", disse ele.');

    // A versão anterior continua no histórico com as preferências dela.
    const versoes = await json(await chamar('GET', `/api/obras/${obra.id}/prompts`));
    expect(versoes).toHaveLength(2);
    expect(versoes.find((v: any) => v.versao === '1.0').preferencias.dialogo).toBe('aspas');
  });

  it('editar o texto do delta NÃO reseta as chaves — as preferências são herdadas', async () => {
    const obra = await obraComDelta();
    await chamar('POST', `/api/obras/${obra.id}/prompts`, {
      versao: '1.1',
      conteudo: '',
      ativar: true,
      preferencias: { dialogo: 'travessao', onomatopeia: 'manter' },
    });
    const depois = await json(
      await chamar('POST', `/api/obras/${obra.id}/prompts`, {
        versao: '1.2',
        conteudo: 'Lin Feng fala em gírias.',
        ativar: true,
      }),
    );
    expect(depois.preferencias.dialogo).toBe('travessao');
    expect(depois.preferencias.onomatopeia).toBe('manter');
  });

  it('valor desconhecido é recusado pelo schema, não silenciosamente ignorado', async () => {
    const obra = await obraComDelta();
    const r = await chamar('POST', `/api/obras/${obra.id}/prompts`, {
      versao: '1.1',
      conteudo: '',
      ativar: true,
      preferencias: { dialogo: 'emoji' },
    });
    expect(r.status).toBe(400);
  });

  it('as preferências viajam no export e voltam na reimportação', async () => {
    const obra = await obraComDelta();
    await chamar('POST', `/api/obras/${obra.id}/prompts`, {
      versao: '1.1',
      conteudo: '',
      ativar: true,
      preferencias: { dialogo: 'travessao', registro: 'leitores de wuxia clássico' },
    });

    const pacote = exportarObra(db, obra.id)!;
    const clone = importarObra(db, JSON.parse(JSON.stringify(pacote))) as { id: number };
    const ativo = reposPrompts.ativo(db, clone.id)!;
    expect(ativo.preferencias.dialogo).toBe('travessao');
    expect(ativo.preferencias.registro).toBe('leitores de wuxia clássico');
  });

  it('o portão A/B do comparador roda o mesmo modelo com dois núcleos e mede cada saída', async () => {
    const obra = await obraComDelta();
    await chamar('PUT', `/api/obras/${obra.id}`, { provedor_padrao: 'mock', modelo_padrao: 'mock-v1' });
    // Banco novo tem UM núcleo (o enxuto, ativo). O portão A/B compara dois, então o
    // segundo é criado aqui — que é também como o usuário chega nesta tela.
    await chamar('POST', '/api/prompt-padrao', {
      versao: '9.9',
      conteudo: `# Núcleo alternativo\n\nRegras.\n\n{{PREFERENCIAS_OBRA}}\n\n{{DELTA_OBRA}}`,
      ativar: false,
    });
    const nucleos = await json(await chamar('GET', '/api/prompt-padrao'));
    expect(nucleos.length).toBeGreaterThanOrEqual(2);

    const r = await json(
      await chamar('POST', `/api/obras/${obra.id}/comparar`, {
        texto_zh: '林风举起剑。',
        alvos: nucleos.slice(0, 2).map((n: any) => ({ provedor: 'mock', modelo: 'mock-v1', nucleo_id: n.id })),
      }),
    );
    expect(r.resultados).toHaveLength(2);
    expect(r.resultados.map((x: any) => x.nucleo_versao)).toEqual(nucleos.slice(0, 2).map((n: any) => n.versao));
    for (const res of r.resultados) {
      expect(res.ok).toBe(true);
      expect(res.metricas).toMatchObject({ aquele: expect.any(Number), demonstrativos: expect.any(Number) });
    }
  });

  it('o comparador herda o thinking da obra — senão mede raciocínio contra prosa', async () => {
    // Medido na 死人经: o comparador rodava a obra `thinking: desligado` com
    // raciocínio ligado e gastava 13–20 mil tokens de saída por bloco de 20
    // frases, contra 1,4 mil do job. Comparar prompts assim compara outra coisa.
    _zerarCacheMock();
    const obra = await obraComDelta();
    await chamar('PUT', `/api/obras/${obra.id}`, { thinking: 'desligado' });
    await chamar('POST', `/api/obras/${obra.id}/comparar`, {
      texto_zh: '林风举起剑。',
      alvos: [{ provedor: 'mock', modelo: 'mock-v1' }],
    });
    expect(_thinkingMock('traducao')).toBe('desligado');

    await chamar('PUT', `/api/obras/${obra.id}`, { thinking: null });
    _zerarCacheMock();
    await chamar('POST', `/api/obras/${obra.id}/comparar`, {
      texto_zh: '林风举起剑。',
      alvos: [{ provedor: 'mock', modelo: 'mock-v1' }],
    });
    expect(_thinkingMock('traducao')).toBeUndefined();
  });

  it('núcleo inexistente no alvo vira erro daquele alvo, não 500 da rota', async () => {
    const obra = await obraComDelta();
    const r = await json(
      await chamar('POST', `/api/obras/${obra.id}/comparar`, {
        texto_zh: '林风举起剑。',
        alvos: [{ provedor: 'mock', modelo: 'mock-v1', nucleo_id: 99999 }],
      }),
    );
    expect(r.resultados[0].ok).toBe(false);
    expect(r.resultados[0].erro).toContain('núcleo');
  });

  it('export antigo (sem o campo) importa nos padrões, sem quebrar', async () => {
    const obra = await obraComDelta();
    const pacote = JSON.parse(JSON.stringify(exportarObra(db, obra.id)!));
    for (const p of pacote.prompts) delete p.preferencias;
    pacote.obra.titulo = 'Obra reimportada';
    const clone = importarObra(db, pacote) as { id: number };
    expect(reposPrompts.ativo(db, clone.id)!.preferencias).toEqual(PREFERENCIAS_PADRAO);
  });
});
