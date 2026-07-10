# Dao Tale

Aplicativo local de tradução e revisão assistida para tradução literária chinês → PT-BR (webnovels). Substitui o fluxo manual de chat com IA + planilha de revisão por uma ferramenta única: editor bilíngue, prompt mãe versionado, glossário por obra e banco de testes alimentado automaticamente pelo Protocolo de Revisão.

**Status atual: fase de esquematização concluída — implementação da Fase 1 ainda não iniciada.**

## Documentação de projeto

A especificação completa está em `docs/`, na ordem de leitura:

| Documento | Conteúdo |
|---|---|
| [`docs/01-visao-e-decisoes.md`](docs/01-visao-e-decisoes.md) | Visão geral, decisões de projeto tomadas (com justificativa) e pendências que dependem do usuário |
| [`docs/02-arquitetura.md`](docs/02-arquitetura.md) | Stack técnica, estrutura do repositório, como o app roda e como será empacotado |
| [`docs/03-modelo-de-dados.md`](docs/03-modelo-de-dados.md) | Esquema completo do banco (SQLite), com todas as tabelas, índices e regras de integridade |
| [`docs/04-api.md`](docs/04-api.md) | Contrato da API local entre interface e backend |
| [`docs/05-fluxos-ia.md`](docs/05-fluxos-ia.md) | Segmentação de frases, pipeline de tradução em blocos, Protocolo de Revisão, captura de termos, abstração multi-provedor e guarda de chaves |
| [`docs/06-roadmap.md`](docs/06-roadmap.md) | Fases de implementação com critérios de aceite, riscos e estimativas de custo de API |

## Princípios inegociáveis

- **Local-first:** tudo roda na máquina do usuário; internet só é necessária no momento exato das chamadas às APIs de IA.
- **Privacidade:** texto, glossário, prompt mãe e chaves de API nunca saem da máquina, exceto nas chamadas diretas ao provedor de IA escolhido.
- **Dados do usuário são do usuário:** banco em arquivo único (SQLite) + exportação completa por obra para backup.
