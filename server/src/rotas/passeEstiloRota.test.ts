import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { criarApp } from '../app.js';
import { reposFrases } from '../db/repos.js';
import { provedorMock } from '../ia/mock.js';
import type { Hono } from 'hono';

// Passe de estilo: propõe o conserto das violações que a varredura determinística
// (GET /capitulos/:id/estilo) já aponta, e aplica o que o revisor aprovar. Duas
// rotas de propósito — propor nunca escreve no texto, porque a decisão é humana.

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

describe('passe de estilo', () => {
  let obraId: number;
  let capId: number;
  let capLimpoId: number;
  let fraseId: number;
  let ordemComErrara: number;

  // As espionagens de provedorMock (vizinhas, previa/descartar) não podem vazar
  // de um it() para o próximo — o objeto é um singleton compartilhado pelo módulo.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    db = abrirBanco(':memory:');
    app = criarApp(db);

    const obra = await json(await chamar('POST', '/api/obras', { titulo: 'Obra' }));
    obraId = obra.id;

    // Capítulo com uma frase que o scanner acusa (mais-que-perfeito: "errara")
    // e outra limpa, para provar que só a acusada vai ao provedor.
    const criado = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 1, texto_origem: '甲说。乙走了。' }),
    );
    capId = criado.capitulo.id;
    const frases = (await json(await chamar('GET', `/api/capitulos/${capId}`))).frases;
    await chamar('PATCH', `/api/frases/${frases[0].id}`, { texto_pt: 'Ele errara o caminho.' });
    await chamar('PATCH', `/api/frases/${frases[1].id}`, { texto_pt: 'Ela foi embora.' });
    fraseId = frases[0].id;
    ordemComErrara = frases[0].ordem;

    // Capítulo sem nenhuma violação.
    const capLimpo = await json(
      await chamar('POST', `/api/obras/${obra.id}/capitulos`, { numero: 2, texto_origem: '丙笑了。' }),
    );
    capLimpoId = capLimpo.capitulo.id;
    const fraseLimpa = (await json(await chamar('GET', `/api/capitulos/${capLimpoId}`))).frases[0];
    await chamar('PATCH', `/api/frases/${fraseLimpa.id}`, { texto_pt: 'Ele sorriu.' });
  });

  it('só manda ao provedor as frases que o scanner acusa', async () => {
    const r = await app.request(`/api/capitulos/${capId}/estilo/passe`, { method: 'POST' });
    expect(r.status).toBe(200);
    const { correcoes } = await r.json();
    // A frase limpa não pode aparecer.
    expect(correcoes.every((c: { ordem: number }) => c.ordem === ordemComErrara)).toBe(true);
    expect(correcoes.length).toBeGreaterThan(0);
  });

  it('não repropõe o que já foi dispensado', async () => {
    await app.request(`/api/frases/${fraseId}/estilo/dispensar`, {
      method: 'POST',
      body: JSON.stringify({ regra: 'mais-que-perfeito', trecho: 'errara' }),
      headers: { 'content-type': 'application/json' },
    });
    const r = await app.request(`/api/capitulos/${capId}/estilo/passe`, { method: 'POST' });
    const { correcoes } = await r.json();
    expect(correcoes).toHaveLength(0);
  });

  it('capítulo sem violação não gasta chamada', async () => {
    const r = await app.request(`/api/capitulos/${capLimpoId}/estilo/passe`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect((await r.json()).correcoes).toHaveLength(0);
    // Nenhum evento de IA gravado: o passe nem foi chamado.
    const n = db.prepare("SELECT COUNT(*) n FROM eventos_ia WHERE papel = 'estilo'").get() as { n: number };
    expect(n.n).toBe(0);
  });

  it('duas violações na mesma frase não se atropelam', async () => {
    // aplicarCorrecao só ancora quando o trecho é ÚNICO na frase (shared/src/index.ts:156).
    // Aplicar a primeira não pode deixar a segunda sem âncora.
    reposFrases.editarTexto(db, fraseId, 'ele errara e depois fizera pior.');
    const um = await app.request(`/api/frases/${fraseId}/estilo/aplicar`, {
      method: 'POST',
      body: JSON.stringify({ trecho_pt_errado: 'errara', trecho_pt_corrigido: 'errou' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(um.status).toBe(200);
    const dois = await app.request(`/api/frases/${fraseId}/estilo/aplicar`, {
      method: 'POST',
      body: JSON.stringify({ trecho_pt_errado: 'fizera', trecho_pt_corrigido: 'fez' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(dois.status).toBe(200);
    expect(reposFrases.obter(db, fraseId)!.texto_pt).toBe('ele errou e depois fez pior.');
  });

  it('trecho que não ancora devolve 400 com o trecho na mensagem', async () => {
    const r = await app.request(`/api/frases/${fraseId}/estilo/aplicar`, {
      method: 'POST',
      body: JSON.stringify({ trecho_pt_errado: 'inexistente', trecho_pt_corrigido: 'x' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(r.status).toBe(400);
    expect((await r.json()).erro.mensagem).toContain('inexistente');
  });

  it('aplicar grava a origem passe-estilo', async () => {
    const r = await app.request(`/api/frases/${fraseId}/estilo/aplicar`, {
      method: 'POST',
      body: JSON.stringify({ trecho_pt_errado: 'errara', trecho_pt_corrigido: 'errou' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(r.status).toBe(200);
    const f = reposFrases.obter(db, fraseId)!;
    expect(f.texto_pt).toContain('errou');
    expect(f.origem_edicao).toBe('passe-estilo');
  });

  // O provedor mock só ecoa `req.alvos` — nunca lê `req.vizinhas` — então um bug
  // no filtro que as monta é invisível para os testes acima (a resposta não muda).
  // `vizinhas` vai dentro do prompt: se o filtro mandasse o capítulo inteiro em
  // vez de só os ordem±1, cada passe ficaria caro sem ninguém perceber. Espiona
  // a chamada real ao provedor para verificar o que a ROTA de fato monta.
  it('manda como vizinhas só as frases adjacentes aos alvos — nunca o capítulo inteiro', async () => {
    const criado = await json(
      await chamar('POST', `/api/obras/${obraId}/capitulos`, {
        numero: 9,
        texto_origem: '甲说。乙走了。丙笑了。丁哭了。戊来了。',
      }),
    );
    const capId5 = criado.capitulo.id;
    const frases5 = (await json(await chamar('GET', `/api/capitulos/${capId5}`))).frases;
    expect(frases5).toHaveLength(5);
    // Só a frase de ordem 2 (índice 2) tem violação; as outras quatro são limpas.
    await chamar('PATCH', `/api/frases/${frases5[0].id}`, { texto_pt: 'Ele partiu.' });
    await chamar('PATCH', `/api/frases/${frases5[1].id}`, { texto_pt: 'Ela chegou.' });
    await chamar('PATCH', `/api/frases/${frases5[2].id}`, { texto_pt: 'Ele errara o caminho.' });
    await chamar('PATCH', `/api/frases/${frases5[3].id}`, { texto_pt: 'Ela saiu.' });
    await chamar('PATCH', `/api/frases/${frases5[4].id}`, { texto_pt: 'Ele dormiu.' });

    const spy = vi.spyOn(provedorMock, 'passeEstilo');
    const r = await app.request(`/api/capitulos/${capId5}/estilo/passe`, { method: 'POST' });
    expect(r.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    const req = spy.mock.calls[0][1];
    expect(req.alvos.map((a) => a.ordem)).toEqual([2]);
    // Nem a própria ordem 2 (já é alvo), nem as distantes 0 e 4 — só 1 e 3.
    expect(req.vizinhas.map((v) => v.ordem).sort()).toEqual([1, 3]);
  });

  it('previa: proposta que ancora vem com o texto já consertado', async () => {
    const r = await app.request(`/api/capitulos/${capId}/estilo/passe`, { method: 'POST' });
    const { correcoes } = await r.json();
    const c = correcoes.find((cor: { trecho_pt_errado: string | null }) => cor.trecho_pt_errado === 'errara');
    expect(c).toBeTruthy();
    expect(c.descartar).toBe(false);
    // "Ele errara o caminho." com "errara" trocado por "[simulado] errara" (o
    // par que o mock devolve) — é o que a tela mostraria antes de gravar.
    expect(c.previa).toEqual({ tipo: 'cirurgica', texto: 'Ele [simulado] errara o caminho.' });
  });

  it('descarte: correção com descartar=true chega com previa=null', async () => {
    // O scanner atual (server/src/traducao/estiloViolacoes.ts) tem "prepara",
    // "romãzeira" e "voadora" na lista NAO_VERBOS — conferido também no HEAD
    // anterior a esta tarefa para "prepara"/"romãzeira" — então nenhum desses
    // três trechos chega a virar `violacoes` de verdade; o gatilho de descarte
    // do mock (que reage a ESSAS palavras exatas) nunca dispara pela rota real.
    // Para testar o que a ROTA faz com `descartar: true` sem depender de mexer
    // no scanner (arquivo do usuário, fora do escopo desta tarefa), a resposta
    // do provedor é interceptada só no campo `descartar` — todo o resto (uso,
    // forma) continua sendo o que o mock de verdade devolveria.
    const original = provedorMock.passeEstilo.bind(provedorMock);
    vi.spyOn(provedorMock, 'passeEstilo').mockImplementationOnce(async (chave, req) => {
      const resposta = await original(chave, req);
      return {
        ...resposta,
        correcoes: resposta.correcoes.map((c) => ({ ...c, descartar: true, trecho_pt_errado: null, trecho_pt_corrigido: null })),
      };
    });
    const r = await app.request(`/api/capitulos/${capId}/estilo/passe`, { method: 'POST' });
    expect(r.status).toBe(200);
    const { correcoes } = await r.json();
    expect(correcoes.length).toBeGreaterThan(0);
    for (const c of correcoes) {
      expect(c.descartar).toBe(true);
      expect(c.previa).toBeNull();
    }
  });
});
