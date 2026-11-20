import { describe, expect, it } from 'vitest';
import { temasNoTexto } from '@dao-tale/shared';
import {
  comporOmega,
  MARCADOR_DELTA,
  MARCADOR_DELTA_V2,
  MARCADOR_CHECKLIST_FINAL,
  MARCADOR_PREFERENCIAS,
  MARCADOR_PREFERENCIAS_COMPACTAS,
  NUCLEO_ANTI_DILUICAO_V2,
  NUCLEO_ANTI_DILUICAO_V4,
  NUCLEO_ANTI_DILUICAO_V5,
  NUCLEO_CANDIDATO_6_4,
  NUCLEO_ANTI_DILUICAO,
  NUCLEO_ENXUTO,
  PROMPT_PADRAO_INICIAL,
} from './promptPadraoInicial.js';

// Trava a regressão que produziu o sintoma de 2026-08-05: um Alfa que decide tema de
// Beta mata a chave da obra em silêncio. Não há aviso possível depois do fato — o texto
// sai errado e nada quebra.
describe('o Alfa distribuído respeita a partição', () => {
  it('o núcleo enxuto não decide nenhum tema de Beta', () => {
    const invasoes = temasNoTexto(NUCLEO_ENXUTO).filter((o) => o.tema.dono === 'beta');
    // Listar os trechos em vez de contar: quando falha, a mensagem já diz onde.
    expect(invasoes.map((o) => `L${o.linha} [${o.tema.id}] ${o.trecho}`)).toEqual([]);
  });

  it('o núcleo enxuto reserva as duas seções', () => {
    expect(NUCLEO_ENXUTO).toContain(MARCADOR_PREFERENCIAS);
    expect(NUCLEO_ENXUTO).toContain(MARCADOR_DELTA);
  });

  it('o Alfa antidiuluição reserva Beta compacta, Delta e checklist sem invadir Beta', () => {
    const invasoes = temasNoTexto(NUCLEO_ANTI_DILUICAO).filter((o) => o.tema.dono === 'beta');
    expect(invasoes.map((o) => `L${o.linha} [${o.tema.id}] ${o.trecho}`)).toEqual([]);
    expect(NUCLEO_ANTI_DILUICAO).toContain(MARCADOR_PREFERENCIAS_COMPACTAS);
    expect(NUCLEO_ANTI_DILUICAO).toContain(MARCADOR_DELTA);
    expect(NUCLEO_ANTI_DILUICAO).toContain(MARCADOR_CHECKLIST_FINAL);
    expect(NUCLEO_ANTI_DILUICAO).not.toContain(MARCADOR_PREFERENCIAS);
  });

  it('a revisão multiparágrafo cria outro Alfa sem alterar os marcadores do 6.0', () => {
    expect(NUCLEO_ANTI_DILUICAO).toContain('{{PREFERENCIAS_OBRA_COMPACTAS}}');
    expect(NUCLEO_ANTI_DILUICAO_V2).toContain('{{PREFERENCIAS_OBRA_COMPACTAS_V2}}');
    expect(NUCLEO_ANTI_DILUICAO_V2).toContain('{{CHECKLIST_FINAL_V2}}');
    expect(NUCLEO_ANTI_DILUICAO_V2).not.toContain('{{PREFERENCIAS_OBRA_COMPACTAS}}');
  });

  it('o Alfa 6.3 usa a Beta de tom local sem alterar versões anteriores', () => {
    expect(NUCLEO_ANTI_DILUICAO_V2).toContain('{{PREFERENCIAS_OBRA_COMPACTAS_V2}}');
    expect(NUCLEO_ANTI_DILUICAO_V4).toContain('{{PREFERENCIAS_OBRA_COMPACTAS_V3}}');
    expect(NUCLEO_ANTI_DILUICAO_V4).toContain('{{CHECKLIST_FINAL_V3}}');
    expect(NUCLEO_ANTI_DILUICAO_V4).not.toContain('{{PREFERENCIAS_OBRA_COMPACTAS_V2}}');
  });

  it('o Alfa 6.3.1 muda só a linha do insulto e o marcador da Beta, sem invadir Beta', () => {
    const v4 = NUCLEO_ANTI_DILUICAO_V4.split('\n');
    const v5 = NUCLEO_ANTI_DILUICAO_V5.split('\n');
    expect(v5).toHaveLength(v4.length);
    const mudadas = v4.map((l, i) => [l, v5[i]]).filter(([a, b]) => a !== b);
    expect(mudadas.map(([a]) => a)).toEqual([
      '- Gíria, insulto e obscenidade conservam o grau do original — nunca suavize nem aumente.',
      '{{PREFERENCIAS_OBRA_COMPACTAS_V3}}',
    ]);
    expect(NUCLEO_ANTI_DILUICAO_V5).toContain('Palavrão cristalizado (王八蛋, 他妈的, 操你奶奶的) é expressão cristalizada, não imagem viva');
    expect(NUCLEO_ANTI_DILUICAO_V5).toContain('{{PREFERENCIAS_OBRA_COMPACTAS_V4}}');
    expect(NUCLEO_ANTI_DILUICAO_V5).toContain('{{CHECKLIST_FINAL_V3}}');
    // A frase nova não pode acender tema de Beta que a 6.3 não acendia.
    const temasBeta = (t: string) => temasNoTexto(t).filter((o) => o.tema.dono === 'beta').map((o) => o.tema.id);
    expect(temasBeta(NUCLEO_ANTI_DILUICAO_V5)).toEqual(temasBeta(NUCLEO_ANTI_DILUICAO_V4));
  });

  it('o candidato 6.4 elimina a precedência contraditória sem mudar as camadas', () => {
    expect(NUCLEO_CANDIDATO_6_4).toContain('original = sentido e tom');
    expect(NUCLEO_CANDIDATO_6_4).toContain('Delta = exceções específicas da obra');
    expect(NUCLEO_CANDIDATO_6_4).not.toContain('Beta > Delta');
    expect(NUCLEO_CANDIDATO_6_4).toContain('{{PREFERENCIAS_OBRA_COMPACTAS_V4}}');
    expect(NUCLEO_CANDIDATO_6_4).toContain('Palavrão cristalizado');
    expect(NUCLEO_CANDIDATO_6_4).toContain(MARCADOR_DELTA_V2);
    expect(NUCLEO_CANDIDATO_6_4).not.toContain(MARCADOR_DELTA);
  });

  it('o Delta v2 limita precedência ao Beta e preserva a composição histórica', () => {
    const antigo = comporOmega(NUCLEO_ANTI_DILUICAO_V4, '- Regra da obra.');
    const candidato = comporOmega(NUCLEO_CANDIDATO_6_4, '- Regra da obra.');
    expect(antigo).toContain('precedência sobre as demais');
    expect(candidato).not.toContain('precedência sobre as demais');
    expect(candidato).toContain('prevalece apenas sobre a convenção Beta correspondente');
  });

  // O v1.0 é o que estava rodando no VPS em 2026-08-05 e produziu "está repetitivo?".
  // Este teste FIXA o defeito em vez de escondê-lo: se um dia ele passar a estar limpo,
  // alguém editou uma versão que deveria ser imutável.
  it('o v1.0 legado decide tema de Beta e não reserva a Seção 5 — por isso foi aposentado', () => {
    const invasoes = temasNoTexto(PROMPT_PADRAO_INICIAL).filter((o) => o.tema.dono === 'beta');
    expect(invasoes.length).toBeGreaterThan(0);
    expect(PROMPT_PADRAO_INICIAL).not.toContain(MARCADOR_PREFERENCIAS);
  });
});
