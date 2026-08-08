import { beforeEach, describe, expect, it } from 'vitest';
import { camadaDoRotulo, preferenciaQueCobre } from '@dao-tale/shared';
import { abrirBanco, type BancoDados } from './index.js';
import { reposCapitulos, reposFrases, reposObras, reposTestes } from './repos.js';

let db: BancoDados;
let obraId: number;
let fraseId: number;

beforeEach(() => {
  db = abrirBanco(':memory:');
  obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
  const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲说。' }, [
    { texto_zh: '甲说。', paragrafo: 0 },
  ]);
  fraseId = reposFrases.listarPorCapitulo(db, cap.id)[0].id;
});

function caso(secao: string | null, pai: number | null) {
  return reposTestes.criar(db, {
    frase_id: fraseId, obra_id: obraId, caso_pai_id: pai, trecho_zh: '甲',
    pergunta: 'p', veredito: 'incorreto', resposta: 'r', justificativa: '',
    secao_regra: secao, correcao_proposta: null, trecho_pt_errado: null,
    trecho_pt_corrigido: null, motivo_rejeicao: null,
    provedor: 'mock', modelo: 'mock-v1', resposta_bruta: '{}',
  });
}

describe('camadaDoRotulo', () => {
  it('reconhece chave de estilo como beta', () => {
    expect(camadaDoRotulo('5-mais-que-perfeito')?.camada).toBe('beta');
    expect(camadaDoRotulo('5-registro')?.camada).toBe('beta');
  });

  it('reconhece tema de núcleo como alfa', () => {
    // O ramo que hoje escapa: viraria diretriz de obra sobre tema do Alfa.
    expect(camadaDoRotulo('4-sem-decalque')?.camada).toBe('alfa');
    expect(camadaDoRotulo('glossario')?.camada).toBe('alfa');
  });

  it('devolve null para rótulo sem tema — candidato legítimo a diretriz', () => {
    expect(camadaDoRotulo('1-prosa-nao-legenda')).toBeNull();
  });

  it('inclui temas não-filtráveis, ao contrário de preferenciaQueCobre', () => {
    // nomes_proprios é beta com filtravel: false. O aviso mostra; o filtro não.
    expect(camadaDoRotulo('nomes proprios: em pinyin')?.tema.id).toBe('nomes_proprios');
    expect(preferenciaQueCobre('nomes proprios: em pinyin')).toBeNull();
  });

  it('não muda o que preferenciaQueCobre devolve', () => {
    // Não-regressão: este caminho DERRUBA candidato pago em silêncio.
    expect(preferenciaQueCobre('5-mais-que-perfeito')).toBe('mais_que_perfeito');
    expect(preferenciaQueCobre('5-registro')).toBe('registro');
    expect(preferenciaQueCobre('4-sem-decalque')).toBeNull();
    expect(preferenciaQueCobre('1-prosa-nao-legenda')).toBeNull();
  });
});

describe('padraoRotulo de nomes_proprios não invade território do Alfa', () => {
  // Achado da revisão (rodada 1): `translitera` solto no padraoRotulo casava como
  // substring em QUALQUER rótulo que mencionasse transliteração, mesmo quando o
  // dono do tema é outro — e como nomes_proprios está no índice 6 do array e
  // `TEMAS.find` para no primeiro casamento, ele interceptava rótulos de
  // `unidades`, `decalque` e `glossario`, todos posteriores. É a MESMA armadilha
  // que o `padrao` de texto corrido já tinha caído (comentário do topo do
  // arquivo, medição de 2026-08-06) — só que pelo caminho do rótulo, onde nenhum
  // teste olhava.
  //
  // Estreitar nomes_proprios sozinho já tirava os três daqui de beta, mas dois
  // caíam em null: unidades e glossario tinham o MESMO defeito de origem que
  // nomes_proprios tinha (padrao dependente de ordem/espaço, que a normalização
  // sempre destrói) — só que ninguém tinha testado esse ângulo neles ainda. Os
  // dois ganharam padraoRotulo pela mesma razão, para os três resolverem para a
  // camada certa de verdade, não só para deixarem de mentir "beta".
  it('não intercepta rótulos de temas de Alfa que citam transliteração', () => {
    expect(camadaDoRotulo('unidade-transliterada')?.camada).toBe('alfa');
    expect(camadaDoRotulo('unidade-transliterada')?.tema.id).toBe('unidades');
    expect(camadaDoRotulo('decalque-transliterado')?.camada).toBe('alfa');
    expect(camadaDoRotulo('decalque-transliterado')?.tema.id).toBe('decalque');
    expect(camadaDoRotulo('termo-novo-transliterado')?.camada).toBe('alfa');
    expect(camadaDoRotulo('termo-novo-transliterado')?.tema.id).toBe('glossario');
  });

  it('continua reconhecendo a política de nomes próprios de verdade', () => {
    expect(camadaDoRotulo('5-nomes-proprios')?.tema.id).toBe('nomes_proprios');
    expect(camadaDoRotulo('nomes proprios: em pinyin')?.tema.id).toBe('nomes_proprios');
  });
});

describe('rótulos enviados ao modelo', () => {
  it('não expõe o ranking de frequência', () => {
    // O laço: mais usado → mais oferecido → mais escolhido → mais usado ainda.
    for (let i = 0; i < 5; i++) caso('5-mais-que-perfeito', null);
    caso('1-prosa-nao-legenda', null);
    const rotulos = reposTestes.rotulosDeRegra(db, obraId);
    expect(rotulos.map((r) => r.rotulo)).toEqual(['1-prosa-nao-legenda', '5-mais-que-perfeito']);
    expect(rotulos.find((r) => r.rotulo === '5-mais-que-perfeito')!.camada).toBe('beta');
  });
});
