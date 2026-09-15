import Database from 'better-sqlite3';
import { caminhoBanco } from '../src/config.js';
import {
  recalcularConsistenciaDaObra,
  reposConsistencia,
  reposFrases,
  reposGlossario,
} from '../src/db/repos.js';
import { separarPorChecagem } from '../src/traducao/glossarioChecavel.js';
import { varrerConsistencia } from '../src/traducao/consistencia.js';

/**
 * Curadoria integral do Gama de O Sutra dos Mortos.
 *
 * Contratos:
 * - categoria descreve a natureza semântica; não substitui espécie;
 * - principal_id liga somente nomes do mesmo referente;
 * - termo_pai_id liga pertencimento/contenção útil ao contexto e à árvore;
 * - ambiguo sinaliza que o gatilho chinês nem sempre impõe a forma cadastrada;
 * - nota explica o verbete; nota_uso delimita aplicação e não vira um segundo glossário.
 */

const categorias: Record<string, readonly string[]> = {
  personagem: [
    '上官伐', '上官怒', '刘选', '大头神', '小如', '小心', '小意', '小称', '小遂',
    '尖脸少年', '戚奴', '机奴', '杨峥', '杨欢', '林洋', '欢儿', '欢奴', '罗宁茶',
    '罗氏宁茶', '翠兰', '茗香', '菊香', '解奴', '许氏', '谢奴', '逍奴', '遥奴',
    '铁山大头神', '雪娘', '韩世奇', '韩机奴', '顾仑', '顾慎为', '顾翠兰', '飞鹰', '龙飞度',
  ],
  grupo: ['上官家', '孟家', '铁山匪帮', '顾家', '飞鹰帮'],
  local: [
    '东堡', '东院门', '中原', '北堡', '北庭', '大雪山', '天山', '抛尸崖', '洗心院',
    '璧玉城', '疏勒', '积薪院', '西域', '西域三十六国', '西堡院', '西门', '西院',
    '金鹏堡', '铁山', '鬼叫崖', '鬼院', '庄园', '弹多锋',
  ],
  titulo: ['大雪山剑客', '杨元帅', '独步王', '王主', '神武将军', '铁山小姐', '雪山剑客'],
  tratamento: [
    '三哥', '主子', '八少主', '八少奶奶', '小姐', '小少爷', '少主', '少奶奶', '少爷',
    '师父杨峥', '教习大人', '新奶奶', '杨师父', '欢少爷', '老爷', '韩大人', '韩院管',
  ],
  'posto-funcao': [
    '刀主', '刀手', '刀客', '刺客', '喽罗', '女主人', '守夜人', '庄丁', '杀手',
    '杂役', '跟班', '青面',
  ],
  'arte-marcial': [
    '合和劲', '伏虎拳', '八卦掌', '内功', '内功心法', '刀枪双绝', '刀法', '功夫',
    '拳法', '武术流派', '速成法门', '铁指',
  ],
  'conceito-marcial': [
    '阳', '阴', '老阳', '老阴', '丹田', '内丹', '内力', '内息', '太冲', '走火入魔',
    '阳劲', '阴劲',
  ],
  'medicina-tradicional': ['内关', '天池', '天池穴', '天泉', '曲泽', '手厥阴心包经'],
  objeto: ['刀', '剑', '枪', '短剑', '躺椅', '慈悲散', '炕', '笼车', '白绢', '红木'],
  texto: ['内功秘笈', '千字文', '无道书', '杀手两戒', '死人经', '秘笈'],
  idioma: ['中原话', '西域胡语'],
  criatura: ['饕餮'],
  'conceito-cultural': ['武林', '江湖', '神意'],
  'geografia-comum': ['大漠戈壁', '戈壁', '戈壁大漠'],
  'lexico-geral': ['小姐的婆家', '小崽子', '少年', '无耻'],
};

type Ajuste = {
  termo_pt?: string;
  especie?: 'identidade' | 'lexical';
  ambiguo?: 0 | 1;
  nota?: string;
  nota_uso?: string | null;
};

