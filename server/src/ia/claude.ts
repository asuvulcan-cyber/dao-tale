import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ModeloInfo } from '@dao-tale/shared';
import {
  ErroProvedor,
  type ProvedorIA,
  type RequisicaoContracapa,
  type RequisicaoExtrairTermos,
  type RequisicaoQa,
  type RequisicaoRefinarPrompt,
  type RequisicaoRevisao,
  type RequisicaoTraducaoBloco,
  type RespostaContracapa,
  type RespostaExtrairTermos,
  type RespostaQa,
  type RespostaRefinarPrompt,
  type RespostaRevisaoProvedor,
  type RespostaTraducaoBloco,
} from './provedor.js';
import {
  sistemaContracapaPartes,
  sistemaExtrairTermosPartes,
  sistemaQaPartes,
  sistemaRefinarPromptPartes,
  sistemaRevisaoPartes,
  sistemaTraducaoPartes,
  usuarioContracapa,
  usuarioExtrairTermos,
  usuarioQa,
  usuarioRefinarPrompt,
  usuarioRevisao,
  usuarioTraducao,
  type PartesSistema,
} from './prompts.js';
import {
  CONTRATO_CONTRACAPA,
  CONTRATO_EXTRAIR_TERMOS,
  CONTRATO_QA,
  CONTRATO_REFINAR_PROMPT,
  CONTRATO_REVISAO,
  CONTRATO_TRADUCAO,
  type Contrato,
} from './contratos.js';
import { usoDoClaude } from './uso.js';
import { temperaturaDoPedido } from './temperatura.js';

// Amostragem (doc 08 §13): a Anthropic aceita temperature de 0 a 1 — a faixa
// mais estreita entre os provedores, então o valor resolvido é aparado aqui.
// Sem fallback de 400 como no Gemini/compat: o tool use do Claude aceita
// temperature em toda a família, e o raciocínio estendido (o único modo que a
// fixaria em 1) não é usado por nenhuma tarefa do aplicativo.
function amostragem(req: { modelo: string; temperatura?: number }): { temperature?: number } {
  const t = temperaturaDoPedido(req, 1);
  return t === undefined ? {} : { temperature: t };
}

function classificarErro(e: unknown): ErroProvedor {
  if (e instanceof Anthropic.APIError) {
    const status = e.status ?? 0;
    if (status === 401 || status === 403) {
      return new ErroProvedor('Chave de API da Anthropic inválida ou sem permissão. Verifique em Configurações.', 'fatal');
    }
    if (status === 400) {
      return new ErroProvedor(`Requisição rejeitada pela API da Anthropic: ${e.message}`, 'fatal');
    }
    if (status === 429) {
      const retryAfter = Number(e.headers?.get('retry-after'));
      return new ErroProvedor('Limite de requisições da Anthropic atingido (429).', 'limite', {
        retryAfterMs: !Number.isNaN(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      });
    }
    return new ErroProvedor(`Erro da API da Anthropic (${status}): ${e.message}`, 'transitorio');
  }
  return new ErroProvedor(`Falha de rede ao chamar a Anthropic: ${String((e as Error).message ?? e)}`, 'transitorio');
}

// Sistema em dois blocos cacheados (doc 08 §3): o 1º é o prompt mãe composto
// (núcleo + delta) — prefixo compartilhado entre tradução, revisão e extração
// da mesma obra —, o 2º são as instruções da tarefa. Abaixo do mínimo cacheável
// do modelo o breakpoint simplesmente não pega, sem erro.
function sistemaEmBlocos(partes: PartesSistema): Anthropic.TextBlockParam[] {
  return [
    { type: 'text', text: partes.base, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: partes.operacional, cache_control: { type: 'ephemeral' } },
  ];
}

function extrairToolUse(resposta: Anthropic.Message, nomeFerramenta: string): unknown {
  const bloco = resposta.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === nomeFerramenta,
  );
  if (!bloco) {
    throw new ErroProvedor('O modelo não devolveu a resposta estruturada esperada.', 'transitorio');
  }
  return bloco.input;
}

/** Ferramenta única forçada (tool use) a partir do contrato (fonte única — M7). */
function ferramenta(contrato: Contrato): Pick<Anthropic.MessageCreateParams, 'tools' | 'tool_choice'> {
  return {
    tools: [
      {
        name: contrato.ferramenta,
        description: contrato.descricao,
        input_schema: contrato.schema as Anthropic.Tool['input_schema'],
      },
    ],
    tool_choice: { type: 'tool', name: contrato.ferramenta },
  };
}

