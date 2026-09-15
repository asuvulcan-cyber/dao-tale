import Database from 'better-sqlite3';
import { normalizarPreferencias, type EntradaGlossario } from '@dao-tale/shared';
import { caminhoBanco } from '../src/config.js';
import { propostaPodeIrAoStaging, validarPropostaLiteraria } from '../src/revisao/literaria.js';
import { analisarEstilo } from '../src/traducao/estiloViolacoes.js';
import { varrerConsistencia } from '../src/traducao/consistencia.js';
import { separarPorChecagem } from '../src/traducao/glossarioChecavel.js';

type Proposta = { ordem: number; texto: string; justificativa: string; categorias: string[] };
type Frase = {
  id: number; ordem: number; paragrafo: number; texto_zh: string; texto_pt: string;
  texto_pt_original_ia: string | null; status_traducao: 'pendente' | 'traduzida' | 'erro';
};

const aplicar = process.argv.includes('--aplicar');
const rotulo = 'Revisão integral do capítulo 19 · tom local e naturalidade';
const criterios = [
  'Revisão integral contra o chinês, tomando o capítulo 18 revisado como linha de qualidade, não como molde de voz.',
  'Preservar sentido, imagem, densidade e tom local; entregar PT-BR natural sem formalizar, simplificar ou ornamentar o original.',
  'Remover decalques, abstrações burocráticas, léxico livresco sem apoio local e tempos verbais mecânicos.',
  'Propostas em staging: nenhum texto publicado é alterado sem aprovação individual do usuário.',
].join('\n');

