# Glossário: espécie, grifo com flexão, captura e pertencimento — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar no glossário o termo cuja **forma** é lei do termo cuja **palavra** é lei, consertar o grifo do editor para casar flexão, e deixar o revisor cadastrar um termo a partir da seleção no texto.

**Architecture:** As regras de flexão saem de `server/src/traducao/flexao.ts` para `shared/`, e o grifo do editor passa a consumi-las — hoje são dois casadores para a mesma pergunta e só um sabe flexão. Uma migração acrescenta três colunas anuláveis a `glossario` (`especie`, `nota_uso`, `termo_pai_id`); `formatarGlossario` passa a emitir dois blocos com instruções opostas sobre a forma; `filtrarGlossarioRelevante` puxa o pai um nível acima. Nenhum backfill: `NULL` significa "nunca classificado" e se comporta como hoje.

**Tech Stack:** TypeScript ESM (imports relativos sempre com `.js`), npm workspaces (`shared`, `server`, `web`), Hono, Zod, vitest, better-sqlite3, React + react-query, Tailwind com os tokens do projeto.

## Global Constraints

- **O COMPORTAMENTO de `contemTermoFlexionado` não muda.** As regras são movidas para `shared/`, e a prova é `server/src/traducao/flexao.test.ts` passando **sem nenhuma edição**. Se um teste de lá precisar mudar, pare e reporte.
- **Não se altera `varrerConsistencia`**, nem o filtro de termos de 1 caractere, nem `analisarEstilo`.
- **Nenhum backfill da espécie.** `NULL` = nunca classificado, e se comporta como `identidade`. Classificar 116 termos por heurística (minúscula → lexical) é chute, e chute em massa gera o falso positivo que treina o revisor a ignorar a tela.
- **`especie` é enum fechado** (`'identidade' | 'lexical'`), nunca `CategoriaGlossario`, que é string livre.
- **`termo_pai_id` não é `principal_id`.** Pai = pertencimento (`西堡` dentro de `金鹏堡`); principal = variante do mesmo referente (`芊芊` = `林芊`). Um termo pode ter os dois.
- **O pai entra no prompt um nível acima, nunca a raiz**, e uma vez só quando dois filhos o compartilham.
- **Nada de IA nesta entrega.** Nenhuma chamada paga nova, nenhum texto de prompt de tradução cortado como versão nova de Alfa.
- Comentários e mensagens de commit em português, no tom do código existente: explicam **por que**, não o quê.
- **NUNCA use `git add -A` nem `git add .`** — liste os arquivos um a um, e confira `git status --short` antes e depois de cada commit.

---

### Task 1: As regras de flexão viram fonte única, e o grifo passa a usá-las

O grifo do editor tem casamento literal: "Assassinos" e "sabres" não são marcados, e "Dois Homens de Sabre" marca só "Sabre" — apontando para a entrada errada do glossário.

**Files:**
- Create: `shared/src/flexaoTermo.ts`
- Modify: `shared/src/index.ts` (reexport)
- Modify: `server/src/traducao/flexao.ts` (passa a consumir shared; **a assinatura pública não muda**)
- Modify: `web/src/componentes/TextoRico.tsx:13-30` (`montarMarcadorGlossario`)
- Test: `server/src/db/flexaoTermo.test.ts` (novo), `web/src/componentes/marcador.test.ts` (novo)
- **Não editar:** `server/src/traducao/flexao.test.ts` — ele é a prova de que nada mudou.

**Interfaces:**
- Consumes: nada.
- Produces: `padraoDeTermo(termoPt: string): string | null` e `ELO_CONECTORES`, exportados por `@dao-tale/shared`.

- [ ] **Step 1: Escreva o teste do padrão compartilhado**

Crie `server/src/db/flexaoTermo.test.ts` (código de `shared/` é testado a partir de `server/src/db/`, padrão do projeto):

```ts
import { describe, expect, it } from 'vitest';
import { padraoDeTermo } from '@dao-tale/shared';

/** Ajuda: o padrão casa este texto? Mesma normalização das duas pontas. */
const casa = (texto: string, termo: string): boolean => {
  const p = padraoDeTermo(termo);
  if (!p) return false;
  const normalizar = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return new RegExp(`\\b${p}`, 'u').test(normalizar(texto));
};

describe('padraoDeTermo', () => {
  it('casa o plural simples', () => {
    expect(casa('os assassinos atacaram', 'Assassino')).toBe(true);
    expect(casa('dois sabres', 'sabre')).toBe(true);
  });

  it('casa a variação de gênero pelo radical', () => {
    expect(casa('as senhoras chegaram', 'Senhor')).toBe(true);
    expect(casa('os senhores chegaram', 'Senhor')).toBe(true);
  });

  it('casa o termo composto com o plural na primeira palavra', () => {
    expect(casa('dois Homens de Sabre entraram', 'Homem de Sabre')).toBe(true);
  });

  it('aceita variação de conector dentro do termo', () => {
    expect(casa('a Fortaleza de Peng caiu', 'Fortaleza do Peng')).toBe(true);
  });

  it('palavra curta não invade palavra maior', () => {
    // A regra de duas faixas: com <= 4 letras só o plural simples é aceito,
    // senão "rei" grifaria dentro de "reino" e o revisor veria marca no lugar
    // errado — pior que marca nenhuma.
    expect(casa('o reino caiu', 'rei')).toBe(false);
    expect(casa('os reis caíram', 'rei')).toBe(true);
  });

  it('termo vazio ou só de conectores não vira padrão', () => {
    expect(padraoDeTermo('')).toBeNull();
    expect(padraoDeTermo('de do da')).toBeNull();
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -w server -- flexaoTermo`
Expected: FAIL — `padraoDeTermo` não é exportado.

