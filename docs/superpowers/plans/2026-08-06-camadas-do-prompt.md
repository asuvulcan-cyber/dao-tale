# Camadas do prompt — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para executar tarefa a tarefa. Os passos
> usam caixas (`- [ ]`) para acompanhamento.

**Objetivo:** fazer a partição por tema das três camadas de prompt (Alfa/Beta/Delta) ser
verificável — avisando o dono sempre que duas camadas falarem do mesmo tema — e consertar
o conflito de precedência que hoje deixa uma chave de Beta derrubar o glossário.

**Arquitetura:** um registro de temas em `shared/` (tema → camada dona → padrão de
reconhecimento) vira a única fonte de verdade. Três consumidores o leem: a rota que salva
o Delta, a rota que cria um Alfa, e um relatório sobre o Ômega. Todos **avisam**, nenhum
bloqueia. O conserto da precedência é anterior e independente: dois cabeçalhos gerados em
tempo de composição.

**Stack:** TypeScript, workspaces npm (`shared`/`server`/`web`), Hono, better-sqlite3,
Vitest, React.

**Spec:** [`docs/superpowers/specs/2026-08-06-camadas-do-prompt-design.md`](../specs/2026-08-06-camadas-do-prompt-design.md)

## Restrições globais

- **Nunca bloquear.** Toda checagem é aviso. O dono é o dono e às vezes quer a exceção; o
  que não pode é a sobreposição acontecer sem ele ver.
- **Não renomear Delta.** `prompts.tipo = 'delta'` e o marcador `{{DELTA_OBRA}}` estão
  gravados dentro de versões de núcleo imutáveis. Intocáveis.
- **Não cortar versão nova de Alfa.** Versões são imutáveis; ativar é clique do dono.
- **Determinismo.** `comporOmega` é função pura: mesmas entradas ⇒ mesmos bytes. Nada de
  data, aleatoriedade, contador ou ordenação dependente de chave de objeto.
- **Vocabulário:** Alfa (universal), Beta (preferências), Delta (obra), Ômega (composto).
- **Testes:** `npm -w server run test` (Vitest). Tipos: `npm run typecheck`.
- **Idioma:** todo texto de código, comentário, commit e UI em pt-BR.
- Toda mensagem de aviso mostra o **trecho que casou**.

---

### Tarefa 1: Hierarquia do glossário nos cabeçalhos subordinados

Fecha o §4 do spec. Independe de todo o resto — pode ir sozinha para produção.

**Arquivos:**
- Modificar: `shared/src/preferenciasEstilo.ts:267` (cabeçalho de Beta)
- Modificar: `server/src/db/promptPadraoInicial.ts:38` (cabeçalho de Delta)
- Teste: `server/src/db/preferenciasEstilo.test.ts`

**Interfaces:**
- Consome: nada.
- Produz: nada de novo. Só muda o texto que os dois renderizadores emitem.

- [ ] **Passo 1: Escrever o teste que falha**

Em `server/src/db/preferenciasEstilo.test.ts`, dentro de `describe('composição com preferências')`:

```ts
it('os cabeçalhos de Beta e Delta se autolimitam: o glossário é lei acima deles', () => {
  const texto = comporPromptMae(NUCLEO_ENXUTO, 'Lin Feng fala em gírias.', PREFERENCIAS_PADRAO);
  const beta = texto.slice(texto.indexOf('## 5. PREFERÊNCIAS'), texto.indexOf('## 6. DIRETRIZES'));
  const delta = texto.slice(texto.indexOf('## 6. DIRETRIZES'));
  expect(beta).toContain('exceto o glossário, que é lei acima de todas as camadas');
  expect(delta).toContain('exceto o glossário, que é lei acima de todas as camadas');
});

it('a exceção não cita número de seção — o Alfa pode ser qualquer um', () => {
  const texto = comporPromptMae(NUCLEO_ENXUTO, 'Delta.', PREFERENCIAS_PADRAO);
  expect(texto).not.toContain('exceto o glossário (Seção');
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

Rodar: `npm -w server run test -- preferenciasEstilo`
Esperado: FALHA nos dois testes novos, com `expected … to contain 'exceto o glossário'`.

- [ ] **Passo 3: Corrigir o cabeçalho de Beta**

Em `shared/src/preferenciasEstilo.ts`, dentro de `renderizarPreferencias`, trocar a linha
do cabeçalho:

```ts
    '*(Convenções de casa desta obra. Quando conflitarem com as seções anteriores, valem estas — exceto o glossário, que é lei acima de todas as camadas.)*',
```

Acrescentar acima de `TITULO_SECAO_PREFERENCIAS` o comentário que explica o porquê:

```ts
// A ressalva do glossário nos cabeçalhos de Beta e Delta (doc 15 §6) conserta um
// conflito DECLARADO, não hipotético: o Alfa diz "o glossário é lei", e estes dois
// cabeçalhos se diziam superiores a "todas as seções anteriores" — o que inclui a do
// glossário. Com `nomes_proprios: mesclar` ("Pessoa: sempre em pinyin"), um nome de
// pessoa catalogado em forma traduzida punha as duas regras em guerra, e quem decidia
// era o modelo. Sem número de seção de propósito: a composição aceita Alfas arbitrários,
// e nada garante que o glossário seja a Seção 2 neles.
```

- [ ] **Passo 4: Corrigir o cabeçalho de Delta**

Em `server/src/db/promptPadraoInicial.ts`, dentro de `comporPromptMae`:

```ts
        '*(Regras desta seção têm precedência sobre as demais quando conflitarem — exceto o glossário, que é lei acima de todas as camadas.)*',
