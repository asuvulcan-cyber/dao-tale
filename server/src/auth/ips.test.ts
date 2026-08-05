import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { caminhoIps, entradaValida, gravarIps, ipPermitido, listaIps, paraBytes, travaDeIpLigada } from './ips.js';

// Trava de IP (doc 14 §7). O que se testa aqui é sobretudo a MANEIRA DE ERRAR:
// uma comparação frouxa deixa entrar quem não devia, e uma rígida demais tranca
// o dono do lado de fora — e o segundo é o que acontece na prática.

let dir: string;
let arquivo: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-ips-'));
  arquivo = caminhoIps(dir);
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('lista vazia = trava desligada', () => {
  it('sem arquivo nenhum, todo mundo passa', () => {
    expect(travaDeIpLigada(arquivo)).toBe(false);
    expect(ipPermitido('189.5.4.3', arquivo)).toBe(true);
    expect(ipPermitido('2804:14d:baa::1', arquivo)).toBe(true);
  });

  it('arquivo corrompido não tranca ninguém — o app precisa subir', () => {
    fs.writeFileSync(arquivo, '{ isto não é json');
    expect(ipPermitido('189.5.4.3', arquivo)).toBe(true);
  });

  it('desligar esvaziando volta a aceitar de qualquer lugar', () => {
    gravarIps(['189.5.4.3'], arquivo);
    expect(ipPermitido('200.1.1.1', arquivo)).toBe(false);
    gravarIps([], arquivo);
    expect(ipPermitido('200.1.1.1', arquivo)).toBe(true);
  });
});

describe('a saída de emergência', () => {
  it('loopback passa mesmo com a lista fechada — é por ele que se conserta', () => {
    gravarIps(['189.5.4.3'], arquivo);
    expect(ipPermitido('127.0.0.1', arquivo)).toBe(true);
    expect(ipPermitido('::1', arquivo)).toBe(true);
    expect(ipPermitido('127.0.0.53', arquivo)).toBe(true);
  });

  it('entrada inválida é descartada SEM esvaziar a lista', () => {
    // Se um typo derrubasse a lista inteira, o efeito seria "trava desligada" —
    // falha silenciosa e no sentido errado.
    fs.writeFileSync(arquivo, JSON.stringify({ ips: ['189.5.4.3', 'não é um ip', '999.1.1.1'] }));
    expect(listaIps(arquivo)).toEqual(['189.5.4.3']);
    expect(ipPermitido('189.5.4.3', arquivo)).toBe(true);
    expect(ipPermitido('200.1.1.1', arquivo)).toBe(false);
  });
});

describe('IPv4', () => {
  it('endereço exato', () => {
    gravarIps(['189.5.4.3'], arquivo);
    expect(ipPermitido('189.5.4.3', arquivo)).toBe(true);
    expect(ipPermitido('189.5.4.4', arquivo)).toBe(false);
  });

  it('faixa /24', () => {
    gravarIps(['189.5.4.0/24'], arquivo);
    expect(ipPermitido('189.5.4.1', arquivo)).toBe(true);
    expect(ipPermitido('189.5.4.255', arquivo)).toBe(true);
    expect(ipPermitido('189.5.5.1', arquivo)).toBe(false);
  });

  it('prefixo que não fecha em byte cheio (/28)', () => {
    gravarIps(['10.0.0.0/28'], arquivo);
    expect(ipPermitido('10.0.0.15', arquivo)).toBe(true);
    expect(ipPermitido('10.0.0.16', arquivo)).toBe(false);
  });

  it('/32 é um endereço só, e /0 é todo mundo', () => {
    gravarIps(['189.5.4.3/32'], arquivo);
    expect(ipPermitido('189.5.4.3', arquivo)).toBe(true);
    expect(ipPermitido('189.5.4.2', arquivo)).toBe(false);

    gravarIps(['0.0.0.0/0'], arquivo);
    expect(ipPermitido('8.8.8.8', arquivo)).toBe(true);
  });
});

