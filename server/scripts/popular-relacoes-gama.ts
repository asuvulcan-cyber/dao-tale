import Database from 'better-sqlite3';
import type { TipoRelacaoTermo } from '@dao-tale/shared';
import { caminhoBanco } from '../src/config.js';
import { reposRelacoesTermos } from '../src/db/repos/relacoesTermos.js';

const db = new Database(caminhoBanco(), { fileMustExist: true });
db.pragma('foreign_keys = ON');
const obra = db.prepare("SELECT id FROM obras WHERE titulo='O Sutra dos Mortos'").get() as { id: number } | undefined;
if (!obra) throw new Error('Obra não encontrada.');
const termos = db.prepare('SELECT id, termo_zh, principal_id FROM glossario WHERE obra_id=?').all(obra.id) as Array<{ id: number; termo_zh: string; principal_id: number | null }>;
const id = (zh: string) => {
  const e = termos.find((t) => t.termo_zh === zh);
  if (!e) throw new Error(`Termo ausente: ${zh}`);
  return e.principal_id ?? e.id;
};

type Fato = [string, TipoRelacaoTermo, string, string];
const fatos: Fato[] = [
  ['顾仑', 'pai-filho', '顾慎为', 'Gu Lun é pai de Gu Shenwei.'],
  ['许氏', 'mae-filho', '顾慎为', 'Madame Xu é mãe de Gu Shenwei.'],
  ['顾仑', 'conjuges', '许氏', 'Gu Lun e Madame Xu são casados.'],
  ['顾慎为', 'irmao-irma', '顾翠兰', 'Gu Shenwei é irmão mais novo de Gu Cuilan.'],
  ['顾仑', 'lidera', '顾家', 'Gu Lun é o patriarca da família Gu.'],
  ['顾慎为', 'membro-de', '顾家', 'Gu Shenwei pertence à família Gu.'],
  ['顾翠兰', 'membro-de', '顾家', 'Gu Cuilan pertence à família Gu.'],
  ['许氏', 'membro-de', '顾家', 'Madame Xu integra a família Gu.'],
  ['杨峥', 'serve-a', '顾家', 'Yang Zheng é criado velho da família Gu.'],
  ['菊香', 'serve-a', '顾翠兰', 'Juxiang é criada pessoal de Gu Cuilan.'],
  ['铁山大头神', 'pai-filha', '罗宁茶', 'Luo Ningcha é filha do Deus Cabeçudo.'],
  ['铁山大头神', 'lidera', '铁山匪帮', 'O Deus Cabeçudo lidera o Bando da Montanha de Ferro.'],
  ['铁山匪帮', 'originario-de', '铁山', 'O bando é originário da Montanha de Ferro.'],
  ['罗宁茶', 'conjuges', '上官怒', 'Luo Ningcha é casada com Shangguan Nu.'],
  ['雪娘', 'serve-a', '罗宁茶', 'Mãe Neve é criada pessoal de Luo Ningcha.'],
  ['小称', 'serve-a', '罗宁茶', 'Xiao Cheng é criada pessoal de Luo Ningcha.'],
  ['小心', 'serve-a', '罗宁茶', 'Xiao Xin é criada pessoal de Luo Ningcha.'],
  ['小意', 'serve-a', '罗宁茶', 'Xiao Yi é criada pessoal de Luo Ningcha.'],
  ['小遂', 'serve-a', '罗宁茶', 'Xiao Sui é criada pessoal de Luo Ningcha.'],
  ['上官伐', 'pai-filho', '上官怒', 'Shangguan Nu é o oitavo filho de Shangguan Fa.'],
  ['上官伐', 'lidera', '上官家', 'Shangguan Fa lidera a família Shangguan.'],
  ['上官怒', 'membro-de', '上官家', 'Shangguan Nu pertence à família Shangguan.'],
  ['上官家', 'localizado-em', '金鹏堡', 'A família Shangguan tem sua sede na Fortaleza do Peng Dourado.'],
  ['飞鹰', 'lidera', '飞鹰帮', 'Águia Voadora lidera o Bando da Águia Voadora.'],
  ['戚奴', 'irmao-irmao', '谢奴', 'Qi Nu e Xie Nu são irmãos.'],
  ['韩机奴', 'irmao-juramentado-de', '韩世奇', 'Han Jinu chama Han Shiqi de Terceiro Irmão; relação de irmandade, não registrada como parentesco biológico.'],
  ['上官怒', 'inimigo-de', '顾家', 'Shangguan Nu é apontado como inimigo da família Gu.'],
];

let inseridas = 0;
let existentes = 0;
db.transaction(() => {
  for (const [origem, tipo, destino, nota] of fatos) {
    const r = reposRelacoesTermos.criar(db, obra.id, {
      origem_termo_id: id(origem), destino_termo_id: id(destino), tipo, nota,
      confirmado_por: 'migracao-curada',
    });
    if (r === 'duplicada') existentes++;
    else if (r === 'invalida') throw new Error(`Relação inválida: ${origem} ${tipo} ${destino}`);
    else inseridas++;
  }
})();
console.log(JSON.stringify({ fatos: fatos.length, inseridas, existentes }, null, 2));
db.close();