const ajustes: Record<string, Ajuste> = {
  杨元帅: {
    especie: 'identidade',
    nota: 'Marechal supostamente localizado em Shule que Yang Zheng manda Gu Shenwei procurar; os moradores afirmam que ele não existe. Não é outro nome de Yang Zheng.',
  },
  独步王: {
    especie: 'lexical',
    nota: 'Título hereditário do governante da Fortaleza do Peng Dourado; Shangguan Fa é o sétimo a ocupá-lo.',
    nota_uso: 'Flexione em referências às gerações do título: “Rei Incomparável” e “Reis Incomparáveis”.',
  },
  刀主: {
    especie: 'lexical',
    nota: 'Posto de liderança entre os Assassinos da Fortaleza do Peng Dourado; há pouco mais de uma dezena de ocupantes.',
    nota_uso: 'Use inicial maiúscula quando designar o posto institucional da Fortaleza; flexione número conforme o contexto.',
  },
  刀手: {
    nota_uso: 'Na hierarquia da Fortaleza do Peng Dourado, use “Homem de Sabre”, com inicial maiúscula e flexão normal. Não confundir com espadachim nem substituir por categoria genérica.',
  },
  刺客: {
    ambiguo: 1,
    nota_uso: 'Use “Espectro” somente para o posto superior da Fortaleza do Peng Dourado. Fora dessa hierarquia, traduza o sentido contextual sem impor este verbete.',
  },
  杀手: {
    ambiguo: 1,
    nota_uso: 'Use “Assassino”, com inicial maiúscula, quando designar o posto ou um membro da categoria na Fortaleza do Peng Dourado. Em emprego comum, use minúscula e traduza conforme o contexto.',
  },
  尖脸少年: {
    especie: 'identidade',
    ambiguo: 0,
    nota: 'Designação descritiva de Lin Yang antes de seu nome ser revelado; depois ele recebe o nome de escravo Yao Nu.',
    nota_uso: 'Use a forma completa ao apresentá-lo; depois de estabelecido o referente, “o garoto”, o nome ou um pronome podem ser mais naturais.',
  },
  小遂: {
    especie: 'identidade',
    nota_uso: 'Novo nome de Xiao Ru depois da substituição de 如 por 遂 na expressão formada pelos nomes das quatro criadas.',
  },
  孟家: { especie: 'identidade' },
  天泉: { especie: 'identidade' },
  曲泽: { especie: 'identidade' },
  内关: { especie: 'identidade' },
  天池: {
    especie: 'identidade',
    nota: 'Forma abreviada de 天池穴 no contexto dos pontos do Meridiano do Pericárdio Jueyin da Mão.',
    nota_uso: 'Variante de “ponto Tianchi”; a omissão de “ponto” é aceitável quando a natureza anatômica já estiver clara.',
  },
  内息: { especie: 'lexical' },
  内功: {
    nota: 'Arte, disciplina ou método de cultivo interno nas artes marciais; distingue-se da energia acumulada (内力) e da circulação ou sopro interno (内息).',
  },
  西门: {
    termo_pt: 'portão oeste',
    especie: 'lexical',
    ambiguo: 1,
    nota: 'Designação direcional, não um único topônimo: aparece tanto no portão oeste da Cidade de Jade quanto no portão oeste do pequeno pátio onde os garotos vivem.',
    nota_uso: 'Use minúscula quando for apenas a posição do portão. Capitalize somente se o contexto estabelecer um nome próprio inequívoco.',
  },
  东院门: {
    termo_pt: 'portão leste do pátio',
    especie: 'lexical',
    nota: 'Portão leste do pequeno pátio onde os garotos vivem; não é o nome próprio de uma área chamada Pátio Leste.',
    nota_uso: 'Use como descrição espacial em minúscula: “portão leste do pátio”.',
  },
  西院: {
    nota: 'Forma abreviada de 西堡院, a área da Fortaleza do Peng Dourado que reúne os pátios de serviço.',
  },
  守夜人: {
    termo_pt: 'sentinela',
    ambiguo: 0,
    nota_uso: 'Use “sentinela noturno” na apresentação ou quando o turno noturno precisar ser explicitado; depois de estabelecida a função, “sentinela” é suficiente.',
  },
  炕: { ambiguo: 0 },
  白绢: {
    especie: 'lexical',
    ambiguo: 1,
    nota: 'Pedaço de seda branca que contém o texto da Força Harmoniosa e se torna objeto central do plano de vingança de Gu Shenwei.',
    nota_uso: 'Use “pano de seda branca” quando for preciso explicitar o objeto; “seda branca” ou “seda” são naturais depois de estabelecido. Não use “lenço” sem essa função no original.',
  },
  小崽子: {
    nota: 'Insulto coloquial dirigido a crianças ou adolescentes, com desprezo semelhante a “pirralho”.',
  },
  少年: {
    nota: 'Substantivo comum para adolescente ou jovem do sexo masculino; a escolha deve acompanhar idade, ponto de vista e contexto.',
  },
  无耻: {
    nota: 'Qualidade ou insulto ligado à falta de vergonha; a classe gramatical e a intensidade variam conforme a frase.',
  },
  庄丁: {
    termo_pt: 'guarda',
    ambiguo: 0,
    nota_uso: 'Na propriedade da família Gu, “guarda da propriedade” explicita a função quando necessário; depois de estabelecido o contexto, “guarda” é suficiente.',
  },
  红木: {
    nota: 'Madeira nobre avermelhada; no contexto da obra, padronizada como pau-rosa.',
  },
  少奶奶: {
    nota: 'Tratamento dado à jovem esposa de um filho da casa ou da família dominante.',
  },
  新奶奶: {
    nota: 'Tratamento dado à mulher recém-casada que acaba de ingressar na casa; no trecho, Luo Ningcha.',
  },
  功夫: {
    nota: 'Termo polissêmico que, nos contextos catalogados, designa habilidade, prática ou técnica marcial.',
  },
};

