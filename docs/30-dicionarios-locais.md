# 30 · Dicionários locais (DCP e CC-CEDICT)

> Implementado em 2026-11-20. Passo 2 do plano de tornar tutor e revisão
> confiáveis (o passo 1 foi o CLAUDE.md e a skill `revisar-capitulo`).

## 1. O problema

O usuário está no nível zero em mandarim (doc 29). Quando o tutor erra um pinyin
ou um sentido, ele não tem como perceber: decora o erro. A revisão por frase tem
o mesmo ponto cego — a resposta do modelo é a única fonte que ele tem sobre o
que a palavra do original quer dizer.

Um dicionário local dá uma segunda fonte, que não depende do modelo e não custa
chamada.

## 2. As fontes

| Fonte | Idioma | Tamanho | Licença | Papel |
|---|---|---|---|---|
| **DCP** — [lercordeiro/dicionario_chines_portugues](https://github.com/lercordeiro/dicionario_chines_portugues) | zh → pt | ~16 mil verbetes | CC BY-NC-SA 4.0 (uso pessoal ok) | sentido em português, para quem aprende |
| **CC-CEDICT** — [MDBG](https://www.mdbg.net/chinese/dictionary?page=cc-cedict) | zh → en | ~125 mil verbetes | CC BY-SA 4.0 | cobertura; leituras para conferir |

Limites conhecidos, que a doutrina do prompt diz ao modelo:

- O DCP é vocabulário de curso (HSK). Não tem vocabulário de wuxia (江湖, 武功,
  内力 ausentes) e tem erros — o autor avisa, e o primeiro verbete do `D.tex`
  dá a 塔 a leitura e o sentido de 瘩.
- Os dois são dicionários de uso geral: o DCP dá 刀 = "faca; espada",
  colapsando a distinção 刀 (sabre) × 剑 (espada reta) que já produziu frase
  autocontraditória na obra. **Dicionário confere; o glossário, o contexto e as
  regras da obra decidem.**

Avaliadas e descartadas: a-china.info (bloqueia robôs; não contornar),
chine-culture.com (é chinês–francês), FreeDict (fraco). Para obras em inglês,
o candidato é Wiktionary (kaikki.org) + OpenWordNet-PT — ainda não integrado.

## 3. Onde mora

Arquivo próprio, `dicionarios.db`, na pasta de dados (ao lado do `dao-tale.db`),
montado por:

```bash
npm run dicionarios                       # baixa as duas fontes e monta
npm run dicionarios -- --cedict cedict_1_0_ts_utf-8_mdbg.txt.gz --dcp <repo>/groups.by.pinyins
```

**Por que não uma tabela no banco do usuário:** são ~37 MB de dados públicos que
se regeneram em segundos. Dentro do `dao-tale.db` eles entrariam em todo
snapshot de migração e em todo backup, e a licença NC-SA do DCP se misturaria
aos dados do usuário na exportação.

A importação grava em `dicionarios.db.novo` e renomeia por cima no fim: um
download que cai no meio não deixa dicionário pela metade. O servidor confere a
data do arquivo a cada consulta e reabre sozinho — atualizar não exige
reiniciar. Sem o arquivo, tudo funciona como antes (as rotas dizem
`instalado: false` e os prompts não ganham o bloco).

Código: `server/src/dicionario/` (`fontes.ts` lê os formatos, `banco.ts` monta e
consulta, `importar-cli.ts` é o comando); o bloco do prompt em
`server/src/ia/promptDicionario.ts`; pinyin e conferência em
`shared/src/dicionario.ts`.

### Formatos

- **CC-CEDICT:** `trad simp [pin1 yin1] /sentido/sentido/`. `CL:個|个[ge4]` vira
  classificador; pinyin com maiúscula (`Lin2`) é nome próprio.
- **DCP:** LaTeX em `groups.by.pinyins/*.tex`.
  `\begin{EntryWithPhonetic}{hanzi}{pinyin}[nota]{traços}{radicais}[HSK n]`,
  `\definition[classificadores]{classe}{sentido | sentido}[exemplo===tradução]`;
  `\definition*` = nome próprio; `//` no pinyin = verbo separável. Parte
  opcional (`差（一）点儿`) vira duas chaves. Os 99 verbetes sem `\definition`
  (só remissão, como 伯 *bǎi*) ficam: a leitura serve para conferir.

## 4. Divisão da frase em palavras

Casamento máximo nos dois sentidos sobre as chaves dos dois dicionários; fica a
divisão de menos palavras (desempate: menos caracteres soltos, depois a de trás
para frente). ~1–9 ms por frase.

**Termos do glossário entram inteiros e antes de tudo:** 林动 dividido pelo
dicionário viraria "floresta" + "mover". Termo marcado `ambiguo` (小心 =
"cuidado" e também a criada) não se impõe.

## 5. No tutor

1. **Prompt:** verbetes das palavras da frase (até 40) vão na mensagem do
   usuário, depois do glossário — **DCP primeiro, CC-CEDICT de complemento**,
   agrupados por leitura (长 *cháng* "longo" × 长 *zhǎng* "chefe"). Saem os
   termos do glossário e os sentidos de nome próprio quando há sentido comum
   ("sobrenome Dao" ao lado de 刀 é ruído).
2. **Conferência da leitura:** a cada leitura do estado da frase, cada segmento
   da explicação é conferido contra as leituras do dicionário (do verbete
   inteiro ou, se o segmento não é verbete, da combinação das palavras em que
   ele se divide). Divergência volta em `divergencias` e a gaveta marca o pinyin
   em ocre, com a leitura do dicionário. Não é guardada: atualizar o dicionário
   reconfere explicações antigas.
   - **Não acusa** tom neutro de nenhum lado (os dicionários marcam neutro onde
     a fala varia) nem a mudança de tom de 一 e 不 (*yí gè*, *bú shì*). Alarme
     falso para quem não tem como julgar é pior que silêncio.
   - **Acusa** leitura errada de polifônico (长老 *cháng*lǎo, 银行 yín*xíng*) e
     tom trocado.
3. **Painel "Dicionário (sem IA)"** na gaveta, fechado por padrão — aberto,
   entrega as palavras de bandeja, e o fluxo é "tente e peça dica".

## 6. Na revisão por frase

- **Prompt:** só **CC-CEDICT**, até 25 palavras, sem os termos do glossário e sem
  os caracteres HSK 1 (的, 了, 是…) — a menos que a pergunta fale deles. Inglês e
  não português de propósito: o revisor julga uma tradução já escrita, e glosas
  em português na frente dele puxam a redação para o português de verbete.
- **Painel "Dicionário da frase (sem IA)"** na gaveta de revisão, para checar a
  resposta do modelo ou entender o original antes de perguntar.

O bloco vai na mensagem do usuário, nunca no sistema: muda a cada frase, e no
sistema quebraria o cache do prompt da obra.

## 7. API

| Método e rota | Descrição |
|---|---|
| `GET /dicionario` | `{ instalado, fontes[] }` — nome, licença, versão e total de cada fonte |
| `GET /dicionario/busca?termo=` | Verbetes de uma palavra (simplificada ou tradicional), DCP primeiro |
| `GET /frases/:id/dicionario` | Palavras da frase com verbetes e o termo do glossário marcado; lista vazia em obra inglesa |
| `GET /frases/:id/tutor` | ganha `divergencias[]`: `{ indice, texto, leitura_ia, leituras_dicionario }` |

## 8. Fora desta versão

Dicionário de inglês (Wiktionary + OpenWordNet-PT); dicionário no QA, na
tradução e na revisão literária (o custo de tokens por capítulo é outro
assunto); verso do cartão do vocabulário com o verbete; consulta clicando numa
palavra qualquer do editor.
