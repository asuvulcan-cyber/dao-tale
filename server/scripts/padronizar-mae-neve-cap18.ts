import Database from 'better-sqlite3';
import path from 'node:path';
import { caminhoBanco } from '../src/config.js';

const db = new Database(caminhoBanco(), { fileMustExist: true });
const backup = path.join(path.dirname(caminhoBanco()), 'backups', `pre-artigo-mae-neve-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
await db.backup(backup);
const mudancas = new Map<number, [string, string]>([
  [14, ['pedir ajuda a Mãe Neve', 'pedir ajuda à Mãe Neve']],
  [35, ['Mãe Neve conteve', 'A Mãe Neve conteve']],
  [38, ['mandava Mãe Neve', 'mandava a Mãe Neve']],
  [40, ['de Mãe Neve e seguir', 'da Mãe Neve e seguir']],
  [41, ['bastava Mãe Neve', 'bastava a Mãe Neve']],
  [44, ['de tanto rir Mãe Neve', 'de tanto rir, a Mãe Neve']],
  [46, ['rosto de Mãe Neve', 'rosto da Mãe Neve']],
  [47, ['experiente, Mãe Neve', 'experiente, a Mãe Neve']],
  [51, ['Mãe Neve não acreditava', 'A Mãe Neve não acreditava']],
  [53, ['Mãe Neve ordenou', 'A Mãe Neve ordenou']],
]);

const obter = db.prepare(`SELECT f.id,f.texto_pt FROM frases f JOIN capitulos c ON c.id=f.capitulo_id WHERE c.obra_id=1 AND c.numero=18 AND f.ordem=?`);
const atualizar = db.prepare('UPDATE frases SET texto_pt=?,editado_manualmente=1 WHERE id=?');
const aplicar = db.transaction(() => {
  for (const [ordem, [antes, depois]] of mudancas) {
    const f = obter.get(ordem) as { id:number; texto_pt:string };
    if (!f.texto_pt.includes(antes)) throw new Error(`18.${ordem}: trecho esperado ausente`);
    atualizar.run(f.texto_pt.replace(antes, depois), f.id);
  }
  // Segunda ocorrência, no mesmo segmento 40.
  const f40 = obter.get(40) as { id:number; texto_pt:string };
  if (!f40.texto_pt.includes('com Mãe Neve')) throw new Error('18.40: segunda ocorrência ausente');
  atualizar.run(f40.texto_pt.replace('com Mãe Neve', 'com a Mãe Neve'), f40.id);
  const gama = db.prepare(`SELECT id,nota_uso FROM glossario WHERE obra_id=1 AND termo_zh='雪娘'`).get() as {id:number;nota_uso:string|null};
  const nota = 'Como epíteto usado como nome próprio, recebe artigo definido: “a Mãe Neve”, “da Mãe Neve”, “à Mãe Neve”.';
  if (gama.nota_uso && gama.nota_uso !== nota) throw new Error('nota de uso de 雪娘 já contém outra orientação');
  db.prepare('UPDATE glossario SET nota_uso=? WHERE id=?').run(nota, gama.id);
});
try { aplicar(); console.log(JSON.stringify({backup,integridade:db.pragma('integrity_check')[0].integrity_check,frases:10,gama:'雪娘'},null,2)); }
finally { db.close(); }
