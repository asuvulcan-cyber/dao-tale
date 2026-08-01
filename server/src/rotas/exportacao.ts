import { Hono, type Context } from 'hono';
import type { BancoDados } from '../db/index.js';
import { coletarConteudo, lerEscopo, nomeArquivo, type ConteudoExportacao } from '../exportacao/escopo.js';
import { montarEpub } from '../exportacao/epub.js';
import { montarMarkdown } from '../exportacao/markdown.js';

// Exportação da obra inteira como livro (doc 12 §5). Duas rotas GET, só leitura,
// sem nenhuma chamada de IA: leem frases já traduzidas e montam o arquivo.

export function rotasExportacao(db: BancoDados): Hono {
  const app = new Hono();

  /** Escopo + conteúdo, ou a resposta de erro já pronta. */
  function preparar(c: Context): { ok: true; conteudo: ConteudoExportacao } | { ok: false; resposta: Response } {
    const escopo = lerEscopo(c.req.query());
    if ('erro' in escopo) {
      return {
        ok: false,
        resposta: c.json({ erro: { codigo: 'escopo-invalido', mensagem: escopo.erro } }, 400),
      };
    }
    const conteudo = coletarConteudo(db, Number(c.req.param('id')), escopo);
    if ('erro' in conteudo) {
      return {
        ok: false,
        resposta: c.json(
          { erro: { codigo: conteudo.codigo, mensagem: conteudo.erro } },
          conteudo.codigo === 'nao-encontrado' ? 404 : 400,
        ),
      };
    }
    return { ok: true, conteudo };
  }

  app.get('/obras/:id/epub', (c) => {
    const pronto = preparar(c);
    if (!pronto.ok) return pronto.resposta;
    const { conteudo } = pronto;

    const epub = montarEpub(conteudo);
    const nome = nomeArquivo(conteudo.obra, conteudo.capitulos, 'epub');
    return c.body(new Uint8Array(epub), 200, {
      'Content-Type': 'application/epub+zip',
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Content-Length': String(epub.length),
    });
  });

  app.get('/obras/:id/markdown', (c) => {
    const pronto = preparar(c);
    if (!pronto.ok) return pronto.resposta;
    const { conteudo } = pronto;

    const formato = c.req.query('formato') === 'bilingue' ? 'bilingue' : 'pt';
    const md = montarMarkdown(conteudo.obra, conteudo.capitulos, formato);
    const nome = nomeArquivo(
      conteudo.obra,
      conteudo.capitulos,
      formato === 'bilingue' ? 'bilingue.md' : 'md',
    );
    return c.body(md, 200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nome}"`,
    });
  });

  return app;
}
