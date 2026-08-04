import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Geração do PDF de verdade: dirige um navegador headless pelo DevTools
// Protocol e devolve o arquivo pronto.
//
// Sem dependência nova: o Node 22+ traz WebSocket embutido, que é tudo o que o
// CDP precisa. Puppeteer faria o mesmo trazendo uma árvore de dependências e um
// download de Chromium — para três mensagens de protocolo, não compensa.
//
// O ponto que torna isto confiável é o sinal de prontidão que o próprio HTML
// emite (`data-pronto` no aviso, posto pelo gancho `after` do Paged.js). Sem ele
// a única alternativa seria `--print-to-pdf` com `--virtual-time-budget`, que
// imprime ANTES de a paginação terminar: nos testes saía um PDF de 2 páginas em
// branco no lugar de 17. Aqui a impressão só acontece depois que a página avisa
// que terminou.
//
// Quando não há navegador na máquina, `gerarPdf` falha com `SemNavegador` e a
// rota oferece o caminho do HTML — o aplicativo não fica sem exportação.

const CANDIDATOS = [
  process.env.DAO_TALE_NAVEGADOR,
  'chromium',
  'chromium-browser',
  'google-chrome-stable',
  'google-chrome',
  'brave-browser',
  'brave',
  'microsoft-edge',
].filter((c): c is string => !!c);

export class SemNavegador extends Error {
  constructor() {
    super(
      'Nenhum navegador baseado em Chromium foi encontrado para gerar o PDF. ' +
        'Instale o Chromium (ou Chrome/Brave/Edge), ou defina DAO_TALE_NAVEGADOR com o caminho do executável.',
    );
    this.name = 'SemNavegador';
  }
}

/** Primeiro executável de navegador que existe no PATH (ou o de DAO_TALE_NAVEGADOR). */
export function acharNavegador(): string | null {
  for (const nome of CANDIDATOS) {
    if (nome.includes('/')) {
      if (fs.existsSync(nome)) return nome;
      continue;
    }
    for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
      if (!dir) continue;
      const caminho = path.join(dir, nome);
      try {
        fs.accessSync(caminho, fs.constants.X_OK);
        return caminho;
      } catch {
        /* próximo */
      }
    }
  }
  return null;
}

interface Cdp {
  /** `sessionId` vai como campo IRMÃO de `method` (modo flatten do CDP), nunca
   *  dentro de `params` — ali ele é ignorado, o comando cai na sessão do
   *  NAVEGADOR e volta "'Page.enable' wasn't found". */
  enviar(metodo: string, params?: Record<string, unknown>, sessionId?: string): Promise<Record<string, unknown>>;
  fechar(): void;
}

/** Cliente CDP mínimo: só o par requisição/resposta por id. */
async function conectar(url: string): Promise<Cdp> {
  const ws = new WebSocket(url);
  const pendentes = new Map<number, { ok: (v: Record<string, unknown>) => void; erro: (e: Error) => void }>();
  let proximoId = 1;

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('Falha ao conectar no navegador.')), { once: true });
  });

  ws.addEventListener('message', (evento) => {
    const msg = JSON.parse(String(evento.data)) as { id?: number; result?: Record<string, unknown>; error?: { message: string } };
    if (msg.id === undefined) return; // evento do protocolo; não usamos nenhum
    const p = pendentes.get(msg.id);
    if (!p) return;
    pendentes.delete(msg.id);
    if (msg.error) p.erro(new Error(msg.error.message));
    else p.ok(msg.result ?? {});
  });

  return {
    enviar(metodo, params = {}, sessionId) {
      const id = proximoId++;
      return new Promise((ok, erro) => {
        pendentes.set(id, { ok, erro });
        ws.send(JSON.stringify({ id, method: metodo, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    fechar() {
      ws.close();
    },
  };
}

async function esperarEndpoint(processo: ChildProcess, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let saida = '';
    const relogio = setTimeout(() => reject(new Error('O navegador não abriu a porta de depuração a tempo.')), timeoutMs);
    const ler = (pedaco: Buffer) => {
      saida += pedaco.toString();
      const m = saida.match(/ws:\/\/[^\s]+/);
      if (m) {
        clearTimeout(relogio);
        processo.stderr?.off('data', ler);
        resolve(m[0]);
      }
    };
    processo.stderr?.on('data', ler);
    processo.once('exit', (codigo) => {
      clearTimeout(relogio);
      reject(new Error(`O navegador encerrou antes de abrir (código ${codigo}).`));
    });
  });
}

export interface OpcoesPdf {
  /** Teto total; a paginação de uma obra longa é a parte demorada. */
  timeoutMs?: number;
  /** Fundo da identidade (papel "Tinta & Jade"). Desligado = páginas brancas. */
  fundo?: boolean;
}

/**
 * Renderiza o HTML paginado e devolve o PDF.
 *
 * Espera o `data-pronto` que o HTML emite ao terminar a paginação, e SÓ ENTÃO
 * imprime — é o que separa um livro completo de um PDF truncado.
 */
export async function gerarPdf(html: string, opcoes: OpcoesPdf = {}): Promise<Buffer> {
  const executavel = acharNavegador();
  if (!executavel) throw new SemNavegador();

  const timeoutMs = opcoes.timeoutMs ?? 5 * 60 * 1000;
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'dao-tale-pdf-'));
  const arquivo = path.join(pasta, 'livro.html');
  fs.writeFileSync(arquivo, html, 'utf-8');

  let processo: ChildProcess | undefined;
  let cdp: Cdp | undefined;
  try {
    processo = spawn(
      executavel,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--remote-debugging-port=0',
        `--user-data-dir=${path.join(pasta, 'perfil')}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );

    const endpoint = await esperarEndpoint(processo, 30_000);
    cdp = await conectar(endpoint);

    // Aba própria: a janela inicial do --headless=new nem sempre aceita comandos.
    const alvo = (await cdp.enviar('Target.createTarget', { url: 'about:blank' })) as { targetId: string };
    const sessao = (await cdp.enviar('Target.attachToTarget', { targetId: alvo.targetId, flatten: true })) as {
      sessionId: string;
    };
    const naSessao = (metodo: string, params: Record<string, unknown> = {}) =>
      cdp!.enviar(metodo, params, sessao.sessionId);

    await naSessao('Page.enable');
    await naSessao('Runtime.enable');
    await naSessao('Page.navigate', { url: `file://${arquivo}` });

    // Espera ativa pelo sinal da própria página. `document.readyState` não serve:
    // o Paged.js só COMEÇA depois do load.
    const limite = Date.now() + timeoutMs;
    for (;;) {
      const r = (await naSessao('Runtime.evaluate', {
        expression: `document.querySelector('[data-pronto="1"]') ? document.querySelectorAll('.pagedjs_page').length : 0`,
        returnByValue: true,
      })) as { result?: { value?: number } };
      const paginas = r.result?.value ?? 0;
      if (paginas > 0) break;
      if (Date.now() > limite) throw new Error('A paginação do livro não terminou dentro do tempo limite.');
      await new Promise((r2) => setTimeout(r2, 250));
    }

    const pdf = (await naSessao('Page.printToPDF', {
      // O tamanho vem do @page (A5) do próprio documento; margens vão zeradas
      // porque quem as aplica é o Paged.js, dentro da caixa de página.
      preferCSSPageSize: true,
      printBackground: opcoes.fundo ?? false,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
    })) as { data: string };

    return Buffer.from(pdf.data, 'base64');
  } finally {
    cdp?.fechar();
    processo?.kill('SIGTERM');
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}
