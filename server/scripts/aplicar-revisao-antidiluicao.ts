// Aplicação única e idempotente do relatório de 2026-08-18.
// Cria Alfa 6.0/6.1 e Delta 2.1/2.2, move equivalências para o Gama e corrige somente
// trechos cujo estado anterior coincide byte a byte com o auditado.

import Database from 'better-sqlite3';
import path from 'node:path';
import { caminhoBanco } from '../src/config.js';
import { NUCLEO_ANTI_DILUICAO, NUCLEO_ANTI_DILUICAO_V2 } from '../src/db/promptPadraoInicial.js';

const arquivo = caminhoBanco();
const db = new Database(arquivo, { fileMustExist: true });
db.pragma('foreign_keys = ON');

const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(path.dirname(arquivo), 'backups', `pre-antidiluicao-${carimbo}.db`);
await db.backup(backup);
const copia = new Database(backup, { readonly: true, fileMustExist: true });
const integridade = copia.pragma('integrity_check')[0]?.integrity_check;
const frasesBackup = (copia.prepare("SELECT COUNT(*) n FROM frases WHERE texto_pt <> ''").get() as { n: number }).n;
copia.close();
if (integridade !== 'ok') throw new Error(`backup inválido: integrity_check=${integridade}`);

type Correcao = { capitulo: number; ordem: number; antes: string; depois: string };
const correcoes: Correcao[] = [
  {
    capitulo: 0,
    ordem: 66,
    antes:
      'Aquela era sua primeira missão liderando um grupo sozinho; em tese, isso marcaria que, dali em diante, ele poderia estabelecer o próprio núcleo como os irmãos mais velhos. Agora, ele tinha perdido a mão direita, tinha arruinado mais da metade de sua arte marcial e, acima de tudo, tinha perdido por completo a honra.',
    depois:
      'Aquela era sua primeira missão liderando um grupo sozinho; em tese, isso marcaria que, dali em diante, ele poderia estabelecer o próprio núcleo como os irmãos mais velhos. Agora, estava sem a mão direita, com mais da metade de sua arte marcial arruinada e, acima de tudo, sem honra nenhuma.',
  },
  {
    capitulo: 1,
    ordem: 0,
    antes:
      'Todo animal selvagem passa por um período constrangedor: já é forte o bastante para sobreviver sozinho, mas ainda anseia pelos cuidados e pelo leite da mãe, acreditando ingenuamente que a vida deveria ser sempre assim, e por isso gasta o excesso de energia rolando na grama e brincando com insetos. Às vezes, até surge uma cena curiosa: um filhote de leopardo maior que a própria mãe, deitado preguiçosamente na relva, tomando sol, esperando com paciência o almoço chegar sozinho à sua boca, sem imaginar que esses dias felizes estão prestes a acabar. Quando a mãe decide engravidar de novo, o queridinho do céu se transforma num abandonado desamparado, obrigado a vagar sozinho pelo mundo. Cada caçada difícil apaga um pouco da memória inocente do passado, até que, no fim, ou morre de forma miserável, ou se torna um assassino frio e implacável.',
    depois:
      'Todo animal selvagem passa por uma fase ingrata: já é forte o bastante para sobreviver sozinho, mas ainda anseia pelos cuidados e pelo leite da mãe, acreditando ingenuamente que a vida deveria ser sempre assim, e por isso gasta o excesso de energia rolando na grama e brincando com insetos. Às vezes, até surge uma cena curiosa: um filhote de leopardo maior que a própria mãe, deitado preguiçosamente na relva, tomando sol, esperando com paciência o almoço chegar sozinho à sua boca, sem imaginar que esses dias felizes estão prestes a acabar. Quando a mãe decide engravidar de novo, o queridinho do céu se transforma num enjeitado, obrigado a vagar sozinho pelo mundo. Cada caçada difícil apaga um pouco da memória inocente do passado, até que, no fim, ou morre de forma miserável, ou se torna um assassino frio e implacável.',
  },
  {
    capitulo: 9,
    ordem: 18,
    antes: '"Ah, eu estava fazendo isso por vocês — é impossível fugir; vocês só seriam pegos e mortos."',
    depois: '"Ah, eu estava fazendo isso por vocês — é impossível fugir; vocês só seriam pegos e mortos.',
  },
  {
    capitulo: 14,
    ordem: 25,
    antes:
      'Embora tivesse só quatorze anos, quando estava nas Planícies Centrais já tinha ouvido falar vagamente de casos de catamitos((Catamito refere-se historicamente a um jovem rapaz mantido como companheiro íntimo ou amante por um homem mais velho.)); nunca entendeu ao certo o significado do termo, mas sabia que era uma coisa muito suja e perversa.',
    depois:
      'Embora tivesse só quatorze anos, quando estava nas Planícies Centrais já tinha ouvido falar vagamente de meninos usados por homens; nunca entendeu ao certo o significado do termo, mas sabia que era uma coisa muito suja e perversa.',
  },
  {
    capitulo: 16,
    ordem: 11,
    antes:
      'Além disso, em menos de meio mês Han Shiqi, que o reconhecia, estaria de volta — e já o tinha "designado\'\' para lhe fazer companhia à noite.',
    depois:
      'Além disso, em menos de meio mês Han Shiqi, que o reconhecia, estaria de volta — e já o tinha "designado" para lhe fazer companhia à noite.',
  },
  {
    capitulo: 17,
    ordem: 33,
    antes:
      '"Shh, foi por acaso. No começo eu não sabia; quando ele pegou no sabre, percebi. Cada pessoa tem um jeito próprio de segurar o sabre. Esse Liu Xuan tem pouca habilidade marcial, mas gosta de se exibir; antes de segurar o sabre, ele sempre levanta a mão direita e a sacode. Sorte a dele; se tivesse encontrado um verdadeiro mestre, morreria só no tempo que leva para sacudir a mão.',
    depois:
      '"Shh, foi por acaso. No começo eu não sabia; quando ele pegou no sabre, percebi. Cada pessoa tem um jeito próprio de segurar o sabre. Esse Liu Xuan tem pouca habilidade marcial, mas gosta de se exibir; antes de segurar o sabre, ele sempre levanta a mão direita e a sacode. Sorte a dele; se tivesse encontrado um verdadeiro mestre, morreria só no tempo que leva para sacudir a mão."',
  },
  {
    capitulo: 17,
    ordem: 69,
    antes: '"Vai se foder", disse ele, e se virou para voltar ao pequeno pátio.',
    depois: '"Morra", disse ele, e se virou para voltar ao pequeno pátio.',
  },
];

