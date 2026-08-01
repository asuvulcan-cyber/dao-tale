// Freio do login (doc 13 §3). O que se defende aqui é a cota de API: quem
// adivinhar a senha gasta o meu dinheiro. Três camadas baratas, em memória
// (reiniciar o serviço zera, e tudo bem — o atacante não controla isso):
//
//  1. atraso progressivo antes de responder erro — mata a taxa de chute;
//  2. teto por IP dentro de uma janela → 429 até a janela passar;
//  3. teto global → cobre chute distribuído. Incomoda só a mim, por 15 min;
//     é preferível a alguém varrendo senhas de mil endereços.

export interface OpcoesLimite {
  janelaMs?: number;
  maxPorIp?: number;
  maxGlobal?: number;
  atrasoPorFalhaMs?: number;
  atrasoMaxMs?: number;
}

export interface Veredito {
  permitido: boolean;
  /** Segundos até liberar (só quando bloqueado) — vira header `Retry-After`. */
  esperar_s: number;
  motivo?: 'ip' | 'global';
}

export interface Limitador {
  checar(ip: string, agora?: number): Veredito;
  /** Atraso a aplicar ANTES de responder uma tentativa (0 na primeira). */
  atrasoMs(ip: string, agora?: number): number;
  registrarFalha(ip: string, agora?: number): void;
  registrarSucesso(ip: string): void;
}

export function criarLimitador(opcoes: OpcoesLimite = {}): Limitador {
  const janelaMs = opcoes.janelaMs ?? 15 * 60 * 1000;
  const maxPorIp = opcoes.maxPorIp ?? 5;
  const maxGlobal = opcoes.maxGlobal ?? 30;
  const atrasoPorFalhaMs = opcoes.atrasoPorFalhaMs ?? 250;
  const atrasoMaxMs = opcoes.atrasoMaxMs ?? 3000;

  const porIp = new Map<string, number[]>();
  let global: number[] = [];

  const recentes = (lista: number[], agora: number): number[] => lista.filter((t) => agora - t < janelaMs);

  function podar(agora: number): void {
    global = recentes(global, agora);
    for (const [ip, falhas] of porIp) {
      const vivas = recentes(falhas, agora);
      if (vivas.length === 0) porIp.delete(ip);
      else porIp.set(ip, vivas);
    }
  }

  return {
    checar(ip, agora = Date.now()) {
      podar(agora);
      const falhasIp = porIp.get(ip) ?? [];
      if (falhasIp.length >= maxPorIp) {
        return { permitido: false, esperar_s: esperaAte(falhasIp[0], agora, janelaMs), motivo: 'ip' };
      }
      if (global.length >= maxGlobal) {
        return { permitido: false, esperar_s: esperaAte(global[0], agora, janelaMs), motivo: 'global' };
      }
      return { permitido: true, esperar_s: 0 };
    },

    atrasoMs(ip, agora = Date.now()) {
      podar(agora);
      return Math.min((porIp.get(ip)?.length ?? 0) * atrasoPorFalhaMs, atrasoMaxMs);
    },

    registrarFalha(ip, agora = Date.now()) {
      podar(agora);
      porIp.set(ip, [...(porIp.get(ip) ?? []), agora]);
      global.push(agora);
    },

    registrarSucesso(ip) {
      porIp.delete(ip);
    },
  };
}

function esperaAte(maisAntiga: number, agora: number, janelaMs: number): number {
  return Math.max(1, Math.ceil((maisAntiga + janelaMs - agora) / 1000));
}
