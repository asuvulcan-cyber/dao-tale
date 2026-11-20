import { describe, expect, it } from 'vitest';
import { ErroProvedor } from './provedor.js';
import { CONTRATO_TRADUCAO } from './contratos.js';
import { ambienteClaudeCode, argumentosClaudeCode, interpretarSaida } from './claudeCode.js';

// Motor pela assinatura: o que estes testes protegem é que o processo filho
// nunca caia na API paga (sem ANTHROPIC_API_KEY, conta certa) e que a saída do
// CLI vire o mesmo contrato e os mesmos tipos de erro dos outros provedores —
// é deles que o job depende para decidir entre repetir, esperar e desistir.

function saida(campos: Record<string, unknown>): string {
  return JSON.stringify({ type: 'result', subtype: 'success', is_error: false, ...campos });
}

function erroDe(texto: string): ErroProvedor {
  try {
    interpretarSaida(texto);
  } catch (e) {
    if (e instanceof ErroProvedor) return e;
    throw e;
  }
  throw new Error('esperava ErroProvedor');
}

describe('argumentosClaudeCode', () => {
  const base = { modelo: 'sonnet', arquivoSistema: '/tmp/x/sistema.txt', contrato: CONTRATO_TRADUCAO };

  it('troca o prompt do Claude Code pelo do app, sem ferramentas e com o schema do contrato', () => {
    const args = argumentosClaudeCode(base);
    expect(args).toContain('-p');
    expect(args[args.indexOf('--system-prompt-file') + 1]).toBe('/tmp/x/sistema.txt');
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(JSON.parse(args[args.indexOf('--json-schema') + 1])).toEqual(CONTRATO_TRADUCAO.schema);
    expect(args[args.indexOf('--model') + 1]).toBe('sonnet');
  });

  it('thinking vira esforço; ausente não manda nada', () => {
    expect(argumentosClaudeCode(base)).not.toContain('--effort');
    const ligado = argumentosClaudeCode({ ...base, thinking: 'ligado' });
    expect(ligado[ligado.indexOf('--effort') + 1]).toBe('high');
    const desligado = argumentosClaudeCode({ ...base, thinking: 'desligado' });
    expect(desligado[desligado.indexOf('--effort') + 1]).toBe('low');
  });
});

describe('ambienteClaudeCode', () => {
  it('tira as chaves de API, para a chamada ir pela assinatura', () => {
    const env = ambienteClaudeCode({ ANTHROPIC_API_KEY: 'sk-x', ANTHROPIC_AUTH_TOKEN: 't', PATH: '/bin' }, null);
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.PATH).toBe('/bin');
  });

  it('aponta a conta do motor quando há uma; sem ela, deixa o padrão do Claude Code', () => {
    expect(ambienteClaudeCode({}, '/home/u/.claude-conta2').CLAUDE_CONFIG_DIR).toBe('/home/u/.claude-conta2');
    expect(ambienteClaudeCode({}, null).CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  it('não altera o ambiente do servidor', () => {
    const base = { ANTHROPIC_API_KEY: 'sk-x' };
    ambienteClaudeCode(base, null);
    expect(base.ANTHROPIC_API_KEY).toBe('sk-x');
  });
});

describe('interpretarSaida', () => {
  it('devolve o structured_output e o uso, com o modelo da conversa principal', () => {
    // Números de uma tradução real: a chamada interna do Haiku escreveu MAIS
    // que o Sonnet que traduziu — "o que mais escreveu" apontaria o errado.
    const r = interpretarSaida(
      saida({
        structured_output: { traducoes: [], termos_novos: [] },
        usage: {
          input_tokens: 2,
          output_tokens: 196,
          cache_read_input_tokens: 20997,
          cache_creation_input_tokens: 719,
        },
        modelUsage: {
          'claude-haiku-5-5': { inputTokens: 1228, outputTokens: 343 },
          'claude-sonnet-5-5': { inputTokens: 2, outputTokens: 196 },
        },
      }),
    );
    expect(r.bruto).toEqual({ traducoes: [], termos_novos: [] });
    expect(r.uso).toEqual({
      tokens_entrada: 2,
      tokens_saida: 196,
      tokens_cache_leitura: 20997,
      tokens_cache_criacao: 719,
      modelo_resolvido: 'claude-sonnet-5-5',
    });
  });

  it('sem linha que bata com o uso principal, o modelo fica desconhecido', () => {
    const r = interpretarSaida(saida({ structured_output: {}, usage: { input_tokens: 5, output_tokens: 9 } }));
    expect(r.uso.modelo_resolvido).toBeNull();
  });

  it('429 é limite (o job espera), não erro transitório comum', () => {
    expect(erroDe(saida({ is_error: true, api_error_status: 429, result: 'rate limited' })).tipo).toBe('limite');
  });

  it('sem login é fatal — repetir não resolve', () => {
    expect(erroDe(saida({ is_error: true, api_error_status: 401 })).tipo).toBe('fatal');
  });

  it('resposta cortada é truncado, para o job dividir o bloco', () => {
    expect(erroDe(saida({ stop_reason: 'max_tokens', structured_output: {} })).tipo).toBe('truncado');
  });

  it('sem structured_output ou com saída que não é JSON: transitório', () => {
    expect(erroDe(saida({ result: 'texto solto' })).tipo).toBe('transitorio');
    expect(erroDe('Error: algo quebrou').tipo).toBe('transitorio');
  });
});
