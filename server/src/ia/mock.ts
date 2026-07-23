import {
  ErroProvedor,
  type ProvedorIA,
  type RequisicaoExtrairTermos,
  type RequisicaoQa,
  type RequisicaoRefinarPrompt,
  type RequisicaoRevisao,
  type RequisicaoTraducaoBloco,
} from './provedor.js';

// Provedor simulado (decisão D4): permite desenvolver, demonstrar e testar todo o
// fluxo do aplicativo sem chave de API e sem rede. Determinístico de propósito.

// Lida a cada chamada (não no load do módulo): os testes definem a variável
// depois dos imports, que são içados pelo ES modules.
const latenciaMs = () => Number(process.env.DAO_TALE_MOCK_LATENCIA ?? 150);

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const provedorMock: ProvedorIA = {
  id: 'mock',
  nome: 'Simulado (sem chave, para testes)',
  precisaChave: false,
  modeloPadrao: 'mock-v1',

  async listarModelos() {
    return [{ id: 'mock-v1', nome: 'Mock v1 (determinístico)' }];
  },

  async testarCredencial() {
    return { ok: true, mensagem: 'Provedor simulado — sempre disponível, não usa rede.' };
  },

  async traduzirBloco(_chave, req: RequisicaoTraducaoBloco) {
    await espera(latenciaMs());
    // Gatilho determinístico para testar o comportamento de limite de cota (429):
    // qualquer frase contendo o marcador simula a resposta de limite do provedor.
    if (req.frases.some((f) => f.texto_zh.includes('MOCK_LIMITE'))) {
      throw new ErroProvedor('Limite de requisições simulado atingido (429).', 'limite');
    }
    const traducoes = req.frases.map((f) => ({
      ordem: f.ordem,
      texto_pt: `[tradução simulada] ${f.texto_zh}`,
    }));
    if (req.titulo) traducoes.unshift({ ordem: -1, texto_pt: `[título simulado] ${req.titulo}` });
    // Sugere um termo falso por bloco a partir da frase mais longa, para exercitar
    // o fluxo de termos sugeridos de ponta a ponta.
    const maisLonga = [...req.frases].sort((a, b) => b.texto_zh.length - a.texto_zh.length)[0];
    const termos_novos =
      maisLonga && maisLonga.texto_zh.length >= 4
        ? [
            {
              termo_zh: [...maisLonga.texto_zh].slice(0, 2).join(''),
              termo_pt: `Termo Simulado ${maisLonga.ordem}`,
              categoria: 'outro',
              contexto: `Descrição simulada do termo da frase ${maisLonga.ordem}.`,
            },
          ]
        : [];
    return { traducoes, termos_novos, bruta: JSON.stringify({ traducoes, termos_novos }) };
  },

  async extrairTermos(_chave, req: RequisicaoExtrairTermos) {
    await espera(latenciaMs());
    // Determinístico: propõe os 2 primeiros e os 2 últimos caracteres do chinês
    // como termos distintos (exercita a varredura exaustiva). Filtra o que já
    // está no glossário; a rota ainda tira as sugestões pendentes.
    const chineses = [...req.frase.texto_zh].filter((c) => /[一-鿿]/.test(c));
    const candidatos = [...new Set([chineses.slice(0, 2).join(''), chineses.slice(-2).join('')])];
    const termos = candidatos
      .filter((zh) => zh.length >= 2 && !req.glossario.some((e) => e.termo_zh === zh))
      .map((zh) => ({
        termo_zh: zh,
        termo_pt: `Termo Extraído (${zh})`,
        categoria: 'outro',
        contexto: 'Descrição simulada para curadoria do glossário.',
      }));
    return { termos, bruta: JSON.stringify({ termos }) };
  },

  async refinarPrompt(_chave, req: RequisicaoRefinarPrompt) {
    await espera(latenciaMs());
    // Uma proposta determinística por seção recorrente — exercita o fluxo inteiro.
    const secoes = [...new Set(req.casos.map((c) => c.secao_regra))];
    const propostas = secoes.map((secao) => ({
      secao_regra: secao,
      regra_proposta: `[regra simulada] Ao cair no caso "${secao}", aplique a correção validada pelo revisor.`,
      justificativa: `[simulado] ${req.casos.filter((c) => c.secao_regra === secao).length} casos recorrentes nesta seção.`,
    }));
    return { propostas, bruta: JSON.stringify({ propostas }) };
  },

  async analisarQa(_chave, req: RequisicaoQa) {
    await espera(latenciaMs());
    // Determinístico: aponta 'omissao' de severidade média nos pares cuja
    // tradução não menciona nenhum caractere chinês do original que seja dígito
    // — na prática, gera ~1 apontamento por bloco para exercitar a triagem.
    const apontamentos = req.pares
      .filter((p) => p.texto_pt.includes('simulada'))
      .slice(0, 1)
      .map((p) => ({
        ordem: p.ordem,
        tipo: 'omissao' as const,
        severidade: 'media' as const,
        trecho_zh: [...p.texto_zh].slice(0, 6).join(''),
        observacao: '[simulado] Possível omissão de trecho na tradução — conferir.',
        sugestao: null,
      }));
    return { apontamentos, bruta: JSON.stringify({ apontamentos }) };
  },

  async revisarFrase(_chave, req: RequisicaoRevisao) {
    await espera(latenciaMs());
    // Heurística simulada: perguntas que sugerem erro geram veredito "incorreto".
    const pareceErro = /errad|incorret|estranh|dúvida|duvido|não seria/i.test(req.pergunta);
    const dados = pareceErro
      ? {
          trecho_zh: [...req.frase.texto_zh].slice(0, 8).join(''),
          veredito: 'incorreto' as const,
          justificativa:
            '[simulado] A escolha diverge da regra de consistência do glossário; correção proposta abaixo.',
          secao_regra: 'mock-1.1-consistencia',
          correcao_proposta: `[correção simulada] ${req.frase.texto_pt || req.frase.texto_zh}`,
        }
      : {
          trecho_zh: [...req.frase.texto_zh].slice(0, 8).join(''),
          veredito: 'correto' as const,
          justificativa: '[simulado] A tradução atual respeita as regras do prompt mãe.',
          secao_regra: 'geral',
          correcao_proposta: null,
        };
    return { ...dados, bruta: JSON.stringify(dados) };
  },
};
