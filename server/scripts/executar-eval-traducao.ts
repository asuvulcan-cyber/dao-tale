import fs from 'node:fs';
import crypto from 'node:crypto';
import type { EntradaGlossario, ProvedorId } from '@dao-tale/shared';
import { obterChave } from '../src/credenciais/index.js';
import { obterProvedor } from '../src/ia/fabrica.js';
import { filtrarGlossarioRelevante, incluirPrincipais } from '../src/ia/prompts.js';

const args = process.argv.slice(2);
const [evalPath, provedorTexto, modelo, saida] = args.filter((a) => !a.startsWith('--'));
const particao = args.find((a) => a.startsWith('--particao='))?.split('=')[1] ?? 'teste';
if (!evalPath || !provedorTexto || !modelo || !saida || !['teste', 'calibracao'].includes(particao)) {
  console.error('Uso: tsx server/scripts/executar-eval-traducao.ts EVAL.json PROVEDOR MODELO SAIDA.json [--particao=teste|calibracao]');
  process.exit(2);
}
const evalSerializado = fs.readFileSync(evalPath, 'utf8');
const conjunto = JSON.parse(evalSerializado);
if (conjunto.esquema !== 'dao-tale-eval-literaria-v1' || conjunto.provisoria) throw new Error('Use um eval final não provisório.');
if (conjunto.ambiente.temperatura_traducao == null) throw new Error('Snapshot sem temperatura de tradução; regenere-o.');
const { sha256: hashAmbiente, ...ambienteBase } = conjunto.ambiente;
if (crypto.createHash('sha256').update(JSON.stringify(ambienteBase)).digest('hex') !== hashAmbiente) throw new Error('Ambiente adulterado.');

const capitulos = new Set(conjunto.casos.filter((c: any) => c.particao === particao).map((c: any) => String(c.capitulo)));
const gama = conjunto.ambiente.gama as EntradaGlossario[];
const provedorId = provedorTexto as ProvedorId;
const provedor = obterProvedor(provedorId);
const chave = provedor.precisaChave ? await obterChave(provedorId) : null;
if (provedor.precisaChave && !chave) throw new Error(`Nenhuma chave configurada para ${provedor.nome}.`);
let traducoes: { capitulo: number; ordem: number; texto_pt: string | null; bloqueada: boolean; motivo?: string }[] = [];
let erros: { capitulo: number; inicio: number; mensagem: string }[] = [];
const uso = { chamadas: 0, tokens_entrada: 0, tokens_saida: 0, tokens_cache_leitura: 0, tokens_cache_criacao: 0 };
const documento = () => ({
  esquema: 'dao-tale-candidatas-eval-traducao-v1', eval_sha256: crypto.createHash('sha256').update(evalSerializado).digest('hex'),
  ambiente_sha256: hashAmbiente, particao, provedor: provedorId, modelo, completo: erros.length === 0,
  gerado_em: new Date().toISOString(), uso, erros, traducoes,
});
const salvar = () => fs.writeFileSync(saida, JSON.stringify(documento(), null, 2) + '\n');
if (fs.existsSync(saida)) {
  const anterior = JSON.parse(fs.readFileSync(saida, 'utf8'));
  if (
    anterior.esquema !== 'dao-tale-candidatas-eval-traducao-v1' ||
    anterior.eval_sha256 !== documento().eval_sha256 || anterior.ambiente_sha256 !== hashAmbiente ||
    anterior.particao !== particao || anterior.provedor !== provedorId || anterior.modelo !== modelo
  ) throw new Error('O arquivo de saída existente pertence a outro benchmark; escolha outro caminho.');
  traducoes = anterior.traducoes ?? [];
  erros = anterior.erros ?? [];
  for (const campo of Object.keys(uso) as (keyof typeof uso)[]) uso[campo] = anterior.uso?.[campo] ?? 0;
}

for (const capituloTexto of [...capitulos].sort((a, b) => Number(a) - Number(b))) {
  const capitulo = Number(capituloTexto);
  const frases = conjunto.ambiente.contexto_capitulos[capituloTexto] as { ordem: number; texto_zh: string }[];
  const produzidas = new Map<number, string>(traducoes
    .filter((t) => t.capitulo === capitulo && t.texto_pt)
    .map((t) => [t.ordem, t.texto_pt!]));
  const termosAdotados = new Map<string, string>();
  for (let inicio = 0; inicio < frases.length; inicio += 12) {
    const bloco = frases.slice(inicio, inicio + 12);
    if (bloco.every((f) => produzidas.has(f.ordem))) continue;
    // Um bloco anteriormente ausente/falho é substituído pela nova tentativa,
    // não duplicado. Erros somem somente se a chamada nova tiver sucesso.
    const ordensBloco = new Set(bloco.map((f) => f.ordem));
    traducoes = traducoes.filter((t) => t.capitulo !== capitulo || !ordensBloco.has(t.ordem));
    const cauda = frases.slice(Math.max(0, inicio - 3), inicio).flatMap((f) => {
      const texto_pt = produzidas.get(f.ordem); return texto_pt ? [{ texto_zh: f.texto_zh, texto_pt }] : [];
    });
    const proximas = frases.slice(inicio + bloco.length, inicio + bloco.length + 3).map((f) => f.texto_zh);
    const filtrado = incluirPrincipais(filtrarGlossarioRelevante(gama, [...bloco.map((f) => f.texto_zh), ...cauda.map((f) => f.texto_zh), ...proximas]), gama);
    try {
      const resposta = await provedor.traduzirBloco(chave, {
        modelo, temperatura: conjunto.ambiente.temperatura_traducao,
        thinking: conjunto.ambiente.thinking_traducao ?? undefined,
        omega: conjunto.ambiente.omega, glossario: filtrado, glossarioNoUsuario: true,
        termosAdotados: [...termosAdotados].map(([termo_zh, termo_pt]) => ({ termo_zh, termo_pt })),
        caudaAnterior: cauda, frases: bloco, proximas,
      });
      uso.chamadas += 1;
      for (const campo of ['tokens_entrada', 'tokens_saida', 'tokens_cache_leitura', 'tokens_cache_criacao'] as const) uso[campo] += resposta.uso[campo] ?? 0;
      for (const termo of resposta.termos_novos) if (!termosAdotados.has(termo.termo_zh)) termosAdotados.set(termo.termo_zh, termo.termo_pt);
      const porOrdem = new Map(resposta.traducoes.map((t) => [t.ordem, t.texto_pt.trim()]));
      for (const frase of bloco) {
        const texto = porOrdem.get(frase.ordem) || null;
        if (texto) produzidas.set(frase.ordem, texto);
        traducoes.push({ capitulo, ordem: frase.ordem, texto_pt: texto, bloqueada: !texto, motivo: texto ? undefined : 'resposta-ausente' });
      }
      erros = erros.filter((e) => e.capitulo !== capitulo || e.inicio !== bloco[0].ordem);
    } catch (e) {
      erros.push({ capitulo, inicio: bloco[0].ordem, mensagem: (e as Error).message });
      for (const frase of bloco) traducoes.push({ capitulo, ordem: frase.ordem, texto_pt: null, bloqueada: true, motivo: 'falha-da-chamada' });
    }
    salvar();
  }
}
salvar();
console.log(JSON.stringify({ saida, capitulos: [...capitulos], traducoes: traducoes.length, completo: documento().completo, uso, erros: erros.length }));
