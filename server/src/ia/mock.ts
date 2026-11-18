import {
  ErroProvedor,
  type ProvedorIA,
  type RequisicaoContracapa,
  type RequisicaoExtrairTermos,
  type RequisicaoPasseEstilo,
  type RequisicaoQa,
  type RequisicaoRefinarPrompt,
  type RequisicaoRevisao,
  type RequisicaoTraducaoBloco,
  type RespostaRevisaoLiteraria,
  type RespostaAdjudicacaoLiteraria,
  type UsoChamada,
} from './provedor.js';
import { PROMPT_CONTRACAPA } from './promptContracapa.js';
import { perfilServidorDe } from '../idiomas/index.js';
import { estimarTokens } from './uso.js';

// Provedor simulado (decisão D4): permite desenvolver, demonstrar e testar todo o
// fluxo do aplicativo sem chave de API e sem rede. Determinístico de propósito.

// Lida a cada chamada (não no load do módulo): os testes definem a variável
// depois dos imports, que são içados pelo ES modules.
const latenciaMs = () => Number(process.env.DAO_TALE_MOCK_LATENCIA ?? 150);

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Consumo simulado (doc 11 §1) ───────────────────────────────────────────
// O mock reporta `uso` como um provedor real: tokens estimados pelo proxy local
// e o CACHE SIMULADO por prefixo de sistema — 1ª chamada com aquele prompt mãe
// escreve o cache, as seguintes leem. É o que permite verificar o painel de
// custo de ponta a ponta sem gastar um centavo; o painel rotula linhas do
// provedor simulado como tais e, sem preço cadastrado, elas não entram em
// nenhum total de dinheiro.

const prefixosVistos = new Set<string>();

// Temperatura recebida na última chamada de cada papel (doc 08 §13). O mock não
// tem o que sortear, mas registrar o valor é o que permite verificar, sem rede e
// sem gastar nada, que a temperatura resolvida (padrão do papel + override da
// obra) chega mesmo ao provedor pela rota real.
const temperaturasRecebidas = new Map<string, number | undefined>();
// Mesma ideia para o modo de raciocínio: prova que a escolha da obra atravessa
// job → bloco → provedor sem gastar chamada real.
const thinkingRecebido = new Map<string, string | undefined>();

/** Somente para testes: zera o cache simulado e as temperaturas entre casos. */
export function _zerarCacheMock(): void {
  prefixosVistos.clear();
  temperaturasRecebidas.clear();
  thinkingRecebido.clear();
}

/** Somente para testes: temperatura da última chamada daquele papel
 * (`undefined` = o papel não chamou, ou chamou sem temperatura definida). */
export function _temperaturaMock(papel: string): number | undefined {
  return temperaturasRecebidas.get(papel);
}

/** Somente para testes: modo de raciocínio da última chamada daquele papel
 * (`undefined` = a obra não escolheu e nada foi mandado ao provedor). */
export function _thinkingMock(papel: string): string | undefined {
  return thinkingRecebido.get(papel);
}

function hash(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
  return String(h);
}

