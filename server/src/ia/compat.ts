import { z } from 'zod';
import type { ModeloInfo, ModoThinking } from '@dao-tale/shared';
import {
  ErroProvedor,
  type ProvedorIA,
  type UsoChamada,
  type RequisicaoContracapa,
  type RequisicaoExtrairTermos,
  type RequisicaoPasseEstilo,
  type RequisicaoRefinarPrompt,
  type RequisicaoRevisao,
  type RequisicaoRevisaoLiteraria,
  type RequisicaoAdjudicacaoLiteraria,
  type RequisicaoTraducaoBloco,
  type RequisicaoQa,
  type RespostaContracapa,
  type RespostaExtrairTermos,
  type RespostaPasseEstilo,
  type RespostaQa,
  type RespostaRefinarPrompt,
  type RespostaRevisaoProvedor,
  type RespostaRevisaoLiteraria,
  type RespostaAdjudicacaoLiteraria,
  type RespostaTraducaoBloco,
} from './provedor.js';
import {
  sistemaContracapa,
  sistemaExtrairTermos,
  sistemaPasseEstilo,
  sistemaQa,
  sistemaRefinarPrompt,
  sistemaRevisao,
  sistemaRevisaoLiteraria,
  sistemaAdjudicacaoLiteraria,
  sistemaTraducao,
  usuarioContracapa,
  usuarioExtrairTermos,
  usuarioPasseEstilo,
  usuarioQa,
  usuarioRefinarPrompt,
  usuarioRevisao,
  usuarioRevisaoLiteraria,
  usuarioAdjudicacaoLiteraria,
  usuarioTraducao,
} from './prompts.js';
import {
  CONTRATO_CONTRACAPA,
  CONTRATO_EXTRAIR_TERMOS,
  CONTRATO_PASSE_ESTILO,
  CONTRATO_QA,
  CONTRATO_REFINAR_PROMPT,
  CONTRATO_REVISAO,
  CONTRATO_REVISAO_LITERARIA,
  CONTRATO_ADJUDICACAO_LITERARIA,
  CONTRATO_TRADUCAO,
  instrucaoJson,
} from './contratos.js';
import { usoDoCompat } from './uso.js';
import { ehErroDeParametro, ehErroDeTemperatura, temperaturaDoPedido } from './temperatura.js';

// Provedor genérico para APIs compatíveis com OpenAI (chat completions):
// DeepSeek, OpenRouter, Groq, Mistral etc. usam o mesmo protocolo — só mudam
// URL base, cabeçalhos e catálogo de modelos. Sem tool use/responseSchema
// garantidos entre eles, a resposta estruturada vem de JSON mode + instrução
// de formato no sistema, com saneamento de cercas e <think> antes do parse.

export interface OpcoesCompat {
  id: ProvedorIA['id'];
  nome: string;
  baseUrl: string;
  modeloPadrao: string;
  /** Cabeçalhos extras exigidos/recomendados pelo provedor (ex.: OpenRouter). */
  cabecalhos?: Record<string, string>;
  /** Teto de tokens de saída por chamada. Só onde é necessário (modelos de
   * raciocínio esgotando o padrão) — provedores como o Groq somam este valor
   * ao orçamento por minuto e rejeitam a chamada se ele for alto demais. */
  maxTokens?: number;
  /** Mantém no seletor só modelos que servem para tradução de texto. */
  filtrarModelo?: (id: string) => boolean;
}

interface RespostaChat {
  /** `reasoning`: modelos de raciocínio (gpt-oss etc.) podem devolver o conteúdo
   * útil separado — ou até só nele, quando o raciocínio consome o limite. */
  choices?: { message?: { content?: string | null; reasoning?: string | null }; finish_reason?: string | null }[];
  /** Consumo real (doc 11 §1) — cada provedor compat preenche um subconjunto;
   * a normalização fica em `usoDoCompat`. */
  usage?: unknown;
  data?: { id: string; name?: string }[];
  error?: { message?: string };
}

function classificarErro(nome: string, status: number, mensagem: string, retryAfterMs?: number): ErroProvedor {
  if (status === 401 || status === 403) {
    return new ErroProvedor(`Chave de API do ${nome} inválida ou sem permissão. Verifique em Configurações.`, 'fatal');
  }
  if (status === 402) {
    return new ErroProvedor(`Créditos esgotados no ${nome} — recarregue a conta ou troque de modelo.`, 'fatal');
  }
  if (status === 400 || status === 404 || status === 422) {
    // "Failed to validate JSON" (Groq etc.) é falha de geração pontual do
    // modelo, não da requisição — transitória, o retry costuma resolver.
    if (/json/i.test(mensagem)) {
      return new ErroProvedor(`O modelo gerou JSON inválido segundo o ${nome}: ${mensagem}`, 'transitorio');
    }
    return new ErroProvedor(`Requisição rejeitada pela API do ${nome}: ${mensagem}`, 'fatal');
  }
  if (status === 429) {
    return new ErroProvedor(`Limite de requisições do ${nome} atingido (429).`, 'limite', { retryAfterMs });
  }
  return new ErroProvedor(`Erro da API do ${nome} (${status}): ${mensagem}`, 'transitorio');
}