const selecionarFrase = db.prepare(
  `SELECT f.id, f.texto_pt
     FROM frases f JOIN capitulos c ON c.id = f.capitulo_id
    WHERE c.obra_id = 1 AND c.numero = ? AND f.ordem = ?`,
);
const atualizarFrase = db.prepare(
  `UPDATE frases
      SET texto_pt = ?, editado_manualmente = 1, origem_edicao = NULL, edicao_tratada_texto = NULL
    WHERE id = ?`,
);

const aplicar = db.transaction(() => {
  let frasesAlteradas = 0;
  for (const c of correcoes) {
    const atual = selecionarFrase.get(c.capitulo, c.ordem) as { id: number; texto_pt: string } | undefined;
    if (!atual) throw new Error(`frase inexistente: ${c.capitulo}.${c.ordem}`);
    if (atual.texto_pt === c.depois) continue;
    if (atual.texto_pt !== c.antes) throw new Error(`texto divergente: ${c.capitulo}.${c.ordem}`);
    atualizarFrase.run(c.depois, atual.id);
    db.prepare(
      `UPDATE capitulos SET atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = (SELECT capitulo_id FROM frases WHERE id = ?)`,
    ).run(atual.id);
    frasesAlteradas++;
  }

  const alfaExistente = db.prepare('SELECT id, conteudo FROM prompt_padrao WHERE versao = ?').get('6.0') as
    | { id: number; conteudo: string }
    | undefined;
  if (alfaExistente && alfaExistente.conteudo !== NUCLEO_ANTI_DILUICAO)
    throw new Error('Alfa 6.0 já existe com conteúdo diferente');
  if (!alfaExistente) {
    db.prepare(
      `INSERT INTO prompt_padrao (versao, conteudo, notas_versao, ativo)
       VALUES (?, ?, ?, 0)`,
    ).run(
      '6.0',
      NUCLEO_ANTI_DILUICAO,
      'Antidiluição: Alfa universal curto, Beta compacta opt-in, Gama explícito e checklist final por recência.',
    );
  }
  const alfa = db.prepare('SELECT id FROM prompt_padrao WHERE versao = ?').get('6.0') as { id: number };

  const alfaV2Existente = db.prepare('SELECT id, conteudo FROM prompt_padrao WHERE versao = ?').get('6.1') as
    | { id: number; conteudo: string }
    | undefined;
  if (alfaV2Existente && alfaV2Existente.conteudo !== NUCLEO_ANTI_DILUICAO_V2)
    throw new Error('Alfa 6.1 já existe com conteúdo diferente');
  if (!alfaV2Existente) {
    db.prepare(
      `INSERT INTO prompt_padrao (versao, conteudo, notas_versao, ativo)
       VALUES (?, ?, ?, 0)`,
    ).run(
      '6.1',
      NUCLEO_ANTI_DILUICAO_V2,
      'Explicita a convenção de aspas em fala contínua por vários parágrafos, sem alterar o Alfa 6.0.',
    );
  }
  const alfaV2 = db.prepare('SELECT id FROM prompt_padrao WHERE versao = ?').get('6.1') as { id: number };

  const delta =
    '- Na Fortaleza do Peng Dourado, Homem de Sabre, Assassino e Espectro são postos formais. Preserve essas categorias quando designarem o posto; não as substitua por sinônimo genérico.';
  const prefs = (db.prepare('SELECT preferencias FROM prompts WHERE obra_id = 1 AND ativo = 1').get() as {
    preferencias: string | null;
  }).preferencias;
  const deltaExistente = db.prepare('SELECT id, conteudo, nucleo_id FROM prompts WHERE obra_id = 1 AND versao = ?').get(
    '2.1',
  ) as { id: number; conteudo: string; nucleo_id: number } | undefined;
  if (deltaExistente && (deltaExistente.conteudo !== delta || deltaExistente.nucleo_id !== alfa.id))
    throw new Error('Delta 2.1 já existe com conteúdo diferente');
  if (!deltaExistente) {
    db.prepare(
      `INSERT INTO prompts (obra_id, versao, conteudo, notas_versao, ativo, tipo, nucleo_id, preferencias)
       VALUES (1, '2.1', ?, ?, 0, 'delta', ?, ?)`,
    ).run(
      delta,
      'Antidiluição: somente a particularidade dos postos da Fortaleza; equivalências individuais migradas para o Gama.',
      alfa.id,
      prefs,
    );
  }

  const deltaV2Existente = db.prepare('SELECT id, conteudo, nucleo_id FROM prompts WHERE obra_id = 1 AND versao = ?').get(
    '2.2',
  ) as { id: number; conteudo: string; nucleo_id: number } | undefined;
  if (deltaV2Existente && (deltaV2Existente.conteudo !== delta || deltaV2Existente.nucleo_id !== alfaV2.id))
    throw new Error('Delta 2.2 já existe com conteúdo diferente');
  if (!deltaV2Existente) {
    db.prepare(
      `INSERT INTO prompts (obra_id, versao, conteudo, notas_versao, ativo, tipo, nucleo_id, preferencias)
       VALUES (1, '2.2', ?, ?, 0, 'delta', ?, ?)`,
    ).run(
      delta,
      'Mesmo Delta específico da 2.1; nova versão imutável para associar o Alfa 6.1.',
      alfaV2.id,
      prefs,
    );
  }

  const termos = [
    ['少年', 'garoto', 'outro', 'lexical', 'Quando se referir aos aprendizes ou jovens da Fortaleza; flexione normalmente.'],
    ['红木', 'pau-rosa', 'outro', 'lexical', 'Madeira; não usar “madeira vermelha”.'],
    ['小崽子', 'pirralho', 'outro', 'lexical', 'Insulto coloquial; preserve número e gênero pedidos pelo contexto.'],
    ['无耻', 'canalha', 'outro', 'lexical', 'Quando funcionar como insulto dirigido a alguém; em uso descritivo, traduza pelo contexto.'],
    ['功夫', 'técnica de combate', 'poder-habilidade', 'lexical', 'Quando se referir a habilidade ou prática marcial; não usar “kung fu”.'],
  ] as const;
  const inserirTermo = db.prepare(
    `INSERT INTO glossario (obra_id, termo_zh, termo_pt, categoria, nota, origem, especie, nota_uso, ambiguo)
     VALUES (1, ?, ?, ?, NULL, 'manual', ?, ?, ?)`,
  );
  for (const [zh, pt, categoria, especie, notaUso] of termos) {
    const existente = db.prepare('SELECT termo_pt FROM glossario WHERE obra_id = 1 AND termo_zh = ?').get(zh) as
      | { termo_pt: string }
      | undefined;
    if (existente && existente.termo_pt !== pt) throw new Error(`Gama divergente: ${zh} → ${existente.termo_pt}`);
    if (!existente) inserirTermo.run(zh, pt, categoria, especie, notaUso, ['少年', '无耻', '功夫'].includes(zh) ? 1 : 0);
  }

  db.prepare('UPDATE prompt_padrao SET ativo = CASE WHEN versao = ? THEN 1 ELSE 0 END').run('6.1');
  db.prepare('UPDATE prompts SET ativo = CASE WHEN obra_id = 1 AND versao = ? THEN 1 ELSE 0 END WHERE obra_id = 1').run(
    '2.2',
  );
  return { frasesAlteradas };
});

try {
  const resultado = aplicar();
  const alfa = db.prepare('SELECT versao, length(conteudo) chars FROM prompt_padrao WHERE ativo = 1').get();
  const delta = db.prepare('SELECT versao, length(conteudo) chars FROM prompts WHERE obra_id = 1 AND ativo = 1').get();
  const gama = (db.prepare('SELECT COUNT(*) n FROM glossario WHERE obra_id = 1').get() as { n: number }).n;
  console.log(JSON.stringify({ backup, integridade, frasesBackup, ...resultado, alfa, delta, gama }, null, 2));
} finally {
  db.close();
}
