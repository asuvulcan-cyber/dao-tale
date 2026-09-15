import { describe, expect, it } from 'vitest';
import { abrirBanco } from './index.js';
import { reposCapitulos, reposFrases, reposObras } from './repos.js';
import { reposRevisaoLiteraria } from './revisaoLiteraria.js';

function cenario() {
  const db = abrirBanco(':memory:');
  const obra = reposObras.criar(db, { titulo: 'Obra' });
  const capitulo = reposCapitulos.criar(db, obra.id, { numero: 1, texto_origem: '甲。' }, [
    { texto_zh: '甲。', paragrafo: 0 },
  ]);
  const [frase] = reposFrases.listarPorCapitulo(db, capitulo.id);
  reposFrases.aplicarTraducaoIa(db, frase.id, 'Texto vigente.');
  const loteId = reposRevisaoLiteraria.criarLote(db, { obraId: obra.id, rotulo: 'Revisão 0–17' });
  const proposta = reposRevisaoLiteraria.propor(db, {
    loteId,
    fraseId: frase.id,
    textoRevisado: 'Texto literariamente revisado.',
    justificativa: 'Fluidez.',
    categorias: ['ritmo'],
  });
  return { db, capitulo, frase, proposta };
}

describe('staging de revisão literária', () => {
  it('lista sempre na ordem narrativa, não pela data de criação da proposta', () => {
    const { db, capitulo, frase } = cenario();
    const segunda = db.prepare(`
      INSERT INTO frases (capitulo_id, ordem, paragrafo, texto_zh, texto_pt, texto_pt_original_ia, status_traducao)
      VALUES (?, 1, 0, '乙。', 'Segunda.', 'Segunda IA.', 'traduzida')
    `).run(capitulo.id).lastInsertRowid;
    const loteId = reposRevisaoLiteraria.criarLote(db, { obraId: capitulo.obra_id, rotulo: 'Outro lote' });
    reposRevisaoLiteraria.propor(db, { loteId, fraseId: Number(segunda), textoRevisado: 'Segunda revisada.' });
    reposRevisaoLiteraria.propor(db, { loteId, fraseId: frase.id, textoRevisado: 'Primeira revisada.' });
    expect(reposRevisaoLiteraria.listarPorCapitulo(db, capitulo.id).map((r) => r.ordem)).toEqual([0, 0, 1]);
  });

  it('mantém a proposta separada até a aprovação explícita', () => {
    const { db, frase, proposta } = cenario();
    expect(reposFrases.obter(db, frase.id)!.texto_pt).toBe('Texto vigente.');
    expect(proposta.texto_vigente_base).toBe('Texto vigente.');
    expect(proposta.texto_pt_original_ia).toBe('Texto vigente.');
    expect(proposta.texto_revisado).toBe('Texto literariamente revisado.');
    expect(proposta.categorias).toEqual(['ritmo']);

    const aprovada = reposRevisaoLiteraria.decidir(db, proposta.id, 'aprovar');
    expect(aprovada).not.toBe('conflito');
    expect(reposFrases.obter(db, frase.id)).toMatchObject({
      texto_pt: 'Texto literariamente revisado.',
      editado_manualmente: true,
      origem_edicao: 'revisao-literaria',
    });
  });

  it('não sobrescreve edição posterior à proposta', () => {
    const { db, frase, proposta } = cenario();
    reposFrases.editarTexto(db, frase.id, 'Edição humana posterior.');

    expect(reposRevisaoLiteraria.decidir(db, proposta.id, 'aprovar')).toBe('conflito');
    expect(reposFrases.obter(db, frase.id)!.texto_pt).toBe('Edição humana posterior.');
    expect(reposRevisaoLiteraria.obter(db, proposta.id)!.status).toBe('conflito');
  });

  it('editar uma proposta em conflito atualiza sua base sem publicar', () => {
    const { db, frase, proposta } = cenario();
    reposFrases.editarTexto(db, frase.id, 'Nova base humana.');
    expect(reposRevisaoLiteraria.decidir(db, proposta.id, 'aprovar')).toBe('conflito');

    const atualizada = reposRevisaoLiteraria.editarProposta(db, proposta.id, {
      textoRevisado: 'Revisão sobre a nova base.',
      categorias: ['clareza'],
    })!;
    expect(atualizada.status).toBe('pendente');
    expect(atualizada.texto_vigente_base).toBe('Nova base humana.');
    expect(reposFrases.obter(db, frase.id)!.texto_pt).toBe('Nova base humana.');
  });
});
