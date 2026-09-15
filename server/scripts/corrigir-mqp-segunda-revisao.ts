import Database from 'better-sqlite3';
import { caminhoBanco } from '../src/config.js';

const correcoes = new Map<string, string>([
  ['7.18', '"Você me conhece?", perguntou Gu Shenwei, já irritado. Eram os únicos na carroça capazes de falar a língua das Planícies Centrais, mas Gu Shenwei foi escravizado e perdeu o indispensável manual da família. Não estava em condições de fazer amizade.'],
  ['10.56', 'Gu Shenwei caiu em si e se endireitou na mesma hora. Seu pai fez de tudo para mantê-lo vivo; o mestre Yang Zheng e sua irmã se sacrificaram voluntariamente para salvá-lo. Não podia desperdiçar a própria vida com tanta facilidade.'],
  ['11.26', 'O garoto de rosto pontudo, Lin Yang, foi o primeiro a se recuperar do choque. As marcas dos dedos já tinham sumido de seu rosto e sua confiança estava quase toda de volta. A ideia do juramento de irmandade partiu dele, por isso se autoproclamou o "irmão mais velho".'],
  ['11.51', 'Gu Shenwei entendeu que por pouco não morreu. Assentiu depressa e correu de volta ao quarto. Encontrou o pinico, mas estava tão nervoso que demorou um bom tempo até conseguir urinar um pouco. Não conseguia afastar a sensação de que o sentinela noturno continuava lá fora, escutando.'],
  ['11.60', 'O administrador do Pátio da Lenha Empilhada era um homem de vinte e poucos anos, magro, com o rosto pálido salpicado por duas ou três espinhas. Parecia doente havia anos, como se ele próprio tivesse sido mandado àquele pátio para esperar a morte. Só que não morreu e acabou se tornando o "dono" do lugar.'],
  ['12.47', 'A decisão não era nova: recorreria a qualquer meio para se vingar. Se a vingança fosse possível, não havia nada que não pudesse suportar. Com isso em mente, dobrou depressa os joelhos e se ajoelhou junto com os demais.'],
  ['13.3', 'Quando era o Pequeno Senhor da família Gu, todos, dos mais importantes aos mais humildes, gostavam dele, e isso nunca lhe pareceu difícil. Agora, porém, era um escravo da posição mais baixa, impregnado do cheiro desagradável dos mortos; os outros faziam de tudo para evitá-lo. Quem ainda gostaria dele?'],
  ['13.19', 'Por ter erguido a cabeça uma única vez, Xiao Nu deixou de ser, aos olhos dela, um garoto simplório e se transformou num "homem".'],
  ['13.43', 'Era verdade. Ao conversar com servos de outros pátios, Han Jinu deixava escapar repetidas vezes sua curiosidade pela Oitava Jovem Senhora. A filha do grande bandido das Regiões Ocidentais era famosa por uma beleza sem igual, mas nunca permitia que homem algum visse seu rosto. Como os homens da Fortaleza do Peng Dourado jamais sentiram na pele a ferocidade do Deus Cabeçudo, era natural que quisessem descobrir se os boatos eram verdadeiros.'],
  ['15.30', 'A palavra "capanga" reacendeu a raiva de Gu Shenwei. Depois de enfrentar o perigo com Han Shiqi, porém, agora se controlava muito melhor. Encarou Yao Nu com frieza e saiu do quarto. Os outros garotos se surpreenderam ao ver Huan Nu obedecer com tanta facilidade.'],
  ['16.40', 'Yao Nu nunca soube suportar dificuldades. Gu Shenwei não pôde deixar de admirar um pouco aquela persistência.'],
  ['16.58', 'O garoto acabava de descobrir como bajular os superiores. Fingiu não entender e fez uma expressão de grande interesse. "Senhor Instrutor, o que é o Pátio Fantasma?"'],
  ['16.72', 'Todas as manhãs, a caminho da saudação à Oitava Jovem Senhora, ele atravessava aquele beco e passava diante da alta porta de madeira, simples e sem adornos. Nunca imaginou que houvesse uma prisão do outro lado.'],
  ['17.29', 'Gu Shenwei murmurou uma resposta afirmativa, baixou a cabeça e voltou depressa ao pequeno pátio. Liu Xuan perdeu por um momento a compostura ao ser reconhecido, mas cedo ou tarde perceberia que Yao Nu estava blefando: se de fato precisava buscar alguma coisa, por que mandaria outra pessoa sair para depois segui-la? Bastava, porém, que os dois escapassem daquela situação. Depois disso, Liu Xuan já não teria motivo para insistir em prendê-los.'],
  ['17.34', 'Yao Nu praticava artes marciais havia pouco mais de duas semanas, sem nenhuma experiência em combate real. Gu Shenwei ficou espantado ao vê-lo notar um detalhe tão pequeno e explicá-lo com tanta segurança. Logo, porém, entendeu: aquela explicação certamente vinha de Mãe Neve, e Yao Nu apenas a repetia como se fosse sua. Quem não o conhecesse bem jamais perceberia.'],
  ['17.38', 'Gu Shenwei estava na Fortaleza do Peng Dourado havia quase um mês, mas só conseguiu descobrir informações soltas. Mesmo os garotos das Regiões Ocidentais, que ainda tropeçavam na língua das Planícies Centrais, traziam muito mais rumores e fofocas do que ele. Yao Nu era ainda mais habilidoso em descobrir notícias e conhecia a fortaleza tão bem quanto um velho servo que vivesse ali havia mais de dez anos.'],
  ['17.44', 'Agora que alcançou o primeiro nível da Força Yin, Gu Shenwei julgava ser capaz de ajudar Yao Nu a subjugar a Força Yang dentro do corpo, retardando ou até impedindo o desvio de Qi.'],
  ['17.64', 'Gu Shenwei finalmente compreendeu. Han Shiqi era um dos inimigos que mais odiava e também um dos homens que mais lhe causavam repulsa. Ele presenciou o que aconteceu com Qi Nu e Xie Nu. Mais de dez dias se passaram, mas os irmãos ainda se recusavam a falar do assunto, e Xie Nu às vezes despertava no meio da noite aos gritos, tomado de pavor.'],
]);

