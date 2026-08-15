// Aferição do catálogo de erros zh→pt-BR (spec 2026-08-10).
//
// Uso:  npx tsx scripts/aferir-catalogo.ts <obra_id> [caminho-do-banco]
//
// Responde, para cada entrada do catálogo E para cada reprovada, quantas frases
// ela acusaria no texto que a IA produziu e em quantas delas o revisor já tinha
// corrigido por conta própria. É esse número que autoriza uma entrada a existir
// (PRECISAO_MINIMA e AMOSTRA_MINIMA) — e é ele que deve ser regravado no
// `aferido` quando o corpus crescer. Nada é escrito; o banco é aberto readonly.

import fs from 'node:fs';
import Database from 'better-sqlite3';
import {
  AMOSTRA_MINIMA,
  CATALOGO,
  PRECISAO_MINIMA,
  REPROVADAS,
  entradaAprovada,
  type EntradaCatalogo,
} from '@dao-tale/shared';
import { caminhoBanco } from '../src/config.js';
import { aferirCatalogo, type LinhaAfericao } from '../src/traducao/catalogoZhPt.js';

const argumentos = process.argv.slice(2);
const obraId = Number(argumentos[0]);
if (!Number.isInteger(obraId)) {
  console.error('Uso: npx tsx scripts/aferir-catalogo.ts <obra_id> [caminho-do-banco]');
  process.exit(1);
}
const caminho = argumentos[1] ?? caminhoBanco();

interface FraseParaAfericao {
  texto_zh: string;
  texto_pt: string;
  texto_pt_original_ia: string | null;
  origem_edicao: string | null;
}

// Somente leitura, de propósito: este script decide se uma regra MERECE existir,
// não grava nada. Banco ausente ou ainda sem a tabela `frases` (obra nova, banco
// de teste vazio) não pode estourar — só significa zero frases para aferir.
function lerFrases(): FraseParaAfericao[] {
  if (!fs.existsSync(caminho)) {
    console.log(`(nenhum banco em ${caminho} — todas as linhas saem em zero)\n`);
    return [];
  }
  const db = new Database(caminho, { readonly: true, fileMustExist: true });
  try {
    const temTabela = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'frases'")
      .get();
    if (!temTabela) {
      console.log(`(banco em ${caminho} ainda sem a tabela 'frases' — todas as linhas saem em zero)\n`);
      return [];
    }
    // `origem_edicao` nasceu na migração 023 e foi retroativada pela 024. Num
    // banco anterior a elas a coluna não existe — e a leitura certa nesse caso é
    // `null` (digitada pelo revisor), que é o que o corpus daquela época era:
    // todas as frases da obra 1 são anteriores ao passe de estilo existir.
    const temOrigem = (db.prepare('PRAGMA table_info(frases)').all() as { name: string }[]).some(
      (c) => c.name === 'origem_edicao',
    );
    if (!temOrigem) console.log('(banco anterior à migração 023 — nenhuma frase tem origem, todas contam como digitadas)\n');
    return db
      .prepare(
        `SELECT f.texto_zh, f.texto_pt, f.texto_pt_original_ia,
                ${temOrigem ? 'f.origem_edicao' : 'NULL'} AS origem_edicao
           FROM frases f JOIN capitulos c ON c.id = f.capitulo_id
          WHERE c.obra_id = ? AND f.status_traducao = 'traduzida'`,
      )
      .all(obraId) as FraseParaAfericao[];
  } finally {
    db.close();
  }
}

const frases = lerFrases();

function imprimirLinha(l: LinhaAfericao): void {
  console.log(
    `  ${l.entrada_id.padEnd(22)} ${l.gatilho_zh.padEnd(4)} ` +
      `acusadas ${String(l.acusadas).padStart(4)} · restantes ${String(l.restantes).padStart(4)} · ` +
      `corrigidas ${String(l.corrigidas).padStart(4)} · novas ${String(l.novas).padStart(3)} · ` +
      `assistidas ${String(l.assistidas).padStart(3)} · precisão ${(l.precisao * 100).toFixed(0)}%`,
  );
  // A amostra encolhendo tem de aparecer: cada frase que o app consertou é uma
  // frase que esta medição não pode mais ler. Se sobrarem menos que o piso, a
  // entrada deixa de poder se justificar por dado novo — e isso é uma resposta.
  if (l.assistidas > 0) {
    console.log(
      `    (${l.assistidas} frase(s) que a entrada acusava foram consertadas por botão do app e saíram da conta — ` +
        'o que o revisor faria sozinho nelas é inobservável)',
    );
  }
  // O portão real (shared/src/catalogoErros.ts): mesmo cálculo que decide se uma
  // entrada pode estar em CATALOGO, aplicado aos números frescos desta obra.
  const aprovada = entradaAprovada({ obra_id: obraId, acusadas: l.acusadas, corrigidas: l.corrigidas, em: '' });
  console.log(
    `    → ${aprovada ? 'PASSA' : 'REPROVA'} (piso: acusadas ≥ ${AMOSTRA_MINIMA} e precisão ≥ ${PRECISAO_MINIMA * 100}%)`,
  );
}

function imprimirBloco(titulo: string, entradas: readonly EntradaCatalogo[]): void {
  console.log(`${titulo}:`);
  if (entradas.length === 0) {
    console.log('  (vazio)');
    return;
  }
  for (const linha of aferirCatalogo(frases, entradas)) imprimirLinha(linha);
}

console.log(`Aferição do catálogo — obra ${obraId} (${frases.length} frase(s) traduzida(s), banco: ${caminho})\n`);
imprimirBloco('CATALOGO', CATALOGO);
console.log();
imprimirBloco('REPROVADAS', REPROVADAS);
