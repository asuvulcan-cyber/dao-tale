import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { diretorioDados } from '../config.js';

// Senha do único usuário (doc 13 §3). Zero dependência nova: `node:crypto` já
// traz scrypt, que é KDF de memória dura — o que se quer contra quem levar o
// arquivo embora. A senha em texto nunca é escrita em disco nem em log.
//
// `geracao` é o mecanismo de revogação das sessões stateless: trocar a senha
// incrementa o contador e todo token emitido antes deixa de valer.

export interface RegistroSenha {
  algoritmo: 'scrypt';
  n: number;
  r: number;
  p: number;
  sal: string;
  hash: string;
  geracao: number;
  definida_em: string;
}

const PARAMS = { n: 32768, r: 8, p: 1 } as const;
const TAMANHO_HASH = 32;
// scrypt usa 128 · N · r bytes (32 MiB nestes parâmetros); o teto padrão do Node
// é exatamente 32 MiB e estoura por um fio.
const MAXMEM = 128 * 1024 * 1024;

export const TAMANHO_MINIMO_SENHA = 12;

export function caminhoAuth(dir: string = diretorioDados()): string {
  return path.join(dir, 'auth.json');
}

function derivar(senha: string, sal: Buffer, n: number, r: number, p: number): Buffer {
  // NFKC: a mesma senha digitada no celular e no desktop pode chegar com
  // composição Unicode diferente (acentos) — normalizar evita "senha incorreta"
  // inexplicável.
  return crypto.scryptSync(senha.normalize('NFKC'), sal, TAMANHO_HASH, { N: n, r, p, maxmem: MAXMEM });
}

export function lerRegistro(arquivo: string = caminhoAuth()): RegistroSenha | null {
  try {
    const dados = JSON.parse(fs.readFileSync(arquivo, 'utf-8'));
    if (
      dados?.algoritmo === 'scrypt' &&
      typeof dados.sal === 'string' &&
      typeof dados.hash === 'string' &&
      typeof dados.geracao === 'number'
    ) {
      return dados as RegistroSenha;
    }
  } catch {
    /* ausente ou corrompido → sem senha definida */
  }
  return null;
}

export function senhaDefinida(arquivo: string = caminhoAuth()): boolean {
  return lerRegistro(arquivo) !== null;
}

/** Geração vigente; 0 quando não há senha definida (nenhum token pode valer). */
export function geracaoAtual(arquivo: string = caminhoAuth()): number {
  return lerRegistro(arquivo)?.geracao ?? 0;
}

export class ErroSenhaFraca extends Error {}

/** Define (ou troca) a senha. Incrementa a geração — todas as sessões abertas
 *  caem junto, que é o comportamento desejado ao trocar senha. */
export function definirSenha(senha: string, arquivo: string = caminhoAuth()): RegistroSenha {
  if (senha.normalize('NFKC').length < TAMANHO_MINIMO_SENHA) {
    throw new ErroSenhaFraca(`A senha precisa de pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`);
  }
  const anterior = lerRegistro(arquivo);
  const sal = crypto.randomBytes(16);
  const registro: RegistroSenha = {
    algoritmo: 'scrypt',
    ...PARAMS,
    sal: sal.toString('base64'),
    hash: derivar(senha, sal, PARAMS.n, PARAMS.r, PARAMS.p).toString('base64'),
    geracao: (anterior?.geracao ?? 0) + 1,
    definida_em: new Date().toISOString(),
  };
  fs.writeFileSync(arquivo, JSON.stringify(registro, null, 2), { mode: 0o600 });
  // writeFileSync só aplica o modo ao CRIAR o arquivo; numa troca de senha o
  // arquivo já existe e manteria a permissão antiga.
  fs.chmodSync(arquivo, 0o600);
  return registro;
}

export function verificarSenha(senha: string, registro: RegistroSenha): boolean {
  const esperado = Buffer.from(registro.hash, 'base64');
  let obtido: Buffer;
  try {
    obtido = derivar(senha, Buffer.from(registro.sal, 'base64'), registro.n, registro.r, registro.p);
  } catch {
    return false;
  }
  if (obtido.length !== esperado.length) return false;
  return crypto.timingSafeEqual(obtido, esperado);
}
