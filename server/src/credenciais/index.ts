import fs from 'node:fs';
import path from 'node:path';
import { diretorioDados } from '../config.js';

// Guarda de chaves de API (doc 05 §6):
// 1) preferencial: keyring do SO via @napi-rs/keyring (Credential Manager / Secret Service);
// 2) fallback: arquivo credenciais.json com permissão 0600 no diretório de dados.
// A chave nunca é devolvida por nenhum endpoint — só usada na construção do cliente do SDK.

const SERVICO = 'dao-tale';

type ModoGuarda = 'keyring' | 'arquivo';

interface EntryLike {
  getPassword(): string | null;
  setPassword(senha: string): void;
  deletePassword(): boolean;
}

let EntryCtor: (new (servico: string, usuario: string) => EntryLike) | null | undefined;

async function carregarKeyring(): Promise<typeof EntryCtor> {
  if (EntryCtor !== undefined) return EntryCtor;
  try {
    const mod = await import('@napi-rs/keyring');
    // Valida que o keyring do sistema realmente funciona (em Linux sem Secret
    // Service o módulo carrega mas as operações falham).
    const sonda = new mod.Entry(SERVICO, '__sonda__');
    sonda.setPassword('ok');
    sonda.deletePassword();
    EntryCtor = mod.Entry as unknown as typeof EntryCtor;
  } catch {
    EntryCtor = null;
  }
  return EntryCtor;
}

function caminhoArquivo(): string {
  return path.join(diretorioDados(), 'credenciais.json');
}

function lerArquivo(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(caminhoArquivo(), 'utf-8'));
  } catch {
    return {};
  }
}

function gravarArquivo(dados: Record<string, string>): void {
  fs.writeFileSync(caminhoArquivo(), JSON.stringify(dados, null, 2), { mode: 0o600 });
}

export async function modoGuarda(): Promise<ModoGuarda> {
  return (await carregarKeyring()) ? 'keyring' : 'arquivo';
}

export async function obterChave(provedor: string): Promise<string | null> {
  const Entry = await carregarKeyring();
  if (Entry) {
    try {
      return new Entry(SERVICO, provedor).getPassword();
    } catch {
      return null;
    }
  }
  return lerArquivo()[provedor] ?? null;
}

export async function definirChave(provedor: string, chave: string): Promise<void> {
  const Entry = await carregarKeyring();
  if (Entry) {
    new Entry(SERVICO, provedor).setPassword(chave);
    return;
  }
  const dados = lerArquivo();
  dados[provedor] = chave;
  gravarArquivo(dados);
}

export async function removerChave(provedor: string): Promise<void> {
  const Entry = await carregarKeyring();
  if (Entry) {
    try {
      new Entry(SERVICO, provedor).deletePassword();
    } catch {
      /* já não existia */
    }
    return;
  }
  const dados = lerArquivo();
  delete dados[provedor];
  gravarArquivo(dados);
}

export async function temChave(provedor: string): Promise<boolean> {
  return (await obterChave(provedor)) !== null;
}
