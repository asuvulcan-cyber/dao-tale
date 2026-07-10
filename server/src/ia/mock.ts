import type { ProvedorIA, RequisicaoRevisao, RequisicaoTraducaoBloco } from './provedor.js';

// Provedor simulado (decisão D4): permite desenvolver, demonstrar e testar todo o
// fluxo do aplicativo sem chave de API e sem rede. Determinístico de propósito.

const LATENCIA_MS = Number(process.env.DAO_TALE_MOCK_LATENCIA ?? 150);

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
    await espera(LATENCIA_MS);
    const traducoes = req.frases.map((f) => ({
      ordem: f.ordem,
      texto_pt: `[tradução simulada] ${f.texto_zh}`,
    }));
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
              contexto: maisLonga.texto_zh,
            },
          ]
        : [];
    return { traducoes, termos_novos, bruta: JSON.stringify({ traducoes, termos_novos }) };
  },

  async revisarFrase(_chave, req: RequisicaoRevisao) {
    await espera(LATENCIA_MS);
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
