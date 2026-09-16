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
const rotulo = 'Revisão integral do capítulo 22 · Gemini 3.8 Flash';
const criterios = [
  'Revisão editorial assistida contra o chinês, Alfa 6.3, Beta e Delta 2.4; capítulo 21 revisado como referência de qualidade.',
  'Preservar sentido, imagens, voz e ambiguidades; corrigir referências, medidas, literalidade e registro sem uniformizar a prosa.',
  'Propostas elaboradas pelo assistente, ainda não aprovadas pelo usuário. Nenhuma alteração automática no texto vigente.',
].join('\n');
type Proposta = { ordem: number; texto: string; justificativa: string; categorias: CategoriaRevisaoLiteraria[] };
const propostas: Proposta[] = [
  {
    "ordem": 0,
    "texto": "Enfiar a faca para cima e virar o corpo imediatamente para sair do caminho.",
    "justificativa": "Preserva a sequência do movimento ensaiado, retomada na frase seguinte, e evita “cravou para cima” e “para esquivar”.",
    "categorias": [
      "naturalidade",
      "coesao"
    ]
  },
  {
    "ordem": 1,
    "texto": "Gu Shenwei treinou aquele movimento inúmeras vezes. Mas, na hora de agir, apesar da urgência que sentia, os músculos do corpo inteiro ficaram duros. Parecia mesmo estar sob um feitiço: movia-se devagar, como num pesadelo.",
    "justificativa": "Remove “o coração ardesse/retesarem” e o período carregado de concessivas. Mantém a urgência em contraste com o bloqueio dos músculos.",
    "categorias": [
      "naturalidade",
      "ritmo"
    ]
  },
  {
    "ordem": 2,
    "texto": "O sangue subia sem controle para a cabeça. Os braços e as pernas tinham muito menos força do que ele precisava.",
    "justificativa": "Naturaliza a fraqueza física sem a combinação pouco clara “os membros reagiam fracos e frouxos”.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 3,
    "texto": "Por fim, saiu debaixo da cama e viu Xie Nu encolhido no chão, com o rosto enterrado entre os braços. Seu corpo pequeno e nu tremia sem parar.",
    "justificativa": "Remove “a tremer convulsivamente” e conserva a postura e o tremor, sem acrescentar intensidade clínica.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 4,
    "texto": "O medo de Xie Nu, porém, acalmou Gu Shenwei. Ele se livrou do pesadelo que o prendia, levantou-se de imediato, virou e saltou na cama com a agilidade de um mestre experiente em artes da leveza.",
    "justificativa": "Mantém o contraste que o tira da paralisia e a comparação marcial, sem “recobrar/pôs-se/perito consumado”.",
    "categorias": [
      "naturalidade",
      "ritmo"
    ]
  },
  {
    "ordem": 7,
    "texto": "Qi Nu também estava nu. Fazia força com cada músculo do corpo, o rosto retorcido, os olhos arregalados como se fossem saltar para fora. Apertava tanto os dentes contra o lábio inferior que já sangrava.",
    "justificativa": "Naturaliza a ligação entre esforço e expressão, removendo “por aplicar/exibia” sem ampliar a descrição.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 8,
    "texto": "De repente, Gu Shenwei sentiu um pouco de medo. Empurrou Qi Nu de leve. \"Chega, ele morreu.\"",
    "justificativa": "有点害怕 é sentir um pouco de medo. Remove “foi tomado por um lampejo” e a redundância “empurrãozinho de leve”.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 9,
    "texto": "Qi Nu estava no limite das forças, bem menos firme do que parecia. Ao toque, caiu sentado na cama. Abriu a boca, atordoado, e repetiu uma palavra na língua de seu povo que Gu Shenwei não entendia.",
    "justificativa": "Remove “esgotara” e “abobado”, que dá um tom inadequado ao estado de choque. A palavra é incompreensível para Gu Shenwei, não desprovida de sentido.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 13,
    "texto": "Gu Shenwei pulou depressa da cama e impediu Xie Nu a tempo. \"Cuidado, não deixe sair sangue demais.\"",
    "justificativa": "Remove a abstração “conteve o ímpeto”, preservando a interrupção e o cuidado com o sangue.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 14,
    "texto": "Gu Shenwei entrou de novo debaixo da cama e retirou o cabo da faca. Qi Nu e Xie Nu também voltaram a si. Juntos, ergueram o corpo devagar, até a faca passar inteira pela fresta entre as tábuas. Depois viraram o corpo.",
    "justificativa": "尖刀 é a faca inteira, não só a ponta. Remove “recobraram os sentidos” e mantém a sequência física de retirar o corpo preso à faca.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 15,
    "texto": "Apesar dos muitos imprevistos, o ataque saiu ainda melhor do que imaginavam.",
    "justificativa": "Remove “saíra” e a comparação artificial “mais perfeito”, preservando o êxito inesperado.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 16,
    "texto": "A faquinha acertou em cheio o coração de Han Shiqi. Ele morreu quase sem se debater e perdeu pouco sangue: só ficou uma mancha muito pequena na roupa de cama.",
    "justificativa": "Remove três mais-que-perfeitos simples e “diminuta/acolchoados”, preservando a causa da morte aparente e a pouca quantidade de sangue.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 17,
    "texto": "A chama da vela oscilava. Os três garotos olhavam o morto em silêncio, como se lamentassem sua morte ou admirassem uma obra bem-feita.",
    "justificativa": "Preserva a ambiguidade entre luto e satisfação, sem transformar 致哀 em cerimônia póstuma nem 佳作 em superlativo.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 18,
    "texto": "Depois de mais um tempo, cada um começou a fazer a parte que combinaram antes.",
    "justificativa": "Recupera a divisão das tarefas de 分头 e remove “puseram-se em movimento”.",
    "categorias": [
      "naturalidade",
      "coesao"
    ]
  },
  {
    "ordem": 19,
    "texto": "Qi Nu e Xie Nu se vestiram. Um saiu para ver o que os outros faziam no pátio; o outro ficou com Gu Shenwei para recolher os pertences de Han Shiqi: algumas roupas, um sabre estreito, uma adaga, a placa de cintura de Assassino, quatro ou cinco frascos, lenços e outras coisas.",
    "justificativa": "Remove “sondar/movimentos alheios/permaneceu”, mantendo todos os objetos e a divisão do trabalho.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 21,
    "texto": "Com aquela placa, era possível circular por muitos lugares da Fortaleza do Peng Dourado. Gu Shenwei queria guardá-la, mas hesitou um pouco e desistiu. Era só um garoto; mostrar uma placa de cintura de Assassino despertaria ainda mais suspeitas.",
    "justificativa": "许多地方 é muitos lugares, não quase toda a Fortaleza. Naturaliza a hesitação e preserva o risco da identificação.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 22,
    "texto": "\"Pode ficar com ela. É um troféu de guerra.\"",
    "justificativa": "Naturaliza 战利品 no diálogo sem “despojo”, conservando a ideia de um objeto conquistado ao inimigo.",
    "categorias": [
      "dialogo",
      "lexico"
    ]
  },
  {
    "ordem": 23,
    "texto": "Qi Nu guardou a adaga e os frascos por dentro da roupa, junto ao peito. Na tradição de seu povo, tudo o que era do morto ficava com quem o matou.",
    "justificativa": "怀里 é dentro da roupa junto ao peito, não dentro do próprio peito. Remove “matara” e a repetição “pertences pertenciam”.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 24,
    "texto": "Gu Shenwei balançou a cabeça, enfiou a placa entre as roupas e enrolou tudo numa trouxa. \"É perigoso demais. Melhor não guardar nada dele.\"",
    "justificativa": "Substitui “meneou” pelo gesto corrente, preservando a recusa e a organização dos objetos.",
    "categorias": [
      "naturalidade",
      "lexico"
    ]
  },
  {
    "ordem": 26,
    "texto": "Qi Nu falava com muita confiança, como se já tivesse outro plano. Não mencionou esse plano até então. Gu Shenwei ia perguntar quando Xie Nu voltou e fez um sinal com a cabeça: estava tudo normal lá fora. Era hora de levar o corpo.",
    "justificativa": "Remove “mencionara/retornou/assentindo” e preserva a distinção entre o aviso de Xie Nu e a conclusão de que deviam partir.",
    "categorias": [
      "naturalidade",
      "coesao"
    ]
  },
  {
    "ordem": 27,
    "texto": "Os três levantaram o corpo. Cada irmão segurou um pé, e Gu Shenwei segurou a cabeça. Com passos leves, seguiram para o Penhasco do Grito Fantasma, além do portão oeste. Os pertences estavam empilhados sobre o cadáver.",
    "justificativa": "Corrige cabeça e pés, que viraram ombros e pernas. Remove “içaram” e não transforma o conjunto dos pertences numa única trouxa.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 28,
    "texto": "Xie Nu deixou o portão do pátio aberto de antemão, para que pudessem passar sem dificuldade.",
    "justificativa": "Mantém a anterioridade pela expressão temporal e remove “passagem desimpedida”.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 29,
    "texto": "Gu Shenwei temia sobretudo as misteriosas sentinelas. Mas tiveram sorte naquela noite: nenhuma apareceu enquanto levavam o corpo para fora do portão. O Penhasco do Grito Fantasma tinha uma parede íngreme e não precisava de guarda. Ali estariam seguros por algum tempo.",
    "justificativa": "Remove a personificação acrescentada “a noite lhes sorria” e “por ora”. 绝壁 descreve a parede escarpada, não a impossibilidade de chegar ao penhasco.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 30,
    "texto": "Todos os garotos do Pátio da Lenha Empilhada já carregaram cadáveres, mas nenhum tão pesado quanto Han Shiqi. Ainda faltavam mais de dez passos para a borda quando Xie Nu começou a ceder ao peso, dobrando o corpo sem conseguir evitar.",
    "justificativa": "Remove “despenhadeiro/vergar” e esclarece que ele começa a ceder involuntariamente.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 31,
    "texto": "Qi Nu e Gu Shenwei trocaram um olhar e baixaram o corpo devagar. Também estavam exaustos. Não conseguiam dar os últimos passos, por mais que tentassem.",
    "justificativa": "Desfaz a combinação truncada “incapazes de ... de jeito nenhum” e preserva o esgotamento dos dois.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 32,
    "texto": "O corpo estava de bruços, com a faca ainda presa nele. Só um pequeno pedaço ficava para fora, quase invisível ao luar.",
    "justificativa": "Remove “jazia” e “ponta despontava”. O original não identifica a parte exposta como a ponta da lâmina.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 33,
    "texto": "*Foi um erro parar para descansar*, pensou Gu Shenwei. Precisavam se livrar do corpo logo. Quando ia se abaixar para levantá-lo e percorrer o trecho que faltava, o cadáver estendeu a mão de repente e agarrou seu tornozelo!",
    "justificativa": "正要 marca uma ação prestes a começar; ele ainda ia se abaixar. Remove “fora/içá-lo” e marca o pensamento direto.",
    "categorias": [
      "fidelidade",
      "naturalidade",
      "tipografia"
    ]
  },
  {
    "ordem": 36,
    "texto": "Qi Nu e Xie Nu ficaram parados por um instante, depois se jogaram sobre Han Shiqi. O mais velho arrancou a faca e o esfaqueou sem parar, de qualquer jeito.",
    "justificativa": "Preserva o choque e as estocadas desordenadas. “Fúria cega” atribui uma emoção não explicitada em 没命地乱戳.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 39,
    "texto": "Ainda era um cadáver. Só começava a sair sangue pelo canto da boca. Gu Shenwei não conseguia saber por que ele agarrou o tornozelo de quem o matou, nem se voltou à vida naquele instante.",
    "justificativa": "Remove “agarrara” e a sintaxe indireta pesada, mantendo a incerteza sobre o movimento do morto.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 40,
    "texto": "Sua alma já estava de volta ao corpo. Parecia ter se purificado no breve tempo em que ficou fora. Agora ele estava tão calmo quanto um legista examinando um cadáver.",
    "justificativa": "Preserva a imagem da alma e a comparação profissional sem “retornado/desgarrara/mantinha a frieza”.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 41,
    "texto": "Gu Shenwei levou a mão ao nariz de Han Shiqi para sentir a respiração e apalpou seu peito por um tempo. Até queria que ele ainda estivesse vivo: poderia perguntar onde estava sua irmã e por que a Fortaleza do Peng Dourado matou a família Gu.",
    "justificativa": "Recupera a verificação concreta junto ao nariz. Remove “arrancar o paradeiro/chacinado”, mantendo as duas perguntas sem pressupor interrogatório violento.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 42,
    "texto": "\"Morreu mesmo?\" perguntou Xie Nu em voz baixa. Seu rosto estava pálido, mais branco que o luar.",
    "justificativa": "小声 é em voz baixa, não necessariamente sussurro. Remove “cadavérico” e corrige também a pontuação do diálogo.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 44,
    "texto": "Os três já não tinham forças para levantar o corpo. Empurraram-no juntos, fazendo-o rolar pelos dez e tantos passos que faltavam. Depois jogaram o cadáver e os pertences penhasco abaixo.",
    "justificativa": "Recupera a distância de 十几步 e distingue rolar até a borda de empurrar para o abismo.",
    "categorias": [
      "fidelidade",
      "coesao"
    ]
  },
  {
    "ordem": 46,
    "texto": "\"E agora, o que a gente faz?\" perguntou Gu Shenwei.",
    "justificativa": "Une a pergunta ao dicendi do segmento seguinte para evitar um parágrafo isolado iniciado por “Gu Shenwei perguntou”.",
    "categorias": [
      "dialogo",
      "coesao"
    ]
  },
  {
    "ordem": 47,
    "texto": "Qi Nu e Xie Nu claramente pensaram mais adiante que Gu Shenwei e já tinham um plano para depois do assassinato.",
    "justificativa": "O plano existe no chinês; “já deviam ter” acrescentava incerteza. O dicendi foi levado para a fala anterior.",
    "categorias": [
      "fidelidade",
      "coesao"
    ]
  },
  {
    "ordem": 48,
    "texto": "As mãos de Qi Nu estavam cobertas de sangue. Parecia assustado e irritado ao mesmo tempo, pronto para explodir se alguém mexesse com ele.",
    "justificativa": "Remove “empapadas/trazia no rosto/exasperação” e mantém o medo junto da irritabilidade.",
    "categorias": [
      "naturalidade",
      "lexico"
    ]
  },
  {
    "ordem": 51,
    "texto": "Qi Nu respirou fundo e se acalmou. Seu rosto já parecia bem melhor. \"É o seguinte: toda manhã a gente vai carregar água. Lá tem um monte de barris de madeira, e a água limpa vem de fora. É só achar uma brecha, entrar num barril e a gente escapa.\"",
    "justificativa": "脸色好多了 é melhora considerável, não apenas um pouco. Substitui “semblante” e preserva o diálogo.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 52,
    "texto": "Gu Shenwei também conhecia o trabalho de carregar água e entendeu a ideia de Qi Nu na hora. A Fortaleza do Peng Dourado ficava no alto da montanha, sem fonte de água. Tudo o que usavam vinha lá de baixo. Os homens que traziam a água não podiam entrar: despejavam tudo num tanque de pedra, e os escravos da fortaleza levavam a água para cada pátio. Perto do tanque ficavam empilhados muitos barris vazios, sem uso naquele momento. Talvez os homens os levassem de volta no dia seguinte.",
    "justificativa": "Remove “cume escarpado/sopé/serviçais/desocupados”, preservando o circuito da água e a possibilidade, não certeza, da retirada dos barris.",
    "categorias": [
      "naturalidade",
      "ritmo"
    ]
  },
  {
    "ordem": 55,
    "texto": "Mesmo assim, Gu Shenwei balançou a cabeça. Era a segunda vez que recusava um convite para fugir com alguém. Qi Nu o olhou, estranhando.",
    "justificativa": "A recusa anterior não precisa ter vindo dos mesmos irmãos. Remove “lançou-lhe um olhar” e mantém a reação.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 57,
    "texto": "Era tudo o que Gu Shenwei podia dizer. Nem aos companheiros com quem matou alguém podia contar tudo: em parte por cautela, em parte por insegurança. Queria matar toda a família Shangguan para vingar os pais e os irmãos mais velhos. A ideia era tão fora da realidade que provavelmente ninguém entenderia.",
    "justificativa": "Recupera 兄长 como irmãos mais velhos e o receio de expor uma ambição absurda. Remove “revelar/cúmplices/expor/cobrar com a vida”.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 58,
    "texto": "Qi Nu e Xie Nu, porém, aceitaram a explicação. Para eles, nada era mais importante que a vingança. Só adiaram a fuga por tanto tempo para matar o homem que os humilhou.",
    "justificativa": "Remove “ultrajara”, mantendo a razão de terem adiado a fuga.",
    "categorias": [
      "naturalidade",
      "lexico"
    ]
  },
  {
    "ordem": 59,
    "texto": "Os três voltaram ao Pátio da Lenha Empilhada. Gu Shenwei foi para o quarto onde dormia sozinho. Antes de se deitarem, Qi Nu e Xie Nu arrumaram a cama de Han Jinu e disfarçaram a pequena mancha como puderam. Os outros cinco garotos dormiam profundamente. Nenhum invejava o tratamento dado aos irmãos.",
    "justificativa": "Remove “recolheu-se” e simplifica a sequência de ações sem perder o cuidado com a mancha.",
    "categorias": [
      "naturalidade",
      "ritmo"
    ]
  },
  {
    "ordem": 60,
    "texto": "Gu Shenwei fechou os olhos. Seu primeiro inimigo estava morto. Um pedaço da grande pedra que bloqueava seu coração se quebrou, deixando entrar um fio de luz. Ainda tinha muito em que pensar, mas o sono veio em ondas por aquele fio de luz. Antes de organizar os pensamentos, adormeceu profundamente.",
    "justificativa": "Preserva a pedra, sua pequena fratura e o sono entrando com a luz, sem “rocha que lhe obstruía/deixando penetrar”.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 61,
    "texto": "Foi o melhor sono de sua vida.",
    "justificativa": "Naturaliza 香甜 como a qualidade do sono, evitando o decalque “dormiu com uma doçura”.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 62,
    "texto": "Ao se levantar de manhã, Gu Shenwei quase não lembrava da noite anterior. Só depois de um bom tempo a alegria da vingança começou a crescer e a tomar cada poro de seu corpo. Até a luz do sol lá fora parecia mais viva que de costume.",
    "justificativa": "Remove “lhe impregnasse” e conserva o crescimento gradual da alegria e a imagem corporal.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 63,
    "texto": "Os três dias de \"expulsar o mal\" terminaram, e Gu Shenwei precisava voltar com os garotos para cumprimentar a Senhorita. Uma dúvida continuava sem resposta: por que a Mãe Neve assumiu que foi ela quem ensinou a arte de energia interna a Yao Nu?",
    "justificativa": "去邪期 é o período destinado a afastar o mal. Remove “já havia cumprido/admitira” e a imagem acrescentada de guardar a dúvida no peito.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 64,
    "texto": "Mas a Mãe Neve parecia ter esquecido o assunto. Seu rosto frio e rígido não dava nenhuma pista.",
    "justificativa": "Remove a passiva impessoal “não se extraía pista alguma” sem modificar a leitura do rosto.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 65,
    "texto": "Quando voltaram ao Pátio da Lenha Empilhada, encontraram Han Jinu inquieto. Ele perguntava sem parar a Qi Nu e Xie Nu onde estava o Terceiro Irmão e por que saiu sem avisar.",
    "justificativa": "Esclarece quem volta ao pátio e remove “mostrava-se/partira/uma palavra de despedida”.",
    "categorias": [
      "coesao",
      "naturalidade"
    ]
  },
  {
    "ordem": 66,
    "texto": "Qi Nu e Xie Nu estavam tão calmos que Gu Shenwei os admirou. Com naturalidade, explicaram que o Terceiro Irmão saiu naquela mesma noite. Foram eles que abriram e trancaram o portão do pátio. Como o senhor administrador já estava dormindo, não o incomodaram.",
    "justificativa": "Remove “calma exemplar/despertando/fora embora”, mantendo a segurança da mentira e a sequência dos fatos alegados.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 67,
    "texto": "Han Jinu acreditou na explicação. Han Shiqi nem sempre passava a noite ali. Mesmo assim, alguma coisa o inquietava, e ele passou o dia inteiro pensando no assunto.",
    "justificativa": "Remove a repetição “sem saber o motivo/inexplicável” e mantém a inquietação sem causa identificada.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 68,
    "texto": "À tarde, Han Jinu ficou ainda mais distraído. Supervisionou o trabalho dos garotos com a cabeça longe, não fez a chamada ao entardecer e demorou mais que de costume para trancar o portão. No quarto, deixou a vela acesa e só dormiu depois da meia-noite.",
    "justificativa": "后半夜 é a segunda metade da noite. Remove “recolhido/desconcertado” e não atribui dificuldade de adormecer onde o chinês só informa a hora tardia.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 69,
    "texto": "Por isso, Han Jinu não percebeu que Qi Nu e Xie Nu desapareceram. Os irmãos saíram para buscar água à tarde e voltaram uma vez. Na segunda saída, não retornaram. Foi uma falha grave do administrador.",
    "justificativa": "Remove o período pesado e “grave negligência para”, preservando a responsabilidade de quem devia vigiá-los.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 70,
    "texto": "Gu Shenwei respirou aliviado por Qi Nu e Xie Nu. O primeiro passo do plano de fuga deu certo.",
    "justificativa": "Remove “correra” e mantém o alívio limitado à primeira etapa.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 71,
    "texto": "Os outros cinco garotos perceberam que havia algo errado, mas não deram muita importância. Eram novos ali, não sabiam o que fazer e não ousavam avisar Han Jinu, que estava claramente de mau humor.",
    "justificativa": "Remove “anormalidade/cujo/visivelmente péssimo” e preserva a inexperiência e o medo do administrador.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 72,
    "texto": "Gu Shenwei rezava em silêncio para que Qi Nu e seu irmão conseguissem fugir.",
    "justificativa": "Corrige “os irmãos Qi Nu”: apenas um dos irmãos tem esse nome.",
    "categorias": [
      "fidelidade"
    ]
  }
];

