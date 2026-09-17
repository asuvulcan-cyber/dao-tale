// Experimento pareado exploratório; não promove prompt nem grava no banco.
// DAO_TALE_BANCO=... DAO_TALE_DIR=... tsx este-script SAIDA.json [--executar]
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { reposPrompts, reposGlossario } from '../src/db/repos.js';
import { obterChave } from '../src/credenciais/index.js';
import { obterProvedor } from '../src/ia/fabrica.js';
import { filtrarGlossarioRelevante, incluirPrincipais } from '../src/ia/prompts.js';

const saida = process.argv.slice(2).find(a => !a.startsWith('--'));
const executar = process.argv.includes('--executar');
if (!saida || !process.env.DAO_TALE_BANCO) throw new Error('Informe saída e DAO_TALE_BANCO.');
if (fs.existsSync(saida)) throw new Error('Saída já existe; não sobrescrever nem repetir chamadas.');
const db = new Database(process.env.DAO_TALE_BANCO, { readonly: true, fileMustExist: true });
const omega = reposPrompts.composto(db, 1);
if (!omega || omega.nucleo?.versao !== '6.3' || omega.prompt.versao !== '2.4') {
  throw new Error('Esperados Alfa 6.3 e Delta 2.4; confira a base antes de experimentar.');
}
const gama = reposGlossario.listar(db, 1);
const orientacao = '\n\n## Ajuste experimental de registro\nNa narração neutra, use português brasileiro corrente, sem elevar o registro só por ser literatura. Preserve a voz solene quando ela pertencer à cena ou ao personagem. Não substitua automaticamente palavras por sinônimos: escolha uma construção natural no contexto. Preserve imagens, intensidade, ambiguidades e relações de tempo; quando houver anterioridade necessária, mantenha-a. Não simplifique à custa de informação nem acrescente explicações.\n';
type Linha = { ordem: number; texto_zh: string; texto_pt: string; texto_pt_original_ia: string };
const blocos = [{ capitulo: 23, inicio: 30 }, { capitulo: 24, inicio: 40 }].map(alvo => {
  const linhas = db.prepare('SELECT f.ordem,f.texto_zh,f.texto_pt,f.texto_pt_original_ia FROM frases f JOIN capitulos c ON c.id=f.capitulo_id WHERE c.obra_id=1 AND c.numero=? ORDER BY f.ordem').all(alvo.capitulo) as Linha[];
  const bloco = linhas.filter(f => f.ordem >= alvo.inicio && f.ordem < alvo.inicio + 10);
  if (bloco.length !== 10) throw new Error('Bloco incompleto.');
  return { ...alvo, bloco, cauda: linhas.filter(f => f.ordem >= alvo.inicio - 3 && f.ordem < alvo.inicio), proximas: linhas.filter(f => f.ordem >= alvo.inicio + 10 && f.ordem < alvo.inicio + 13) };
});
db.close();
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const ambiente = { modelo: 'gemini-3.8-flash', temperatura: 0.3, omega: omega.texto, orientacao, gama, blocos };
const resultados: unknown[] = [];
const documento = () => ({ esquema: 'dao-tale-registro-pareado-v1', gerado_em: new Date().toISOString(),
  aviso: 'Exploratório, uma amostra por condição. Capítulos já vistos; não é teste cego nem holdout. Referências aprovadas não são enviadas como exemplos.',
  ambiente_sha256: hash(ambiente), ambiente, executar, resultados });
// Reserva a saída antes de qualquer chamada paga. Resultado parcial sobrevive a falha.
fs.writeFileSync(saida, JSON.stringify(documento(), null, 2), { flag: 'wx', mode: 0o600 });
if (executar) {
  const provedor = obterProvedor('gemini');
  const chave = await obterChave('gemini');
  if (!chave) throw new Error('Chave Gemini não configurada.');
  for (const [indice, alvo] of blocos.entries()) {
    // Alterna ordem das condições; contexto histórico idêntico, sem texto aprovado.
    for (const variante of indice === 0 ? ['base', 'registro'] : ['registro', 'base']) {
      const cauda = alvo.cauda.map(f => ({ texto_zh: f.texto_zh, texto_pt: f.texto_pt_original_ia }));
      const frases = alvo.bloco.map(f => ({ ordem: f.ordem, texto_zh: f.texto_zh }));
      const proximas = alvo.proximas.map(f => f.texto_zh);
      const glossario = incluirPrincipais(filtrarGlossarioRelevante(gama, [...frases.map(f => f.texto_zh), ...cauda.map(f => f.texto_zh), ...proximas]), gama);
      try {
        const resposta = await provedor.traduzirBloco(chave, { modelo: ambiente.modelo, temperatura: ambiente.temperatura,
          omega: omega.texto + (variante === 'registro' ? orientacao : ''), glossario, glossarioNoUsuario: true,
          termosAdotados: [], caudaAnterior: cauda, frases, proximas });
        const ordens = resposta.traducoes.map(t => t.ordem);
        const completo = ordens.length === 10 && new Set(ordens).size === 10 && frases.every(f => resposta.traducoes.some(t => t.ordem === f.ordem && t.texto_pt.trim()));
        resultados.push({ capitulo: alvo.capitulo, variante, completo, resposta });
        fs.writeFileSync(saida, JSON.stringify(documento(), null, 2));
        console.log(JSON.stringify({ capitulo: alvo.capitulo, variante, completo, uso: resposta.uso }));
        if (!completo) throw new Error('Resposta incompleta; interrompido sem repetição automática.');
      } catch (erro) {
        fs.writeFileSync(saida, JSON.stringify({ ...documento(), interrompido: true }, null, 2));
        throw erro;
      }
    }
  }
}
console.log(JSON.stringify({ saida, chamadasPlanejadas: 4, resultados: resultados.length, ambiente_sha256: hash(ambiente) }));
