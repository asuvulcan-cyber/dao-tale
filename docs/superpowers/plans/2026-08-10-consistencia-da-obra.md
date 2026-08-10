# Consistência da Obra — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A varredura de consistência do glossário passa a ver a obra inteira, e passa a ser recalculada quando o glossário muda — em vez de exibir um número calculado antes de o termo existir.

**Architecture:** `varrerConsistencia` já é função pura sobre uma lista de frases e não muda. O que entra é um chamador novo que passa **todas** as frases traduzidas da obra e agrupa o resultado **por termo** (porque o conserto é por termo), e um gatilho que recalcula as contagens por capítulo em toda mutação do glossário. Zero IA: a varredura é determinística e custa 10–38 ms na obra inteira.

**Tech Stack:** TypeScript, Node 22, better-sqlite3, Hono, Zod, Vitest, React 19, TanStack Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-10-consistencia-da-obra-design.md`

## Global Constraints

- **Monorepo npm workspaces:** `shared`, `server`, `web`. Import entre pacotes por `@dao-tale/shared`. Imports relativos dentro de um pacote **sempre com extensão `.js`** (ESM + tsx), mesmo apontando para `.ts`.
- **Testes:** `npm -w server run test` e `npm -w web run test` (Vitest). Tipos: `npm run typecheck`. Build: `npm run build`.
- **Banco em teste:** `abrirBanco(':memory:')` de `server/src/db/index.js` aplica todas as migrações.
- **Não alterar `varrerConsistencia`**, nem o filtro de termos de 1 caractere, nem a heurística de flexão (`contemTermoFlexionado`). O que muda é quem a chama e quando.
- **Duplicar `beforeEach` e helpers entre arquivos de teste é a convenção deste repositório.** Não extraia helper compartilhado.
- **Idioma:** todo comentário, mensagem de erro e texto de UI em português do Brasil. Comentário explica **por quê**, não o quê.
- **Design por tokens:** nada de cor, espaçamento ou tamanho cru — `bg-papel-fundo`, `text-tinta-2`, `border-linha`, `text-jade-forte` e afins (`docs/tokens-css.md`).
- **Nunca `git add -A` nem `git add .`** — o working tree tem arquivos do usuário fora deste trabalho (`server/src/traducao/estiloViolacoes.ts`, `shared/src/preferenciasEstilo.ts`). Só caminhos explícitos.
- **Commits:** um por tarefa, mensagem em português, corpo explicando o porquê.

## Ordem e dependências

```
Task 1  (independente — resíduo parkeado do item 3)
Task 2  →  Task 4
Task 3  →  Task 4
```

---

### Task 1: O cabeçalho órfão no prompt de refinamento

Resíduo parkeado na revisão final do trabalho anterior. O refinamento do prompt agora pode rodar **só com edições manuais** e nenhum caso recorrente — e nesta obra isso é o cenário provável (146 edições contra 25 casos). Quando isso acontece, o prompt sai com um cabeçalho vazio e as instruções pedem um identificador que não existe.

**Files:**
- Modify: `server/src/ia/prompts.ts` (`usuarioRefinarPrompt`, `sistemaRefinarPromptPartes`)
- Test: `server/src/ia/prompts.test.ts`

**Interfaces:**
- Consumes: `RequisicaoRefinarPrompt` com `casos`, `recusados`, `edicoes`.
- Produces: nada de novo.

- [ ] **Step 1: Write the failing test**

Acrescente a `server/src/ia/prompts.test.ts`, dentro do `describe` do refinamento:

```ts
  it('sem casos, não emite o cabeçalho de casos', () => {
    // O refinamento passou a poder rodar só com edições manuais. O cabeçalho
    // saía mesmo assim, vazio, e a instrução pedia "o identificador dos casos
    // que a motivaram" — que edição manual não tem.
    const u = usuarioRefinarPrompt({
      casos: [],
      recusados: [],
      edicoes: [
        { trecho_zh: '他已经是死人', ia: 'ele já é um morto', voce: 'ele já é um cadáver', mudou: { de: 'morto', para: 'cadáver' } },
      ],
    });
    expect(u).not.toContain('### Casos recorrentes do banco de testes');
    expect(u).toMatch(/corrigiu à mão|fez à mão/i);
  });

  it('com casos, o cabeçalho continua saindo', () => {
    const u = usuarioRefinarPrompt({
      casos: [
        { secao_regra: '1-prosa-nao-legenda', trecho_zh: '甲', pergunta: 'p', veredito: 'incorreto', justificativa: 'j', correcao_proposta: null },
      ],
      recusados: [],
      edicoes: [],
    });
    expect(u).toContain('### Casos recorrentes do banco de testes');
  });

  it('o sistema descreve as duas fontes e o que fazer sem casos', () => {
    const s = sistemaRefinarPrompt({ omega: 'PROMPT', deltaAtual: '' });
    // Sem isto o modelo tem de inventar um secao_regra sem orientação nenhuma.
    expect(s).toMatch(/quando (n[ãa]o houver|só houver|houver apenas)/i);
  });