- [ ] **Step 3: Extraia as regras para `shared/`**

Crie `shared/src/flexaoTermo.ts` **transcrevendo** a lógica que hoje está em
`server/src/traducao/flexao.ts` — não reescreva, mova:

```ts
// Regras de flexão de um termo do glossário, em UM lugar só.
//
// Havia dois casadores para a mesma pergunta: `contemTermoFlexionado` (varredura
// de consistência, no servidor) e o regex do grifo do editor (no web). Só o
// primeiro sabia flexão, então "Assassinos" não era grifado e "Dois Homens de
// Sabre" grifava só "Sabre" — apontando para OUTRA entrada do glossário, que é
// pior que não grifar. Duas cópias da mesma regra divergem em silêncio; esta é a
// fonte, e as duas pontas a consomem.
//
// Não vale implementar as regras de plural do português (-l → -is, -ão → -ões…):
// o radical resolve todas de uma vez, e isto é um detector de aviso, não um
// analisador morfológico.

const escapar = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Conectores não fazem parte da identidade do termo: "Fortaleza do Peng" e
 *  "Fortaleza de Peng" são o mesmo nome. */
const CONECTORES = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'a', 'o', 'as', 'os', 'ao', 'aos']);

/** O elo entre duas palavras do termo: espaço, podendo levar conectores. */
export const ELO_CONECTORES = '\\s+(?:(?:de|do|da|dos|das|e|ao|aos|[aeo]s?)\\s+)*';

/** Palavra curta exige forma quase exata (só plural simples); palavra longa
 *  aceita variação no fim, que é onde o português flexiona. "rei" casa com
 *  "reis"; "incomparavel" casa com "incomparaveis" pelo radical.
 *  A fronteira final é obrigatória: sem ela, "rei" casaria dentro de "reino". */
function padraoDaPalavra(palavra: string): string {
  const p = escapar(palavra);
  if (palavra.length <= 4) return `${p}(?:e?s)?\\b`;
  return `${escapar(palavra.slice(0, -1))}\\p{L}{0,3}\\b`;
}

/** O corpo do padrão que reconhece o termo flexionado, SEM âncoras e SEM flags —
 *  quem chama decide as duas coisas, porque a varredura testa uma frase por vez
 *  e o grifo precisa de alternância global com captura.
 *
 *  Espera o termo JÁ NORMALIZADO por quem chama (sem acento, minúsculo). `null`
 *  quando não sobra palavra nenhuma além de conectores. */
export function padraoDeTermo(termoPt: string): string | null {
  const alvo = termoPt
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
  if (!alvo) return null;
  const palavras = alvo.split(/\s+/).filter(Boolean).filter((p) => !CONECTORES.has(p));
  if (palavras.length === 0) return null;
  return palavras.map(padraoDaPalavra).join(ELO_CONECTORES);
}
```

- [ ] **Step 4: Reexporte e rode**

Em `shared/src/index.ts`, junto das outras reexportações:

```ts
export * from './flexaoTermo.js';
```

Run: `npm test -w server -- flexaoTermo`
Expected: PASS, 6 testes.

- [ ] **Step 5: `flexao.ts` passa a consumir a fonte única**

Reescreva o corpo de `contemTermoFlexionado` para usar `padraoDeTermo`, **sem mudar a
assinatura nem o comportamento**:

```ts
import { padraoDeTermo } from '@dao-tale/shared';

const normalizar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

/** O termo aparece na tradução, aceitando plural e variação de conector?
 *
 *  As REGRAS moram em `shared/src/flexaoTermo.ts` desde que o grifo do editor
 *  passou a precisar delas — aqui fica só a pergunta que a varredura faz. */
export function contemTermoFlexionado(textoPt: string, termoPt: string): boolean {
  const alvo = normalizar(termoPt);
  if (!alvo) return true;
  const padrao = padraoDeTermo(termoPt);
  if (!padrao) return false;
  return new RegExp(`\\b${padrao}`, 'u').test(normalizar(textoPt));
}
```

- [ ] **Step 6: Prove que nada mudou na varredura**

Run: `npm test -w server -- flexao consistencia`
Expected: PASS, **sem editar nenhum teste**. Se algum falhar, o comportamento mudou —
pare e reporte em vez de ajustar o teste.

- [ ] **Step 7: Escreva o teste do grifo**

