import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONFIG_PADRAO,
  TEMPERATURAS_PADRAO,
  normalizarTemperaturas,
  resolverTemperatura,
} from '@dao-tale/shared';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposConfig, reposObras } from '../db/repos.js';
import { criarProvedorCompat } from './compat.js';
import { aceitaTemperatura, ehErroDeTemperatura, temperaturaDoPedido } from './temperatura.js';

// Controle de amostragem (doc 08 §13). Até aqui nenhum provedor definia
// `temperature` e toda chamada saía no padrão do modelo (1.0) — a variância que
// afogou o portão A/B do §12. Esta bateria cobre as três camadas: resolução
// (padrão do papel + override da obra), o que cada provedor manda no corpo da
// requisição e a queda para o modelo que não aceita o parâmetro.

describe('resolverTemperatura', () => {
  it('usa o padrão do papel quando a obra não tem override', () => {
    expect(resolverTemperatura(TEMPERATURAS_PADRAO, 'traducao', null)).toBe(0.3);
    expect(resolverTemperatura(TEMPERATURAS_PADRAO, 'revisao')).toBe(0.2);
    expect(resolverTemperatura(TEMPERATURAS_PADRAO, 'titulo', undefined)).toBe(0.4);
  });

  it('override da obra vence o padrão do papel, inclusive zero', () => {
    expect(resolverTemperatura(TEMPERATURAS_PADRAO, 'traducao', 0.9)).toBe(0.9);
    // 0 é valor legítimo (quase determinístico) — não pode cair no padrão.
    expect(resolverTemperatura(TEMPERATURAS_PADRAO, 'traducao', 0)).toBe(0);
  });

  it('valor fora da faixa (ou corrompido) cai no padrão em vez de virar chamada rejeitada', () => {
    expect(resolverTemperatura(TEMPERATURAS_PADRAO, 'traducao', 7)).toBe(0.3);
    expect(resolverTemperatura(TEMPERATURAS_PADRAO, 'traducao', -1)).toBe(0.3);
    expect(resolverTemperatura(TEMPERATURAS_PADRAO, 'traducao', Number.NaN)).toBe(0.3);
    expect(resolverTemperatura({ ...TEMPERATURAS_PADRAO, qa: Number.NaN }, 'qa')).toBe(0.2);
  });
});

describe('normalizarTemperaturas', () => {
  it('completa as chaves ausentes com o padrão de cada papel', () => {
    expect(normalizarTemperaturas({ traducao: 0.7 })).toEqual({ ...TEMPERATURAS_PADRAO, traducao: 0.7 });
    expect(normalizarTemperaturas(null)).toEqual(TEMPERATURAS_PADRAO);
    expect(normalizarTemperaturas('lixo')).toEqual(TEMPERATURAS_PADRAO);
  });

  it('uma chave inválida não derruba as outras', () => {
    expect(normalizarTemperaturas({ traducao: 0.7, qa: 99 })).toEqual({
      ...TEMPERATURAS_PADRAO,
      traducao: 0.7,
    });
  });
});

describe('aceitaTemperatura', () => {
  it('aceita os modelos de tradução usados no aplicativo', () => {
    for (const m of ['claude-sonnet-5', 'gemini-flash-latest', 'deepseek-v4-flash', 'llama-3.3-70b-versatile']) {
      expect(aceitaTemperatura(m)).toBe(true);
    }
  });

  it('recusa famílias de raciocínio que fixam a amostragem', () => {
    for (const m of ['openai/o3', 'openai/gpt-5', 'deepseek-reasoner', 'qwen/qwen3-next-80b-thinking']) {
      expect(aceitaTemperatura(m)).toBe(false);
    }
  });

  it('temperaturaDoPedido apara na faixa do provedor e omite quando não há valor', () => {
    // A Anthropic vai só até 1: um 1.6 vindo da configuração é aparado, não enviado cru.
    expect(temperaturaDoPedido({ modelo: 'claude-sonnet-5', temperatura: 1.6 }, 1)).toBe(1);
    expect(temperaturaDoPedido({ modelo: 'gemini-flash-latest', temperatura: 1.6 }, 2)).toBe(1.6);
    expect(temperaturaDoPedido({ modelo: 'gemini-flash-latest' }, 2)).toBeUndefined();
    expect(temperaturaDoPedido({ modelo: 'openai/o3', temperatura: 0.3 }, 2)).toBeUndefined();
  });

  it('reconhece o 400 que fala de temperature', () => {
    expect(ehErroDeTemperatura("Unsupported value: 'temperature' does not support 0.3")).toBe(true);
    expect(ehErroDeTemperatura('Requisição rejeitada: modelo desconhecido')).toBe(false);
  });
});

// ── Provedor compat (DeepSeek/OpenRouter/Groq/Mistral) ─────────────────────
// Fetch trocado por um espião: verifica o corpo enviado sem tocar na rede.