```

- [ ] **Passo 5: Rodar a suíte inteira**

Rodar: `npm -w server run test`
Esperado: PASSA. Testes que comparam bytes do Ômega podem falhar — se algum comparar com
uma string literal antiga, atualizar a expectativa (a mudança de bytes é o objetivo).
Rodar também `npm run typecheck`.

- [ ] **Passo 6: Commit**

```bash
git add shared/src/preferenciasEstilo.ts server/src/db/promptPadraoInicial.ts server/src/db/preferenciasEstilo.test.ts
git commit -m "O glossário volta a ser lei acima das três camadas"
```

---

### Tarefa 2: Vocabulário Ômega no código

Renomeia só o que é código. `{{DELTA_OBRA}}`, `prompts.tipo` e colunas de banco ficam
como estão. Vai antes do código novo para que ele nasça com o nome certo.

**Arquivos:**
- Modificar: `server/src/db/promptPadraoInicial.ts` (`comporPromptMae` → `comporOmega`)
- Modificar: `server/src/db/repos.ts` (tipo `PromptMae` → `VersaoDelta`, importação)
- Modificar: `shared/src/index.ts` (declaração do tipo `PromptMae`)
- Modificar: `server/src/ia/provedor.ts` (campo `promptMae` → `omega`, 5 ocorrências)
- Modificar: `server/src/ia/prompts.ts` (todos os `Pick<…, 'promptMae' …>` e `req.promptMae`)
- Modificar: `server/src/db/preferenciasEstilo.test.ts`, `server/src/db/promptCamadas.test.ts`
- Modificar: `server/scripts/medir-prompt.ts`, `server/scripts/medir-pipeline.ts`
- Verificar: `web/src/paginas/PromptMae.tsx` (nome de arquivo permanece; só o texto de tela)

**Interfaces:**
- Produz: `comporOmega(alfaConteudo: string, deltaConteudo: string, preferencias?: PreferenciasEstilo): string`
  — assinatura idêntica à de `comporPromptMae`, só o nome muda. Todas as tarefas
  seguintes usam este nome.
- Produz: tipo `VersaoDelta` — a linha versionada de `prompts` (Delta + Beta de uma obra).
- Produz: campo `omega: string` nas requisições de provedor.

- [ ] **Passo 1: Inventariar antes de mexer**

Rodar: `grep -rn "promptMae\|PromptMae\|comporPromptMae" --include="*.ts" --include="*.tsx" server shared web | wc -l`
Anotar o número. Ao final ele deve ser só o das ocorrências deliberadamente preservadas
(o arquivo `web/src/paginas/PromptMae.tsx` e comentários que citem o nome antigo ao
explicar a troca).

- [ ] **Passo 2: Renomear a função de composição**

Em `server/src/db/promptPadraoInicial.ts`, renomear `comporPromptMae` → `comporOmega` e
acrescentar acima dela:

```ts
/** Alfa (núcleo ativo) + Beta (preferências) + Delta (diretrizes da obra) → **Ômega**, o
    composto que vai para a IA. Determinístico: mesmas versões ⇒ mesmos bytes, que é
    pré-requisito do prompt caching. `preferencias` ausente = padrões do aplicativo.

    Ômega não é camada, é a soma — daí a última letra do alfabeto, que não cabe numa
    escala de especificidade. O nome antigo, "prompt mãe", significava DUAS coisas: esta
    string e a linha versionada de `prompts` (hoje `VersaoDelta`). */
```

- [ ] **Passo 3: Renomear o tipo e o campo**

Em `shared/src/index.ts` e `server/src/db/repos.ts`, `PromptMae` → `VersaoDelta`.
Em `server/src/ia/provedor.ts` e `server/src/ia/prompts.ts`, o campo `promptMae` → `omega`.

- [ ] **Passo 4: Rodar tipos e testes**

Rodar: `npm run typecheck && npm -w server run test`
Esperado: PASSA. O compilador é a rede de segurança desta tarefa — nenhum teste novo é
necessário, porque nenhum comportamento muda.

- [ ] **Passo 5: Commit**

```bash
git add -A
git commit -m "Ômega ganha nome próprio: 'prompt mãe' significava duas coisas"
```

---

### Tarefa 3: O registro de temas

Peça central. Uma tabela, duas leituras (§5.1 do spec).

**Arquivos:**
- Criar: `shared/src/temasDoPrompt.ts`
- Modificar: `shared/src/index.ts` (reexportar; reimplementar `preferenciaQueCobre`)
- Teste: `shared/src/temasDoPrompt.test.ts` — **criar**, e conferir que o Vitest do
  workspace `shared` roda (se não houver script `test` em `shared/package.json`, pôr o
  teste em `server/src/db/temasDoPrompt.test.ts`, que já é coberto)

**Interfaces:**
- Produz:
```ts
export type Camada = 'alfa' | 'beta' | 'delta';

export interface Tema {
  id: string;
  dono: Camada;
  titulo: string;
  resolucao: string;
  padrao: RegExp;
  filtravel: boolean;
}

export interface Ocorrencia {
  tema: Tema;
  linha: number;   // 1-indexado
  trecho: string;  // o texto que casou, com contexto ao redor
}

export const TEMAS: readonly Tema[];
export function temasNoTexto(texto: string): Ocorrencia[];
```
- Produz: `preferenciaQueCobre(rotulo: string): keyof PreferenciasEstilo | null` — mesma
  assinatura de hoje, agora lendo `TEMAS` e considerando só `filtravel: true`.

- [ ] **Passo 1: Escrever os testes que falham**

```ts
import { describe, expect, it } from 'vitest';
import { TEMAS, temasNoTexto, preferenciaQueCobre } from './temasDoPrompt.js';
import { PREFERENCIAS_PADRAO, renderizarPreferencias, type PreferenciasEstilo } from './preferenciasEstilo.js';

const com = (o: Partial<PreferenciasEstilo>) => ({ ...PREFERENCIAS_PADRAO, ...o });

