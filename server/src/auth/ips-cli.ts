import readline from 'node:readline';
import { diretorioDados } from '../config.js';
import { caminhoIps, entradaValida, gravarIps, listaIps } from './ips.js';

// `npm run ips` (doc 14 §7): gerencia a lista de IPs que podem chegar na
// bancada. Roda NA MÁQUINA, por SSH — é de propósito a única forma de mexer
// nisto, porque é a saída de emergência de quem se trancou do lado de fora.
// Uma tela no app para editar a própria lista de acesso teria o defeito óbvio:
// dá para se expulsar e perder a chave junto.

const USO = `Uso:
  npm run ips                          lista o que está permitido
  npm run ips -- permitir <ip|faixa>   acrescenta (ex.: 189.5.4.3, 2804:abc::/48)
  npm run ips -- remover <ip|faixa>    tira UM endereço — é o que você quer quase sempre
  npm run ips -- desligar              APAGA A LISTA INTEIRA (pede confirmação)

Lista VAZIA significa trava DESLIGADA: qualquer endereço pode tentar a senha.
O loopback (127.0.0.1) sempre passa — é por ele que este comando funciona.

Descubra o IP de onde você está com:  curl -s https://api.ipify.org
`;

function mostrar(): void {
  const lista = listaIps();
  console.log(`Arquivo: ${caminhoIps()}`);
  console.log(`Pasta de dados: ${diretorioDados()}\n`);
  if (lista.length === 0) {
    console.log('Trava DESLIGADA — qualquer endereço pode tentar a senha.');
    console.log('Para ligar:  npm run ips -- permitir <seu-ip>');
    return;
  }
  console.log(`Trava LIGADA. Só estes endereços chegam na bancada (${lista.length}):`);
  for (const ip of lista) console.log(`  • ${ip}`);
  console.log('\n(e o loopback, sempre)');
}

/** Pergunta no terminal. Devolve '' quando não há terminal (rodando em script). */
function perguntar(rotulo: string): Promise<string> {
  if (!process.stdin.isTTY) return Promise.resolve('');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolver) =>
    rl.question(rotulo, (resposta) => {
      rl.close();
      resolver(resposta.trim());
    }),
  );
}

/** `desligar` apaga a lista INTEIRA — e é fácil chamá-lo querendo tirar só uma
 *  entrada. Aconteceu de verdade: um `desligar` para desfazer um IP de teste
 *  levou junto o IP real do dono. Por isso ele mostra o que vai perder, pede a
 *  palavra por extenso, e o texto aponta para o `remover`, que quase sempre é o
 *  comando certo. `--sim` existe para scripts, onde não há quem confirme. */
async function desligar(forcado: boolean): Promise<void> {
  const atual = listaIps();

  if (atual.length === 0) {
    console.log('A lista já está vazia — a trava está desligada. Nada a fazer.');
    return;
  }

  console.log(`Isto APAGA os ${atual.length} endereço(s) da lista:`);
  for (const ip of atual) console.log(`  • ${ip}`);
  console.log('\nA bancada volta a aceitar tentativas de senha de QUALQUER lugar do mundo.');
  console.log(`Para tirar só um endereço, cancele e use:  npm run ips -- remover ${atual[0]}\n`);

  if (!forcado) {
    const resposta = await perguntar('Digite "desligar" para confirmar: ');
    if (resposta !== 'desligar') {
      console.log('Cancelado. Nada foi alterado.');
      return;
    }
  }

  gravarIps([]);
  console.log('\nTrava desligada: a lista está vazia e qualquer endereço pode tentar a senha.');
}

async function main(): Promise<void> {
  const argumentos = process.argv.slice(2);
  const forcado = argumentos.includes('--sim');
  const [comando, valor] = argumentos.filter((a) => a !== '--sim');

  if (!comando) return mostrar();

  if (comando === 'desligar') {
    await desligar(forcado);
    return;
  }

  if (comando === 'permitir' || comando === 'remover') {
    if (!valor) {
      console.error(`Falta o endereço.\n\n${USO}`);
      process.exit(1);
    }
    if (!entradaValida(valor)) {
      console.error(`"${valor}" não é um IP nem uma faixa válida (ex.: 189.5.4.3 ou 2804:abc::/48).`);
      process.exit(1);
    }

    const antes = listaIps();
    const depois =
      comando === 'permitir'
        ? [...antes, valor.trim()]
        : antes.filter((e) => e.trim() !== valor.trim());

    gravarIps(depois);
    const agora = listaIps();

    if (comando === 'permitir') {
      console.log(`Permitido: ${valor}`);
      // O primeiro "permitir" é o clique perigoso: até agora a trava estava
      // desligada, e a partir de agora TODO o resto do mundo perde a bancada.
      if (antes.length === 0) {
        console.log('\n⚠  A trava acabou de LIGAR.');
        console.log('   Só este endereço (e o loopback) chega na bancada a partir de agora.');
        console.log('   Confirme que consegue entrar ANTES de fechar o SSH.');
        console.log('   Se seu IP mudar, volte aqui e rode: npm run ips -- permitir <novo-ip>');
      }
    } else {
      console.log(agora.length === antes.length ? `"${valor}" não estava na lista.` : `Removido: ${valor}`);
      if (agora.length === 0) {
        console.log('\nA lista ficou vazia — a trava está DESLIGADA e qualquer endereço pode tentar a senha.');
      }
    }
    console.log('\nVale na hora, sem reiniciar o serviço.');
    return;
  }

  console.error(USO);
  process.exit(1);
}

main().catch((e) => {
  console.error(`Falhou: ${(e as Error).message}`);
  process.exit(1);
});
