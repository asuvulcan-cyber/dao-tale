#!/usr/bin/env node
// Sobe o CÓDIGO local para o VPS. Nunca toca em dados.
//
// Esta é a única sincronização que existe entre as duas máquinas, e é de mão única de
// propósito. O que muda de cada lado é diferente:
//
//   código, núcleo Alfa  →  nascem aqui, no repositório  →  sobem
//   obras, capítulos, glossário, Beta, Delta  →  nascem no VPS  →  ficam lá
//
// Copiar banco de um lado para o outro foi tentado em 2026-08-06 e teria apagado um
// capítulo traduzido: as duas instâncias estavam à frente em eixos DIFERENTES. Ver
// docs/15-camadas-do-prompt.md §9.
//
//     node scripts/subir.mjs            # confere e pergunta antes
//     node scripts/subir.mjs --seco     # só mostra o que mudaria
//
// Requer a chave em ~/.ssh/dao_tale.

import { execFileSync, execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOST = 'root@103.199.186.52';
const DESTINO = '/opt/dao-tale/';
const CHAVE = join(homedir(), '.ssh', 'dao_tale');
// Ignora configuração global da máquina: um drop-in alheio ao projeto com dono
// ou permissão incorreta faz o OpenSSH abortar antes mesmo de ler nossa chave.
const SSH = `ssh -F /dev/null -i ${CHAVE} -o BatchMode=yes`;
const SECO = process.argv.includes('--seco');

// `node_modules` e `*.db` fora: as dependências são instaladas lá, e o banco é DELE.
// `VERSAO.json` é gerado logo antes do envio (ver `carimbar`) — o VPS não tem git,
// então é a única forma de a máquina saber que código está rodando nela.
const ENVIAR = ['shared', 'server', 'web', 'package.json', 'package-lock.json', 'tsconfig.base.json', 'VERSAO.json'];
const EXCLUIR = ['node_modules', '.git', '*.db*', 'dist/.vite'];

const sh = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const remoto = (cmd) => sh(`${SSH} ${HOST} ${JSON.stringify(cmd)}`);
const passo = (t) => console.log(`\n▸ ${t}`);

/** Roda JS no VPS mandando o código por STDIN, não como argumento.
    Embutir o script na linha de comando obriga a escapar aspas em quatro camadas
    (shell local → ssh → shell remoto → JS), e um `<> ''` de SQL vira `<> ""`, que o
    SQLite lê como nome de coluna. Por stdin não há camada nenhuma para escapar. */
const remotoNode = (js) =>
  execFileSync('ssh', ['-F', '/dev/null', '-i', CHAVE, '-o', 'BatchMode=yes', HOST, 'cd /opt/dao-tale && sudo -u daotale node --input-type=module -'], {
    input: js,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
  }).trim();

passo('Testes e tipos antes de subir');
// Subir código quebrado num serviço que só se percebe errado dias depois é o modo mais
// caro de falhar deste projeto — daí a barreira ser aqui, não lá.
execFileSync('npm', ['run', 'typecheck'], { stdio: 'inherit' });
execFileSync('npm', ['-w', 'server', 'run', 'test'], { stdio: 'inherit' });

passo('Build do front');
execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });

passo('Dependências mudaram?');
const deps = sh('git diff HEAD~1..HEAD --name-only -- package.json package-lock.json */package.json || true');
const precisaInstalar = deps.length > 0;
console.log(precisaInstalar ? `  sim: ${deps.split('\n').join(', ')} — vai rodar npm ci lá` : '  não — pula o npm ci');

passo('Carimbo da versão');
// O VPS não tem git (o `.git` fica fora do rsync de propósito), então não há como
// perguntar à máquina qual commit é este. O carimbo é gravado aqui, no momento do
// envio, e a rota /saude o lê — antes disto ela respondia a string fixa '0.1.0',
// igual desde o primeiro dia, que parecia resposta e não era.
//
// `--dirty` na descrição quando a árvore de trabalho difere do HEAD: o rsync manda
// a ÁRVORE, não o commit, então omitir isso faria o carimbo apontar para um commit
// que não é exatamente o que está rodando lá.
const sujo = sh('git status --porcelain').length > 0;
const carimbo = {
  commit: sh('git rev-parse --short HEAD') + (sujo ? '-sujo' : ''),
  publicado_em: new Date().toISOString(),
  assunto: sh('git log -1 --format=%s'),
};
writeFileSync('VERSAO.json', JSON.stringify(carimbo, null, 2) + '\n');
console.log(`  ${carimbo.commit} — ${carimbo.assunto}`);
if (sujo) console.log('  ⚠ árvore de trabalho com alterações não commitadas: elas SOBEM, e o carimbo avisa com "-sujo"');

