import { describe, expect, it } from 'vitest';
import { Type } from '@google/genai';
import { z } from 'zod';
import {
  CONTRATO_CONTRACAPA,
  CONTRATO_EXTRAIR_TERMOS,
  CONTRATO_REFINAR_PROMPT,
  CONTRATO_REVISAO,
  CONTRATO_TRADUCAO,
  instrucaoJson,
  paraGemini,
  type Contrato,
} from './contratos.js';

const CONTRATOS: Contrato[] = [
  CONTRATO_TRADUCAO,
  CONTRATO_CONTRACAPA,
  CONTRATO_EXTRAIR_TERMOS,
  CONTRATO_REVISAO,
  CONTRATO_REFINAR_PROMPT,
];

describe('paraGemini (derivação da fonte única)', () => {
  it('converte objeto aninhado com required, enum e inteiro', () => {
    const g = paraGemini(CONTRATO_TRADUCAO.schema);
    expect(g.type).toBe(Type.OBJECT);
    expect(g.required).toEqual(['traducoes', 'termos_novos']);
    const traducoes = g.properties!.traducoes;
    expect(traducoes.type).toBe(Type.ARRAY);
    expect(traducoes.items!.properties!.ordem.type).toBe(Type.INTEGER);
    const categoria = g.properties!.termos_novos.items!.properties!.categoria;
    expect(categoria.type).toBe(Type.STRING);
    expect(categoria.enum).toContain('personagem');
  });

  it("['string','null'] vira STRING nullable (correcao_proposta)", () => {
    const g = paraGemini(CONTRATO_REVISAO.schema);
    const correcao = g.properties!.correcao_proposta;
    expect(correcao.type).toBe(Type.STRING);
    expect(correcao.nullable).toBe(true);
    // Campo opcional não entra no required.
    expect(g.required).not.toContain('correcao_proposta');
  });
});

describe('instrucaoJson (derivação da fonte única)', () => {
  it('gera esqueleto com todas as chaves, enums e notas do contrato', () => {
    const texto = instrucaoJson(CONTRATO_TRADUCAO);
    expect(texto).toContain('## FORMATO DA RESPOSTA');
    expect(texto).toContain('"traducoes"');
    expect(texto).toContain('"termos_novos"');
    expect(texto).toContain('"personagem"');
    expect(texto).toContain('Se não houver termos novos, use "termos_novos": [].');
  });

  it('campo anulável aparece com "ou null"', () => {
    expect(instrucaoJson(CONTRATO_REVISAO)).toContain('ou null');
  });
});

describe('coerência schema ⇄ zod (a fonte única não pode divergir da validação)', () => {
  it.each(CONTRATOS.map((c) => [c.ferramenta, c] as const))('%s', (_nome, contrato) => {
    // Toda propriedade do schema de geração existe no Zod de validação e vice-versa.
    const chavesSchema = Object.keys(contrato.schema.properties ?? {}).sort();
    const chavesZod = Object.keys((contrato.zod as z.AnyZodObject).shape).sort();
    expect(chavesSchema).toEqual(chavesZod);
    // E o obrigatório do schema é subconjunto das chaves.
    for (const chave of contrato.schema.required ?? []) {
      expect(chavesSchema).toContain(chave);
    }
  });

  it('um exemplo mínimo válido por contrato passa no Zod', () => {
    expect(() =>
      CONTRATO_TRADUCAO.zod.parse({ traducoes: [{ ordem: 1, texto_pt: 'Oi.' }], termos_novos: [] }),
    ).not.toThrow();
    expect(() => CONTRATO_EXTRAIR_TERMOS.zod.parse({ termos: [{ termo_zh: '灵', termo_pt: 'Espírito' }] })).not.toThrow();
    expect(() =>
      CONTRATO_REVISAO.zod.parse({
        trecho_zh: '灵',
        veredito: 'correto',
        justificativa: 'ok',
        secao_regra: 'geral',
        correcao_proposta: null,
      }),
    ).not.toThrow();
    expect(() =>
      CONTRATO_REFINAR_PROMPT.zod.parse({ propostas: [{ secao_regra: 'g', regra_proposta: 'r', justificativa: 'j' }] }),
    ).not.toThrow();
    expect(() =>
      CONTRATO_CONTRACAPA.zod.parse({ titulo_pt: 'A Torre de Bronze', sinopse_pt: 'Verso um.\nVerso dois.' }),
    ).not.toThrow();
  });

  it('contracapa: só o título enviado → sinopse volta null, e os dois campos são anuláveis', () => {
    expect(CONTRATO_CONTRACAPA.zod.parse({ titulo_pt: 'X', sinopse_pt: null }).sinopse_pt).toBeNull();
    // Campo ausente também vira null (modelo que só devolve o que traduziu).
    expect(CONTRATO_CONTRACAPA.zod.parse({ titulo_pt: 'X' }).sinopse_pt).toBeNull();
    const g = paraGemini(CONTRATO_CONTRACAPA.schema);
    expect(g.properties!.sinopse_pt.nullable).toBe(true);
    expect(instrucaoJson(CONTRATO_CONTRACAPA)).toContain('ou null');
  });
});
