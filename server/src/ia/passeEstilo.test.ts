import { describe, expect, it } from 'vitest';
import { respostaPasseEstiloSchema } from './respostas.js';
import { CONTRATO_PASSE_ESTILO } from './contratos.js';
import { sistemaPasseEstilo, usuarioPasseEstilo } from './prompts.js';
import { provedorMock } from './mock.js';
import type { RequisicaoPasseEstilo } from './provedor.js';

const req = {
  modelo: 'm',
  omega: 'PROMPT DA OBRA',
  alvos: [
    {
      ordem: 12,
      texto_zh: '他断定自己错了。',
      texto_pt: 'concluindo que ele errara.',
      violacoes: [{ regra: 'mais-que-perfeito', trecho: 'errara' }],
    },
  ],
  vizinhas: [{ ordem: 11, texto_pt: 'O senhor não lhe deu chance.' }],
};

describe('contrato do passe de estilo', () => {
  it('aceita correção com par cirúrgico', () => {
    const r = respostaPasseEstiloSchema.parse({
      correcoes: [
        { ordem: 12, regra: 'mais-que-perfeito', trecho_pt_errado: 'errara', trecho_pt_corrigido: 'errou' },
      ],
    });
    expect(r.correcoes[0].descartar).toBe(false);
  });

  it('aceita descarte sem par — o scanner é heurístico e erra', () => {
    const r = respostaPasseEstiloSchema.parse({
      correcoes: [{ ordem: 3, regra: 'mais-que-perfeito', descartar: true }],
    });
    expect(r.correcoes[0].descartar).toBe(true);
    expect(r.correcoes[0].trecho_pt_errado).toBeNull();
  });

  it('recusa correção sem par quando não é descarte', () => {
    expect(() =>
      respostaPasseEstiloSchema.parse({ correcoes: [{ ordem: 3, regra: 'mais-que-perfeito' }] }),
    ).toThrow();
  });

  it('lista vazia é resposta válida', () => {
    expect(respostaPasseEstiloSchema.parse({}).correcoes).toEqual([]);
  });

  it('as instruções proíbem tocar em mais que a violação', () => {
    const s = sistemaPasseEstilo(req);
    expect(s).toMatch(/apenas a viola[çc][ãa]o/i);
    expect(s).toMatch(/n[ãa]o retraduza/i);
    // Sem isto o modelo devolve um trecho que aparece duas vezes na frase e
    // aplicarCorrecao cai no caminho da frase inteira.
    expect(s).toMatch(/[úu]nico na frase/i);
  });

  it('a mensagem traz a frase, a regra e o trecho acusado', () => {
    const u = usuarioPasseEstilo(req);
    expect(u).toContain('[12]');
    expect(u).toContain('concluindo que ele errara.');
    expect(u).toContain('mais-que-perfeito');
    expect(u).toContain('errara');
  });
});

// O provedor mock é quem a Task 5 vai chamar nos testes de integração antes de
// haver chave de API — sem cobertura aqui, os dois desfechos (consertar vs.
// descartar) ficam invisíveis à suíte. Os três trechos abaixo são os falsos
// positivos JÁ DOCUMENTADOS do scanner por sufixo (respostas.ts, mock.ts):
// "romãzeira", "Voadora" e "prepara".
describe('provedorMock.passeEstilo', () => {
  const reqMock: RequisicaoPasseEstilo = {
    modelo: 'mock-v1',
    omega: 'PROMPT DA OBRA',
    alvos: [
      {
        ordem: 1,
        texto_zh: '他打偏了目标。',
        texto_pt: 'ele errara o alvo.',
        violacoes: [{ regra: 'mais-que-perfeito', trecho: 'errara' }],
      },
      {
        ordem: 2,
        texto_zh: '石榴树在院子里开花了。',
        texto_pt: 'a romãzeira floresceu no pátio.',
        violacoes: [{ regra: 'mais-que-perfeito', trecho: 'romãzeira' }],
      },
      {
        ordem: 3,
        texto_zh: '他小心地准备茶。',
        texto_pt: 'ele prepara o chá com cuidado.',
        violacoes: [{ regra: 'mais-que-perfeito', trecho: 'prepara' }],
      },
      {
        ordem: 4,
        texto_zh: '飞鹰到达了山顶。',
        texto_pt: 'a Águia Voadora chegou ao topo.',
        violacoes: [{ regra: 'mais-que-perfeito', trecho: 'Voadora' }],
      },
    ],
    vizinhas: [],
  };

  it('conserta o trecho acusado quando ele não é falso positivo conhecido', async () => {
    const r = await provedorMock.passeEstilo(null, reqMock);
    const c = r.correcoes.find((c) => c.ordem === 1);
    expect(c).toMatchObject({ descartar: false, trecho_pt_errado: 'errara' });
    expect(c?.trecho_pt_corrigido).toBeTruthy();
  });

  it.each([
    [2, 'romãzeira'],
    [3, 'prepara'],
    [4, 'Voadora'],
  ])('descarta sem par o falso positivo conhecido (ordem %i): "%s"', async (ordem: number, trecho: string) => {
    const r = await provedorMock.passeEstilo(null, reqMock);
    const c = r.correcoes.find((c) => c.ordem === ordem);
    expect(c, `trecho "${trecho}" na ordem ${ordem}`).toMatchObject({
      descartar: true,
      trecho_pt_errado: null,
      trecho_pt_corrigido: null,
    });
  });
});

describe('o passe recebe o original', () => {
  const req = {
    modelo: 'm',
    omega: 'ÔMEGA',
    alvos: [
      {
        ordem: 3,
        texto_zh: '他一直在等。',
        texto_pt: 'Ele sempre esteve esperando.',
        violacoes: [
          { regra: 'particula-yizhi', trecho: 'sempre esteve', orientacao: '一直 é continuidade até então.' },
        ],
      },
    ],
    vizinhas: [],
  };

  it('o chinês do alvo vai na mensagem', () => {
    expect(usuarioPasseEstilo(req)).toContain('他一直在等。');
  });

  it('a orientação da violação vai junto da violação', () => {
    const texto = usuarioPasseEstilo(req);
    expect(texto).toContain('一直 é continuidade até então.');
    // Junto, não solta no fim: a orientação é daquela violação.
    expect(texto.indexOf('一直 é continuidade')).toBeGreaterThan(texto.indexOf('particula-yizhi'));
  });

  it('violação sem orientação não emite linha vazia', () => {
    const semOrientacao = {
      ...req,
      alvos: [{ ...req.alvos[0], violacoes: [{ regra: 'mais-que-perfeito', trecho: 'tinha ido' }] }],
    };
    expect(usuarioPasseEstilo(semOrientacao)).not.toContain('orientação:');
  });

  it('o bloco operacional manda o chinês arbitrar', () => {
    expect(sistemaPasseEstilo({ omega: 'ÔMEGA' })).toMatch(/original em chin[êe]s/i);
  });
});