Crie `web/src/componentes/marcador.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { montarMarcadorGlossario } from './TextoRico';

const entrada = (id: number, termo_zh: string, termo_pt: string) =>
  ({ id, obra_id: 1, termo_zh, termo_pt, categoria: 'outro', nota: null,
     origem: 'manual', principal_id: null, criado_em: '' }) as never;

const GLOSSARIO = [
  entrada(1, '杀手', 'Assassino'),
  entrada(2, '刀手', 'Homem de Sabre'),
  entrada(3, '刀', 'sabre'),
  entrada(4, '主子', 'senhor'),
];

/** Os trechos que o grifo marcaria no texto. */
function grifados(texto: string): string[] {
  const m = montarMarcadorGlossario(GLOSSARIO)!;
  return [...texto.matchAll(m.regexPt!)].map((x) => x[1]);
}

describe('grifo do glossário', () => {
  it('grifa o plural — era o buraco do relato', () => {
    expect(grifados('Os Assassinos atacaram.')).toEqual(['Assassinos']);
    expect(grifados('dois sabres')).toEqual(['sabres']);
  });

  it('grifa a variação de gênero', () => {
    expect(grifados('as Senhoras chegaram.')).toEqual(['Senhoras']);
  });

  it('a caixa continua indiferente', () => {
    expect(grifados('O assassino sorriu.')).toEqual(['assassino']);
  });

  it('o termo composto vence o termo contido nele', () => {
    // Hoje "Dois Homens de Sabre" grifa só "Sabre" e a glosa aponta para 刀 —
    // a entrada ERRADA. Este é o caso que prova que afrouxar a fronteira não
    // basta: o composto precisa ganhar do contido.
    expect(grifados('Dois Homens de Sabre entraram.')).toEqual(['Homens de Sabre']);
  });

  it('palavra curta não invade palavra maior', () => {
    const m = montarMarcadorGlossario([entrada(5, '王', 'rei')])!;
    expect([...'o reino caiu'.matchAll(m.regexPt!)]).toHaveLength(0);
    expect([...'os reis caíram'.matchAll(m.regexPt!)].map((x) => x[1])).toEqual(['reis']);
  });

  it('a glosa do trecho flexionado ainda encontra a entrada', () => {
    // A glosa é indexada pelo termo canônico; com o trecho flexionado o
    // `Map.get` direto falha, e o revisor vê grifo sem explicação no title.
    const m = montarMarcadorGlossario(GLOSSARIO)!;
    expect(m.glosaDoTrecho('Assassinos')).toContain('杀手');
  });
});
```

- [ ] **Step 8: Rode e veja falhar**

Run: `npm test -w web -- marcador`
Expected: FAIL — plural não grifado, composto perdendo para o contido, e
`glosaDoTrecho` inexistente.

- [ ] **Step 9: Reescreva `montarMarcadorGlossario`**

Em `web/src/componentes/TextoRico.tsx`, troque a montagem do `regexPt` e acrescente a
busca de glosa por trecho flexionado:

```ts
import { padraoDeTermo, partirInline, type EntradaGlossario } from '@dao-tale/shared';

export interface MarcadorGlossario {
  regexZh: RegExp | null;
  regexPt: RegExp | null;
  glosaZh: Map<string, string>;
  /** A glosa de um trecho JÁ FLEXIONADO ("Assassinos" → a entrada de 杀手).
   *  `Map.get` direto não serve: a chave é o termo canônico e o texto traz a
   *  forma flexionada, então o grifo apareceria sem explicação no title. */
  glosaDoTrecho: (trecho: string) => string | undefined;
}

export function montarMarcadorGlossario(entradas: EntradaGlossario[] | undefined): MarcadorGlossario | null {
  if (!entradas || entradas.length === 0) return null;
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Termos maiores primeiro, para o composto vencer o termo contido — 人级 antes
  // de 人, e "Homem de Sabre" antes de "sabre". A alternância do regex resolve na
  // ORDEM, então esta ordenação é o que impede o grifo de apontar para a entrada
  // errada dentro de um termo composto.
  const zh = entradas
    .filter((e) => e.termo_zh.trim().length >= 2) // 1 caractere é ambíguo demais (mesma regra da consistência)
    .sort((a, b) => b.termo_zh.length - a.termo_zh.length);
  const pt = entradas
    .filter((e) => e.termo_pt.trim().length >= 3)
    .sort((a, b) => b.termo_pt.length - a.termo_pt.length);

  // Um padrão flexionado por termo, na mesma ordem. `padraoDeTermo` é a fonte
  // única compartilhada com a varredura de consistência (shared/flexaoTermo.ts).
  const padroes = pt.map((e) => ({ entrada: e, padrao: padraoDeTermo(e.termo_pt) })).filter((x) => x.padrao);

  const normalizar = (t: string) =>
    t
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();

  return {
    regexZh: zh.length ? new RegExp(`(${zh.map((e) => escapar(e.termo_zh)).join('|')})`, 'gu') : null,
    // Sem a fronteira à direita: ela é o que barrava "Assassinos". O próprio
    // `padraoDeTermo` já termina em `\b` em cada palavra, então a fronteira
    // continua garantida — só passou a vir DEPOIS da flexão, não antes.
    regexPt: padroes.length
      ? new RegExp(`(?<![\\p{L}\\p{M}])(${padroes.map((x) => x.padrao).join('|')})`, 'giu')
      : null,
    glosaZh: new Map(zh.map((e) => [e.termo_zh, `${e.termo_zh} → ${e.termo_pt}`])),
    glosaDoTrecho: (trecho: string) => {
      const t = normalizar(trecho);
      const achado = padroes.find((x) => new RegExp(`^${x.padrao}$`, 'u').test(t));
      return achado ? `${achado.entrada.termo_zh} → ${achado.entrada.termo_pt}` : undefined;
    },
  };
}
```