// Somente o mesmo referente. Ausência explícita remove ligações antigas erradas.
const principais: Record<string, string | null> = {
  大头神: '铁山大头神',
  尖脸少年: '林洋',
  机奴: '韩机奴',
  杨欢: '顾慎为',
  欢儿: '顾慎为',
  欢奴: '顾慎为',
  罗氏宁茶: '罗宁茶',
  翠兰: '顾翠兰',
  遥奴: '林洋',
  鬼院: '洗心院',
  三哥: '韩世奇',
  八少主: '上官怒',
  八少奶奶: '罗宁茶',
  大雪山剑客: '龙飞度',
  师父杨峥: '杨峥',
  杨师父: '杨峥',
  欢少爷: '顾慎为',
  神武将军: '顾仑',
  王主: '上官伐',
  铁山小姐: '罗宁茶',
  雪山剑客: '龙飞度',
  韩大人: '韩世奇',
  韩院管: '韩机奴',
  天池: '天池穴',
  西院: '西堡院',
  杨元帅: null,
  独步王: null,
  小姐: null,
};

// Um único nível de pertencimento útil. Variantes herdam o contexto do principal.
const pais: Record<string, string> = {
  上官伐: '上官家',
  上官怒: '上官家',
  顾仑: '顾家',
  顾慎为: '顾家',
  顾翠兰: '顾家',
  许氏: '顾家',
  杨峥: '顾家',
  金鹏堡: '西域',
  璧玉城: '西域',
  铁山: '西域',
  大雪山: '西域',
  天山: '西域',
  疏勒: '西域',
  东堡: '金鹏堡',
  北堡: '金鹏堡',
  西堡院: '金鹏堡',
  积薪院: '西堡院',
  洗心院: '西堡院',
  东院门: '积薪院',
  抛尸崖: '金鹏堡',
  鬼叫崖: '金鹏堡',
  合和劲: '顾家',
  阳劲: '合和劲',
  阴劲: '合和劲',
  速成法门: '合和劲',
  老阳: '阳',
  老阴: '阴',
  天池穴: '手厥阴心包经',
  天泉: '手厥阴心包经',
  曲泽: '手厥阴心包经',
  内关: '手厥阴心包经',
};

const db = new Database(caminhoBanco(), { fileMustExist: true });
db.pragma('foreign_keys = ON');
const obra = db.prepare("SELECT id FROM obras WHERE titulo='O Sutra dos Mortos'").get() as { id: number } | undefined;
if (!obra) throw new Error('Obra não encontrada.');

