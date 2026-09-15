import Database from 'better-sqlite3';
import path from 'node:path';
import { caminhoBanco } from '../src/config.js';

const db = new Database(caminhoBanco(), { fileMustExist: true });
const backup = path.join(path.dirname(caminhoBanco()), 'backups', `pre-gama-cap18-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
await db.backup(backup);
const correcoes = [
  [8, 'Se entendesse um pouco de cultivo de energia interna,', 'Se entendesse um pouco da arte de energia interna,'],
  [51, 'A energia interna dele só se desregulou.', 'O fluxo interno dele só se desregulou.'],
  [56, 'ativou a Força Yin e transferiu uma corrente de energia interna.', 'ativou a Força Yin e canalizou um fluxo interno para o corpo de Yao Nu.'],
] as const;
const obter = db.prepare(`SELECT f.id,f.texto_pt FROM frases f JOIN capitulos c ON c.id=f.capitulo_id WHERE c.obra_id=1 AND c.numero=18 AND f.ordem=?`);
const atualizar = db.prepare('UPDATE frases SET texto_pt=?,editado_manualmente=1 WHERE id=?');
const aplicar = db.transaction(() => {
  for (const [ordem, antes, depois] of correcoes) {
    const f = obter.get(ordem) as {id:number;texto_pt:string};
    if (!f.texto_pt.includes(antes)) throw new Error(`18.${ordem}: texto auditado divergiu`);
    atualizar.run(f.texto_pt.replace(antes, depois), f.id);
  }
});
try { aplicar(); console.log(JSON.stringify({backup,integridade:db.pragma('integrity_check')[0].integrity_check,alteradas:3},null,2)); }
finally { db.close(); }