export const provedorClaude: ProvedorIA = {
  id: 'claude',
  nome: 'Claude (Anthropic)',
  precisaChave: true,
  modeloPadrao: 'claude-sonnet-5',

  async listarModelos(chave): Promise<ModeloInfo[]> {
    const cliente = new Anthropic({ apiKey: exigirChave(chave) });
    try {
      const pagina = await cliente.models.list({ limit: 50 });
      return pagina.data.map((m) => ({ id: m.id, nome: m.display_name ?? m.id }));
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
    const cliente = new Anthropic({ apiKey: exigirChave(chave) });
    try {
      const resposta = await cliente.messages.create({
        model: req.modelo,
        max_tokens: 8192,
        ...amostragem(req),
        system: sistemaEmBlocos(sistemaTraducaoPartes(req)),
        messages: [{ role: 'user', content: usuarioTraducao(req) }],
        ...ferramenta(CONTRATO_TRADUCAO),
      });
      // A1: bloco grande demais para o teto de saída — o tool use vem cortado
      // e repetir a chamada igual só paga de novo; o job divide o bloco.
      if (resposta.stop_reason === 'max_tokens') {
        throw new ErroProvedor('A Anthropic truncou a resposta no limite de tokens de saída.', 'truncado');
      }
      const bruto = extrairToolUse(resposta, CONTRATO_TRADUCAO.ferramenta);
      const dados = CONTRATO_TRADUCAO.zod.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto), uso: usoDoClaude(resposta.usage) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato de tradução.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },

  async traduzirContracapa(chave, req: RequisicaoContracapa): Promise<RespostaContracapa> {
    const cliente = new Anthropic({ apiKey: exigirChave(chave) });
    try {
      const resposta = await cliente.messages.create({
        model: req.modelo,
        max_tokens: 4096,
        ...amostragem(req),
        system: sistemaEmBlocos(sistemaContracapaPartes(req)),
        messages: [{ role: 'user', content: usuarioContracapa(req) }],
        ...ferramenta(CONTRATO_CONTRACAPA),
      });
      if (resposta.stop_reason === 'max_tokens') {
        throw new ErroProvedor('A Anthropic truncou a contracapa no limite de tokens de saída.', 'truncado');
      }
      const bruto = extrairToolUse(resposta, CONTRATO_CONTRACAPA.ferramenta);
      const dados = CONTRATO_CONTRACAPA.zod.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto), uso: usoDoClaude(resposta.usage) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato de contracapa.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },

  async extrairTermos(chave, req: RequisicaoExtrairTermos): Promise<RespostaExtrairTermos> {
    const cliente = new Anthropic({ apiKey: exigirChave(chave) });
    try {
      const resposta = await cliente.messages.create({
        model: req.modelo,
        max_tokens: 2048,
        ...amostragem(req),
        system: sistemaEmBlocos(sistemaExtrairTermosPartes(req)),
        messages: [{ role: 'user', content: usuarioExtrairTermos(req) }],
        ...ferramenta(CONTRATO_EXTRAIR_TERMOS),
      });
      const bruto = extrairToolUse(resposta, CONTRATO_EXTRAIR_TERMOS.ferramenta);
      const dados = CONTRATO_EXTRAIR_TERMOS.zod.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto), uso: usoDoClaude(resposta.usage) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato de extração de termos.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },

  async revisarFrase(chave, req: RequisicaoRevisao): Promise<RespostaRevisaoProvedor> {
    const cliente = new Anthropic({ apiKey: exigirChave(chave) });
    try {
      const resposta = await cliente.messages.create({
        model: req.modelo,
        max_tokens: 4096,
        ...amostragem(req),
        system: sistemaEmBlocos(sistemaRevisaoPartes(req)),
        messages: [{ role: 'user', content: usuarioRevisao(req) }],
        ...ferramenta(CONTRATO_REVISAO),
      });
      const bruto = extrairToolUse(resposta, CONTRATO_REVISAO.ferramenta);
      const dados = CONTRATO_REVISAO.zod.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto), uso: usoDoClaude(resposta.usage) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato do Protocolo de Revisão.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },

  async refinarPrompt(chave, req: RequisicaoRefinarPrompt): Promise<RespostaRefinarPrompt> {
    const cliente = new Anthropic({ apiKey: exigirChave(chave) });
    try {
      const resposta = await cliente.messages.create({
        model: req.modelo,
        max_tokens: 4096,
        ...amostragem(req),
        system: sistemaEmBlocos(sistemaRefinarPromptPartes(req)),
        messages: [{ role: 'user', content: usuarioRefinarPrompt(req) }],
        ...ferramenta(CONTRATO_REFINAR_PROMPT),
      });
      const bruto = extrairToolUse(resposta, CONTRATO_REFINAR_PROMPT.ferramenta);
      const dados = CONTRATO_REFINAR_PROMPT.zod.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto), uso: usoDoClaude(resposta.usage) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato de refinamento do prompt.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },

  async analisarQa(chave, req: RequisicaoQa): Promise<RespostaQa> {
    const cliente = new Anthropic({ apiKey: exigirChave(chave) });
    try {
      const resposta = await cliente.messages.create({
        model: req.modelo,
        max_tokens: 8192,
        ...amostragem(req),
        system: sistemaEmBlocos(sistemaQaPartes(req)),
        messages: [{ role: 'user', content: usuarioQa(req) }],
        ...ferramenta(CONTRATO_QA),
      });
      if (resposta.stop_reason === 'max_tokens') {
        throw new ErroProvedor('A Anthropic truncou a resposta de QA no limite de tokens de saída.', 'truncado');
      }
      const bruto = extrairToolUse(resposta, CONTRATO_QA.ferramenta);
      const dados = CONTRATO_QA.zod.parse(bruto);
      return { ...dados, bruta: JSON.stringify(bruto), uso: usoDoClaude(resposta.usage) };
    } catch (e) {
      if (e instanceof ErroProvedor) throw e;
      if (e instanceof z.ZodError) {
        throw new ErroProvedor('Resposta do modelo fora do contrato de QA.', 'transitorio');
      }
      throw classificarErro(e);
    }
  },
};

function exigirChave(chave: string | null): string {
  if (!chave) {
    throw new ErroProvedor('Nenhuma chave de API da Anthropic configurada. Cadastre em Configurações.', 'fatal');
  }
  return chave;
}