const args = [...EXCLUIR.flatMap((e) => ['--exclude', e]), '-e', SSH];
passo('O que muda no VPS');
execFileSync('rsync', ['-az', '--delete', '--itemize-changes', '--dry-run', ...args, ...ENVIAR, HOST + ':' + DESTINO], {
  stdio: 'inherit',
});

if (SECO) {
  console.log('\n--seco: nada foi enviado.');
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ok = await rl.question('\nSubir e reiniciar o serviço? [s/N] ');
rl.close();
if (ok.trim().toLowerCase() !== 's') {
  console.log('Cancelado.');
  process.exit(0);
}

const CONTA_FRASES = "SELECT COUNT(*) n FROM frases WHERE texto_pt IS NOT NULL AND texto_pt <> ''";

passo('Backup do banco antes de mexer no serviço');
// O código novo pode trazer migração; backup verificado antes é barato e já salvou o dia.
// Verificado = abrir a cópia e contar. Backup que ninguém abriu não é backup.
console.log(
  remotoNode(`
    import D from 'better-sqlite3';
    const origem = new D('/var/lib/dao-tale/dao-tale.db', { readonly: true });
    const alvo = '/var/lib/dao-tale/backups/pre-deploy-' + new Date().toISOString().replace(/[:.]/g, '-') + '.db';
    await origem.backup(alvo);
    const copia = new D(alvo, { readonly: true });
    console.log('  ' + alvo);
    console.log('  integrity=' + copia.pragma('integrity_check')[0].integrity_check +
      ' obras=' + copia.prepare('SELECT COUNT(*) n FROM obras').get().n +
      " frases_pt=" + copia.prepare(${JSON.stringify(CONTA_FRASES)}).get().n);
  `),
);

passo('Enviando');
execFileSync('rsync', ['-az', '--delete', ...args, ...ENVIAR, HOST + ':' + DESTINO], { stdio: 'inherit' });
remoto('chown -R daotale:daotale /opt/dao-tale');
if (precisaInstalar) remoto('cd /opt/dao-tale && sudo -u daotale npm ci');

passo('Reiniciando');
remoto('systemctl restart dao-tale && sleep 6 && systemctl is-active dao-tale');

passo('Conferindo');
// Não basta "subiu": o que importa é o núcleo ativo reservar a Seção 5. Sem isso as
// preferências de cada obra voltam a ser descartadas em silêncio.
console.log(
  remotoNode(`
    import D from 'better-sqlite3';
    const db = new D('/var/lib/dao-tale/dao-tale.db', { readonly: true });
    const alfa = db.prepare('SELECT versao, conteudo FROM prompt_padrao WHERE ativo = 1').get();
    const reservaSecao5 = !!alfa && (alfa.conteudo.includes('{{PREFERENCIAS_OBRA}}') || alfa.conteudo.includes('{{PREFERENCIAS_OBRA_COMPACTAS}}') || alfa.conteudo.includes('{{PREFERENCIAS_OBRA_COMPACTAS_V2}}') || alfa.conteudo.includes('{{PREFERENCIAS_OBRA_COMPACTAS_V3}}'));
    console.log('  núcleo ativo: v' + (alfa ? alfa.versao : 'nenhum') + ' — reserva a Seção 5: ' + (reservaSecao5 ? 'sim' : 'NÃO'));
    console.log('  frases traduzidas: ' + db.prepare(${JSON.stringify(CONTA_FRASES)}).get().n);
    // Sai diferente de zero para o deploy falhar ruidosamente: núcleo sem o marcador
    // descarta as preferências de cada obra EM SILÊNCIO, e silêncio é o problema.
    process.exit(reservaSecao5 ? 0 : 1);
  `),
);
console.log(remoto('journalctl -u dao-tale -n 3 --no-pager -o cat'));
console.log('\n✓ No ar: https://daotale.illusia.com.br');
