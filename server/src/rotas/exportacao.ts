import { Hono, type Context } from 'hono';
import type { BancoDados } from '../db/index.js';
import { coletarConteudo, lerEscopo, nomeArquivo, type ConteudoExportacao } from '../exportacao/escopo.js';
import { montarEpub } from '../exportacao/epub.js';
import { montarHtmlImpressao } from '../exportacao/pdf.js';
import { gerarPdf, SemNavegador } from '../exportacao/pdfNavegador.js';
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
    const md = montarMarkdown(conteudo.obra, conteudo.capitulos, formato, conteudo.glossario);
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

  // Livro para PDF: HTML único e paginado (Paged.js embutido). O navegador
  // imprime — ver a justificativa em exportacao/pdf.ts.
  app.get('/obras/:id/livro-html', (c) => {
    const pronto = preparar(c);
    if (!pronto.ok) return pronto.resposta;
    const { conteudo } = pronto;

    const html = montarHtmlImpressao(conteudo);
    const nome = nomeArquivo(conteudo.obra, conteudo.capitulos, 'html');
    // `inline`: abre numa aba e o usuário imprime dali. Baixar um HTML e ter de
    // achá-lo no disco para depois abrir seria um passo a mais sem ganho.
    return c.body(html, 200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="${nome}"`,
    });
  });

  // PDF pronto: o servidor renderiza o HTML paginado num navegador headless e
  // devolve o arquivo. Precisa de um Chromium na máquina — sem ele, a rota diz
  // como usar o caminho do HTML, que não depende de nada.
  app.get('/obras/:id/pdf', async (c) => {
    const pronto = preparar(c);
    if (!pronto.ok) return pronto.resposta;
    const { conteudo } = pronto;

    try {
      const pdf = await gerarPdf(montarHtmlImpressao(conteudo), { fundo: c.req.query('fundo') === '1' });
      const nome = nomeArquivo(conteudo.obra, conteudo.capitulos, 'pdf');
      return c.body(new Uint8Array(pdf), 200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nome}"`,
        'Content-Length': String(pdf.length),
      });
    } catch (e) {
      if (e instanceof SemNavegador) {
        return c.json({ erro: { codigo: 'sem-navegador', mensagem: e.message } }, 503);
      }
      return c.json({ erro: { codigo: 'pdf', mensagem: `Falha ao gerar o PDF: ${(e as Error).message}` } }, 500);
    }
  });

  return app;
}