const entradas = db.prepare('SELECT * FROM glossario WHERE obra_id=? ORDER BY id').all(obra.id) as Array<{
  id: number; termo_zh: string; especie: string | null; categoria: string;
}>;
const categoriaPorTermo = new Map<string, string>();
for (const [categoria, termos] of Object.entries(categorias)) {
  for (const termo of termos) {
    if (categoriaPorTermo.has(termo)) throw new Error(`Termo em duas categorias: ${termo}`);
    categoriaPorTermo.set(termo, categoria);
  }
}
const ausentes = entradas.filter((e) => !categoriaPorTermo.has(e.termo_zh)).map((e) => e.termo_zh);
const extras = [...categoriaPorTermo.keys()].filter((zh) => !entradas.some((e) => e.termo_zh === zh));
if (ausentes.length || extras.length) throw new Error(`Cobertura inválida. Sem categoria=${ausentes.join(', ')}; inexistentes=${extras.join(', ')}`);

const idPorZh = new Map(entradas.map((e) => [e.termo_zh, e.id]));
const id = (zh: string): number => {
  const valor = idPorZh.get(zh);
  if (!valor) throw new Error(`Referência inexistente: ${zh}`);
  return valor;
};

const atualizar = db.prepare(`
  UPDATE glossario SET categoria=@categoria, termo_pt=@termo_pt, especie=@especie,
    ambiguo=@ambiguo, nota=@nota, nota_uso=@nota_uso, principal_id=@principal_id,
    termo_pai_id=@termo_pai_id WHERE id=@id
`);

const correcoesPortoes = [
  [12, 12, 'pelo Portão Oeste', 'pelo portão oeste'],
  [12, 16, 'além do Portão Oeste', 'além do portão oeste'],
  [15, 34, 'rumo ao Portão Oeste', 'rumo ao portão oeste'],
  [16, 55, 'seguiram para o Portão Oeste', 'seguiram para o portão oeste'],
  [17, 30, 'para fora pelo Portão Oeste', 'para fora pelo portão oeste'],
  [16, 67, 'portão do Pátio Leste', 'portão leste do pátio'],
  [16, 68, 'portão do Pátio Leste', 'portão leste do pátio'],
] as const;