function usoSimulado(
  papel: string,
  req: { omega?: string; temperatura?: number; thinking?: string },
  resposta: unknown,
): UsoChamada {
  temperaturasRecebidas.set(papel, req.temperatura);
  thinkingRecebido.set(papel, req.thinking);
  const sistema = estimarTokens(req.omega ?? '');
  // O resto da requisição (glossário, frases, cauda) é a parte que nunca cacheia.
  const usuario = Math.max(0, estimarTokens(JSON.stringify(req)) - sistema);
  const chave = `${papel}:${hash(req.omega ?? '')}`;
  const quente = prefixosVistos.has(chave);
  prefixosVistos.add(chave);
  return {
    tokens_entrada: usuario,
    tokens_saida: estimarTokens(JSON.stringify(resposta)),
    tokens_cache_leitura: quente ? sistema : 0,
    tokens_cache_criacao: quente ? 0 : sistema,
  };
}

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
    const perfilBloco = perfilServidorDe(req.idioma_origem);
    const maisLonga = [...req.frases].sort((a, b) => b.texto_zh.length - a.texto_zh.length)[0];
    const recorte = maisLonga ? perfilBloco.extrairTermoSimulado(maisLonga.texto_zh, 2).join(' ').trim() : '';
    const termos_novos =
      maisLonga && maisLonga.texto_zh.length >= 4 && recorte
        ? [
            {
              termo_zh: recorte,
              termo_pt: `Termo Simulado ${maisLonga.ordem}`,
              categoria: 'lexico-geral',
              contexto: `Descrição simulada do termo da frase ${maisLonga.ordem}.`,
            },
          ]
        : [];
    const dados = { traducoes, termos_novos };
    return { ...dados, bruta: JSON.stringify(dados), uso: usoSimulado('traducao', req, dados) };
  },

  async traduzirContracapa(_chave, req: RequisicaoContracapa) {
    await espera(latenciaMs());
    // Espelha a estrutura do original linha a linha: é assim que o teste verifica
    // que a sinopse volta inteira e com as quebras (versos) preservadas.
    const dados = {
      titulo_pt: req.tituloZh ? `[título simulado] ${req.tituloZh}` : null,
      sinopse_pt: req.sinopseZh
        ? req.sinopseZh
            .split('\n')
            .map((linha) => (linha.trim() ? `[tradução simulada] ${linha}` : linha))
            .join('\n')
        : null,
    };
    return {
      ...dados,
      bruta: JSON.stringify(dados),
      // O prompt de contracapa é o prefixo estável desta tarefa (o prompt mãe da
      // obra não entra aqui) — é ele que o cache simulado deve contabilizar.
      uso: usoSimulado('contracapa', { ...req, omega: PROMPT_CONTRACAPA }, dados),
    };
  },

  async extrairTermos(_chave, req: RequisicaoExtrairTermos) {
    await espera(latenciaMs());
    // Determinístico: propõe dois recortes distintos do original como termos
    // (exercita a varredura exaustiva). O QUE é um recorte vem do perfil — no
    // mandarim são caracteres, no inglês são palavras, e fatiar inglês por
    // caractere devolveria pedaços de palavra. Filtra o que já está no
    // glossário; a rota ainda tira as sugestões pendentes.
    const perfilFrase = perfilServidorDe(req.idioma_origem);
    const pedacos = perfilFrase.extrairTermoSimulado(req.frase.texto_zh, Number.MAX_SAFE_INTEGER);
    const juntar = (ps: string[]) => (perfilFrase.id === 'zh' ? ps.join('') : ps.join(' '));
    const candidatos = [...new Set([juntar(pedacos.slice(0, 2)), juntar(pedacos.slice(-2))])];
    const termos = candidatos
      .filter((zh) => zh.length >= 2 && !req.glossario.some((e) => e.termo_zh === zh))
      .map((zh) => ({
        termo_zh: zh,
        termo_pt: `Termo Extraído (${zh})`,
        categoria: 'lexico-geral',
        contexto: 'Descrição simulada para curadoria do glossário.',
      }));
    return { termos, bruta: JSON.stringify({ termos }), uso: usoSimulado('extracao', req, { termos }) };
  },

  async refinarPrompt(_chave, req: RequisicaoRefinarPrompt) {
    await espera(latenciaMs());
    // Uma proposta determinística por seção recorrente — exercita o fluxo inteiro.
    const secoes = [...new Set(req.casos.map((c) => c.secao_regra))];
    const propostas = secoes.map((secao) => ({
      camada: 'delta' as const,
      secao_regra: secao,
      regra_proposta: `[regra simulada] Ao cair no caso "${secao}", aplique a correção validada pelo revisor.`,
      justificativa: `[simulado] ${req.casos.filter((c) => c.secao_regra === secao).length} casos recorrentes nesta seção.`,
    }));
    return { propostas, bruta: JSON.stringify({ propostas }), uso: usoSimulado('refinamento', req, { propostas }) };
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
    return { apontamentos, bruta: JSON.stringify({ apontamentos }), uso: usoSimulado('qa', req, { apontamentos }) };
  },

  async revisarFrase(_chave, req: RequisicaoRevisao) {
    await espera(latenciaMs());
    const pareceErro = /errad|incorret|estranh|dúvida|duvido|não seria/i.test(req.pergunta);
    // "preferência"/"soa melhor" exercita o terceiro veredito, que não existia.
    const preferencia = /prefer|soa melhor|gosto|estilo/i.test(req.pergunta);
    const trecho_zh = [...req.frase.texto_zh].slice(0, 8).join('');
    const dados = pareceErro
      ? {
          trecho_zh,
          veredito: 'incorreto' as const,
          resposta: '[simulado] O motivo que você deu procede: o original sustenta a leitura alternativa.',
          justificativa: '[simulado] A escolha diverge da regra de consistência do glossário.',
          secao_regra: 'mock-1.1-consistencia' as string | null,
          correcao_proposta: `[correção simulada] ${req.frase.texto_pt || req.frase.texto_zh}`,
          trecho_pt_errado: (req.frase.texto_pt ?? '').split(/\s+/)[0] || null,
          trecho_pt_corrigido: '[trecho simulado]',
        }
      : preferencia
        ? {
            trecho_zh,
            veredito: 'escolha-legitima' as const,
            resposta: '[simulado] As duas leituras se defendem; o original não desempata.',
            justificativa: '',
            secao_regra: null as string | null,
            correcao_proposta: null,
            trecho_pt_errado: null,
            trecho_pt_corrigido: null,
          }
        : {
            trecho_zh,
            veredito: 'correto' as const,
            resposta: '[simulado] O motivo que você levantou não se sustenta no texto-fonte.',
            justificativa: '',
            secao_regra: null as string | null,
            correcao_proposta: null,
            trecho_pt_errado: null,
            trecho_pt_corrigido: null,
          };
    return { ...dados, bruta: JSON.stringify(dados), uso: usoSimulado('revisao', req, dados) };
  },

  async passeEstilo(_chave, req: RequisicaoPasseEstilo) {
    await espera(latenciaMs());
    // Simula os dois desfechos: consertar o trecho acusado, e descartar quando o
    // trecho é um dos falsos positivos JÁ DOCUMENTADOS do scanner por sufixo —
    // "romãzeira", "Voadora" e "prepara" (ver respostas.ts). Ancorado ao termo
    // INTEIRO (não substring): "roma" sem o ã casaria "aroma"/"romance"/"romano",
    // que não são o que este mock pretende simular.
    const correcoes = req.alvos.flatMap((a) =>
      a.violacoes.map((v) => {
        const falsoPositivo = /^(?:prepara|rom[aã]zeira|voadora)$/i.test(v.trecho.trim());
        return falsoPositivo
          ? { ordem: a.ordem, regra: v.regra, trecho_pt_errado: null, trecho_pt_corrigido: null, descartar: true }
          : {
              ordem: a.ordem,
              regra: v.regra,
              trecho_pt_errado: v.trecho,
              trecho_pt_corrigido: `[simulado] ${v.trecho}`,
              descartar: false,
            };
      }),
    );
    return { correcoes, bruta: JSON.stringify({ correcoes }), uso: usoSimulado('estilo', req, { correcoes }) };
  },

  async revisarLiterariamente(_chave, req): Promise<RespostaRevisaoLiteraria> {
    await espera(latenciaMs());
    const propostas = req.alvos.map((alvo) => {
      const precisa = /MOCK_REVISAR/.test(alvo.texto_zh);
      return {
        ordem: alvo.ordem,
        texto_revisado: precisa ? `${alvo.texto_pt} [revisado]` : null,
        justificativa: precisa ? '[simulado] ajuste literário demonstrável' : '',
        categorias: precisa ? ['naturalidade' as const] : [],
        confianca: precisa ? ('alta' as const) : ('media' as const),
      };
    });
    return { propostas, bruta: JSON.stringify({ propostas }), uso: usoSimulado('revisao-literaria', req, { propostas }) };
  },

  async adjudicarRevisaoLiteraria(_chave, req): Promise<RespostaAdjudicacaoLiteraria> {
    await espera(latenciaMs());
    const julgamentos = req.comparacoes.map((c) => ({
      ordem: c.ordem,
      veredito: (c.texto_candidato.includes('[revisado]') ? 'melhora' : 'equivalente') as 'melhora' | 'equivalente',
      justificativa: '[simulado] comparação independente entre vigente e candidato.',
      riscos: ['nenhum' as const],
    }));
    return { julgamentos, bruta: JSON.stringify({ julgamentos }), uso: usoSimulado('adjudicacao-literaria', req, { julgamentos }) };
  },
};
