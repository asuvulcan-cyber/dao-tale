import { ApiError, GoogleGenAI, type GenerateContentConfig } from '@google/genai';
import { z } from 'zod';
import type { ModeloInfo } from '@dao-tale/shared';
import {
  ErroProvedor,
  type ProvedorIA,
  type RequisicaoContracapa,
  type RequisicaoExtrairTermos,
  type RequisicaoPasseEstilo,
  type RequisicaoRefinarPrompt,
  type RequisicaoRevisao,
  type RequisicaoTraducaoBloco,
  type RequisicaoQa,
  type RespostaContracapa,
  type RespostaExtrairTermos,
  type RespostaPasseEstilo,
  type RespostaQa,
  type RespostaRefinarPrompt,
  type RespostaRevisaoProvedor,
  type RespostaTraducaoBloco,
} from './provedor.js';
import {
  sistemaContracapa,
  sistemaExtrairTermos,
  sistemaPasseEstilo,
  sistemaQa,
  sistemaRefinarPrompt,
  sistemaRevisao,
  sistemaTraducao,
  usuarioContracapa,
  usuarioExtrairTermos,
  usuarioPasseEstilo,
  usuarioQa,
  usuarioRefinarPrompt,
  usuarioRevisao,
  usuarioTraducao,
} from './prompts.js';
import {
  CONTRATO_CONTRACAPA,
  CONTRATO_EXTRAIR_TERMOS,
  CONTRATO_PASSE_ESTILO,
  CONTRATO_QA,
  CONTRATO_REFINAR_PROMPT,
  CONTRATO_REVISAO,
  CONTRATO_TRADUCAO,
  paraGemini,
} from './contratos.js';
import { usoDoGemini } from './uso.js';
import { ehErroDeTemperatura, temperaturaDoPedido } from './temperatura.js';

// Schemas no formato do Gemini (responseSchema), derivados da fonte única (M7).

const SCHEMA_TRADUCAO_GEMINI = paraGemini(CONTRATO_TRADUCAO.schema);
const SCHEMA_CONTRACAPA_GEMINI = paraGemini(CONTRATO_CONTRACAPA.schema);
const SCHEMA_EXTRAIR_TERMOS_GEMINI = paraGemini(CONTRATO_EXTRAIR_TERMOS.schema);
const SCHEMA_REVISAO_GEMINI = paraGemini(CONTRATO_REVISAO.schema);
const SCHEMA_REFINAR_GEMINI = paraGemini(CONTRATO_REFINAR_PROMPT.schema);
const SCHEMA_QA_GEMINI = paraGemini(CONTRATO_QA.schema);
const SCHEMA_PASSE_ESTILO_GEMINI = paraGemini(CONTRATO_PASSE_ESTILO.schema);

function classificarErro(e: unknown): ErroProvedor {
  if (e instanceof ApiError) {
    const status = e.status ?? 0;
    if (status === 401 || status === 403) {
      return new ErroProvedor('Chave de API do Gemini inválida ou sem permissão. Verifique em Configurações.', 'fatal');
    }
    if (status === 400) {
      return new ErroProvedor(`Requisição rejeitada pela API do Gemini: ${e.message}`, 'fatal');
    }
    if (status === 429) {
      return new ErroProvedor('Limite de requisições do Gemini atingido (429).', 'limite');
    }
    return new ErroProvedor(`Erro da API do Gemini (${status}): ${e.message}`, 'transitorio');
  }
  return new ErroProvedor(`Falha de rede ao chamar o Gemini: ${String((e as Error).message ?? e)}`, 'transitorio');
}

function parsearJson(texto: string | undefined): unknown {
  if (!texto) throw new ErroProvedor('O modelo não devolveu a resposta estruturada esperada.', 'transitorio');
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErroProvedor('O modelo devolveu JSON inválido.', 'transitorio');
  }
}

// Tradução é tarefa direta: raciocínio prolongado ("thinking") dos modelos 2.5+
// só queima tokens de saída sem melhorar o texto. Desliga em toda a família
// flash (inclusive apelidos -latest); modelos que rejeitarem a opção (400) são
// repetidos sem ela. A revisão fica de fora — lá o raciocínio ajuda no veredito.
function pensamentoEconomico(modelo: string): { thinkingBudget: number } | undefined {
  return /flash/.test(modelo) ? { thinkingBudget: 0 } : undefined;
}