**Atenção ao acento:** o texto exibido tem acento e o padrão é normalizado sem acento.
Se o teste de "reis caíram" falhar por causa disso, a correção é normalizar o texto antes
de casar e mapear os índices de volta — **não** é tirar a normalização do padrão. Se essa
volta ficar complicada, pare e reporte em vez de improvisar.

- [ ] **Step 10: Ajuste os chamadores da glosa**

`marcarTermos` e `TextoMarcadoZh` usavam `marcador.glosaPt.get(...)`. Troque pela
`glosaDoTrecho`. Run: `npm run typecheck -w web` até limpar.

- [ ] **Step 11: Rode tudo**

Run: `npm test -w web && npm test -w server && npm run typecheck && npm run build -w web`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add shared/src/flexaoTermo.ts shared/src/index.ts server/src/traducao/flexao.ts \
        server/src/db/flexaoTermo.test.ts web/src/componentes/TextoRico.tsx \
        web/src/componentes/marcador.test.ts
git commit -m "O grifo do glossário passa a saber flexão, da mesma fonte que a varredura"
```

---

### Task 2: A migração e a espécie no domínio

**Files:**
- Create: `server/src/db/migrations/026_glossario_especie.sql`
- Modify: `shared/src/index.ts` (`EspecieTermo`, `EntradaGlossario`)
- Modify: `server/src/db/repos.ts` (`reposGlossario.criar` e `atualizar`, e o SELECT que monta a entrada)
- Modify: `server/src/rotas/curadoria.ts:17-27` (schemas)
- Test: `server/src/db/glossarioEspecie.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `EspecieTermo`, e `EntradaGlossario` com `especie: EspecieTermo | null`, `nota_uso: string | null`, `termo_pai_id: number | null`.

- [ ] **Step 1: Escreva o teste**

Crie `server/src/db/glossarioEspecie.test.ts` com estes casos, usando `abrirBanco(':memory:')`
e `reposGlossario` (siga o formato de `server/src/db/repos.test.ts`):

1. termo criado sem `especie` fica com `null` — nunca classificado, e é o estado dos 116 existentes;
2. `especie: 'lexical'` é gravada e volta na leitura;
3. `atualizar` muda a espécie sem tocar nos outros campos;
4. `nota_uso` e `termo_pai_id` sobrevivem ao ciclo criar → ler;
5. `termo_pai_id` apontando para termo apagado não quebra a leitura (a coluna é `REFERENCES` sem `ON DELETE CASCADE`; confirme o que o banco faz e **descreva o comportamento real no teste**, não o desejado);
6. espécie inválida (`'qualquer'`) é recusada pelo schema da rota com 400.

Escreva-os de verdade, com asserções que falhem sem o código desta task.

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -w server -- glossarioEspecie`
Expected: FAIL.

- [ ] **Step 3: Escreva a migração**

Crie `server/src/db/migrations/026_glossario_especie.sql`:

```sql
-- Espécie do termo, nota de caixa e pertencimento (spec 2026-08-16).
--
-- O glossário guardava duas coisas diferentes sob a mesma lei: nome próprio,
-- onde a FORMA é a resposta (金鹏堡 → Fortaleza do Peng Dourado), e escolha
-- lexical, onde a PALAVRA é a resposta e a forma tem de flexionar livremente
-- (刀 → sabre). Medido na obra 1: 杀手 saiu 57× em minúscula e 25× em maiúscula,
-- porque nada dizia quando ele é o posto da Fortaleza e quando é substantivo
-- comum.
--
-- `especie` é ANULÁVEL de propósito, e não NOT NULL DEFAULT 'identidade': o NULL
-- distingue "nunca classificado" de "classificado como identidade", e é isso que
-- permite a tela pedir a classificação dos 116 termos antigos sem incomodar quem
-- já respondeu. Sem backfill por heurística — os 41 termos em minúscula são
-- convenção do revisor, não dado, e chutar 116 vezes gera o falso positivo que
-- treina a ignorar a tela.
--
-- `termo_pai_id` é PERTENCIMENTO (西堡 fica dentro de 金鹏堡), distinto de
-- `principal_id`, que já existe e diz variante do MESMO referente (芊芊 = 林芊).
-- Um termo pode ter os dois.
ALTER TABLE glossario ADD COLUMN especie TEXT;
ALTER TABLE glossario ADD COLUMN nota_uso TEXT;
ALTER TABLE glossario ADD COLUMN ambiguo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE glossario ADD COLUMN termo_pai_id INTEGER REFERENCES glossario(id);
```

- [ ] **Step 4: Estenda o domínio**

Em `shared/src/index.ts`, antes de `EntradaGlossario`:

```ts
/** Que tipo de lei o termo tem.
 *
 *  `identidade` — a FORMA é a resposta, maiúsculas inclusive (金鹏堡 → Fortaleza
 *  do Peng Dourado). `lexical` — a PALAVRA é a resposta e a forma flexiona à
 *  vontade (刀 → sabre; "sabres" e "Sabre" são o mesmo acerto).
 *
 *  Enum fechado, e não `CategoriaGlossario` (que é string livre), porque o prompt
 *  ramifica nele: categoria livre viraria `Identidade`, `identidade `, `id`. */