describe('registro de temas', () => {
  it('cobre as 8 chaves de Beta — inclusive as duas que faltavam', () => {
    const deBeta = TEMAS.filter((t) => t.dono === 'beta').map((t) => t.id).sort();
    expect(deBeta).toEqual([
      'dialogo', 'mais_que_perfeito', 'nomes_proprios', 'notas_tradutor',
      'onomatopeia', 'pensamento_marca', 'pensamento_tempo', 'registro',
    ]);
  });

  it('cada tema tem um dono só', () => {
    expect(new Set(TEMAS.map((t) => t.id)).size).toBe(TEMAS.length);
  });

  it('acha tema de Beta em texto corrido, com o trecho junto', () => {
    const achados = temasNoTexto('Nesta obra o diálogo usa travessão, nunca aspas.');
    expect(achados.map((a) => a.tema.id)).toContain('dialogo');
    expect(achados[0].trecho).toContain('travessão');
    expect(achados[0].linha).toBe(1);
  });

  it('remissão entre camadas não é sobreposição', () => {
    expect(temasNoTexto('Traduzir ou transliterar é decidido na Seção 5 (Nomes próprios).')).toEqual([]);
  });

  it('as palavras soltas não bastam: o padrão mira a DECISÃO', () => {
    // regra de variação elegante — tema de Alfa, apesar de dizer "nome próprio"
    expect(temasNoTexto('Alterne apenas entre nome próprio, pronome e sujeito oculto.')).toEqual([]);
    // unidade de medida — tema de Alfa, apesar de dizer "transliterada"
    expect(temasNoTexto('Nunca deixe a unidade transliterada.')).toEqual([]);
  });
});