// Amostragem (doc 08 §13): o Gemini aceita temperature de 0 a 2. Independente do
// thinking — a contracapa mantém o raciocínio ligado (§11) e ainda assim manda
// a temperatura dela.
function amostragem(req: { modelo: string; temperatura?: number }): { temperature?: number } {
  const t = temperaturaDoPedido(req, 2);
  return t === undefined ? {} : { temperature: t };
}

/** Uma chamada com as duas quedas de configuração que o catálogo do Gemini
    exige: 400 com `thinkingConfig` → repete sem ele (modelo que não deixa
    desligar o raciocínio); 400 falando de `temperature` → repete sem ela
    (modelo de raciocínio que fixa a amostragem). Cada queda é definitiva
    apenas para esta chamada — a configuração seguinte tenta de novo. */
async function gerar(
  cliente: GoogleGenAI,
  modelo: string,
  contents: string,
  config: GenerateContentConfig,
): ReturnType<GoogleGenAI['models']['generateContent']> {
  try {
    return await cliente.models.generateContent({ model: modelo, contents, config });
  } catch (e) {
    if (e instanceof ApiError && e.status === 400) {
      if (config.thinkingConfig) return gerar(cliente, modelo, contents, { ...config, thinkingConfig: undefined });
      if (config.temperature !== undefined && ehErroDeTemperatura(e.message)) {
        return gerar(cliente, modelo, contents, { ...config, temperature: undefined });
      }
    }
    throw e;
  }
}