const resultado = db.transaction(() => {
  // Começa zerando relações: a lista abaixo é a fonte integral, não um patch parcial.
  db.prepare('UPDATE glossario SET principal_id=NULL, termo_pai_id=NULL WHERE obra_id=?').run(obra.id);
  for (const entrada of entradas) {
    const atual = db.prepare('SELECT * FROM glossario WHERE id=?').get(entrada.id) as any;
    const a = ajustes[entrada.termo_zh] ?? {};
    const principal = Object.prototype.hasOwnProperty.call(principais, entrada.termo_zh)
      ? principais[entrada.termo_zh]
      : null;
    atualizar.run({
      id: entrada.id,
      categoria: categoriaPorTermo.get(entrada.termo_zh),
      termo_pt: a.termo_pt ?? atual.termo_pt,
      especie: a.especie ?? atual.especie,
      ambiguo: a.ambiguo ?? atual.ambiguo,
      nota: a.nota ?? atual.nota,
      nota_uso: a.nota_uso === undefined ? atual.nota_uso : a.nota_uso,
      principal_id: principal ? id(principal) : null,
      termo_pai_id: pais[entrada.termo_zh] ? id(pais[entrada.termo_zh]) : null,
    });
  }

  // A curadoria revelou que 西门 e 东院门 eram direções, não topônimos.
  // Corrige apenas os trechos exatos auditados e preserva a proposta histórica
  // quando o usuário já tiver editado o texto depois da aprovação.
  const obterFrase = db.prepare(`
    SELECT f.id, f.capitulo_id, f.texto_pt FROM frases f
    JOIN capitulos c ON c.id=f.capitulo_id
    WHERE c.obra_id=? AND c.numero=? AND f.ordem=?
  `);
  for (const [capitulo, ordem, antes, depois] of correcoesPortoes) {
    const frase = obterFrase.get(obra.id, capitulo, ordem) as { id: number; capitulo_id: number; texto_pt: string } | undefined;
    if (!frase) throw new Error(`Frase dos portões ausente: ${capitulo}.${ordem}`);
    if (frase.texto_pt.split(antes).length !== 2) throw new Error(`Trecho dos portões mudou: ${capitulo}.${ordem} (${antes})`);
    const corrigido = frase.texto_pt.replace(antes, depois);
    db.prepare("UPDATE frases SET texto_pt=?, editado_manualmente=1, origem_edicao='revisao-literaria' WHERE id=?").run(corrigido, frase.id);
    const revisao = db.prepare("SELECT id, status, texto_revisado FROM revisoes_literarias WHERE lote_id=2 AND frase_id=?").get(frase.id) as
      | { id: number; status: string; texto_revisado: string }
      | undefined;
    if (revisao?.status === 'aprovada' && revisao.texto_revisado === frase.texto_pt) {
      db.prepare(`UPDATE revisoes_literarias SET texto_revisado=?,
        justificativa=coalesce(justificativa || ' ', '') || ?,
        atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
        .run(corrigido, '[Consistência espacial do Gama: portão direcional, não topônimo.]', revisao.id);
    }
    db.prepare("UPDATE capitulos SET atualizado_em=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(frase.capitulo_id);
  }

  // Anáforas naturais conferidas: o chinês repete a descrição, enquanto o
  // português usa “o garoto”, pronome ou o nome já apresentado.
  const dispensasAnáfora = [
    [8, 19], [8, 60], [9, 4], [9, 12], [9, 59], [9, 60], [9, 66],
  ] as const;
  const inserirDispensa = db.prepare('INSERT OR IGNORE INTO consistencia_ignorada (frase_id, termo_zh) VALUES (?, ?)');
  for (const [capitulo, ordem] of dispensasAnáfora) {
    const frase = obterFrase.get(obra.id, capitulo, ordem) as { id: number } | undefined;
    if (!frase) throw new Error(`Anáfora ausente: ${capitulo}.${ordem}`);
    inserirDispensa.run(frase.id, '尖脸少年');
  }
  const sentinelaPeloNome = obterFrase.get(obra.id, 17, 29) as { id: number } | undefined;
  if (!sentinelaPeloNome) throw new Error('Anáfora ausente: 17.29');
  inserirDispensa.run(sentinelaPeloNome.id, '守夜人');

  const semEspecie = db.prepare('SELECT termo_zh FROM glossario WHERE obra_id=? AND especie IS NULL').all(obra.id);
  if (semEspecie.length) throw new Error(`Ainda sem espécie: ${JSON.stringify(semEspecie)}`);
  const ciclos = db.prepare(`
    WITH RECURSIVE arvore(origem, atual, caminho, ciclo) AS (
      SELECT id, termo_pai_id, printf('/%d/', id), 0 FROM glossario WHERE obra_id=? AND termo_pai_id IS NOT NULL
      UNION ALL
      SELECT a.origem, g.termo_pai_id, a.caminho || g.id || '/', instr(a.caminho, printf('/%d/', g.id)) > 0
      FROM arvore a JOIN glossario g ON g.id=a.atual WHERE a.atual IS NOT NULL AND a.ciclo=0
    ) SELECT DISTINCT origem FROM arvore WHERE ciclo=1
  `).all(obra.id);
  if (ciclos.length) throw new Error(`Ciclo na árvore: ${JSON.stringify(ciclos)}`);
  recalcularConsistenciaDaObra(db, obra.id);
  return {
    entradas: entradas.length,
    categorias: Object.keys(categorias).length,
    identidades: db.prepare("SELECT count(*) n FROM glossario WHERE obra_id=? AND especie='identidade'").get(obra.id),
    lexicais: db.prepare("SELECT count(*) n FROM glossario WHERE obra_id=? AND especie='lexical'").get(obra.id),
    ambiguos: db.prepare('SELECT count(*) n FROM glossario WHERE obra_id=? AND ambiguo=1').get(obra.id),
    variantes: db.prepare('SELECT count(*) n FROM glossario WHERE obra_id=? AND principal_id IS NOT NULL').get(obra.id),
    filhos: db.prepare('SELECT count(*) n FROM glossario WHERE obra_id=? AND termo_pai_id IS NOT NULL').get(obra.id),
  };
})();

console.log(JSON.stringify(resultado, null, 2));
const { checaveis } = separarPorChecagem(reposGlossario.listar(db, obra.id));
const violacoes = varrerConsistencia(
  reposFrases.listarPorObra(db, obra.id),
  checaveis,
  reposConsistencia.ignoradasDaObra(db, obra.id),
).violacoes;
if (violacoes.length) console.log(JSON.stringify({ violacoes }, null, 2));
db.close();
