import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Hono } from 'hono';
import { agendarRevisao, rotuloIntervalo, segmentosCobremFrase, somarDias } from '@dao-tale/shared';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { criarApp } from '../app.js';
import { reposVocabulario } from '../db/repos.js';
import { provedorMock } from '../ia/mock.js';
import { sistemaTutorBase, usuarioCorrigirTutor } from '../ia/promptTutor.js';

// Modo tutor (doc 29): explicação guardada por frase, correção da tentativa,
// gravação da tradução de quem aprende e vocabulário com repetição espaçada.

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

afterEach(() => vi.restoreAllMocks());

describe('tutor por frase', () => {
  let capId: number;
  let frases: { id: number; ordem: number; texto_zh: string }[];

  beforeEach(async () => {
    db = abrirBanco(':memory:');
    app = criarApp(db);
    const obra = await json(await chamar('POST', '/api/obras', { titulo: 'Obra' }));
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '他走了。她笑了。' }),
    );
    capId = criado.capitulo.id;
    frases = (await json(await chamar('GET', `/api/capitulos/${capId}`))).frases;
  });

  it('frase nunca estudada devolve estado vazio', async () => {
    const estado = await json(await chamar('GET', `/api/frases/${frases[0].id}/tutor`));
    expect(estado).toMatchObject({ frase_id: frases[0].id, explicacao: null, tentativas: 0, salva_em: null });
  });

  it('explica uma vez e guarda: reabrir não chama o provedor de novo', async () => {
    const espiao = vi.spyOn(provedorMock, 'explicarFraseTutor');
    const primeira = await json(await chamar('POST', `/api/frases/${frases[0].id}/tutor/explicar`, {}));
    expect(primeira.explicacao.segmentos.map((s: { texto: string }) => s.texto).join('')).toBe(frases[0].texto_zh);
    expect(primeira.explicacao.traducao).toContain('[tutor simulado]');

    const segunda = await json(await chamar('POST', `/api/frases/${frases[0].id}/tutor/explicar`, {}));
    expect(segunda.explicacao).toEqual(primeira.explicacao);
    expect(espiao).toHaveBeenCalledTimes(1);

    // refazer força nova chamada
    await chamar('POST', `/api/frases/${frases[0].id}/tutor/explicar`, { refazer: true });
    expect(espiao).toHaveBeenCalledTimes(2);
  });

  it('manda nível, idioma e contexto vizinho ao provedor, e registra o custo como papel tutor', async () => {
    const espiao = vi.spyOn(provedorMock, 'explicarFraseTutor');
    await chamar('POST', `/api/frases/${frases[1].id}/tutor/explicar`, {});
    const req = espiao.mock.calls[0][1];
    expect(req.idioma_origem).toBe('zh');
    expect(req.nivel).toBe('zero');
    expect(req.frase).toBe(frases[1].texto_zh);
    expect(req.antes.map((a) => a.origem)).toEqual([frases[0].texto_zh]);

    const papeis = db.prepare('SELECT papel FROM eventos_ia').all() as { papel: string }[];
    expect(papeis).toEqual([{ papel: 'tutor' }]);
  });

  it('nível por idioma: mudar o inglês não devolve o mandarim ao padrão', async () => {
    await chamar('PUT', '/api/configuracoes', { nivel_idioma: { zh: 'basico' } });
    const config = await json(await chamar('PUT', '/api/configuracoes', { nivel_idioma: { en: 'avancado' } }));
    expect(config.nivel_idioma).toEqual({ zh: 'basico', en: 'avancado' });
  });

  it('dicas vistas só sobem', async () => {
    await chamar('POST', `/api/frases/${frases[0].id}/tutor/dicas`, { dicas: 2 });
    const estado = await json(await chamar('POST', `/api/frases/${frases[0].id}/tutor/dicas`, { dicas: 1 }));
    expect(estado.dicas_vistas).toBe(2);
  });

  it('corrige a tentativa usando a tradução sugerida como referência e conta as tentativas', async () => {
    const espiao = vi.spyOn(provedorMock, 'corrigirTentativaTutor');
    await chamar('POST', `/api/frases/${frases[0].id}/tutor/explicar`, {});
    const r1 = await json(await chamar('POST', `/api/frases/${frases[0].id}/tutor/corrigir`, { tentativa: 'Ele foi.' }));
    expect(r1.correcao.veredito).toBe('quase');
    expect(r1.tentativa).toBe('Ele foi.');
    expect(espiao.mock.calls[0][1].explicacao?.traducao).toContain('[tutor simulado]');

    const r2 = await json(await chamar('POST', `/api/frases/${frases[0].id}/tutor/corrigir`, { tentativa: 'Ele foi embora.' }));
    expect(r2.tentativas).toBe(2);
  });

  it('recusa corrigir tentativa vazia', async () => {
    const r = await chamar('POST', `/api/frases/${frases[0].id}/tutor/corrigir`, { tentativa: '   ' });
    expect(r.status).toBe(400);
  });

  it('salvar marca a frase como traduzida pelo tutor e fecha o capítulo quando é a última', async () => {
    const r = await json(await chamar('POST', `/api/frases/${frases[0].id}/tutor/salvar`, { texto_pt: 'Ele foi embora.' }));
    expect(r.frase).toMatchObject({ texto_pt: 'Ele foi embora.', status_traducao: 'traduzida', origem_edicao: 'tutor' });
    expect(r.estado.salva_em).not.toBeNull();
    expect((await json(await chamar('GET', `/api/capitulos/${capId}`))).capitulo.status).toBe('rascunho');

    await chamar('POST', `/api/frases/${frases[1].id}/tutor/salvar`, { texto_pt: 'Ela riu.' });
    expect((await json(await chamar('GET', `/api/capitulos/${capId}`))).capitulo.status).toBe('traduzido');

    const marcadas = await json(await chamar('GET', `/api/capitulos/${capId}/tutor`));
    expect(marcadas.map((m: { frase_id: number }) => m.frase_id).sort()).toEqual(frases.map((f) => f.id).sort());
  });

  it('texto original mudou (divisão): a explicação velha é descartada', async () => {
    await chamar('POST', `/api/frases/${frases[0].id}/tutor/explicar`, {});
    const div = await chamar('POST', `/api/frases/${frases[0].id}/dividir`, { texto_zh_1: '他', texto_zh_2: '走了。' });
    expect(div.status).toBe(200);
    const estado = await json(await chamar('GET', `/api/frases/${frases[0].id}/tutor`));
    expect(estado.explicacao).toBeNull();
  });
});

