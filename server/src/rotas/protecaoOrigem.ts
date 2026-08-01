import type { MiddlewareHandler } from 'hono';
import { ehHospedado, hostsPublicos } from '../config.js';

// Proteção de origem da API (doc 10 §3 → reconciliada no doc 13 §1).
//
// MODO LOCAL (padrão, comportamento de sempre): o bind em 127.0.0.1 impede
// acesso pela rede, mas NÃO impede uma aba maliciosa no navegador do usuário de
// disparar fetch/form contra http://127.0.0.1:8317 (CSRF), nem DNS rebinding.
// Duas travas baratas, por hostname loopback (não por porta — assim os testes,
// que usam Host "localhost" sem porta, seguem passando):
//
//  1. Host loopback em TODA rota /api → barra DNS rebinding (o atacante põe o
//     domínio dele no Host). Usamos o hostname da URL, que o @hono/node-server
//     monta a partir do header Host — sempre presente, igual ao que o browser
//     mandou.
//  2. Origin loopback nos métodos MUTANTES → barra o CSRF clássico: um site
//     qualquer tem Origin público (https://site) e é rejeitado; o app servido
//     por si mesmo e o proxy do Vite mandam Origin loopback e passam. Requisição
//     sem Origin (curl, script local) passa — não é a ameaça (o alvo é a aba).
//
// MODO HOSPEDADO: o endereço deixa de ser prova de qualquer coisa — quem
// autentica é a sessão (`exigirSessao`). Aqui o middleware vira allowlist:
//
//  1. Host precisa ser um domínio de DAO_TALE_HOST_PUBLICO (ou loopback, para
//     health check e CLI rodando na própria máquina). Host desconhecido que
//     chegue ao proxy continua morrendo com 403.
//  2. Origin nos métodos mutantes passa a ser OBRIGATÓRIO, e na allowlist. Na
//     internet não existe "curl local confiável"; o navegador sempre manda
//     Origin em POST, então exigir não custa nada e fecha o CSRF junto com o
//     SameSite=Lax do cookie.

function ehLoopback(hostname: string): boolean {
  // URL.hostname devolve IPv6 entre colchetes: [::1].
  const limpo = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  return limpo === '127.0.0.1' || limpo === 'localhost' || limpo === '::1';
}

function hostnameDeOrigin(origin: string): string | null {
  try {
    return new URL(origin).hostname;
  } catch {
    return null; // Origin opaco ("null") ou malformado → tratado como não permitido
  }
}

function permitido(hostname: string): boolean {
  if (ehLoopback(hostname)) return true;
  if (!ehHospedado()) return false;
  return hostsPublicos().includes(hostname.toLowerCase());
}

const MUTANTES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function protecaoOrigem(): MiddlewareHandler {
  return async (c, next) => {
    const host = new URL(c.req.url).hostname;
    if (!permitido(host)) {
      return c.json({ erro: { codigo: 'origem-bloqueada', mensagem: `Host não permitido: ${host}` } }, 403);
    }

    if (MUTANTES.has(c.req.method)) {
      const origin = c.req.header('origin');
      if (!origin && ehHospedado()) {
        return c.json({ erro: { codigo: 'origem-bloqueada', mensagem: 'Requisição sem Origin foi bloqueada.' } }, 403);
      }
      if (origin) {
        const oh = hostnameDeOrigin(origin);
        if (!oh || !permitido(oh)) {
          return c.json(
            { erro: { codigo: 'origem-bloqueada', mensagem: 'Requisição de outra origem foi bloqueada.' } },
            403,
          );
        }
      }
    }

    await next();
  };
}