describe('preferenciaQueCobre — o filtro, mais conservador que o aviso', () => {
  it('mantém o que já filtrava', () => {
    expect(preferenciaQueCobre('5-mais-que-perfeito')).toBe('mais_que_perfeito');
    expect(preferenciaQueCobre('2-dialogo-aspas')).toBe('dialogo');
    expect(preferenciaQueCobre('5-registro')).toBe('registro');
    expect(preferenciaQueCobre('onomatopeia')).toBe('onomatopeia');
  });

  it('NÃO filtra nomes próprios: a política é de Beta, mas o nome específico é glossário', () => {
    expect(preferenciaQueCobre('3.2-nomes-proprios')).toBeNull();
    // ...e no entanto o AVISO enxerga o tema:
    expect(temasNoTexto('Nomes próprios: mantenha em pinyin.').map((a) => a.tema.id)).toContain('nomes_proprios');
  });

  it('não filtra tema de Alfa', () => {
    expect(preferenciaQueCobre('1-prosa-nao-legenda')).toBeNull();
    expect(preferenciaQueCobre('4-sem-decalque')).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

Rodar: `npm -w server run test -- temasDoPrompt`
Esperado: FALHA com "Cannot find module './temasDoPrompt.js'".

- [ ] **Passo 3: Escrever o registro**

Criar `shared/src/temasDoPrompt.ts`. Os padrões abaixo foram **medidos** contra o
`NUCLEO_ENXUTO` real em 2026-08-06: dão zero falso positivo nele e acendem em cada
variante de Beta. Não afrouxe nenhum sem repetir as duas medições.

```ts
// Registro de temas: quem é dono de quê (doc 15 §7).
//
// A regra que governa as três camadas é uma PARTIÇÃO POR TEMA — cada tema pertence a
// exatamente uma camada. Quando duas falam do mesmo tema, quem decide é o modelo, e a
// decisão muda a cada chamada. Esta tabela é o que torna a partição verificável.
//
// Os padrões miram a DECISÃO, não o vocabulário. `/nome próprio/` casaria com a regra de
// variação elegante do Alfa ("alterne entre nome próprio, pronome e sujeito oculto"), que
// não decide nada sobre transliteração. Medido: com padrões ingênuos o Alfa dava 3 falsos
// positivos, todos em `nomes_proprios`.

export type Camada = 'alfa' | 'beta' | 'delta';

export interface Tema {
  /** Para temas de Beta, é exatamente a chave de PreferenciasEstilo. */
  id: string;
  dono: Camada;
  titulo: string;
  /** Como o tema se resolve — entra na mensagem de aviso. */
  resolucao: string;
  padrao: RegExp;
  /** Entra no FILTRO de `preferenciaQueCobre`, que derruba candidatos em silêncio?
      `false` = só avisa. Ver o comentário de `nomes_proprios`. */
  filtravel: boolean;
}

export interface Ocorrencia {
  tema: Tema;
  linha: number;
  trecho: string;
}

/** Uma linha que ENTREGA o tema a outra camada não está decidindo nada — está fazendo a
    partição funcionar à vista. Um Alfa bem escrito deve poder dizer "isto se decide na
    Seção 5" sem gerar aviso. */
const REFERENCIA_ENTRE_CAMADAS =
  /decidid[oa] n[ao] Se[çc][ãa]o \d|ver (?:a )?Se[çc][ãa]o \d|Se[çc][ãa]o \d \(/i;

export const TEMAS: readonly Tema[] = [
  {
    id: 'dialogo',
    dono: 'beta',
    titulo: 'Diálogo',
    resolucao: 'resolve-se pela chave Diálogo (aspas ou travessão)',
    padrao: /travess[ãa]o|aspas duplas|aspas asi[áa]ticas|di[áa]logo|verbo de eloc|dicendi|「」/i,
    filtravel: true,
  },
  {
    id: 'pensamento_marca',
    dono: 'beta',
    titulo: 'Marcação do pensamento',
    resolucao: 'resolve-se pela chave Pensamento (itálico ou aspas)',
    padrao: /pensamento[^.\n]{0,40}(it[áa]lico|aspas)|(it[áa]lico|aspas)[^.\n]{0,40}pensamento|sentiendi/i,
    filtravel: true,
  },
  {
    id: 'pensamento_tempo',
    dono: 'beta',
    titulo: 'Tempo do pensamento',
    resolucao: 'resolve-se pela chave Tempo do pensamento (presente ou do original)',
    // `\*{0,2}` porque no Beta renderizado o "presente" vem em negrito markdown.
    padrao: /pensamento[^.\n]{0,60}(no \*{0,2}presente|tempo verbal)|(no \*{0,2}presente|tempo verbal)[^.\n]{0,60}pensamento/i,
    filtravel: true,
  },
  {
    id: 'mais_que_perfeito',
    dono: 'beta',
    titulo: 'Mais-que-perfeito',
    resolucao: 'resolve-se pela chave Mais-que-perfeito simples',
    padrao: /mais[-\s]que[-\s]perfeito|anterioridade|\bfizera\b|\bdissera\b/i,
    filtravel: true,
  },
  {
    id: 'notas_tradutor',
    dono: 'beta',
    titulo: 'Notas do tradutor',
    resolucao: 'resolve-se pela chave Notas do tradutor (( ))',
    padrao: /notas? do tradutor|\(\(/i,
    filtravel: true,
  },
  {
    id: 'onomatopeia',
    dono: 'beta',
    titulo: 'Onomatopeias',
    resolucao: 'resolve-se pela chave Onomatopeias',
    padrao: /onomatopeia/i,
    filtravel: true,
  },
  {
    // `filtravel: false` de propósito. Em `obras.ts` o filtro DERRUBA candidatos a
    // diretriz antes de gastar a chamada paga, e nomes próprios é o caso genuinamente
    // ambíguo do doc 15 §4: a POLÍTICA (traduzir ou transliterar) é chave de Beta, mas o
    // tratamento de UM nome é glossário. Filtrar ali descartaria candidato legítimo em
    // silêncio — exatamente o que este trabalho existe para impedir. No aviso ele entra.
    id: 'nomes_proprios',
    dono: 'beta',
    titulo: 'Nomes próprios',
    resolucao: 'a política resolve-se pela chave Nomes próprios; o nome específico, pelo glossário',
    padrao: /nomes? pr[óo]prios? *[—:]|(?:em|para) pinyin|pinyin, sem|translitera(?:r|ndo) o (?:nome|lugar)/i,
    filtravel: false,
  },
  {
    // `\bregistro\b` e não `/registro/`: "registre como termo novo" e "registrar" são do
    // glossário, tema de Alfa. E nada de `/leitor/` solto — o Alfa diz "o que um leitor
    // brasileiro sente" ao falar de unidades de medida.
    id: 'registro',
    dono: 'beta',
    titulo: 'Registro / público-alvo',
    resolucao: 'resolve-se pela chave Registro / público-alvo',
    padrao: /\bregistro\b|p[úu]blico[-\s]?alvo|leitor de webnovel|p[úu]blico juvenil/i,
    filtravel: true,
  },
  {
    id: 'glossario',
    dono: 'alfa',
    titulo: 'Glossário',
    resolucao: 'o glossário é lei acima de todas as camadas; termos entram pelo glossário da obra',
    padrao: /gloss[áa]rio|termo novo|termos novos/i,
    filtravel: false,
  },
  {
    id: 'unidades',
    dono: 'alfa',
    titulo: 'Unidades de medida',
    resolucao: 'vive no Alfa: a conversão zh→pt-BR é objetiva e vale para qualquer obra',
    padrao: /unidades? de medida|时辰|\b里\b|\b丈\b|\b斤\b|tael/i,
    filtravel: false,
  },
  {
    id: 'demonstrativos',
    dono: 'alfa',
    titulo: 'Demonstrativos (这 / 那)',
    resolucao: 'vive no Alfa: o teste da deleção e a linha dura do "aquele"',
    padrao: /demonstrativo|这|那样|teste da dele[çc][ãa]o/i,
    filtravel: false,
  },
  {
    id: 'decalque',
    dono: 'alfa',
    titulo: 'Decalque do chinês',
    resolucao: 'vive no Alfa: 对方, 开口, chengyu, partículas polissêmicas',
    padrao: /decalque|chengyu|part[íi]culas? poliss[êe]mica|对方|开口/i,
    filtravel: false,
  },
] as const;

/** Todos os temas reconhecidos no texto, com a linha e o trecho que casaram.
    Linha que só faz remissão a outra camada é isenta. Função pura. */
export function temasNoTexto(texto: string): Ocorrencia[] {
  const achados: Ocorrencia[] = [];
  texto.split('\n').forEach((linha, n) => {
    if (REFERENCIA_ENTRE_CAMADAS.test(linha)) return;
    for (const tema of TEMAS) {
      const m = linha.match(tema.padrao);
      if (!m || m.index === undefined) continue;
      achados.push({
        tema,
        linha: n + 1,
        trecho: linha.slice(Math.max(0, m.index - 40), m.index + 60).trim(),
      });
    }
  });
  return achados;
}
```

- [ ] **Passo 4: Reimplementar `preferenciaQueCobre` sobre o registro**

Em `shared/src/index.ts`, substituir o corpo da função (preservando o comentário que já
está lá, que explica o custo das três chamadas na 死人经) por:

```ts
export function preferenciaQueCobre(rotulo: string): keyof PreferenciasEstilo | null {
  const n = normalizarSecaoRegra(rotulo);
  const tema = TEMAS.find((t) => t.dono === 'beta' && t.filtravel && t.padrao.test(n));
  return (tema?.id as keyof PreferenciasEstilo) ?? null;
}
```

E reexportar o módulo: `export * from './temasDoPrompt.js';`

- [ ] **Passo 5: Rodar os testes**

Rodar: `npm -w server run test && npm run typecheck`
Esperado: PASSA, inclusive `server/src/db/rotulosRegra.test.ts`, que não muda.

- [ ] **Passo 6: Commit**

```bash
git add shared/src/temasDoPrompt.ts shared/src/index.ts shared/src/temasDoPrompt.test.ts
git commit -m "Registro de temas: quem é dono de quê, em tabela"
```

---

### Tarefa 4: Aviso ao salvar o Delta

**Arquivos:**
- Modificar: `server/src/rotas/obras.ts:324-351` (`POST /obras/:id/prompts`)
- Teste: `server/src/rotas/preferencias.test.ts`

**Interfaces:**
- Consome: `temasNoTexto(texto): Ocorrencia[]` da Tarefa 3.
- Produz: a resposta 201 passa a ter `avisos`:
```ts
interface AvisoCamada { tema: string; titulo: string; dono: Camada; mensagem: string; linha: number; trecho: string; }
// resposta: { ...VersaoDelta, avisos: AvisoCamada[] }
```

- [ ] **Passo 1: Escrever o teste que falha**

```ts
it('salvar Delta com tema de Beta salva e AVISA — nunca bloqueia', async () => {
  const r = await app.request(`/obras/${obraId}/prompts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ versao: '2.0', conteudo: 'Nesta obra o diálogo usa travessão.', tipo: 'delta' }),
  });
  expect(r.status).toBe(201);
  const corpo = await r.json();
  expect(corpo.versao).toBe('2.0');
  expect(corpo.avisos).toHaveLength(1);
  expect(corpo.avisos[0].tema).toBe('dialogo');
  expect(corpo.avisos[0].mensagem).toContain('chave Diálogo');
  expect(corpo.avisos[0].trecho).toContain('travessão');
});