export type EspecieTermo = 'identidade' | 'lexical';
export const ESPECIES_TERMO: readonly EspecieTermo[] = ['identidade', 'lexical'];
```

E dentro de `EntradaGlossario`:

```ts
  /** `null` = nunca classificado; comporta-se como `identidade`, que é o
   *  comportamento anterior a esta coluna existir. */
  especie: EspecieTermo | null;
  /** A regra daquele termo em uma frase — quando capitalizar, ou quando o
   *  gatilho chinês NÃO é este termo. Entregue na linha dele, no prompt. */
  nota_uso: string | null;
  /** O gatilho chinês nem sempre é este termo: 小心 é "cuidado" e também a criada
   *  Xiao Xin — medido, 7 de 8 ocorrências não são a personagem. Tira o termo da
   *  varredura direta, que erraria a maioria das vezes. */
  ambiguo: boolean;
  /** O termo do qual este faz parte. NÃO é `principal_id`: pai é pertencimento
   *  (西堡 dentro de 金鹏堡), principal é variante do mesmo referente. */
  termo_pai_id: number | null;
```

- [ ] **Step 5: Estenda o repositório e a rota**

Em `reposGlossario.criar` e `atualizar` (`server/src/db/repos.ts`, por volta da linha 911),
inclua as três colunas no INSERT/UPDATE e no mapeamento de leitura. Em
`server/src/rotas/curadoria.ts`, acrescente aos dois schemas:

```ts
  especie: z.enum(['identidade', 'lexical']).optional(),
  nota_uso: z.string().trim().max(200).optional(),
  ambiguo: z.boolean().optional(),
  termo_pai_id: z.number().int().positive().nullable().optional(),
```

- [ ] **Step 6: Rode e veja passar**

Run: `npm test -w server && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/db/migrations/026_glossario_especie.sql shared/src/index.ts \
        server/src/db/repos.ts server/src/rotas/curadoria.ts server/src/db/glossarioEspecie.test.ts
git commit -m "Migração 026: a espécie do termo, a nota de caixa e o pertencimento"
```

---

### Task 3: O prompt passa a dizer coisas opostas para cada espécie

**Files:**
- Modify: `server/src/ia/prompts.ts:16-31` (`formatarGlossario`)
- Test: `server/src/ia/glossarioNoPrompt.test.ts`

**Interfaces:**
- Consumes: `EspecieTermo` e os campos novos de `EntradaGlossario` (Task 2).
- Produces: nada.

**Contexto:** `formatarGlossario` hoje devolve uma lista só, e o cabeçalho que a envolve diz
"uso obrigatório e consistente" para tudo. Os dois blocos entram **dentro** do valor que a
função devolve; os cabeçalhos que já existem em `sistemaTraducao` não mudam de lugar.

- [ ] **Step 1: Escreva os testes**

Crie `server/src/ia/glossarioNoPrompt.test.ts` cobrindo:

1. **Padrão preserva**: só termos com `especie: null` → a saída é idêntica à de hoje (sem cabeçalho de bloco nenhum). Fixe a string esperada, não só "não contém".
2. **Dois blocos**: um termo de cada espécie → dois cabeçalhos, cada termo sob o seu.
3. **Instrução oposta**: o bloco lexical manda flexionar número, gênero e caixa; o de identidade manda usar a forma exata. Asserte pelo conteúdo da instrução.
4. **`nota_uso` na linha do termo**: sai junto daquele termo, e um termo sem nota não emite linha vazia.
4b. **A nota não impõe tradução ao sentido comum**: o texto da nota é emitido literalmente,
   e o campo é livre — então este teste é sobre a INSTRUÇÃO do bloco, que precisa dizer ao
   modelo que a nota delimita quando o termo se aplica, sem prescrever o resto. Fixe a
   frase da instrução. (O porquê: "senão é 'cuidado'" fixaria uma palavra para o sentido
   comum e viraria glossário clandestino — ver spec §2b.)
5. **`nota_uso` em `identidade` é ignorada**: gravada ali, não é emitida.
6. **Variante continua funcionando**: `principal_id` segue rendendo "· variante de X", em qualquer das duas espécies.

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -w server -- glossarioNoPrompt`
Expected: FAIL.

