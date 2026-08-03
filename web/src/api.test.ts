import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ErroApi, mensagemDeErro } from './api';

// Este é o caminho que uma falha de validação percorre até a tela:
//   servidor 400 → api() lança ErroApi → onError → mensagemDeErro → <Aviso>.
// O bug do tamanho_bloco sumia justamente aqui: sem onError, o ErroApi era
// engolido pelo react-query e o botão "Salvar padrões" não dizia nada.

function responderCom(status: number, corpo: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(corpo), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('erro da API até a tela', () => {
  it('vira mensagem visível nomeando o campo recusado', async () => {
    responderCom(400, {
      erro: { codigo: 'payload-invalido', mensagem: 'tamanho_bloco: Number must be less than or equal to 120' },
    });

    // Exatamente o que a mutação de salvar faz: chama, falha, e o onError
    // transforma o erro no texto do aviso.
    const erro = await api('PUT', '/configuracoes', { tamanho_bloco: 400 }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroApi);
    expect((erro as ErroApi).status).toBe(400);
    expect((erro as ErroApi).codigo).toBe('payload-invalido');

    const texto = mensagemDeErro(erro);
    expect(texto).toContain('tamanho_bloco');
    expect(texto).toContain('120');
  });

  it('não deixa falha de rede virar tela muda', () => {
    expect(mensagemDeErro(new TypeError('Failed to fetch'))).toBe('Failed to fetch');
    expect(mensagemDeErro(undefined)).toBe('erro inesperado');
    expect(mensagemDeErro(new Error(''))).toBe('erro inesperado');
  });

  it('deixa passar o que deu certo', async () => {
    responderCom(200, { tamanho_bloco: 120 });
    await expect(api('PUT', '/configuracoes', { tamanho_bloco: 120 })).resolves.toEqual({ tamanho_bloco: 120 });
  });
});