it('Delta que só fala do que é da obra não gera aviso', async () => {
  const r = await app.request(`/obras/${obraId}/prompts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ versao: '3.0', conteudo: 'Lin Feng termina as frases com "hmpf".', tipo: 'delta' }),
  });
  expect((await r.json()).avisos).toEqual([]);
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

Rodar: `npm -w server run test -- preferencias`
Esperado: FALHA com `expected undefined to have length 1`.

- [ ] **Passo 3: Implementar**

Criar `server/src/rotas/avisosCamada.ts`:

```ts
import { temasNoTexto, type Camada } from '@dao-tale/shared';

export interface AvisoCamada {
  tema: string;
  titulo: string;
  dono: Camada;
  mensagem: string;
  linha: number;
  trecho: string;
}

/** Temas que o texto de `camada` menciona mas não são dela. Aviso, nunca bloqueio: o
    dono às vezes quer mesmo a exceção — o que não pode é ela acontecer sem ele ver. */
export function avisosDaCamada(texto: string, camada: Camada): AvisoCamada[] {
  const vistos = new Set<string>();
  return temasNoTexto(texto)
    .filter((o) => o.tema.dono !== camada)
    .filter((o) => !vistos.has(o.tema.id) && vistos.add(o.tema.id))
    .map((o) => ({
      tema: o.tema.id,
      titulo: o.tema.titulo,
      dono: o.tema.dono,
      mensagem: `Isto é tema de ${o.tema.dono === 'beta' ? 'Beta' : 'Alfa'} — ${o.tema.resolucao}.`,
      linha: o.linha,
      trecho: o.trecho,
    }));
}
```

Em `server/src/rotas/obras.ts`, no `POST /obras/:id/prompts`, trocar o `return` do bloco
`try` por:

```ts
      const criado = reposPrompts.criar(db, obraId, {
        ...corpo.data,
        tipo,
        nucleo_id: tipo === 'delta' ? (reposPromptPadrao.ativo(db)?.id ?? null) : null,
        preferencias: normalizarPreferencias({ ...(ativo?.preferencias ?? {}), ...(corpo.data.preferencias ?? {}) }),
      });
      return c.json({ ...criado, avisos: tipo === 'delta' ? avisosDaCamada(corpo.data.conteudo, 'delta') : [] }, 201);
```

- [ ] **Passo 4: Rodar os testes**

Rodar: `npm -w server run test && npm run typecheck`
Esperado: PASSA.

- [ ] **Passo 5: Mostrar o aviso na tela**

Em `web/src/paginas/PromptMae.tsx`, depois de salvar uma versão de Delta, renderizar
`avisos` como faixa de atenção (não de erro), uma linha por aviso, no formato
`{titulo}: {mensagem}` com `{trecho}` em `<code>` abaixo. Reaproveitar o estilo do aviso
vermelho que já existe para "o Alfa ativo não reserva a Seção 5", em tom de atenção.

- [ ] **Passo 6: Commit**

```bash
git add server/src/rotas/avisosCamada.ts server/src/rotas/obras.ts server/src/rotas/preferencias.test.ts web/src/paginas/PromptMae.tsx
git commit -m "Delta que invade Beta agora avisa, na hora de salvar"
```

---

### Tarefa 5: Aviso ao criar um Alfa

Fecha o buraco que produziu o sintoma do doc 15 §1: o v1.0 do VPS não traz
`{{PREFERENCIAS_OBRA}}`, e por isso as chaves da obra eram ignoradas em silêncio.

**Arquivos:**
- Modificar: `server/src/rotas/obras.ts:507-518` (`POST /prompt-padrao`)
- Teste: `server/src/app.test.ts`

**Interfaces:**
- Consome: `avisosDaCamada(texto, camada)` da Tarefa 4; `MARCADOR_PREFERENCIAS` e
  `MARCADOR_DELTA` já exportados.
- Produz: a resposta 201 passa a ter `avisos: AvisoCamada[]`, com dois avisos sintéticos
  possíveis, de `tema: 'marcador_preferencias'` e `tema: 'marcador_delta'`.

- [ ] **Passo 1: Escrever os testes que falham**

```ts
it('Alfa novo sem o marcador de preferências salva e AVISA que as chaves não valerão', async () => {
  const r = await app.request('/prompt-padrao', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ versao: '90.0', conteudo: `# Alfa\n\nRegras.\n\n${'{{DELTA_OBRA}}'}` }),
  });
  expect(r.status).toBe(201);
  const avisos = (await r.json()).avisos;
  expect(avisos.map((a: any) => a.tema)).toContain('marcador_preferencias');
  expect(avisos.find((a: any) => a.tema === 'marcador_preferencias').mensagem)
    .toContain('as preferências de estilo das obras serão ignoradas');
});