- [ ] **Step 3: Implemente**

Reescreva `formatarGlossario` mantendo a montagem da linha (incluindo o trecho de variante,
que não muda) e agrupando por espécie. Quando **todos** os termos forem `identidade`/`null`,
devolva a lista sem cabeçalho — é o que mantém o teste 1 verde e o prompt idêntico para
quem ainda não classificou nada.

Textos dos blocos:

```
### Nomes e termos fixos (use exatamente esta forma, maiúsculas inclusive)
### Escolhas de palavra (use esta palavra; flexione número, gênero e caixa como o português pedir)
```

- [ ] **Step 4: Rode e veja passar**

Run: `npm test -w server -- glossarioNoPrompt && npm test -w server`
Expected: PASS. Se algum teste de prompt existente quebrar por causa do formato, confira se
ele fixava a lista antiga — nesse caso o teste está certo e o seu agrupamento está errado
para o caso "ninguém classificou".

- [ ] **Step 5: Commit**

```bash
git add server/src/ia/prompts.ts server/src/ia/glossarioNoPrompt.test.ts
git commit -m "O prompt separa nome fixo de escolha de palavra, e entrega a nota de caixa no ponto do uso"
```

---

### Task 4: O filtro puxa o pai um nível acima

**Files:**
- Modify: `server/src/ia/prompts.ts:54-60` (`filtrarGlossarioRelevante`)
- Test: `server/src/ia/filtroPai.test.ts`

**Interfaces:**
- Consumes: `termo_pai_id` (Task 2).
- Produces: nada.

**Contexto:** hoje o filtro é `glossario.filter((e) => corpo.includes(e.termo_zh))` — só o
termo cujo chinês aparece literalmente. Um trecho que cita só `西堡` nunca recebe `金鹏堡`,
e o modelo não sabe que um está dentro do outro.

- [ ] **Step 1: Escreva os testes**

Crie `server/src/ia/filtroPai.test.ts`:

1. trecho com `西堡` (filho) devolve `西堡` **e** `金鹏堡`, mesmo o chinês do pai não estando no texto;
2. **um nível só**: numa cadeia neto → filho → avô, o avô não entra;
3. **sem duplicata**: dois filhos do mesmo pai trazem o pai uma vez;
4. o pai não entra duas vezes quando o chinês dele também aparece no texto;
5. `termo_pai_id` nulo ou apontando para id inexistente não quebra nem inventa entrada;
6. **ciclo** (A pai de B, B pai de A) não trava nem duplica;
7. a ordem dos termos presentes é preservada, com os pais acrescentados ao fim (fixe a
   ordem no teste — ela entra num prompt cacheável, e ordem instável quebra o cache).

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -w server -- filtroPai`
Expected: FAIL.

- [ ] **Step 3: Implemente**

```ts
export function filtrarGlossarioRelevante(
  glossario: EntradaGlossario[],
  textos: (string | undefined | null)[],
): EntradaGlossario[] {
  const corpo = textos.filter(Boolean).join('\n');
  const presentes = glossario.filter((e) => corpo.includes(e.termo_zh));

  // O pai entra mesmo sem o chinês dele no trecho — é a única exceção à regra de
  // "só o que está no texto", e a razão de a coluna existir: sem 金鹏堡 ao lado,
  // um trecho que diz só 西堡 não informa que um fica dentro do outro.
  //
  // UM nível, nunca a raiz: dois níveis entregariam a obra inteira num trecho com
  // topônimo aninhado, e o filtro existe para encolher o prompt.
  const porId = new Map(glossario.map((e) => [e.id, e]));
  const escolhidos = new Map(presentes.map((e) => [e.id, e]));
  for (const e of presentes) {
    if (e.termo_pai_id == null) continue;
    const pai = porId.get(e.termo_pai_id);
    if (pai && !escolhidos.has(pai.id)) escolhidos.set(pai.id, pai);
  }
  return [...escolhidos.values()];
}
```

- [ ] **Step 4: Rode e veja passar**

Run: `npm test -w server -- filtroPai && npm test -w server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/ia/prompts.ts server/src/ia/filtroPai.test.ts
git commit -m "O filtro do glossário leva o termo pai junto, um nível acima"
```

---

### Task 5: A tela do glossário pede a classificação

**Files:**
- Modify: `web/src/paginas/Glossario.tsx`
- Test: `web/src/util/glossario.test.ts` (novo, para a função pura de contagem)

**Interfaces:**
- Consumes: `EspecieTermo`, `ESPECIES_TERMO` (Task 2).
- Produces: nada.

- [ ] **Step 1: Escreva o teste da contagem**

Crie `web/src/util/glossario.ts` com `contarNaoClassificados(entradas)` e teste-o:
termos com `especie: null` contam; `'identidade'` e `'lexical'` não; lista vazia dá zero.
Função pura e testada porque é o número que faz a classificação acontecer — se ele mentir,
o revisor para de olhar.

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -w web -- glossario`
Expected: FAIL.

- [ ] **Step 3: Implemente a tela**