```

Confira antes de rodar o nome exato do campo do caso em `RequisicaoRefinarPrompt` (`server/src/ia/provedor.ts`) e ajuste o objeto do segundo teste para bater — não invente campos.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server run test -- prompts`
Expected: FAIL no primeiro (`expected '…' not to contain '### Casos recorrentes do banco de testes'`).

- [ ] **Step 3: Implement**

Em `server/src/ia/prompts.ts`, `usuarioRefinarPrompt`: o array começa hoje com o cabeçalho de casos incondicionalmente. Passe a montá-lo só quando houver caso:

```ts
export function usuarioRefinarPrompt(req: Pick<RequisicaoRefinarPrompt, 'casos' | 'recusados' | 'edicoes'>): string {
  const partes: string[] = [];
  if (req.casos.length > 0) {
    // Cabeçalho só quando há casos: o refinamento agora também roda só com
    // edições manuais, e cabeçalho vazio faz o modelo procurar o que não veio.
    partes.push('### Casos recorrentes do banco de testes:');
    // … o agrupamento por seção que já existe, sem alteração …
  }
  // … recusados e edicoes, como já estão …
}
```

Preserve o agrupamento por seção exatamente como está — só mova para dentro do `if`.

Em `sistemaRefinarPromptPartes`, acrescente à lista de instruções:

```ts
    'As fontes podem vir juntas ou separadas: casos recorrentes do banco de testes, casos recusados pelo revisor, e correções que ele fez à mão. Quando NÃO houver casos recorrentes e só vierem correções à mão, proponha um secao_regra NOVO e descritivo do padrão que você observou — não cite um identificador que não foi enviado.',
```

- [ ] **Step 4: Run tests**

Run: `npm -w server run test && npm run typecheck`
Expected: PASS. Se algum teste existente assumia o cabeçalho sempre presente, atualize a asserção — não o código.

- [ ] **Step 5: Commit**

```bash
git add server/src/ia/prompts.ts server/src/ia/prompts.test.ts
git commit -m "Cabeçalho de casos só sai quando há casos

O refinamento passou a rodar só com edições manuais — nesta obra são 146 contra
25 casos, então é o cenário provável. O cabeçalho saía vazio e a instrução pedia
'o identificador dos casos que a motivaram', que edição manual não tem: o modelo
inventava um secao_regra sem orientação. Resíduo parkeado na revisão final."
```

---

### Task 2: A varredura da obra, agrupada por termo

**Files:**
- Modify: `server/src/db/repos.ts` (`reposFrases.listarPorObra`)
- Modify: `server/src/rotas/obras.ts` (rota nova)
- Test: `server/src/rotas/consistenciaObra.test.ts`

