# Catálogo de erros zh→pt-BR — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um catálogo de erros de tradução zh→pt-BR que vale para qualquer obra, detectado por regra bilíngue determinística, consertável pelo passe de estilo que já existe, e governado por um piso de precisão medida que impede a lista de crescer por intuição.

**Architecture:** O catálogo é **dado** em `shared/` (uma entrada por erro, cada uma com um registro obrigatório de aferição). Um detector puro em `server/src/traducao/catalogoZhPt.ts`, modelado em `varrerConsistencia`, acusa quando o **chinês** tem o gatilho **e** o português tem o reflexo. Os achados entram na lista que `GET /capitulos/:id/estilo` já devolve, com `regra = id da entrada` — então a dispensa por trinca e a tela já existentes funcionam sem mudança. O passe de estilo ganha `texto_zh` e uma `orientacao` por violação, porque consertar `一直 → sempre` sem ver o original é adivinhar.

**Tech Stack:** TypeScript ESM (imports relativos sempre com `.js`), npm workspaces (`shared`, `server`, `web`), Hono, Zod, vitest, better-sqlite3, React + react-query, Tailwind com tokens do projeto.

## Global Constraints

- **Nada de migração, nada de tela nova, nada de rota nova.** A tabela `estilo_ignorado` já é genérica por regra e a lista de estilo já existe.
- **Nenhum texto de prompt de tradução muda.** Não se corta versão nova de Alfa/Beta/Delta. A investigação de 2026-08-05 mediu marcador chinês no prompt como sem efeito; o `certo` de cada entrada é entregue **no ponto do uso**, dentro do passe.
- **Nenhuma entrada em `CATALOGO` sem `aferido`**, e o `aferido` tem de ter `precisao ≥ 0.5` **e** `acusadas ≥ 3`. Isto é teste, não convenção.
- **`evitar_pt` nunca leva a flag `g`.** `RegExp` global carrega `lastIndex` entre chamadas e o mesmo objeto é reusado por todas as frases: com `g`, a segunda frase começaria a busca no meio. Só `i` é permitida.
- **Não se altera `analisarEstilo`, `varrerConsistencia`, o filtro de termos curtos nem a heurística de flexão.** O detector novo é um vizinho, não uma alteração.
- **`server/src/traducao/estiloViolacoes.ts` e `shared/src/preferenciasEstilo.ts` têm alterações não commitadas do usuário.** Não as inclua em commit nenhum. Nunca use `git add -A` nem `git add .` — sempre liste os arquivos.
- Testes de código de `shared/` moram em `server/src/db/*.test.ts` (padrão existente: `camadaDoRotulo.test.ts`, `preferenciasEstilo.test.ts`).
- Comentários e mensagens de commit em português, no tom do código existente: explicam **por que**, não o que.

---

### Task 1: O catálogo como dado, com o piso que o governa

**Files:**
- Create: `shared/src/catalogoErros.ts`
- Modify: `shared/src/index.ts` (uma linha de reexport)
- Test: `server/src/db/catalogoErros.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `EntradaCatalogo`, `AfericaoCatalogo`, `CATALOGO`, `REPROVADAS`, `precisaoAferida(a)`, `PRECISAO_MINIMA`, `AMOSTRA_MINIMA` — todos exportados por `@dao-tale/shared`.

- [ ] **Step 1: Escreva o teste-guarda que falha**

Crie `server/src/db/catalogoErros.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  AMOSTRA_MINIMA,
  CATALOGO,
  PRECISAO_MINIMA,
  REPROVADAS,
  precisaoAferida,
} from '@dao-tale/shared';

