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
const rotulo = 'Revisão integral do capítulo 24 · Gemini 3.8 Flash';
const criterios = [
  'Revisão editorial assistida contra o chinês, Alfa 6.3, Beta e Delta 2.4; capítulo 23 aprovado como referência de qualidade.',
  'Preservar sentido, imagens, voz e ambiguidades; corrigir referências, medidas, literalidade e registro sem uniformizar a prosa.',
  'Propostas elaboradas pelo assistente, ainda não aprovadas pelo usuário. Nenhuma alteração automática no texto vigente.',
].join('\n');
type Proposta = { ordem: number; texto: string; justificativa: string; categorias: CategoriaRevisaoLiteraria[] };
const propostas: Proposta[] = [
  {
    "ordem": 1,
    "texto": "O Oitavo Jovem Mestre Shangguan Nu estava num ano de azar. Já tinha problemas de sobra e, para piorar, Han Shiqi era um Assassino do seu pátio, e os dois responsáveis pela morte eram escravos que sua esposa recém-casada trouxe como parte do dote.",
    "justificativa": "Corrige “noiva recém-casada” e torna natural a sequência de contratempos.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 2,
    "texto": "Com os boatos que ouvia e suas próprias deduções, Gu Shenwei só conseguiu ter uma ideia geral do que tinha acontecido naqueles três dias sufocantes.",
    "justificativa": "Preserva o limite de 大致 e a anterioridade sem o mais-que-perfeito simples.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 3,
    "texto": "Com a captura de Qi Nu, os outros seis garotos foram levados imediatamente de volta ao Pátio da Lenha Empilhada e presos outra vez. Não recebiam notícias, e só traziam comida uma vez por dia. Ninguém cuidou dos dois corpos, que já começavam a apodrecer. O cheiro se espalhava pelo pátio e entrava no quarto dos garotos.",
    "justificativa": "Desfaz o período sobrecarregado, sem acrescentar “isolamento absoluto”.",
    "categorias": [
      "fidelidade",
      "naturalidade",
      "ritmo"
    ]
  },
  {
    "ordem": 4,
    "texto": "Passaram três dias seguidos com medo. As feridas das chicotadas formaram cascas duras, que eles arrancavam uns dos outros enquanto esperavam juntos, em silêncio, a decisão final. Foi a última vez que aqueles \"irmãos de juramento\" confiaram uns nos outros e se apoiaram.",
    "justificativa": "Remove “em pavor”, “vergões” e “último intervalo”; mantém a ironia das aspas sem chamar os irmãos de supostos.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 6,
    "texto": "O olhar que Qi Nu lhe lançou na câmara de tortura subterrânea do Pátio do Coração Lavado já deixou seu coração disparado. Diante de tantas formas de tortura, até a maioria das pessoas mais velhas e de vontade mais firme que Qi Nu acabaria confessando tudo.",
    "justificativa": "花样百出 indica variedade de torturas, não refinamento. Mantém a hipótese, em vez de narrar confissões habituais.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 7,
    "texto": "Só ao meio-dia do quarto dia o portão oeste do pátio finalmente se abriu, e um novo administrador chegou ao Pátio da Lenha Empilhada.",
    "justificativa": "西院门 é o portão oeste do pátio atual; não o portão do local chamado Pátio Oeste.",
    "categorias": [
      "fidelidade"
    ]
  },
  {
    "ordem": 12,
    "texto": "O novo administrador se recusava a morar no Pátio da Lenha Empilhada. Chegava cedo, saía tarde e deixava os portões bem trancados na sua ausência. Os garotos tinham ainda menos liberdade que antes. Até as visitas de todas as manhãs para cumprimentar a Senhorita foram canceladas. A guarda no ponto onde buscavam água na fortaleza foi reforçada, e todos os baldes vazios que não estavam em uso foram retirados.",
    "justificativa": "Naturaliza “partia/saudação matinal/sem uso imediato” e separa as restrições para facilitar a leitura.",
    "categorias": [
      "naturalidade",
      "ritmo"
    ]
  },
  {
    "ordem": 13,
    "texto": "Entre os primeiros feridos que chegaram após a reabertura do Pátio da Lenha Empilhada estava o antigo administrador, Han Jinu. Ele sobreviveu a torturas muito piores que as dos garotos. Os outros feridos acabavam atirados, um a um, do Penhasco do Grito Fantasma. Só ele, para surpresa de todos, foi se recuperando.",
    "justificativa": "Remove “tendo suportado/atrozes/escapara” e explicita que os corpos são atirados do penhasco, não nele.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 14,
    "texto": "Mas Han Jinu ficou calado. Muitas vezes passava o dia inteiro sem falar. Não tinha mais quem o protegesse, perdeu sua posição e não sabia o que seria dele. Certa noite, assim que conseguiu voltar a andar, se enforcou com a própria faixa da cintura. O corpo ficou balançando no batente do portão oeste do pátio e só foi encontrado na manhã seguinte.",
    "justificativa": "Remove o encadeamento “tornara/perdera” e corrige novamente o portão oeste, preservando a incerteza sobre o futuro.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 15,
    "texto": "Sua morte não causou comoção nem despertou perguntas. Os garotos atiraram o corpo do penhasco, e alguns chegaram a reclamar da falta de consideração do antigo administrador: se queria se matar, por que não pulou direto lá de cima?",
    "justificativa": "Torna natural a pergunta indireta e mantém o humor cruel dos garotos.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 16,
    "texto": "Em outro dia, os garotos viram o corpo de Qi Nu, separado da cabeça. Dois homens de preto o levaram direto ao Penhasco do Grito Fantasma.",
    "justificativa": "身首异处 indica cabeça separada do corpo, não apenas garganta cortada; remove “fora carregado”.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 17,
    "texto": "Embora já acostumado com cadáveres, Gu Shenwei não conseguiu se conter e vomitou. Os outros garotos também se viraram de costas, com o rosto branco, e mal comeram o dia inteiro.",
    "justificativa": "背过身 é virar o corpo de costas, não só o rosto. Substitui “lívidos” por uma imagem corrente.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 19,
    "texto": "Qi Nu tinha assumido toda a culpa no Pátio do Coração Lavado. Não mencionou ninguém além do irmão.",
    "justificativa": "Preserva a anterioridade e remove “assumira/vivalma”.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 20,
    "texto": "Ele confessou que planejou o assassinato: prendeu a faca de ponta sob a cama e, enquanto Xie Nu segurava o homem, rolou para debaixo dela e matou o inimigo, que estava se divertindo.",
    "justificativa": "Remove “arquitetado/fixara/esgueirara/leito/deleite” e a distração acrescentada. Mantém os atos que Qi Nu declarou ter praticado.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 22,
    "texto": "E não era só isso: descobriram que Qi Nu e Xie Nu eram órfãos da Grande Montanha Nevada. Os pais morreram nas disputas entre os picos, e os dois acabaram vendidos como escravos, passando de mão em mão. Long Feidu, que matou os membros do Bando da Águia Voadora na encruzilhada em T, era do mesmo povo dos irmãos, mas de outro pico.",
    "justificativa": "Recompõe a venda como escravos, não anterior à escravidão. 同族人 não exige pertencer ao mesmo clã familiar; preserva a diferença entre picos.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 24,
    "texto": "Gu Shenwei não conseguia entender o povo da Grande Montanha Nevada. Com um inimigo tão forte lá fora, ainda lutavam entre si até a morte.",
    "justificativa": "Remove a duração acrescentada por “sem fim” e o registro inflado de “formidável/carnificina interna”.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 26,
    "texto": "Desta vez não foram levados ao Pátio do Coração Lavado, mas já estavam tão assustados que bastou perguntar para contarem, em todos os detalhes, os mais de dez anos de vida de cada um.",
    "justificativa": "惊弓之鸟 exprime medo após a experiência anterior, não uma reação literal a ruído; remove “em minúcias”.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 27,
    "texto": "Gu Shenwei, é claro, não podia contar a verdade, e inventar uma história na hora seria difícil demais. Por isso, usou a de Yao Nu: era um servo de um mercador das Regiões Ocidentais que, numa viagem com o patrão, foi capturado e escravizado por bandidos.",
    "justificativa": "Remove “de supetão/amo” e deixa claro que se trata da versão contada, não de uma nova mudança de condição.",
    "categorias": [
      "naturalidade",
      "coesao"
    ]
  },
  {
    "ordem": 29,
    "texto": "O único problema era que sua história não resistiria a uma comparação: ele era muito diferente de Yao Nu, com seu rosto pontudo.",
    "justificativa": "Remove “fisionomia/flagrante” e conserva a possibilidade de desmentido pela aparência.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 30,
    "texto": "Mas ninguém foi procurar aquele mercador das Regiões Ocidentais a mais de mil li dali para conferir a história. Depois de uns dez dias de preocupação em segredo, Gu Shenwei teve certeza de que passou sem problemas.",
    "justificativa": "千里 não são milhares de léguas; 十来天 é aproximadamente dez dias. Ninguém foi, não apenas ninguém iria.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 31,
    "texto": "A confusão foi se acalmando. Ninguém suspeitava de um terceiro cúmplice. Além disso, nos bastidores, havia uma força interessada em encerrar o caso o quanto antes e limitar suas consequências.",
    "justificativa": "Remove “serenou/existência de/uma força manobrava” sem atribuir manobras não descritas.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 32,
    "texto": "Gu Shenwei não se enganou ao notar sinais de conflito na câmara de tortura. O alto e magro Mestre do Sabre Shen se chamava Shen Liang. Era o responsável pelo Pátio do Coração Lavado e tio materno do Oitavo Jovem Mestre Shangguan Nu. Defendia os interesses do sobrinho e usava seu poder para reduzir a gravidade do caso.",
    "justificativa": "矛盾 são tensões entre os responsáveis, não indícios contraditórios. Naturaliza “observara/chamava-se”.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 33,
    "texto": "O Senhor Guo, baixo e magro, vinha do Pátio dos Vestes Brancas, no Forte Leste. Não era parente de nenhum Jovem Mestre, mas todos sabiam que era próximo do Quinto Jovem Mestre. Queria ampliar o caso para enfraquecer o Oitavo Jovem Mestre.",
    "justificativa": "Remove “notório/laços estreitos/seu empenho/desferir um golpe” e mantém a intenção política.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 34,
    "texto": "Quase todos na Fortaleza do Peng Dourado sabiam da rivalidade entre o Quinto e o Oitavo. Diziam que, em vida, as mães dos dois Jovens Mestres eram como fogo e água. Depois de mortas, o ódio continuou nos filhos.",
    "justificativa": "Preserva a comparação fogo/água e remove “haviam legado/aos respectivos filhos”.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 35,
    "texto": "À primeira vista, o Oitavo Jovem Mestre Shangguan Nu venceu aquela rodada. O decisivo foi que o próprio Rei Incomparável Shangguan Fa não queria perder o controle da situação. Dois garotos de pouco mais de dez anos conseguiram assassinar um dos Assassinos dentro da Fortaleza do Peng Dourado: se a notícia se espalhasse, seria um grande escândalo.",
    "justificativa": "Remove “vencera/viesse a público” e a repetição Assassino assassinado, mantendo o caráter clandestino da morte.",
    "categorias": [
      "naturalidade",
      "ritmo"
    ]
  },
  {
    "ordem": 37,
    "texto": "Mas Shangguan Nu caiu ainda mais no conceito do pai, até não ter mais como cair. O oitavo filho não conseguia comandar um grupo de Assassinos, nem sequer cuidar dos assuntos do próprio pátio. Isso decepcionou muito o Rei Incomparável.",
    "justificativa": "Corrige a construção pouco natural “o conceito de... diante do pai” e remove “desapontou imensamente”.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 38,
    "texto": "A Fortaleza do Peng Dourado não era um bloco unido, mas saber disso não ajudava Gu Shenwei. Agora estava preso no Pátio da Lenha Empilhada, lidando com mortos todos os dias. Só tinha por perto cinco companheiros calados de medo, que mal conversavam entre si.",
    "justificativa": "Torna corrente a imagem de 铁板一块, sem o termo abstrato “monólito”.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 39,
    "texto": "Dos dez garotos que acompanharam a Senhorita no casamento, quatro já estavam mortos em pouco mais de um mês. Mesmo na Fortaleza do Peng Dourado, onde \"morria gente todo dia\", era uma proporção assustadora. Por isso, o pessimismo tomou conta dos garotos.",
    "justificativa": "Remove “tratava-se” e a névoa acrescentada à descrição do desânimo.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 42,
    "texto": "Gu Shenwei não entendia aquilo. Não tinha maltratado nem traído ninguém. Estava no mesmo lugar que eles, no nível mais baixo da Fortaleza do Peng Dourado, fazendo os trabalhos mais desprezados. Não entendia por que o tratavam como alguém diferente.",
    "justificativa": "Remove “intimidara/traíra/escalão/serviços vis” e a imagem de estranho no ninho, sem perder a condição social.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 44,
    "texto": "Mesmo tentando disfarçar, seus modos ainda eram diferentes dos dos garotos das montanhas. Não se sentava no chão em qualquer lugar, tinha o hábito de lavar as mãos com frequência, sabia ler e sempre andava com as costas retas...",
    "justificativa": "Remove “obsessiva”, intensidade não presente no hábito descrito, e naturaliza “divergiam/coluna ereta”.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 47,
    "texto": "Quando Yao Nu, que estava com possessão demoníaca, morreu, só ele estava por perto. Qi Nu e Xie Nu tentaram expulsar o mal dele, mas acabaram eles mesmos com \"possessão demoníaca\" e cometeram um assassinato. Pensando bem, até Xiao Nu, o primeiro a morrer, parecia ter alguma ligação com Huan Nu: os dois viviam juntos naquela época.",
    "justificativa": "O original chama Yao Nu de possuído, sem afirmar que morreu por causa da possessão. Explicita de quem tentaram expulsar o mal.",
    "categorias": [
      "fidelidade",
      "coesao"
    ]
  },
  {
    "ordem": 48,
    "texto": "Eram esses os pensamentos dos cinco garotos. Gu Shenwei ficou um pouco irritado no começo, mas logo deixou para lá. Era até melhor assim: podia treinar sem ser incomodado.",
    "justificativa": "Substitui “se desanuviou” por uma reação natural, sem mudar a aceitação do isolamento.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 49,
    "texto": "Naquele mês e pouco desde que entrou na Fortaleza do Peng Dourado, ele treinou mais do que em qualquer outro momento da vida. Como não sabia onde estava o método de treinamento acelerado, só podia apostar todas as esperanças no treino normal.",
    "justificativa": "Remove “fora/paradeiro ignorado/restava-lhe” e preserva a comparação com a vida anterior.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 51,
    "texto": "Desde que ninguém descobrisse sua identidade como o Pequeno Senhor da família Gu, podia esperar com paciência até dominar a Força Harmoniosa. Se dez anos não bastassem, esperaria vinte. Seu inimigo, Shangguan Nu, ainda era jovem e viveria até lá.",
    "justificativa": "Remove “contanto que/alcançar a mestria” sem alterar os tempos condicionais.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 52,
    "texto": "No décimo dia após a reabertura do Pátio da Lenha Empilhada, os garotos, cada vez mais assustados com Huan Nu, lhe deram um \"presente\" que o deixou feliz e surpreso.",
    "justificativa": "意外之喜 é uma surpresa feliz, não só “surpresa inesperada”; mantém a ironia do presente.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 54,
    "texto": "Como os outros garotos o evitavam, ele costumava voltar ao quarto para comer sozinho. Naquele dia foi igual, mas havia uma coisa a mais sobre sua roupa de cama.",
    "justificativa": "被褥 não especifica esteira; elimina a repetição “não foi exceção, exceto”.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 57,
    "texto": "Ele correu até lá, largou a tigela e pegou a seda branca. Bastou ler a primeira linha para saber que era mesmo o método de treinamento acelerado da Força Harmoniosa.",
    "justificativa": "箭步 indica uma arrancada rápida, não necessariamente um salto; remove “pousou/se tratava exatamente”.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 58,
    "texto": "Continuou lendo com avidez, sem ligar para a comida nem pensar de onde veio a seda branca.",
    "justificativa": "Remove a duplicação “devorou com avidez” e o registro de “procedência”.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 60,
    "texto": "Era mesmo o método de treinamento acelerado, mas estava longe de ser tão rápido quanto ele imaginava. No treino normal da Força Harmoniosa, as energias Yin e Yang precisavam chegar à nona camada para que o dragão e o tigre se unissem. Pelo método acelerado, Yin e Yang podiam se unir em qualquer camada, mas o poder não era o mesmo.",
    "justificativa": "Remove “de fato e sem sombra de dúvida/imaginara/se dar” e mantém a comparação de poder entre níveis.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 62,
    "texto": "O método era acelerado, mas a \"aceleração\" tinha limites.",
    "justificativa": "Recupera o jogo com 速成/速: a velocidade do método é limitada, não a pressa de quem o usa.",
    "categorias": [
      "fidelidade",
      "naturalidade"
    ]
  },
  {
    "ordem": 63,
    "texto": "Seu pai, Gu Lun, treinou duro por décadas e só chegou à quinta camada das energias Yin e Yang. Gu Shenwei tinha acabado de chegar à primeira. Não sabia quantos anos ainda teria de esperar para conseguir algum resultado.",
    "justificativa": "Remove “treinara/árduo/amargar” e a invocação aos céus, ausente do original.",
    "categorias": [
      "naturalidade",
      "fidelidade"
    ]
  },
  {
    "ordem": 66,
    "texto": "Agora, Gu Shenwei tinha tempo para pensar em quem devolveu a seda branca.",
    "justificativa": "Remove “ponderar”, mantendo a pergunta sobre uma devolução já ocorrida.",
    "categorias": [
      "naturalidade"
    ]
  },
  {
    "ordem": 67,
    "texto": "Só podia ser um dos outros cinco garotos. Ele guardou aquele objeto importante para Yao Nu e não confessou isso nem sob tortura no Pátio do Coração Lavado.",
    "justificativa": "Remove “decerto/guardara” e preserva que a informação foi mantida em segredo.",
    "categorias": [
      "naturalidade"
    ]
  }
];

