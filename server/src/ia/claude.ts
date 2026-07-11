import Anthropic from '@anthropic-ai/sdk';
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
import {
  SCHEMA_REVISAO,
  SCHEMA_TRADUCAO,
  sistemaRevisao,
  sistemaTraducao,
  usuarioRevisao,
  usuarioTraducao,
} from './prompts.js';

import { respostaRevisaoSchema, respostaTraducaoSchema } from './respostas.js';

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
      return new ErroProvedor('Limite de requisições da Anthropic atingido (429).', 'limite');
    }
    return new ErroProvedor(`Erro da API da Anthropic (${status}): ${e.message}`, 'transitorio');
  }
  return new ErroProvedor(`Falha de rede ao chamar a Anthropic: ${String((e as Error).message ?? e)}`, 'transitorio');
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
        // cache_control: o sistema (prompt mãe + glossário) é idêntico em todos os
        // blocos do capítulo — cacheia e corta o custo de entrada nos blocos seguintes.
        system: [
          {
            type: 'text',
            text: sistemaTraducao(req.promptMae, req.glossario),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: usuarioTraducao(req) }],
        tools: [
          {
            name: 'entregar_traducoes',
            description: 'Entrega as traduções do bloco e os termos novos detectados.',
            input_schema: SCHEMA_TRADUCAO as Anthropic.Tool['input_schema'],
          },
        ],
        tool_choice: { type: 'tool', name: 'entregar_traducoes' },
      });
      const bruto = extrairToolUse(resposta, 'entregar_traducoes');
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
    const cliente = new Anthropic({ apiKey: exigirChave(chave) });
    try {
      const resposta = await cliente.messages.create({
        model: req.modelo,
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: sistemaRevisao(req.promptMae, req.glossario),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: usuarioRevisao(req) }],
        tools: [
          {
            name: 'entregar_revisao',
            description: 'Entrega a análise estruturada do Protocolo de Revisão.',
            input_schema: SCHEMA_REVISAO as Anthropic.Tool['input_schema'],
          },
        ],
        tool_choice: { type: 'tool', name: 'entregar_revisao' },
      });
      const bruto = extrairToolUse(resposta, 'entregar_revisao');
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
    throw new ErroProvedor('Nenhuma chave de API da Anthropic configurada. Cadastre em Configurações.', 'fatal');
  }
  return chave;
}