describe('provedor compatível com OpenAI', () => {
  const RESPOSTA_OK = {
    choices: [{ message: { content: '{"traducoes":[{"ordem":0,"texto_pt":"Olá."}],"termos_novos":[]}' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
  const requisicao = (modelo: string, temperatura?: number) => ({
    modelo,
    temperatura,
    promptMae: 'Regras.',
    glossario: [],
    caudaAnterior: [],
    frases: [{ ordem: 0, texto_zh: '你好。' }],
    proximas: [],
  });
  const provedor = criarProvedorCompat({
    id: 'deepseek',
    nome: 'DeepSeek',
    baseUrl: 'https://exemplo.invalido',
    modeloPadrao: 'deepseek-v4-flash',
  });
  const corposEnviados: any[] = [];

  function responderCom(...respostas: { status: number; corpo: unknown }[]) {
    let i = 0;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      corposEnviados.push(JSON.parse(String(init.body)));
      const r = respostas[Math.min(i++, respostas.length - 1)];
      return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    });
  }

  beforeEach(() => {
    corposEnviados.length = 0;
    vi.unstubAllGlobals();
  });

  it('manda a temperatura resolvida no corpo da chamada', async () => {
    responderCom({ status: 200, corpo: RESPOSTA_OK });
    await provedor.traduzirBloco('chave', requisicao('deepseek-v4-flash', 0.3));
    expect(corposEnviados[0].temperature).toBe(0.3);
  });

  it('sem temperatura definida, não manda o parâmetro (padrão do modelo)', async () => {
    responderCom({ status: 200, corpo: RESPOSTA_OK });
    await provedor.traduzirBloco('chave', requisicao('deepseek-v4-flash'));
    expect(corposEnviados[0]).not.toHaveProperty('temperature');
  });

  it('modelo de raciocínio conhecido: nem tenta mandar', async () => {
    responderCom({ status: 200, corpo: RESPOSTA_OK });
    await provedor.traduzirBloco('chave', requisicao('deepseek-reasoner', 0.3));
    expect(corposEnviados).toHaveLength(1);
    expect(corposEnviados[0]).not.toHaveProperty('temperature');
  });

  it('400 falando de temperature: repete a chamada sem o parâmetro em vez de falhar', async () => {
    responderCom(
      { status: 400, corpo: { error: { message: "Unsupported value: 'temperature' is not supported with this model." } } },
      { status: 200, corpo: RESPOSTA_OK },
    );
    const resposta = await provedor.traduzirBloco('chave', requisicao('modelo-novo-desconhecido', 0.3));
    expect(resposta.traducoes[0].texto_pt).toBe('Olá.');
    expect(corposEnviados).toHaveLength(2);
    expect(corposEnviados[0].temperature).toBe(0.3);
    expect(corposEnviados[1]).not.toHaveProperty('temperature');
  });

  it('400 por outro motivo continua sendo erro fatal — a queda é só da temperatura', async () => {
    responderCom({ status: 400, corpo: { error: { message: 'Model not found' } } });
    await expect(provedor.traduzirBloco('chave', requisicao('inexistente', 0.3))).rejects.toThrow(/Model not found/);
    expect(corposEnviados).toHaveLength(1);
  });
});

// ── Configuração e obra ────────────────────────────────────────────────────

describe('persistência', () => {
  let db: BancoDados;

  beforeEach(() => {
    db = abrirBanco(':memory:');
  });

  it('banco novo já vem com os padrões por papel', () => {
    expect(reposConfig.obterTodas(db).temperaturas).toEqual(CONFIG_PADRAO.temperaturas);
  });

  it('guarda e relê a tabela de temperaturas', () => {
    reposConfig.definir(db, { temperaturas: { ...TEMPERATURAS_PADRAO, traducao: 0.1 } });
    expect(reposConfig.obterTodas(db).temperaturas.traducao).toBe(0.1);
    expect(reposConfig.obterTodas(db).temperaturas.qa).toBe(TEMPERATURAS_PADRAO.qa);
  });

  it('obra nasce sem override e aceita um depois; valor fora da faixa é descartado', () => {
    const obra = reposObras.criar(db, { titulo: 'O' });
    expect(obra.temperatura).toBeNull();
    expect(reposObras.atualizar(db, obra.id, { temperatura: 0.15 })?.temperatura).toBe(0.15);
    expect(reposObras.atualizar(db, obra.id, { temperatura: 42 })?.temperatura).toBeNull();
    expect(reposObras.atualizar(db, obra.id, { temperatura: null })?.temperatura).toBeNull();
  });

  it('mexer no provedor da obra não apaga o override de temperatura', () => {
    const obra = reposObras.criar(db, { titulo: 'O' });
    reposObras.atualizar(db, obra.id, { temperatura: 0.15 });
    expect(reposObras.atualizar(db, obra.id, { provedor_padrao: 'mock' })?.temperatura).toBe(0.15);
  });
});
