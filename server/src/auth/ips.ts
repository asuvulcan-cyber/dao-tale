import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { diretorioDados } from '../config.js';

// Lista de IPs que podem CHEGAR na bancada (doc 14 §7). A vitrine pública não
// passa por aqui — ela continua aberta a todo mundo.
//
// Isto não substitui a senha; empilha com ela. A senha responde "quem é você";
// a lista responde "de onde você pode nem tentar". Quem está fora não recebe
// mensagem nenhuma: 404 seco, e a interface nem desenha o botão de entrar.
//
// DUAS DECISÕES QUE EXISTEM PARA VOCÊ NÃO SE TRANCAR DO LADO DE FORA:
//
//  1. Lista VAZIA = trava desligada, todo mundo pode tentar a senha. É o padrão,
//     e é o que acontece numa atualização de versão: ninguém acorda trancado
//     porque instalou o app novo.
//  2. Loopback sempre passa. Quem está DENTRO da máquina (você, por SSH) nunca
//     é barrado — é por ali que se conserta uma lista errada, com `npm run ips`.
//
// O arquivo é lido a cada requisição, com cache pelo mtime: editar a lista vale
// na hora, sem reiniciar o serviço.

export interface RegistroIps {
  ips: string[];
}

export function caminhoIps(dir: string = diretorioDados()): string {
  return path.join(dir, 'ips-permitidos.json');
}

let cache: { arquivo: string; mtimeMs: number; ips: string[] } | null = null;

/** A lista como está no disco. Lista vazia = trava desligada. */
export function listaIps(arquivo: string = caminhoIps()): string[] {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(arquivo).mtimeMs;
  } catch {
    cache = null;
    return [];
  }
  if (cache && cache.arquivo === arquivo && cache.mtimeMs === mtimeMs) return cache.ips;

  let ips: string[] = [];
  try {
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf-8')) as RegistroIps;
    if (Array.isArray(dados?.ips)) {
      // Entrada inválida é DESCARTADA, não derruba a lista: um typo numa linha
      // não pode virar "lista vazia" — que é o mesmo que trava desligada.
      ips = dados.ips.filter((e) => typeof e === 'string' && entradaValida(e));
    }
  } catch {
    /* ausente ou corrompido → trava desligada, e o app sobe */
  }
  cache = { arquivo, mtimeMs, ips };
  return ips;
}

export function gravarIps(ips: string[], arquivo: string = caminhoIps()): void {
  const limpos = [...new Set(ips.map((e) => e.trim()).filter(entradaValida))];
  fs.writeFileSync(arquivo, JSON.stringify({ ips: limpos }, null, 2), { mode: 0o600 });
  fs.chmodSync(arquivo, 0o600);
  cache = null;
}

/** Trava ligada? Só para a interface saber se o botão de entrar faz sentido. */
export function travaDeIpLigada(arquivo: string = caminhoIps()): boolean {
  return listaIps(arquivo).length > 0;
}

export function ipPermitido(ip: string, arquivo: string = caminhoIps()): boolean {
  const lista = listaIps(arquivo);
  if (lista.length === 0) return true; // trava desligada
  const alvo = paraBytes(ip);
  if (!alvo) return false;
  if (ehLoopback(alvo)) return true; // a saída de emergência
  return lista.some((entrada) => casa(alvo, entrada));
}

// ── Comparação ─────────────────────────────────────────────────────────────

export function entradaValida(entrada: string): boolean {
  const { endereco, prefixo } = partir(entrada);
  const bytes = paraBytes(endereco);
  if (!bytes) return false;
  if (prefixo === null) return true;
  return Number.isInteger(prefixo) && prefixo >= 0 && prefixo <= bytes.length * 8;
}

function partir(entrada: string): { endereco: string; prefixo: number | null } {
  const barra = entrada.lastIndexOf('/');
  if (barra < 0) return { endereco: entrada.trim(), prefixo: null };
  // Só dígitos: `Number('')` é 0 e `Number(' 8 ')` é 8, então uma barra solta
  // ("::/") viraria prefixo /0 — que é "o mundo inteiro entra". Prefixo mal
  // escrito tem de ser recusado, nunca interpretado com boa vontade.
  const texto = entrada.slice(barra + 1);
  return { endereco: entrada.slice(0, barra).trim(), prefixo: /^\d+$/.test(texto) ? Number(texto) : NaN };
}