describe('IPv6 — onde este tipo de código costuma errar', () => {
  it('endereço exato, inclusive escrito de formas diferentes', () => {
    gravarIps(['2804:14d:baa:0:0:0:0:1'], arquivo);
    expect(ipPermitido('2804:14d:baa::1', arquivo)).toBe(true);
    expect(ipPermitido('2804:14d:baa::2', arquivo)).toBe(false);
  });

  it('faixa /48 — a que interessa, porque o final do IPv6 doméstico muda sozinho', () => {
    gravarIps(['2804:14d:baa::/48'], arquivo);
    expect(ipPermitido('2804:14d:baa::1', arquivo)).toBe(true);
    expect(ipPermitido('2804:14d:baa:9f00::abcd', arquivo)).toBe(true);
    expect(ipPermitido('2804:14d:bab::1', arquivo)).toBe(false);
  });

  it('IPv4 mapeado casa com a regra IPv4 — o mesmo aparelho pelo outro caminho', () => {
    gravarIps(['189.5.4.3'], arquivo);
    expect(ipPermitido('::ffff:189.5.4.3', arquivo)).toBe(true);
    expect(ipPermitido('[::ffff:189.5.4.3]', arquivo)).toBe(true);
  });

  it('IPv4 e IPv6 não se confundem entre si', () => {
    gravarIps(['2804:14d:baa::/48'], arquivo);
    expect(ipPermitido('189.5.4.3', arquivo)).toBe(false);
    gravarIps(['189.5.4.0/24'], arquivo);
    expect(ipPermitido('2804:14d:baa::1', arquivo)).toBe(false);
  });

  it('escopo de interface não atrapalha', () => {
    gravarIps(['fe80::/10'], arquivo);
    expect(ipPermitido('fe80::1%eth0', arquivo)).toBe(true);
  });
});

describe('validação de entrada', () => {
  it('aceita o que é endereço ou faixa', () => {
    for (const bom of ['189.5.4.3', '10.0.0.0/8', '::1', '2804:14d:baa::/48', '::ffff:1.2.3.4']) {
      expect(entradaValida(bom)).toBe(true);
    }
  });

  it('recusa lixo e prefixo impossível', () => {
    for (const ruim of ['', 'casa', '999.1.1.1', '10.0.0.0/33', '::1/200', '1.2.3.4/-1']) {
      expect(entradaValida(ruim)).toBe(false);
    }
  });

  it('prefixo mal escrito é recusado, nunca interpretado com boa vontade', () => {
    // `Number('')` é 0: sem cuidado, "::/" viraria /0 — o mundo inteiro entra.
    for (const ruim of ['::/', '10.0.0.0/', '10.0.0.0/ 8', '10.0.0.0/8a', '10.0.0.0/+8']) {
      expect(entradaValida(ruim)).toBe(false);
    }
  });

  it('endereço com dois "::" é inválido', () => {
    expect(paraBytes('2804::baa::1')).toBeNull();
  });

  it('IP desconhecido (socket sem endereço) não passa com a trava ligada', () => {
    gravarIps(['189.5.4.3'], arquivo);
    expect(ipPermitido('desconhecido', arquivo)).toBe(false);
  });
});

describe('editar vale na hora', () => {
  it('a lista relida do disco muda o veredito sem reiniciar', () => {
    gravarIps(['189.5.4.3'], arquivo);
    expect(ipPermitido('200.1.1.1', arquivo)).toBe(false);
    gravarIps(['189.5.4.3', '200.1.1.1'], arquivo);
    expect(ipPermitido('200.1.1.1', arquivo)).toBe(true);
  });

  it('não guarda duplicata', () => {
    gravarIps(['189.5.4.3', ' 189.5.4.3 ', '189.5.4.3'], arquivo);
    expect(listaIps(arquivo)).toEqual(['189.5.4.3']);
  });
});
