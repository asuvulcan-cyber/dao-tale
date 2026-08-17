import { describe, expect, it } from 'vitest';
import type { EntradaGlossario } from '@dao-tale/shared';
import { formatarGlossario } from './prompts.js';

// Fixture local (não reusa a de prompts.test.ts porque esse arquivo não a exporta):
// mesmos valores-padrão de "nunca classificado" usados no resto do sistema desde a
// Task 2, com um terceiro parâmetro para sobrescrever só o que o caso precisa.
const entrada = (termo_zh: string, termo_pt: string, over: Partial<EntradaGlossario> = {}): EntradaGlossario => ({
  id: 0,
  obra_id: 1,
  termo_zh,
  termo_pt,
  categoria: 'termo',
  nota: null,
  origem: 'manual',
  principal_id: null,
  especie: null,
  nota_uso: null,
  ambiguo: false,
  termo_pai_id: null,
  criado_em: '',
  ...over,
});

// Teste 1 (brief Step 1): com todo mundo `especie: null` — os 116 termos da obra real
// hoje —, a saída tem de ser IDÊNTICA à de antes desta task. String fixada, não só
// "não contém cabeçalho": é o que garante que ninguém que nunca usou o recurso vê o
// prompt mudar de uma hora para outra.
describe('formatarGlossario — ninguém classificou nada (especie: null em todos)', () => {
  it('sai como a lista única de sempre, sem cabeçalho de bloco', () => {
    const glossario = [
      entrada('齐夏', 'Qi Xia', { categoria: 'personagem' }),
      entrada('终焉', 'Fim', { categoria: 'termo', nota: 'o evento central da obra' }),
    ];
    expect(formatarGlossario(glossario)).toBe(
      '齐夏 → Qi Xia [personagem]\n终焉 → Fim [termo] — o evento central da obra',
    );
  });

  it('glossário vazio mantém a mensagem de sempre', () => {
    expect(formatarGlossario([])).toBe('(glossário ainda vazio)');
  });
});

describe('formatarGlossario — dois blocos quando há espécie mista', () => {
  it('emite os dois cabeçalhos, cada termo sob o seu', () => {
    const glossario = [
      entrada('金鹏堡', 'Fortaleza do Peng Dourado', { especie: 'identidade' }),
      entrada('刀', 'sabre', { especie: 'lexical' }),
    ];
    const saida = formatarGlossario(glossario);
    const idxCabecIdentidade = saida.indexOf('### Nomes e termos fixos');
    const idxCabecLexical = saida.indexOf('### Escolhas de palavra');
    const idxFortaleza = saida.indexOf('金鹏堡 → Fortaleza do Peng Dourado');
    const idxSabre = saida.indexOf('刀 → sabre');
    expect(idxCabecIdentidade).toBeGreaterThanOrEqual(0);
    expect(idxCabecLexical).toBeGreaterThanOrEqual(0);
    // cada termo cai DEPOIS do cabeçalho do bloco certo, não misturado no outro
    expect(idxFortaleza).toBeGreaterThan(idxCabecIdentidade);
    expect(idxFortaleza).toBeLessThan(idxCabecLexical);
    expect(idxSabre).toBeGreaterThan(idxCabecLexical);
  });
});

// Teste 3 do brief: os dois cabeçalhos mandam coisas opostas. Asserta pelo CONTEÚDO da
// instrução (o texto literal do brief), não só pela presença de um cabeçalho qualquer —
// senão o teste passaria mesmo com os dois blocos dizendo a mesma coisa.
describe('formatarGlossario — instrução oposta por espécie', () => {
  it('identidade manda usar a forma exata; lexical manda flexionar', () => {
    const glossario = [
      entrada('金鹏堡', 'Fortaleza do Peng Dourado', { especie: 'identidade' }),
      entrada('刀', 'sabre', { especie: 'lexical' }),
    ];
    const saida = formatarGlossario(glossario);
    expect(saida).toContain('### Nomes e termos fixos (use exatamente esta forma, maiúsculas inclusive)');
    expect(saida).toContain(
      '### Escolhas de palavra (use esta palavra; flexione número, gênero e caixa como o português pedir)',
    );
  });
});

describe('formatarGlossario — nota_uso na linha do termo', () => {
  it('sai junto do termo que a tem; termo sem nota_uso não ganha linha vazia nem sufixo', () => {
    const glossario = [
      entrada('刀', 'sabre', { especie: 'lexical' }),
      entrada('杀手', 'Assassino', {
        especie: 'lexical',
        nota_uso: 'Maiúscula só quando for o posto na Fortaleza do Peng Dourado.',
      }),
    ];
    const saida = formatarGlossario(glossario);
    // Recorta só o bloco lexical (até a próxima quebra dupla) e fixa as duas linhas
    // inteiras — prova que 刀 (sem nota_uso) não ganhou sufixo nem linha em branco.
    const blocoLexical = saida.slice(saida.indexOf('### Escolhas de palavra')).split('\n\n')[0];
    expect(blocoLexical.split('\n')).toEqual([
      '### Escolhas de palavra (use esta palavra; flexione número, gênero e caixa como o português pedir)',
      '刀 → sabre [termo]',
      '杀手 → Assassino [termo] · nota de uso: Maiúscula só quando for o posto na Fortaleza do Peng Dourado.',
    ]);
  });
});

