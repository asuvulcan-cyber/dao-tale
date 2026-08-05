import { Hono } from 'hono';
import type { BancoDados } from '../db/index.js';
import { reposPublico } from '../db/publico.js';

// Vitrine pública (doc 14): as ÚNICAS rotas que respondem sem sessão, fora do
// próprio login. Registradas antes de `exigirSessao` em `app.ts`, o que faz
// desta a superfície exposta à internet inteira — e por isso ela é curta,
// somente-leitura e sem parâmetro que escolha o que ler além de "qual obra" e
// "qual capítulo".
//
// O que NÃO existe aqui, e não deve passar a existir sem uma boa razão:
// glossário, prompts, telemetria, custos, exportação/download, banco de testes,
// termos sugeridos, texto de origem em chinês, qualquer POST/PUT/DELETE.
//
// Sobre 404 em vez de 403: uma obra privada responde igual a uma obra que não
// existe. Distinguir as duas contaria ao visitante que ela está ali.

function idValido(bruto: string | undefined): number | null {
  const n = Number(bruto);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const NAO_ENCONTRADO = { erro: { codigo: 'nao-encontrado', mensagem: 'Não encontrado.' } } as const;

export function rotasPublicas(db: BancoDados): Hono {
  const app = new Hono();

  app.get('/publico/obras', (c) => c.json(reposPublico.obras(db)));

  app.get('/publico/obras/:id', (c) => {
    const id = idValido(c.req.param('id'));
    const obra = id === null ? undefined : reposPublico.obra(db, id);
    return obra ? c.json(obra) : c.json(NAO_ENCONTRADO, 404);
  });

  app.get('/publico/obras/:id/capa', (c) => {
    const id = idValido(c.req.param('id'));
    const capa = id === null ? undefined : reposPublico.capa(db, id);
    if (!capa) return c.json(NAO_ENCONTRADO, 404);
    return c.body(new Uint8Array(capa.capa), 200, { 'Content-Type': capa.mime, 'Cache-Control': 'no-cache' });
  });

  app.get('/publico/obras/:id/capitulos', (c) => {
    const id = idValido(c.req.param('id'));
    // A obra precisa passar pela mesma porta: sem isto, o sumário de uma obra
    // privada sairia (a consulta de capítulos filtra por publica, mas devolver
    // [] e devolver 404 dizem coisas diferentes sobre a obra existir).
    if (id === null || !reposPublico.obra(db, id)) return c.json(NAO_ENCONTRADO, 404);
    return c.json(reposPublico.capitulos(db, id));
  });

  app.get('/publico/obras/:id/capitulos/:numero', (c) => {
    const id = idValido(c.req.param('id'));
    const numero = Number(c.req.param('numero'));
    if (id === null || !Number.isInteger(numero)) return c.json(NAO_ENCONTRADO, 404);
    const capitulo = reposPublico.capitulo(db, id, numero);
    return capitulo ? c.json(capitulo) : c.json(NAO_ENCONTRADO, 404);
  });

  return app;
}
