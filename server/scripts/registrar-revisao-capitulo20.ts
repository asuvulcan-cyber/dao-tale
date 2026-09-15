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
const rotulo = 'Revisão integral do capítulo 20 · Gemini 3.8 Flash';
const criterios = [
  'Revisão editorial assistida contra o chinês, Alfa 6.3, Beta e Delta 2.4; capítulo 19 aprovado como referência de qualidade.',
  'Preservar sentido, imagens, voz e ambiguidades; corrigir referências, medidas, literalidade e registro sem uniformizar a prosa.',
  'Propostas elaboradas pelo assistente, ainda não aprovadas pelo usuário. Nenhuma alteração automática no texto vigente.',
].join('\n');
type Proposta = { ordem: number; texto: string; justificativa: string; categorias: CategoriaRevisaoLiteraria[] };
const propostas: Proposta[] = [
  { ordem: 1, texto: '"Aquele homem", ou seja, Han Shiqi, era muito bom em artes marciais e estava sempre alerta. Os dois irmãos descobriram isso ao resistir aos seus primeiros "favores": nem os oito garotos escravos juntos seriam páreo para ele. Só restava matá-lo de surpresa.', justificativa: 'Remove a intensidade acrescentada por “extremamente” e naturaliza 暗杀 sem perder a necessidade de um ataque furtivo. Mantém o eufemismo dos “favores”.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 2, texto: 'Estavam na Fortaleza do Peng Dourado, e a ideia de matar alguém de surpresa surgiu naturalmente na cabeça de Qi Nu. O problema era como fazer isso: o alvo era um Assassino experiente.', justificativa: 'Preserva o caráter furtivo de 暗杀 e elimina a combinação burocrática “questão crucial/executá-lo”.', categorias: ['fidelidade', 'naturalidade', 'gama'] },
  { ordem: 3, texto: 'Primeiro, não podiam atacar de mãos vazias: precisavam de uma arma afiada. Xie Nu resolveu o problema. Nas vezes em que foi buscar comida na cozinha, aproveitou para roubar uma faquinha de ponta para cortar carne que ninguém usava. A lâmina media cerca de treze centímetros. Era pequena, mas muito afiada.', justificativa: 'Corrige 四寸 para cerca de treze centímetros, coerente com os vinte centímetros após a extensão em 20.17. Remove “resolvera”, “surrupiar” e a oração participial.', categorias: ['fidelidade', 'naturalidade', 'lexico'] },
  { ordem: 4, texto: 'Segundo, alguém precisava distrair aquele homem. Como Jinu escolheu os dois irmãos mais uma vez, caberia a eles se sacrificar de novo.', justificativa: 'Remove o mais-que-perfeito simples e a redundância “distrair a atenção”, mantendo a repetição do sacrifício.', categorias: ['naturalidade'] },
  { ordem: 5, texto: '"Quero ver ele morrer com meus próprios olhos", disse Xie Nu, com ódio na voz. Costumava falar pouco, mas naquele momento parecia um pequeno leão enfurecido, rangendo os dentes com estalos.', justificativa: 'O chinês descreve o som dos dentes; “até estalarem” acrescenta uma progressão que não está no original.', categorias: ['fidelidade'] },
  { ordem: 6, texto: 'Por fim, o mais importante: alguém precisava dar o golpe. Era por isso, sobretudo, que os irmãos procuraram Huan Nu.', justificativa: 'Remove “fora” e o registro elevado de “desferir”, preservando a função de Huan Nu no plano.', categorias: ['naturalidade', 'lexico'] },
  { ordem: 8, texto: 'O elogio de Qi Nu fez Gu Shenwei corar um pouco.', justificativa: '有些脸红 indica que corou um pouco; “arder de vergonha” intensifica a reação e explicita a emoção além do original.', categorias: ['fidelidade'] },
  { ordem: 9, texto: 'Quando ainda era o Pequeno Senhor da família Gu, não se considerava um mestre, mas achava que podia vencer um lutador comum do mundo marcial. Os últimos dias revelaram a verdade sem piedade: os guardas da propriedade que ele derrotou no passado só fingiam perder. Ele não era páreo nem para um bandido qualquer.', justificativa: 'Explicita o objeto de 假装: os guardas fingiam perder. Remove “vivera/expusera” e preserva o tratamento e “mundo marcial” conforme o Gama.', categorias: ['fidelidade', 'naturalidade', 'gama'] },
  { ordem: 10, texto: 'Mesmo assim, Gu Shenwei estava disposto a assumir a tarefa. Han Shiqi não era apenas o homem perverso que o cobiçava: era também o "traidor" da família Gu, um dos responsáveis por seu extermínio. Pouco mais de um mês depois de perder a casa e a família, Gu Shenwei estava infiltrado na Fortaleza do Peng Dourado, reduzido a um escravo desprezível. Precisava cravar a faca no corpo do inimigo com as próprias mãos para acalmar um pouco a fera inquieta da vingança dentro de si.', justificativa: 'Preserva a imagem da fera e a participação de Han Shiqi no massacre, sem fazer dele o único executor. Remove tempos livrescos, “algoz/aplacar” e a associação imprecisa entre o mês transcorrido e a infiltração.', categorias: ['fidelidade', 'naturalidade', 'ritmo'] },
  { ordem: 13, texto: 'No dia anterior, Gu Shenwei viu uma pessoa morrer diante de si e agora sentia o coração muito mais duro. Concordou sem hesitar e pegou das mãos de Xie Nu a faca de ponta, menor até que um punhal.', justificativa: 'Remove “vira/empedernido” e mantém a percepção do próprio endurecimento como motivo da aceitação imediata.', categorias: ['naturalidade', 'lexico'] },
  { ordem: 14, texto: 'Da última vez, Han Shiqi concedeu seus "favores" aos irmãos no quarto de Han Jinu. Provavelmente seria ali de novo: era o quarto mais confortável do Pátio da Lenha Empilhada. Jinu saberia sair do caminho e dormir em outro lugar.', justificativa: '最为舒适 significa o mais confortável, não o único confortável. Naturaliza 识趣 e corrige tempos verbais e aspas.', categorias: ['fidelidade', 'naturalidade', 'tipografia'] },
  { ordem: 15, texto: 'Gu Shenwei precisava entrar escondido no quarto antes deles. Isso podia ser fácil ou difícil, conforme a hora em que Han Jinu terminasse a chamada e saísse do quarto. Se não encontrasse uma brecha, teriam de desistir do ataque por enquanto, e os irmãos sofreriam aquela humilhação em vão mais uma vez.', justificativa: 'Quem é adiado é o ataque, não a “oportunidade de assassinato”. Preserva a condição e sua consequência concreta.', categorias: ['naturalidade', 'coesao'] },
  { ordem: 16, texto: 'Gu Shenwei limpava o quarto de Jinu com frequência e o conhecia bem. Ali havia uma cama comum, em vez de uma cama aquecida, o que era bom: poderia se esconder debaixo dela e esperar até Han Shiqi se distrair por completo, para então atingir o alvo com a faca de baixo para cima.', justificativa: 'No plano, 忘乎所以 importa como perda de atenção, não como falta de compostura. Esclarece também a oposição entre cama comum e cama aquecida.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 17, texto: 'A faca era curta demais. Os três retiraram o cabo de madeira, expondo pouco mais de dez centímetros da espiga, a parte do metal presa dentro dele. Depois amarraram as duas metades do cabo na ponta da espiga, cobrindo apenas uns três centímetros. Assim, a parte exposta da faca ficou com cerca de vinte centímetros, o bastante para atravessar as tábuas finas da cama de Han Jinu e atingir o corpo em cima dela.', justificativa: 'Preserva 三寸多 e distingue o comprimento exposto da faca da lâmina cortante, que não cresceu. A expressão que acompanha “espiga” torna legível a operação descrita em chinês.', categorias: ['fidelidade', 'coesao'] },
  { ordem: 18, texto: 'O momento do ataque era crucial. Os três combinaram que Qi Nu e Xie Nu levariam aquele homem à posição certa. O sinal seria um grito de "irmão". Assim que o ouvisse, Huan Nu enfiaria a faca para cima, debaixo da cama.', justificativa: '叫一声“哥哥” define o sinal, sem dizer que Han Shiqi seria chamado de irmão. Remove esse destinatário inventado e usa aspas retas.', categorias: ['fidelidade', 'naturalidade', 'tipografia'] },
  { ordem: 19, texto: 'Havia outro problema: quem estivesse debaixo da cama não podia ser descoberto antes da hora. Precisava ficar muito quieto. Uma respiração um pouco mais pesada podia alertar Han Shiqi; afinal, ele era um Assassino e devia ter a audição e os outros sentidos muito aguçados.', justificativa: 'Remove o superlativo acrescentado e preserva a possibilidade expressa por 可能, em vez da certeza de “já bastaria”.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 20, texto: 'Poucos dias antes, Gu Shenwei ainda não sabia se conseguiria ficar em silêncio absoluto. Agora, porém, dominava o primeiro nível da Força Yin e começava a controlar a respiração interna. Com isso, também podia controlar a respiração até certo ponto.', justificativa: 'Corrige a modalidade temporal de “não teria certeza” e remove “acabara” e o encadeamento pesado de auxiliares. Preserva 内息 no sentido respiratório previsto pelo Gama.', categorias: ['naturalidade', 'fidelidade', 'gama'] },
  { ordem: 23, texto: 'Enquanto os três ensaiavam, um dos garotos entrou. Ao ver Huan Nu deitado imóvel e esticado na cama aquecida, o garoto mudou de expressão de repente. Virou-se e saiu correndo, quase caindo.', justificativa: '脸色骤变 não especifica palidez. Remove “hirto” e conserva a postura que leva o garoto a se assustar.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 24, texto: 'A cena era engraçada, mas lembrou aos três um problema importante: como evitar que os outros cinco garotos vissem ou ouvissem alguma coisa.', justificativa: 'Naturaliza 耳目 e corrige a regência de “alertá-los de”, preservando o problema da vigilância.', categorias: ['naturalidade'] },
  { ordem: 25, texto: 'San Nu, Xin Nu, Lei Nu, Qian Nu e Zhao Nu eram covardes que fugiam de problemas, muito influenciados por Yao Nu. Mal entraram na fortaleza e já aceitaram de vez o destino de escravos. Trairiam de bom grado os companheiros em troca de riqueza e posição.', justificativa: 'Desfaz “covardes temerosos” e a perífrase de anterioridade, mantendo a submissão e a disposição de trair por 富贵.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 26, texto: 'Os três conversaram por um momento. Xie Nu teve uma ideia, mas não explicou na hora; apenas disse que deixassem com ele. Saiu sozinho e demorou bastante a voltar. Disse que resolveu o problema e aproveitou para trazer o almoço.', justificativa: '顺便 indica aproveitar a ocasião. “Almoço a tiracolo” inventa uma forma de carregá-lo; “resolvera” também é removido.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 27, texto: 'Xie Nu deu uma volta pelo pátio e cochichou com cada um dos garotos. No fim, os cinco foram juntos procurar Han Jinu e disseram que preferiam ficar no quarto mais caindo aos pedaços a dividir o mesmo cômodo com Huan Nu.', justificativa: 'Remove “dera” e recupera a precariedade física de 最破, que “pior dos cômodos” deixa vaga.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 28, texto: 'Não chegavam moribundos ao Pátio da Lenha Empilhada havia algum tempo, e quartos vazios não faltavam. Os cinco bajularam tanto Han Jinu que ele lhes concedeu o favor de bom grado. Também mandou repetir sua ordem: Huan Nu não podia dar um passo para fora do quarto.', justificativa: 'Torna a sequência concreta e remove o registro burocrático de “diante de/por parte de/terminantemente”, sem suavizar a proibição.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 29, texto: '"Eu disse que você está com sinais de possessão, que meu irmão e eu aprendemos feitiços desde pequenos e estamos expulsando os espíritos de você", explicou Xie Nu, sorrindo. Depois de tramarem juntos, ele estava bem mais próximo de Huan Nu e falava mais.', justificativa: 'Evita fixar 邪 como demônio e preserva a mentira sobre a expulsão dos espíritos. Remove “aproximara/ficara” e a nominalização “comunicativo”.', categorias: ['fidelidade', 'naturalidade', 'dialogo'] },
  { ordem: 30, texto: '"Hehe, o que não falta em mim é mal para expulsar."', justificativa: 'Mantém a risada 呵呵 e a ambiguidade de 邪 entre possessão e o mal dentro do protagonista, sem acrescentar demônios concretos.', categorias: ['fidelidade', 'dialogo'] },
  { ordem: 31, texto: '"Foi com feitiçaria mesmo que você matou Yao Nu?" perguntou Xie Nu, curioso. Era claro que guardava aquela pergunta havia muito tempo.', justificativa: 'Corrige a pontuação do dicendi após interrogação e recupera a pergunta reprimida de 憋在心里, sem “dúvida remoendo em seu peito”.', categorias: ['fidelidade', 'naturalidade', 'dialogo'] },
  { ordem: 32, texto: '"Não fique perguntando, isso não é da sua conta." Qi Nu puxou o irmão para trás de si, impedindo-o de investigar os segredos de Huan Nu.', justificativa: 'Evita a gíria acrescentada “sem noção” e a formulação burocrática “intimidade alheia”, preservando a repreensão.', categorias: ['dialogo', 'naturalidade'] },
  { ordem: 33, texto: '"Eu não entendo de feitiçaria tão bem quanto você", disse Gu Shenwei com um sorriso, sem querer falar de Yao Nu.', justificativa: '你 se dirige a Xie Nu, no singular. A resposta brinca com a história que ele acabou de contar.', categorias: ['fidelidade', 'dialogo'] },
  { ordem: 35, texto: 'Qi Nu, porém, o olhou com um pouco mais de curiosidade. Cada um tinha seus segredos; ele não faria mais perguntas.', justificativa: 'Naturaliza 目光多了一分探究 sem o adjetivo livresco “inquiridor”.', categorias: ['naturalidade', 'lexico'] },
  { ordem: 36, texto: 'À tarde, Qi Nu e Xie Nu foram outra vez até Han Jinu aprender as "técnicas". Gu Shenwei ficou sozinho, treinando para conter a respiração e concentrar o fôlego. Segurava a faquinha modificada com as duas mãos e a encostava no fundo de uma cama imaginária. Então golpeava para cima com rapidez e força.', justificativa: 'Desfaz a sequência mecânica de gerúndios e auxiliares sem perder o treino respiratório, a posição da faca e a direção do golpe.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 37, texto: 'Imaginava então o sangue jorrando em grande quantidade. Precisaria rolar depressa para o lado para não ser atingido.', justificativa: 'Corrige “em sua imaginação que se seguiu” e remove a metáfora acrescentada da enxurrada.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 38, texto: '*É um inimigo*, Gu Shenwei disse a si mesmo. Han Shiqi seria a primeira pedra na construção de sua grande vingança. Matá-lo já compensaria tudo; cada inimigo morto depois dele seria lucro.', justificativa: 'Preserva as imagens de fundação e lucro sem “primeira pedra fundamental/grande empreitada”. Marca como pensamento direto o enunciado dirigido a si mesmo.', categorias: ['naturalidade', 'fidelidade', 'tipografia'] },
  { ordem: 41, texto: 'O extermínio de uma família só podia ser pago com o extermínio da outra.', justificativa: 'Preserva o paralelismo de 灭门 e a lógica de retribuição, evitando transformar a dívida de vingança em “ódio que exige”.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 44, texto: 'De vez em quando, as vozes dos outros garotos vinham de fora. Eles representavam outro mundo: realidade, simplicidade e esquecimento.', justificativa: '遗忘 é esquecimento; o mundo dos garotos permite esquecer. “Um mundo esquecido” inverte essa relação.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 45, texto: 'Gu Shenwei chegou a sentir um pouco de inveja e ciúme. Logo, porém, lembrou a si mesmo que, mesmo sem o peso da vingança, seu mundo não devia ser igual ao dos escravos lá fora. O que perdeu era maior e mais belo que tudo o que os escravos da Fortaleza do Peng Dourado perderam juntos.', justificativa: 'O chinês compara as perdas: não afirma que ele perdeu mais do que os outros possuem. Remove também “perdera/não haveria de” e preserva o orgulho do personagem.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 46, texto: 'Gu Shenwei nem sabia quantas centenas de vezes repetiu aquele golpe tão simples de baixo para cima. O sol já descia no céu quando se sentiu seguro e parou de treinar. Desceu da cama aquecida e andou de um lado para o outro para soltar o corpo.', justificativa: 'Recupera 不知练了几百遍 e remove o encadeamento participial, conservando o entardecer e a confiança no movimento.', categorias: ['fidelidade', 'naturalidade', 'ritmo'] },
  { ordem: 47, texto: 'Se a faca entrasse, uma vida terminaria. Se errasse o alvo ou não acertasse o ponto certo, seriam três. Mesmo assim, não sentia medo nem dúvida, como se o que estava prestes a fazer fosse a coisa mais normal do mundo e ele já tivesse muita experiência.', justificativa: '刺得不准 é não acertar com precisão; “atingir de raspão” restringe indevidamente as maneiras de falhar. Remove ornamentação sem reduzir a oposição entre uma e três vidas.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 49, texto: '*Talvez eu seja um assassino por natureza*, pensou Gu Shenwei. Os cantos da boca se ergueram num leve sorriso que nem ele percebeu.', justificativa: 'O pensamento avalia a aptidão para matar, sem designar um posto já ocupado na Fortaleza. Usa minúscula conforme a nota de uso do Gama e naturaliza a reação involuntária.', categorias: ['fidelidade', 'gama', 'naturalidade'] },
  { ordem: 51, texto: 'Xie Nu trouxe o jantar e a notícia de que tudo corria bem até então. Ninguém suspeitava do plano para matar Han Shiqi. Em breve, ele e o irmão tentariam distrair Han Jinu e os outros garotos. Huan Nu precisava entrar depressa e em silêncio no quarto de Jinu.', justificativa: 'Remove a repetição “trazido/trouxe” e a construção “conspiração em andamento”, mantendo notícia, distração e instrução na ordem do original.', categorias: ['naturalidade', 'ritmo'] },
  { ordem: 52, texto: 'Han Jinu costumava comer no mesmo cômodo que os garotos, embora, é claro, em outra mesa. Gostava de estar cercado por todos, ouvindo elogios. Para ele, a bajulação era o prato mais saboroso.', justificativa: 'Preserva a metáfora culinária sem “adulação/iguarias” e desfaz a ligação causal inadequada entre a mesa separada e o prazer de ser bajulado.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 55, texto: 'O estrado ficava a quase um metro acima de sua cabeça. Gu Shenwei deitou-se no chão frio e duro, esticou os braços e apontou a faca para um ponto a cerca de um metro da cabeceira e meio metro da borda. Por sorte, o ponto ficava bem na fresta entre duas tábuas, o que lhe pouparia muito trabalho.', justificativa: 'Distingue 近三尺 (quase um metro acima) de 三尺 (cerca de um metro da cabeceira) e remove a construção pesada com “calhava”.', categorias: ['fidelidade', 'naturalidade'] },
  { ordem: 56, texto: 'Era a posição que combinou antes com Qi Nu e seu irmão. Se o plano desse certo, as costas de Han Shiqi ficariam bem acima daquele ponto, na altura do coração.', justificativa: 'Remove “fora combinada” e recupera a referência explícita a Qi Nu, mantendo a orientação anatômica do alvo.', categorias: ['naturalidade', 'gama'] },
  { ordem: 58, texto: 'Todos conheciam a força dos Assassinos da Fortaleza do Peng Dourado. Mesmo gravemente ferido, Han Shiqi ainda poderia matar os três garotos com facilidade. Além disso, Jinu e as sentinelas atentas estavam lá fora. Qualquer grito estranho poderia custar a vida deles.', justificativa: 'Mantém a ameaça mesmo com o alvo ferido e naturaliza “traria a morte”, sem ampliar a hipótese para certeza. Preserva “sentinelas” conforme o Gama.', categorias: ['naturalidade', 'fidelidade', 'gama'] },
  { ordem: 60, texto: 'Por fim, passos entraram no quarto. Uma tosse, mais alguns passos, a lamparina acesa, os sapatos atirados de lado. Quem entrou saltou na cama e fez peso sobre as tábuas, sacudindo uma camada de poeira. Gu Shenwei foi pego de surpresa e espirrou.', justificativa: '屋内 é o quarto da cena, não uma casa. Preserva a sequência percebida sob a cama e a identidade ainda não revelada de quem chega, sem o decalque “passos vindo de fora”.', categorias: ['fidelidade', 'naturalidade', 'ritmo'] },
];

const db = new Database(caminho, { readonly: !gravar, fileMustExist: true });
if (gravar) db.pragma('foreign_keys = ON');
const capitulo = db.prepare('SELECT id, prompt_id, provedor, modelo FROM capitulos WHERE obra_id=1 AND numero=20').get() as
  { id: number; prompt_id: number; provedor: string; modelo: string } | undefined;
if (!capitulo || capitulo.provedor !== 'gemini' || capitulo.modelo !== 'gemini-3.8-flash') throw new Error('Capítulo/modelo diverge da base revisada.');
const frases = db.prepare('SELECT * FROM frases WHERE capitulo_id=? ORDER BY ordem').all(capitulo.id) as Frase[];
if (frases.length !== 61 || frases.some(f => f.status_traducao !== 'traduzida' || f.texto_pt !== f.texto_pt_original_ia)) {
  throw new Error('Base mudou: esperadas 61 frases traduzidas, ainda iguais à primeira IA.');
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
  if (!propostaPodeIrAoStaging(travas)) throw new Error(`20.${p.ordem}: ${JSON.stringify(travas)}`);
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
console.log(JSON.stringify({ modo: gravar ? 'staging' : 'validacao', capitulo: 20, propostas: propostas.length,
  preservadas: frases.length - propostas.length, lote_id: loteId, existente, base_sha256: baseHash,
  estilo: estilo.violacoes, gama: consistencia.violacoes,
  alertas: validadas.flatMap(p => p.travas.map(t => ({ ordem: p.ordem, ...t }))),
}, null, 2));
db.close();