**Interfaces:**
- Consumes: `varrerConsistencia(frases, glossario, ignoradas)` de `server/src/traducao/consistencia.js`; `reposConsistencia.ignoradasDaObra(db, obraId)` (**já existe**, `repos.ts:1308`); `reposGlossario.listar`.
- Produces:
  - `reposFrases.listarPorObra(db, obraId): (Frase & { capitulo_numero: number })[]`
  - `GET /obras/:id/consistencia` → `{ ocorrencias, termos_curtos_ignorados, frases_examinadas, por_termo }`, onde cada item de `por_termo` é
    `{ glossario_id, termo_zh, termo_pt, violacoes: { frase_id, capitulo_id, capitulo_numero, ordem, texto_zh, texto_pt }[] }`.

- [ ] **Step 1: Write the failing test**

Create `server/src/rotas/consistenciaObra.test.ts`. Monte o app com o padrão de `server/src/app.test.ts` (leia e reaproveite; o prefixo das rotas é `/api`). Crie uma obra com dois capítulos, frases traduzidas, e um glossário onde um termo aparece no chinês de três frases mas o canônico só está no português de uma.

```ts
  it('agrupa por termo, não por frase', async () => {
    const r = await app.request(`/api/obras/${obraId}/consistencia`);
    expect(r.status).toBe(200);
    const { por_termo } = await r.json();
    // Duas frases sem o mesmo termo saem num grupo só.
    expect(por_termo).toHaveLength(1);
    expect(por_termo[0].termo_zh).toBe('金鹏堡');
    expect(por_termo[0].violacoes).toHaveLength(2);
  });

  it('atravessa os capítulos e diz de qual cada frase veio', async () => {
    const { por_termo } = await (await app.request(`/api/obras/${obraId}/consistencia`)).json();
    const capitulos = por_termo[0].violacoes.map((v: { capitulo_numero: number }) => v.capitulo_numero).sort();
    expect(capitulos).toEqual([1, 2]);
  });

  it('ordena por número de violações, decrescente', async () => {
    // O termo que mais derivou aparece primeiro — é por ele que o revisor começa.
    const { por_termo } = await (await app.request(`/api/obras/${obraIdComDoisTermos}/consistencia`)).json();
    expect(por_termo[0].violacoes.length).toBeGreaterThanOrEqual(por_termo[1].violacoes.length);
  });

  it('respeita a dispensa registrada pelo revisor', async () => {
    await app.request(`/api/frases/${fraseId}/consistencia/dispensar`, {
      method: 'POST',
      body: JSON.stringify({ termo_zh: '金鹏堡' }),
      headers: { 'content-type': 'application/json' },
    });
    const { por_termo } = await (await app.request(`/api/obras/${obraId}/consistencia`)).json();
    expect(por_termo[0].violacoes).toHaveLength(1);
  });

  it('só examina frase traduzida', async () => {
    // Frase pendente não tem tradução para comparar; acusá-la seria ruído.
    const { frases_examinadas } = await (await app.request(`/api/obras/${obraId}/consistencia`)).json();
    expect(frases_examinadas).toBe(numeroDeFrasesTraduzidas);
  });

  it('obra sem violação devolve lista vazia, não erro', async () => {
    const r = await app.request(`/api/obras/${obraLimpaId}/consistencia`);
    expect(r.status).toBe(200);
    expect((await r.json()).por_termo).toEqual([]);
  });

  it('termo de 1 caractere não gera violação e é contado à parte', async () => {
    // Filtro que já existe em varrerConsistencia: um caractere aparece dentro de
    // dezenas de palavras comuns e só produziria ruído. A contagem sai separada
    // para a tela poder explicar a ausência em vez de o revisor achar que falhou.
    reposGlossario.criar(db, obraId, { termo_zh: '堡', termo_pt: 'fortaleza', categoria: 'lugar' });
    const { termos_curtos_ignorados, por_termo } = await (
      await app.request(`/api/obras/${obraId}/consistencia`)
    ).json();
    expect(termos_curtos_ignorados).toBe(1);
    expect(por_termo.some((t: { termo_zh: string }) => t.termo_zh === '堡')).toBe(false);
  });
```

Confira o corpo exato que `POST /frases/:id/consistencia/dispensar` espera lendo `server/src/rotas/capitulos.ts:248` — não invente o nome do campo.