describe('vocabulário', () => {
  beforeEach(() => {
    db = abrirBanco(':memory:');
    app = criarApp(db);
  });

  it('adicionar de novo não zera o progresso, só completa o que faltava', async () => {
    const r1 = await chamar('POST', '/api/vocabulario', { idioma: 'zh', termo: '走', significado: 'andar; ir embora' });
    expect(r1.status).toBe(201);
    const { palavra } = await json(r1);
    await chamar('POST', `/api/vocabulario/${palavra.id}/revisar`, { nota: 2 });

    const r2 = await chamar('POST', '/api/vocabulario', {
      idioma: 'zh',
      termo: ' 走 ',
      leitura: 'zǒu',
      significado: 'outra coisa',
    });
    expect(r2.status).toBe(200);
    const depois = (await json(r2)).palavra;
    expect(depois).toMatchObject({ id: palavra.id, significado: 'andar; ir embora', leitura: 'zǒu', repeticoes: 1 });
  });

  it('revisão agenda pelo SM-2 e o resumo conta o que vence hoje', async () => {
    const hoje = '2026-11-20';
    const a = reposVocabulario.adicionar(db, { idioma: 'en', termo: 'run', significado: 'correr' }, hoje).palavra;
    reposVocabulario.adicionar(db, { idioma: 'en', termo: 'walk', significado: 'andar' }, hoje);
    expect(reposVocabulario.paraRevisar(db, 'en', 50, hoje)).toHaveLength(2);

    const revisada = reposVocabulario.revisar(db, a.id, 2, hoje)!;
    expect(revisada.proxima_revisao).toBe('2026-11-21');
    expect(revisada.total_revisoes).toBe(1);
    expect(reposVocabulario.paraRevisar(db, 'en', 50, hoje).map((p) => p.termo)).toEqual(['walk']);

    const errou = reposVocabulario.revisar(db, a.id, 0, hoje)!;
    expect(errou.proxima_revisao).toBe(hoje);
    expect(errou.total_erros).toBe(1);

    const resumo = reposVocabulario.resumo(db, hoje).find((r) => r.idioma === 'en')!;
    expect(resumo).toEqual({ idioma: 'en', total: 2, para_hoje: 2, revisadas_hoje: 1 });
  });

  it('recusa nota fora de 0–3 e idioma desconhecido', async () => {
    const { palavra } = await json(await chamar('POST', '/api/vocabulario', { idioma: 'en', termo: 'go', significado: 'ir' }));
    expect((await chamar('POST', `/api/vocabulario/${palavra.id}/revisar`, { nota: 4 })).status).toBe(400);
    expect((await chamar('POST', '/api/vocabulario', { idioma: 'ja', termo: 'x', significado: 'y' })).status).toBe(400);
  });
});