const db = new Database(caminho, { readonly: !gravar, fileMustExist: true });
if (gravar) db.pragma('foreign_keys = ON');
const capitulo = db.prepare('SELECT id, prompt_id, provedor, modelo FROM capitulos WHERE obra_id=1 AND numero=22').get() as
  { id: number; prompt_id: number; provedor: string; modelo: string } | undefined;
if (!capitulo || capitulo.provedor !== 'gemini' || capitulo.modelo !== 'gemini-3.8-flash') throw new Error('Capítulo/modelo diverge da base revisada.');
const frases = db.prepare('SELECT * FROM frases WHERE capitulo_id=? ORDER BY ordem').all(capitulo.id) as Frase[];
if (frases.length !== 74 || frases.some(f => f.status_traducao !== 'traduzida' || f.texto_pt !== f.texto_pt_original_ia)) {
  throw new Error('Base mudou: esperadas 74 frases traduzidas, ainda iguais à primeira IA.');
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
  if (!propostaPodeIrAoStaging(travas)) throw new Error(`22.${p.ordem}: ${JSON.stringify(travas)}`);
  return { ...p, frase, travas };
});
const porOrdem = new Map(propostas.map(p => [p.ordem, p.texto]));
const composicao = frases.map(f => ({ ...f, texto_pt: porOrdem.get(f.ordem) ?? f.texto_pt }));
const estilo = analisarEstilo(composicao, prefs);
const consistencia = varrerConsistencia(composicao, separarPorChecagem(gama).checaveis);
if (estilo.violacoes.length || consistencia.violacoes.length) throw new Error(JSON.stringify({ estilo: estilo.violacoes, gama: consistencia.violacoes }));
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
console.log(JSON.stringify({ modo: gravar ? 'staging' : 'validacao', capitulo: 22, propostas: propostas.length,
  preservadas: frases.length - propostas.length, lote_id: loteId, existente, base_sha256: baseHash,
  estilo: estilo.violacoes, gama: consistencia.violacoes,
  alertas: validadas.flatMap(p => p.travas.map(t => ({ ordem: p.ordem, ...t }))),
}, null, 2));
db.close();
