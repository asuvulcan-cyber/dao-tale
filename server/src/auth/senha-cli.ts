import readline from 'node:readline';
import { Writable } from 'node:stream';
import { diretorioDados } from '../config.js';
import { caminhoAuth, definirSenha, lerRegistro, TAMANHO_MINIMO_SENHA } from './senha.js';

// `npm run senha` (doc 13 §3): define/troca a senha de acesso remoto. Pergunta
// duas vezes com eco desligado — a senha nunca chega a existir em arquivo de
// histórico, em variável de ambiente nem no repositório.

/** UMA interface de readline para as duas perguntas: abrir e fechar uma por
 *  pergunta descarta o que já estivesse no buffer de entrada, e a segunda
 *  resposta se perde. A saída é "muda" enquanto se digita — o prompt aparece,
 *  a senha não. */
function criarPerguntador(): { perguntar: (rotulo: string) => Promise<string>; fechar: () => void } {
  let mudo = false;
  const saida = new Writable({
    write(pedaco, _codificacao, pronto) {
      if (!mudo) process.stdout.write(pedaco);
      pronto();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output: saida, terminal: true });

  const perguntar = (rotulo: string): Promise<string> =>
    new Promise((resolver) => {
      mudo = false;
      rl.question(rotulo, (resposta) => {
        mudo = false;
        process.stdout.write('\n');
        resolver(resposta);
      });
      mudo = true;
    });

  return { perguntar, fechar: () => rl.close() };
}

async function main(): Promise<void> {
  const arquivo = caminhoAuth();
  const atual = lerRegistro(arquivo);

  console.log(`Dao Tale — senha de acesso remoto (modo hospedado).`);
  console.log(`Pasta de dados: ${diretorioDados()}`);
  console.log(
    atual
      ? `Já existe senha definida em ${new Date(atual.definida_em).toLocaleString('pt-BR')}. ` +
          `Trocar agora encerra todas as sessões abertas.`
      : `Nenhuma senha definida ainda.`,
  );
  console.log(`Mínimo de ${TAMANHO_MINIMO_SENHA} caracteres — use uma frase longa.\n`);

  if (!process.stdin.isTTY) {
    console.error('Este comando precisa de um terminal interativo (não dá para canalizar a senha).');
    process.exit(1);
  }

  const { perguntar, fechar } = criarPerguntador();
  const senha = await perguntar('Nova senha: ');
  const confirmacao = await perguntar('Repita a senha: ');
  fechar();

  if (senha !== confirmacao) {
    console.error('\nAs senhas não conferem. Nada foi alterado.');
    process.exit(1);
  }

  try {
    const registro = definirSenha(senha, arquivo);
    console.log(`\nSenha definida (geração ${registro.geracao}).`);
    console.log(`Arquivo: ${arquivo} (permissão 0600)`);
    if (registro.geracao > 1) console.log('As sessões que estavam abertas foram encerradas.');
    console.log('\nReinicie o serviço para valer: systemctl restart dao-tale');
  } catch (e) {
    console.error(`\n${(e as Error).message}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
