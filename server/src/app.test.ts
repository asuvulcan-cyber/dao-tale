import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, type BancoDados } from './db/index.js';
import { criarApp } from './app.js';
import type { Hono } from 'hono';

// Teste de integração do fluxo completo da Fase 1, usando o provedor mock:
// obra → capítulo (segmentação) → tradução em blocos → edição → revisão → correção.

process.env.DAO_TALE_MOCK_LATENCIA = '0';
process.env.DAO_TALE_DIR = '/tmp/dao-tale-teste';

let db: BancoDados;
let app: Hono;

const json = async (resposta: Response) => (await resposta.json()) as any;

async function chamar(metodo: string, rota: string, corpo?: unknown): Promise<Response> {
  return await app.request(rota, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
}

beforeEach(() => {
  db = abrirBanco(':memory:');
  app = criarApp(db);
});

describe('fluxo completo com provedor mock', () => {
  it('percorre obra → capítulo → tradução → revisão → correção', async () => {
    // Obra com prompt mãe e glossário inicial
    const obra = await json(
      await chamar('POST', '/api/obras', {
        titulo: 'Dez Dias Até o Fim',
        titulo_original: '十日终焉',
        prompt_inicial: { versao: '1.0', conteudo: 'Traduza com fidelidade ao tom sombrio.' },
        glossario_inicial: [{ termo_zh: '终焉', termo_pt: 'Fim Derradeiro', categoria: 'outro' }],
      }),
    );
    expect(obra.id).toBeTypeOf('number');

    // Capítulo — segmentação
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, {
        numero: 1,
        texto_origem: '「等等！」她喊道。「别走。」\n他沉默了……然后开口。',
      }),
    );
    expect(criado.frases_total).toBe(4);
    const capId = criado.capitulo.id;

    // Tradução com mock
    const inicio = await chamar('POST', `/api/capitulos/${capId}/traduzir`, { provedor: 'mock' });
    expect(inicio.status).toBe(202);

    // Espera o job terminar (mock com latência zero termina em milissegundos)
    let frases: any[] = [];
    for (let i = 0; i < 100; i++) {
      const detalhe = await json(await chamar('GET', `/api/capitulos/${capId}`));
      frases = detalhe.frases;
      if (frases.every((f: any) => f.status_traducao === 'traduzida')) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(frases.every((f) => f.status_traducao === 'traduzida')).toBe(true);
    expect(frases[0].texto_pt).toContain('tradução simulada');
    expect(frases[0].texto_pt_original_ia).toBe(frases[0].texto_pt);

    // Termos sugeridos foram capturados
    const sugestoes = await json(await chamar('GET', `/api/obras/${obra.id}/termos-sugeridos?status=pendente`));
    expect(sugestoes.length).toBeGreaterThan(0);

    // Edição manual
    const editada = await json(await chamar('PATCH', `/api/frases/${frases[0].id}`, { texto_pt: 'Espera!' }));
    expect(editada.editado_manualmente).toBe(true);

    // Revisão com veredito incorreto (pergunta contém "errado")
    const revisao = await json(
      await chamar('POST', `/api/frases/${frases[1].id}/revisar`, {
        pergunta: 'Isso não está errado?',
        provedor: 'mock',
      }),
    );
    expect(revisao.revisao.veredito).toBe('incorreto');
    expect(revisao.caso.status).toBe('pendente');
    expect(revisao.caso.correcao_proposta).toBeTruthy();

    // Aplicar correção com um clique
    const aplicado = await json(await chamar('POST', `/api/testes/${revisao.caso.id}/aplicar-correcao`));
    expect(aplicado.caso.status).toBe('corrigido');
    expect(aplicado.frase.texto_pt).toBe(revisao.caso.correcao_proposta);

    // Revisão com veredito correto → confirmado automaticamente
    const revisao2 = await json(
      await chamar('POST', `/api/frases/${frases[2].id}/revisar`, {
        pergunta: 'Por que essa escolha de palavra?',
        provedor: 'mock',
      }),
    );
    expect(revisao2.caso.status).toBe('confirmado');

    // Banco de testes filtrável (paginado)
    const casos = await json(await chamar('GET', `/api/obras/${obra.id}/testes?status=corrigido`));
    expect(casos.total).toBe(1);
    expect(casos.casos.length).toBe(1);
  });

  it('retomada: frases já traduzidas não são retraduzidas', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', {
        titulo: 'Obra',
        prompt_inicial: { versao: '1.0', conteudo: 'Prompt.' },
      }),
    );
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '他说。她走了！' }),
    );
    const capId = criado.capitulo.id;

    await chamar('POST', `/api/capitulos/${capId}/traduzir`, { provedor: 'mock' });
    let detalhe: any;
    for (let i = 0; i < 100; i++) {
      detalhe = await json(await chamar('GET', `/api/capitulos/${capId}`));
      if (detalhe.frases.every((f: any) => f.status_traducao === 'traduzida')) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const textoAntes = detalhe.frases[0].texto_pt;

    // Segundo traduzir sem sobrescrever → nada pendente
    const denovo = await chamar('POST', `/api/capitulos/${capId}/traduzir`, { provedor: 'mock' });
    expect(denovo.status).toBe(400);
    const corpo = await json(denovo);
    expect(corpo.erro.mensagem).toContain('Nenhuma frase pendente');

    const depois = await json(await chamar('GET', `/api/capitulos/${capId}`));
    expect(depois.frases[0].texto_pt).toBe(textoAntes);
  });

  it('tradução exige prompt mãe ativo', async () => {
    const obra = await json(await chamar('POST', '/api/obras', { titulo: 'Sem Prompt' }));
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '他说。' }),
    );
    const resposta = await chamar('POST', `/api/capitulos/${criado.capitulo.id}/traduzir`, { provedor: 'mock' });
    expect(resposta.status).toBe(400);
    expect((await json(resposta)).erro.mensagem).toContain('prompt mãe');
  });

  it('glossário: duplicado dá 409 e importação CSV funciona', async () => {
    const obra = await json(await chamar('POST', '/api/obras', { titulo: 'Obra' }));
    await chamar('POST', `/api/obras/${obra.id}/glossario`, { termo_zh: '灵气', termo_pt: 'qi espiritual' });
    const dup = await chamar('POST', `/api/obras/${obra.id}/glossario`, { termo_zh: '灵气', termo_pt: 'outra coisa' });
    expect(dup.status).toBe(409);

    const importado = await json(
      await chamar('POST', `/api/obras/${obra.id}/glossario/importar`, {
        csv: 'termo_zh,termo_pt,categoria\n修士,cultivador,personagem\n灵气,duplicada,outro\n宗门,seita,entidade',
      }),
    );
    expect(importado).toEqual({ inseridos: 2, duplicados: 1, invalidos: 0 });
  });

  it('mesclar e dividir frases renumera e religa casos de teste', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', { titulo: 'Obra', prompt_inicial: { versao: '1.0', conteudo: 'P.' } }),
    );
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '甲说。乙说。丙说。丁说。' }),
    );
    const capId = criado.capitulo.id;
    let frases = (await json(await chamar('GET', `/api/capitulos/${capId}`))).frases;
    expect(frases.length).toBe(4);

    // Caso de teste apontando para a 2ª frase (será absorvida na mescla)
    const revisao = await json(
      await chamar('POST', `/api/frases/${frases[1].id}/revisar`, { pergunta: 'Por quê?', provedor: 'mock' }),
    );

    // Mescla frases 0 e 1
    const mesclada = await json(
      await chamar('POST', '/api/frases/mesclar', { frase_ids: [frases[0].id, frases[1].id] }),
    );
    expect(mesclada.texto_zh).toBe('甲说。乙说。');
    frases = (await json(await chamar('GET', `/api/capitulos/${capId}`))).frases;
    expect(frases.length).toBe(3);
    expect(frases.map((f: any) => f.ordem)).toEqual([0, 1, 2]);

    // O caso de teste foi religado à frase resultante
    const casos = await json(await chamar('GET', `/api/obras/${obra.id}/testes`));
    expect(casos.casos[0].id).toBe(revisao.caso.id);
    expect(casos.casos[0].frase_id).toBe(mesclada.id);

    // Mescla não-adjacente é rejeitada
    const invalida = await chamar('POST', '/api/frases/mesclar', { frase_ids: [frases[0].id, frases[2].id] });
    expect(invalida.status).toBe(400);

    // Divide a frase mesclada de volta em duas
    const divisao = await json(
      await chamar('POST', `/api/frases/${mesclada.id}/dividir`, {
        texto_zh_1: '甲说。',
        texto_zh_2: '乙说。',
        texto_pt_1: 'A falou.',
        texto_pt_2: '',
      }),
    );
    expect(divisao.primeira.texto_zh).toBe('甲说。');
    expect(divisao.segunda.status_traducao).toBe('pendente');
    frases = (await json(await chamar('GET', `/api/capitulos/${capId}`))).frases;
    expect(frases.length).toBe(4);
    expect(frases.map((f: any) => f.ordem)).toEqual([0, 1, 2, 3]);
    expect(frases.map((f: any) => f.texto_zh)).toEqual(['甲说。', '乙说。', '丙说。', '丁说。']);

    // Divisão que não reconstitui o original é rejeitada
    const divisaoInvalida = await chamar('POST', `/api/frases/${frases[2].id}/dividir`, {
      texto_zh_1: '丙',
      texto_zh_2: 'XYZ',
    });
    expect(divisaoInvalida.status).toBe(400);
  });

  it('exportação e reimportação completa da obra (roundtrip)', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', {
        titulo: 'Original',
        titulo_original: '原作',
        prompt_inicial: { versao: '1.0', conteudo: 'Prompt v1.' },
        glossario_inicial: [{ termo_zh: '终焉', termo_pt: 'Fim', categoria: 'outro' }],
      }),
    );
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '甲说。乙说。' }),
    );
    await chamar('POST', `/api/capitulos/${criado.capitulo.id}/traduzir`, { provedor: 'mock' });
    for (let i = 0; i < 100; i++) {
      const d = await json(await chamar('GET', `/api/capitulos/${criado.capitulo.id}`));
      if (d.frases.every((f: any) => f.status_traducao === 'traduzida')) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const frases = (await json(await chamar('GET', `/api/capitulos/${criado.capitulo.id}`))).frases;
    await chamar('POST', `/api/frases/${frases[0].id}/revisar`, { pergunta: 'Ok?', provedor: 'mock' });

    // Exporta
    const exportado = await json(await chamar('GET', `/api/obras/${obra.id}/exportar`));
    expect(exportado.formato).toBe('dao-tale-export');
    expect(exportado.capitulos[0].frases.length).toBe(2);
    expect(exportado.banco_testes.length).toBe(1);

    // Reimporta como obra nova
    const importada = await json(await chamar('POST', '/api/obras/importar', exportado));
    expect(importada.id).not.toBe(obra.id);
    expect(importada.titulo).toBe('Original');

    const capsImportados = await json(await chamar('GET', `/api/obras/${importada.id}/capitulos`));
    expect(capsImportados.length).toBe(1);
    expect(capsImportados[0].frases_total).toBe(2);
    expect(capsImportados[0].frases_traduzidas).toBe(2);
    const casosImportados = await json(await chamar('GET', `/api/obras/${importada.id}/testes`));
    expect(casosImportados.total).toBe(1);
    const glossarioImportado = await json(await chamar('GET', `/api/obras/${importada.id}/glossario`));
    expect(glossarioImportado.length).toBe(1);

    // Arquivo inválido é rejeitado
    const invalido = await chamar('POST', '/api/obras/importar', { formato: 'outra-coisa' });
    expect(invalido.status).toBe(400);
  });

  it('banco de testes: filtro por data e paginação', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', { titulo: 'Obra', prompt_inicial: { versao: '1.0', conteudo: 'P.' } }),
    );
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '甲说。' }),
    );
    const frases = (await json(await chamar('GET', `/api/capitulos/${criado.capitulo.id}`))).frases;
    for (let i = 0; i < 3; i++) {
      await chamar('POST', `/api/frases/${frases[0].id}/revisar`, { pergunta: `Pergunta ${i}?`, provedor: 'mock' });
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const pagina1 = await json(await chamar('GET', `/api/obras/${obra.id}/testes?de=${hoje}&ate=${hoje}&limite=2&pagina=1`));
    expect(pagina1.total).toBe(3);
    expect(pagina1.casos.length).toBe(2);
    const pagina2 = await json(await chamar('GET', `/api/obras/${obra.id}/testes?limite=2&pagina=2`));
    expect(pagina2.casos.length).toBe(1);
    const futuro = await json(await chamar('GET', `/api/obras/${obra.id}/testes?de=2099-01-01`));
    expect(futuro.total).toBe(0);
  });

  it('versionamento do prompt: só um ativo por vez', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', { titulo: 'Obra', prompt_inicial: { versao: '1.0', conteudo: 'v1' } }),
    );
    const v2 = await json(
      await chamar('POST', `/api/obras/${obra.id}/prompts`, { versao: '2.0', conteudo: 'v2', ativar: true }),
    );
    let lista = await json(await chamar('GET', `/api/obras/${obra.id}/prompts`));
    expect(lista.filter((p: any) => p.ativo).map((p: any) => p.versao)).toEqual(['2.0']);

    const v1 = lista.find((p: any) => p.versao === '1.0');
    await chamar('POST', `/api/prompts/${v1.id}/ativar`);
    lista = await json(await chamar('GET', `/api/obras/${obra.id}/prompts`));
    expect(lista.filter((p: any) => p.ativo).map((p: any) => p.versao)).toEqual(['1.0']);
    expect(v2.ativo).toBe(true);
  });
});