// Este arquivo é a razão de o catálogo existir como dado e não como texto de
// prompt: ele impede a lista de crescer por intuição. A tabela das nove
// partículas do prompt completo nunca passou por aqui, e a medição mostrou que
// 80 dos 85 alarmes dela eram falsos.
describe('catálogo de erros zh→pt-BR', () => {
  it('toda entrada carrega aferição acima do piso', () => {
    for (const e of CATALOGO) {
      expect(e.aferido, `${e.id} sem aferição`).toBeTruthy();
      expect(e.aferido.acusadas, `${e.id}: amostra pequena demais`).toBeGreaterThanOrEqual(AMOSTRA_MINIMA);
      expect(precisaoAferida(e.aferido), `${e.id}: precisão abaixo do piso`).toBeGreaterThanOrEqual(PRECISAO_MINIMA);
    }
  });

  it('nenhuma entrada reprovada aparece no catálogo', () => {
    const ids = new Set(CATALOGO.map((e) => e.id));
    for (const r of REPROVADAS) expect(ids.has(r.id), `${r.id} reprovada mas listada`).toBe(false);
  });

  it('as reprovadas guardam a medição que as reprovou', () => {
    expect(REPROVADAS.length).toBeGreaterThan(0);
    for (const r of REPROVADAS) {
      expect(r.motivo, `${r.id} sem motivo`).toBeTruthy();
      const abaixo =
        precisaoAferida(r.aferido) < PRECISAO_MINIMA || r.aferido.acusadas < AMOSTRA_MINIMA;
      expect(abaixo, `${r.id} está em REPROVADAS mas passaria no piso`).toBe(true);
    }
  });

  it('ids são únicos e em kebab-case', () => {
    const todos = [...CATALOGO, ...REPROVADAS].map((e) => e.id);
    expect(new Set(todos).size).toBe(todos.length);
    for (const id of todos) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('evitar_pt nunca é global — lastIndex sobreviveria entre frases', () => {
    for (const e of [...CATALOGO, ...REPROVADAS]) {
      expect(e.evitar_pt.global, `${e.id} usa a flag g`).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -w server -- catalogoErros`
Expected: FAIL — `Failed to resolve import` / `CATALOGO is not exported`.

- [ ] **Step 3: Escreva o catálogo**

Crie `shared/src/catalogoErros.ts`:

```ts
// Catálogo de erros comuns de tradução zh→pt-BR — vale para qualquer obra, ao
// contrário do glossário (que é por obra) e das preferências de estilo (que são
// escolha do revisor). Ver docs/superpowers/specs/2026-08-10-catalogo-erros-zh-pt-design.md.
//
// A REGRA QUE GOVERNA ESTA LISTA: uma entrada só existe com número medido. O
// número é a precisão no corpus real — frases que o detector acusaria no texto
// que a IA produziu e que DEIXARAM de ser acusadas no texto final, ou seja,
// casos em que o revisor, sem ser avisado por ninguém, corrigiu exatamente
// aquilo. É conservador na direção certa: subestima (o revisor pode ter deixado
// passar), nunca superestima.
//
// A tabela de nove partículas do prompt completo foi medida assim em 2026-08-10
// contra a obra 1 (561 frases traduzidas) e reprovou inteira menos uma linha:
// das 85 frases que ela acusaria, o revisor tinha mudado 5. As reprovadas ficam
// em REPROVADAS, com a medição ao lado — apagá-las faria alguém repropor
// `都 → todos` de boa-fé em três meses e refazer a medição do zero.

/** O que sustenta uma entrada. Sem isto ela não pode estar em CATALOGO. */
export interface AfericaoCatalogo {
  obra_id: number;
  /** Frases acusadas no `texto_pt_original_ia`. */
  acusadas: number;
  /** Dessas, quantas o revisor já tinha consertado por conta própria. */
  corrigidas: number;
  /** ISO curto (YYYY-MM-DD) de quando a aferição rodou. */
  em: string;
}

export interface EntradaCatalogo {
  /** kebab-case estável. Vira o `regra` da violação — e a trinca de dispensa
   *  guardada no banco depende dele, então renomear um id é migração. */
  id: string;
  /** Rótulo curto para a tela. */
  titulo: string;
  /** O gatilho no ORIGINAL. A regra só dispara quando ele está no chinês — é o
   *  que separa este detector de `analisarEstilo`, que nunca vê o zh. */
  gatilho_zh: string;
  /** O reflexo errado no português. NUNCA com a flag `g`: o mesmo objeto é
   *  reusado em todas as frases e `lastIndex` sobreviveria entre elas. */
  evitar_pt: RegExp;
  /** O que é certo, em uma frase. Entregue no ponto do uso (dentro do passe de
   *  estilo), não no prompt de tradução. */
  certo: string;
  aferido: AfericaoCatalogo;
}

/** Piso de precisão. Abaixo disto o revisor aprende a ignorar a lista, que é o
 *  mesmo modo de falha da varredura de consistência com falso positivo. */
export const PRECISAO_MINIMA = 0.5;

/** Piso de amostra. Sem ele, uma única ocorrência corrigida entra com 100% de
 *  "precisão" e o critério deixa de ser critério. */
export const AMOSTRA_MINIMA = 3;

export const precisaoAferida = (a: AfericaoCatalogo): number =>
  a.acusadas === 0 ? 0 : a.corrigidas / a.acusadas;

export const CATALOGO: readonly EntradaCatalogo[] = [
  {
    id: 'particula-yizhi',
    titulo: '一直 traduzido como "sempre"',
    gatilho_zh: '一直',
    evitar_pt: /\bsempre\b/i,
    certo:
      '一直 é continuidade ininterrupta até aquele momento — "até então", "vinha …ndo", ' +
      '"esse tempo todo". "Sempre" é a glosa de 总, que é impressão abstrata e atemporal; ' +
      'confundir os dois foi o que produziu vereditos opostos para a mesma frase (casos #23/#24).',
    aferido: { obra_id: 1, acusadas: 4, corrigidas: 3, em: '2026-08-10' },
  },
];

/** Medidas e reprovadas. Ficam aqui para ninguém repropor de boa-fé. */
export const REPROVADAS: readonly (EntradaCatalogo & { motivo: string })[] = [
  {
    id: 'particula-hai',
    titulo: '还 traduzido como "ainda"',
    gatilho_zh: '还',
    evitar_pt: /\bainda\b/i,
    certo: '还 pode ser indignação ("ainda por cima") ou comparativo, não só continuidade.',
    aferido: { obra_id: 1, acusadas: 34, corrigidas: 1, em: '2026-08-10' },
    motivo: 'O maior emissor de alarme da tabela e o menos útil: "ainda" é a tradução certa quase sempre.',
  },
  {
    id: 'particula-dou',
    titulo: '都 traduzido como "todos"',
    gatilho_zh: '都',
    evitar_pt: /\btodos\b|\btudo\b/i,
    certo: '都 pode ser intensificador de surpresa ("até", "nem mesmo"), não só totalidade.',
    aferido: { obra_id: 1, acusadas: 31, corrigidas: 0, em: '2026-08-10' },
    motivo: '31 alarmes, zero correções. O revisor não tocou em nenhum.',
  },
  {
    id: 'particula-zong',
    titulo: '总 traduzido como "sempre"',
    gatilho_zh: '总',
    evitar_pt: /\bsempre\b/i,
    certo: '总 é sensação persistente ou inevitabilidade; "sempre" só quando a recorrência é real.',
    aferido: { obra_id: 1, acusadas: 12, corrigidas: 1, em: '2026-08-10' },
    motivo: 'Justamente o par de 一直 — e aqui "sempre" é o acerto, não o erro.',
  },
  {
    id: 'particula-cai',
    titulo: '才 traduzido como "só então"',
    gatilho_zh: '才',
    evitar_pt: /\bs[óo] ent[ãa]o\b/i,
    certo: '才 marca demora, alívio ou condição necessária; "só então" neutro é reflexo.',
    aferido: { obra_id: 1, acusadas: 2, corrigidas: 0, em: '2026-08-10' },
    motivo: 'Zero correções, e amostra abaixo do piso — nem daria para decidir.',
  },
  {
    id: 'particula-you',
    titulo: '又 traduzido como "de novo"',
    gatilho_zh: '又',
    evitar_pt: /\bde novo\b/i,
    certo: '又 pode ser contradição ou concessão (又…又…), não só repetição.',
    aferido: { obra_id: 1, acusadas: 2, corrigidas: 0, em: '2026-08-10' },
    motivo: 'Zero correções, e amostra abaixo do piso.',
  },
];
```

- [ ] **Step 4: Reexporte de `shared/src/index.ts`**

Acrescente a linha junto das outras reexportações (perto de `export * from './temasDoPrompt.js';`, por volta da linha 24):

```ts
export * from './catalogoErros.js';
```

- [ ] **Step 5: Rode e veja passar**

Run: `npm test -w server -- catalogoErros`
Expected: PASS, 5 testes.

- [ ] **Step 6: Commit**

```bash
git add shared/src/catalogoErros.ts shared/src/index.ts server/src/db/catalogoErros.test.ts
git commit -m "O catálogo de erros zh→pt-BR nasce como dado, com o piso que o governa"
```

---

### Task 2: O detector bilíngue

**Files:**
- Create: `server/src/traducao/catalogoZhPt.ts`
- Test: `server/src/traducao/catalogoZhPt.test.ts`

**Interfaces:**
- Consumes: `CATALOGO`, `EntradaCatalogo` de `@dao-tale/shared` (Task 1).
- Produces: `varrerCatalogo(frases, ignoradas?, entradas?) => { violacoes: ViolacaoCatalogo[]; frases_examinadas: number }` e `ViolacaoCatalogo { frase_id, ordem, entrada_id, gatilho_zh, trecho_pt }`.

- [ ] **Step 1: Escreva os testes que falham**

Crie `server/src/traducao/catalogoZhPt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { REPROVADAS, type EntradaCatalogo } from '@dao-tale/shared';
import { varrerCatalogo } from './catalogoZhPt.js';

const frase = (over: Partial<Parameters<typeof varrerCatalogo>[0][number]>) => ({
  id: 1,
  ordem: 0,
  texto_zh: '',
  texto_pt: '',
  status_traducao: 'traduzida',
  ...over,
});

describe('varrerCatalogo', () => {
  it('acusa quando o gatilho está no zh E o reflexo está no pt', () => {
    const r = varrerCatalogo([
      frase({ id: 7, ordem: 3, texto_zh: '他一直在等。', texto_pt: 'Ele sempre esteve esperando.' }),
    ]);
    expect(r.violacoes).toHaveLength(1);
    expect(r.violacoes[0]).toMatchObject({ frase_id: 7, ordem: 3, entrada_id: 'particula-yizhi', gatilho_zh: '一直' });
    expect(r.violacoes[0].trecho_pt).toContain('sempre');
  });

  it('não acusa sem o gatilho no chinês — é o que a torna bilíngue', () => {
    const r = varrerCatalogo([frase({ texto_zh: '他总在等。', texto_pt: 'Ele sempre esteve esperando.' })]);
    expect(r.violacoes).toEqual([]);
  });

  it('não acusa quando o português já está certo', () => {
    const r = varrerCatalogo([frase({ texto_zh: '他一直在等。', texto_pt: 'Ele vinha esperando até então.' })]);
    expect(r.violacoes).toEqual([]);
  });

  it('só examina frase traduzida', () => {
    const r = varrerCatalogo([
      frase({ texto_zh: '他一直在等。', texto_pt: 'Ele sempre esteve esperando.', status_traducao: 'pendente' }),
    ]);
    expect(r.violacoes).toEqual([]);
    expect(r.frases_examinadas).toBe(0);
  });

  it('respeita a dispensa por trinca (frase, regra, trecho)', () => {
    const frases = [frase({ id: 7, texto_zh: '他一直在等。', texto_pt: 'Ele sempre esteve esperando.' })];
    const trecho = varrerCatalogo(frases).violacoes[0].trecho_pt;
    const r = varrerCatalogo(frases, new Set([`7|particula-yizhi|${trecho}`]));
    expect(r.violacoes).toEqual([]);
  });

  it('não usa as reprovadas', () => {
    // 都 → "todos" acusaria 31 vezes na obra real e nenhuma foi correção.
    const r = varrerCatalogo([frase({ texto_zh: '他们都来了。', texto_pt: 'Todos eles vieram.' })]);
    expect(r.violacoes).toEqual([]);
  });

  it('aceita entradas explícitas — é como a aferição mede as reprovadas', () => {
    const dou = REPROVADAS.find((e) => e.id === 'particula-dou') as EntradaCatalogo;
    const r = varrerCatalogo([frase({ texto_zh: '他们都来了。', texto_pt: 'Todos eles vieram.' })], new Set(), [dou]);
    expect(r.violacoes).toHaveLength(1);
    expect(r.violacoes[0].entrada_id).toBe('particula-dou');
  });

  it('o trecho é estável entre duas varreduras do mesmo texto', () => {
    const frases = [frase({ texto_zh: '他一直在等。', texto_pt: 'Ele sempre esteve esperando ali.' })];
    expect(varrerCatalogo(frases).violacoes[0].trecho_pt).toBe(varrerCatalogo(frases).violacoes[0].trecho_pt);
  });

  it('o trecho não atravessa quebra de linha nem passa de 60 caracteres', () => {
    const r = varrerCatalogo([
      frase({ texto_zh: '他一直在等。', texto_pt: `Ele sempre ${'x'.repeat(200)}\noutra linha` }),
    ]);
    const t = r.violacoes[0].trecho_pt;
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t).not.toContain('\n');
  });

  it('uma frase que dispara duas entradas gera duas violações', () => {
    const dou = REPROVADAS.find((e) => e.id === 'particula-dou') as EntradaCatalogo;
    const yizhi = { ...dou, id: 'particula-yizhi', gatilho_zh: '一直', evitar_pt: /\bsempre\b/i };
    const r = varrerCatalogo(
      [frase({ texto_zh: '他们一直都来。', texto_pt: 'Todos eles sempre vêm.' })],
      new Set(),
      [dou, yizhi],
    );
    expect(r.violacoes.map((v) => v.entrada_id).sort()).toEqual(['particula-dou', 'particula-yizhi']);
    // Uma frase, duas violações — mas `frases_examinadas` conta frases.
    expect(r.frases_examinadas).toBe(1);
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -w server -- catalogoZhPt`
Expected: FAIL — `Cannot find module './catalogoZhPt.js'`.

- [ ] **Step 3: Escreva o detector**

Crie `server/src/traducao/catalogoZhPt.ts`:

```ts
import { CATALOGO, type EntradaCatalogo } from '@dao-tale/shared';

// Detector do catálogo de erros zh→pt-BR (spec 2026-08-10). Bilíngue de
// propósito, e é isso que o distingue de `analisarEstilo`: aquele recebe só
// `texto_pt` e não teria como expressar "一直 virou sempre". O molde é
// `varrerConsistencia` — função pura sobre uma lista de frases, com um Set de
// dispensas — e não `analisarEstilo`, pela mesma razão.

export interface ViolacaoCatalogo {
  frase_id: number;
  ordem: number;
  /** É o `regra` da violação quando ela entra na lista de estilo. */
  entrada_id: string;
  gatilho_zh: string;
  /** O trecho do PT que disparou, com o que vem depois — é o que a tela destaca
   *  e o que compõe a trinca de dispensa. */
  trecho_pt: string;
}

/** Contexto à direita do trecho. Mesmo formato do scanner de estilo (que usa
 *  `[^\n]{0,40}`): o trecho tem de ser reconhecível na tela e estável entre duas
 *  varreduras, porque é chave de dispensa gravada no banco. */
const CONTEXTO = 40;

function trechoComContexto(texto: string, inicio: number, comprimento: number): string {
  const bruto = texto.slice(inicio, inicio + comprimento + CONTEXTO);
  const quebra = bruto.indexOf('\n');
  return quebra === -1 ? bruto : bruto.slice(0, quebra);
}

export function varrerCatalogo(
  frases: { id: number; ordem: number; texto_zh: string; texto_pt: string; status_traducao: string }[],
  ignoradas: ReadonlySet<string> = new Set(),
  entradas: readonly EntradaCatalogo[] = CATALOGO,
): { violacoes: ViolacaoCatalogo[]; frases_examinadas: number } {
  const violacoes: ViolacaoCatalogo[] = [];
  let frases_examinadas = 0;

  for (const f of frases) {
    if (f.status_traducao !== 'traduzida') continue;
    const pt = f.texto_pt ?? '';
    if (!pt) continue;
    frases_examinadas++;

    for (const e of entradas) {
      if (!f.texto_zh.includes(e.gatilho_zh)) continue;
      const m = pt.match(e.evitar_pt);
      if (!m || m.index == null) continue;
      // Uma violação por (frase, entrada), como o scanner de aspas: se a mesma
      // frase repetir o reflexo, a segunda aparece na varredura seguinte, depois
      // que a primeira for consertada ou dispensada.
      const trecho_pt = trechoComContexto(pt, m.index, m[0].length);
      if (ignoradas.has(`${f.id}|${e.id}|${trecho_pt}`)) continue;
      violacoes.push({ frase_id: f.id, ordem: f.ordem, entrada_id: e.id, gatilho_zh: e.gatilho_zh, trecho_pt });
    }
  }

  return { violacoes, frases_examinadas };
}
```

- [ ] **Step 4: Rode e veja passar**

Run: `npm test -w server -- catalogoZhPt`
Expected: PASS, 10 testes.

- [ ] **Step 5: Commit**

```bash
git add server/src/traducao/catalogoZhPt.ts server/src/traducao/catalogoZhPt.test.ts
git commit -m "O detector do catálogo é bilíngue — o chinês é quem dispara"
```

---

### Task 3: O chinês e a orientação chegam ao provedor

O passe de estilo hoje manda só o português. Para consertar `一直 → sempre` o modelo precisa do original, senão adivinha; e precisa saber o que é certo, que é onde o texto do catálogo é entregue.

**Files:**
- Modify: `server/src/ia/provedor.ts:252-259` (`RequisicaoPasseEstilo`)
- Modify: `server/src/ia/prompts.ts:463-492` (`sistemaPasseEstiloPartes`, `usuarioPasseEstilo`)
- Test: `server/src/ia/passeEstilo.test.ts` (existente — acrescentar casos)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `RequisicaoPasseEstilo.alvos[].texto_zh: string` e `RequisicaoPasseEstilo.alvos[].violacoes[].orientacao?: string`, consumidos pela rota na Task 4.

- [ ] **Step 1: Escreva os testes que falham**

Acrescente a `server/src/ia/passeEstilo.test.ts` (mantenha o que já está lá; olhe o `reqMock` da linha 69 para o formato do objeto e acrescente `texto_zh` nos alvos que ele já tem):

```ts
import { sistemaPasseEstilo, usuarioPasseEstilo } from './prompts.js';

describe('o passe recebe o original', () => {
  const req = {
    modelo: 'm',
    omega: 'ÔMEGA',
    alvos: [
      {
        ordem: 3,
        texto_zh: '他一直在等。',
        texto_pt: 'Ele sempre esteve esperando.',
        violacoes: [
          { regra: 'particula-yizhi', trecho: 'sempre esteve', orientacao: '一直 é continuidade até então.' },
        ],
      },
    ],
    vizinhas: [],
  };

  it('o chinês do alvo vai na mensagem', () => {
    expect(usuarioPasseEstilo(req)).toContain('他一直在等。');
  });

  it('a orientação da violação vai junto da violação', () => {
    const texto = usuarioPasseEstilo(req);
    expect(texto).toContain('一直 é continuidade até então.');
    // Junto, não solta no fim: a orientação é daquela violação.
    expect(texto.indexOf('一直 é continuidade')).toBeGreaterThan(texto.indexOf('particula-yizhi'));
  });

  it('violação sem orientação não emite linha vazia', () => {
    const semOrientacao = {
      ...req,
      alvos: [{ ...req.alvos[0], violacoes: [{ regra: 'mais-que-perfeito', trecho: 'tinha ido' }] }],
    };
    expect(usuarioPasseEstilo(semOrientacao)).not.toContain('orientação:');
  });

  it('o bloco operacional manda o chinês arbitrar', () => {
    expect(sistemaPasseEstilo({ omega: 'ÔMEGA' })).toMatch(/original em chin[êe]s/i);
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -w server -- passeEstilo`
Expected: FAIL — o chinês não aparece na mensagem e o bloco operacional não menciona o original.

- [ ] **Step 3: Estenda o tipo da requisição**

Em `server/src/ia/provedor.ts`, substitua a linha 256 (`alvos: …`) por:

```ts
  alvos: {
    ordem: number;
    /** O ORIGINAL. Entrou por causa do catálogo de erros zh→pt-BR: consertar
     *  `一直 → sempre` sem ver o chinês é adivinhar qual dos dois sentidos a
     *  frase tinha. As violações de estilo puro ignoram este campo. */
    texto_zh: string;
    texto_pt: string;
    violacoes: {
      regra: string;
      trecho: string;
      /** O que é certo naquela violação, quando a regra sabe dizer (é o `certo`
       *  da entrada do catálogo). Entregue aqui, no ponto do uso, em vez de no
       *  prompt de tradução — texto de marcador no prompt foi medido sem efeito
       *  em 2026-08-05. */
      orientacao?: string;
    }[];
  }[];
```

- [ ] **Step 4: Renderize o chinês e a orientação**

Em `server/src/ia/prompts.ts`, em `sistemaPasseEstiloPartes`, acrescente uma linha ao array `operacional`, logo depois da linha que fala do `descartar`:

```ts
    'Quando a violação trouxer uma ORIENTAÇÃO, ela descreve o erro exato: o ORIGINAL em chinês é o árbitro — confira nele o sentido antes de propor o conserto ou o descarte.',
```

E em `usuarioPasseEstilo`, troque o laço dos alvos por:

```ts
  partes.push('### Frases a consertar:');
  for (const a of req.alvos) {
    partes.push(`[${a.ordem}] ZH: ${a.texto_zh}`);
    partes.push(`     PT: ${a.texto_pt}`);
    for (const v of a.violacoes) {
      partes.push(`     violação: ${v.regra} — trecho acusado: "${v.trecho}"`);
      if (v.orientacao) partes.push(`     orientação: ${v.orientacao}`);
    }
  }
```

- [ ] **Step 5: Conserte os chamadores que o compilador acusar**

Run: `npm run typecheck -w server`
Expected: erros nos testes e chamadores que montam `alvos` sem `texto_zh`. Acrescente `texto_zh` a cada um (nos testes, o chinês correspondente ao português já usado). Não toque na rota — ela é a Task 4.

- [ ] **Step 6: Rode e veja passar**

Run: `npm test -w server -- passeEstilo && npm run typecheck -w server`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/ia/provedor.ts server/src/ia/prompts.ts server/src/ia/passeEstilo.test.ts
git commit -m "O passe de estilo passa a ver o original — sem o chinês, consertar 一直 é adivinhar"
```

---

### Task 4: Os achados entram na lista que já existe

**Files:**
- Modify: `server/src/rotas/capitulos.ts:107-137` (rota `GET /capitulos/:id/estilo`) e `:139-212` (rota do passe)
- Test: `server/src/rotas/catalogoNaRota.test.ts` (novo)

**Interfaces:**
- Consumes: `varrerCatalogo` (Task 2), `CATALOGO` (Task 1), `RequisicaoPasseEstilo.alvos[].texto_zh` e `.violacoes[].orientacao` (Task 3).
- Produces: nada para tasks seguintes além do comportamento das rotas.

**Contexto que o brief não tem:** a rota de estilo devolve `{ ...relatorio, violacoes, por_terco, ignoradas }`, onde cada violação é `{ ordem, regra, trecho, frase_id }`. As do catálogo entram **nessa mesma forma** (`regra = entrada_id`, `trecho = trecho_pt`) — é o que faz a dispensa por trinca e a tela existirem sem alteração. `reposEstiloIgnorado.doCapitulo(db, id)` devolve um `Set` de `${frase_id}|${regra}|${trecho}`, exatamente o formato que `varrerCatalogo` espera.

- [ ] **Step 1: Escreva os testes que falham**

Crie `server/src/rotas/catalogoNaRota.test.ts`. Olhe `server/src/rotas/*.test.ts` já existentes para o jeito de montar app + banco em memória e semear obra/capítulo/frases; use o mesmo. Os casos:

```ts
import { describe, expect, it } from 'vitest';

describe('catálogo na rota de estilo', () => {
  it('a violação do catálogo vem na mesma lista das de estilo', async () => {
    // Semeie duas frases: uma com `一直` + "sempre" (catálogo) e outra com
    // aspas curvas “assim” (estilo). GET /capitulos/:id/estilo devolve as duas.
    // Espere: regras 'particula-yizhi' e 'aspas-nao-retas' presentes.
  });

  it('a lista sai em ordem de frase, não com o catálogo grampeado no fim', async () => {
    // Frase 0 = catálogo, frase 1 = estilo. Espere violacoes[0].ordem === 0.
  });

  it('por_terco conta as do catálogo', async () => {
    // Uma frase de catálogo no primeiro terço: por_terco[0] >= 1.
  });

  it('dispensar a violação do catálogo tira ela da lista', async () => {
    // POST /frases/:id/estilo/dispensar com { regra: 'particula-yizhi', trecho }
    // e o GET seguinte não traz mais.
  });

  it('o passe manda o chinês e a orientação do catálogo', async () => {
    // Com o provedor mock, POST /capitulos/:id/estilo/passe. Espie a requisição
    // (ver como os outros testes de rota interceptam o provedor) e espere:
    // alvos[0].texto_zh preenchido e violacoes[0].orientacao === o `certo` da
    // entrada. Numa violação de estilo puro, orientacao é undefined.
  });
});
```

Escreva-os de verdade, com asserções que falhem sem o código da Task 4 — nada de teste que passa por construção.

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -w server -- catalogoNaRota`
Expected: FAIL — nenhuma violação `particula-yizhi` na resposta.

- [ ] **Step 3: Junte as duas varreduras na rota de estilo**

Em `server/src/rotas/capitulos.ts`, acrescente aos imports:

```ts
import { varrerCatalogo } from '../traducao/catalogoZhPt.js';
```

Na rota `GET /capitulos/:id/estilo`, depois de `const visiveis = …` (a linha que termina com o `.filter(...)`), troque o cálculo de `por_terco` e o retorno por:

```ts
    // O catálogo de erros zh→pt-BR entra na MESMA lista, marcado pela regra:
    // é o que faz a dispensa por trinca e a tela existirem sem alteração. A
    // varredura é bilíngue, então ela roda sobre as frases, não sobre o
    // relatório de estilo.
    const doCatalogo = varrerCatalogo(frases, ignoradas).violacoes.map((v) => ({
      ordem: v.ordem,
      regra: v.entrada_id,
      trecho: v.trecho_pt,
      frase_id: v.frase_id,
    }));
    // Ordenado por frase: grampear o catálogo no fim faria a lista pular da
    // frase 90 para a 3, e o revisor lê na ordem do capítulo.
    const todas = [...visiveis, ...doCatalogo].sort((a, b) => a.ordem - b.ordem);

    // `por_terco` é recontado sobre o que sobrou: se contasse o dispensado, o
    // gráfico diria uma coisa e a lista outra.
    const por_terco: [number, number, number] = [0, 0, 0];
    for (const v of todas) {
      const i = frases.length === 0 ? 0 : Math.min(2, Math.floor((v.ordem / frases.length) * 3));
      por_terco[i] += 1;
    }
    return c.json({ ...relatorio, violacoes: todas, por_terco, ignoradas: ignoradas.size });
```

- [ ] **Step 4: Rode os dois primeiros testes**

Run: `npm test -w server -- catalogoNaRota`
Expected: os três primeiros passam; o do passe ainda falha.

- [ ] **Step 5: Leve o catálogo ao passe**

Ainda em `capitulos.ts`, acrescente `CATALOGO` ao import de `@dao-tale/shared` da rota. Na rota `POST /capitulos/:id/estilo/passe`, depois de `const visiveis = analisarEstilo(...)…`, troque a montagem de `alvos` por:

```ts
    const doCatalogo = varrerCatalogo(frases, ignoradas).violacoes;
    // Sem violação não há chamada — o passe custa dinheiro e não se paga no vazio.
    if (visiveis.length === 0 && doCatalogo.length === 0) return c.json({ correcoes: [] });

    const porOrdem = new Map<number, { regra: string; trecho: string; orientacao?: string }[]>();
    for (const v of visiveis) porOrdem.set(v.ordem, [...(porOrdem.get(v.ordem) ?? []), { regra: v.regra, trecho: v.trecho }]);
    for (const v of doCatalogo) {
      // A orientação é o `certo` da entrada: é aqui, no ponto do uso, que o
      // texto do catálogo é entregue — e não em toda chamada de tradução.
      const orientacao = CATALOGO.find((e) => e.id === v.entrada_id)?.certo;
      porOrdem.set(v.ordem, [...(porOrdem.get(v.ordem) ?? []), { regra: v.entrada_id, trecho: v.trecho_pt, orientacao }]);
    }
    const textoPorOrdem = new Map(frases.map((f) => [f.ordem, f.texto_pt ?? '']));
    const zhPorOrdem = new Map(frases.map((f) => [f.ordem, f.texto_zh]));
    const alvos = [...porOrdem.entries()]
      .sort(([a], [b]) => a - b)
      .map(([ordem, violacoes]) => ({
        ordem,
        texto_zh: zhPorOrdem.get(ordem) ?? '',
        texto_pt: textoPorOrdem.get(ordem) ?? '',
        violacoes,
      }));
```

Remova a guarda antiga `if (visiveis.length === 0) return c.json({ correcoes: [] });` — ela foi substituída pela linha acima, que considera as duas varreduras.

- [ ] **Step 6: Rode a suíte inteira**

Run: `npm test -w server && npm run typecheck -w server`
Expected: PASS. Se algum teste antigo de estilo quebrar por causa da nova ordenação, confira se ele dependia da ordem de inserção — corrija o teste, não a ordenação.

- [ ] **Step 7: Commit**

```bash
git add server/src/rotas/capitulos.ts server/src/rotas/catalogoNaRota.test.ts
git commit -m "O achado do catálogo entra na lista de estilo e no passe — sem tela nova"
```

---

### Task 5: A aferição, que é ferramenta e não evento

**Files:**
- Modify: `server/src/traducao/catalogoZhPt.ts` (acrescentar `aferirCatalogo`)
- Modify: `server/src/traducao/catalogoZhPt.test.ts` (acrescentar casos)
- Create: `server/scripts/aferir-catalogo.ts`
- Modify: `docs/08-prompt-universal.md` (uma seção curta)

**Interfaces:**
- Consumes: `EntradaCatalogo`, `CATALOGO`, `REPROVADAS`, `precisaoAferida` (Task 1); `varrerCatalogo` (Task 2).
- Produces: `aferirCatalogo(frases, entradas) => LinhaAfericao[]`.

- [ ] **Step 1: Escreva os testes que falham**

Acrescente a `server/src/traducao/catalogoZhPt.test.ts`:

```ts
import { aferirCatalogo } from './catalogoZhPt.js';

describe('aferirCatalogo', () => {
  const entrada = {
    id: 'particula-yizhi',
    titulo: 't',
    gatilho_zh: '一直',
    evitar_pt: /\bsempre\b/i,
    certo: 'c',
    aferido: { obra_id: 0, acusadas: 0, corrigidas: 0, em: '2026-01-01' },
  };

  it('mede a precisão por frase, não por subtração de agregados', () => {
    const frases = [
      // 3 acusadas na IA e consertadas pelo revisor
      ...[1, 2, 3].map(() => ({ texto_zh: '一直', texto_pt_original_ia: 'sempre', texto_pt: 'até então' })),
      // 1 acusada na IA e mantida
      { texto_zh: '一直', texto_pt_original_ia: 'sempre', texto_pt: 'sempre' },
    ];
    const [linha] = aferirCatalogo(frases, [entrada]);
    expect(linha).toMatchObject({ acusadas: 4, corrigidas: 3, restantes: 1, novas: 0 });
    expect(linha.precisao).toBeCloseTo(0.75);
  });

  it('conta separadamente a violação que APARECEU na revisão', () => {
    // A subtração de agregados esconderia este caso: uma some, outra nasce, e o
    // total não muda. É por isso que a conta é por frase.
    const frases = [
      { texto_zh: '一直', texto_pt_original_ia: 'sempre', texto_pt: 'até então' },
      { texto_zh: '一直', texto_pt_original_ia: 'até então', texto_pt: 'sempre' },
    ];
    const [linha] = aferirCatalogo(frases, [entrada]);
    expect(linha).toMatchObject({ acusadas: 1, corrigidas: 1, novas: 1 });
  });

  it('ignora frase sem texto original da IA — não há o que comparar', () => {
    const frases = [{ texto_zh: '一直', texto_pt_original_ia: null, texto_pt: 'sempre' }];
    const [linha] = aferirCatalogo(frases, [entrada]);
    expect(linha).toMatchObject({ acusadas: 0, corrigidas: 0, novas: 0, precisao: 0 });
  });

  it('a aferição confirma os números gravados no catálogo em produção', () => {
    // Guarda contra o `aferido` virar folclore: reproduz a conta com um corpus
    // sintético do tamanho declarado.
    const alvo = CATALOGO[0];
    const frases = [
      ...Array.from({ length: alvo.aferido.corrigidas }, () => ({
        texto_zh: alvo.gatilho_zh, texto_pt_original_ia: 'sempre', texto_pt: 'até então',
      })),
      ...Array.from({ length: alvo.aferido.acusadas - alvo.aferido.corrigidas }, () => ({
        texto_zh: alvo.gatilho_zh, texto_pt_original_ia: 'sempre', texto_pt: 'sempre',
      })),
    ];
    const [linha] = aferirCatalogo(frases, [alvo]);
    expect(linha.precisao).toBeCloseTo(precisaoAferida(alvo.aferido));
  });
});
```

Acrescente `CATALOGO` e `precisaoAferida` ao import de `@dao-tale/shared` do arquivo de teste.

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -w server -- catalogoZhPt`
Expected: FAIL — `aferirCatalogo is not a function`.

- [ ] **Step 3: Escreva a aferição**

Acrescente ao fim de `server/src/traducao/catalogoZhPt.ts`:

```ts
export interface LinhaAfericao {
  entrada_id: string;
  gatilho_zh: string;
  /** Frases acusadas no texto que a IA produziu. */
  acusadas: number;
  /** Dessas, quantas continuam acusadas no texto final. */
  restantes: number;
  /** Dessas, quantas o revisor consertou por conta própria. É o numerador. */
  corrigidas: number;
  /** Não acusadas na IA e acusadas no final — a revisão INTRODUZIU. Não entra
   *  na precisão; existe para a conta não ser feita por subtração de agregados,
   *  que esconderia uma sumindo e outra nascendo. */
  novas: number;
  precisao: number;
}

/** Responde "esta regra merece existir?" sem opinião. Função pura: o script lê
 *  o banco, isto aqui só conta. */
export function aferirCatalogo(
  frases: { texto_zh: string; texto_pt: string; texto_pt_original_ia: string | null }[],
  entradas: readonly EntradaCatalogo[],
): LinhaAfericao[] {
  return entradas.map((e) => {
    let acusadas = 0;
    let restantes = 0;
    let corrigidas = 0;
    let novas = 0;
    for (const f of frases) {
      if (!f.texto_zh.includes(e.gatilho_zh)) continue;
      // Sem o original da IA não há comparação possível — a frase não entra em
      // conta nenhuma, em vez de entrar como acerto.
      if (f.texto_pt_original_ia == null) continue;
      const naIa = e.evitar_pt.test(f.texto_pt_original_ia);
      const noFim = e.evitar_pt.test(f.texto_pt ?? '');
      if (naIa) acusadas++;
      if (naIa && noFim) restantes++;
      if (naIa && !noFim) corrigidas++;
      if (!naIa && noFim) novas++;
    }
    return {
      entrada_id: e.id,
      gatilho_zh: e.gatilho_zh,
      acusadas,
      restantes,
      corrigidas,
      novas,
      precisao: acusadas === 0 ? 0 : corrigidas / acusadas,
    };
  });
}
```

- [ ] **Step 4: Rode e veja passar**

Run: `npm test -w server -- catalogoZhPt`
Expected: PASS, 14 testes.

- [ ] **Step 5: Escreva o script**

Crie `server/scripts/aferir-catalogo.ts`. Olhe `server/scripts/medir-pipeline.ts` para como os scripts do projeto abrem o banco e recebem argumentos, e siga o mesmo. O script:

```ts
// Aferição do catálogo de erros zh→pt-BR (spec 2026-08-10).
//
// Uso:  npx tsx scripts/aferir-catalogo.ts <obra_id> [caminho-do-banco]
//
// Responde, para cada entrada do catálogo E para cada reprovada, quantas frases
// ela acusaria no texto que a IA produziu e em quantas delas o revisor já tinha
// corrigido por conta própria. É esse número que autoriza uma entrada a existir
// (PRECISAO_MINIMA e AMOSTRA_MINIMA) — e é ele que deve ser regravado no
// `aferido` quando o corpus crescer. Nada é escrito; o banco é aberto readonly.
```

Ele imprime uma tabela com `entrada_id`, `gatilho_zh`, `acusadas`, `restantes`, `corrigidas`, `novas`, `precisao`, em dois blocos (`CATALOGO` e `REPROVADAS`), e uma última linha por entrada do catálogo dizendo **PASSA** ou **REPROVA** contra os dois pisos. Lê as frases com:

```sql
SELECT f.texto_zh, f.texto_pt, f.texto_pt_original_ia
FROM frases f JOIN capitulos c ON c.id = f.capitulo_id
WHERE c.obra_id = ? AND f.status_traducao = 'traduzida'
```

- [ ] **Step 6: Rode o script contra um banco de teste**

Run: `npx tsx scripts/aferir-catalogo.ts 1` a partir de `server/`, com o banco padrão de desenvolvimento.
Expected: a tabela imprime sem erro. Num banco vazio, todas as linhas em zero — o script não pode estourar nisso.

- [ ] **Step 7: Documente**

Em `docs/08-prompt-universal.md`, acrescente uma seção curta no fim: o que é o catálogo, por que ele **não** volta para o núcleo Alfa (a medição de 2026-08-05 de marcador no prompt deu sem efeito), o critério das duas medidas, e como rodar a aferição. Aponte para o spec.

- [ ] **Step 8: Commit**

```bash
git add server/src/traducao/catalogoZhPt.ts server/src/traducao/catalogoZhPt.test.ts server/scripts/aferir-catalogo.ts docs/08-prompt-universal.md
git commit -m "A aferição é ferramenta: o catálogo só cresce com número, e o número é rerodável"
```

---

### Task 6: A tela nomeia o achado e diz o que é certo

**Files:**
- Modify: `web/src/App.tsx:394-400` (`REGRA_ESTILO_ROTULO`)
- Modify: `web/src/paginas/PasseEstilo.tsx:489` (onde o rótulo é montado)
- Test: `web/src/util/rotuloRegra.test.ts` (novo)

**Interfaces:**
- Consumes: `CATALOGO` de `@dao-tale/shared` (Task 1).
- Produces: nada.

**Contexto:** `REGRA_ESTILO_ROTULO` é um `Record<string, string>` usado em dois lugares (`EditorCapitulo.tsx:1268` e `PasseEstilo.tsx:463,489`), sempre com `?? regra` de reserva. Uma regra do catálogo sem rótulo apareceria como `particula-yizhi` cru na tela.

- [ ] **Step 1: Escreva o teste que falha**

Crie `web/src/util/rotuloRegra.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CATALOGO } from '@dao-tale/shared';
import { REGRA_ESTILO_ROTULO, orientacaoDaRegra } from './rotuloRegra';

describe('rótulos de regra', () => {
  it('toda entrada do catálogo tem rótulo — nada de id cru na tela', () => {
    for (const e of CATALOGO) expect(REGRA_ESTILO_ROTULO[e.id]).toBe(e.titulo);
  });

  it('as regras de estilo continuam nomeadas', () => {
    expect(REGRA_ESTILO_ROTULO['mais-que-perfeito']).toBe('Mais-que-perfeito simples');
  });

  it('a orientação sai só para regra do catálogo', () => {
    expect(orientacaoDaRegra(CATALOGO[0].id)).toBe(CATALOGO[0].certo);
    expect(orientacaoDaRegra('mais-que-perfeito')).toBeNull();
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -w web -- rotuloRegra`
Expected: FAIL — `Cannot find module './rotuloRegra'`.

- [ ] **Step 3: Mova o mapa para um módulo próprio, derivando o catálogo**

Crie `web/src/util/rotuloRegra.ts`:

```ts
// O de-para entre o id da regra e o que o revisor lê. Derivado de CATALOGO em
// vez de copiado: uma entrada nova no catálogo já nasce nomeada na tela, e a
// alternativa (duas listas para manter em sincronia) falha em silêncio — a
// regra aparece como `particula-yizhi` cru e parece defeito.
import { CATALOGO } from '@dao-tale/shared';

const DE_ESTILO: Record<string, string> = {
  'mais-que-perfeito': 'Mais-que-perfeito simples',
  'aspas-nao-retas': 'Aspas não retas',
  'virgula-dentro-da-aspa': 'Vírgula dentro das aspas',
  'dialogo-aspas': 'Travessão numa obra de aspas',
  'dialogo-travessao': 'Aspas numa obra de travessão',
};

export const REGRA_ESTILO_ROTULO: Record<string, string> = {
  ...DE_ESTILO,
  ...Object.fromEntries(CATALOGO.map((e) => [e.id, e.titulo])),
};

/** O que é certo naquela regra, quando o catálogo sabe dizer. As regras de
 *  estilo puro não têm — a preferência da obra é que manda nelas. */
export function orientacaoDaRegra(regra: string): string | null {
  return CATALOGO.find((e) => e.id === regra)?.certo ?? null;
}
```

Em `web/src/App.tsx`, remova o `REGRA_ESTILO_ROTULO` local (linhas 394-400) e reexporte do módulo novo, para não quebrar os dois importadores:

```ts
export { REGRA_ESTILO_ROTULO } from './util/rotuloRegra';
```

- [ ] **Step 4: Mostre a orientação onde o rótulo aparece**

Em `web/src/paginas/PasseEstilo.tsx`, na linha onde `const rotulo = REGRA_ESTILO_ROTULO[regra] ?? regra;` é usado, acrescente a orientação como texto auxiliar — importe `orientacaoDaRegra` de `../util/rotuloRegra` e renderize, quando houver, abaixo do rótulo:

```tsx
{orientacaoDaRegra(regra) && (
  <p className="mt-1 text-xs text-tinta-2">{orientacaoDaRegra(regra)}</p>
)}
```

Use os tokens do projeto (`docs/tokens-css.md`); nada de cor hardcoded.

- [ ] **Step 5: Rode e veja passar**

Run: `npm test -w web && npm run typecheck -w web && npm run build -w web`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/util/rotuloRegra.ts web/src/util/rotuloRegra.test.ts web/src/App.tsx web/src/paginas/PasseEstilo.tsx
git commit -m "A tela nomeia o achado do catálogo e diz, ali mesmo, o que é certo"
```

---

## Self-Review

**Cobertura do spec:**

| Seção do spec | Task |
|---|---|
| §2 critério e pisos | 1 (dado + teste-guarda) |
| §3 catálogo como dado, `REPROVADAS` | 1 |
| §4 detector bilíngue | 2 |
| §5 achado na lista existente, `alvos[].texto_zh`, orientação no ponto do uso | 3 e 4 |
| §6 script de aferição + teste-guarda | 5 (o guarda propriamente está na 1) |
| §7 testes 1–10 | 2 (1–5, 7), 1 (6), 4 (8, 9), 5 (10) |
| §9 não-objetivos | Global Constraints |

**Consistência de tipos:** `EntradaCatalogo` (Task 1) é consumida por `varrerCatalogo` e `aferirCatalogo` (Tasks 2 e 5) e por `orientacaoDaRegra` (Task 6). `ViolacaoCatalogo.entrada_id` vira `regra` e `trecho_pt` vira `trecho` na Task 4 — a conversão é explícita e está no código do passo. `RequisicaoPasseEstilo.alvos[].texto_zh` é definido na Task 3 e preenchido na Task 4.

**Risco de ordem:** a Task 4 depende da 3 (o tipo do alvo) e da 2 (o detector). A 6 depende só da 1. Executar em ordem.
