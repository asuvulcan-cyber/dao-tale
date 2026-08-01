import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, type BancoDados } from './index.js';
import { exportarObra, importarObra, type ExportObra } from './portabilidade.js';

// Round-trip do export com o schema pós-Passos 2/3 (doc 10 §4): prompt delta,
// status 'parcial', fase_traducao. Um import→export deve ser ponto fixo.

let db: BancoDados;

beforeEach(() => {
  db = abrirBanco(':memory:');
});

// Fixture cobrindo os campos novos, com chaves naturais consistentes.
function fixture(): ExportObra {
  return {
    formato: 'dao-tale-export',
    versao_schema: 1,
    exportado_em: '2026-07-23T00:00:00.000Z',
    obra: {
      titulo: 'Dez Dias Até o Fim',
      titulo_original: '十日终焉',
      autor: '杀虫队队员',
      sinopse: 'Sinopse de teste.',
      tags: ['xianxia', 'sombrio'],
      capa_base64: null,
      capa_mime: null,
      provedor_padrao: 'gemini',
      modelo_padrao: 'gemini-flash-latest',
      fase_traducao: 'cruzeiro',
    },
    prompts: [
      {
        versao: '1.0',
        conteudo: 'Núcleo universal.',
        notas_versao: 'inicial',
        ativo: false,
        tipo: 'completo',
        criado_em: '2026-07-20T00:00:00.000Z',
      },
      {
        versao: '2.0',
        conteudo: 'Delta desta obra.',
        notas_versao: 'delta',
        ativo: true,
        tipo: 'delta',
        criado_em: '2026-07-21T00:00:00.000Z',
      },
    ],
    capitulos: [
      {
        numero: 118,
        titulo: '第一章',
        titulo_pt: 'Capítulo Um',
        status: 'parcial',
        texto_origem: '原文。',
        provedor: 'gemini',
        modelo: 'gemini-flash-latest',
        prompt_versao: '2.0',
        criado_em: '2026-07-21T10:00:00.000Z',
        frases: [
          {
            ordem: 0,
            paragrafo: 0,
            texto_zh: '原文一。',
            texto_pt: 'Texto um.',
            texto_pt_original_ia: 'Texto um (IA).',
            editado_manualmente: true,
            status_traducao: 'traduzida',
          },
          {
            ordem: 1,
            paragrafo: 0,
            texto_zh: '原文二。',
            texto_pt: '',
            texto_pt_original_ia: null,
            editado_manualmente: false,
            status_traducao: 'erro',
          },
        ],
      },
    ],
    glossario: [
      {
        termo_zh: '终焉',
        termo_pt: 'Fim Derradeiro',
        categoria: 'outro',
        nota: null,
        origem: 'manual',
        criado_em: '2026-07-20T12:00:00.000Z',
      },
    ],
    termos_sugeridos: [
      {
        capitulo_numero: 118,
        termo_zh: '主角',
        termo_pt: 'Protagonista',
        categoria: 'personagem',
        contexto: 'contexto',
        status: 'pendente',
        criado_em: '2026-07-21T11:00:00.000Z',
      },
    ],
    banco_testes: [
      {
        capitulo_numero: 118,
        frase_ordem: 0,
        trecho_zh: '原文一',
        pergunta: 'Está fiel?',
        veredito: 'correto',
        justificativa: 'Sim.',
        secao_regra: null,
        correcao_proposta: null,
        status: 'confirmado',
        provedor: 'gemini',
        modelo: 'gemini-flash-latest',
        resposta_bruta: '{}',
        criado_em: '2026-07-21T12:00:00.000Z',
      },
    ],
  };
}

const semTimestamp = (e: ExportObra) => ({ ...e, exportado_em: '<ignorado>' });

describe('portabilidade — round-trip com schema novo', () => {
  it('import → export é ponto fixo (inclui fase_traducao, delta e parcial)', () => {
    const importado = importarObra(db, fixture());
    expect('erro' in importado).toBe(false);
    if ('erro' in importado) return;

    const exp1 = exportarObra(db, importado.id)!;
    // Campos novos preservados.
    expect(exp1.obra.fase_traducao).toBe('cruzeiro');
    expect(exp1.obra.autor).toBe('杀虫队队员'); // migração 011 (doc 12 §4)
    expect(exp1.capitulos[0].status).toBe('parcial');
    expect(exp1.prompts.find((p) => p.ativo)?.tipo).toBe('delta');

    // Reimporta o que exportamos e reexporta — deve bater byte a byte (menos o carimbo).
    const reimportado = importarObra(db, exp1);
    expect('erro' in reimportado).toBe(false);
    if ('erro' in reimportado) return;
    const exp2 = exportarObra(db, reimportado.id)!;

    expect(semTimestamp(exp2)).toEqual(semTimestamp(exp1));
  });

  it('B4: dois prompts ativos viram erro amigável, não 500', () => {
    const ruim = fixture();
    ruim.prompts[0].ativo = true; // agora dois ativos
    const r = importarObra(db, ruim);
    expect('erro' in r).toBe(true);
    if ('erro' in r) expect(r.erro).toMatch(/ativo/i);
  });

  it('export antigo sem fase_traducao assume calibração (retrocompat)', () => {
    const antigo: any = fixture();
    delete antigo.obra.fase_traducao;
    const r = importarObra(db, antigo);
    expect('erro' in r).toBe(false);
    if ('erro' in r) return;
    expect(exportarObra(db, r.id)!.obra.fase_traducao).toBe('calibracao');
  });
});