describe('repetição espaçada (SM-2 simplificado)', () => {
  const novo = { intervalo_dias: 0, facilidade: 2.5, repeticoes: 0 };

  it('Bom: 1 dia, 3 dias, depois intervalo × facilidade', () => {
    const r1 = agendarRevisao(novo, 2);
    const r2 = agendarRevisao(r1, 2);
    const r3 = agendarRevisao(r2, 2);
    expect([r1.intervalo_dias, r2.intervalo_dias, r3.intervalo_dias]).toEqual([1, 3, 8]);
  });

  it('Errei zera a sequência e baixa a facilidade sem passar do piso', () => {
    let e = { intervalo_dias: 20, facilidade: 1.35, repeticoes: 5 };
    e = agendarRevisao(e, 0);
    expect(e).toEqual({ intervalo_dias: 0, facilidade: 1.3, repeticoes: 0 });
  });

  it('Fácil pula mais longe que Bom, e Difícil fica mais perto', () => {
    const base = { intervalo_dias: 10, facilidade: 2.5, repeticoes: 3 };
    expect(agendarRevisao(base, 3).intervalo_dias).toBeGreaterThan(agendarRevisao(base, 2).intervalo_dias);
    expect(agendarRevisao(base, 1).intervalo_dias).toBeLessThan(agendarRevisao(base, 2).intervalo_dias);
    expect(agendarRevisao(novo, 3).intervalo_dias).toBe(4);
  });

  it('somarDias atravessa mês e ano', () => {
    expect(somarDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(somarDias('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('rótulos de intervalo', () => {
    expect([0, 1, 5, 45].map(rotuloIntervalo)).toEqual(['hoje', '1 dia', '5 dias', '2 meses']);
  });
});

describe('segmentos e prompt', () => {
  it('segmentos cobrem a frase ignorando espaços; faltando um pedaço, não', () => {
    expect(segmentosCobremFrase('他走了。', [{ texto: '他' }, { texto: '走' }, { texto: '了' }, { texto: '。' }])).toBe(true);
    expect(segmentosCobremFrase('He ran away.', [{ texto: 'He' }, { texto: 'ran away.' }])).toBe(true);
    expect(segmentosCobremFrase('他走了。', [{ texto: '他' }, { texto: '了' }])).toBe(false);
    expect(segmentosCobremFrase('他', [])).toBe(false);
  });

  it('a doutrina muda com idioma e nível, e as regras da obra entram como referência', () => {
    const zh = sistemaTutorBase({ idioma_origem: 'zh', nivel: 'zero', omega: 'REGRA DA OBRA X' });
    expect(zh).toContain('pinyin com marcas de tom');
    expect(zh).toContain('REGRA DA OBRA X');
    const en = sistemaTutorBase({ idioma_origem: 'en', nivel: 'basico', omega: '' });
    expect(en).toContain('phrasal verbs');
    expect(en).not.toContain('pinyin com marcas de tom');
  });

  it('a mensagem de correção leva a sugestão como referência e a tentativa', () => {
    const texto = usuarioCorrigirTutor({
      modelo: 'm',
      idioma_origem: 'zh',
      nivel: 'zero',
      omega: '',
      glossario: [],
      frase: '他走了。',
      antes: [],
      depois: [],
      tentativa: 'Ele foi.',
      explicacao: { segmentos: [], estrutura: '', literal: '', traducao: 'Ele foi embora.', armadilhas: [] },
    });
    expect(texto).toContain('Ele foi embora.');
    expect(texto).toContain('## TENTATIVA DE QUEM ESTÁ APRENDENDO\nEle foi.');
  });
});
