import Database from 'better-sqlite3';
import { caminhoBanco } from '../src/config.js';
import { NUCLEO_ANTI_DILUICAO_V4, comporOmega } from '../src/db/promptPadraoInicial.js';

const VERSAO_ALFA = '6.3';
const VERSAO_DELTA = '2.4';
const db = new Database(caminhoBanco(), { fileMustExist: true });
db.pragma('foreign_keys = ON');

const resultado = db.transaction(() => {
  const obra = db.prepare("SELECT id FROM obras WHERE titulo='O Sutra dos Mortos'").get() as { id: number } | undefined;
  if (!obra) throw new Error('Obra não encontrada.');
  const deltaAnterior = db.prepare('SELECT * FROM prompts WHERE obra_id=? AND ativo=1').get(obra.id) as {
    id: number; conteudo: string; preferencias: string | null;
  } | undefined;
  if (!deltaAnterior) throw new Error('Delta ativo não encontrado.');

  const alfaExistente = db.prepare('SELECT id, conteudo FROM prompt_padrao WHERE versao=?').get(VERSAO_ALFA) as
    | { id: number; conteudo: string }
    | undefined;
  if (alfaExistente && alfaExistente.conteudo !== NUCLEO_ANTI_DILUICAO_V4) throw new Error('Alfa 6.3 existe com bytes divergentes.');
  if (!alfaExistente) {
    db.prepare('INSERT INTO prompt_padrao (versao, conteudo, notas_versao, ativo) VALUES (?, ?, ?, 0)').run(
      VERSAO_ALFA,
      NUCLEO_ANTI_DILUICAO_V4,
      'Tom local governa voz, formalidade, densidade e ritmo; o perfil do leitor calibra apenas acessibilidade e não uniformiza o original.',
    );
  }
  const alfa = db.prepare('SELECT id, conteudo FROM prompt_padrao WHERE versao=?').get(VERSAO_ALFA) as { id: number; conteudo: string };

  const deltaExistente = db.prepare('SELECT id, conteudo, nucleo_id, preferencias FROM prompts WHERE obra_id=? AND versao=?').get(obra.id, VERSAO_DELTA) as
    | { id: number; conteudo: string; nucleo_id: number; preferencias: string | null }
    | undefined;
  if (deltaExistente && (
    deltaExistente.conteudo !== deltaAnterior.conteudo ||
    deltaExistente.nucleo_id !== alfa.id ||
    deltaExistente.preferencias !== deltaAnterior.preferencias
  )) throw new Error('Delta 2.4 existe com associação divergente.');
  if (!deltaExistente) {
    db.prepare(`
      INSERT INTO prompts (obra_id, versao, conteudo, notas_versao, ativo, tipo, nucleo_id, preferencias)
      VALUES (?, ?, ?, ?, 0, 'delta', ?, ?)
    `).run(
      obra.id,
      VERSAO_DELTA,
      deltaAnterior.conteudo,
      'Mesmo Delta específico da 2.3; nova associação imutável ao Alfa 6.3 e à Beta de tom local.',
      alfa.id,
      deltaAnterior.preferencias,
    );
  }

  db.prepare('UPDATE prompt_padrao SET ativo=CASE WHEN id=? THEN 1 ELSE 0 END').run(alfa.id);
  const delta = db.prepare('SELECT id, conteudo, preferencias FROM prompts WHERE obra_id=? AND versao=?').get(obra.id, VERSAO_DELTA) as {
    id: number; conteudo: string; preferencias: string;
  };
  db.prepare('UPDATE prompts SET ativo=CASE WHEN id=? THEN 1 ELSE 0 END WHERE obra_id=?').run(delta.id, obra.id);

  const omega = comporOmega(alfa.conteudo, delta.conteudo, JSON.parse(delta.preferencias));
  const obrigatorios = [
    'Tom e registro local:',
    'Não imponha ao capítulo uma voz global de “webnovel”',
    'Compare o efeito local com o chinês',
    'Na Fortaleza do Peng Dourado, Homem de Sabre, Assassino e Espectro são postos formais.',
  ];
  for (const trecho of obrigatorios) if (!omega.includes(trecho)) throw new Error(`Ômega sem regra obrigatória: ${trecho}`);
  if (omega.includes('Período curto a médio e ritmo rápido')) throw new Error('Ômega 6.3 ainda impõe ritmo global de webnovel.');
  if (/\{\{[^}]+\}\}/.test(omega)) throw new Error('Ômega 6.3 contém marcador não resolvido.');

  return { alfa: VERSAO_ALFA, alfaId: alfa.id, delta: VERSAO_DELTA, deltaId: delta.id, omegaCaracteres: omega.length };
})();

console.log(JSON.stringify(resultado, null, 2));
db.close();
