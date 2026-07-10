# Dao Tale

Aplicativo local de tradução e revisão assistida para tradução literária chinês → PT-BR (webnovels). Substitui o fluxo manual de chat com IA + planilha de revisão por uma ferramenta única: editor bilíngue, prompt mãe versionado, glossário por obra e banco de testes alimentado automaticamente pelo Protocolo de Revisão.

**Status atual: Fases 1, 2 e 3 implementadas** — fluxo completo funcional: obra → capítulo → segmentação → tradução em blocos → editor bilíngue → Protocolo de Revisão → banco de testes, com provedores Claude, Gemini e Simulado; mesclar/dividir frases; exportação/reimportação completa da obra; diff entre versões do prompt mãe; verificação de consistência do glossário; provedor/modelo configurável por obra e por tradução. Único item adiado: empacotamento desktop (só se o formato web local incomodar no uso real — `npm run atalho` já dá o "abrir com um clique").

## Como rodar

Requisito: [Node.js](https://nodejs.org) ≥ 22.

```bash
git clone https://github.com/asuvulcan-cyber/dao-tale.git
cd dao-tale
npm install
npm run start   # compila a interface na 1ª vez, sobe em http://127.0.0.1:8317 e abre o navegador
```

Sem chave de API dá para usar tudo com o provedor **Simulado**. Chaves reais (Claude/Gemini) são cadastradas em Configurações e guardadas no cofre de credenciais do sistema.

Desenvolvimento: `npm run dev` (servidor + Vite com reload) · testes: `npm test` · tipos: `npm run typecheck` · atalho de área de trabalho: `npm run atalho`.

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
