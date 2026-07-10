// Cliente HTTP tipado da API local.

export class ErroApi extends Error {
  constructor(
    mensagem: string,
    public readonly status: number,
    public readonly codigo?: string,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

export async function api<T>(metodo: string, rota: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(`/api${rota}`, {
    method: metodo,
    headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) {
    throw new ErroApi(
      dados?.erro?.mensagem ?? `Erro ${resposta.status}`,
      resposta.status,
      dados?.erro?.codigo,
    );
  }
  return dados as T;
}
