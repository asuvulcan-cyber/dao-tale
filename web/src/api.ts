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

/** Texto para mostrar ao usuário a partir de um erro de mutação. Erro da API vem
 *  com a mensagem do servidor (a de validação já nomeia o campo recusado);
 *  qualquer outra coisa vira um texto genérico em vez de sumir da tela. */
export function mensagemDeErro(e: unknown): string {
  if (e instanceof ErroApi) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'erro inesperado';
}

/** Modo hospedado (doc 13 §3): a sessão venceu (ou o serviço reiniciou com
    senha nova) enquanto a aba estava aberta. Quem escuta é o PortaoSessao, que
    troca o app pela tela de login sem perder a rota atual. */
export const EVENTO_SESSAO_EXPIRADA = 'dao-tale:sessao-expirada';

export async function api<T>(metodo: string, rota: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(`/api${rota}`, {
    method: metodo,
    headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : null;
  if (!resposta.ok) {
    if (resposta.status === 401 && dados?.erro?.codigo === 'nao-autenticado') {
      window.dispatchEvent(new CustomEvent(EVENTO_SESSAO_EXPIRADA));
    }
    throw new ErroApi(
      dados?.erro?.mensagem ?? `Erro ${resposta.status}`,
      resposta.status,
      dados?.erro?.codigo,
    );
  }
  return dados as T;
}
