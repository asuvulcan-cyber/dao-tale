import { z } from 'zod';
import type { ModeloInfo } from '@dao-tale/shared';
import {
  ErroProvedor,
  type ProvedorIA,
  type RequisicaoRevisao,
  type RequisicaoTraducaoBloco,
  type RespostaRevisaoProvedor,
  type RespostaTraducaoBloco,
} from './provedor.js';
import { respostaRevisaoSchema, respostaTraducaoSchema } from './respostas.js';
import {
  INSTRUCAO_JSON_REVISAO,
  INSTRUCAO_JSON_TRADUCAO,
  sistemaRevisao,
  sistemaTraducao,
  usuarioRevisao,
  usuarioTraducao,
} from './prompts.js';

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
  choices?: { message?: { content?: string | null; reasoning?: string | null } }[];
  data?: { id: string; name?: string }[];
  error?: { message?: string };
}

function classificarErro(nome: string, status: number, mensagem: string): ErroProvedor {
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
    return new ErroProvedor(`Limite de requisições do ${nome} atingido (429).`, 'limite');
  }
  return new ErroProvedor(`Erro da API do ${nome} (${status}): ${mensagem}`, 'transitorio');
}

/** Remove raciocínio inline (<think>…</think>) e cercas de código em volta do JSON. */
function sanearConteudo(texto: string): string {
  let t = texto.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const cerca = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (cerca) t = cerca[1];
  // Alguns modelos ainda põem uma frase antes/depois do objeto: recorta do
  // primeiro '{' ao último '}'.
  const inicio = t.indexOf('{');
  const fim = t.lastIndexOf('}');
  if (inicio > 0 && fim > inicio) t = t.slice(inicio, fim + 1);
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
      throw classificarErro(opts.nome, resposta.status, json.error?.message ?? resposta.statusText);
    }
    return json;
  }

  async function completar(chave: string | null, modelo: string, sistema: string, usuario: string): Promise<unknown> {
    const json = await requisitar(exigirChave(chave, opts.nome), '/chat/completions', {
      model: modelo,
      messages: [
        { role: 'system', content: sistema },
        { role: 'user', content: usuario },
      ],
      response_format: { type: 'json_object' },
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
    });
    const mensagem = json.choices?.[0]?.message;
    // Fallback para `reasoning`: se o JSON final ficou lá, o saneamento o recorta.
    const conteudo = mensagem?.content?.trim() || mensagem?.reasoning?.trim();
    if (!conteudo) throw new ErroProvedor('O modelo não devolveu a resposta estruturada esperada.', 'transitorio');
    try {
      return JSON.parse(sanearConteudo(conteudo));
    } catch {
      throw new ErroProvedor('O modelo devolveu JSON inválido.', 'transitorio');
    }
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
      const sistema = `${sistemaTraducao(req)}\n\n${INSTRUCAO_JSON_TRADUCAO}`;
      const bruto = await completar(chave, req.modelo, sistema, usuarioTraducao(req));
      try {
        const dados = respostaTraducaoSchema.parse(bruto);
        return { ...dados, bruta: JSON.stringify(bruto) };
      } catch (e) {
        if (e instanceof z.ZodError) {
          throw new ErroProvedor('Resposta do modelo fora do contrato de tradução.', 'transitorio');
        }
        throw e;
      }
    },

    async revisarFrase(chave, req: RequisicaoRevisao): Promise<RespostaRevisaoProvedor> {
      const sistema = `${sistemaRevisao(req)}\n\n${INSTRUCAO_JSON_REVISAO}`;
      const bruto = await completar(chave, req.modelo, sistema, usuarioRevisao(req));
      try {
        const dados = respostaRevisaoSchema.parse(bruto);
        return { ...dados, bruta: JSON.stringify(bruto) };
      } catch (e) {
        if (e instanceof z.ZodError) {
          throw new ErroProvedor('Resposta do modelo fora do contrato do Protocolo de Revisão.', 'transitorio');
        }
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
