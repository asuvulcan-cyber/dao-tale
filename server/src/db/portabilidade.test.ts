import { beforeEach, describe, expect, it } from 'vitest';
import type { CasoTeste } from '@dao-tale/shared';
import { abrirBanco, type BancoDados } from './index.js';
import { reposCapitulos, reposFrases, reposObras, reposTestes } from './repos.js';
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
      titulo: 'A Torre de Bronze',
      titulo_original: '青铜塔',
      autor: '杀虫队队员',
      sinopse: 'Sinopse de teste.',
      tags: ['xianxia', 'sombrio'],
      capa_base64: null,
      capa_mime: null,
      provedor_padrao: 'gemini',
      modelo_padrao: 'gemini-flash-latest',
      // Override de amostragem da obra (doc 08 §13) — decisão do usuário, viaja no export.
      temperatura: 0.2,
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

const semTimestamp = (e: ExportObra) => ({
  ...e,
  exportado_em: '<ignorado>',
  // id/caso_pai_id de banco_testes são remapeados a cada import (Task 8) — comparar
  // o valor literal faria o ponto fixo falhar mesmo com o fio intacto, porque a
  // segunda importação cai numa obra nova com ids novos por definição.
  banco_testes: e.banco_testes.map(({ id: _id, caso_pai_id: _caso_pai_id, ...resto }) => resto),
});

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

  // TAREFA EXTRA (achado da revisão da Task 6): exportSchema valida secao_regra
  // como string solta, sem normalizar, e a importação faz INSERT cru. Um export
  // gerado ANTES da migração 022 ainda tem 'geral' gravado literalmente — a
  // migração só limpou o banco existente, não os arquivos já exportados.
  // Reimportá-lo sem normalizar reintroduziria o valor de fuga, que volta a
  // vazar em recorrencias()/rotulosDeRegra() como se dúvidas sem relação fossem
  // uma lacuna sistemática, desfazendo o conserto da migração 022.
  it('normaliza secao_regra legado ("geral", vazio, só espaços) para NULL na importação', () => {
    const dados = fixture();
    const base = dados.banco_testes[0];
    dados.banco_testes = [
      { ...base, secao_regra: 'geral' },
      { ...base, secao_regra: 'GERAL' },
      { ...base, secao_regra: '   ' },
      { ...base, secao_regra: '' },
      { ...base, secao_regra: 'regra real' },
    ];
    const r = importarObra(db, dados);
    expect('erro' in r).toBe(false);
    if ('erro' in r) return;
    const casos = db
      .prepare('SELECT secao_regra FROM banco_testes WHERE obra_id = ? ORDER BY id')
      .all(r.id) as { secao_regra: string | null }[];
    expect(casos.map((c) => c.secao_regra)).toEqual([null, null, null, null, 'regra real']);
  });
});

describe('portabilidade — fio de réplicas (Task 8)', () => {
  // Setup próprio: os testes de fio criam casos direto via reposTestes (não pela
  // fixture JSON), porque o que se quer exercitar é o REMAPEAMENTO de id que só
  // acontece com um fio de verdade (pai → filho → neto) já no banco de origem.
  let obraId: number;
  let fraseId: number;

  beforeEach(() => {
    obraId = reposObras.criar(db, { titulo: 'Obra com fio' }).id;
    const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '甲说。' }, [
      { texto_zh: '甲说。', paragrafo: 0 },
    ]);
    fraseId = reposFrases.listarPorCapitulo(db, cap.id)[0].id;
  });

  function criarCaso({ pergunta, pai }: { pergunta: string; pai: number | null }): CasoTeste {
    return reposTestes.criar(db, {
      frase_id: fraseId,
      obra_id: obraId,
      caso_pai_id: pai,
      trecho_zh: '甲',
      pergunta,
      veredito: 'incorreto',
      resposta: `resposta de ${pergunta}`,
      justificativa: '',
      secao_regra: null,
      correcao_proposta: null,
      trecho_pt_errado: null,
      trecho_pt_corrigido: null,
      motivo_rejeicao: null,
      provedor: 'mock',
      modelo: 'mock-v1',
      resposta_bruta: '{}',
    });
  }

  it('preserva o fio de réplicas ao exportar e reimportar', () => {
    // Os casos ganham id NOVO na importação: sem remapear, o caso_pai_id aponta
    // para outro caso — possivelmente de outra obra. É o defeito mais silencioso
    // deste trabalho.
    const a = criarCaso({ pergunta: 'primeira', pai: null });
    const b = criarCaso({ pergunta: 'segunda', pai: a.id });
    criarCaso({ pergunta: 'terceira', pai: b.id });

    const dados = exportarObra(db, obraId);
    expect(dados).toBeDefined();
    const nova = importarObra(db, dados!);
    expect('erro' in nova).toBe(false);
    if ('erro' in nova) return;

    const casos = db
      .prepare('SELECT * FROM banco_testes WHERE obra_id = ? ORDER BY criado_em, id')
      .all(nova.id) as CasoTeste[];
    expect(casos).toHaveLength(3);
    expect(casos[0].caso_pai_id).toBeNull();
    expect(casos[1].caso_pai_id).toBe(casos[0].id);
    expect(casos[2].caso_pai_id).toBe(casos[1].id);
    // E nenhum aponta para a obra original.
    expect(casos.every((c) => c.id !== a.id && c.caso_pai_id !== a.id)).toBe(true);
  });

  it('importa export antigo, sem os campos novos', () => {
    criarCaso({ pergunta: 'única', pai: null });
    const dados = exportarObra(db, obraId);
    expect(dados).toBeDefined();
    for (const c of dados!.banco_testes) {
      delete (c as Record<string, unknown>).id;
      delete (c as Record<string, unknown>).caso_pai_id;
      delete (c as Record<string, unknown>).resposta;
      delete (c as Record<string, unknown>).motivo_rejeicao;
    }
    const nova = importarObra(db, dados!);
    expect('erro' in nova).toBe(false);
    if ('erro' in nova) return;
    const casos = db.prepare('SELECT * FROM banco_testes WHERE obra_id = ?').all(nova.id) as CasoTeste[];
    // Sem `resposta` no arquivo, ela recebe a justificativa: o texto que existe.
    expect(casos[0].resposta).toBe(casos[0].justificativa);
    expect(casos[0].caso_pai_id).toBeNull();
  });

  it('export parcial (pai fora do arquivo) faz o filho virar raiz, não apontar para id qualquer', () => {
    const a = criarCaso({ pergunta: 'primeira', pai: null });
    const b = criarCaso({ pergunta: 'segunda', pai: a.id });
    const dados = exportarObra(db, obraId)!;
    // Simula export parcial: só o filho viaja, o pai ficou de fora.
    dados.banco_testes = dados.banco_testes.filter((c) => c.id === b.id);

    const nova = importarObra(db, dados);
    expect('erro' in nova).toBe(false);
    if ('erro' in nova) return;
    const casos = db.prepare('SELECT * FROM banco_testes WHERE obra_id = ?').all(nova.id) as CasoTeste[];
    expect(casos).toHaveLength(1);
    expect(casos[0].caso_pai_id).toBeNull();
  });
});