- [ ] **Step 2: Run to verify it fails**

Run: `npm -w server run test -- consistenciaObra`
Expected: FAIL com 404 (rota não existe).

- [ ] **Step 3: Implement `listarPorObra`**

Em `server/src/db/repos.ts`, dentro de `reposFrases`:

```ts
  /** Todas as frases da obra com o número do capítulo junto. `varrerConsistencia`
      é pura e não sabe o que é capítulo — o de-para fica aqui, como já acontece
      na rota por capítulo. */
  listarPorObra(db: BancoDados, obraId: number): (Frase & { capitulo_numero: number })[] {
    return db
      .prepare(
        `SELECT f.*, c.numero capitulo_numero
         FROM frases f JOIN capitulos c ON c.id = f.capitulo_id
         WHERE c.obra_id = ? ORDER BY c.numero, f.ordem`,
      )
      .all(obraId)
      .map((l) => paraFrase(l as never)) as (Frase & { capitulo_numero: number })[];
  },
```

Confira o nome e a forma do helper `paraFrase` (perto de `repos.ts:59`) antes de usar — ele coage `editado_manualmente` de inteiro para booleano, e o `SELECT f.*` traz a coluna crua.

- [ ] **Step 4: Implement the route**

Em `server/src/rotas/obras.ts`:

```ts
  // Varredura de consistência no nível da OBRA, agrupada por termo.
  // Agrupar por termo e não por frase é a decisão central: o conserto é por termo
  // (`POST /glossario/:id/substituir` troca na obra inteira), então o relatório
  // precisa estar organizado do jeito que o conserto funciona.
  app.get('/obras/:id/consistencia', (c) => {
    const obraId = Number(c.req.param('id'));
    if (!reposObras.obter(db, obraId)) {
      return c.json({ erro: { codigo: 'nao-encontrado', mensagem: 'Obra não encontrada.' } }, 404);
    }
    const frases = reposFrases.listarPorObra(db, obraId);
    const glossario = reposGlossario.listar(db, obraId);
    const resultado = varrerConsistencia(frases, glossario, reposConsistencia.ignoradasDaObra(db, obraId));

    const porFrase = new Map(frases.map((f) => [f.id, f]));
    const porTermo = new Map<string, { glossario_id: number; termo_zh: string; termo_pt: string; violacoes: unknown[] }>();
    for (const v of resultado.violacoes) {
      const entrada = glossario.find((g) => g.termo_zh === v.termo_zh);
      const grupo = porTermo.get(v.termo_zh) ?? {
        glossario_id: entrada?.id ?? 0,
        termo_zh: v.termo_zh,
        termo_pt: v.termo_pt,
        violacoes: [],
      };
      const f = porFrase.get(v.frase_id);
      grupo.violacoes.push({
        frase_id: v.frase_id,
        capitulo_id: f?.capitulo_id ?? null,
        capitulo_numero: f?.capitulo_numero ?? null,
        ordem: v.ordem,
        texto_zh: v.texto_zh,
        texto_pt: v.texto_pt,
      });
      porTermo.set(v.termo_zh, grupo);
    }

    // Mais violações primeiro; empate pelo termo em PT, para a lista não dançar
    // entre duas chamadas iguais.
    const por_termo = [...porTermo.values()].sort(
      (a, b) => b.violacoes.length - a.violacoes.length || a.termo_pt.localeCompare(b.termo_pt, 'pt-BR'),
    );

    return c.json({
      ocorrencias: resultado.ocorrencias,
      termos_curtos_ignorados: resultado.termos_curtos_ignorados,
      frases_examinadas: frases.filter((f) => f.status_traducao === 'traduzida').length,
      por_termo,
    });
  });
```

Acrescente os imports que faltarem (`varrerConsistencia`, `reposConsistencia`, `reposGlossario`, `reposFrases`) — confira quais já estão no arquivo.

- [ ] **Step 5: Run to verify it passes**

