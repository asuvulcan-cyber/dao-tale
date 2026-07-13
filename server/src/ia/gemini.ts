import { ApiError, GoogleGenAI, Type, type Schema } from '@google/genai';
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
import { sistemaRevisao, sistemaTraducao, usuarioRevisao, usuarioTraducao } from './prompts.js';

// Schemas no formato do Gemini (responseSchema). Espelham os de prompts.ts.

const SCHEMA_TRADUCAO_GEMINI: Schema = {
  type: Type.OBJECT,
  properties: {
    traducoes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          ordem: { type: Type.INTEGER, description: 'Número da frase, exatamente como recebido' },
          texto_pt: { type: Type.STRING, description: 'Tradução em português brasileiro' },
        },
        required: ['ordem', 'texto_pt'],
      },
    },
    termos_novos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          termo_zh: { type: Type.STRING },
          termo_pt: { type: Type.STRING },
          categoria: {
            type: Type.STRING,
            enum: ['local', 'poder-habilidade', 'entidade', 'titulo-cargo', 'personagem', 'outro'],
          },
          contexto: { type: Type.STRING },
        },
        required: ['termo_zh', 'termo_pt'],
      },
    },
  },
  required: ['traducoes', 'termos_novos'],
};

const SCHEMA_REVISAO_GEMINI: Schema = {
  type: Type.OBJECT,
  properties: {
    trecho_zh: { type: Type.STRING },
    veredito: { type: Type.STRING, enum: ['correto', 'incorreto'] },
    justificativa: { type: Type.STRING },
    secao_regra: { type: Type.STRING },
    correcao_proposta: { type: Type.STRING, nullable: true },
  },
  required: ['trecho_zh', 'veredito', 'justificativa', 'secao_regra'],
};

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
      const config = {
        systemInstruction: sistemaTraducao(req),
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_TRADUCAO_GEMINI,
        thinkingConfig: pensamentoEconomico(req.modelo),
      };
      const gerar = (cfg: typeof config) =>
        cliente.models.generateContent({ model: req.modelo, contents: usuarioTraducao(req), config: cfg });
      const resposta = await gerar(config).catch((e) => {
        // Modelo que não aceita desligar o thinking (400): repete sem a opção.
        if (config.thinkingConfig && e instanceof ApiError && e.status === 400) {
          return gerar({ ...config, thinkingConfig: undefined });
        }
        throw e;
      });
      const bruto = parsearJson(resposta.text);
      const dados = respostaTraducaoSchema.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato de tradução.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },

  async revisarFrase(chave, req: RequisicaoRevisao): Promise<RespostaRevisaoProvedor> {
    const cliente = new GoogleGenAI({ apiKey: exigirChave(chave) });
    try {
      const resposta = await cliente.models.generateContent({
        model: req.modelo,
        contents: usuarioRevisao(req),
        config: {
          systemInstruction: sistemaRevisao(req),
          responseMimeType: 'application/json',
          responseSchema: SCHEMA_REVISAO_GEMINI,
        },
      });
      const bruto = parsearJson(resposta.text);
      const dados = respostaRevisaoSchema.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato do Protocolo de Revisão.', 'transitorio');
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
