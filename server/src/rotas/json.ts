import type { Context } from 'hono';

/** Erro reconhecido pelo handler global como falha do cliente, não do servidor. */
export class ErroPayloadInvalido extends Error {
  constructor() {
    super('O corpo da requisição não contém JSON válido.');
    this.name = 'ErroPayloadInvalido';
  }
}

/**
 * Centraliza a leitura do corpo JSON. O parser do Hono lança SyntaxError para
 * JSON malformado; sem esta fronteira, esse erro acabava reportado como 500.
 */
export async function lerJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new ErroPayloadInvalido();
  }
}
