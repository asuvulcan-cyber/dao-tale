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
const rotulo = 'Revisão integral do capítulo 21 · Gemini 3.8 Flash';
const criterios = [
  'Revisão editorial assistida contra o chinês, Alfa 6.3, Beta e Delta 2.4; capítulo 20 aprovado como referência de qualidade.',
  'Preservar sentido, imagens, voz e ambiguidades; corrigir referências, medidas, literalidade e registro sem uniformizar a prosa.',
  'Propostas elaboradas pelo assistente, ainda não aprovadas pelo usuário. Nenhuma alteração automática no texto vigente.',
].join('\n');
type Proposta = { ordem: number; texto: string; justificativa: string; categorias: CategoriaRevisaoLiteraria[] };
const propostas: Proposta[] = [
  {
    "ordem": 1,
    "texto": "\"Senhor Administrador, o Terceiro Irmão ainda vem esta noite?\"",
    "justificativa": "Usa aspas retas, conforme a convenção de diálogo da obra.",
    "categorias": [
      "tipografia"
    ]
  },
  {
    "ordem": 2,
    "texto": "Então quem estava na cama era Han Jinu.",
    "justificativa": "原来 marca a descoberta da identidade; “apenas” acrescenta uma avaliação desnecessária.",
    "categorias": [
      "fidelidade"
    ]
  },
  {
    "ordem": 4,
    "texto": "Han Jinu ergueu o tronco e respondeu, impaciente: \"Já não disse que não sei? Se ele vier, eu chamo vocês. Voltem para o quarto!\"",
    "justificativa": "支起身 é erguer o corpo, não apenas apoiá-lo. Corrige também as aspas.",
    "categorias": [
      "fidelidade",
      "tipografia"
    ]
  },
  {
    "ordem": 5,
    "texto": "Quem perguntava lá fora era Qi Nu. Falou alto de propósito para avisar Huan Nu: aquele homem provavelmente não viria.",
    "justificativa": "Remove “levantara” e a construção contraditória “as chances eram quase certas”. 十有八九 indica grande probabilidade, não certeza.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 6,
    "texto": "Qi Nu obedeceu e se afastou. Han Jinu deitou-se de novo, resmungando: \"Pirralho ambicioso... Até dois dias atrás só choramingava, e hoje já tá aí, inquieto que nem um macaco. É bom eu ficar esperto. Querem competir comigo? Ainda têm muito que mamar.\"",
    "justificativa": "Preserva a voz vulgar e a suspeita de rivalidade de Han Jinu; ajusta somente as aspas.",
    "categorias": [
      "tipografia"
    ]
  },
  {
    "ordem": 7,
    "texto": "Han Jinu falou sozinho por um tempo e cantarolou uma música desafinada. Ficou se virando na cama por uma hora inteira antes de se levantar, apagar a lamparina com um sopro e se preparar para dormir.",
    "justificativa": "不成调 descreve falta de afinação, não uma melodia sem sentido. Corrige “revirou de um lado para o outro” e preserva 吹灯 e a duração de 半个时辰.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 8,
    "texto": "Gu Shenwei ficou imóvel, sem ousar respirar fundo. Mantinha a mão acima do nariz para não aspirar mais poeira. Esperou assim por quase mais uma hora, até os roncos acima dele ficarem mais fortes. Só então saiu rastejando debaixo da cama, escapou do quarto na ponta dos pés e correu de volta ao seu.",
    "justificativa": "Esclarece que sai debaixo da cama, não de dentro dela, e preserva a posição da mão e a intensificação dos roncos.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 9,
    "texto": "Qi Nu e seu irmão o esperavam lá dentro. Os outros cinco garotos dormiam em outro quarto, e ali os três estavam seguros.",
    "justificativa": "“Os irmãos Qi Nu” atribui o mesmo nome aos dois. Recupera a relação fraterna com referente claro.",
    "categorias": [
      "fidelidade",
      "coesao"
    ]
  },
  {
    "ordem": 10,
    "texto": "Aquele homem não veio. Qi Nu ouviu dizer que, mais uma vez, a missão do Oitavo Jovem Mestre Shangguan Nu não correu muito bem: o alvo morreu, mas um Assassino também.",
    "justificativa": "Remove “ouvira/fora/perdera” e deixa clara a perda de um membro do grupo, mantendo o contraste da missão.",
    "categorias": [
      "naturalidade",
      "fidelidade",
      "gama"
    ]
  },
  {
    "ordem": 12,
    "texto": "Shangguan Nu estava numa maré de azar. Duas missões seguidas ficaram aquém da perfeição, e ele perdia cada vez mais prestígio aos olhos do pai. Nu, cujo nome significava \"ira\", agora tinha raiva em dobro. Descontava tudo nos Assassinos e Homens de Sabre sob seu comando. Diziam que o Oitavo Jovem Mestre feriu mais gente com seu sabre.",
    "justificativa": "Preserva o jogo de palavras com 怒 sem acrescentar imagens de fogo ou bile. Corrige “sua consideração aos olhos do pai”, remove “acabara” e usa aspas retas.",
    "categorias": [
      "fidelidade",
      "naturalidade",
      "ritmo"
    ]
  },
  {
    "ordem": 15,
    "texto": "Naquela noite, Gu Shenwei se escondeu debaixo da cama de Han Jinu pela terceira vez. Nas duas anteriores, só conseguiu tirar a poeira da parte de baixo do estrado e encontrar uma posição um pouco mais confortável.",
    "justificativa": "Remove “o único resultado fora” e esclarece de onde retirou a poeira, mantendo a ironia sobre o único resultado das tentativas.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 16,
    "texto": "Han Shiqi chegou um pouco tarde, mas Han Jinu ainda estava acordado. À primeira batida, saltou da cama como um cachorro que sente cheiro de osso, pegou a chave pendurada atrás da porta e foi abri-la, todo contente.",
    "justificativa": "Remove “adormecera” e preserva a comparação com o cachorro, a chave pendurada e a alegria de Han Jinu.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 17,
    "texto": "Para conseguir ir livremente ao Pátio da Lenha Empilhada no meio da noite, Han Shiqi ou não se importava com o toque de recolher ou passava sem ser visto pelas sentinelas.",
    "justificativa": "Mantém as duas hipóteses sem o tom acrescentado de “pouco se lixando” nem “despistara”.",
    "categorias": [
      "naturalidade",
      "fidelidade",
      "gama"
    ]
  },
  {
    "ordem": 18,
    "texto": "\"Terceiro Irmão, morri de saudades de você! Olha só, até emagreci.\"",
    "justificativa": "Ajusta somente as aspas, preservando a fala afetada de Han Jinu.",
    "categorias": [
      "tipografia"
    ]
  },
  {
    "ordem": 19,
    "texto": "A voz dengosa de Han Jinu fez Gu Shenwei se arrepiar da cabeça aos pés debaixo da cama. E ainda havia mais: Jinu ria e fazia manha, como se fosse outra pessoa, sem nada daquele Administrador Han com o bastão de pau-rosa na mão.",
    "justificativa": "Naturaliza as duas reações físicas sobrepostas e remove “se derreteu”, preservando o contraste com a postura habitual de Han Jinu.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 21,
    "texto": "Sentiu muita pena de Qi Nu e Xie Nu e entendeu por que insistiam tanto em matar um Assassino da Fortaleza do Peng Dourado.",
    "justificativa": "Remove o registro elevado de “profunda compaixão/obstinados” e conserva a intensidade da empatia.",
    "categorias": [
      "naturalidade",
      "lexico"
    ]
  },
  {
    "ordem": 22,
    "texto": "Os dois acenderam a lamparina e se sentaram juntos na cama. Gu Shenwei prendeu a respiração, torcendo para que não demorassem com as carícias. Se soubesse exatamente onde Han Shiqi estava, bem que gostaria de agir naquele instante.",
    "justificativa": "Evita colocar os personagens “lá fora” do quarto. 真想 exprime vontade de agir, não a certeza de que teria agido.",
    "categorias": [
      "fidelidade",
      "coesao"
    ]
  },
  {
    "ordem": 23,
    "texto": "Han Shiqi falava pouco. Foi ali para sentir prazer, não para trocar palavras de afeto. Depois de um tempo, disse: \"E o moleque briguento? Chame ele.\"",
    "justificativa": "Remove “viera/se deleitar/derramar afeto”, preservando o contraste entre o que Han Shiqi procura e a conversa de Han Jinu.",
    "categorias": [
      "naturalidade",
      "lexico"
    ]
  },
  {
    "ordem": 24,
    "texto": "O coração de Gu Shenwei deu um salto. *O \"moleque briguento\" não era ele mesmo?*",
    "justificativa": "Restaura a pergunta interna do original e aplica a marca de pensamento em itálico.",
    "categorias": [
      "fidelidade",
      "tipografia"
    ]
  },
  {
    "ordem": 27,
    "texto": "\"Ah, foi outro garoto daqui do pátio que enlouqueceu na frente da Oitava Jovem Senhora. Essa gente que a filha do bandido trouxe não presta mesmo. Huan Nu ficou com ele até morrer e também pegou a energia maligna. Mandei que ficasse quieto, sem sair do quarto.\"",
    "justificativa": "Naturaliza 送终 e remove “bandoleiro/cuidou dos momentos finais”, mantendo o desprezo e a explicação de Han Jinu. As partículas funcionam como entonação, sem inventar uma risada.",
    "categorias": [
      "naturalidade",
      "dialogo",
      "fidelidade"
    ]
  },
  {
    "ordem": 28,
    "texto": "\"Não fale tanto do Oitavo Pátio. O Oitavo Jovem Mestre anda sem sorte, cheio de problemas dentro e fora de casa. Eu também vivo com o coração na boca, com medo de que, num dia de mau humor, ele me dê um golpe de sabre sem mais nem menos.\"",
    "justificativa": "Desfaz o decalque “aflições por dentro e por fora” e naturaliza o receio de uma agressão arbitrária.",
    "categorias": [
      "naturalidade",
      "dialogo"
    ]
  },
  {
    "ordem": 29,
    "texto": "\"Sim, sim, o problema da Oitava Jovem Senhora é com ela. Coitado do nosso Oitavo Jovem Mestre, tão bem-apessoado, tão bom em artes marciais...\"",
    "justificativa": "一表人才 elogia a aparência e o porte. Remove “as questões” e a temporalidade pouco natural de “já eram tão boas”.",
    "categorias": [
      "fidelidade",
      "dialogo"
    ]
  },
  {
    "ordem": 30,
    "texto": "\"E pare com essa história de energia maligna também. Ouvi falar do garoto. Foi desvio de Qi durante o treino, não possessão. A mulher chamada Mãe Neve já admitiu: teve pressa demais ao ensinar a arte de energia interna e acabou fazendo mal a ele.\"",
    "justificativa": "Mantém o contraste entre desvio de Qi e possessão, sem acrescentar demônios nem fixar 害了人 como uma ruína abstrata.",
    "categorias": [
      "fidelidade",
      "dialogo"
    ]
  },
  {
    "ordem": 32,
    "texto": "Debaixo da cama, Gu Shenwei se assustou. Foi ele quem ensinou a arte de energia interna a Yao Nu e provocou de propósito o desvio de Qi. Por que a Mãe Neve assumiu a culpa?",
    "justificativa": "Desfaz as duas passivas com “fora” e explicita a responsabilidade que causa o espanto do protagonista.",
    "categorias": [
      "naturalidade",
      "coesao"
    ]
  },
  {
    "ordem": 33,
    "texto": "Seria para proteger a Senhorita das consequências daquela história de energia maligna?",
    "justificativa": "事件 é o caso ocorrido; “rumor” restringe sem apoio a razão que Gu Shenwei considera.",
    "categorias": [
      "fidelidade"
    ]
  },
  {
    "ordem": 36,
    "texto": "A voz de Han Shiqi ganhou um tom mais obsceno. Han Jinu entendeu e riu para agradá-lo. Debaixo da cama, o coração de Gu Shenwei disparou: o plano parecia não ter falhas, mas eles encontraram um Assassino que não acreditava em possessão.",
    "justificativa": "陪笑 é rir para agradar; o texto não exige “forçou”. Não crer na possessão é o obstáculo concreto ao plano, e não desprezar toda superstição. Remove “acabara”.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 38,
    "texto": "Jinu desceu da cama, sorrindo. Gu Shenwei mudou um pouco a posição da faquinha, decidido a atacar assim que Jinu se afastasse. O problema era não saber exatamente onde Han Shiqi estava na cama. Só podia tentar adivinhar.",
    "justificativa": "Preserva a faquinha de cortar carne do capítulo anterior, que não virou uma adaga. Desfaz a oração final mecânica.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 39,
    "texto": "A chance de atingir um ponto vital com aquele golpe era mínima, mas ele já não tinha escolha.",
    "justificativa": "O golpe ainda é planejado. Remove o início “ao desferir”, que pode sugerir uma ação já em curso.",
    "categorias": [
      "coesao",
      "naturalidade"
    ]
  },
  {
    "ordem": 40,
    "texto": "De repente, Han Shiqi perguntou da cama: \"Quem está aí se escondendo?\"",
    "justificativa": "Naturaliza a suspeita contida em 鬼鬼祟祟, sem a frase solta “Agindo na surdina”.",
    "categorias": [
      "dialogo",
      "naturalidade"
    ]
  },
  {
    "ordem": 43,
    "texto": "\"Já falei que vou chamar vocês dois. Voltem para o quarto, fora daqui!\" gritou Han Jinu, irritado.",
    "justificativa": "Recupera a ordem de voltar e ajusta o dicendi após exclamação; troca “vociferou” por verbo corrente.",
    "categorias": [
      "dialogo",
      "tipografia",
      "naturalidade"
    ]
  },
  {
    "ordem": 48,
    "texto": "\"Pirralho desgraçado, cada dia mais atrevido! Agora vai me responder?\"",
    "justificativa": "Mantém o insulto e a repreensão sem a formulação solene “tendo a audácia de me retrucar”.",
    "categorias": [
      "dialogo",
      "naturalidade"
    ]
  },
  {
    "ordem": 52,
    "texto": "Han Jinu foi chamar Qi Nu. Gu Shenwei se tranquilizou e moveu a faca de volta ao ponto original, em silêncio. Conhecia tão bem aquele ponto que podia encontrá-lo pelo tato, mesmo no escuro.",
    "justificativa": "O referente encontrado no escuro é o ponto do ataque, não a faca. Preserva a natureza tátil de 摸得到.",
    "categorias": [
      "fidelidade",
      "coesao"
    ]
  },
  {
    "ordem": 53,
    "texto": "Mas havia outro problema. Han Shiqi e Jinu ficaram tempo demais conversando na cama. Quase quinze minutos se passaram, e Gu Shenwei respirava tão devagar havia tanto tempo que já sentia um aperto no peito. Precisava muito de uma boa lufada de ar fresco.",
    "justificativa": "减缓呼吸 é respirar mais devagar, não ficar sem respirar durante todo o período. Remove o acúmulo de passados compostos.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 57,
    "texto": "\"Vamos satisfazer o senhor\", disse Qi Nu. Ainda não conseguia chamá-lo de Terceiro Irmão, e Gu Shenwei percebeu um pouco de nervosismo na voz.",
    "justificativa": "Remove “forçar a boca” e naturaliza a resposta formal, preservando a dificuldade com o tratamento e o nervosismo audível.",
    "categorias": [
      "dialogo",
      "naturalidade"
    ]
  },
  {
    "ordem": 58,
    "texto": "\"Satisfeito...\", repetiu Han Shiqi, com malícia.",
    "justificativa": "“Malícia ambígua” é redundante neste contexto; 暧昧 marca a insinuação na repetição.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 59,
    "texto": "\"Terceiro Irmão, vamos para a cama\", disse Xie Nu. O garoto, que em geral falava pouco, parecia até mais calmo que o irmão naquele momento.",
    "justificativa": "Substitui “sugeriu a voz” e “quase não abria a boca” por formulações naturais, preservando a comparação entre os irmãos.",
    "categorias": [
      "naturalidade",
      "dialogo"
    ]
  },
  {
    "ordem": 61,
    "texto": "Gu Shenwei mal entendia o que aconteceu depois. Aqueles sons e gemidos lhe pareciam estranhos e repugnantes, como algo muito sujo que insistisse em entrar por seus ouvidos. No começo, ficou vermelho e quase perdeu o controle da respiração. Logo, porém, vieram o ódio e a raiva. Ele conteve os pensamentos dispersos e concentrou toda a atenção no ponto a um metro acima de sua cabeça.",
    "justificativa": "Mantém a percepção limitada e a imagem dos sons invasivos. Remove repetição de “ouvidos”, “refreando” e a construção participial sem ampliar o conteúdo da cena.",
    "categorias": [
      "naturalidade",
      "ritmo"
    ]
  },
  {
    "ordem": 62,
    "texto": "Os irmãos tentaram de tudo, mas Han Shiqi dessa vez preferia ficar de pé e não queria ir para a cama de jeito nenhum.",
    "justificativa": "Naturaliza 浑身解数 sem “artimanhas/terminantemente” e preserva a recusa que impede o plano.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 63,
    "texto": "Passaram quase mais quinze minutos, os mais longos da vida dos três garotos. De repente, Han Shiqi soltou um breve grito. Depois veio o som de alguém apanhando.",
    "justificativa": "叫了一声 é uma breve vocalização, não necessariamente um arquejo. Remove “pancadas desferidas” e preserva a ordem dos sons sem identificar a vítima.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 65,
    "texto": "\"Pode me matar. Vim aqui para matar você e me vingar\", disse Qi Nu.",
    "justificativa": "O original não especifica grito nem duas exclamações. Preserva a declaração e sua hostilidade sem intensificá-la.",
    "categorias": [
      "fidelidade",
      "dialogo"
    ]
  },
  {
    "ordem": 67,
    "texto": "*Devo sair para ajudar ou continuar esperando debaixo da cama?*",
    "justificativa": "守着, neste contexto, é manter a posição à espera do ataque, não montar guarda.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 68,
    "texto": "*Plac, plac, plac.* O som dos golpes se repetia, acompanhado pelos gritos cada vez mais excitados de Han Shiqi:",
    "justificativa": "Mantém a onomatopeia e a progressão da voz sem o acréscimo de “urros”.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 69,
    "texto": "\"Porra, o meu jeito é muito mais divertido. Vou mostrar umas coisas que não fiz da última vez.\"",
    "justificativa": "Remove a causa inventada “não deu tempo” e conserva o insulto e a ameaça, sem acrescentar detalhes ao que ele anuncia.",
    "categorias": [
      "fidelidade",
      "dialogo"
    ]
  },
  {
    "ordem": 70,
    "texto": "\"Solta o meu irmão!\" gritou Xie Nu.",
    "justificativa": "Remove a vírgula depois da exclamação, conforme a convenção de diálogo.",
    "categorias": [
      "tipografia"
    ]
  },
  {
    "ordem": 71,
    "texto": "Nas mãos de Han Shiqi, os irmãos eram como cordeirinhos indefesos. Seus gritos e tentativas de revidar só despertavam nele desejos ainda mais perversos.",
    "justificativa": "还击 inclui tentar revidar, não só resistir. Mantém a comparação do original e remove o adjetivo livresco “vis”.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 73,
    "texto": "Era Xie Nu. Fazia menos de um mês que aprendeu a língua das Planícies Centrais, e xingava com as mesmas palavras de Han Jinu.",
    "justificativa": "Remove “aprendera” e naturaliza a ligação entre a fala recém-aprendida e os insultos copiados.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 74,
    "texto": "*Bum!* Mais alguém caiu na cama. Pelo som, Gu Shenwei achou que fosse Qi Nu, jogado ali por Han Shiqi.",
    "justificativa": "Remove o colchão acrescentado, preservando a inferência de Gu Shenwei a partir do som.",
    "categorias": [
      "fidelidade"
    ]
  },
  {
    "ordem": 78,
    "texto": "A cama se agitava sem parar, e os gritos eram contínuos. Gu Shenwei ouvia tudo sem prestar atenção.",
    "justificativa": "Desfaz “balbúrdia/frenesi caótico/ouvidos moucos”, preservando a agitação acima dele e sua concentração no sinal.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 80,
    "texto": "O sinal finalmente soou. Gu Shenwei nem conseguiu distinguir quem gritou. O sangue subiu à cabeça. Queria usar toda a força, mas não conseguia; queria agir depressa, mas seus movimentos eram lentos, como se o frio o paralisasse.",
    "justificativa": "Preserva o bloqueio físico e a comparação com enrijecimento pelo frio, sem a repetição “ágil e veloz” e a personificação acrescentada dos movimentos.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 81,
    "texto": "A faquinha afiada subiu pela fresta entre as tábuas da cama sem encontrar resistência, como se atravessasse o vazio.",
    "justificativa": "Preserva a mesma faquinha de ponta e corrige “a adaga cravou para cima”, mantendo a fluidez inicial do golpe.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  }
];

const db = new Database(caminho, { readonly: !gravar, fileMustExist: true });
if (gravar) db.pragma('foreign_keys = ON');
const capitulo = db.prepare('SELECT id, prompt_id, provedor, modelo FROM capitulos WHERE obra_id=1 AND numero=21').get() as
  { id: number; prompt_id: number; provedor: string; modelo: string } | undefined;
if (!capitulo || capitulo.provedor !== 'gemini' || capitulo.modelo !== 'gemini-3.8-flash') throw new Error('Capítulo/modelo diverge da base revisada.');
const frases = db.prepare('SELECT * FROM frases WHERE capitulo_id=? ORDER BY ordem').all(capitulo.id) as Frase[];
if (frases.length !== 83 || frases.some(f => f.status_traducao !== 'traduzida' || f.texto_pt !== f.texto_pt_original_ia)) {
  throw new Error('Base mudou: esperadas 83 frases traduzidas, ainda iguais à primeira IA.');
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
  if (!propostaPodeIrAoStaging(travas)) throw new Error(`21.${p.ordem}: ${JSON.stringify(travas)}`);
  return { ...p, frase, travas };
});
const porOrdem = new Map(propostas.map(p => [p.ordem, p.texto]));
const composicao = frases.map(f => ({ ...f, texto_pt: porOrdem.get(f.ordem) ?? f.texto_pt }));
const estilo = analisarEstilo(composicao, prefs);
const consistencia = varrerConsistencia(composicao, separarPorChecagem(gama).checaveis);
// Falsos positivos confirmados pela leitura: substrings de palavras comuns.
// Não reescrever texto correto para satisfazer um detector por regex.
const falsosPositivos = new Set(['11|mais-que-perfeito|opera', '15|mais-que-perfeito|terceira', '49|unidade-chinesa|uma li']);
const alertasEstiloReais = estilo.violacoes.filter(v => !falsosPositivos.has(`${v.ordem}|${v.regra}|${v.trecho}`));
if (alertasEstiloReais.length || consistencia.violacoes.length) throw new Error(JSON.stringify({ estilo: estilo.violacoes, gama: consistencia.violacoes }));
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
console.log(JSON.stringify({ modo: gravar ? 'staging' : 'validacao', capitulo: 21, propostas: propostas.length,
  preservadas: frases.length - propostas.length, lote_id: loteId, existente, base_sha256: baseHash,
  estilo: estilo.violacoes, gama: consistencia.violacoes,
  alertas: validadas.flatMap(p => p.travas.map(t => ({ ordem: p.ordem, ...t }))),
}, null, 2));
db.close();