const propostas: Proposta[] = [
  { ordem: 0, texto: 'Yao Nu encarou Huan Nu por um longo tempo, confuso e atordoado. Parecia não reconhecê-lo, ou talvez nem o enxergasse: seu olhar apenas passava por ele. De repente, o rosto ficou vermelho e ele agarrou com força o braço de Huan Nu:', justificativa: 'Desfaz o encadeamento traduzido e preserva a progressão visual do original em prosa direta.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 2, texto: '"Posso salvar você." Gu Shenwei arrancou o braço do aperto. "Primeiro, me dê a seda branca."', justificativa: 'Recupera a brusquidão de 生硬地抽出来 sem a locução abstrata “com gesto brusco”.', categorias: ['fidelidade', 'naturalidade', 'dialogo'] },
  { ordem: 4, texto: 'Yao Nu murmurou para si mesmo, como se nunca tivesse ouvido aquelas duas palavras. O vermelho do rosto foi sumindo, enquanto o peito arfava e os braços se debatiam com violência, golpeando a cama aquecida com estrondo. Então riu outra vez, até ficar rouco.', justificativa: 'Preserva os movimentos e o som de 梆梆, reduzindo o período mecânico e a adjetivação acumulada.', categorias: ['fidelidade', 'ritmo', 'naturalidade'] },
  { ordem: 5, texto: 'Gu Shenwei voltou a pressionar às pressas o ponto Tianchi de Yao Nu e canalizou seu fluxo interno pela Força Yin. Mas sua arte de energia interna era fraca demais para conter a Força Yang que devastava o corpo de Yao Nu como uma enchente. Gu Shenwei acabou exausto, sem conseguir acalmá-lo por um instante sequer.', justificativa: 'Aplica 内息 de modo contextual, remove “insuflou-lhe” e esclarece o sujeito final sem perder a imagem da enchente.', categorias: ['fidelidade', 'gama', 'naturalidade'] },
  { ordem: 6, texto: 'Só uma especialista como a Mãe Neve teria força suficiente para controlar o fluxo interno desordenado pelo desvio de Qi.', justificativa: 'Substitui “respiração interna em desvio” por uma relação natural e semanticamente clara.', categorias: ['fidelidade', 'gama', 'naturalidade'] },
  { ordem: 7, texto: 'Gu Shenwei desistiu de salvá-lo. Esquivando-se como podia dos braços que se debatiam, revistou Yao Nu mais uma vez e examinou com cuidado até suas partes íntimas, mas não encontrou nada. A seda branca devia estar escondida em outro lugar.', justificativa: 'Remove perífrases e o passado composto desnecessário, mantendo todas as ações concretas.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 8, texto: 'Depois de se debater por quase uma hora, Yao Nu ficou sem forças e aos poucos se acalmou. Os braços ainda se contraíam de vez em quando, e da garganta saíam arquejos roucos e entrecortados, como os últimos esforços de alguém se afogando.', justificativa: 'Torna a comparação e a sequência física naturais em português sem suavizar a agonia.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 10, texto: 'Gu Shenwei sacudiu Yao Nu com força, tentando arrancar dele o último sopro de vida.', justificativa: 'Troca “extrair” por verbo concreto compatível com 榨出 e com a urgência da cena.', categorias: ['lexico', 'naturalidade'] },
  { ordem: 11, texto: 'Yao Nu mergulhou num estado de confusão. O vermelho do rosto ia e voltava; às vezes reunia um pouco de força, apenas para gastá-la falando sem parar.', justificativa: 'Preserva a repetição de 来了又退 como movimento, sem a pontuação pesada e a “falação infinita”.', categorias: ['ritmo', 'naturalidade'] },
  { ordem: 12, texto: 'Não reconhecia Huan Nu nem percebia que havia outra pessoa ao lado. Só dizia coisas sem nexo: ora se gabava, ora xingava, ora implorava. Parecia um ator sozinho no palco, representando vários papéis.', justificativa: 'Naturaliza 独角戏 e conserva a alternância de vozes da imagem original.', categorias: ['fidelidade', 'naturalidade', 'ritmo'] },
  { ordem: 13, texto: 'Gu Shenwei perdeu de vez a esperança. A Vontade Divina só o ajudou a cumprir metade do plano: Yao Nu estava prestes a morrer, mas a seda branca que registrava o método de treinamento acelerado continuava desaparecida.', justificativa: 'Recupera o contraste central e substitui “sem paradeiro” por formulação corrente; a sequência já deixa a relação temporal clara.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 14, texto: 'Yao Nu ora melhorava, ora piorava, debatendo-se desde a manhã até o pôr do sol. Nenhum médico apareceu para tratá-lo, nem a Mãe Neve veio. Aos olhos de todos, era apenas um caso sem importância.', justificativa: 'Reduz redundância e preserva a indiferença seca do narrador.', categorias: ['ritmo', 'naturalidade'] },
  { ordem: 15, texto: 'Gu Shenwei se sentou no chão, com a cabeça apoiada na beirada da cama aquecida, e ouviu distraído a respiração entrecortada de Yao Nu e as palavras soltas que às vezes escapavam de sua boca. Não havia como tirar dali nenhuma pista sobre a seda branca. Yao Nu a esqueceu por completo; já nem se lembrava da Fortaleza do Peng Dourado. Só falava de pessoas e coisas do passado.', justificativa: 'Desfaz “era impossível esperar arrancar”, evita repetições mecânicas e mantém a progressão do pensamento.', categorias: ['naturalidade', 'ritmo', 'fidelidade'] },
  { ordem: 16, texto: 'O antigo senhor de Yao Nu devia ser desprezível, e por isso ele guardava tanto rancor do mundo. Foi o que Gu Shenwei concluiu em meio àquela confusão de palavras.', justificativa: 'Preserva a inferência de Gu Shenwei com sintaxe mais direta e referente legível.', categorias: ['naturalidade', 'coesao'] },
  { ordem: 17, texto: 'Estranhamente, Gu Shenwei não sentia medo algum ao lado de um moribundo. Sua atenção estava toda voltada para os planos futuros. Comparada à de Yao Nu, que avançava passo a passo para a morte, sua própria vida não estava muito mais segura. Talvez, em um ou dois dias, ele seguisse o mesmo caminho.', justificativa: 'Corrige “vida com pouca garantia” e o truncamento “bastasse passar”, preservando a comparação sombria.', categorias: ['naturalidade', 'ritmo', 'fidelidade'] },
  { ordem: 18, texto: 'Quando se encontrassem no inferno, como explicaria aquilo a Yao Nu?', justificativa: 'Remove a locução solene e corrige a regência sem mudar o pensamento.', categorias: ['naturalidade', 'lexico'] },
  { ordem: 19, texto: '"Ei, fui eu que causei seu desvio de Qi, mas você escondeu a seda branca e acabou me matando também. Estamos quites."', justificativa: 'Naturaliza a confissão imaginada e preserva a causalidade dos dois lados.', categorias: ['dialogo', 'naturalidade', 'fidelidade'] },
  { ordem: 21, texto: 'Talvez Yao Nu já tivesse encontrado um novo protetor no inferno e não se importasse de virar fantasma. Mas, se ainda tentasse alguma coisa, Gu Shenwei tomou uma decisão: mesmo no inferno, mataria Yao Nu outra vez.', justificativa: 'Remove “pretensões indevidas” e mantém o raciocínio hostil e concreto do protagonista.', categorias: ['naturalidade', 'coesao', 'ritmo'] },
  { ordem: 23, texto: 'De repente, Yao Nu chamou seu nome. A voz estava calma, como se nada tivesse acontecido. Gu Shenwei mal sentiu medo até aquele momento, mas então levou um susto e se virou para o garoto moribundo na cama aquecida.', justificativa: 'Dá peso à súbita lucidez, preserva o contraste e substitui “teve o coração num sobressalto” por reação natural.', categorias: ['ritmo', 'naturalidade'] },
  { ordem: 24, texto: 'Os olhos de Yao Nu brilhavam de um jeito assustador. A luz do sol se apagava lá fora, mas suas pupilas pareciam arder com o clarão estranho do último lampejo antes da morte.', justificativa: 'Preserva 回光返照 e a oposição entre a luz externa e os olhos sem explicação prolixa.', categorias: ['fidelidade', 'ritmo', 'naturalidade'] },
  { ordem: 26, texto: 'Essas foram as últimas palavras de Yao Nu. Como se de repente pudesse enxergar o coração das pessoas, ele adivinhou os pensamentos de Huan Nu e pronunciou aquela frase, a meio caminho entre ameaça e expectativa. Depois soltou um longo suspiro e deixou a cabeça tombar para o lado.', justificativa: 'Remove a repetição “capacidade de ler/leu a mente” e preserva a ambivalência de 威胁 e 期待.', categorias: ['fidelidade', 'naturalidade', 'ritmo'] },
  { ordem: 27, texto: 'O coração de Gu Shenwei deu outro salto. Ele levou a mão ao nariz de Yao Nu para sentir sua respiração e soube que estava morto.', justificativa: 'Recupera a ação concreta de 探鼻息 e elimina a repetição pesada de nomes e pronomes.', categorias: ['naturalidade', 'fidelidade'] },
  { ordem: 28, texto: 'Sem chamar ninguém, Gu Shenwei carregou o cadáver sozinho nas costas, saiu pelo portão oeste e o lançou da ponta do Penhasco do Grito Fantasma. Seu corpo ficou mais leve, mas uma pedra continuava pesando sobre seu coração, impossível de afastar — talvez para sempre.', justificativa: 'Preserva o paralelo físico e moral do original, que a versão inicial tornou sintaticamente abstrato.', categorias: ['fidelidade', 'ritmo', 'naturalidade'] },
  { ordem: 29, texto: 'Quando voltou ao dormitório, os outros garotos se afastaram dele com todo o cuidado. Gu Shenwei subiu na cama aquecida, mas até o mais próximo se manteve a mais de um metro, como se temesse pegar a energia maligna deixada por Yao Nu depois de morrer.', justificativa: 'Remove o tique “passaram a”, reduz a repetição explicativa e preserva a superstição dos garotos.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 30, texto: 'Gu Shenwei não tinha forças para se importar. Exausto, fechou os olhos e caiu num sono profundo, sem energia sequer para pensar em como enfrentaria Han Shiqi quando ele voltasse.', justificativa: 'Concentra a frase no esgotamento e elimina a sequência abstrata de auxiliares.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 31, texto: 'As coisas não saíram como ele esperava. Na manhã seguinte, Han Jinu acordou os garotos batendo uma vara de pau-rosa na beirada da cama aquecida. Em voz alta, anunciou que não precisavam ir ao pátio do Oitavo Jovem Mestre prestar seus cumprimentos: a Oitava Jovem Senhora desconfiava que o grupo inteiro carregava energia maligna. Passariam o dia limpando o Pátio da Lenha Empilhada, pois o Terceiro Irmão estava de volta e dormiria ali naquela noite.', justificativa: 'Divide o anúncio longo em unidades naturais e remove “já tinha voltado”, preservando títulos, causa e cronologia.', categorias: ['ritmo', 'naturalidade', 'gama'] },
  { ordem: 32, texto: 'Gu Shenwei se assustou. Ainda não sabia como enfrentar aquele perigo; pelo visto, teria de procurar outra oportunidade para lutar.', justificativa: 'Substitui as locuções abstratas por uma formulação direta sem mudar o plano do personagem.', categorias: ['naturalidade', 'lexico'] },
  { ordem: 33, texto: 'Han Jinu, porém, acabou resolvendo o problema por enquanto. Seu olhar estava cheio de repulsa, mas era para outra pessoa. "Aquele garoto já morreu?"', justificativa: 'Recupera o contraste de 结果却 e evita “no olhar do homem havia”.', categorias: ['coesao', 'naturalidade', 'dialogo'] },
  { ordem: 37, texto: '"Tire a roupa e mande queimá-la. Você está proibido de sair deste quarto por três dias."', justificativa: 'Corrige 不准出这门: a proibição é atravessar a porta/sair do quarto, não “sair da porta”.', categorias: ['fidelidade', 'dialogo'] },
  { ordem: 38, texto: 'Gu Shenwei ficou um pouco mais tranquilo. Não se importava que pensassem estar possuído por energia maligna; assim, Han Shiqi provavelmente o deixaria em paz por algum tempo.', justificativa: 'Esclarece que a contaminação é atribuída pelos outros e elimina conectivos formais.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 39, texto: 'Gu Shenwei escapou, mas alguém teria de sofrer em seu lugar. Han Jinu apontou para Qi Nu e Xie Nu. "Venham comigo."', justificativa: 'Remove mais-que-perfeito livresco e torna direta a transferência do castigo.', categorias: ['naturalidade', 'ritmo', 'dialogo'] },
  { ordem: 40, texto: 'Os outros garotos saíram depressa logo depois. Ninguém queria ficar no mesmo quarto que Huan Nu.', justificativa: 'Elimina “também/em seguida” e o ponto e vírgula desnecessário.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 42, texto: 'Depois de se vestir, Gu Shenwei revistou o quarto outra vez, sem deixar nenhum canto de fora. Tentou até erguer cada lajota que pudesse ser solta para ver o que havia embaixo.', justificativa: 'Remove “lajotas que dessem para ser alavancadas” e preserva a busca minuciosa com sujeito claro.', categorias: ['naturalidade', 'fidelidade'] },
  { ordem: 43, texto: 'A seda branca não estava ali. Yao Nu a escondeu muito bem antes de morrer, mas Gu Shenwei começou a desconfiar que ela talvez já tivesse sido destruída. Depois de decorar o texto e as imagens, Yao Nu não precisava mais guardá-la.', justificativa: 'Remove a redundância “local muito bem oculto” e reduz o empilhamento de “tinha”; o adjunto temporal preserva a anterioridade.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 44, texto: 'Os outros garotos não ousaram voltar ao dormitório. Perto do meio-dia, porém, os irmãos Qi Nu e Xie Nu retornaram. Também tinham sido dispensados do trabalho e agora esperavam apenas pelos "favores" de Han Shiqi.', justificativa: 'Substitui “dedicavam-se a aguardar” e recupera o foco irônico de 专心等待.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 45, texto: 'Os três ficaram sozinhos no quarto, sem trocar uma palavra. O clima era constrangedor.', justificativa: 'Reproduz 默默无语 em ação concreta, sem a ligação burocrática por “e”.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 46, texto: 'Os três poderiam ter se tornado amigos, mas um mal-entendido os mantinha afastados — e Gu Shenwei não podia explicá-lo.', justificativa: 'Remove “passaram a se ignorar” e a repetição do substantivo sem apagar a ironia de 偏偏.', categorias: ['naturalidade', 'coesao'] },
  { ordem: 47, texto: 'Até então, os dois irmãos sentiam uma vergonha terrível daqueles "favores". Naquele momento, porém, pareciam muito calmos. Nem Xie Nu, o mais novo, choramingava como de costume.', justificativa: 'Evita o passado composto e torna natural o contraste temporal que estrutura o original.', categorias: ['ritmo', 'naturalidade'] },
  { ordem: 48, texto: 'Depois de um longo silêncio, Qi Nu se aproximou e disse: "Você matou Yao Nu."', justificativa: 'Substitui “tomou a iniciativa de se aproximar” por ação concreta e mantém o dicendi no parágrafo da fala.', categorias: ['naturalidade', 'dialogo'] },
  { ordem: 49, texto: 'Qi Nu ainda não dominava bem a língua das Planícies Centrais, mas falou com absoluta certeza. Gu Shenwei não entendeu o que ele pretendia; sustentou seu olhar e não respondeu.', justificativa: 'Troca a descrição metalinguística “tom afirmativo” pelo efeito categórico da fala.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 50, texto: '"Tem mais uma pessoa. Você precisa matar."', justificativa: 'Preserva a fala dura e pouco fluente de Qi Nu, explicitada pelo contexto seguinte, sem inventar “quero”.', categorias: ['fidelidade', 'dialogo'] },
  { ordem: 51, texto: 'Qi Nu continuou falando como se afirmasse um fato, mas Gu Shenwei percebeu que aquilo era um pedido de ajuda.', justificativa: 'Evita repetir “tom afirmativo” e preserva o contraste entre forma e intenção.', categorias: ['naturalidade', 'fidelidade'] },
  { ordem: 54, texto: 'Gu Shenwei sabia quem era. Entre os garotos, só ele conhecia o nome "Han Shiqi"; Han Jinu sempre o chamava de "Terceiro Irmão". Mesmo assim, Gu Shenwei não sabia ao certo se "Han Shiqi" era o nome verdadeiro do Assassino.', justificativa: 'Corrige as aspas simples, explicita Jinu e naturaliza a dúvida final sem perder o posto formal.', categorias: ['tipografia', 'coesao', 'gama'] },
  { ordem: 55, texto: 'Gu Shenwei não duvidava de que os irmãos queriam matar Han Shiqi, mas continuou cauteloso e não respondeu de imediato. Afinal, eles não eram amigos de verdade.', justificativa: 'Desfaz a intercalação rígida e preserva a cautela do protagonista.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 56, texto: '"Queremos apagar nossa desonra. Você também não quer sofrer essa desonra. Vai se juntar a nós?"', justificativa: 'Preserva a repetição e a rigidez da fala imperfeita de Qi Nu, usando uma colocação natural para 洗刷耻辱.', categorias: ['dialogo', 'fidelidade', 'naturalidade'] },
  { ordem: 57, texto: 'Por ainda falar com dificuldade, Qi Nu soava ríspido. Seus olhos, porém, sob as sobrancelhas grossas, mostravam sinceridade e determinação — algo muito raro entre os escravos da Fortaleza do Peng Dourado.', justificativa: 'Remove “obstinação/raríssimo” e mantém o contraste entre a fala dura e o olhar sincero.', categorias: ['naturalidade', 'fidelidade'] },
  { ordem: 58, texto: '"Estou dentro", disse Gu Shenwei.', justificativa: 'Naturaliza 我加入 no contexto de adesão ao plano e preserva o dicendi deslocado do parágrafo seguinte.', categorias: ['dialogo', 'naturalidade'] },
  { ordem: 59, texto: 'Gu Shenwei não tinha por que se recusar a ajudar nem tentar enganar Qi Nu.', justificativa: 'Substitui “usar de artimanhas diante de” por português corrente e explicita naturalmente o sujeito no novo parágrafo.', categorias: ['naturalidade', 'lexico', 'coesao'] },
  { ordem: 60, texto: 'Xie Nu também se aproximou. Os três seguraram os antebraços uns dos outros para mostrar que confiavam entre si. Já se observavam havia muito tempo; agora podiam ser francos.', justificativa: 'Converte “sinal de confiança recíproca” em ação e preserva a conclusão do narrador.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 61, texto: 'Qi Nu era alto, quase meia cabeça mais alto que Gu Shenwei. Havia nele uma mistura de rudeza e orgulho, como um filhote do rei das feras vindo da vastidão selvagem e perdido por acaso no meio da prosperidade dos homens. Não se encaixava em lugar nenhum e olhava tudo de cima.', justificativa: 'Preserva a imagem literária do original sem empilhar “altivez”, “ermos” e “paragens prósperas”.', categorias: ['fidelidade', 'naturalidade', 'ritmo'] },
  { ordem: 62, texto: 'Seu irmão mais novo, Xie Nu, parecia um animalzinho ainda na infância. Seguia Qi Nu por toda parte e falava pouco. Nunca se adaptou à condição nem à vida de escravo; ainda mais que Gu Shenwei, parecia filho de uma família rica.', justificativa: 'Naturaliza a comparação com o filhote e traduz 子弟 como filho de família rica, não “jovem”.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 63, texto: 'Com aquele temperamento, era natural que ninguém gostasse dos irmãos. Han Shiqi os tratava como brinquedos; Han Jinu, como presentes e rivais; para a Mãe Neve, eram difíceis de controlar. Em suma, recebiam mais castigos que os outros garotos, e Qi Nu suportava quase todos.', justificativa: 'Remove “rebeldes à disciplina” e torna paralela a enumeração dos três julgamentos.', categorias: ['naturalidade', 'ritmo', 'fidelidade'] },
  { ordem: 64, texto: 'Os meses de escravidão deixaram marcas claras em Qi Nu. Já não restava em seu rosto nenhum traço infantil; o olhar estava sempre alerta, e os lábios, apertados. Tudo isso o tornava ainda menos simpático aos outros.', justificativa: 'Remove “candura”, “mantinha-se” e “desse modo”, preservando o endurecimento visível e o efeito que ele causava nas pessoas.', categorias: ['naturalidade', 'fidelidade'] },
  { ordem: 65, texto: 'Gu Shenwei era a única exceção. Via nos dois irmãos a mesma raiva, o mesmo ódio e o mesmo medo que carregava dentro de si. O assassino das montanhas nevadas os perseguia desde muito longe, prova de que, assim como ele, os dois tinham passado por uma tragédia.', justificativa: 'Preserva a identificação emocional e substitui “grandes desgraças” por uma relação causal clara.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 66, texto: 'Nenhum deles falava do próprio passado. Não adiantava tocar nas dores mais profundas: desabafar não as tornaria menores nem traria alívio; só deixaria ainda mais evidente o quanto os sobreviventes eram impotentes e frágeis.', justificativa: 'Mantém o tom reflexivo do original sem transformar a passagem em ensaio abstrato com “evocá-las” e “vazão”.', categorias: ['fidelidade', 'naturalidade', 'ritmo'] },
  { ordem: 67, texto: 'Agora os três enfrentavam o mesmo problema, o mesmo perigo e o mesmo inimigo. Decidiram se vingar e combater a violência matando, mas não seria fácil. Han Shiqi não era como Yao Nu, que nada entendia de artes marciais: era um Assassino da Fortaleza do Peng Dourado. Mesmo sem estar entre os melhores, era muito mais forte que os três juntos.', justificativa: 'Remove três construções solenes e preserva o contraste objetivo entre Yao Nu e o Assassino.', categorias: ['naturalidade', 'fidelidade', 'gama'] },
  { ordem: 68, texto: '"Tenho um plano", disse Qi Nu.', justificativa: 'Une a fala ao dicendi que o original põe na frase seguinte, evitando um parágrafo novo iniciado por “Qi Nu disse”.', categorias: ['dialogo', 'coesao'] },
  { ordem: 69, texto: 'Esperava por aquele dia havia muito tempo. Para matar o homem que humilhou os dois irmãos, Qi Nu estava disposto a correr qualquer risco.', justificativa: 'Remove o dicendi solto, a repetição do nome e “vilão”, preservando a duração e a disposição de arriscar tudo.', categorias: ['naturalidade', 'ritmo', 'fidelidade'] },
];

const db = new Database(caminhoBanco(), { readonly: !aplicar, fileMustExist: true });
if (aplicar) db.pragma('foreign_keys = ON');
const capitulo = db.prepare('SELECT id, obra_id, numero FROM capitulos WHERE numero=19').get() as
  | { id: number; obra_id: number; numero: number }
  | undefined;
if (!capitulo) throw new Error('Capítulo 19 não encontrado.');
const frases = db.prepare('SELECT id, capitulo_id, ordem, paragrafo, texto_zh, texto_pt, texto_pt_original_ia, status_traducao FROM frases WHERE capitulo_id=? ORDER BY ordem').all(capitulo.id) as Frase[];
if (frases.length !== 70) throw new Error(`Esperadas 70 frases; encontradas ${frases.length}.`);
const gama = db.prepare('SELECT * FROM glossario WHERE obra_id=? ORDER BY id').all(capitulo.obra_id) as EntradaGlossario[];
const porOrdem = new Map(frases.map((f) => [f.ordem, f]));
const ordens = new Set<number>();
const validadas = propostas.map((p) => {
  if (ordens.has(p.ordem)) throw new Error(`Proposta duplicada: 19.${p.ordem}`);
  ordens.add(p.ordem);
  const frase = porOrdem.get(p.ordem);
  if (!frase) throw new Error(`Frase inexistente: 19.${p.ordem}`);
  if (p.texto.trim() === frase.texto_pt.trim()) throw new Error(`Proposta sem mudança: 19.${p.ordem}`);
  const indice = frases.indexOf(frase);
  const anterior = frases[indice - 1];
  const inicio = !anterior || anterior.paragrafo !== frase.paragrafo;
  const travas = validarPropostaLiteraria({
    ...frase,
    inicio_paragrafo: inicio,
    apos_fala_em_outro_paragrafo: Boolean(inicio && anterior && /^[\s*_]*["“].*["”][\s*_]*$/su.test(anterior.texto_pt.trim())),
  }, {
    ordem: p.ordem, texto_revisado: p.texto, justificativa: p.justificativa,
    categorias: p.categorias as never, confianca: 'alta',
  }, gama);
  if (!propostaPodeIrAoStaging(travas)) {
    throw new Error(`19.${p.ordem} bloqueada: ${travas.filter((t) => t.gravidade === 'bloqueio').map((t) => t.mensagem).join(' | ')}`);
  }
  return { ...p, frase, travas };
});

let loteId: number | null = null;
let existente = false;
if (aplicar) {
  const anterior = db.prepare('SELECT id FROM revisao_literaria_lotes WHERE obra_id=? AND rotulo=?').get(capitulo.obra_id, rotulo) as { id: number } | undefined;
  existente = Boolean(anterior);
  loteId = anterior?.id ?? Number(db.transaction(() => {
    const id = Number(db.prepare('INSERT INTO revisao_literaria_lotes (obra_id,rotulo,criterios) VALUES (?,?,?)').run(capitulo.obra_id, rotulo, criterios).lastInsertRowid);
    const inserir = db.prepare('INSERT INTO revisoes_literarias (lote_id,frase_id,texto_vigente_base,texto_revisado,justificativa,categorias) VALUES (?,?,?,?,?,?)');
    for (const p of validadas) inserir.run(id, p.frase.id, p.frase.texto_pt, p.texto, p.justificativa, JSON.stringify(p.categorias));
    return id;
  })());
}

const alertas = validadas.flatMap((p) => p.travas.filter((t) => t.gravidade === 'alerta').map((t) => ({ ordem: p.ordem, ...t })));
const textoPorOrdem = new Map(validadas.map((p) => [p.ordem, p.texto]));
const capituloRevisado = frases.map((f) => ({ ...f, texto_pt: textoPorOrdem.get(f.ordem) ?? f.texto_pt }));
const preferenciasBrutas = db.prepare('SELECT preferencias FROM prompts WHERE id=(SELECT prompt_id FROM capitulos WHERE id=?)').get(capitulo.id) as { preferencias: string | null };
let preferencias: unknown = null;
try { preferencias = JSON.parse(preferenciasBrutas.preferencias ?? 'null'); } catch { /* normalizador aplica o padrão */ }
const estilo = analisarEstilo(capituloRevisado, normalizarPreferencias(preferencias));
const consistencia = varrerConsistencia(capituloRevisado as never, separarPorChecagem(gama).checaveis);
console.log(JSON.stringify({
  modo: aplicar ? 'staging' : 'validacao', capitulo: 19, frases: frases.length,
  propostas: validadas.length, inalteradas: frases.length - validadas.length,
  lote_id: loteId, existente, alertas,
  estilo: estilo.violacoes,
  consistencia: consistencia.violacoes.map((v) => ({ ordem: v.ordem, termo_zh: v.termo_zh, termo_pt: v.termo_pt })),
}, null, 2));
db.close();