- Seletor de espécie na linha do termo (identidade / escolha de palavra), com o texto curto
  explicando cada um.
- Campo `nota_uso`, visível **só** quando a espécie é `lexical`.
- Campo de termo pai, escolhendo entre os termos da obra (com "nenhum").
- No topo: *"N termos ainda sem classificação"*, com filtro para mostrar só eles.

Use os tokens do projeto (`docs/tokens-css.md`), imitando as telas vizinhas. **Nada de cor
hardcoded.**

- [ ] **Step 4: Rode e veja passar**

Run: `npm test -w web && npm run typecheck -w web && npm run build -w web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/util/glossario.ts web/src/util/glossario.test.ts web/src/paginas/Glossario.tsx
git commit -m "A tela do glossário pede a espécie, e mostra quantos termos ainda não têm"
```

---

### Task 6: Capturar um termo pela seleção no editor

**Files:**
- Modify: `web/src/paginas/EditorCapitulo.tsx`
- Create: `web/src/componentes/CapturaTermo.tsx`
- Test: `web/src/util/captura.test.ts`

**Interfaces:**
- Consumes: `ESPECIES_TERMO` (Task 2); `POST /obras/:obraId/glossario`, que já existe e já
  devolve 409 para duplicado.
- Produces: nada.

**Contexto:** o editor já tem o padrão da barra flutuante que aparece depois de uma correção
manual e oferece propagar a troca (`EditorCapitulo.tsx:1494`). A captura usa a mesma forma.

- [ ] **Step 1: Escreva o teste da função pura**

Crie `web/src/util/captura.ts` com:

```ts
/** O que a seleção do revisor produz, antes de virar termo. */
export interface Captura {
  lado: 'zh' | 'pt';
  trecho: string;
}

/** A seleção vira captura, ou `null` quando não serve.
 *
 *  Rejeita seleção vazia ou só de espaço, e trecho longo demais para ser termo
 *  (o revisor selecionou a frase inteira sem querer) — criar entrada de 200
 *  caracteres suja o glossário e o prompt de um jeito difícil de desfazer. */
export function capturaDaSelecao(lado: 'zh' | 'pt', bruto: string): Captura | null;
```

Testes: trecho normal vira captura com o texto aparado; vazio e só-espaço dão `null`;
trecho acima do teto dá `null`; o teto é fixado num número literal, não na constante.

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -w web -- captura`
Expected: FAIL.

- [ ] **Step 3: Implemente a captura e o painel**

- No editor, ao soltar uma seleção dentro do chinês ou do português da frase aberta, mostrar
  **Adicionar ao glossário**.
- O painel abre com o lado selecionado preenchido e **o outro campo vazio e com o foco** —
  o outro lado nunca é adivinhado (ver spec §3).
- Campos: `termo_zh`, `termo_pt`, categoria, **espécie** e `nota_uso` (esta só quando
  `lexical`).
- Salvar chama `POST /obras/:obraId/glossario`. No 409, o painel mostra o termo existente e
  oferece abri-lo, em vez de repetir o erro.
- Ao gravar, invalidar a query `['glossario', obraId]` — a prova de que pegou é o grifo
  aparecer no texto na hora.

- [ ] **Step 4: Rode tudo**

Run: `npm test -w web && npm test -w server && npm run typecheck && npm run build -w web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/util/captura.ts web/src/util/captura.test.ts \
        web/src/componentes/CapturaTermo.tsx web/src/paginas/EditorCapitulo.tsx
git commit -m "Cadastrar um termo direto da seleção, sem sair do texto"
```

---

### Task 7: O termo ambíguo sai da varredura direta, sem sair da tela

Medido na obra 1: `小心 → Xiao Xin [personagem]` aparece em 8 frases traduzidas e **só 1 é a
personagem**. As outras 7 são a expressão comum ("cuidado") e todas viram violação. Um
homógrafo transforma a varredura em ruído — e ruído é o que ensina o revisor a ignorar a
lista inteira.

**Files:**
- Create: `server/src/traducao/glossarioChecavel.ts`
- Modify: os **cinco** chamadores de `varrerConsistencia`: `server/src/db/repos.ts:552`,
  `server/src/rotas/capitulos.ts:398`, `server/src/rotas/obras.ts:244`,
  `server/src/traducao/checkpoint.ts:163`, `server/src/traducao/job.ts:413`
- Modify: `web/src/paginas/ConsistenciaObra.tsx` (a lista "confira caso a caso")
- Test: `server/src/traducao/glossarioChecavel.test.ts`
- **Não editar:** `server/src/traducao/consistencia.ts` nem a sua suíte.

**Interfaces:**
- Consumes: `ambiguo` (Task 2).
- Produces: `separarPorChecagem(glossario) => { checaveis, ambiguos }`.

- [ ] **Step 1: Escreva o teste**

Crie `server/src/traducao/glossarioChecavel.test.ts`:

1. glossário sem nenhum ambíguo devolve tudo em `checaveis` e `ambiguos` vazio — é o
   comportamento de hoje, e tem de sobreviver;
2. um termo `ambiguo` sai de `checaveis` e entra em `ambiguos`;
3. a ordem relativa é preservada nas duas listas (elas alimentam prompt e tela);
4. `ambiguo` não interfere em `especie` nem em `principal_id` — um termo pode ser ambíguo e
   lexical, ambíguo e variante.

- [ ] **Step 2: Rode e veja falhar**

Run: `npm test -w server -- glossarioChecavel`
Expected: FAIL.

- [ ] **Step 3: Implemente a separação**

```ts
import type { EntradaGlossario } from '@dao-tale/shared';

