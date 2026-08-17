import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { criarApp } from '../app.js';
import { reposGlossario } from '../db/repos.js';
import type { Hono } from 'hono';

// GET /obras/:id/consistencia: a mesma varredura de `varrerConsistencia` (usada
// por capítulo em GET /capitulos/:id/consistencia), só que na OBRA inteira e
// agrupada por TERMO — porque o conserto (POST /glossario/:id/substituir) é por
// termo, não por frase.

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

// Traduz com o provedor mock (latência zerada nos testes) e espera o job
// terminar — mesmo padrão de app.test.ts, para não depender de tempo real.
async function traduzirEEsperar(capId: number): Promise<any[]> {
  await chamar('POST', `/api/capitulos/${capId}/traduzir`, { provedor: 'mock' });
  let frases: any[] = [];
  for (let i = 0; i < 100; i++) {
    const det = await json(await chamar('GET', `/api/capitulos/${capId}`));
    frases = det.frases;
    if (frases.length > 0 && frases.every((f: any) => f.status_traducao === 'traduzida')) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  return frases;
}

describe('GET /obras/:id/consistencia', () => {
  let obraId: number;
  let obraIdComDoisTermos: number;
  let obraLimpaId: number;
  let fraseId: number;
  let numeroDeFrasesTraduzidas: number;

  beforeEach(async () => {
    db = abrirBanco(':memory:');
    app = criarApp(db);

    // Obra principal: um termo (金鹏堡) com três ocorrências no chinês,
    // espalhadas em dois capítulos, e só uma tradução canônica — as outras
    // duas ficam com a tradução simulada do mock, que nunca contém o termo.
    const obra = await json(
      await chamar('POST', '/api/obras', {
        titulo: 'Consistência da obra',
        glossario_inicial: [{ termo_zh: '金鹏堡', termo_pt: 'Forte da Águia Dourada', categoria: 'local' }],
      }),
    );
    obraId = obra.id;

    const cap1 = await json(
      await chamar('POST', `/api/obras/${obraId}/capitulos`, {
        numero: 1,
        texto_origem: '金鹏堡的守卫说了。金鹏堡的钟声响了。',
      }),
    );
    const cap2 = await json(
      await chamar('POST', `/api/obras/${obraId}/capitulos`, {
        numero: 2,
        texto_origem: '金鹏堡的旗帜飘扬。天黑了。',
      }),
    );
    // Capítulo 3 fica sem tradução (status_traducao continua 'pendente') — é o
    // que prova que a rota só examina frase traduzida.
    await chamar('POST', `/api/obras/${obraId}/capitulos`, { numero: 3, texto_origem: '天很蓝。' });

    const frasesCap1 = await traduzirEEsperar(cap1.capitulo.id);
    const frasesCap2 = await traduzirEEsperar(cap2.capitulo.id);
    numeroDeFrasesTraduzidas = frasesCap1.length + frasesCap2.length;

    // Corrige só a 1ª frase do cap1 com o termo canônico: ela escapa da
    // violação. As outras duas (cap1[1] e cap2[0]) continuam com "[tradução
    // simulada] ...", que não contém "Forte da Águia Dourada".
    await chamar('PATCH', `/api/frases/${frasesCap1[0].id}`, {
      texto_pt: 'O guarda do Forte da Águia Dourada gritou.',
    });
    // Uma das duas frases que ainda violam — usada no teste de dispensa.
    fraseId = frasesCap2[0].id;

    // Segunda obra: dois termos com contagens de violação diferentes, para
    // testar a ordenação decrescente (nenhuma frase é corrigida aqui — as três
    // ficam com a tradução simulada, então violam).
    const obra2 = await json(
      await chamar('POST', '/api/obras', {
        titulo: 'Dois termos',
        glossario_inicial: [
          { termo_zh: '天音寺', termo_pt: 'Templo do Som Celestial', categoria: 'local' },
          { termo_zh: '风墨阁', termo_pt: 'Pavilhão Vento e Tinta', categoria: 'local' },
        ],
      }),
    );
    obraIdComDoisTermos = obra2.id;
    const capA = await json(
      await chamar('POST', `/api/obras/${obraIdComDoisTermos}/capitulos`, {
        numero: 1,
        texto_origem: '天音寺的钟声响了。天音寺的僧人来了。风墨阁的灯亮了。',
      }),
    );
    await traduzirEEsperar(capA.capitulo.id);

    // Terceira obra: sem glossário, sem violação possível.
    const obra3 = await json(await chamar('POST', '/api/obras', { titulo: 'Obra limpa' }));
    obraLimpaId = obra3.id;
    const capLimpo = await json(
      await chamar('POST', `/api/obras/${obraLimpaId}/capitulos`, { numero: 1, texto_origem: '天很蓝。' }),
    );
    await traduzirEEsperar(capLimpo.capitulo.id);
  });

  // 小心 → Xiao Xin: na obra real o gatilho aparece em 8 frases traduzidas e só 1
  // é a personagem — as outras 7 são a expressão comum. A varredura direta erra
  // a maioria das vezes, então o termo marcado `ambiguo` sai da CONTAGEM e vai
  // para uma lista de conferência. Estes testes cobrem `por_termo_ambiguo`, que
  // é a metade visível da Task 7.
  describe('termo ambíguo', () => {
    async function comTermoAmbiguo(ambiguo: boolean) {
      const termos = reposGlossario.listar(db, obraId);
      const alvo = termos.find((t) => t.termo_zh === '金鹏堡')!;
      reposGlossario.atualizar(db, alvo.id, { ambiguo });
      return await json(await chamar('GET', `/api/obras/${obraId}/consistencia`));
    }

    it('sai da contagem de violações quando marcado', async () => {
      const antes = await comTermoAmbiguo(false);
      expect(antes.por_termo).toHaveLength(1);

      const depois = await comTermoAmbiguo(true);
      expect(depois.por_termo).toHaveLength(0);
    });

    it('mas NÃO some da tela — reaparece para conferência caso a caso', async () => {
      // Silenciar de vez seria trocar ruído por cegueira: o revisor ainda
      // precisa conferir se escreveu o nome certo quando ele É o nome.
      const { por_termo_ambiguo } = await comTermoAmbiguo(true);
      expect(por_termo_ambiguo).toHaveLength(1);
      expect(por_termo_ambiguo[0].termo_zh).toBe('金鹏堡');
      expect(por_termo_ambiguo[0].ocorrencias.length).toBeGreaterThan(0);
    });

    it('lista TODAS as ocorrências do gatilho, não só as que seriam violação', async () => {
      // A pergunta ali não é "acertou ou errou" — o gatilho nem sempre é o
      // termo. Então a frase que CONTÉM a tradução canônica também entra, e a
      // lista é maior que a de violações. É isso que a distingue de uma
      // varredura que só mudou de nome.
      const comoViolacao = await comTermoAmbiguo(false);
      const violacoes = comoViolacao.por_termo[0].violacoes.length;

      const { por_termo_ambiguo } = await comTermoAmbiguo(true);
      const ocorrencias = por_termo_ambiguo[0].ocorrencias.length;
      expect(ocorrencias).toBeGreaterThan(violacoes);
      // Todas as frases traduzidas cujo CHINÊS traz o gatilho — inclusive a que
      // já usa o termo canônico.
      expect(ocorrencias).toBe(3);
      expect(violacoes).toBe(2);
    });

    it('leva a nota de uso junto, que é o que explica a ambiguidade', async () => {
      const termos = reposGlossario.listar(db, obraId);
      const alvo = termos.find((t) => t.termo_zh === '金鹏堡')!;
      reposGlossario.atualizar(db, alvo.id, { ambiguo: true, nota_uso: 'Só é o forte quando for lugar.' });
      const { por_termo_ambiguo } = await json(await chamar('GET', `/api/obras/${obraId}/consistencia`));
      expect(por_termo_ambiguo[0].nota_uso).toBe('Só é o forte quando for lugar.');
    });

    it('sem termo ambíguo, a lista sai vazia e nada muda', async () => {
      const { por_termo, por_termo_ambiguo } = await comTermoAmbiguo(false);
      expect(por_termo_ambiguo).toEqual([]);
      expect(por_termo).toHaveLength(1);
    });
  });

  it('agrupa por termo, não por frase', async () => {
    const r = await app.request(`/api/obras/${obraId}/consistencia`);
    expect(r.status).toBe(200);
    const { por_termo } = await r.json();
    // Duas frases sem o mesmo termo saem num grupo só.
    expect(por_termo).toHaveLength(1);
    expect(por_termo[0].termo_zh).toBe('金鹏堡');
    expect(por_termo[0].violacoes).toHaveLength(2);
  });

  it('atravessa os capítulos e diz de qual cada frase veio', async () => {
    const { por_termo } = await (await app.request(`/api/obras/${obraId}/consistencia`)).json();
    const capitulos = por_termo[0].violacoes.map((v: { capitulo_numero: number }) => v.capitulo_numero).sort();
    expect(capitulos).toEqual([1, 2]);
  });

  it('ordena por número de violações, decrescente', async () => {
    // O termo que mais derivou aparece primeiro — é por ele que o revisor começa.
    const { por_termo } = await (await app.request(`/api/obras/${obraIdComDoisTermos}/consistencia`)).json();
    expect(por_termo[0].violacoes.length).toBeGreaterThanOrEqual(por_termo[1].violacoes.length);
  });

  it('respeita a dispensa registrada pelo revisor', async () => {
    await app.request(`/api/frases/${fraseId}/consistencia/dispensar`, {
      method: 'POST',
      body: JSON.stringify({ termo_zh: '金鹏堡' }),
      headers: { 'content-type': 'application/json' },
    });
    const { por_termo } = await (await app.request(`/api/obras/${obraId}/consistencia`)).json();
    expect(por_termo[0].violacoes).toHaveLength(1);
  });

  it('só examina frase traduzida', async () => {
    // Frase pendente não tem tradução para comparar; acusá-la seria ruído.
    const { frases_examinadas } = await (await app.request(`/api/obras/${obraId}/consistencia`)).json();
    expect(frases_examinadas).toBe(numeroDeFrasesTraduzidas);
  });

  it('obra sem violação devolve lista vazia, não erro', async () => {
    const r = await app.request(`/api/obras/${obraLimpaId}/consistencia`);
    expect(r.status).toBe(200);
    expect((await r.json()).por_termo).toEqual([]);
  });

  it('termo de 1 caractere não gera violação e é contado à parte', async () => {
    // Filtro que já existe em varrerConsistencia: um caractere aparece dentro de
    // dezenas de palavras comuns e só produziria ruído. A contagem sai separada
    // para a tela poder explicar a ausência em vez de o revisor achar que falhou.
    reposGlossario.criar(db, obraId, { termo_zh: '堡', termo_pt: 'fortaleza', categoria: 'lugar' });
    const { termos_curtos_ignorados, por_termo } = await (
      await app.request(`/api/obras/${obraId}/consistencia`)
    ).json();
    expect(termos_curtos_ignorados).toBe(1);
    expect(por_termo.some((t: { termo_zh: string }) => t.termo_zh === '堡')).toBe(false);
  });

  // Achado da revisão (rodada 1, item 1): o único teste de ordenação usava
  // 2 violações vs. 1, que nunca empatam — remover o desempate do comparador
  // não quebrava nada. Este cenário força o empate: as duas frases violam
  // exatamente 1 vez cada, e a frase de "Zebra Torre" (alfabeticamente por
  // ÚLTIMO) vem ANTES da de "Abelha Vila" no capítulo — se o comparador só
  // olhasse a contagem, o sort (estável) manteria essa ordem de descoberta,
  // que é a errada.
  it('empate na contagem: desempata pelo termo em pt-BR, para a lista não dançar entre chamadas iguais', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', {
        titulo: 'Empate',
        glossario_inicial: [
          { termo_zh: '龙渊阁', termo_pt: 'Zebra Torre', categoria: 'local' },
          { termo_zh: '玄水城', termo_pt: 'Abelha Vila', categoria: 'local' },
        ],
      }),
    );
    const cap = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, {
        numero: 1,
        texto_origem: '龙渊阁的门开了。玄水城的墙塌了。',
      }),
    );
    await traduzirEEsperar(cap.capitulo.id);
    // Nenhuma das duas frases é corrigida: as duas violam, 1 x 1 — empate.

    const { por_termo } = await (await app.request(`/api/obras/${obra.id}/consistencia`)).json();
    expect(por_termo).toHaveLength(2);
    expect(por_termo[0].violacoes).toHaveLength(1);
    expect(por_termo[1].violacoes).toHaveLength(1);
    expect(por_termo.map((t: { termo_pt: string }) => t.termo_pt)).toEqual(['Abelha Vila', 'Zebra Torre']);
  });

  // Achado da revisão (rodada 1, item 2): o agrupamento é por TERMO, então uma
  // frase que viola dois termos precisa aparecer nos DOIS grupos — se alguém
  // trocasse o agrupamento por um Map chaveado por frase, a segunda violação
  // sumiria sem erro nenhum. Este teste existe só para pegar essa regressão.
  it('uma frase que viola dois termos aparece nos dois grupos', async () => {
    const obra = await json(
      await chamar('POST', '/api/obras', {
        titulo: 'Dois termos numa frase',
        glossario_inicial: [
          { termo_zh: '龙渊阁', termo_pt: 'Pavilhão do Abismo do Dragão', categoria: 'local' },
          { termo_zh: '玄水城', termo_pt: 'Cidade das Águas Sombrias', categoria: 'local' },
        ],
      }),
    );
    const cap = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, {
        numero: 1,
        texto_origem: '龙渊阁的人来到了玄水城。',
      }),
    );
    await traduzirEEsperar(cap.capitulo.id);
    const fraseUnica = (await json(await chamar('GET', `/api/capitulos/${cap.capitulo.id}`))).frases[0];
    // Nenhum dos dois termos foi corrigido: a mesma frase viola os dois.

    const { por_termo } = await (await app.request(`/api/obras/${obra.id}/consistencia`)).json();
    expect(por_termo).toHaveLength(2);
    for (const grupo of por_termo) {
      expect(grupo.violacoes).toHaveLength(1);
      expect(grupo.violacoes[0].frase_id).toBe(fraseUnica.id);
    }
  });
});