Run: `npm -w server run test -- consistenciaObra`
Expected: PASS nos seis.

- [ ] **Step 6: Run everything**

Run: `npm run typecheck && npm -w server run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/db/repos.ts server/src/rotas/obras.ts server/src/rotas/consistenciaObra.test.ts
git commit -m "Varredura de consistência no nível da obra, agrupada por termo

varrerConsistencia já era pura sobre uma lista de frases; faltava um chamador que
passasse a obra inteira. O agrupamento é por TERMO e não por frase porque o
conserto é por termo — o substituir troca na obra inteira, e uma lista por frase
obrigaria o revisor a reconstruir mentalmente qual termo é qual antes de agir."
```

---

### Task 3: O gatilho — recalcular quando o glossário muda

Este é o buraco que o spec identificou: nada reexamina os capítulos antigos quando o glossário muda. O revisor cadastra um termo e os capítulos continuam exibindo o `0 violações` calculado **antes de o termo existir**.

**Files:**
- Modify: `server/src/traducao/consistencia.ts` (função nova)
- Modify: `server/src/rotas/curadoria.ts` (7 rotas)
- Test: `server/src/traducao/recalcularConsistencia.test.ts`

**Interfaces:**
- Consumes: `varrerConsistencia`; `reposFrases.listarPorObra` (Task 2); `reposCapitulos.definirConsistencia(db, capituloId, violacoes)` (**já existe**, `repos.ts:412`); `reposConsistencia.ignoradasDaObra`.
- Produces: `recalcularConsistenciaDaObra(db, obraId): void`

- [ ] **Step 1: Write the failing test**

Create `server/src/traducao/recalcularConsistencia.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { abrirBanco, type BancoDados } from '../db/index.js';
import { reposCapitulos, reposFrases, reposGlossario, reposObras } from '../db/repos.js';
import { recalcularConsistenciaDaObra } from './consistencia.js';

let db: BancoDados;
let obraId: number;
let capId: number;

beforeEach(() => {
  db = abrirBanco(':memory:');
  obraId = reposObras.criar(db, { titulo: 'Obra' }).id;
  const cap = reposCapitulos.criar(db, obraId, { numero: 1, texto_origem: '金鹏堡很大。' }, [
    { texto_zh: '金鹏堡很大。', paragrafo: 0 },
  ]);
  capId = cap.id;
  const frase = reposFrases.listarPorCapitulo(db, capId)[0];
  // Traduzida SEM o termo canônico — é o estado que o glossário novo vai acusar.
  reposFrases.editarTexto(db, frase.id, 'A Fortaleza Jinpeng é grande.');
  reposFrases.marcarTraduzida?.(db, frase.id);
});

describe('recalcularConsistenciaDaObra', () => {
  it('cadastrar um termo que falta em frases antigas muda a contagem do capítulo', () => {
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBeNull();
    reposGlossario.criar(db, obraId, { termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' });
    recalcularConsistenciaDaObra(db, obraId);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
  });

  it('apagar o termo devolve a contagem a zero', () => {
    const g = reposGlossario.criar(db, obraId, { termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' });
    recalcularConsistenciaDaObra(db, obraId);
    reposGlossario.apagar(db, g.id);
    recalcularConsistenciaDaObra(db, obraId);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(0);
  });

  it('respeita a dispensa do revisor', () => {
    // Dispensa registrada não volta a contar só porque o glossário mudou em outro ponto.
    const g = reposGlossario.criar(db, obraId, { termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' });
    expect(g).toBeTruthy();
    const frase = reposFrases.listarPorCapitulo(db, capId)[0];
    db.prepare('INSERT INTO consistencia_ignorada (frase_id, termo_zh) VALUES (?, ?)').run(frase.id, '金鹏堡');
    recalcularConsistenciaDaObra(db, obraId);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(0);
  });
});
```

Antes de rodar, confira em `server/src/db/repos.ts` os nomes reais de `reposGlossario.criar` / `.apagar` e como uma frase passa a `status_traducao = 'traduzida'` — se não houver `marcarTraduzida`, escreva o `UPDATE` direto no teste e diga isso no relatório. O schema de `consistencia_ignorada` está em `server/src/db/migrations/019_consistencia_ignorada.sql`.