function casa(alvo: Buffer, entrada: string): boolean {
  const { endereco, prefixo } = partir(entrada);
  const base = paraBytes(endereco);
  if (!base || base.length !== alvo.length) return false;

  const bits = prefixo === null ? base.length * 8 : prefixo;
  if (!Number.isInteger(bits) || bits < 0 || bits > base.length * 8) return false;

  const inteiros = Math.floor(bits / 8);
  for (let i = 0; i < inteiros; i++) {
    if (base[i] !== alvo[i]) return false;
  }
  const sobra = bits % 8;
  if (sobra === 0) return true;
  const mascara = 0xff << (8 - sobra);
  return (base[inteiros] & mascara) === (alvo[inteiros] & mascara);
}

/** Endereço em bytes: 4 para IPv4, 16 para IPv6. Um IPv4 escrito em forma
 *  mapeada (::ffff:1.2.3.4) volta como os 4 bytes do IPv4 — senão o mesmo
 *  aparelho não casaria consigo mesmo dependendo do caminho da conexão. */
export function paraBytes(bruto: string): Buffer | null {
  let ip = bruto.trim();
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  // Escopo de interface do IPv6 (fe80::1%eth0) não participa da comparação.
  const porcento = ip.indexOf('%');
  if (porcento >= 0) ip = ip.slice(0, porcento);

  const versao = net.isIP(ip);
  if (versao === 4) return bytesV4(ip);
  if (versao !== 6) return null;

  const bytes = bytesV6(ip);
  if (!bytes) return null;
  // ::ffff:a.b.c.d → trata como IPv4.
  const mapeado = bytes.subarray(0, 12).every((b, i) => (i < 10 ? b === 0 : b === 0xff));
  return mapeado ? Buffer.from(bytes.subarray(12)) : bytes;
}

function bytesV4(ip: string): Buffer | null {
  const partes = ip.split('.');
  if (partes.length !== 4) return null;
  const bytes = Buffer.alloc(4);
  for (let i = 0; i < 4; i++) {
    const n = Number(partes[i]);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    bytes[i] = n;
  }
  return bytes;
}

function bytesV6(ip: string): Buffer | null {
  // IPv4 no fim (::ffff:1.2.3.4) vira dois grupos hexadecimais.
  const ultimoDoisPontos = ip.lastIndexOf(':');
  const cauda = ip.slice(ultimoDoisPontos + 1);
  if (cauda.includes('.')) {
    const v4 = bytesV4(cauda);
    if (!v4) return null;
    const hex = `${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
    ip = ip.slice(0, ultimoDoisPontos + 1) + hex;
  }

  const [esquerda, direita, demais] = ip.split('::');
  if (demais !== undefined) return null; // mais de um "::" é inválido

  const grupos = (txt: string): number[] | null => {
    if (txt === '') return [];
    const lista: number[] = [];
    for (const g of txt.split(':')) {
      if (g === '' || g.length > 4 || !/^[0-9a-fA-F]+$/.test(g)) return null;
      lista.push(parseInt(g, 16));
    }
    return lista;
  };

  const a = grupos(esquerda ?? '');
  const b = direita === undefined ? [] : grupos(direita);
  if (!a || !b) return null;

  const faltam = 8 - a.length - b.length;
  if (direita === undefined ? faltam !== 0 : faltam < 0) return null;
  const cheio = [...a, ...new Array(direita === undefined ? 0 : faltam).fill(0), ...b];
  if (cheio.length !== 8) return null;

  const bytes = Buffer.alloc(16);
  cheio.forEach((g, i) => {
    bytes[i * 2] = (g >> 8) & 0xff;
    bytes[i * 2 + 1] = g & 0xff;
  });
  return bytes;
}

function ehLoopback(bytes: Buffer): boolean {
  if (bytes.length === 4) return bytes[0] === 127;
  return bytes.subarray(0, 15).every((b) => b === 0) && bytes[15] === 1;
}