export const provedorGemini: ProvedorIA = {
  id: 'gemini',
  nome: 'Gemini (Google)',
  precisaChave: true,
  // Apelido -latest: sempre a geração flash mais recente; ids fixos de geração
  // (ex.: gemini-2.5-flash) deixam de valer para contas novas quando saem de linha.
  modeloPadrao: 'gemini-flash-latest',

  async listarModelos(chave): Promise<ModeloInfo[]> {
    const cliente = new GoogleGenAI({ apiKey: exigirChave(chave) });
    // Curadoria para tradução: fora modalidades não-texto, duplicatas datadas
    // (-001) e gerações < 3 — estas dão 404 ("no longer available to new users")
    // em contas novas; os apelidos -latest cobrem quem precisa delas.
    const NAO_SERVE = /tts|image|robotics|computer-use|omni|veo|audio|live|-\d{3}$/;
    const geracao = (id: string) => Number(id.match(/-(\d+(?:\.\d+)?)-?/)?.[1] ?? 0);
    try {
      const modelos: ModeloInfo[] = [];
      const pagina = await cliente.models.list();
      for await (const m of pagina) {
        const id = (m.name ?? '').replace(/^models\//, '');
        if (!id.includes('gemini')) continue;
        if (m.supportedActions && !m.supportedActions.includes('generateContent')) continue;
        if (NAO_SERVE.test(id)) continue;
        if (!/-latest$/.test(id) && geracao(id) < 3) continue;
        modelos.push({ id, nome: m.displayName ?? id });
      }
      return modelos;
    } catch (e) {
      throw classificarErro(e);
    }
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
    const cliente = new GoogleGenAI({ apiKey: exigirChave(chave) });
    try {
      const resposta = await gerar(cliente, req.modelo, usuarioTraducao(req), {
        systemInstruction: sistemaTraducao(req),
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_TRADUCAO_GEMINI,
        thinkingConfig: pensamentoEconomico(req.modelo),
        ...amostragem(req),
      });
      // A1: resposta cortada pelo teto de tokens de saída — o job divide o bloco.
      if (resposta.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new ErroProvedor('O Gemini truncou a resposta no limite de tokens de saída.', 'truncado');
      }
      const bruto = parsearJson(resposta.text);
      const dados = CONTRATO_TRADUCAO.zod.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto), uso: usoDoGemini(resposta.usageMetadata, resposta.modelVersion) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato de tradução.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },

  async traduzirContracapa(chave, req: RequisicaoContracapa): Promise<RespostaContracapa> {
    const cliente = new GoogleGenAI({ apiKey: exigirChave(chave) });
    try {
      // Sem `pensamentoEconomico` de propósito: aqui o raciocínio é o produto
      // (localizar chengyu e imagem cultural) e a chamada acontece 1× por obra
      // — economizar tokens de pensamento nesta tarefa é economia no lugar errado.
      const resposta = await gerar(cliente, req.modelo, usuarioContracapa(req), {
        systemInstruction: sistemaContracapa(req),
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_CONTRACAPA_GEMINI,
        ...amostragem(req),
      });
      if (resposta.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new ErroProvedor('O Gemini truncou a contracapa no limite de tokens de saída.', 'truncado');
      }
      const bruto = parsearJson(resposta.text);
      const dados = CONTRATO_CONTRACAPA.zod.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto), uso: usoDoGemini(resposta.usageMetadata, resposta.modelVersion) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato de contracapa.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },

  async extrairTermos(chave, req: RequisicaoExtrairTermos): Promise<RespostaExtrairTermos> {
    const cliente = new GoogleGenAI({ apiKey: exigirChave(chave) });
    try {
      const resposta = await gerar(cliente, req.modelo, usuarioExtrairTermos(req), {
        systemInstruction: sistemaExtrairTermos(req),
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_EXTRAIR_TERMOS_GEMINI,
        ...amostragem(req),
      });
      const bruto = parsearJson(resposta.text);
      const dados = CONTRATO_EXTRAIR_TERMOS.zod.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto), uso: usoDoGemini(resposta.usageMetadata, resposta.modelVersion) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato de extração de termos.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },

  async revisarFrase(chave, req: RequisicaoRevisao): Promise<RespostaRevisaoProvedor> {
    const cliente = new GoogleGenAI({ apiKey: exigirChave(chave) });
    try {
      const resposta = await gerar(cliente, req.modelo, usuarioRevisao(req), {
        systemInstruction: sistemaRevisao(req),
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_REVISAO_GEMINI,
        ...amostragem(req),
      });
      const bruto = parsearJson(resposta.text);
      const dados = CONTRATO_REVISAO.zod.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto), uso: usoDoGemini(resposta.usageMetadata, resposta.modelVersion) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato do Protocolo de Revisão.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },

  async refinarPrompt(chave, req: RequisicaoRefinarPrompt): Promise<RespostaRefinarPrompt> {
    const cliente = new GoogleGenAI({ apiKey: exigirChave(chave) });
    try {
      const resposta = await gerar(cliente, req.modelo, usuarioRefinarPrompt(req), {
        systemInstruction: sistemaRefinarPrompt(req),
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_REFINAR_GEMINI,
        ...amostragem(req),
      });
      const bruto = parsearJson(resposta.text);
      const dados = CONTRATO_REFINAR_PROMPT.zod.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto), uso: usoDoGemini(resposta.usageMetadata, resposta.modelVersion) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato de refinamento do prompt.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },

  async analisarQa(chave, req: RequisicaoQa): Promise<RespostaQa> {
    const cliente = new GoogleGenAI({ apiKey: exigirChave(chave) });
    try {
      const resposta = await gerar(cliente, req.modelo, usuarioQa(req), {
        systemInstruction: sistemaQa(req),
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_QA_GEMINI,
        ...amostragem(req),
      });
      if (resposta.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new ErroProvedor('O Gemini truncou a resposta de QA no limite de tokens de saída.', 'truncado');
      }
      const bruto = parsearJson(resposta.text);
      const dados = CONTRATO_QA.zod.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto), uso: usoDoGemini(resposta.usageMetadata, resposta.modelVersion) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato de QA.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },

  async passeEstilo(chave, req: RequisicaoPasseEstilo): Promise<RespostaPasseEstilo> {
    const cliente = new GoogleGenAI({ apiKey: exigirChave(chave) });
    try {
      const resposta = await gerar(cliente, req.modelo, usuarioPasseEstilo(req), {
        systemInstruction: sistemaPasseEstilo(req),
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_PASSE_ESTILO_GEMINI,
        ...amostragem(req),
      });
      if (resposta.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        throw new ErroProvedor('O Gemini truncou o passe de estilo no limite de tokens de saída.', 'truncado');
      }
      const bruto = parsearJson(resposta.text);
      const dados = CONTRATO_PASSE_ESTILO.zod.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto), uso: usoDoGemini(resposta.usageMetadata, resposta.modelVersion) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato do passe de estilo.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },
};

function exigirChave(chave: string | null): string {
  if (!chave) {
    throw new ErroProvedor('Nenhuma chave de API do Gemini configurada. Cadastre em Configurações.', 'fatal');
  }
  return chave;
}
