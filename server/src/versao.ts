import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Que código está rodando nesta máquina.
//
// O VPS NÃO tem git: o `.git` é excluído do rsync de propósito, então não há como
// perguntar à máquina qual commit é este. O `subir.mjs` resolve isso gravando um
// VERSAO.json na raiz do payload no momento do envio, e este módulo o lê.
//
// Antes disto, `/saude` respondia a string literal '0.1.0' — que nunca mudou
// desde o primeiro dia e portanto não respondia nada. Um número que não muda é
// pior que nenhum número, porque parece resposta.

export interface Versao {
  /** Hash curto do commit publicado. `null` em desenvolvimento. */
  commit: string | null;
  /** ISO do momento do deploy. `null` em desenvolvimento. */
  publicado_em: string | null;
  /** Assunto do commit, para a tela não mostrar só um hash. */
  assunto: string | null;
}

const SEM_CARIMBO: Versao = { commit: null, publicado_em: null, assunto: null };

/** Raiz do repositório/instalação: este arquivo mora em `server/src/`. */
function raiz(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/**
 * Lê o carimbo, ou devolve tudo `null` quando não há.
 *
 * Ausência é o caso NORMAL em desenvolvimento, não erro — daí não lançar. E o
 * `null` é deliberado: a tela precisa poder dizer "não sei", em vez de exibir um
 * carimbo inventado que o revisor leria como se fosse do deploy.
 *
 * Também não lança em JSON corrompido: um arquivo de carimbo malformado não pode
 * derrubar a rota que serve para conferir se o app está de pé.
 */
export function lerVersao(base = raiz()): Versao {
  const caminho = path.join(base, 'VERSAO.json');
  try {
    const bruto = JSON.parse(fs.readFileSync(caminho, 'utf8')) as Partial<Versao>;
    const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null);
    return {
      commit: texto(bruto.commit),
      publicado_em: texto(bruto.publicado_em),
      assunto: texto(bruto.assunto),
    };
  } catch {
    return SEM_CARIMBO;
  }
}
