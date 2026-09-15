import Database from 'better-sqlite3';
import path from 'node:path';
import { caminhoBanco } from '../src/config.js';

const db = new Database(caminhoBanco(), { fileMustExist: true });
const backup = path.join(path.dirname(caminhoBanco()), 'backups', `pre-neixi-gama-${new Date().toISOString().replace(/[:.]/g, '-')}.db`);
await db.backup(backup);

const aplicar = db.transaction(() => {
  const neixi = db.prepare(`SELECT id,termo_pt FROM glossario WHERE obra_id=1 AND termo_zh='内息'`).get() as {id:number;termo_pt:string};
  if (neixi.termo_pt !== 'fluxo interno' && neixi.termo_pt !== 'respiração interna') throw new Error(`内息 divergente: ${neixi.termo_pt}`);
  db.prepare('UPDATE glossario SET termo_pt=?,nota_uso=?,ambiguo=1 WHERE id=?').run(
    'respiração interna',
    'Termo contextual. Estado ou disciplina respiratória: “respiração interna”; movimento do qi: “circulação da energia interna”; porção transmitida: “sopro de energia interna”. Não confundir com 内功 (arte/método) nem 内力 (força acumulada).',
    neixi.id,
  );

  const neigong = db.prepare(`SELECT id,termo_pt FROM glossario WHERE obra_id=1 AND termo_zh='内功'`).get() as {id:number;termo_pt:string};
  if (neigong.termo_pt !== 'arte de energia interna') throw new Error(`内功 divergente: ${neigong.termo_pt}`);
  db.prepare('UPDATE glossario SET nota_uso=? WHERE id=?').run(
    'Designa a arte, método ou disciplina de cultivo interno; não designa a circulação da energia. Preserve “arte de energia interna”, com flexão normal.',
    neigong.id,
  );

  const correcoes = [
    [51, 'O fluxo interno dele só se desregulou.', 'A respiração interna dele só se desregulou.'],
    [56, 'ativou a Força Yin e canalizou um fluxo interno para o corpo de Yao Nu.', 'ativou a Força Yin e transmitiu a Yao Nu um sopro de energia interna.'],
  ] as const;
  const obter = db.prepare(`SELECT f.id,f.texto_pt FROM frases f JOIN capitulos c ON c.id=f.capitulo_id WHERE c.obra_id=1 AND c.numero=18 AND f.ordem=?`);
  const atualizar = db.prepare('UPDATE frases SET texto_pt=?,editado_manualmente=1 WHERE id=?');
  for (const [ordem, antes, depois] of correcoes) {
    const f = obter.get(ordem) as {id:number;texto_pt:string};
    if (!f.texto_pt.includes(antes)) throw new Error(`18.${ordem}: texto auditado divergiu`);
    atualizar.run(f.texto_pt.replace(antes, depois), f.id);
  }
});

try {
  aplicar();
  console.log(JSON.stringify({backup,integridade:db.pragma('integrity_check')[0].integrity_check,gama:['内息','内功'],frases:2},null,2));
} finally { db.close(); }
