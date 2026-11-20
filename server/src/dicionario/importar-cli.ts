import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import type { Verbete } from '@dao-tale/shared';
import { caminhoDicionario, criarBancoDicionario, gravarFonte, INFO_FONTES } from './banco.js';
import { lerCedict, lerDcp } from './fontes.js';

// `npm run dicionarios` (doc 30): baixa o CC-CEDICT e o DCP e monta o
// dicionarios.db da pasta de dados. Também aceita as fontes já baixadas:
//
//   npm run dicionarios -- --cedict cedict.txt.gz --dcp pasta/groups.by.pinyins
//
// Grava num arquivo ao lado e só no fim renomeia por cima do atual: um download
// que falha no meio não deixa o app com dicionário pela metade, e o servidor
// em execução reabre o arquivo novo sozinho.

const URL_CEDICT = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
const REPO_DCP = 'lercordeiro/dicionario_chines_portugues';
const PASTA_DCP = 'groups.by.pinyins';
// Cliente genérico: o GitHub exige User-Agent, e nada do usuário vai nele.
const CABECALHOS = { 'User-Agent': 'dao-tale-dicionarios' };

function argumento(nome: string): string | null {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function baixar(url: string): Promise<Buffer> {
  const r = await fetch(url, { headers: CABECALHOS });
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

const textoDe = (bruto: Buffer) =>
  (bruto[0] === 0x1f && bruto[1] === 0x8b ? zlib.gunzipSync(bruto) : bruto).toString('utf8');

async function cedict(): Promise<{ verbetes: Verbete[]; versao: string | null }> {
  const local = argumento('cedict');
  console.log(local ? `CC-CEDICT: lendo ${local}` : `CC-CEDICT: baixando de ${URL_CEDICT}`);
  return lerCedict(textoDe(local ? fs.readFileSync(local) : await baixar(URL_CEDICT)));
}

async function dcp(): Promise<{ verbetes: Verbete[]; versao: string | null }> {
  const local = argumento('dcp');
  if (local) {
    console.log(`DCP: lendo ${local}`);
    const arquivos = fs
      .readdirSync(local)
      .filter((f) => f.endsWith('.tex'))
      .sort();
    return { verbetes: arquivos.flatMap((f) => lerDcp(fs.readFileSync(path.join(local, f), 'utf8'))), versao: null };
  }
  console.log(`DCP: baixando de github.com/${REPO_DCP}`);
  const lista = JSON.parse(
    (await baixar(`https://api.github.com/repos/${REPO_DCP}/contents/${PASTA_DCP}`)).toString('utf8'),
  ) as { name: string; download_url: string | null }[];
  const commits = JSON.parse(
    (await baixar(`https://api.github.com/repos/${REPO_DCP}/commits?path=${PASTA_DCP}&per_page=1`)).toString('utf8'),
  ) as { sha: string; commit: { committer: { date: string } } }[];
  const verbetes: Verbete[] = [];
  for (const arq of lista.filter((a) => a.name.endsWith('.tex') && a.download_url)) {
    verbetes.push(...lerDcp((await baixar(arq.download_url!)).toString('utf8')));
  }
  const c = commits[0];
  return { verbetes, versao: c ? `${c.commit.committer.date.slice(0, 10)} (${c.sha.slice(0, 7)})` : null };
}

async function principal() {
  const destino = caminhoDicionario();
  const temporario = `${destino}.novo`;
  fs.rmSync(temporario, { force: true });

  const [c, d] = [await cedict(), await dcp()];
  if (c.verbetes.length < 1000)
    throw new Error(`CC-CEDICT veio com só ${c.verbetes.length} verbetes — arquivo errado?`);
  if (d.verbetes.length < 1000) throw new Error(`DCP veio com só ${d.verbetes.length} verbetes — pasta errada?`);

  const db = criarBancoDicionario(temporario);
  gravarFonte(db, 'cedict', c.verbetes, c.versao);
  gravarFonte(db, 'dcp', d.verbetes, d.versao);
  db.exec('VACUUM');
  db.close();
  fs.renameSync(temporario, destino);

  const mb = (fs.statSync(destino).size / 1024 / 1024).toFixed(1);
  console.log(`\nDicionário gravado em ${destino} (${mb} MB)`);
  console.log(`  ${INFO_FONTES.dcp.nome}: ${d.verbetes.length} verbetes — ${INFO_FONTES.dcp.licenca}`);
  console.log(
    `  ${INFO_FONTES.cedict.nome}: ${c.verbetes.length} verbetes, versão ${c.versao ?? '?'} — ${INFO_FONTES.cedict.licenca}`,
  );
  console.log('O servidor em execução passa a usar o arquivo novo na próxima consulta.');
}

principal().catch((e) => {
  console.error(`Falha ao montar o dicionário: ${(e as Error).message}`);
  process.exit(1);
});