type Linha = {
  id: number;
  frase_id: number;
  capitulo_id: number;
  status: 'pendente' | 'aprovada' | 'rejeitada' | 'conflito';
  texto_revisado: string;
  texto_pt: string;
};

const db = new Database(caminhoBanco(), { fileMustExist: true });
db.pragma('foreign_keys = ON');
const obter = db.prepare(`
  SELECT r.id, r.frase_id, f.capitulo_id, r.status, r.texto_revisado, f.texto_pt
  FROM revisoes_literarias r
  JOIN revisao_literaria_lotes l ON l.id=r.lote_id
  JOIN frases f ON f.id=r.frase_id JOIN capitulos c ON c.id=f.capitulo_id
  WHERE l.rotulo='Segunda revisão integral 0–18 · tom local do original'
    AND c.numero=? AND f.ordem=?
`);
const inserirAusente = db.prepare(`
  INSERT INTO revisoes_literarias
    (lote_id, frase_id, texto_vigente_base, texto_revisado, justificativa, categorias)
  SELECT l.id, f.id, f.texto_pt, ?,
         'Remove mais-que-perfeito simples remanescente após leitura contextual; a redação explicita a experiência sem elevar o registro.',
         '["naturalidade","ritmo"]'
  FROM revisao_literaria_lotes l
  JOIN obras o ON o.id=l.obra_id
  JOIN capitulos c ON c.obra_id=o.id
  JOIN frases f ON f.capitulo_id=c.id
  WHERE l.rotulo='Segunda revisão integral 0–18 · tom local do original'
    AND c.numero=? AND f.ordem=?
`);
const atualizarProposta = db.prepare(`
  UPDATE revisoes_literarias
  SET texto_revisado=?,
      justificativa=coalesce(justificativa || ' ', '') || '[Correção MQP: forma sintética removida conforme Beta.]',
      atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id=?
`);
const atualizarPublicado = db.prepare(`
  UPDATE frases SET texto_pt=?, editado_manualmente=1, origem_edicao='revisao-literaria' WHERE id=? AND texto_pt=?
`);
const tocarCapitulo = db.prepare("UPDATE capitulos SET atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?");

const resultado = db.transaction(() => {
  let aprovadas = 0;
  let pendentes = 0;
  for (const [chave, texto] of correcoes) {
    const [capitulo, ordem] = chave.split('.').map(Number);
    let linha = obter.get(capitulo, ordem) as Linha | undefined;
    if (!linha) {
      if (inserirAusente.run(texto, capitulo, ordem).changes !== 1) throw new Error(`Não foi possível criar a proposta: ${chave}`);
      linha = obter.get(capitulo, ordem) as Linha | undefined;
    }
    if (!linha) throw new Error(`Proposta não encontrada: ${chave}`);
    if (linha.status !== 'aprovada' && linha.status !== 'pendente') throw new Error(`${chave} está ${linha.status}.`);
    if (linha.status === 'aprovada') {
      if (linha.texto_pt !== linha.texto_revisado) throw new Error(`${chave}: o publicado mudou depois da aprovação; correção interrompida.`);
      const alterada = atualizarPublicado.run(texto, linha.frase_id, linha.texto_revisado).changes;
      if (alterada !== 1) throw new Error(`${chave}: compare-and-swap do texto publicado falhou.`);
      tocarCapitulo.run(linha.capitulo_id);
      aprovadas += 1;
    } else {
      if (linha.texto_pt === linha.texto_revisado) throw new Error(`${chave}: proposta pendente já está publicada.`);
      pendentes += 1;
    }
    atualizarProposta.run(texto, linha.id);
  }
  return { total: correcoes.size, aprovadasCorrigidas: aprovadas, pendentesCorrigidas: pendentes };
})();

console.log(JSON.stringify(resultado, null, 2));
db.close();
