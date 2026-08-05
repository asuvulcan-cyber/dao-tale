import { Hono, type Context, type MiddlewareHandler } from 'hono';
import type { EstadoSessao } from '@dao-tale/shared';
import { ehHospedado, modoOperacao } from '../config.js';
import { geracaoAtual, lerRegistro, senhaDefinida, verificarSenha } from '../auth/senha.js';
import {
  cookieLimpo,
  cookieSessao,
  emitirToken,
  lerCookie,
  RENOVAR_ABAIXO_DE_MS,
  segredoSessao,
  verificarToken,
} from '../auth/sessao.js';
import { criarLimitador, type OpcoesLimite } from '../auth/limite.js';
import { ipCliente } from './travaIp.js';
import { ipPermitido } from '../auth/ips.js';

// Rotas e guarda de sessão (doc 13 §3). Em modo local nada disto entra em ação:
// `exigirSessao` é um passa-direto e o status responde "autenticado", para a
// interface não desenhar tela de login numa máquina que nunca teve senha.

function sessaoValida(c: Context): { ok: boolean; geracao?: number; expira_em?: number } {
  const token = lerCookie(c.req.header('cookie'));
  if (!token) return { ok: false };
  const r = verificarToken(token, geracaoAtual(), segredoSessao());
  return r.ok ? { ok: true, geracao: r.geracao, expira_em: r.expira_em } : { ok: false };
}

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Guarda de TODA a API em modo hospedado — inclusive `/api/saude`, que expõe o
 *  caminho dos dados. As rotas de sessão ficam fora porque são registradas antes
 *  deste middleware. */
export function exigirSessao(): MiddlewareHandler {
  return async (c, next) => {
    if (!ehHospedado()) return next();

    const sessao = sessaoValida(c);
    if (!sessao.ok) {
      return c.json({ erro: { codigo: 'nao-autenticado', mensagem: 'Faça login para continuar.' } }, 401);
    }

    await next();

    // Renovação deslizante: quem usa o app no celular toda semana nunca é
    // deslogado; quem some por um mês precisa entrar de novo.
    if (sessao.expira_em! - Date.now() < RENOVAR_ABAIXO_DE_MS) {
      try {
        c.res.headers.append('set-cookie', cookieSessao(emitirToken(sessao.geracao!, segredoSessao())));
      } catch {
        /* resposta já congelada (download em stream) — renova na próxima */
      }
    }
  };
}

export function rotasSessao(opcoesLimite: OpcoesLimite = {}): Hono {
  const app = new Hono();
  const limitador = criarLimitador(opcoesLimite);

  // Público de propósito: é o que a interface consulta para decidir entre
  // desenhar a tela de login e o app. Não devolve caminho de dados, versão nem
  // qualquer coisa que ajude quem ainda não entrou.
  app.get('/sessao', (c) => {
    const estado: EstadoSessao = {
      modo: modoOperacao(),
      autenticado: ehHospedado() ? sessaoValida(c).ok : true,
      senha_definida: senhaDefinida(),
      pode_entrar: ipPermitido(ipCliente(c)),
    };
    c.header('Cache-Control', 'no-store');
    return c.json(estado);
  });

  app.post('/sessao', async (c) => {
    c.header('Cache-Control', 'no-store');
    if (!ehHospedado()) {
      return c.json({ erro: { codigo: 'sem-autenticacao', mensagem: 'O modo local não usa senha.' } }, 400);
    }

    const ip = ipCliente(c);
    const veredito = limitador.checar(ip);
    if (!veredito.permitido) {
      c.header('Retry-After', String(veredito.esperar_s));
      return c.json(
        {
          erro: {
            codigo: 'muitas-tentativas',
            mensagem: `Muitas tentativas de login. Tente novamente em ${Math.ceil(veredito.esperar_s / 60)} min.`,
          },
        },
        429,
      );
    }

    const corpo = (await c.req.json().catch(() => null)) as { senha?: unknown } | null;
    const senha = typeof corpo?.senha === 'string' ? corpo.senha : '';
    const registro = lerRegistro();
    const ok = registro !== null && senha !== '' && verificarSenha(senha, registro);

    if (!ok) {
      // Atraso ANTES de responder, proporcional às falhas recentes: derruba a
      // taxa de chute sem bloquear ninguém na primeira tentativa errada.
      await esperar(limitador.atrasoMs(ip));
      limitador.registrarFalha(ip);
      // Mensagem única: não dizer se o problema foi senha errada ou senha
      // inexistente.
      return c.json({ erro: { codigo: 'credenciais-invalidas', mensagem: 'Senha incorreta.' } }, 401);
    }

    limitador.registrarSucesso(ip);
    c.header('Set-Cookie', cookieSessao(emitirToken(registro!.geracao, segredoSessao())));
    return c.json({ ok: true });
  });

  app.delete('/sessao', (c) => {
    c.header('Cache-Control', 'no-store');
    c.header('Set-Cookie', cookieLimpo());
    return c.json({ ok: true });
  });

  return app;
}
