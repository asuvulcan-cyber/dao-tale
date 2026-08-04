import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, type BancoDados } from './db/index.js';
import { criarApp } from './app.js';
import { _temperaturaMock, _thinkingMock, _zerarCacheMock } from './ia/mock.js';
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

    // Aceitar sem nota herda a descrição da IA (contexto) como nota do glossário.
    const comContexto = sugestoes.find((s: any) => s.contexto);
    expect(comContexto).toBeTruthy();
    const entrada = await json(await chamar('POST', `/api/termos-sugeridos/${comContexto.id}/aceitar`, {}));
    expect(entrada.nota).toBe(comContexto.contexto);

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

    // Aplicar correção com um clique. A troca é CIRÚRGICA: quando a revisão traz
    // o par trecho_errado/trecho_corrigido, só aquele pedaço muda e o resto da
    // frase sobrevive — substituir pela proposta inteira já apagou orações e
    // aspas de diálogo em casos reais.
    const antesDaCorrecao = frases[1].texto_pt as string;
    expect(revisao.caso.trecho_pt_errado).toBeTruthy();
    const aplicado = await json(await chamar('POST', `/api/testes/${revisao.caso.id}/aplicar-correcao`));
    expect(aplicado.caso.status).toBe('corrigido');
    expect(aplicado.frase.texto_pt).toBe(
      antesDaCorrecao.replace(revisao.caso.trecho_pt_errado, revisao.caso.trecho_pt_corrigido),
    );
    // O que estava fora do trecho continua lá — é isto que a troca cirúrgica garante.
    expect(aplicado.frase.texto_pt).toContain(antesDaCorrecao.slice(antesDaCorrecao.indexOf(' ') + 1));
    expect(aplicado.frase.texto_pt).not.toBe(revisao.caso.correcao_proposta);

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

  it('traduz título e sinopse do cadastro (contracapa, sem obra)', async () => {
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

  it('só o campo enviado volta preenchido (o outro não é inventado)', async () => {
    const soTitulo = await json(
      await chamar('POST', '/api/ia/traduzir-detalhes', { titulo_zh: '死人经', provedor: 'mock' }),
    );
    expect(soTitulo.titulo_pt).toBeTruthy();
    expect(soTitulo.sinopse_pt).toBeNull();
  });

  it('substituir do glossário: troca escopada pela origem e por palavra isolada', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', {
        titulo: 'Substituição',
        glossario_inicial: [{ termo_zh: '归墟', termo_pt: 'Abismo do Retorno', categoria: 'local' }],
      }),
    );
    // Cap 1: tem 归墟 no original, tradução antiga "Abismo". Cap 2: NÃO tem 归墟,
    // mas a tradução por acaso contém "Abismo" (não deve ser trocada).
    const cap1 = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '归墟出现了。' }),
    );
    const cap2 = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 2, texto_origem: '天黑了。' }),
    );
    const f1 = (await json(await chamar('GET', `/api/capitulos/${cap1.capitulo.id}`))).frases[0];
    const f2 = (await json(await chamar('GET', `/api/capitulos/${cap2.capitulo.id}`))).frases[0];
    await chamar('PATCH', `/api/frases/${f1.id}`, { texto_pt: 'O Abismo surgiu.' });
    await chamar('PATCH', `/api/frases/${f2.id}`, { texto_pt: 'Um Abismon qualquer.' }); // sem 归墟 + colado

    const entrada = (await json(await chamar('GET', `/api/obras/${obra.id}/glossario`)))[0];

    // Prévia: só a frase do cap 1 conta (cap 2 não tem 归墟).
    const previa = await json(
      await chamar('POST', `/api/glossario/${entrada.id}/substituir`, { de: 'Abismo', previa: true }),
    );
    expect(previa.frases).toBe(1);

    await chamar('POST', `/api/glossario/${entrada.id}/substituir`, { de: 'Abismo', previa: false });
    const d1 = (await json(await chamar('GET', `/api/capitulos/${cap1.capitulo.id}`))).frases[0];
    const d2 = (await json(await chamar('GET', `/api/capitulos/${cap2.capitulo.id}`))).frases[0];
    expect(d1.texto_pt).toBe('O Abismo do Retorno surgiu.');
    expect(d2.texto_pt).toBe('Um Abismon qualquer.'); // intocada: sem 归墟 e "Abismon" não é palavra isolada
  });

  it('variantes: vincula termo a uma canônica, valida e desvincula', async () => {
    const obra = await json(await chamar('POST', '/api/obras', { titulo: 'Variantes' }));
    const canonica = await json(
      await chamar('POST', `/api/obras/${obra.id}/glossario`, { termo_zh: '林芊', termo_pt: 'Lin Qian', categoria: 'personagem' }),
    );
    const variante = await json(
      await chamar('POST', `/api/obras/${obra.id}/glossario`, { termo_zh: '芊芊', termo_pt: 'Qianqian', categoria: 'personagem' }),
    );

    // Vincula a variante à canônica.
    const vinculada = await chamar('POST', `/api/glossario/${variante.id}/vincular`, { principal_id: canonica.id });
    expect(vinculada.status).toBe(200);
    expect((await json(vinculada)).principal_id).toBe(canonica.id);

    // A canônica agora tem uma variante → não pode virar variante de outra.
    const outra = await json(
      await chamar('POST', `/api/obras/${obra.id}/glossario`, { termo_zh: '青鸾', termo_pt: 'Qingluan', categoria: 'local' }),
    );
    const invalida = await chamar('POST', `/api/glossario/${canonica.id}/vincular`, { principal_id: outra.id });
    expect(invalida.status).toBe(400);

    // Vincular a si mesmo é inválido.
    const aSiMesmo = await chamar('POST', `/api/glossario/${variante.id}/vincular`, { principal_id: variante.id });
    expect(aSiMesmo.status).toBe(400);

    // Desvincula.
    const solta = await chamar('POST', `/api/glossario/${variante.id}/vincular`, { principal_id: null });
    expect((await json(solta)).principal_id).toBeNull();

    // Apagar a canônica solta as variantes (não as apaga).
    await chamar('POST', `/api/glossario/${variante.id}/vincular`, { principal_id: canonica.id });
    await chamar('DELETE', `/api/glossario/${canonica.id}`);
    const restantes = await json(await chamar('GET', `/api/obras/${obra.id}/glossario`));
    const aindaVariante = restantes.find((e: any) => e.id === variante.id);
    expect(aindaVariante).toBeTruthy();
    expect(aindaVariante.principal_id).toBeNull();
  });

  it('aparições do glossário: primeira e última no texto, por capítulo', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', {
        titulo: 'Aparições',
        glossario_inicial: [{ termo_zh: '归墟', termo_pt: 'Abismo', categoria: 'local' }],
      }),
    );
    await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '归墟出现了。天黑了。' });
    await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 2, texto_origem: '他走了。他回到了归墟。' });

    const glossario = await json(await chamar('GET', `/api/obras/${obra.id}/glossario`));
    const entrada = glossario.find((e: any) => e.termo_zh === '归墟');
    const aparicoes = await json(await chamar('GET', `/api/obras/${obra.id}/glossario/aparicoes`));
    const ap = aparicoes[String(entrada.id)];
    expect(ap.primeira.capitulo_numero).toBe(1);
    expect(ap.primeira.frase_ordem).toBe(0);
    expect(ap.ultima.capitulo_numero).toBe(2);
    expect(ap.ultima.frase_id).not.toBe(ap.primeira.frase_id);

    // Termo que não aparece no texto: sem âncora.
    const criada = await json(
      await chamar('POST', `/api/obras/${obra.id}/glossario`, { termo_zh: '不存在', termo_pt: 'Ausente' }),
    );
    const aparicoes2 = await json(await chamar('GET', `/api/obras/${obra.id}/glossario/aparicoes`));
    expect(aparicoes2[String(criada.id)].primeira).toBeNull();
  });

  it('sugere termos de uma frase para o glossário e adiciona o escolhido', async () => {
    const obra = await json(await chamar('POST', '/api/obras', { titulo: 'Curadoria' }));
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '林夕走向青鸾学院。' }),
    );
    const capId = criado.capitulo.id;
    await chamar('POST', `/api/capitulos/${capId}/traduzir`, { provedor: 'mock' });
    let frases: any[] = [];
    for (let i = 0; i < 100; i++) {
      const d = await json(await chamar('GET', `/api/capitulos/${capId}`));
      frases = d.frases;
      if (frases.length > 0 && frases.every((f: any) => f.status_traducao === 'traduzida')) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(frases.length).toBeGreaterThan(0);

    const sugestao = await json(await chamar('POST', `/api/frases/${frases[0].id}/sugerir-termos`, { provedor: 'mock' }));
    expect(Array.isArray(sugestao.termos)).toBe(true);
    expect(sugestao.termos.length).toBeGreaterThan(0);
    const termo = sugestao.termos[0];
    expect(termo.contexto).toBeTruthy();

    const criada = await chamar('POST', `/api/obras/${obra.id}/glossario`, {
      termo_zh: termo.termo_zh,
      termo_pt: termo.termo_pt,
      categoria: termo.categoria,
      nota: termo.contexto,
    });
    expect(criada.status).toBe(201);
    const entrada = await json(criada);
    expect(entrada.nota).toBe(termo.contexto);

    // Já catalogado: nova extração não repete o termo.
    const sugestao2 = await json(await chamar('POST', `/api/frases/${frases[0].id}/sugerir-termos`, { provedor: 'mock' }));
    expect(sugestao2.termos.some((t: any) => t.termo_zh === termo.termo_zh)).toBe(false);
  });

  it('sinopse vai inteira numa chamada e volta com versos e parágrafos preservados', async () => {
    // Dois versos paralelos (uma linha cada, sem linha em branco entre eles) e
    // um parágrafo de resenha: a forma que o formato numerado antigo destruía.
    const sinopse = '一本死人经，半部无道书。\n斩尽千人头，啖吞百身骨。\n\n非常难得的一本传统武侠小说。';
    const resposta = await chamar('POST', '/api/ia/traduzir-detalhes', { sinopse_zh: sinopse, provedor: 'mock' });
    expect(resposta.status).toBe(200);
    const dados = await json(resposta);
    // Mesma estrutura do original: 4 linhas, a 3ª em branco (fronteira de parágrafo).
    const linhas = dados.sinopse_pt.split('\n');
    expect(linhas).toHaveLength(4);
    expect(linhas[2]).toBe('');
    expect(dados.sinopse_pt.split('\n\n')).toHaveLength(2);
    for (const trecho of sinopse.split('\n').filter(Boolean)) {
      expect(dados.sinopse_pt).toContain(trecho);
    }
  });

  it('prompt padrão: vem semeado, versiona e pode ser adotado explicitamente', async () => {
    // Semeados na criação do banco (doc 08 §12): o núcleo em uso, ativo, e o
    // enxuto, INATIVO — ativar é decisão do usuário depois do portão A/B.
    const versoes = await json(await chamar('GET', '/api/prompt-padrao'));
    expect(versoes).toHaveLength(2);
    expect(versoes.filter((v: any) => v.ativo)).toHaveLength(1);
    expect(versoes.find((v: any) => v.ativo).conteudo).not.toContain('{{PREFERENCIAS_OBRA}}');
    expect(versoes.find((v: any) => !v.ativo).conteudo).toContain('## 3. DEMONSTRATIVOS');

    // Nova versão ativa; só uma fica ativa por vez.
    await chamar('POST', '/api/prompt-padrao', { versao: '1.1', conteudo: 'Regras revisadas.', ativar: true });
    const depois = await json(await chamar('GET', '/api/prompt-padrao'));
    expect(depois).toHaveLength(3);
    expect(depois.filter((v: any) => v.ativo)).toHaveLength(1);
    expect(depois.find((v: any) => v.ativo).versao).toBe('1.1');

    // Adoção explícita cria um delta VAZIO sobre o núcleo (não copia o prompt):
    // o texto efetivo enviado à IA é a composição núcleo ativo + delta.
    const obra = await json(await chamar('POST', '/api/obras', { titulo: 'Adotante' }));
    const adotado = await json(await chamar('POST', `/api/obras/${obra.id}/prompts/adotar-padrao`));
    expect(adotado.tipo).toBe('delta');
    expect(adotado.conteudo).toBe('');
    expect(adotado.ativo).toBe(true);
    const composto = await json(await chamar('GET', `/api/obras/${obra.id}/prompt-composto`));
    expect(composto.texto).toContain('Regras revisadas.');
    expect(composto.nucleo.versao).toBe('1.1');

    // Delta com conteúdo entra como Seção 6 na composição — e melhorias do
    // núcleo fluem para a obra sem tocar no delta.
    await chamar('POST', `/api/obras/${obra.id}/prompts`, {
      versao: '1.1',
      conteudo: 'Lin Feng fala sempre em gírias.',
      ativar: true,
    });
    await chamar('POST', '/api/prompt-padrao', { versao: '1.2', conteudo: 'Regras revisadas de novo.', ativar: true });
    const composto2 = await json(await chamar('GET', `/api/obras/${obra.id}/prompt-composto`));
    expect(composto2.texto).toContain('## 6. DIRETRIZES ESPECÍFICAS DA OBRA');
    expect(composto2.texto).toContain('Lin Feng fala sempre em gírias.');
    expect(composto2.texto).toContain('Regras revisadas de novo.');
    expect(composto2.prompt.tipo).toBe('delta');

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

    // A tabela tem CHECK em `categoria`: categoria fora da lista tem de ser
    // recusada NA ROTA, com o motivo. Antes vazava um 500 com o texto do CHECK
    // do SQLite direto na tela.
    const invalida = await chamar('POST', `/api/obras/${obra.id}/glossario`, {
      termo_zh: '刀',
      termo_pt: 'sabre',
      categoria: 'objeto',
    });
    expect(invalida.status).toBe(400);
    const corpo = await json(invalida);
    expect(corpo.erro.codigo).toBe('payload-invalido');
    expect(corpo.erro.mensagem).toContain('categoria');
    // E as seis válidas continuam passando.
    const valida = await chamar('POST', `/api/obras/${obra.id}/glossario`, {
      termo_zh: '刀',
      termo_pt: 'sabre',
      categoria: 'outro',
    });
    expect(valida.status).toBe(201);
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

  // Doc 11: telemetria de ponta a ponta com o provedor simulado — o consumo real
  // de cada chamada precisa chegar ao painel sem gastar um centavo.
  it('telemetria: traduzir grava tokens reais por capítulo e o painel os agrega', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', { titulo: 'Obra', prompt_inicial: { versao: '1.0', conteudo: 'p'.repeat(400) } }),
    );
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '甲说。乙答。' }),
    );
    await chamar('POST', `/api/capitulos/${criado.capitulo.id}/traduzir`, { provedor: 'mock' });
    for (let i = 0; i < 100; i++) {
      const det = await json(await chamar('GET', `/api/capitulos/${criado.capitulo.id}`));
      if (!det.progresso.em_execucao && det.frases[0].status_traducao === 'traduzida') break;
      await new Promise((r) => setTimeout(r, 20));
    }

    const t = await json(await chamar('GET', `/api/obras/${obra.id}/telemetria`));
    expect(t.total.chamadas).toBeGreaterThanOrEqual(1);
    expect(t.total.tokens_entrada).toBeGreaterThan(0);
    expect(t.total.tokens_saida).toBeGreaterThan(0);
    expect(t.por_papel.map((p: any) => p.papel)).toContain('traducao');
    const cap = t.capitulos.find((c: any) => c.capitulo_id === criado.capitulo.id);
    expect(cap.chamadas).toBeGreaterThanOrEqual(1);
    // O simulado não tem preço cadastrado: custo desconhecido, nunca US$ 0,00.
    expect(t.total.chamadas_sem_preco).toBe(t.total.chamadas);
    expect(t.sem_preco).toEqual([{ provedor: 'mock', modelo: 'mock-v1', chamadas: t.total.chamadas }]);
    expect(cap.custo_por_mil_frases).toBeNull();
    // Qualidade na mesma linha do custo, vinda de onde já é computada.
    expect(cap.frases_total).toBe(2);
    expect(cap.frases_editadas).toBe(0);

    const dia = await json(await chamar('GET', '/api/telemetria/dia'));
    const mock = dia.provedores.find((p: any) => p.provedor === 'mock');
    // Tentativas (cota) >= chamadas faturadas: a diferença é o desperdício.
    expect(mock.tentativas).toBeGreaterThanOrEqual(mock.chamadas);
  });

  it('telemetria: cadastrar preço e recalcular preenche o custo do histórico', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', { titulo: 'Obra', prompt_inicial: { versao: '1.0', conteudo: 'p'.repeat(400) } }),
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

    await chamar('PUT', '/api/configuracoes', {
      precos_modelos: { 'mock:*': { entrada: 3, saida: 15 } },
      taxa_usd_brl: 5.5,
    });
    const r = await json(await chamar('POST', '/api/telemetria/recalcular'));
    expect(r.atualizados).toBeGreaterThanOrEqual(1);

    const t = await json(await chamar('GET', `/api/obras/${obra.id}/telemetria`));
    expect(t.total.chamadas_sem_preco).toBe(0);
    expect(t.total.custo_usd).toBeGreaterThan(0);
    expect(t.taxa_usd_brl).toBe(5.5);
  });

  // Doc 08 §13: a temperatura resolvida (padrão do papel, ou override da obra)
  // tem de chegar ao provedor pela rota real — é o que faltava até aqui, e a
  // ausência era invisível justamente por não quebrar nada.
  it('temperatura: o padrão do papel e o override da obra chegam ao provedor', async () => {
    _zerarCacheMock();
    const obra = await json(
      await chamar('POST', '/api/obras', { titulo: 'Obra', prompt_inicial: { versao: '1.0', conteudo: 'p' } }),
    );
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '甲说。' }),
    );
    const traduzir = async () => {
      await chamar('POST', `/api/capitulos/${criado.capitulo.id}/traduzir`, {
        provedor: 'mock',
        sobrescrever: true,
      });
      for (let i = 0; i < 100; i++) {
        const det = await json(await chamar('GET', `/api/capitulos/${criado.capitulo.id}`));
        if (!det.progresso.em_execucao && det.frases[0].status_traducao === 'traduzida') return;
        await new Promise((r) => setTimeout(r, 20));
      }
    };

    await traduzir();
    expect(_temperaturaMock('traducao')).toBe(0.3);

    // Configuração global por papel.
    await chamar('PUT', '/api/configuracoes', { temperaturas: { traducao: 0.1 } });
    await traduzir();
    expect(_temperaturaMock('traducao')).toBe(0.1);

    // Salvar só um papel não devolve os outros ao padrão…
    const estado = await json(await chamar('GET', '/api/configuracoes'));
    expect(estado.configuracoes.temperaturas).toEqual({
      traducao: 0.1,
      revisao: 0.2,
      qa: 0.2,
      extracao: 0.2,
      titulo: 0.4,
      refinamento: 0.5,
    });

    // …e o override da obra vence a configuração, em todos os papéis dela.
    await chamar('PUT', `/api/obras/${obra.id}`, { temperatura: 0.8 });
    await traduzir();
    expect(_temperaturaMock('traducao')).toBe(0.8);

    // Raciocínio: sem escolha da obra nada é mandado (o padrão do provedor vale);
    // escolhido, atravessa job → bloco → provedor. Medido na 死人经: com thinking
    // ligado, 86% dos tokens de SAÍDA de um capítulo eram raciocínio.
    expect(_thinkingMock('traducao')).toBeUndefined();
    await chamar('PUT', `/api/obras/${obra.id}`, { thinking: 'desligado' });
    await traduzir();
    expect(_thinkingMock('traducao')).toBe('desligado');
    await chamar('PUT', `/api/obras/${obra.id}`, { thinking: null });
    await traduzir();
    expect(_thinkingMock('traducao')).toBeUndefined();
    const modoRuim = await chamar('PUT', `/api/obras/${obra.id}`, { thinking: 'talvez' });
    expect(modoRuim.status).toBe(400);

    const frases = (await json(await chamar('GET', `/api/capitulos/${criado.capitulo.id}`))).frases;
    await chamar('POST', `/api/frases/${frases[0].id}/revisar`, { pergunta: 'Está certo?', provedor: 'mock' });
    expect(_temperaturaMock('revisao')).toBe(0.8);

    await chamar('POST', '/api/ia/traduzir-detalhes', {
      obra_id: obra.id,
      titulo_zh: '十日终焉',
      provedor: 'mock',
    });
    expect(_temperaturaMock('contracapa')).toBe(0.8);

    // Fora da faixa é recusado na rota — a obra continua com o valor bom.
    const ruim = await chamar('PUT', `/api/obras/${obra.id}`, { temperatura: 9 });
    expect(ruim.status).toBe(400);
    expect((await json(await chamar('GET', `/api/obras/${obra.id}`))).temperatura).toBe(0.8);

    // Limpar o override volta ao padrão do papel (agora 0.1).
    await chamar('PUT', `/api/obras/${obra.id}`, { temperatura: null });
    await traduzir();
    expect(_temperaturaMock('traducao')).toBe(0.1);
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

