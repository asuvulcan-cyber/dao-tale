import Database from 'better-sqlite3';
import { caminhoBanco } from '../src/config.js';
import { recalcularConsistenciaDaObra } from '../src/db/repos.js';

type Correcao = { capitulo: number; ordem: number; antes: string; depois: string; motivo: string };

const correcoes: Correcao[] = [
  {
    capitulo: 8,
    ordem: 74,
    antes: 'O Deus Cabeçudo levou boa parte de seus homens. Entre os que ficaram predominavam trabalhadores braçais sem habilidade marcial, e ninguém jamais destacou um guarda só para os dez garotos. Além disso, a Cidade de Jade ficava a poucos quilômetros do acampamento e oferecia o lugar perfeito para desaparecer dos perseguidores.',
    depois: 'O Deus Cabeçudo levou boa parte de seus homens. Entre os que ficaram predominavam serviçais sem habilidade marcial, e ninguém jamais destacou um guarda só para os dez garotos. Além disso, a Cidade de Jade ficava a poucos quilômetros do acampamento e oferecia o lugar perfeito para desaparecer dos perseguidores.',
    motivo: 'Padroniza 杂役 como “serviçal”, sem acrescentar trabalho braçal não explicitado.',
  },
  {
    capitulo: 9,
    ordem: 33,
    antes: 'O Deus Cabeçudo precisou se curvar para sair da tenda. Parou à entrada, rugiu outra vez para o céu e seguiu até a tenda principal, pisando como se fosse abrir um buraco no chão a cada passo. Todos em seu caminho — chefes grandes ou pequenos, capangas ou trabalhadores — fugiram para longe. Ninguém ousou se aproximar para acalmá-lo.',
    depois: 'O Deus Cabeçudo precisou se curvar para sair da tenda. Parou à entrada, rugiu outra vez para o céu e seguiu até a tenda principal, pisando como se fosse abrir um buraco no chão a cada passo. Todos em seu caminho — chefes grandes ou pequenos, capangas ou serviçais — fugiram para longe. Ninguém ousou se aproximar para acalmá-lo.',
    motivo: 'Padroniza 杂役 como “serviçal”.',
  },
  {
    capitulo: 10,
    ordem: 45,
    antes: 'Qualquer pessoa com um mínimo de educação evitaria fixar os olhos na mutilação alheia. No acampamento da Montanha de Ferro, porém, educação era ainda mais rara que misericórdia. Depois de examinar a comitiva e o noivo dos pés à cabeça, milhares de olhos convergiram para a mão inutilizada sob a manga.',
    depois: 'Qualquer pessoa com um mínimo de educação evitaria fixar os olhos na mutilação alheia. No acampamento do Bando da Montanha de Ferro, porém, educação era ainda mais rara que misericórdia. Depois de examinar a comitiva e o noivo dos pés à cabeça, milhares de olhos convergiram para a mão inutilizada sob a manga.',
    motivo: 'Restaura a identidade 铁山匪帮 sem confundi-la com o topônimo Montanha de Ferro.',
  },
  {
    capitulo: 10,
    ordem: 7,
    antes: 'A notícia do extermínio da família Gu das Planícies Centrais já tinha se espalhado. Os Shangguan não tinham feito esforço algum para ocultá-la e, à medida que novos detalhes circulavam, Gu Shenwei começava a enxergar com clareza toda a sequência dos acontecimentos.',
    depois: 'A notícia do extermínio da família Gu das Planícies Centrais pela Fortaleza do Peng Dourado já tinha se espalhado. Os Shangguan não tinham feito esforço algum para ocultá-la e, à medida que novos detalhes circulavam, Gu Shenwei começava a enxergar com clareza toda a sequência dos acontecimentos.',
    motivo: 'Restaura 金鹏堡 como agente do extermínio; a omissão apagava informação, não era simples anáfora.',
  },
  {
    capitulo: 12,
    ordem: 76,
    antes: '"Você dá conta?", perguntou Qi Nu num sotaque duro das Planícies Centrais. Ele e o caçula Xie Nu tinham participado da irmandade, mas não haviam esquecido que Yao Nu os delatou.',
    depois: '"Você dá conta?", perguntou Qi Nu numa língua das Planícies Centrais ainda hesitante. Ele e o caçula Xie Nu tinham participado da irmandade, mas não haviam esquecido que Yao Nu os delatou.',
    motivo: '中原话 é a língua, e 生硬 descreve o domínio hesitante de Qi Nu; não é um sotaque regional.',
  },
  {
    capitulo: 12,
    ordem: 70,
    antes: 'Yao Nu acabou levando a bronca, mas não se importou. Voltou ao dormitório dos dez garotos, chutou os sapatos para longe, pulou na cama de tijolos e soltou um suspiro de alívio. Então ficou deitado de costas, um bom tempo sem dizer nada.',
    depois: 'Yao Nu acabou levando a bronca, mas não se importou. Voltou ao dormitório dos dez garotos, chutou os sapatos para longe, pulou na cama aquecida e soltou um suspiro de alívio. Então ficou deitado de costas, um bom tempo sem dizer nada.',
    motivo: 'Restaura 炕 como “cama aquecida”, forma já estabelecida em todo o núcleo da cena.',
  },
  {
    capitulo: 13,
    ordem: 66,
    antes: 'A confiança de Han Jinu tinha uma razão: havia outra pessoa no quarto. O homem estava reclinado numa cadeira, de rosto voltado para o teto, enquanto Han Jinu, sentado num banquinho, massageava-lhe as pernas com todo o cuidado.',
    depois: 'A confiança de Han Jinu tinha uma razão: havia outra pessoa no quarto. O homem estava reclinado numa cadeira reclinável, de rosto voltado para o teto, enquanto Han Jinu, sentado num banquinho, massageava-lhe as pernas com todo o cuidado.',
    motivo: 'Padroniza 躺椅 como “cadeira reclinável” nas duas aparições do mesmo móvel.',
  },
  {
    capitulo: 14,
    ordem: 9,
    antes: 'Na espreguiçadeira, Han Shiqi se virou de lado, indicou a Han Jinu que massageasse sua cintura e disse, arrastando a voz:',
    depois: 'Na cadeira reclinável, Han Shiqi se virou de lado, indicou a Han Jinu que massageasse sua cintura e disse, arrastando a voz:',
    motivo: 'Padroniza 躺椅 sem sugerir uma cadeira de praia ou área externa.',
  },
  {
    capitulo: 15,
    ordem: 57,
    antes: 'A Mãe Neve ensinava a Yao Nu uma sequência de punhos. Ele a executou ali mesmo, fazendo o ar zunir a cada golpe. Embora ainda estivesse longe de dominá-la, já exibia um ímpeto intimidador.',
    depois: 'Mãe Neve ensinava a Yao Nu uma técnica de punho. Ele a executou ali mesmo, fazendo o ar zunir a cada golpe. Embora ainda estivesse longe de dominá-la, já exibia um ímpeto intimidador.',
    motivo: 'Restaura 拳法 como “técnica de punho”; “sequência de punhos” descrevia mal uma arte marcial.',
  },
  {
    capitulo: 17,
    ordem: 54,
    antes: 'Na Fortaleza do Peng Dourado, não havia nada de surpreendente em um escravo conhecer artes marciais. Praticar uma arte de energia interna, porém, era diferente. Técnicas de punho, pernas, sabre e espada existiam aos montes, mas métodos de energia interna eram raríssimos. Em geral, cada um constituía o segredo central de uma escola e não era transmitido a estranhos; por isso, era fácil identificar sua origem.',
    depois: 'Na Fortaleza do Peng Dourado, não havia nada de surpreendente em um escravo conhecer artes marciais. Praticar uma arte de energia interna, porém, era diferente. Técnicas de punho, pernas, sabre e espada existiam aos montes, mas métodos de cultivo de energia interna eram raríssimos. Em geral, cada um constituía o segredo central de uma escola e não era transmitido a estranhos; por isso, era fácil identificar sua origem.',
    motivo: 'Restaura a distinção entre 内功 (arte) e 内功心法 (método de cultivo).',
  },
  {
    capitulo: 17,
    ordem: 41,
    antes: 'Gu Shenwei decidiu revelar o desvio de Qi. E não mentia ao oferecer ajuda: no dia anterior, finalmente ultrapassou o primeiro nível da Força Yang e alcançou o primeiro nível da Força Yin.',
    depois: 'Gu Shenwei decidiu contar a Yao Nu sobre o desvio de Qi. E não mentia ao oferecer ajuda: no dia anterior, finalmente ultrapassou o primeiro nível da Força Yang e alcançou o primeiro nível da Força Yin.',
    motivo: 'Restaura 遥奴 como destinatário necessário de 告诉, sem repetir o nome mecanicamente.',
  },
  {
    capitulo: 17,
    ordem: 64,
    antes: 'Gu Shenwei finalmente compreendeu. Han Shiqi era um dos inimigos que mais odiava e também um dos homens que mais lhe causavam repulsa. Ele presenciou o que aconteceu com Qi Nu e Xie Nu. Mais de dez dias se passaram, mas os irmãos ainda se recusavam a falar do assunto, e Xie Nu às vezes despertava no meio da noite aos gritos, tomado de pavor.',
    depois: 'Gu Shenwei finalmente entendeu o que Yao Nu queria dizer. Han Shiqi era um dos inimigos que mais odiava e também um dos homens que mais lhe causavam repulsa. Ele presenciou o que aconteceu com Qi Nu e Xie Nu. Mais de dez dias se passaram, mas os irmãos ainda se recusavam a falar do assunto, e Xie Nu às vezes despertava no meio da noite aos gritos, tomado de pavor.',
    motivo: 'Restaura o complemento 遥奴的意思; “compreendeu” sem objeto deixava a ligação vaga.',
  },
];