// Teste 4b do brief: a nota NÃO é regra de tradução do sentido comum — ela só diz QUANDO
// aquele termo se aplica. O usuário rejeitou "senão é 'cuidado'" como exemplo porque
// fixaria uma palavra fora do glossário (glossário clandestino, sem passar por `especie`
// nem pela varredura). Este teste fixa a frase da instrução que comunica isso ao modelo.
describe('formatarGlossario — a instrução sobre nota_uso não prescreve o sentido comum', () => {
  const FRASE_INSTRUCAO =
    'A nota de um termo delimita SÓ QUANDO ele se aplica — não é tradução do sentido comum da palavra nos demais casos; esses ficam livres.';

  it('aparece quando algum termo tem nota_uso', () => {
    const glossario = [
      entrada('刀', 'sabre', { especie: 'lexical' }),
      entrada('小心', 'Xiao Xin', {
        especie: 'identidade',
        ambiguo: true,
        nota_uso: 'Só é a criada Xiao Xin quando for nome de pessoa; nos demais usos é substantivo comum.',
      }),
    ];
    expect(formatarGlossario(glossario)).toContain(FRASE_INSTRUCAO);
  });

  it('some quando nenhum termo tem nota_uso — não gasta token à toa', () => {
    const glossario = [
      entrada('金鹏堡', 'Fortaleza do Peng Dourado', { especie: 'identidade' }),
      entrada('刀', 'sabre', { especie: 'lexical' }),
    ];
    expect(formatarGlossario(glossario)).not.toContain(FRASE_INSTRUCAO);
  });
});

// Teste 5 do brief pede o OPOSTO do que está escrito nele ("nota_uso em identidade é
// ignorada"): a instrução do coordenador é explícita e cita a razão — 小心 é `identidade`
// E ambíguo ao mesmo tempo, e sem a nota emitida o modelo não tem como saber que 7 das 8
// ocorrências do gatilho chinês NÃO são a personagem. O spec (§2b, teste 5) confirma:
// "nota_uso vale nas duas espécies". Implementado (e testado) como o spec manda, não como
// o item 5 do brief está redigido — a contradição está reportada no relatório da task.
describe('formatarGlossario — nota_uso vale nas duas espécies (identidade inclusive)', () => {
  it('um termo identidade e ambíguo emite a nota_uso, não a esconde', () => {
    const glossario = [
      entrada('刀', 'sabre', { especie: 'lexical' }), // só para o glossário ter espécie mista e os blocos aparecerem
      entrada('小心', 'Xiao Xin', {
        especie: 'identidade',
        ambiguo: true,
        nota_uso: 'Só é a criada Xiao Xin quando for nome de pessoa; nos demais usos é substantivo comum.',
      }),
    ];
    const saida = formatarGlossario(glossario);
    const blocoIdentidade = saida.slice(saida.indexOf('### Nomes e termos fixos'), saida.indexOf('### Escolhas de palavra'));
    expect(blocoIdentidade).toContain(
      '小心 → Xiao Xin [termo] · nota de uso: Só é a criada Xiao Xin quando for nome de pessoa; nos demais usos é substantivo comum.',
    );
  });
});

describe('formatarGlossario — variante (principal_id) segue funcionando nas duas espécies', () => {
  it('identidade: a variante aponta para a canônica', () => {
    const canonica = entrada('林芊', 'Lin Qian', { id: 1, especie: 'identidade' });
    const variante = entrada('芊芊', 'Qianqian', { id: 2, especie: 'identidade', principal_id: 1 });
    // 刀 só está aqui para o glossário ter espécie mista e o bloco de identidade aparecer.
    const glossario = [canonica, variante, entrada('刀', 'sabre', { id: 3, especie: 'lexical' })];
    expect(formatarGlossario(glossario)).toContain('芊芊 → Qianqian [termo] · variante de Lin Qian (林芊)');
  });

  it('lexical: a variante aponta para a canônica', () => {
    const canonica = entrada('喽罗', 'capangas', { id: 1, especie: 'lexical' });
    const variante = entrada('喽啰', 'capangas', { id: 2, especie: 'lexical', principal_id: 1 });
    expect(formatarGlossario([canonica, variante])).toContain('喽啰 → capangas [termo] · variante de capangas (喽罗)');
  });
});
