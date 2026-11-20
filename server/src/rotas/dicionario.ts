import { Hono } from 'hono';
import type { DicionarioDaFrase, EstadoDicionario, Verbete } from '@dao-tale/shared';
import type { BancoDados } from '../db/index.js';
import { reposCapitulos, reposFrases, reposGlossario, reposObras } from '../db/repos.js';
import { dicionarioAtual } from '../dicionario/banco.js';

// Dicionário local (doc 30), sem IA: consulta de palavra e as palavras de uma
// frase com o que o DCP e o CC-CEDICT dizem delas. Serve às gavetas do tutor e
// da revisão e à skill `revisar-capitulo`.

const SEM_DICIONARIO: EstadoDicionario = { instalado: false, fontes: [] };

const erro = (codigo: string, mensagem: string) => ({ erro: { codigo, mensagem } });

export function rotasDicionario(db: BancoDados): Hono {
  const app = new Hono();

  app.get('/dicionario', (c) => c.json(dicionarioAtual()?.estado() ?? SEM_DICIONARIO));

  app.get('/dicionario/busca', (c) => {
    const termo = (c.req.query('termo') ?? '').trim();
    if (!termo || [...termo].length > 20) {
      return c.json(erro('payload-invalido', 'Informe uma palavra (até 20 caracteres).'), 400);
    }
    const d = dicionarioAtual();
    const resposta: EstadoDicionario & { termo: string; verbetes: Verbete[] } = d
      ? { ...d.estado(), termo, verbetes: d.buscar(termo) }
      : { ...SEM_DICIONARIO, termo, verbetes: [] };
    return c.json(resposta);
  });

  app.get('/frases/:id/dicionario', (c) => {
    const frase = reposFrases.obter(db, Number(c.req.param('id')));
    if (!frase) return c.json(erro('nao-encontrado', 'Frase não encontrada.'), 404);
    const capitulo = reposCapitulos.obter(db, frase.capitulo_id)!;
    const obra = reposObras.obter(db, capitulo.obra_id)!;
    const d = dicionarioAtual();
    // Só há fontes de mandarim; numa obra em inglês a lista vem vazia.
    const resposta: DicionarioDaFrase =
      d && obra.idioma_origem === 'zh'
        ? { ...d.estado(), palavras: d.palavrasDaFrase(frase.texto_zh, reposGlossario.listar(db, obra.id)) }
        : { ...(d?.estado() ?? SEM_DICIONARIO), palavras: [] };
    return c.json(resposta);
  });

  return app;
}