const correcoesPontuais = [
  [7, 63, 'A mulher magra, porém', 'A mulher magra e ossuda, porém', 'Padroniza 干瘦 como a descrição natural “magra e ossuda”.'],
  [9, 7, 'Mãe Neve deu dois passos', 'A Mãe Neve deu dois passos', 'Restaura o artigo do epíteto usado como nome próprio.'],
  [9, 20, 'Foi então que Mãe Neve entrou', 'Foi então que a Mãe Neve entrou', 'Restaura o artigo do epíteto usado como nome próprio.'],
  [9, 21, 'mulher magra e seca', 'mulher magra e ossuda', 'Padroniza 干瘦 sem o decalque “magra e seca”.'],
  [12, 40, 'Mãe Neve golpeou-o', 'A Mãe Neve golpeou-o', 'Restaura o artigo do epíteto usado como nome próprio.'],
  [12, 48, 'Mesmo assim, Mãe Neve olhou', 'Mesmo assim, a Mãe Neve olhou', 'Restaura o artigo do epíteto usado como nome próprio.'],
  [13, 21, 'Mãe Neve ainda tentou', 'a Mãe Neve ainda tentou', 'Restaura o artigo do epíteto usado como nome próprio.'],
  [13, 61, 'Mãe Neve não era boa com palavras', 'A Mãe Neve não era boa com palavras', 'Restaura o artigo do epíteto usado como nome próprio.'],
  [13, 61, 'mulher magra e seca', 'mulher magra e ossuda', 'Padroniza 干瘦 sem o decalque “magra e seca”.'],
  [15, 29, 'Pedi a Mãe Neve', 'Pedi à Mãe Neve', 'Corrige a crase exigida pelo artigo do epíteto.'],
  [16, 22, 'aprendido com Mãe Neve', 'aprendido com a Mãe Neve', 'Restaura o artigo do epíteto usado como nome próprio.'],
  [16, 39, 'Mãe Neve não me dá folga', 'A Mãe Neve não me dá folga', 'Restaura o artigo do epíteto usado como nome próprio.'],
  [18, 38, 'mandava Mãe Neve golpeá-lo', 'mandava a Mãe Neve golpeá-lo', 'Restaura o artigo do epíteto usado como nome próprio.'],
  [18, 51, 'Mãe Neve não acreditava', 'A Mãe Neve não acreditava', 'Restaura o artigo do epíteto usado como nome próprio.'],
] as const;

