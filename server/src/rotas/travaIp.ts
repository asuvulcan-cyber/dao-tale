import type { Context, MiddlewareHandler } from 'hono';
import { ehHospedado } from '../config.js';
import { ipPermitido } from '../auth/ips.js';

// Trava de IP da bancada (doc 14 §7). Empilha com a senha: a senha diz quem
// você é, a lista diz de onde se pode nem tentar.
//
// Resposta a quem está de fora: 404 SECO, sem corpo. Não é 403 e não tem
// mensagem — a pedido, e é a escolha certa: um 403 com texto anuncia que existe
// uma lista, o que só serve para o visitante saber que vale a pena insistir de
// outro lugar. Para quem está fora, a bancada simplesmente não existe.
//
// Fora da trava, de propósito: a vitrine pública e o `GET /api/sessao` — a
// interface precisa dos dois para se desenhar, e nenhum entrega nada privado.

/** IP de quem chamou. Em modo hospedado, `X-Forwarded-For` só é confiável
 *  porque o proxy à frente reescreve o cabeçalho que o cliente manda (medido no
 *  Traefik: forjar o header não engana o freio de login). Em modo local o
 *  cabeçalho é ignorado — aceitá-lo deixaria qualquer aba forjar o próprio IP. */
export function ipCliente(c: Context): string {
  if (ehHospedado()) {
    const encaminhado = c.req.header('x-forwarded-for');
    if (encaminhado) return encaminhado.split(',')[0].trim();
  }
  const socket = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket;
  return socket?.remoteAddress ?? 'desconhecido';
}

export function travaIp(): MiddlewareHandler {
  return async (c, next) => {
    if (!ipPermitido(ipCliente(c))) return c.body(null, 404);
    return next();
  };
}

/** Mesma trava, só no POST — usada na rota de sessão, cujo GET tem de responder
 *  a todo mundo. */
export function travaIpNoLogin(): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === 'POST' && !ipPermitido(ipCliente(c))) return c.body(null, 404);
    return next();
  };
}
