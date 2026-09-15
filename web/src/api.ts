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

function tentarLerJson(texto: string): unknown {
  if (!texto) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return undefined;
  }
}

function detalheDeRespostaNaoJson(resposta: Response, texto: string): string {
  const tipo = resposta.headers.get('content-type')?.toLowerCase() ?? '';
  const textoLimpo = texto.trim();

  // Mensagens textuais curtas (por exemplo, as de um proxy) ainda ajudam quem
  // está diagnosticando a falha. HTML costuma ser uma página inteira e pode
  // conter detalhes internos, por isso não vai parar no aviso da interface.
  if (textoLimpo && !tipo.includes('text/html') && !tipo.includes('json') && textoLimpo.length <= 500) {
    return textoLimpo;
  }

  const sufixo = resposta.statusText ? `: ${resposta.statusText}` : '';
  return `Erro ${resposta.status}${sufixo}`;
}

export async function api<T>(metodo: string, rota: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(`/api${rota}`, {
    method: metodo,
    headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resposta.text();
  const dados = tentarLerJson(texto) as
    | { erro?: { codigo?: string; mensagem?: string } }
    | null
    | undefined;
  if (!resposta.ok) {
    if (resposta.status === 401 && dados?.erro?.codigo === 'nao-autenticado') {
      window.dispatchEvent(new CustomEvent(EVENTO_SESSAO_EXPIRADA));
    }
    throw new ErroApi(
      dados?.erro?.mensagem ?? detalheDeRespostaNaoJson(resposta, texto),
      resposta.status,
      dados?.erro?.codigo,
    );
  }

  // Uma resposta 2xx com corpo deveria respeitar o contrato JSON da API. Em
  // vez de deixar escapar um SyntaxError sem status, conservamos o contexto
  // HTTP em um erro que a interface já sabe apresentar.
  if (texto && dados === undefined) {
    throw new ErroApi('A API retornou uma resposta inválida', resposta.status, 'resposta-invalida');
  }
  return dados as T;
}
