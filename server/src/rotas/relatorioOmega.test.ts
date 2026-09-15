import { describe, expect, it } from 'vitest';
import { PREFERENCIAS_PADRAO } from '@dao-tale/shared';
import { NUCLEO_ENXUTO, comporOmega } from '../db/promptPadraoInicial.js';
import { avisosDaCamada, avisosDeAlfa } from './avisosCamada.js';
import { fatiarOmega, relatorioOmega } from './relatorioOmega.js';

describe('avisosDaCamada', () => {
  it('Delta que decide tema de Beta gera aviso com o trecho', () => {
    const avisos = avisosDaCamada('Nesta obra o diálogo usa travessão.', 'delta');
    expect(avisos).toHaveLength(1);
    expect(avisos[0].tema).toBe('dialogo');
    expect(avisos[0].dono).toBe('beta');
    expect(avisos[0].mensagem).toContain('tema de Beta');
    expect(avisos[0].mensagem).toContain('chave Diálogo');
    expect(avisos[0].trecho).toContain('travessão');
  });

  it('Delta que só fala do que é da obra não gera aviso', () => {
    expect(avisosDaCamada('Lin Feng termina as frases com "hmpf".', 'delta')).toEqual([]);
  });

  it('um aviso por tema, mesmo com o tema repetido em cinco linhas', () => {
    const texto = Array(5).fill('O diálogo usa travessão.').join('\n');
    expect(avisosDaCamada(texto, 'delta')).toHaveLength(1);
  });
});

describe('avisosDeAlfa', () => {
  it('Alfa sem o marcador de preferências avisa que as chaves serão ignoradas', () => {
    const avisos = avisosDeAlfa(`# Alfa\n\nProsa, não legenda.\n\n{{DELTA_OBRA}}`);
    const m = avisos.find((a) => a.tema === 'marcador_preferencias');
    expect(m?.mensagem).toContain('serão ignoradas em silêncio');
  });

  it('Alfa sem o marcador do delta avisa que as diretrizes vão para o fim', () => {
    const avisos = avisosDeAlfa(`# Alfa\n\nProsa.\n\n{{PREFERENCIAS_OBRA}}`);
    expect(avisos.map((a) => a.tema)).toContain('marcador_delta');
  });

  it('Alfa que decide tema de Beta avisa', () => {
    const avisos = avisosDeAlfa(`# Alfa\n\nToda fala usa travessão.\n\n{{PREFERENCIAS_OBRA}}\n\n{{DELTA_OBRA}}`);
    expect(avisos.map((a) => a.tema)).toContain('dialogo');
  });

  it('Alfa bem formado não gera aviso nenhum', () => {
    expect(avisosDeAlfa(`# Alfa\n\nProsa, não legenda.\n\n{{PREFERENCIAS_OBRA}}\n\n{{DELTA_OBRA}}`)).toEqual([]);
  });

  it('reconhece o marcador compacto V3 como Beta válida', () => {
    expect(
      avisosDeAlfa(`# Alfa\n\nProsa, não legenda.\n\n{{PREFERENCIAS_OBRA_COMPACTAS_V3}}\n\n{{DELTA_OBRA}}`),
    ).toEqual([]);
  });

  // Este é o Alfa que estava rodando no VPS em 2026-08-05 e produziu o sintoma.
  it('o v1.0 legado acenderia os dois tipos de aviso', () => {
    const avisos = avisosDeAlfa('# Padrão\n\n**Diálogo:** aspas duplas, nunca travessão.\n\n{{DELTA_OBRA}}');
    expect(avisos.map((a) => a.tema)).toContain('dialogo');
    expect(avisos.map((a) => a.tema)).toContain('marcador_preferencias');
  });
});

describe('fatiarOmega', () => {
  it('corta o composto nas três camadas pelos títulos', () => {
    const omega = comporOmega(NUCLEO_ENXUTO, 'Lin Feng fala em gírias.', PREFERENCIAS_PADRAO);
    const f = fatiarOmega(omega);
    expect(f.alfa).toContain('PROSA, NÃO LEGENDA');
    expect(f.beta).toContain('PREFERÊNCIAS DE ESTILO');
    expect(f.delta).toContain('Lin Feng fala em gírias.');
    expect(f.alfa).not.toContain('Lin Feng');
  });

  // Núcleo legado sem marcador: as chaves realmente não valeram, e dizer que
  // valeram mentiria sobre o que foi enviado à IA.
  it('sem os títulos, tudo conta como Alfa', () => {
    const f = fatiarOmega('# Núcleo antigo\n\nRegras no corpo.');
    expect(f.beta).toBe('');
    expect(f.delta).toBe('');
    expect(f.alfa).toContain('Regras no corpo.');
  });
});

describe('relatorioOmega', () => {
  it('acusa sobreposição quando o Delta repete tema que Beta já decide', () => {
    const omega = comporOmega(NUCLEO_ENXUTO, 'Aqui o diálogo usa travessão.', PREFERENCIAS_PADRAO);
    const s = relatorioOmega(omega).sobreposicoes.find((x) => x.tema === 'dialogo');
    expect(s?.camadas).toEqual(['beta', 'delta']);
    expect(s?.trechos.join(' ')).toContain('travessão');
  });

  it('sem sobreposição, a lista vem vazia e os temas continuam listados com o dono', () => {
    const omega = comporOmega(NUCLEO_ENXUTO, 'Lin Feng termina as frases com "hmpf".', PREFERENCIAS_PADRAO);
    const rel = relatorioOmega(omega);
    expect(rel.sobreposicoes).toEqual([]);
    expect(rel.temas.find((t) => t.tema === 'dialogo')?.dono).toBe('beta');
    expect(rel.temas.find((t) => t.tema === 'glossario')?.dono).toBe('alfa');
  });
});
