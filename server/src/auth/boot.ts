import { ehHospedado, enderecoBind, hostsPublicos, HOST } from '../config.js';
import { caminhoAuth, senhaDefinida } from './senha.js';
import { segredoSessao } from './sessao.js';

// Guarda de subida em modo hospedado (doc 13 §2). Postura fail-closed: faltando
// qualquer peça da segurança, o processo NÃO sobe. Nunca pode existir um estado
// "no ar e aberto" — é o cenário em que alguém drena a cota ou leva as obras.

export function problemasDeHospedagem(): string[] {
  if (!ehHospedado()) return [];
  const problemas: string[] = [];

  if (hostsPublicos().length === 0) {
    problemas.push(
      'DAO_TALE_HOST_PUBLICO não está definido — sem domínio na allowlist, nenhuma ' +
        'requisição de fora seria aceita e não há como validar Host/Origin.',
    );
  }

  if (!senhaDefinida()) {
    problemas.push(`nenhuma senha definida (${caminhoAuth()} não existe) — rode "npm run senha" antes de expor o app.`);
  }

  try {
    segredoSessao();
  } catch (e) {
    problemas.push(`não foi possível obter o segredo de sessão: ${(e as Error).message}`);
  }

  return problemas;
}

export function avisosDeHospedagem(): string[] {
  if (!ehHospedado()) return [];
  const avisos: string[] = [];
  if (enderecoBind() !== HOST) {
    avisos.push(
      `o servidor vai escutar em ${enderecoBind()} (não em ${HOST}). Só faça isso se o ` +
        'proxy TLS estiver em outra máquina/container — em VPS com Caddy local, remova DAO_TALE_BIND.',
    );
  }
  return avisos;
}