it('Alfa novo que decide tema de Beta salva e AVISA', async () => {
  const r = await app.request('/prompt-padrao', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      versao: '91.0',
      conteudo: `# Alfa\n\nToda fala usa travessão.\n\n{{PREFERENCIAS_OBRA}}\n\n{{DELTA_OBRA}}`,
    }),
  });
  expect(r.status).toBe(201);
  expect((await r.json()).avisos.map((a: any) => a.tema)).toContain('dialogo');
});

it('Alfa bem formado não gera aviso nenhum', async () => {
  const r = await app.request('/prompt-padrao', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      versao: '92.0',
      conteudo: `# Alfa\n\nProsa, não legenda.\n\n{{PREFERENCIAS_OBRA}}\n\n{{DELTA_OBRA}}`,
    }),
  });
  expect((await r.json()).avisos).toEqual([]);
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

Rodar: `npm -w server run test -- app.test`
Esperado: FALHA — `avisos` é `undefined`.

- [ ] **Passo 3: Implementar**

Em `server/src/rotas/avisosCamada.ts`, acrescentar:

```ts
import { MARCADOR_DELTA, MARCADOR_PREFERENCIAS } from '../db/promptPadraoInicial.js';

/** Avisos de um Alfa novo: tema de outra camada, e marcador perdido.
    Marcador ausente é o defeito que produziu o sintoma de 2026-08-05 — um Alfa sem
    `{{PREFERENCIAS_OBRA}}` faz `comporOmega` descartar as chaves EM SILÊNCIO, e a obra
    recebe o oposto do que está gravado nela. */
export function avisosDeAlfa(conteudo: string): AvisoCamada[] {
  const avisos = avisosDaCamada(conteudo, 'alfa');
  if (!conteudo.includes(MARCADOR_PREFERENCIAS)) {
    avisos.push({
      tema: 'marcador_preferencias',
      titulo: 'Marcador de preferências ausente',
      dono: 'beta',
      mensagem: `Sem ${MARCADOR_PREFERENCIAS}, as preferências de estilo das obras serão ignoradas em silêncio ao compor o Ômega.`,
      linha: 0,
      trecho: '',
    });
  }
  if (!conteudo.includes(MARCADOR_DELTA)) {
    avisos.push({
      tema: 'marcador_delta',
      titulo: 'Marcador do delta ausente',
      dono: 'delta',
      mensagem: `Sem ${MARCADOR_DELTA}, as diretrizes de cada obra são anexadas no fim, fora da posição prevista.`,
      linha: 0,
      trecho: '',
    });
  }
  return avisos;
}
```

Em `server/src/rotas/obras.ts`, no `POST /prompt-padrao`:

```ts
      const criado = reposPromptPadrao.criar(db, corpo.data);
      return c.json({ ...criado, avisos: avisosDeAlfa(corpo.data.conteudo) }, 201);
```

- [ ] **Passo 4: Rodar os testes**

Rodar: `npm -w server run test && npm run typecheck`
Esperado: PASSA.

- [ ] **Passo 5: Mostrar na tela**

Em `web/src/paginas/PromptMae.tsx`, no fluxo de criar versão de núcleo, mostrar os avisos
como faixa de atenção, do mesmo jeito da Tarefa 4.

- [ ] **Passo 6: Commit**

```bash
git add server/src/rotas/avisosCamada.ts server/src/rotas/obras.ts server/src/app.test.ts web/src/paginas/PromptMae.tsx
git commit -m "Alfa novo declara o que invade e o que perdeu pelo caminho"
```

---

### Tarefa 6: Relatório sobre o Ômega

O único lugar onde as três camadas se encontram.

**Arquivos:**
- Criar: `server/src/rotas/relatorioOmega.ts`
- Modificar: `server/src/rotas/obras.ts` (rota nova, junto de `/obras/:id/prompt-composto`)
- Teste: `server/src/rotas/relatorioOmega.test.ts`

**Interfaces:**
- Consome: `temasNoTexto`, `TEMAS`, `reposPrompts.composto(db, obraId)`.
- Produz: `GET /obras/:id/omega/relatorio` →
```ts
interface RelatorioOmega {
  temas: { tema: string; titulo: string; dono: Camada; ocorrencias: number }[];
  sobreposicoes: { tema: string; titulo: string; dono: Camada; camadas: Camada[]; trechos: string[] }[];
}
```

- [ ] **Passo 1: Escrever o teste que falha**

```ts
it('acusa sobreposição quando Delta repete tema que Beta já decide', async () => {
  // obra com Delta dizendo "travessão" e Beta com dialogo: aspas
  const r = await app.request(`/obras/${obraId}/omega/relatorio`);
  expect(r.status).toBe(200);
  const rel = await r.json();
  const s = rel.sobreposicoes.find((x: any) => x.tema === 'dialogo');
  expect(s.camadas.sort()).toEqual(['beta', 'delta']);
  expect(s.trechos.join(' ')).toContain('travessão');
});

it('sem sobreposição, a lista vem vazia e os temas continuam listados', async () => {
  const rel = await (await app.request(`/obras/${obraLimpaId}/omega/relatorio`)).json();
  expect(rel.sobreposicoes).toEqual([]);
  expect(rel.temas.find((t: any) => t.tema === 'dialogo').dono).toBe('beta');
});
```