- [ ] **Step 2: Run to verify it fails**

Run: `npm -w server run test -- recalcularConsistencia`
Expected: FAIL — `recalcularConsistenciaDaObra is not a function`.

- [ ] **Step 3: Implement**

Em `server/src/traducao/consistencia.ts`, ao fim do arquivo:

```ts
/**
 * Recalcula `capitulos.consistencia_violacoes` de todos os capítulos da obra.
 *
 * Sem isto, o número exibido responde a uma pergunta feita ANTES de o glossário
 * mudar: cadastra-se um termo e os capítulos seguem mostrando o "0 violações"
 * calculado quando o termo não existia. Zero calculado cedo demais é pior que
 * nenhum número, porque parece resposta.
 *
 * Custa 10–38 ms na obra inteira (medido: 561 frases, glossário de 57 a 1500
 * termos), então recalcular vale mais que inventar um estado "precisa reconferir".
 * Respeita as dispensas do revisor.
 */
export function recalcularConsistenciaDaObra(db: BancoDados, obraId: number): void {
  const frases = reposFrases.listarPorObra(db, obraId);
  const glossario = reposGlossario.listar(db, obraId);
  const ignoradas = reposConsistencia.ignoradasDaObra(db, obraId);
  const porCapitulo = new Map<number, typeof frases>();
  for (const f of frases) porCapitulo.set(f.capitulo_id, [...(porCapitulo.get(f.capitulo_id) ?? []), f]);
  for (const [capituloId, doCapitulo] of porCapitulo) {
    const r = varrerConsistencia(doCapitulo, glossario, ignoradas);
    reposCapitulos.definirConsistencia(db, capituloId, r.violacoes.length);
  }
}
```

**Atenção ao ciclo de import:** `consistencia.ts` é hoje um módulo puro que não importa nada de `db/`. Se importar `repos.js` criar ciclo, ponha `recalcularConsistenciaDaObra` em `server/src/db/repos.ts` (ao lado de `definirConsistencia`) e deixe `consistencia.ts` puro. Verifique antes de escrever e registre a decisão no relatório — a pureza de `varrerConsistencia` é o que permite ela ser testada sem banco, e não pode ser perdida.

- [ ] **Step 4: Run to verify it passes**

Run: `npm -w server run test -- recalcularConsistencia`
Expected: PASS nos três.

- [ ] **Step 5: Wire the seven glossary routes**

Em `server/src/rotas/curadoria.ts`, chame `recalcularConsistenciaDaObra(db, obraId)` **depois** da mutação, antes do `return`, nas sete rotas:

| Linha | Rota | De onde vem o `obraId` |
|---|---|---|
| ~83 | `POST /obras/:obraId/glossario` | parâmetro da rota |
| ~93 | `PATCH /glossario/:id` | `entrada.obra_id` da entrada alterada |
| ~101 | `DELETE /glossario/:id` | leia a entrada **antes** de apagar |
| ~110 | `POST /glossario/:id/substituir` | `entrada.obra_id` — e **só quando `previa` for falso** |
| ~131 | `POST /glossario/:id/vincular` | `entrada.obra_id` |
| ~153 | `POST /obras/:obraId/glossario/importar` | parâmetro — recalcule **uma vez ao fim**, não por termo |
| ~201 | `POST /termos-sugeridos/:id/aceitar` | a sugestão traz `obra_id` |

`substituir` entra na lista porque altera as **frases**, não o glossário — e é justamente a ação que zera as violações que o revisor acabou de consertar. Com `previa: true` nada é gravado, então recalcular ali seria trabalho jogado fora.

- [ ] **Step 6: Write the route test**

Acrescente a `server/src/traducao/recalcularConsistencia.test.ts` um `describe` que monte o app (padrão de `server/src/app.test.ts`) e prove o gatilho pela HTTP:

```ts
  it('cadastrar termo pela rota já deixa a contagem do capítulo em dia', async () => {
    // É o buraco que esta tarefa fecha: antes, o capítulo seguia com o número
    // calculado quando o termo não existia.
    await app.request(`/api/obras/${obraId}/glossario`, {
      method: 'POST',
      body: JSON.stringify({ termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
  });

  it('substituir zera a contagem que ele acabou de consertar', async () => {
    // substituir altera as FRASES, não o glossário — e é justamente a ação que
    // resolve as violações. Sem recalcular, o selo continuaria acusando.
    const g = await (
      await app.request(`/api/obras/${obraId}/glossario`, {
        method: 'POST',
        body: JSON.stringify({ termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' }),
        headers: { 'content-type': 'application/json' },
      })
    ).json();
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);

    await app.request(`/api/glossario/${g.id}/substituir`, {
      method: 'POST',
      body: JSON.stringify({ de: 'Fortaleza Jinpeng', previa: false }),
      headers: { 'content-type': 'application/json' },
    });
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(0);
  });

  it('prévia do substituir não recalcula nem grava', async () => {
    const g = await (
      await app.request(`/api/obras/${obraId}/glossario`, {
        method: 'POST',
        body: JSON.stringify({ termo_zh: '金鹏堡', termo_pt: 'Fortaleza do Peng Dourado', categoria: 'lugar' }),
        headers: { 'content-type': 'application/json' },
      })
    ).json();
    const antes = reposFrases.listarPorCapitulo(db, capId)[0].texto_pt;

    await app.request(`/api/glossario/${g.id}/substituir`, {
      method: 'POST',
      body: JSON.stringify({ de: 'Fortaleza Jinpeng', previa: true }),
      headers: { 'content-type': 'application/json' },
    });
    // Prévia não grava nada; recalcular ali seria trabalho jogado fora.
    expect(reposFrases.listarPorCapitulo(db, capId)[0].texto_pt).toBe(antes);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
  });

  it('importar CSV recalcula uma vez, e a contagem fica certa', async () => {
    // O laço da importação não pode recalcular por termo — seriam N varreduras
    // da obra inteira numa ação só.
    const csv = 'termo_zh,termo_pt,categoria\n金鹏堡,Fortaleza do Peng Dourado,lugar\n飞鹰,Águia Voadora,pessoa\n';
    const r = await app.request(`/api/obras/${obraId}/glossario/importar`, {
      method: 'POST',
      body: JSON.stringify({ csv }),
      headers: { 'content-type': 'application/json' },
    });
    expect(r.status).toBe(200);
    expect(reposCapitulos.obter(db, capId)!.consistencia_violacoes).toBe(1);
  });
```

Confira o corpo que `POST /obras/:obraId/glossario/importar` espera (`curadoria.ts:153`) — se ele receber o CSV por outro campo ou por `multipart`, ajuste o teste à forma real em vez de inventar.

- [ ] **Step 7: Run everything**

Run: `npm run typecheck && npm -w server run test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add server/src/traducao/consistencia.ts server/src/db/repos.ts server/src/rotas/curadoria.ts server/src/traducao/recalcularConsistencia.test.ts
git commit -m "Recalcula a consistência quando o glossário muda

Era o buraco de verdade: varrerConsistencia já rodava em três lugares, mas nada
reexaminava os capítulos antigos quando um termo era cadastrado, editado ou
apagado. O '0 violações' exibido respondia a uma pergunta feita antes de o termo
existir — pior que nenhum número, porque parece resposta. Custa 10–38 ms na obra
inteira, então recalcular vale mais que inventar um estado 'precisa reconferir'."
```

---

### Task 4: A tela da obra

**Files:**
- Create: `web/src/paginas/ConsistenciaObra.tsx`
- Modify: `web/src/main.tsx` (rota), `web/src/paginas/ObraLayout.tsx` (entrada no menu), `web/src/paginas/EdicoesManuais.tsx` (link da rota `glossario`)