const db = new Database(caminho, { readonly: !gravar, fileMustExist: true });
if (gravar) db.pragma('foreign_keys = ON');
const capitulo = db.prepare('SELECT id, prompt_id, provedor, modelo FROM capitulos WHERE obra_id=1 AND numero=24').get() as
  { id: number; prompt_id: number; provedor: string; modelo: string } | undefined;
if (!capitulo || capitulo.provedor !== 'gemini' || capitulo.modelo !== 'gemini-3.8-flash') throw new Error('Capítulo/modelo diverge da base revisada.');
const frases = db.prepare('SELECT * FROM frases WHERE capitulo_id=? ORDER BY ordem').all(capitulo.id) as Frase[];
if (frases.length !== 70 || frases.some(f => f.status_traducao !== 'traduzida' || f.texto_pt !== f.texto_pt_original_ia)) {
  throw new Error('Base mudou: esperadas 70 frases traduzidas, ainda iguais à primeira IA.');
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
  // Em 7/14, 西院门 é o portão oeste do pátio atual, não a entidade 西院.
  // Mantém o alerta bruto no relatório, mas exclui somente este falso bloqueio.
  const travasReais = travas.filter(t => !([7, 14].includes(p.ordem) && t.codigo === 'gama'
    && t.mensagem === 'O original contém 西院, mas a proposta não preserva a identidade canônica “Pátio Oeste”.'));
  if (!propostaPodeIrAoStaging(travasReais)) throw new Error(`24.${p.ordem}: ${JSON.stringify(travas)}`);
  return { ...p, frase, travas };
});
const porOrdem = new Map(propostas.map(p => [p.ordem, p.texto]));
const composicao = frases.map(f => ({ ...f, texto_pt: porOrdem.get(f.ordem) ?? f.texto_pt }));
const estilo = analisarEstilo(composicao, prefs);
const consistencia = varrerConsistencia(composicao, separarPorChecagem(gama).checaveis);
// Aspas isoladas não geram propostas literárias; ficam relatadas separadamente.
// Correspondências parciais em substantivos/adjetivos, não tempos verbais.
const falsosEstilo = new Set(['6|câmara', '15|considera', '32|câmara', '39|assustadora', '61|terceira', '62|acelera']);
const estiloConteudo = estilo.violacoes.filter(v => v.regra !== 'aspas-nao-retas' && !(v.regra === 'mais-que-perfeito' && falsosEstilo.has(`${v.ordem}|${v.trecho}`)));
// 西院门 refere-se ao portão oeste deste pátio, não ao local chamado Pátio Oeste.
const gamaReais = consistencia.violacoes.filter(v => !(v.termo_zh === '西院' && [7,14].includes(v.ordem)));
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
console.log(JSON.stringify({ modo: gravar ? 'staging' : 'validacao', capitulo: 24, propostas: propostas.length,
  preservadas: frases.length - propostas.length, lote_id: loteId, existente, base_sha256: baseHash,
  estilo: estilo.violacoes, gama: consistencia.violacoes,
  alertas: validadas.flatMap(p => p.travas.map(t => ({ ordem: p.ordem, ...t }))),
}, null, 2));
db.close();