- [ ] **Passo 2: Rodar e confirmar que falha**

Rodar: `npm -w server run test -- relatorioOmega`
Esperado: FALHA com 404.

- [ ] **Passo 3: Implementar**

O Ômega é fatiado nas três camadas pelos títulos de seção que a composição garante:
tudo antes de `## 5. PREFERÊNCIAS` é Alfa; de lá até `## 6. DIRETRIZES` é Beta; dali em
diante é Delta. Quando um título falta (Alfa legado sem marcador), a fatia correspondente
é vazia e o resto é Alfa.

```ts
import { TEMAS, temasNoTexto, type Camada } from '@dao-tale/shared';

export function fatiarOmega(omega: string): Record<Camada, string> {
  const iBeta = omega.indexOf('## 5. PREFERÊNCIAS');
  const iDelta = omega.indexOf('## 6. DIRETRIZES');
  if (iBeta === -1 && iDelta === -1) return { alfa: omega, beta: '', delta: '' };
  if (iBeta === -1) return { alfa: omega.slice(0, iDelta), beta: '', delta: omega.slice(iDelta) };
  if (iDelta === -1) return { alfa: omega.slice(0, iBeta), beta: omega.slice(iBeta), delta: '' };
  return { alfa: omega.slice(0, iBeta), beta: omega.slice(iBeta, iDelta), delta: omega.slice(iDelta) };
}

export function relatorioOmega(omega: string) {
  const fatias = fatiarOmega(omega);
  const porTema = new Map<string, { camadas: Set<Camada>; trechos: string[]; ocorrencias: number }>();
  for (const camada of ['alfa', 'beta', 'delta'] as const) {
    for (const o of temasNoTexto(fatias[camada])) {
      const e = porTema.get(o.tema.id) ?? { camadas: new Set<Camada>(), trechos: [], ocorrencias: 0 };
      e.camadas.add(camada);
      e.ocorrencias += 1;
      if (camada !== o.tema.dono) e.trechos.push(o.trecho);
      porTema.set(o.tema.id, e);
    }
  }
  const meta = (id: string) => TEMAS.find((t) => t.id === id)!;
  return {
    temas: [...porTema].map(([id, e]) => ({
      tema: id, titulo: meta(id).titulo, dono: meta(id).dono, ocorrencias: e.ocorrencias,
    })),
    // Sobreposição = o tema aparece em camada que não é a dona. Aparecer só na dona é a
    // partição funcionando, não defeito.
    sobreposicoes: [...porTema]
      .filter(([id, e]) => [...e.camadas].some((c) => c !== meta(id).dono))
      .map(([id, e]) => ({
        tema: id, titulo: meta(id).titulo, dono: meta(id).dono,
        camadas: [...e.camadas].sort(), trechos: e.trechos,
      })),
  };
}
```

Rota em `obras.ts`:

```ts
  app.get('/obras/:id/omega/relatorio', (c) => {
    const composto = reposPrompts.composto(db, Number(c.req.param('id')));
    if (!composto) {
      return c.json({ erro: { codigo: 'sem-prompt', mensagem: 'A obra não tem Ômega: falta prompt ativo ou Alfa ativo.' } }, 404);
    }
    return c.json(relatorioOmega(composto.texto));
  });
```

- [ ] **Passo 4: Rodar os testes**

Rodar: `npm -w server run test && npm run typecheck`
Esperado: PASSA.

- [ ] **Passo 5: Mostrar na tela**

Em `web/src/paginas/PromptMae.tsx`, junto da prévia do prompt composto, uma seção
"Temas e donos" com a lista, e as sobreposições destacadas em tom de atenção com o trecho.

- [ ] **Passo 6: Commit**

```bash
git add server/src/rotas/relatorioOmega.ts server/src/rotas/relatorioOmega.test.ts server/src/rotas/obras.ts web/src/paginas/PromptMae.tsx
git commit -m "Relatório do Ômega: temas, donos e onde eles se atropelam"
```

---

### Tarefa 7: O teste que trava o Alfa distribuído

Impede a regressão que produziu o sintoma: um Alfa que decide tema de Beta mata a chave
em silêncio. O v1.0 legado faz exatamente isso.

**Arquivos:**
- Teste: `server/src/db/promptPadraoInicial.test.ts` — criar

**Interfaces:**
- Consome: `NUCLEO_ENXUTO`, `PROMPT_PADRAO_INICIAL`, `temasNoTexto`, `avisosDeAlfa`.

- [ ] **Passo 1: Escrever o teste**

```ts
import { describe, expect, it } from 'vitest';
import { temasNoTexto } from '@dao-tale/shared';
import { NUCLEO_ENXUTO, PROMPT_PADRAO_INICIAL, MARCADOR_DELTA, MARCADOR_PREFERENCIAS } from './promptPadraoInicial.js';

describe('o Alfa distribuído respeita a partição', () => {
  it('o núcleo enxuto não decide nenhum tema de Beta', () => {
    const invasoes = temasNoTexto(NUCLEO_ENXUTO).filter((o) => o.tema.dono === 'beta');
    expect(invasoes.map((o) => `L${o.linha} [${o.tema.id}] ${o.trecho}`)).toEqual([]);
  });

  it('o núcleo enxuto reserva as duas seções', () => {
    expect(NUCLEO_ENXUTO).toContain(MARCADOR_PREFERENCIAS);
    expect(NUCLEO_ENXUTO).toContain(MARCADOR_DELTA);
  });

  // O v1.0 é o que estava rodando no VPS em 2026-08-05 e produziu "está repetitivo?".
  // Este teste FIXA o defeito em vez de escondê-lo: se um dia ele passar a estar limpo,
  // alguém editou uma versão que deveria ser imutável.
  it('o v1.0 legado decide tema de Beta e não reserva a Seção 5 — por isso foi aposentado', () => {
    const invasoes = temasNoTexto(PROMPT_PADRAO_INICIAL).filter((o) => o.tema.dono === 'beta');
    expect(invasoes.length).toBeGreaterThan(0);
    expect(PROMPT_PADRAO_INICIAL).not.toContain(MARCADOR_PREFERENCIAS);
  });
});
```