/** Retry-After pode vir em segundos ou como data HTTP; devolve ms ou undefined. */
export function parsearRetryAfter(valor: string | null): number | undefined {
  if (!valor) return undefined;
  const segundos = Number(valor);
  if (!Number.isNaN(segundos) && segundos >= 0) return Math.min(segundos * 1000, 10 * 60 * 1000);
  const data = Date.parse(valor);
  if (!Number.isNaN(data)) return Math.min(Math.max(data - Date.now(), 0), 10 * 60 * 1000);
  return undefined;
}

/** Remove raciocínio inline (<think>…</think>) e cercas de código em volta do JSON. */
function sanearConteudo(texto: string): string {
  let t = texto.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const cerca = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (cerca) t = cerca[1];
  // Alguns modelos ainda põem uma frase antes/depois do objeto: recorta do
  // primeiro '{' ao último '}'. (M5: >= 0 — objeto na posição 0 com lixo
  // depois do fechamento também precisa do recorte.)
  const inicio = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  if (inicio >= 0 && fim > inicio) t = t.slice(inicio, fim + 1);
  return t;
}

export function criarProvedorCompat(opts: OpcoesCompat): ProvedorIA {
  async function requisitar(chave: string, caminho: string, corpo?: unknown): Promise<RespostaChat> {
    let resposta: Response;
    try {
      resposta = await fetch(`${opts.baseUrl}${caminho}`, {
        method: corpo ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${chave}`,
          'Content-Type': 'application/json',
          ...opts.cabecalhos,
        },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
    } catch (e) {
      throw new ErroProvedor(`Falha de rede ao chamar o ${opts.nome}: ${String((e as Error).message ?? e)}`, 'transitorio');
    }
    const json = (await resposta.json().catch(() => ({}))) as RespostaChat;
    if (!resposta.ok) {
      throw classificarErro(
        opts.nome,
        resposta.status,
        json.error?.message ?? resposta.statusText,
        parsearRetryAfter(resposta.headers.get('retry-after')),
      );
    }
    return json;
  }

  /** Uma chamada de chat: devolve o JSON já saneado e o consumo normalizado.
      `req` traz o modelo e a temperatura resolvida (doc 08 §13). */
  async function completar(
    chave: string | null,
    req: { modelo: string; temperatura?: number; thinking?: ModoThinking },
    sistema: string,
    usuario: string,
  ): Promise<{ bruto: unknown; uso: UsoChamada }> {
    // Faixa 0–2, como na API da OpenAI que todos estes provedores imitam.
    const temperature = temperaturaDoPedido(req, 2);
    // `reasoning_effort` é a forma OpenAI-compatível, que é o que estes quatro
    // provedores imitam — preferida à `thinking: {type}` da Anthropic por ser a
    // que tem chance de valer nos outros. Medido na DeepSeek: "none" zera os
    // reasoning_tokens (181 → 20 tokens de saída na mesma frase). Só mandamos o
    // parâmetro quando a obra escolheu; sem escolha, o padrão do provedor vale.
    const reasoning_effort = req.thinking === 'desligado' ? 'none' : undefined;
    const corpo = {
      model: req.modelo,
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: usuario },
      ],
      response_format: { type: 'json_object' },
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      ...(temperature === undefined ? {} : { temperature }),
      ...(reasoning_effort === undefined ? {} : { reasoning_effort }),
    };
    const chaveApi = exigirChave(chave, opts.nome);
    const json = await requisitar(chaveApi, '/chat/completions', corpo).catch((e) => {
      // Modelo de raciocínio que fixa a amostragem: o 400 fala de `temperature`
      // e a chamada só precisa perder o parâmetro (mesmo desenho do fallback de
      // `thinkingConfig` do Gemini). Um provedor novo com regra própria não
      // derruba a tradução por causa disto.
      if (temperature !== undefined && e instanceof ErroProvedor && ehErroDeTemperatura(e.message)) {
        const { temperature: _, ...semTemperatura } = corpo;
        return requisitar(chaveApi, '/chat/completions', semTemperatura);
      }
      // Provedor que não conhece `reasoning_effort`: economia é desejável, não
      // essencial — perde o parâmetro e traduz, em vez de falhar o bloco.
      if (reasoning_effort !== undefined && e instanceof ErroProvedor && ehErroDeParametro(e.message, 'reasoning_effort')) {
        const { reasoning_effort: _, ...semRaciocinio } = corpo;
        return requisitar(chaveApi, '/chat/completions', semRaciocinio);
      }
      throw e;
    });
    const escolha = json.choices?.[0];
    // A1: resposta cortada pelo teto de tokens de saída — repetir a chamada
    // igual só paga de novo; quem trata é o chamador (dividindo o bloco).
    if (escolha?.finish_reason === 'length') {
      throw new ErroProvedor(
        `O ${opts.nome} truncou a resposta no limite de tokens de saída.`,
        'truncado',
      );
    }
    const mensagem = escolha?.message;
    // Fallback para `reasoning`: se o JSON final ficou lá, o saneamento o recorta.
    const conteudo = mensagem?.content?.trim() || mensagem?.reasoning?.trim();
    if (!conteudo) throw new ErroProvedor('O modelo não devolveu a resposta estruturada esperada.', 'transitorio');
    let bruto: unknown;
    try {
      bruto = JSON.parse(sanearConteudo(conteudo));
    } catch {
      throw new ErroProvedor('O modelo devolveu JSON inválido.', 'transitorio');
    }
    return { bruto, uso: usoDoCompat(json.usage) };
  }

  return {
    id: opts.id,
    nome: opts.nome,
    precisaChave: true,
    modeloPadrao: opts.modeloPadrao,

    async listarModelos(chave): Promise<ModeloInfo[]> {
      const json = await requisitar(exigirChave(chave, opts.nome), '/models');
      // Map por id: alguns catálogos (Mistral) devolvem o mesmo modelo repetido.
      const unicos = new Map<string, ModeloInfo>();
      for (const m of json.data ?? []) {
        if (opts.filtrarModelo && !opts.filtrarModelo(m.id)) continue;
        unicos.set(m.id, { id: m.id, nome: m.name ?? m.id });
      }
      return [...unicos.values()].sort((a, b) => a.id.localeCompare(b.id));
    },

    async testarCredencial(chave) {
      try {
        const modelos = await this.listarModelos(chave);
        return { ok: true, mensagem: `Chave válida — ${modelos.length} modelos disponíveis.` };
      } catch (e) {
        return { ok: false, mensagem: (e as Error).message };
      }
    },

    async traduzirBloco(chave, req: RequisicaoTraducaoBloco): Promise<RespostaTraducaoBloco> {
      const sistema = `${sistemaTraducao(req)}\n\n${instrucaoJson(CONTRATO_TRADUCAO)}`;
      const { bruto, uso } = await completar(chave, req, sistema, usuarioTraducao(req));
      try {
        const dados = CONTRATO_TRADUCAO.zod.parse(bruto);
        return { ...dados, bruta: JSON.stringify(bruto), uso };
      } catch (e) {
        if (e instanceof z.ZodError) {
          throw new ErroProvedor('Resposta do modelo fora do contrato de tradução.', 'transitorio');
        }
        throw e;
      }
    },

    async traduzirContracapa(chave, req: RequisicaoContracapa): Promise<RespostaContracapa> {
      const sistema = `${sistemaContracapa(req)}\n\n${instrucaoJson(CONTRATO_CONTRACAPA)}`;
      const { bruto, uso } = await completar(chave, req, sistema, usuarioContracapa(req));
      try {
        const dados = CONTRATO_CONTRACAPA.zod.parse(bruto);
        return { ...dados, bruta: JSON.stringify(bruto), uso };
      } catch (e) {
        if (e instanceof z.ZodError) {
          throw new ErroProvedor('Resposta do modelo fora do contrato de contracapa.', 'transitorio');
        }
        throw e;
      }
    },

    async extrairTermos(chave, req: RequisicaoExtrairTermos): Promise<RespostaExtrairTermos> {
      const sistema = `${sistemaExtrairTermos(req)}\n\n${instrucaoJson(CONTRATO_EXTRAIR_TERMOS)}`;
      const { bruto, uso } = await completar(chave, req, sistema, usuarioExtrairTermos(req));
      try {
        const dados = CONTRATO_EXTRAIR_TERMOS.zod.parse(bruto);
        return { ...dados, bruta: JSON.stringify(bruto), uso };
      } catch (e) {
        if (e instanceof z.ZodError) {
          throw new ErroProvedor('Resposta do modelo fora do contrato de extração de termos.', 'transitorio');
        }
        throw e;
      }
    },

    async revisarFrase(chave, req: RequisicaoRevisao): Promise<RespostaRevisaoProvedor> {
      const sistema = `${sistemaRevisao(req)}\n\n${instrucaoJson(CONTRATO_REVISAO)}`;
      const { bruto, uso } = await completar(chave, req, sistema, usuarioRevisao(req));
      try {
        const dados = CONTRATO_REVISAO.zod.parse(bruto);
        return { ...dados, bruta: JSON.stringify(bruto), uso };
      } catch (e) {
        if (e instanceof z.ZodError) {
          throw new ErroProvedor('Resposta do modelo fora do contrato do Protocolo de Revisão.', 'transitorio');
        }
        throw e;
      }
    },

    async refinarPrompt(chave, req: RequisicaoRefinarPrompt): Promise<RespostaRefinarPrompt> {
      const sistema = `${sistemaRefinarPrompt(req)}\n\n${instrucaoJson(CONTRATO_REFINAR_PROMPT)}`;
      const { bruto, uso } = await completar(chave, req, sistema, usuarioRefinarPrompt(req));
      try {
        const dados = CONTRATO_REFINAR_PROMPT.zod.parse(bruto);
        return { ...dados, bruta: JSON.stringify(bruto), uso };
      } catch (e) {
        if (e instanceof z.ZodError) {
          throw new ErroProvedor('Resposta do modelo fora do contrato de refinamento do prompt.', 'transitorio');
        }
        throw e;
      }
    },

    async analisarQa(chave, req: RequisicaoQa): Promise<RespostaQa> {
      const sistema = `${sistemaQa(req)}\n\n${instrucaoJson(CONTRATO_QA)}`;
      const { bruto, uso } = await completar(chave, req, sistema, usuarioQa(req));
      try {
        const dados = CONTRATO_QA.zod.parse(bruto);
        return { ...dados, bruta: JSON.stringify(bruto), uso };
      } catch (e) {
        if (e instanceof z.ZodError) {
          throw new ErroProvedor('Resposta do modelo fora do contrato de QA.', 'transitorio');
        }
        throw e;
      }
    },

    async passeEstilo(chave, req: RequisicaoPasseEstilo): Promise<RespostaPasseEstilo> {
      const sistema = `${sistemaPasseEstilo(req)}\n\n${instrucaoJson(CONTRATO_PASSE_ESTILO)}`;
      const { bruto, uso } = await completar(chave, req, sistema, usuarioPasseEstilo(req));
      try {
        const dados = CONTRATO_PASSE_ESTILO.zod.parse(bruto);
        return { ...dados, bruta: JSON.stringify(bruto), uso };
      } catch (e) {
        if (e instanceof z.ZodError) {
          throw new ErroProvedor('Resposta do modelo fora do contrato do passe de estilo.', 'transitorio');
        }
        throw e;
      }
    },

    async revisarLiterariamente(chave, req: RequisicaoRevisaoLiteraria): Promise<RespostaRevisaoLiteraria> {
      const sistema = `${sistemaRevisaoLiteraria(req)}\n\n${instrucaoJson(CONTRATO_REVISAO_LITERARIA)}`;
      const { bruto, uso } = await completar(chave, req, sistema, usuarioRevisaoLiteraria(req));
      try {
        const dados = CONTRATO_REVISAO_LITERARIA.zod.parse(bruto);
        return { ...dados, bruta: JSON.stringify(bruto), uso };
      } catch (e) {
        if (e instanceof z.ZodError) throw new ErroProvedor('Resposta fora do contrato da revisão literária.', 'transitorio');
        throw e;
      }
    },

    async adjudicarRevisaoLiteraria(chave, req: RequisicaoAdjudicacaoLiteraria): Promise<RespostaAdjudicacaoLiteraria> {
      const sistema = `${sistemaAdjudicacaoLiteraria(req)}\n\n${instrucaoJson(CONTRATO_ADJUDICACAO_LITERARIA)}`;
      const { bruto, uso } = await completar(chave, req, sistema, usuarioAdjudicacaoLiteraria(req));
      try {
        const dados = CONTRATO_ADJUDICACAO_LITERARIA.zod.parse(bruto);
        return { ...dados, bruta: JSON.stringify(bruto), uso };
      } catch (e) {
        if (e instanceof z.ZodError) throw new ErroProvedor('Resposta fora do contrato da adjudicação literária.', 'transitorio');
        throw e;
      }
    },
  };
}

function exigirChave(chave: string | null, nome: string): string {
  if (!chave) {
    throw new ErroProvedor(`Nenhuma chave de API do ${nome} configurada. Cadastre em Configurações.`, 'fatal');
  }
  return chave;
}
