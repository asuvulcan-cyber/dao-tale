import {
  ESCOPO_PADRAO,
  filtrarPorEscopo,
  remontarParagrafos,
  STATUS_CAPITULO,
  type EscopoExportacao,
  type StatusCapitulo,
} from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposCapitulos, reposFrases, reposObras } from '../db/repos.js';
import type { CapituloEpub, ObraEpub } from './epub.js';

// Leitura dos parâmetros de escopo da rota e coleta do conteúdo no banco. O
// filtro em si (filtrarPorEscopo) vive em shared/src/livro.ts, porque a interface
// usa a MESMA regra para contar o que vai entrar no arquivo (doc 12 §5).

function lerNumeros(bruto: string): number[] | { erro: string } {
  const partes = bruto
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const numeros: number[] = [];
  for (const p of partes) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0) return { erro: `Número de capítulo inválido: "${p}".` };
    numeros.push(n);
  }
  return numeros;
}

/** Interpreta os parâmetros de consulta da rota. */
export function lerEscopo(consulta: Record<string, string | undefined>): EscopoExportacao | { erro: string } {
  const escopo: EscopoExportacao = { ...ESCOPO_PADRAO };

  if (consulta.status) {
    const pedidos = consulta.status
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const invalido = pedidos.find((s) => !(STATUS_CAPITULO as readonly string[]).includes(s));
    if (invalido) return { erro: `Status desconhecido: "${invalido}".` };
    if (pedidos.length === 0) return { erro: 'Informe ao menos um status.' };
    escopo.status = pedidos as StatusCapitulo[];
  }

  for (const chave of ['de', 'ate'] as const) {
    const bruto = consulta[chave];
    if (bruto === undefined || bruto === '') continue;
    const n = Number(bruto);
    if (!Number.isInteger(n) || n < 0) return { erro: `Parâmetro "${chave}" deve ser um número de capítulo.` };
    escopo[chave] = n;
  }
  if (escopo.de !== undefined && escopo.ate !== undefined && escopo.de > escopo.ate) {
    return { erro: 'O intervalo está invertido: "de" é maior que "ate".' };
  }

  if (consulta.numeros) {
    const numeros = lerNumeros(consulta.numeros);
    if ('erro' in numeros) return numeros;
    if (numeros.length === 0) return { erro: 'A lista de números está vazia.' };
    escopo.numeros = numeros;
  }

  return escopo;
}

export interface ConteudoExportacao {
  obra: ObraEpub;
  capitulos: CapituloEpub[];
  capa?: { dados: Buffer; mime: string };
  /** Total de capítulos da obra, para a mensagem de escopo vazio. */
  total: number;
}

export type ResultadoColeta = ConteudoExportacao | { erro: string; codigo: 'nao-encontrado' | 'escopo-vazio' };

/** Junta obra, capa e capítulos com os parágrafos remontados. Só leitura. */
export function coletarConteudo(db: BancoDados, obraId: number, escopo: EscopoExportacao): ResultadoColeta {
  const obra = reposObras.obter(db, obraId);
  if (!obra) return { erro: 'Obra não encontrada.', codigo: 'nao-encontrado' };

  const todos = reposCapitulos.listar(db, obraId);
  const selecionados = filtrarPorEscopo(todos, escopo);
  if (selecionados.length === 0) {
    // A mensagem diz qual filtro descartou tudo — o engano comum é pedir uma
    // faixa que não existe, ou "traduzido" numa obra já toda "finalizado".
    const filtros = [`status: ${escopo.status.join(', ')}`];
    if (escopo.numeros) filtros.push(`números: ${escopo.numeros.join(', ')}`);
    else if (escopo.de !== undefined || escopo.ate !== undefined) {
      filtros.push(`intervalo: ${escopo.de ?? 'início'} a ${escopo.ate ?? 'fim'}`);
    }
    const detalhe =
      todos.length === 0
        ? 'a obra ainda não tem capítulos.'
        : `nenhum dos ${todos.length} capítulos da obra bate com o filtro (${filtros.join('; ')}).`;
    return { erro: `Nada a exportar: ${detalhe}`, codigo: 'escopo-vazio' };
  }

  const capa = reposObras.obterCapa(db, obraId);
  return {
    obra: {
      id: obra.id,
      titulo: obra.titulo,
      titulo_original: obra.titulo_original,
      autor: obra.autor,
      sinopse: obra.sinopse,
      tags: obra.tags,
    },
    capitulos: selecionados.map((c) => ({
      numero: c.numero,
      titulo: c.titulo,
      titulo_pt: c.titulo_pt,
      paragrafos: remontarParagrafos(reposFrases.listarPorCapitulo(db, c.id)),
    })),
    capa: capa ? { dados: capa.capa, mime: capa.mime } : undefined,
    total: todos.length,
  };
}

/** Nome do arquivo: slug do título + intervalo realmente incluído (doc 12 §5). */
export function nomeArquivo(obra: ObraEpub, capitulos: CapituloEpub[], extensao: string): string {
  const slug =
    obra.titulo
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 60) || 'obra';
  const primeiro = capitulos[0]!.numero;
  const ultimo = capitulos[capitulos.length - 1]!.numero;
  const faixa = primeiro === ultimo ? `${primeiro}` : `${primeiro}-${ultimo}`;
  return `${slug}-${faixa}.${extensao}`;
}