**Interfaces:**
- Consumes: `GET /api/obras/:id/consistencia` (Task 2); `POST /api/glossario/:id/substituir` com `{ de, previa }`; `POST /api/frases/:id/consistencia/dispensar`.
- Produces: nada consumido por outra tarefa.

- [ ] **Step 1: A tela**

`ConsistenciaObra.tsx`, com este comportamento:

- **Resumo no topo:** *"N termos · M frases examinadas · K frases fora do padrão"*, usando `frases_examinadas`, `ocorrencias` e o total de violações. Quando `termos_curtos_ignorados > 0`, diga também quantos termos de 1 caractere ficaram de fora e por quê (aparecem dentro de dezenas de palavras comuns).
- **Um bloco por termo**, na ordem que a rota devolve: `termo_zh → termo_pt` no cabeçalho, com a contagem. Dentro, a lista de frases com `cap X/ordem` e o `texto_pt`. Lista com mais de 8 frases fica dentro de um `<details>` fechado, com as 3 primeiras visíveis fora dele.
- **No pé de cada bloco, o conserto:** um campo de texto ("o que está escrito no lugar"), um botão **Prévia** e um **Trocar**. A prévia chama `substituir` com `previa: true` e mostra *"N frases seriam alteradas"*; **Trocar** chama com `previa: false` e invalida a query. O botão **Trocar** fica desabilitado enquanto a prévia não tiver sido pedida para o texto atual do campo — trocar às cegas na obra inteira é o tipo de ação que se faz uma vez e se lamenta.
- **Cada frase tem duas ações:** um link para o editor no capítulo e ordem certos, e **Dispensar**, que chama `POST /frases/:id/consistencia/dispensar` e invalida a query. Dispensar tem o mesmo peso visual do conserto: nem toda ausência é erro — quando o referente já está estabelecido, o português omite em vez de repetir, e uma lista que só oferece "consertar" ensina o revisor a ignorá-la inteira.
- **Estado vazio honesto:** quando `por_termo` está vazio, a tela diz o que foi examinado — *"57 termos contra 561 frases, agora"* — e não um "tudo certo" solto. A diferença entre "está limpo" e "ninguém olhou" é o defeito que este trabalho existe para consertar; reproduzi-lo na tela nova seria irônico.

- [ ] **Step 2: As entradas**

- `main.tsx`: rota `/obras/:obraId/consistencia`, no mesmo formato das demais.
- `ObraLayout.tsx`: item de menu, ao lado dos outros da obra.
- `EdicoesManuais.tsx`: no grupo da rota `glossario`, o texto hoje diz *"resolve-se na varredura de consistência, não no prompt"* — acrescente o link para esta tela. Era uma frase que apontava para o nada.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm -w web run test && npm run build`
Expected: PASS nos três.

Depois, com `npm run dev`: crie um termo de glossário que falte em frases já traduzidas, confirme que a tela o mostra agrupado, peça a prévia, troque, e confirme que a lista esvazia e que o selo do capítulo na lista de capítulos muda junto.

- [ ] **Step 4: Commit**

```bash
git add web/src/paginas/ConsistenciaObra.tsx web/src/main.tsx web/src/paginas/ObraLayout.tsx web/src/paginas/EdicoesManuais.tsx
git commit -m "A tela da consistência da obra

Agrupada por termo porque o conserto é por termo. Trocar só habilita depois da
prévia: substituir às cegas na obra inteira é o tipo de ação que se faz uma vez e
se lamenta. E Dispensar tem o mesmo peso do conserto, porque nem toda ausência é
erro — o português omite o referente já estabelecido, e uma lista que só oferece
'consertar' ensina o revisor a ignorá-la inteira."
```

---

## Depois do plano

- **Catálogo universal de erros zh→pt-BR**: spec próprio, com medição obrigatória.
- **Guia de testes manuais** cobrindo os três blocos entregues.
- Subir com `npm run subir`, que roda typecheck + testes + build e faz backup verificado do banco antes de migrar. Atenção: o script faz rsync do **working tree**, não do HEAD.