/** Separa o que a varredura de consistência PODE checar do que ela erraria.
 *
 *  A varredura pergunta "o chinês tem o termo, logo o português tem o canônico?".
 *  Para um homógrafo essa pergunta está errada na maioria das vezes: 小心 é
 *  "cuidado" em 7 das 8 ocorrências da obra 1, e a criada Xiao Xin em 1.
 *
 *  A separação é aqui, no chamador, e NÃO dentro de `varrerConsistencia`: aquela
 *  função é pura e usada por cinco pontos, e mexer nela para acomodar um caso de
 *  glossário misturaria duas responsabilidades. */
export function separarPorChecagem(glossario: EntradaGlossario[]): {
  checaveis: EntradaGlossario[];
  ambiguos: EntradaGlossario[];
} {
  return {
    checaveis: glossario.filter((e) => !e.ambiguo),
    ambiguos: glossario.filter((e) => e.ambiguo),
  };
}
```

- [ ] **Step 4: Ligue nos cinco chamadores**

Em cada um dos cinco pontos listados acima, passe `separarPorChecagem(glossario).checaveis`
no lugar de `glossario`. **Confira os cinco** — deixar um de fora faz a contagem da tela
divergir da contagem do capítulo, e a divergência é silenciosa.

- [ ] **Step 5: Prove que pegou todos**

Run: `grep -rn "varrerConsistencia(" server/src | grep -v "\.test\.ts"`
Expected: nenhum dos cinco passa o glossário cru. Rode `npm test -w server` — a suíte de
`consistencia.test.ts` tem de passar **sem edição**.

- [ ] **Step 6: A lista "confira caso a caso" na tela**

Em `ConsistenciaObra.tsx`, um bloco separado ao fim, fora da contagem de violações: os
termos ambíguos com as frases em que o gatilho chinês aparece, rotulado *"Termo ambíguo —
confira caso a caso"* e explicando por quê. Tokens do projeto, nada hardcoded.

Silenciar de vez seria trocar ruído por cegueira: o revisor precisa poder conferir se
escreveu o nome certo quando ele É o nome.

- [ ] **Step 7: Commit**

```bash
git add server/src/traducao/glossarioChecavel.ts server/src/traducao/glossarioChecavel.test.ts \
        server/src/db/repos.ts server/src/rotas/capitulos.ts server/src/rotas/obras.ts \
        server/src/traducao/checkpoint.ts server/src/traducao/job.ts \
        web/src/paginas/ConsistenciaObra.tsx
git commit -m "Termo ambíguo sai da varredura direta: 小心 é cuidado em 7 de 8 ocorrências"
```

---

## Self-Review

**Cobertura do spec:**

| Seção do spec | Task |
|---|---|
| §1 grifo com casamento literal | 1 |
| §2 `especie`, campo próprio | 2 e 3 |
| §2 dois blocos no prompt | 3 |
| §2 `nota_uso` no ponto do uso | 3 |
| §3 captura pela seleção | 6 |
| §4 `termo_pai_id` no filtro | 2 e 4 |
| §5 migração sem backfill | 2 |
| §6 testes 1–16 | 3 (1–5), 4 (6–10), 6 (11–12), 1 (13–16) |
| §7 risco "classificação nunca acontece" | 5 (contador) e 6 (pergunta na criação) |
| §2b termo ambíguo e `nota_uso` | 2, 3 e 7 |

**Consistência de tipos:** `EspecieTermo` e `ESPECIES_TERMO` nascem na Task 2 e são
consumidos nas 3, 5 e 6. `padraoDeTermo` nasce na Task 1 e é consumido por `flexao.ts` e
pelo grifo. `MarcadorGlossario` troca `glosaPt: Map` por `glosaDoTrecho: (s) => string |
undefined` na Task 1 — os dois chamadores estão listados no Step 10 da mesma task.

**Risco de ordem:** a Task 1 é independente e entrega valor visível sozinha — pode ir
primeiro e ser deployada antes do resto. As Tasks 3, 4, 5, 6 e 7 dependem da 2. A Task 7
pode vir logo depois da 2 (não depende das outras) e é a que apaga o incômodo imediato do
`小心`; está por último só para as tasks de prompt não colidirem com ela em `repos.ts`.

**Ponto de atenção para quem executar a Task 1:** o casamento por radical é feito sobre
texto normalizado (sem acento), mas o grifo precisa marcar o texto ORIGINAL. Se os índices
não baterem, a instrução do Step 9 é reportar, não improvisar — errar isso desloca o grifo e
é pior que o defeito atual.