const db = new Database(caminhoBanco(), { fileMustExist: true });
db.pragma('foreign_keys = ON');
const obra = db.prepare("SELECT id FROM obras WHERE titulo='O Sutra dos Mortos'").get() as { id: number } | undefined;
if (!obra) throw new Error('Obra não encontrada.');

const obterFrase = db.prepare(`
  SELECT f.id, f.capitulo_id, f.texto_pt
  FROM frases f JOIN capitulos c ON c.id=f.capitulo_id
  WHERE c.obra_id=? AND c.numero=? AND f.ordem=?
`);
const atualizarFrase = db.prepare("UPDATE frases SET texto_pt=?, editado_manualmente=1, origem_edicao='revisao-literaria' WHERE id=? AND texto_pt=?");
const obterRevisao = db.prepare("SELECT id, status, texto_revisado FROM revisoes_literarias WHERE lote_id=2 AND frase_id=?");
const atualizarRevisao = db.prepare(`
  UPDATE revisoes_literarias SET texto_revisado=?,
    justificativa=coalesce(justificativa || ' ', '') || ?,
    atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?
`);
const atualizarGama = db.prepare(`UPDATE glossario SET termo_pt=?, ambiguo=?, nota_uso=? WHERE obra_id=? AND termo_zh=?`);
const inserirGama = db.prepare(`
  INSERT INTO glossario (obra_id, termo_zh, termo_pt, categoria, nota, origem, especie, nota_uso, ambiguo)
  VALUES (?, ?, ?, ?, ?, 'manual', ?, ?, ?)
`);