- [ ] **Passo 2: Rodar**

Rodar: `npm -w server run test -- promptPadraoInicial`
Esperado: PASSA de primeira — o Alfa já está limpo (medido em 2026-08-06). Se falhar,
**não afrouxe o padrão**: ou o Alfa realmente invadiu, ou o padrão precisa mirar melhor a
decisão, e aí a Tarefa 3 é que muda.

- [ ] **Passo 3: Commit**

```bash
git add server/src/db/promptPadraoInicial.test.ts
git commit -m "Teste que trava a partição no Alfa distribuído"
```

---

### Tarefa 8: A skill `camadas-do-prompt`

O produto que precisa sobreviver ao chat. Preserva as três perguntas do doc 15 §4 e o
registro de temas.

**Arquivos:**
- Criar: `.claude/skills/camadas-do-prompt/SKILL.md`

- [ ] **Passo 1: Escrever a skill**

Usar `superpowers:writing-skills`. Conteúdo mínimo obrigatório:
frontmatter com `name` e `description` (quando usar); o vocabulário Alfa/Beta/Delta/Ômega
com a pergunta que cada camada responde; as três perguntas de decisão em ordem, com a
regra "pare na primeira que responder sim"; a regra "se parece caber em duas, está mal
escrita — é regra de Alfa com exemplo da obra grudado"; o ponteiro para
`shared/src/temasDoPrompt.ts` como fonte de verdade; e como acrescentar um tema novo.

- [ ] **Passo 2: Conferir que ela carrega**

Rodar: `ls .claude/skills/camadas-do-prompt/SKILL.md` e reiniciar a sessão. A skill deve
aparecer no catálogo.

- [ ] **Passo 3: Commit**

```bash
git add .claude/skills/camadas-do-prompt/
git commit -m "Skill camadas-do-prompt: a disciplina de partição, fora da cabeça"
```

---

### Tarefa 9: Instância única no VPS

Operacional. **Exige as mãos do dono** — mexe em banco de produção e em chave de API.
Não executar sem ele presente.

**Arquivos:**
- Modificar: `docs/10-operacao.md` (procedimento) e `docs/15-camadas-do-prompt.md` (§8 → decidido)

- [ ] **Passo 1: Backup verificado dos dois lados**

Rodar o backup de cada instância e **restaurar cada um numa cópia descartável**, conferindo
contagem de obras, capítulos e versões de prompt. Backup não restaurado não é backup.

- [ ] **Passo 2: Congelar a escrita**

Parar o serviço no VPS e não abrir a bancada local. Anotar, dos dois lados: versão do Alfa
ativo, contagem de obras e de capítulos.

- [ ] **Passo 3: Levar o banco local para o VPS**

O banco local é a fonte da verdade (tem a obra em uso e o Alfa v5.0 enxuto). Substituir o
banco do VPS por ele. Conferir que o WAL foi consolidado antes de copiar.

- [ ] **Passo 4: Conferir o que o sintoma denunciava**

Na instância única, abrir a obra e verificar: o Alfa ativo é o v5.0 enxuto; o Ômega
composto contém a Seção 5; `pensamento_tempo: "original"` aparece como *"mantendo o tempo
verbal do original"*. Era exatamente isso que estava errado em 2026-08-05.

- [ ] **Passo 5: Chave de API no VPS**

`credenciais/index.ts` cai para arquivo em VPS headless. Conferir que o arquivo está com
permissão `600`, dono correto, e **fora** de qualquer caminho servido pelo Traefik.

- [ ] **Passo 6: Aposentar o local como escritor**

Deixar claro no `docs/10-operacao.md` que o local é clone descartável restaurado de
backup, somente leitura. Escrever nele volta a criar duas verdades.

- [ ] **Passo 7: Commit**

```bash
git add docs/10-operacao.md docs/15-camadas-do-prompt.md
git commit -m "Uma instância só: a divergência silenciosa não tem conserto depois do fato"
```

---

## Autorrevisão

**Cobertura do spec.** §2 nomes → Tarefa 2. §2.1 vocabulário no código → Tarefa 2. §3
instâncias → Tarefa 9. §4 hierarquia → Tarefa 1. §5 registro → Tarefa 3. §5.1 duas
leituras → Tarefa 3, passos 3–4. §6 três checagens → Tarefas 4, 5, 6; o teste → Tarefa 7.
§6.1 remissão isenta → Tarefa 3, `REFERENCIA_ENTRE_CAMADAS`. Skill → Tarefa 8. Sem lacuna.

**Placeholders.** Nenhum "TBD", nenhum "trate os casos de borda", nenhum "escreva testes
para o acima". Todo passo de código traz o código.

**Consistência de tipos.** `Tema`, `Ocorrencia`, `Camada`, `AvisoCamada`, `RelatorioOmega`
declarados na tarefa que os cria e usados com o mesmo nome depois. `comporOmega` é
renomeada na Tarefa 2 e só aparece com esse nome a partir dali — a Tarefa 1, que vem
antes, usa `comporPromptMae`, que é o nome vigente naquele momento. Intencional.

**Ordem.** A Tarefa 1 não depende de nada. A 2 vem antes de todo código novo. A 3 é
pré-requisito da 4, 5, 6 e 7. A 8 documenta o que a 3 estabeleceu. A 9 é independente das
demais e pode ir a qualquer momento — mas exige o dono presente.
