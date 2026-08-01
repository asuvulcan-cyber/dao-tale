# 07 — Guia de primeiro teste

Roteiro para o primeiro uso real, com soluções para os tropeços mais prováveis. Tempo estimado: 20–30 minutos.

## Antes de começar

1. **Instale o Node.js 22 LTS** — [nodejs.org](https://nodejs.org), botão "LTS". *Importante: use a LTS.* Versões muito novas ou antigas podem não ter binário pré-compilado do SQLite e forçar compilação nativa (que exige Visual Studio no Windows — desnecessário com a LTS).
2. Clone e instale:
   ```bash
   git clone https://github.com/asuvulcan-cyber/dao-tale.git
   cd dao-tale
   npm install
   npm run start
   ```
   Na primeira execução ele compila a interface (≈30s) e abre `http://127.0.0.1:8317` no navegador.
3. (Opcional) `npm run atalho` cria o atalho de área de trabalho / menu de aplicativos.

## Roteiro de teste

**Passo 1 — Conhecer o app populado (2 min).** Na tela de Obras, clique em **"Importar obra (.json)"** e selecione `exemplos/obra-exemplo.json` (está na pasta do projeto). Isso cria uma obra de demonstração com capítulo traduzido, glossário, duas versões de prompt (experimente "Comparar versões"), um termo sugerido pendente e dois casos no banco de testes — dá para ver todas as telas funcionando antes de criar qualquer coisa.

**Passo 2 — Sua obra real.** "Nova obra" com o **seu prompt mãe verdadeiro** (cole o .md inteiro) e o glossário que você já tem (formato `termo_zh,termo_pt,categoria`, uma linha por termo — dá para importar depois também, na aba Glossário).

**Passo 3 — Validar a segmentação (o feedback mais valioso).** Cole um capítulo chinês real e crie. Percorra as frases no editor: algum diálogo foi cortado no meio? Alguma frase colada com outra? Use "Mesclar com a próxima" / "Dividir frase" (selecionando a frase) para corrigir — e **anote os casos em que o segmentador errou**, com o trecho chinês: é isso que permite melhorar as regras.

**Passo 4 — Tradução simulada.** Traduza o capítulo com o provedor **Simulado** (barra do editor → seletor de provedor). Serve para validar o fluxo (progresso, edição, autosave) sem custo. As "traduções" são placeholders de propósito.

**Passo 5 — Chave do Gemini (grátis).** [aistudio.google.com](https://aistudio.google.com) → "Get API key" → copie. No app: Configurações → Gemini → colar → Salvar → **Testar** (deve listar os modelos). Não precisa de cartão.

**Passo 6 — Tradução real.** No editor, escolha "Gemini (Google)" no seletor e clique **"Retraduzir tudo"** (ele pergunta se preserva as frases que você editou à mão). Acompanhe o progresso. Se aparecer erro de limite de requisições (429), o app tenta de novo sozinho — capítulos grandes na cota gratuita só ficam mais lentos.

**Passo 7 — Protocolo de Revisão.** Clique numa frase chinesa → pergunte algo real sobre a escolha de tradução → veja a resposta estruturada e o caso salvo no Banco de testes. Se o veredito for "incorreto", teste o "Aplicar correção".

**Passo 8 — Curadoria.** Veja a aba "Termos sugeridos" (a IA deve ter reportado termos novos), aceite/rejeite alguns e confira o glossário. No editor, rode o botão "Consistência".

**Passo 9 — O livro (doc 12).** Na obra, clique em **"Exportar livro"**: escolha EPUB, confira a
contagem ("N capítulos · capítulos 118–129") e baixe. Abra o `.epub` no seu leitor (celular,
Kobo, Calibre) e verifique capa, sumário, autor e acentuação. Se quiser o texto cru, os mesmos
filtros geram o Markdown da obra inteira, em PT ou bilíngue.

**Passo 10 — Modo leitura.** Botão **"Ler"** (na obra ou no menu da estante). É a página
read-only: `A−/A+` muda o corpo, `largura` a medida, `中` liga o bilíngue, `☰` abre o sumário e
as setas ←/→ viram capítulo. As preferências ficam salvas no navegador. **Anote se algum
parágrafo aparecer colado ou fora de ordem** — é o mesmo agrupamento que o EPUB usa.

## Problemas prováveis e soluções

| Sintoma | Causa e solução |
|---|---|
| `npm install` falha citando `node-gyp`, `prebuild` ou Visual Studio | Versão do Node sem binário pré-compilado. Instale o **Node 22 LTS** e rode `npm install` de novo. |
| "Porta em uso" ao iniciar | Outra instância aberta (ou outro app na 8317). Feche-a, ou rode com outra porta: `DAO_TALE_PORTA=8400 npm run start` (Windows PowerShell: `$env:DAO_TALE_PORTA=8400; npm run start`). |
| Navegador não abre sozinho | Abra manualmente `http://127.0.0.1:8317`. |
| "Testar" a chave do Gemini falha | Confira se copiou a chave inteira; se a mensagem citar 401/403, a chave está errada ou revogada — gere outra no AI Studio. |
| Tradução para com "chave de API inválida" no meio | Mesma causa acima — o job para de propósito em erro fatal; corrija a chave e clique "Retomar tradução". |
| Configurações mostram "arquivo" em vez do cofre do sistema | Normal em Linux sem gnome-keyring/KWallet; a chave fica em `credenciais.json` com permissão restrita no diretório de dados (o caminho aparece na própria tela). |
| Quero zerar tudo | Feche o app e apague o diretório de dados (mostrado em Configurações): `%APPDATA%\dao-tale` no Windows, `~/.local/share/dao-tale` no Linux. |

## O que anotar para o feedback

1. **Erros de segmentação** (com o trecho chinês exato) — prioridade máxima.
2. Nome do modelo Gemini que funcionou/falhou (se falhar, a mensagem de erro inteira).
3. Qualquer resposta do Protocolo de Revisão que veio mal estruturada ou vazia.
4. Fricções de uso: cliques a mais, coisas difíceis de achar, texto pequeno demais no editor etc.