const resultado = db.transaction(() => {
  let revisoesSincronizadas = 0;
  for (const c of correcoes) {
    const frase = obterFrase.get(obra.id, c.capitulo, c.ordem) as { id: number; capitulo_id: number; texto_pt: string } | undefined;
    if (!frase) throw new Error(`Frase inexistente: ${c.capitulo}.${c.ordem}`);
    if (frase.texto_pt !== c.antes) throw new Error(`${c.capitulo}.${c.ordem}: texto mudou depois da auditoria.`);
    if (atualizarFrase.run(c.depois, frase.id, c.antes).changes !== 1) throw new Error(`${c.capitulo}.${c.ordem}: compare-and-swap falhou.`);
    const revisao = obterRevisao.get(frase.id) as { id: number; status: string; texto_revisado: string } | undefined;
    if (revisao) {
      if (revisao.status !== 'aprovada' || revisao.texto_revisado !== c.antes) throw new Error(`${c.capitulo}.${c.ordem}: histórico divergente.`);
      atualizarRevisao.run(c.depois, `[Consistência pós-aprovação: ${c.motivo}]`, revisao.id);
      revisoesSincronizadas += 1;
    }
    db.prepare("UPDATE capitulos SET atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(frase.capitulo_id);
  }

  for (const [capitulo, ordem, trechoAntes, trechoDepois, motivo] of correcoesPontuais) {
    const frase = obterFrase.get(obra.id, capitulo, ordem) as { id: number; capitulo_id: number; texto_pt: string } | undefined;
    if (!frase) throw new Error(`Frase inexistente: ${capitulo}.${ordem}`);
    if (frase.texto_pt.split(trechoAntes).length !== 2) throw new Error(`${capitulo}.${ordem}: trecho pontual ausente ou repetido: ${trechoAntes}`);
    const depois = frase.texto_pt.replace(trechoAntes, trechoDepois);
    if (atualizarFrase.run(depois, frase.id, frase.texto_pt).changes !== 1) throw new Error(`${capitulo}.${ordem}: correção pontual falhou.`);
    const revisao = obterRevisao.get(frase.id) as { id: number; status: string; texto_revisado: string } | undefined;
    if (revisao) {
      if (revisao.status !== 'aprovada') throw new Error(`${capitulo}.${ordem}: revisão não aprovada.`);
      // Se o usuário editou o texto depois de aprovar, a proposta aprovada é
      // história e não deve ser reescrita retroativamente. Corrigimos só o
      // vigente; sincronizamos a proposta apenas quando ela ainda é a origem
      // exata do texto atual.
      if (revisao.texto_revisado === frase.texto_pt) {
        atualizarRevisao.run(depois, `[Consistência pós-aprovação: ${motivo}]`, revisao.id);
        revisoesSincronizadas += 1;
      }
    }
    db.prepare("UPDATE capitulos SET atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(frase.capitulo_id);
  }

  const mudancas = [
    ['杂役', 'serviçal', 0, 'Empregado sem função de combate; flexione normalmente como “serviçal/serviçais”.'],
    ['尖脸少年', 'garoto de rosto pontudo', 1, 'Descrição contextual de Lin Yang. Use a forma completa ao identificá-lo; depois, “Lin Yang”, “o garoto” ou pronome são naturais.'],
    ['守夜人', 'sentinela noturno', 1, 'Use a forma completa na introdução ou quando a função noturna importar; depois de estabelecida, “sentinela” é suficiente.'],
    ['女主人', 'Senhora da Casa', 1, 'Função formal: “Senhora da Casa”; relação comum ou possessiva: “dona”, conforme a frase.'],
  ] as const;
  for (const [zh, pt, ambiguo, nota] of mudancas) {
    if (atualizarGama.run(pt, ambiguo, nota, obra.id, zh).changes !== 1) throw new Error(`Entrada Gama ausente: ${zh}`);
  }
  db.prepare("UPDATE glossario SET nota=replace(nota, 'mulher magra e seca', 'mulher magra e ossuda') WHERE obra_id=? AND termo_zh='雪娘'").run(obra.id);

  const novas = [
    ['庄丁', 'guarda da propriedade', 'titulo-cargo', 'Homem empregado na propriedade da família Gu, inclusive em vigilância e defesa.', 'lexical', 'Use “guarda da propriedade” quando a função precisar ser explicitada; “guarda” é suficiente no mesmo contexto.', 1],
    ['跟班', 'ajudante', 'titulo-cargo', 'Acompanhante subalterno que serve ou segue alguém.', 'lexical', 'Neste contexto, “ajudante”; não “capanga”, que acrescenta função violenta, nem “lacaio” sem desprezo explícito.', 0],
    ['躺椅', 'cadeira reclinável', 'objeto', 'Cadeira em que Han Shiqi permanece reclinado enquanto recebe massagens.', 'lexical', 'Preserve “cadeira reclinável” nas referências ao móvel.', 0],
    ['西域胡语', 'língua dos povos ocidentais', 'idioma', 'Uma das línguas faladas pelos povos das Regiões Ocidentais.', 'lexical', 'Flexione no singular ou plural conforme o número de línguas mencionado.', 0],
    ['小姐的婆家', 'família do noivo', 'outro', 'Família na qual a jovem ingressa pelo casamento.', 'lexical', 'Use “família do noivo”; não force “Senhorita” dentro dessa relação possessiva.', 0],
  ] as const;
  for (const [zh, pt, categoria, nota, especie, notaUso, ambiguo] of novas) {
    const existe = db.prepare('SELECT 1 FROM glossario WHERE obra_id=? AND termo_zh=?').get(obra.id, zh);
    if (!existe) inserirGama.run(obra.id, zh, pt, categoria, nota, especie, notaUso, ambiguo);
  }

  // Ausências conferidas contra o chinês: formas anafóricas ou abreviações já
  // estabelecidas, não inconsistências. Registrar a dispensa mantém o painel
  // útil sem enfraquecer globalmente identidades do Gama.
  const dispensas = [
    [265, '顾仑'], [612, '大头神'], [629, '中原话'], [698, '顾家'], [728, '上官家'],
    [740, '庄园'], [741, '庄园'], [743, '顾家'], [746, '顾家'], [764, '上官家'],
    [773, '顾家'], [803, '金鹏堡'], [808, '上官家'], [809, '上官家'], [809, '金鹏堡'],
    [814, '上官家'], [822, '金鹏堡'], [881, '金鹏堡'], [886, '顾家'], [887, '顾家'],
    [919, '大头神'], [937, '金鹏堡'], [1203, '顾慎为'],
  ] as const;
  const dispensar = db.prepare('INSERT OR IGNORE INTO consistencia_ignorada (frase_id, termo_zh) VALUES (?, ?)');
  for (const [fraseId, termoZh] of dispensas) dispensar.run(fraseId, termoZh);

  recalcularConsistenciaDaObra(db, obra.id);
  return { textosCorrigidos: correcoes.length + correcoesPontuais.length, revisoesSincronizadas, gamaAtualizado: mudancas.length + 1, gamaCriado: novas.length, dispensasContextuais: dispensas.length };
})();

console.log(JSON.stringify(resultado, null, 2));
db.close();
