# 06 — Roadmap, riscos e custos

## Fase 1 — MVP (fluxo completo com um provedor real + mock) — ✅ CONCLUÍDA

Objetivo: substituir o fluxo chat+planilha de ponta a ponta para uma obra.

Entregas e critérios de aceite:

- [x] **Fundação:** monorepo (server/web/shared), SQLite com migrações, launcher `npm run start` que abre o navegador (Windows e Linux).
- [x] **Obras:** criar obra com prompt mãe inicial (colar ou `.md`) e glossário inicial opcional (`.csv` ou pares colados); listar; excluir com simulação de cascata.
- [x] **Segmentador** com a bateria de testes de `05-fluxos-ia.md §1` passando (aceite: nenhum corte dentro de aspas em todos os casos da bateria).
- [x] **Capítulo:** colar texto ou upload `.txt` → segmentação → frases `pendente` no editor.
- [x] **Tradução em blocos** com provedor **Claude** e provedor **mock**: prompt caching, saída estruturada, progresso via SSE ("frase X de Y"), retry com backoff, retomada após interrupção.
- [x] **Editor bilíngue:** duas colunas agrupadas por parágrafo, chinês selecionável/só leitura, tradução editável com autosave, contador, seletor/status de capítulo.
- [x] **Protocolo de Revisão:** pergunta → resposta estruturada → gravação automática no banco de testes → "Aplicar correção" com um clique.
- [x] **Configurações:** cadastro/teste/remoção de chave (keyring + fallback com aviso), provedor/modelo padrão global e por obra.
- [x] **Banco de testes (versão mínima):** listagem por obra com filtro de status.
- [x] Extras antecipados da Fase 2: tela de termos sugeridos (aceitar/ajustar/rejeitar) com badge, import/export CSV do glossário, export CSV do banco de testes.

Nota: a lista virtualizada para capítulos muito longos ficou de fora do MVP — reavaliar se o uso real mostrar lentidão com 300+ frases.

## Fase 2 — Multi-provedor e curadoria — ✅ CONCLUÍDA

- [x] Provedor **Gemini** (`@google/genai`, saída estruturada via `responseSchema`; mesma interface `ProvedorIA`).
- [x] **Banco de testes completo:** filtros (status, seção/regra, veredito, datas, capítulo), paginação, exportação CSV.
- [x] **Termos sugeridos:** entregue na Fase 1.
- [x] **Mesclar/dividir frases** no editor (correção de segmentação) com renumeração transacional em duas fases e religação dos casos de teste.
- [x] **Exportação completa da obra** (JSON `dao-tale-export` v1, chaves naturais) e reimportação com remapeamento de ids.

## Fase 3 — Refinamento e empacotamento — ✅ CONCLUÍDA (exceto empacotamento, adiado por decisão)

- [x] **Versionamento do prompt mãe — tela completa:** histórico, diff entre versões (LCS por linha, com notas da versão), reverter.
- [x] **Alerta "regra nova necessária":** agregado por `secao_regra`, alerta clicável quando 2+ casos não confirmados da mesma seção (entregue na Fase 2).
- [x] **Varredura reversa de consistência do glossário** (doc 05 §4.2): botão "Consistência" no editor aponta frases onde o termo canônico do glossário não aparece na tradução, com navegação direta à frase.
- [x] **Seleção de provedor/modelo por obra e por tradução** (requisito 4.7 do briefing): preferências de IA na página da obra + seletor de provedor na barra do editor a cada tradução.
- [x] **Atalho de "abrir um programa"** sem empacotamento: `npm run atalho` cria atalho de área de trabalho (Windows, .vbs sem console) ou entrada no menu de aplicativos (Linux, .desktop).
- [ ] **Empacotamento desktop** (Tauri com sidecar Node, ou Electron) — deliberadamente adiado: o critério do briefing era "se o formato web local se mostrar limitante no uso diário", o que só o uso real pode responder. O atalho acima cobre a experiência de abrir com um clique; se ainda assim incomodar, este item volta.

## Riscos e pontos de atenção

| Risco | Mitigação |
|---|---|
| **Usuário ainda não tem chave de API** — assinaturas Pro (Claude/Gemini) **não** dão acesso à API; é cadastro e cobrança separados (console.anthropic.com / aistudio.google.com — o Gemini tem camada gratuita de API que já serve para testar) | Provedor mock na Fase 1 desbloqueia todo o desenvolvimento; o app orienta na tela de Configurações |
| Rate limits de conta nova (tier 1 da Anthropic é baixo) | Blocos sequenciais + backoff; tamanho de bloco configurável |
| Modelo devolve JSON fora do contrato (ordem faltando, frase extra) | Validação por bloco: faltantes viram `erro` reprocessáveis; nunca corrompe frases já boas |
| Segmentação errada em pontuação não prevista | Bateria de testes + mesclar/dividir manual (Fase 2) como válvula de escape |
| Capítulo colado de novo apaga trabalho em cascata | Confirmação explícita com contagem do que se perde; regra escrita no doc 03 |
| Prompt mãe muito grande + glossário crescendo = custo por chamada sobe com a obra | Prompt caching (custo cai ~90% do 2º bloco em diante); monitorar tamanho do sistema na interface é candidato a Fase 3 |

## Ordem de grandeza de custo (Claude, família Sonnet, preços de hoje)

Capítulo típico de webnovel: 2.000–4.000 caracteres ≈ 100–250 frases ≈ 6–13 blocos.

- Sistema (prompt mãe + glossário): ~3–6 mil tokens, **cacheado** após o 1º bloco.
- Entrada por bloco: ~600–900 tokens novos; saída: ~700–1.100 tokens.
- **Estimativa: US$ 0,05–0,20 por capítulo** traduzido; cada pergunta do Protocolo de Revisão: ~US$ 0,01–0,03.

Números para expectativa, não contrato — variam com modelo, tamanho do prompt mãe e do glossário. O Gemini com camada gratuita pode zerar o custo de testes iniciais.

## O que a Fase 1 NÃO inclui (para manter o MVP honesto)

Reimportação de export, diff de versões de prompt, mesclar/dividir frases, tela de fila de termos (a captura acontece, a curadoria espera), Gemini, empacotamento desktop, qualquer forma de sync multi-máquina.
