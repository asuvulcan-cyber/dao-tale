import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { normalizarPreferencias, type EntradaGlossario, type Frase } from '@dao-tale/shared';
import { propostaPodeIrAoStaging, validarPropostaLiteraria, type CategoriaRevisaoLiteraria } from '../src/revisao/literaria.js';
import { analisarEstilo } from '../src/traducao/estiloViolacoes.js';
import { varrerConsistencia } from '../src/traducao/consistencia.js';
import { separarPorChecagem } from '../src/traducao/glossarioChecavel.js';

// Revisão editorial contra o chinês. Só grava propostas pendentes; nunca aplica texto.
// Execução padrão: validação somente de leitura. Exige caminho explícito do banco.
const caminho = process.env.DAO_TALE_BANCO;
if (!caminho) throw new Error('Defina DAO_TALE_BANCO explicitamente.');
const gravar = process.argv.includes('--staging');
const rotulo = 'Revisão integral do capítulo 23 · Gemini 3.8 Flash';
const criterios = [
  'Revisão editorial assistida contra o chinês, Alfa 6.3, Beta e Delta 2.4; capítulo 22 aprovado como referência de qualidade.',
  'Preservar sentido, imagens, voz e ambiguidades; corrigir referências, medidas, literalidade e registro sem uniformizar a prosa.',
  'Propostas elaboradas pelo assistente, ainda não aprovadas pelo usuário. Nenhuma alteração automática no texto vigente.',
].join('\n');
type Proposta = { ordem: number; texto: string; justificativa: string; categorias: CategoriaRevisaoLiteraria[] };
const propostas: Proposta[] = [
  {
    "ordem": 0,
    "texto": "Quando os garotos foram cumprimentar a Senhorita, nada indicava que alguém soubesse da morte de Han Shiqi. Faltavam dois escravos, mas ela nem percebeu. Só a Mãe Neve franziu a testa e perguntou. Os seis garotos olharam uns para os outros, sem saber o que responder. Ela balançou a cabeça, descontente, mas não insistiu.",
    "justificativa": "请安 é a visita para cumprimentar a Senhorita, não uma homenagem. Remove a oração relativa pesada e preserva a falta de resposta.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 1,
    "texto": "Quando voltaram ao Pátio da Lenha Empilhada, Han Jinu continuava sem perceber que faltavam dois garotos. Só perto do meio-dia, ao procurar Qi Nu e Xie Nu para esclarecer a história, notou que restavam apenas seis no pátio.",
    "justificativa": "Esclarece que quem volta ao pátio são os garotos, não Han Jinu.",
    "categorias": [
      "coesao",
      "naturalidade"
    ]
  },
  {
    "ordem": 3,
    "texto": "Han Jinu ficou muito surpreso. Para ele, era impossível alguém desaparecer dentro da Fortaleza do Peng Dourado. Nem conseguia imaginar uma coisa dessas.",
    "justificativa": "Remove “estarrecido” e o encadeamento abstrato “impossível e portanto impensável”, preservando a incompreensão.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 5,
    "texto": "O espanto de Han Jinu virou fúria. Ele ergueu o bastão de pau-rosa e começou a bater nos garotos sem olhar onde acertava. \"Aprontando pelas minhas costas! Aprontando pelas minhas costas! Vocês estão todos juntos nisso! Os dois pirralhos foram embora com o Terceiro Irmão?\"",
    "justificativa": "Remove “brandiu/desferindo/a esmo” e a fala truncada “ousando aprontar”. 跟三哥走了 pergunta se foram com ele, sem afirmar uma fuga.",
    "categorias": [
      "fidelidade",
      "naturalidade",
      "dialogo"
    ]
  },
  {
    "ordem": 7,
    "texto": "No meio da confusão, abriram o portão leste do pátio. Entrou um grupo de homens de preto, em vez dos escravos que traziam os moribundos. Vestiam-se um pouco diferente dos Assassinos: usavam faixas verdes ou amarelas, não vermelhas, e não carregavam sabres.",
    "justificativa": "Desfaz a repetição de pátio e cintura e torna natural a abertura do portão, mantendo as diferenças de uniforme.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 8,
    "texto": "Ao ver aqueles homens, Han Jinu se assustou ainda mais do que diante de Assassinos. Deixou cair o bastão de pau-rosa, abriu a boca e dobrou os joelhos sem querer. Não conseguia dizer nada. Não dava para saber se tentava fazer uma reverência ou se ia cair.",
    "justificativa": "Remove “terror estampado/superou/articular palavra” e preserva a ambiguidade do gesto e o medo comparativo.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 9,
    "texto": "Os homens de preto não disseram nada nem se apresentaram. Avançaram juntos e levaram Han Jinu depressa, sustentando seu corpo mole como barro. Um deles trancou por dentro o portão oeste, que nunca era trancado. Ao sair, trancaram o portão leste do pátio por fora.",
    "justificativa": "Preserva a comparação com lama de 瘫成软泥, em vez de gelatina. Remove “amolecera/ficara” e mantém os lados pelos quais os portões são fechados.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 10,
    "texto": "Ninguém explicou nada aos garotos assustados. Estavam praticamente presos no Pátio da Lenha Empilhada. Só Gu Shenwei tinha ideia do motivo.",
    "justificativa": "相当于 indica a situação equivalente à prisão. Remove “sob cárcere” e preserva a diferença de conhecimento entre os garotos.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 11,
    "texto": "Havia ainda dois feridos no pátio, trazidos dois dias antes. Os garotos costumavam evitar o quarto deles, mas agora correram todos para lá. Queriam mostrar à Fortaleza do Peng Dourado que ainda serviam para alguma coisa.",
    "justificativa": "“Anteontem” desloca a referência para o momento da fala; “dois dias antes” mantém o tempo da narrativa. Preserva o esforço de mostrar utilidade.",
    "categorias": [
      "coesao",
      "naturalidade"
    ]
  },
  {
    "ordem": 12,
    "texto": "Ao meio-dia, ninguém trouxe comida. Era um mau sinal.",
    "justificativa": "Substitui “agourento” sem mudar o presságio.",
    "categorias": [
      "naturalidade",
      "lexico"
    ]
  },
  {
    "ordem": 13,
    "texto": "Os dois feridos não duraram muito e morreram antes de escurecer. O portão oeste, que dava para o Penhasco do Grito Fantasma, estava trancado. Só restou deixar os corpos na cama aquecida, endurecendo aos poucos.",
    "justificativa": "Remove “fora trancado/tiveram de ser deixados/enrijecendo”, mantendo a causa de os corpos permanecerem ali.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 15,
    "texto": "Zhao Nu falou de repente. Fazia muito tempo que ninguém dizia nada. Estavam inquietos, mas não sabiam o que aconteceu. Só Gu Shenwei podia ter uma ideia geral, e não diria uma palavra.",
    "justificativa": "大概 é uma ideia geral, não “quase tudo”. Remove “acontecera” e preserva o silêncio deliberado do protagonista.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 17,
    "texto": "Os garotos fizeram que sim com a cabeça, com força. De repente, todos sentiram alívio.",
    "justificativa": "Remove “assentiram com fervor/de súbito”, preservando a intensidade do gesto e o alívio coletivo.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 19,
    "texto": "Os dias em que a filha do Deus Cabeçudo mandava e desmandava no acampamento dos bandidos acabaram assim que ela entrou no palanquim de noiva.",
    "justificativa": "Conserva a expressão natural “mandava e desmandava” e a virada temporal, sem empilhar auxiliares.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 22,
    "texto": "Assustados, os garotos não ousaram perguntar nada e seguiram os homens para fora do Pátio da Lenha Empilhada. Antes, só queriam sair dali. Agora custava deixá-lo, como se fosse sua casa.",
    "justificativa": "Mantém a mudança de sentimento em relação ao pátio sem a abstração “lhes despertava o apego que se tem por um lar”.",
    "categorias": [
      "naturalidade",
      "ritmo"
    ]
  },
  {
    "ordem": 23,
    "texto": "Gu Shenwei continuava calmo e até um pouco otimista. Os homens de cinto amarelo não amarraram ninguém; provavelmente só queriam fazer perguntas. Um Assassino desapareceu, depois dois escravos sumiram de repente. Qualquer um ligaria os dois casos. Ninguém suspeitaria de quem ficou.",
    "justificativa": "Remove “nutrindo/sumira” e preserva o raciocínio otimista do personagem, que será corrigido pelo narrador.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 24,
    "texto": "Gu Shenwei não estava inteiramente certo.",
    "justificativa": "Remove “não estava de todo correto” sem transformar o erro parcial em erro completo.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 25,
    "texto": "Os homens de cinto amarelo eram os carrascos do Pátio do Coração Lavado. Os garotos foram levados até lá para um interrogatório formal.",
    "justificativa": "Corrige a construção solta “Levados até ali, o que aguardava”. Preserva a formalidade do interrogatório, explicitada pelo original.",
    "categorias": [
      "coesao",
      "naturalidade"
    ]
  },
  {
    "ordem": 27,
    "texto": "Antes, Gu Shenwei pensou em procurar a irmã naquele pátio. Agora via que seria inútil: todas as celas do Pátio do Coração Lavado ficavam no subsolo, muito bem guardadas. Quem vinha de fora não tinha como espiar.",
    "justificativa": "Remove a passiva “celas que mantinham os prisioneiros” e preserva a razão concreta de a busca ser inviável.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 29,
    "texto": "Os garotos foram levados a uma câmara de tortura no subsolo. Parecia muito usada: o chão estava coberto de lama gordurosa. Já carregaram corpos de pessoas enviadas pelo Pátio do Coração Lavado para morrer, todos sujos daquela lama. Quando era vivo, Yao Nu dizia que havia carne humana misturada nela. Pelos membros mutilados dos moribundos, devia estar perto da verdade.",
    "justificativa": "送走 não descreve enterro. Recupera o transporte dos mortos e remove “dissera/àquele lodo”, mantendo a observação e a hipótese de Yao Nu.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 30,
    "texto": "Havia muitos instrumentos estranhos de tortura na sala e correntes por toda parte. Num canto, um prisioneiro pendia sem forças de uma armação de madeira. A pele estava rasgada, a carne aberta; quase não parecia humano. Quando gemeu, os garotos gritaram todos ao mesmo tempo.",
    "justificativa": "Preserva a descrição do original sem “o aposento exibia/grito uníssono” nem a qualificação acrescentada “sangrentos”.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 35,
    "texto": "Gu Shenwei sentiu as pernas tremerem e teve vontade de dar meia-volta e fugir.",
    "justificativa": "Remove “invadido pelo impulso desesperado”, que intensifica uma vontade já clara no original.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 36,
    "texto": "Gu Shenwei era da família Gu das Planícies Centrais, descendente de funcionários do governo. Seus amigos de infância eram filhos de generais e ministros. Para eles, a tortura era coisa de histórias, como deuses e fantasmas.",
    "justificativa": "官宦 não exige nobreza. Remove “fruto da nobreza burocrática/companheiros de folguedo” e preserva a comparação entre tortura e histórias sobrenaturais.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 37,
    "texto": "*Como cheguei a esse ponto?*",
    "justificativa": "Corrige a combinação pouco natural “vim parar a este ponto”.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 38,
    "texto": "*Não bastou perder a casa e a família? Ainda vou ter de morrer da forma mais humilhante?*",
    "justificativa": "Preserva a pergunta angustiada sem duplicar 家破人亡 como duas destruições nem empilhar “provar na pele a forma de morrer”.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 39,
    "texto": "Ninguém imaginava que havia um Pequeno Senhor da família Gu entre os garotos, muito menos pensava no que ele sentia. Com prática, os carrascos amarraram cada um dos seis a uma armação de madeira. Sem fazer nenhuma pergunta, começaram a chicoteá-los. Na primeira chicotada, Lei Nu, que estava desmaiado, gritou como um porco no abate. Logo os gritos se misturaram.",
    "justificativa": "Corrige “deram início aos chicotes” e a concordância inicial. Mantém a comparação do original sem acrescentar “onda de gritos dilacerantes”.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 41,
    "texto": "Era a regra do Pátio do Coração Lavado: não importava o que alguém fez ou deixou de fazer, nem se confessava. Primeiro vinha a tortura. As chicotadas eram a forma mais leve de intimidar quem chegava.",
    "justificativa": "下马威 é uma demonstração inicial de poder para intimidar. Remove “rodada de suplício/golpe de aviso”.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 42,
    "texto": "Depois das chicotadas, os carrascos mandaram os garotos falar, mas não disseram o que queriam saber.",
    "justificativa": "Remove “findo o açoitamento” e mantém a omissão deliberada da pergunta.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 43,
    "texto": "Os garotos falavam uns por cima dos outros, confessando tudo. Contaram até que serviram chá a Han Jinu. Ainda achavam que o administrador era o motivo de estarem ali.",
    "justificativa": "Naturaliza a disputa para confessar e explicita a suposição sobre Han Jinu, sem “se atropelaram em confissões”.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 44,
    "texto": "Depois, os carrascos pediram que falassem dos desaparecidos Qi Nu e Xie Nu. Veio outra enxurrada de detalhes sem importância.",
    "justificativa": "Remove “desencadeou uma torrente de ninharias”, mantendo a quantidade de informações irrelevantes.",
    "categorias": [
      "naturalidade",
      "lexico"
    ]
  },
  {
    "ordem": 45,
    "texto": "Mesmo ouvindo tanta coisa inútil, os carrascos não mostravam reação. Procuravam contradições no meio daquelas falas para descobrir quem realmente sabia de alguma coisa.",
    "justificativa": "Naturaliza 不露声色 e torna clara a busca por falhas nos relatos, sem “expressão impassível”.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 46,
    "texto": "Antes da tortura, as pernas de Gu Shenwei ainda estavam bambas. Mas, quando o chicote o atingiu, o medo desapareceu. Era só dor no corpo, quase nada perto do sofrimento que guardava dentro de si.",
    "justificativa": "烟消云散 funciona como expressão de desaparecimento, sem exigir a imagem literal de fumaça. Remove “suplício/insignificante diante”.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 47,
    "texto": "Mesmo assim, ele também gritava e confessava coisas sem sentido. Era a primeira vez que entrava numa câmara de tortura e enfrentava carrascos, mas sua mente estava surpreendentemente clara. Entendia cada truque. Precisava parecer um garoto como os outros e observar tudo sem que percebessem.",
    "justificativa": "Remove “permanecia/patentes a seus olhos” e preserva a lucidez incomum, a simulação e a observação escondida.",
    "categorias": [
      "naturalidade",
      "ritmo"
    ]
  },
  {
    "ordem": 48,
    "texto": "Os que faziam as perguntas eram apenas capangas. Só dois homens mandavam de verdade. Ficavam afastados, como se aquilo não fosse com eles.",
    "justificativa": "小喽罗 marca a posição inferior. Remove “capangas rasos/detentores do poder”, mantendo a hierarquia.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 49,
    "texto": "Um deles era alto e magro, vestido de preto, com cinto amarelo e uma expressão sombria. Era claramente o responsável pelo Pátio do Coração Lavado. O outro, muito baixo e magro, usava uma túnica cinzenta comprida e parecia mergulhado em pensamentos, como um estudioso.",
    "justificativa": "Remove “trajava/semblante/feitor/tal qual um letrado” e preserva as características que distinguem os dois homens.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 56,
    "texto": "Han Shiqi era o nome verdadeiro dele. A maioria dos Assassinos da Fortaleza do Peng Dourado não era conhecida, por isso não precisava usar nomes falsos nas missões.",
    "justificativa": "声名不显 indica pouca notoriedade, não uma política deliberada de manter a identidade anônima.",
    "categorias": [
      "fidelidade"
    ]
  },
  {
    "ordem": 57,
    "texto": "O Mestre do Sabre Shen e o Senhor Guo discordavam. O primeiro parecia querer reduzir a importância do caso; o segundo, investigar a fundo.",
    "justificativa": "Preserva a divergência, sem acrescentar “ir até as últimas consequências”.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 59,
    "texto": "O interrogatório continuava com pausas, sempre sem um assunto central. Os carrascos pareciam saltar de uma coisa para outra. Gu Shenwei teve a impressão de que faziam isso de propósito: sempre que os garotos mencionavam a Mãe Neve ou a Oitava Jovem Senhora, eles não perguntavam mais nada. Os mais espertos entenderam e deixaram de falar do pátio do Oitavo Jovem Mestre.",
    "justificativa": "Distingue a conduta observável da inferência de Gu Shenwei. Remove “aos solavancos/nítida sensação” e não atribui intenção antes de apresentar a suspeita.",
    "categorias": [
      "fidelidade",
      "coesao"
    ]
  },
  {
    "ordem": 60,
    "texto": "Não sabia quanto tempo se passou. O Mestre do Sabre Shen e o Senhor Guo saíram e voltaram várias vezes. Depois, quase não falaram nem mostraram mais sinais de discordância, mas nenhum olhava para o outro.",
    "justificativa": "Remove a construção participial pesada e mantém a tensão silenciosa entre os dois.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 61,
    "texto": "O Oitavo Jovem Mestre Shangguan Nu também apareceu. Era a segunda vez que Gu Shenwei via o inimigo responsável pelo massacre de sua família. Estava ainda mais longe, e a chance de se vingar era menor.",
    "justificativa": "Remove “exterminara” e preserva a distância física e a redução da oportunidade de vingança.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 62,
    "texto": "Shangguan Nu deu uma olhada e saiu sem dizer nada. Fez um sinal com a cabeça para o Mestre do Sabre Shen, mas ignorou o Senhor Guo. Mesmo assim, Guo cumprimentou o Jovem Mestre com todo o respeito.",
    "justificativa": "视而不见 é ignorar a pessoa, não fazer vista grossa a uma conduta. Preserva o contraste da deferência e remove “saudou com extrema deferência”.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 64,
    "texto": "O que jogaram no chão era uma pessoa viva. Ela levantou a cabeça e olhou primeiro para Gu Shenwei.",
    "justificativa": "Remove “ninguém menos que”, que acrescenta ênfase à revelação.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 65,
    "texto": "Qi Nu foi capturado e trazido de volta.",
    "justificativa": "Remove “fora recapturado” e explicita a volta contida em 抓回来.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  }
];

const db = new Database(caminho, { readonly: !gravar, fileMustExist: true });
if (gravar) db.pragma('foreign_keys = ON');
const capitulo = db.prepare('SELECT id, prompt_id, provedor, modelo FROM capitulos WHERE obra_id=1 AND numero=23').get() as
  { id: number; prompt_id: number; provedor: string; modelo: string } | undefined;
if (!capitulo || capitulo.provedor !== 'gemini' || capitulo.modelo !== 'gemini-3.8-flash') throw new Error('Capítulo/modelo diverge da base revisada.');
const frases = db.prepare('SELECT * FROM frases WHERE capitulo_id=? ORDER BY ordem').all(capitulo.id) as Frase[];
if (frases.length !== 66 || frases.some(f => f.status_traducao !== 'traduzida' || f.texto_pt !== f.texto_pt_original_ia)) {
  throw new Error('Base mudou: esperadas 66 frases traduzidas, ainda iguais à primeira IA.');
}
const gama = db.prepare('SELECT * FROM glossario WHERE obra_id=1').all() as EntradaGlossario[];
const linhaPrompt = db.prepare('SELECT preferencias FROM prompts WHERE id=?').get(capitulo.prompt_id) as { preferencias: string };
const prefs = normalizarPreferencias(JSON.parse(linhaPrompt.preferencias));
const ordens = new Set<number>();
const validadas = propostas.map(p => {
  if (ordens.has(p.ordem)) throw new Error(`Ordem duplicada: ${p.ordem}`);
  ordens.add(p.ordem);
  const indice = frases.findIndex(f => f.ordem === p.ordem);
  const frase = frases[indice];
  if (!frase || frase.texto_pt.trim() === p.texto.trim()) throw new Error(`Proposta inválida: ${p.ordem}`);
  const anterior = frases[indice - 1];
  const inicio = !anterior || anterior.paragrafo !== frase.paragrafo;
  const travas = validarPropostaLiteraria({ ...frase, inicio_paragrafo: inicio,
    apos_fala_em_outro_paragrafo: Boolean(inicio && anterior && /^[\s*_]*["“].*["”][\s*_]*$/su.test(anterior.texto_pt.trim())),
  }, { ordem: p.ordem, texto_revisado: p.texto, justificativa: p.justificativa, categorias: p.categorias, confianca: 'alta' }, gama);
  if (!propostaPodeIrAoStaging(travas)) throw new Error(`23.${p.ordem}: ${JSON.stringify(travas)}`);
  return { ...p, frase, travas };
});
const porOrdem = new Map(propostas.map(p => [p.ordem, p.texto]));
const composicao = frases.map(f => ({ ...f, texto_pt: porOrdem.get(f.ordem) ?? f.texto_pt }));
const estilo = analisarEstilo(composicao, prefs);
const consistencia = varrerConsistencia(composicao, separarPorChecagem(gama).checaveis);
// Aspas isoladas não geram propostas literárias; ficam relatadas separadamente.
const falsosEstilo = new Set(['29|câmara', '34|Câmara', '47|câmara']);
const estiloConteudo = estilo.violacoes.filter(v => v.regra !== 'aspas-nao-retas' && !(v.regra === 'mais-que-perfeito' && falsosEstilo.has(`${v.ordem}|${v.trecho}`)));
// 西院门 refere-se ao portão oeste deste pátio, não ao local chamado Pátio Oeste.
const gamaReais = consistencia.violacoes.filter(v => !(v.termo_zh === '西院' && [9,13].includes(v.ordem)));
if (estiloConteudo.length || gamaReais.length) throw new Error(JSON.stringify({ estilo: estilo.violacoes, gama: consistencia.violacoes }));
const assinatura = (linhas: unknown) => createHash('sha256').update(JSON.stringify(linhas)).digest('hex');
const estadoFrases = () => db.prepare('SELECT * FROM frases WHERE capitulo_id=? ORDER BY ordem').all(capitulo.id);
const baseHash = assinatura(frases);
let loteId: number | null = null;
let existente = false;
if (gravar) {
  loteId = db.transaction(() => {
    if (assinatura(estadoFrases()) !== baseHash) throw new Error('Texto mudou durante a validação.');
    const lote = db.prepare('SELECT id FROM revisao_literaria_lotes WHERE obra_id=1 AND rotulo=?').get(rotulo) as { id: number } | undefined;
    if (lote) {
      const salvas = db.prepare('SELECT frase_id,texto_revisado FROM revisoes_literarias WHERE lote_id=?').all(lote.id) as { frase_id: number; texto_revisado: string }[];
      if (salvas.length !== validadas.length || validadas.some(p => !salvas.some(s => s.frase_id === p.frase.id && s.texto_revisado === p.texto))) throw new Error('Lote existente difere; nenhuma proposta será sobrescrita.');
      existente = true;
      return lote.id;
    }
    const pendentes = db.prepare("SELECT count(*) n FROM revisoes_literarias r JOIN frases f ON f.id=r.frase_id WHERE f.capitulo_id=? AND r.status IN ('pendente','conflito')").get(capitulo.id) as { n: number };
    if (pendentes.n) throw new Error('O capítulo já tem propostas pendentes de outro lote.');
    const id = Number(db.prepare('INSERT INTO revisao_literaria_lotes (obra_id,rotulo,criterios) VALUES (1,?,?)').run(rotulo, criterios).lastInsertRowid);
    const inserir = db.prepare('INSERT INTO revisoes_literarias (lote_id,frase_id,texto_vigente_base,texto_revisado,justificativa,categorias) VALUES (?,?,?,?,?,?)');
    for (const p of validadas) inserir.run(id, p.frase.id, p.frase.texto_pt, p.texto, p.justificativa, JSON.stringify(p.categorias));
    if (assinatura(estadoFrases()) !== baseHash) throw new Error('Texto vigente alterado indevidamente.');
    return id;
  }).immediate();
}
console.log(JSON.stringify({ modo: gravar ? 'staging' : 'validacao', capitulo: 23, propostas: propostas.length,
  preservadas: frases.length - propostas.length, lote_id: loteId, existente, base_sha256: baseHash,
  estilo: estilo.violacoes, gama: consistencia.violacoes,
  alertas: validadas.flatMap(p => p.travas.map(t => ({ ordem: p.ordem, ...t }))),
}, null, 2));
db.close();
