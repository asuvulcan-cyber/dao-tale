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
        titulo: '第一章 终焉之始',
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

    // Título traduzido junto com o 1º bloco; capítulo completo sai de "traduzindo".
    const capDepois = (await json(await chamar('GET', `/api/capitulos/${capId}`))).capitulo;
    expect(capDepois.titulo_pt).toContain('[título simulado]');
    expect(capDepois.status).toBe('traduzido');

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

  it('obra sem prompt adota o padrão automaticamente ao traduzir', async () => {
    const obra = await json(await chamar('POST', '/api/obras', { titulo: 'Sem Prompt' }));
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '他说。' }),
    );
    const resposta = await chamar('POST', `/api/capitulos/${criado.capitulo.id}/traduzir`, { provedor: 'mock' });
    expect(resposta.status).toBe(202);

    const prompts = await json(await chamar('GET', `/api/obras/${obra.id}/prompts`));
    expect(prompts).toHaveLength(1);
    expect(prompts[0].versao).toBe('1.0');
    expect(prompts[0].ativo).toBe(true);
    expect(prompts[0].notas_versao).toContain('prompt padrão');
  });

  it('traduz título e sinopse do cadastro com o prompt padrão', async () => {
    const resposta = await chamar('POST', '/api/ia/traduzir-detalhes', {
      titulo_zh: '十日终焉',
      sinopse_zh: '他醒来时发现自己在终焉之地。',
      provedor: 'mock',
    });
    expect(resposta.status).toBe(200);
    const dados = await json(resposta);
    expect(dados.titulo_pt).toBeTruthy();
    expect(dados.sinopse_pt).toBeTruthy();

    const invalido = await chamar('POST', '/api/ia/traduzir-detalhes', { provedor: 'mock' });
    expect(invalido.status).toBe(400);
  });

  it('sinopse com vários parágrafos volta inteira (um item por parágrafo)', async () => {
    const paragrafos = ['第一段落的内容。', '第二段落的内容。', '第三段落的内容。'];
    const resposta = await chamar('POST', '/api/ia/traduzir-detalhes', {
      sinopse_zh: paragrafos.join('\n\n'),
      provedor: 'mock',
    });
    expect(resposta.status).toBe(200);
    const dados = await json(resposta);
    // O mock traduz cada frase; a rota remonta os parágrafos com linha em branco.
    const linhas = dados.sinopse_pt.split('\n\n');
    expect(linhas).toHaveLength(3);
    for (const p of paragrafos) expect(dados.sinopse_pt).toContain(p);
  });

  it('prompt padrão: vem semeado, versiona e pode ser adotado explicitamente', async () => {
    // Semeado na criação do banco, com uma versão ativa.
    const versoes = await json(await chamar('GET', '/api/prompt-padrao'));
    expect(versoes).toHaveLength(1);
    expect(versoes[0].ativo).toBe(true);

    // Nova versão ativa; só uma fica ativa por vez.
    await chamar('POST', '/api/prompt-padrao', { versao: '1.1', conteudo: 'Regras revisadas.', ativar: true });
    const depois = await json(await chamar('GET', '/api/prompt-padrao'));
    expect(depois).toHaveLength(2);
    expect(depois.filter((v: any) => v.ativo)).toHaveLength(1);
    expect(depois.find((v: any) => v.ativo).versao).toBe('1.1');

    // Adoção explícita copia a versão ativa para a obra…
    const obra = await json(await chamar('POST', '/api/obras', { titulo: 'Adotante' }));
    const adotado = await json(await chamar('POST', `/api/obras/${obra.id}/prompts/adotar-padrao`));
    expect(adotado.conteudo).toBe('Regras revisadas.');
    expect(adotado.ativo).toBe(true);

    // …e só funciona quando a obra ainda não tem versões.
    const repetida = await chamar('POST', `/api/obras/${obra.id}/prompts/adotar-padrao`);
    expect(repetida.status).toBe(409);
  });

  it('correção rápida: substitui termo em lote por capítulo e por obra', async () => {
    const obra = await json(await chamar('POST', '/api/obras', { titulo: 'Obra' }));
    const cap1 = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '女娲说。女娲笑了。' }),
    );
    const cap2 = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 2, texto_origem: '女娲走了。' }),
    );
    const frasesDe = async (capId: number) => (await json(await chamar('GET', `/api/capitulos/${capId}`))).frases;

    // Simula traduções com o termo errado nos dois capítulos.
    const [f1, f2] = await frasesDe(cap1.capitulo.id);
    const [f3] = await frasesDe(cap2.capitulo.id);
    await chamar('PATCH', `/api/frases/${f1.id}`, { texto_pt: 'Nuwa disse.' });
    await chamar('PATCH', `/api/frases/${f2.id}`, { texto_pt: 'Nuwa sorriu para Nuwa.' });
    await chamar('PATCH', `/api/frases/${f3.id}`, { texto_pt: 'Nuwa foi embora.' });

    // Prévia não altera nada.
    const previa = await json(
      await chamar('POST', `/api/obras/${obra.id}/substituir`, { de: 'Nuwa', para: 'Nüwa', previa: true }),
    );
    expect(previa).toEqual({ frases: 3, capitulos: 2 });
    expect((await frasesDe(cap1.capitulo.id))[0].texto_pt).toBe('Nuwa disse.');

    // Escopo capítulo: só o capítulo 1 muda (todas as ocorrências da frase).
    const noCapitulo = await json(
      await chamar('POST', `/api/obras/${obra.id}/substituir`, { de: 'Nuwa', para: 'Nüwa', capitulo_id: cap1.capitulo.id }),
    );
    expect(noCapitulo.frases).toBe(2);
    const depois1 = await frasesDe(cap1.capitulo.id);
    expect(depois1[1].texto_pt).toBe('Nüwa sorriu para Nüwa.');
    expect(depois1[1].editado_manualmente).toBe(true);
    expect((await frasesDe(cap2.capitulo.id))[0].texto_pt).toBe('Nuwa foi embora.');

    // Escopo obra: pega o que restou.
    const naObra = await json(await chamar('POST', `/api/obras/${obra.id}/substituir`, { de: 'Nuwa', para: 'Nüwa' }));
    expect(naObra.frases).toBe(1);
    expect((await frasesDe(cap2.capitulo.id))[0].texto_pt).toBe('Nüwa foi embora.');

    // de === para é rejeitado.
    const igual = await chamar('POST', `/api/obras/${obra.id}/substituir`, { de: 'x', para: 'x' });
    expect(igual.status).toBe(400);
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

  it('baixa o capítulo traduzido reconstruindo os parágrafos', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', { titulo: 'Obra', prompt_inicial: { versao: '1.0', conteudo: 'P.' } }),
    );
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, {
        numero: 7,
        texto_origem: '甲说。乙说。\n丙说。',
      }),
    );
    const capId = criado.capitulo.id;
    const frases = (await json(await chamar('GET', `/api/capitulos/${capId}`))).frases;
    // Traduz manualmente para controlar o texto esperado
    await chamar('PATCH', `/api/frases/${frases[0].id}`, { texto_pt: 'A falou.' });
    await chamar('PATCH', `/api/frases/${frases[1].id}`, { texto_pt: 'B falou.' });
    await chamar('PATCH', `/api/frases/${frases[2].id}`, { texto_pt: 'C falou.' });

    const resposta = await chamar('GET', `/api/capitulos/${capId}/baixar`);
    expect(resposta.headers.get('content-disposition')).toContain('capitulo-7.txt');
    const texto = await resposta.text();
    // Cabeçalho com o número; frases do mesmo parágrafo unidas por espaço;
    // parágrafos separados por linha em branco
    expect(texto).toBe('Capítulo 7\n\nA falou. B falou.\n\nC falou.');

    const md = await chamar('GET', `/api/capitulos/${capId}/baixar?formato=md`);
    expect(md.headers.get('content-disposition')).toContain('capitulo-7.md');
    expect(await md.text()).toBe('# Capítulo 7\n\nA falou. B falou.\n\nC falou.');

    const bilingue = await (await chamar('GET', `/api/capitulos/${capId}/baixar?formato=bilingue`)).text();
    expect(bilingue).toBe('Capítulo 7\n\n甲说。乙说。\nA falou. B falou.\n\n丙说。\nC falou.');
  });

  it('varredura de consistência do glossário aponta termos fora do cânone', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', {
        titulo: 'Obra',
        prompt_inicial: { versao: '1.0', conteudo: 'P.' },
        glossario_inicial: [{ termo_zh: '终焉', termo_pt: 'Fim Derradeiro' }],
      }),
    );
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '终焉来了。他走了。' }),
    );
    const capId = criado.capitulo.id;
    const frases = (await json(await chamar('GET', `/api/capitulos/${capId}`))).frases;

    await chamar('POST', `/api/capitulos/${capId}/traduzir`, { provedor: 'mock' });
    for (let i = 0; i < 100; i++) {
      const d = await json(await chamar('GET', `/api/capitulos/${capId}`));
      if (d.frases.every((f: any) => f.status_traducao === 'traduzida')) break;
      await new Promise((r) => setTimeout(r, 20));
    }

    // Mock traduz como "[tradução simulada] 终焉来了。" — não contém "Fim Derradeiro" → 1 violação
    const resultado = await json(await chamar('GET', `/api/capitulos/${capId}/consistencia`));
    expect(resultado.ocorrencias).toBe(1);
    expect(resultado.violacoes.length).toBe(1);
    expect(resultado.violacoes[0].termo_pt).toBe('Fim Derradeiro');

    // Corrige a frase usando o cânone (acentos/maiúsculas ignorados) → zero violações
    await chamar('PATCH', `/api/frases/${frases[0].id}`, { texto_pt: 'O FIM DERRADEIRO chegou.' });
    const depois = await json(await chamar('GET', `/api/capitulos/${capId}/consistencia`));
    expect(depois.violacoes.length).toBe(0);
  });

  it('parar_no_limite: 429 interrompe o job e deixa as frases restantes pendentes', async () => {
    await chamar('PUT', '/api/configuracoes', { parar_no_limite: true, tamanho_bloco: 1 });
    const obra = await json(
      await chamar('POST', '/api/obras', { titulo: 'Obra', prompt_inicial: { versao: '1.0', conteudo: 'p' } }),
    );
    // Bloco 1 traduz; bloco 2 contém o marcador que faz o mock devolver 429.
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, {
        numero: 1,
        texto_origem: '第一句话。\nMOCK_LIMITE第二句话。\n第三句话。',
      }),
    );
    const capId = criado.capitulo.id;

    expect((await chamar('POST', `/api/capitulos/${capId}/traduzir`, { provedor: 'mock' })).status).toBe(202);

    // Espera o bloco 1 traduzir e o job parar no limite (sem backoff). O fim do
    // job é observável pela retomada: só é aceita (202, não 409) quando ele morre.
    let frases: any[] = [];
    let retomada = 0;
    for (let i = 0; i < 200; i++) {
      await new Promise((r) => setTimeout(r, 20));
      frases = (await json(await chamar('GET', `/api/capitulos/${capId}`))).frases;
      if (frases[0].status_traducao !== 'traduzida') continue;
      retomada = (await chamar('POST', `/api/capitulos/${capId}/traduzir`, { provedor: 'mock' })).status;
      if (retomada === 202) break;
    }
    expect(retomada).toBe(202);
    // As frases não processadas ficaram pendentes (não "erro"): retraduzíveis.
    expect(frases.map((f: any) => f.status_traducao)).toEqual(['traduzida', 'pendente', 'pendente']);

    // Espera o job da retomada morrer (bate no limite de novo): o registro de jobs
    // é global por capitulo_id e um job vivo vazaria para o teste seguinte.
    for (let i = 0; i < 100; i++) {
      const det = await json(await chamar('GET', `/api/capitulos/${capId}`));
      if (!det.progresso.em_execucao) break;
      await new Promise((r) => setTimeout(r, 20));
    }
  });

  it('job só de título traduz o título de capítulo já concluído sem mudar o status', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', { titulo: 'Obra', prompt_inicial: { versao: '1.0', conteudo: 'p' } }),
    );
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '甲说。\n乙说。' }),
    );
    const capId = criado.capitulo.id;

    await chamar('POST', `/api/capitulos/${capId}/traduzir`, { provedor: 'mock' });
    for (let i = 0; i < 100; i++) {
      const det = await json(await chamar('GET', `/api/capitulos/${capId}`));
      if (det.frases.every((f: any) => f.status_traducao === 'traduzida') && !det.progresso.em_execucao) break;
      await new Promise((r) => setTimeout(r, 20));
    }

    // Título chega depois (ex.: capítulo importado sem título) e a obra já foi finalizada.
    await chamar('PUT', `/api/capitulos/${capId}`, { titulo: '第一章 终焉', status: 'finalizado' });

    expect((await chamar('POST', `/api/capitulos/${capId}/traduzir`, { provedor: 'mock' })).status).toBe(202);
    let cap: any = null;
    for (let i = 0; i < 100; i++) {
      cap = (await json(await chamar('GET', `/api/capitulos/${capId}`))).capitulo;
      if (cap.titulo_pt) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(cap.titulo_pt).toContain('[título simulado]');
    expect(cap.status).toBe('finalizado');
  });

  it('detalhes da obra: sinopse, tags e capa, com roundtrip no export', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', {
        titulo: 'Obra',
        sinopse: 'Um mundo que acaba em dez dias.',
        tags: ['xianxia', 'suspense'],
      }),
    );
    expect(obra.sinopse).toBe('Um mundo que acaba em dez dias.');
    expect(obra.tags).toEqual(['xianxia', 'suspense']);
    expect(obra.tem_capa).toBe(false);

    // Capa: PNG mínimo enviado como corpo binário
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const envio = await app.request(`/api/obras/${obra.id}/capa`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: png,
    });
    expect(envio.status).toBe(200);

    const capa = await app.request(`/api/obras/${obra.id}/capa`);
    expect(capa.status).toBe(200);
    expect(capa.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await capa.arrayBuffer())).toEqual(png);

    // Tipo não permitido é rejeitado
    const invalido = await app.request(`/api/obras/${obra.id}/capa`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'nada',
    });
    expect(invalido.status).toBe(415);

    // Export → import preserva sinopse, tags e capa
    const exportado = await json(await chamar('GET', `/api/obras/${obra.id}/exportar`));
    const importada = await json(await chamar('POST', '/api/obras/importar', exportado));
    expect(importada.sinopse).toBe(obra.sinopse);
    expect(importada.tags).toEqual(obra.tags);
    expect(importada.tem_capa).toBe(true);
    const capa2 = await app.request(`/api/obras/${importada.id}/capa`);
    expect(Buffer.from(await capa2.arrayBuffer())).toEqual(png);
  });

  it('uso de IA: requisições do dia são contadas por provedor/modelo', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', { titulo: 'Obra', prompt_inicial: { versao: '1.0', conteudo: 'p' } }),
    );
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '甲说。' }),
    );
    await chamar('POST', `/api/capitulos/${criado.capitulo.id}/traduzir`, { provedor: 'mock' });
    for (let i = 0; i < 100; i++) {
      const det = await json(await chamar('GET', `/api/capitulos/${criado.capitulo.id}`));
      if (!det.progresso.em_execucao && det.frases[0].status_traducao === 'traduzida') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const uso = await json(await chamar('GET', '/api/uso/hoje'));
    const mock = uso.find((u: any) => u.provedor === 'mock');
    expect(mock.requisicoes).toBeGreaterThanOrEqual(1);
    expect(mock.modelo).toBe('mock-v1');
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