describe('operação e durabilidade (doc 10)', () => {
  it('GET /saude expõe porta, pasta, canônico e resumo de backups', async () => {
    const saude = await json(await chamar('GET', '/api/saude'));
    expect(saude.ok).toBe(true);
    expect(typeof saude.porta).toBe('number');
    expect(typeof saude.caminho_dados).toBe('string');
    // DAO_TALE_DIR está definido nos testes → não é a instância canônica.
    expect(saude.canonico).toBe(false);
    expect(saude.backups).toHaveProperty('total');
  });

  it('POST /sistema/backup cria um backup e ele passa a ser o mais novo', async () => {
    const antes = (await json(await chamar('GET', '/api/saude'))).backups.total as number;
    const r = await chamar('POST', '/api/sistema/backup');
    expect(r.status).toBe(200);
    const corpo = await json(r);
    expect(corpo.ok).toBe(true);
    expect(corpo.backup.nome).toMatch(/^dao-tale-.*-manual\.db$/);

    const depois = await json(await chamar('GET', '/api/saude'));
    // O total NÃO é asserção válida: a rotação (doc 10 §1) segura em 10, então a
    // partir do 10º backup ele para de subir — o que a rota promete é que o
    // backup novo existe e é o mais recente.
    expect(depois.backups.total).toBeGreaterThanOrEqual(Math.min(antes + 1, 10));
    expect(depois.backups.ultimo).toBe(corpo.backup.em);
  });
});
