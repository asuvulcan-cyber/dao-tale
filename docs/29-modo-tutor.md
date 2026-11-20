# Modo tutor de idioma

Desenho de 20/11/2026. O Dao Tale continua inteiro (pipeline, revisão, glossário,
camadas do prompt); o tutor é um modo a mais do editor, para traduzir **você mesmo**
com a IA ensinando. Nada do fluxo atual muda para quem não liga o modo.

## Para quem

Perfil declarado pelo usuário, e que define o tom dos prompts:

| Idioma | Nível | O que isso pede do tutor |
|---|---|---|
| Mandarim | zero (não lê caracteres nem pinyin) | Toda palavra explicada, com pinyin com tons; partículas e classificadores explicados pelo que fazem, não traduzidos à força |
| Inglês | básico/intermediário ("como uma criança de 3–4 anos lendo") | Palavras comuns ele conhece; o difícil é a frase: ordem, tempos verbais, orações encaixadas, phrasal verbs |

O nível fica em Configurações (`nivel_idioma`, por idioma) e entra no prompt.

## Fluxo de uma frase (opção C: você tenta e pede dica quando travar)

1. No editor, modo **Tutor** (quarto modo da paleta, ao lado de Segmentado/Bilíngue/Leitura).
   A tradução já existente fica **oculta** (borrada) — revelar é um clique, por frase.
   Clicar no original abre a **gaveta do tutor**, no lugar da gaveta de revisão.
2. A gaveta mostra o original e um campo "Sua tradução". Dicas em três degraus,
   cada uma revelada só quando pedida:
   1. **Palavras** — a frase quebrada em palavras/expressões, cada uma com leitura
      (pinyin no mandarim) e significado no contexto. No mandarim, o pinyin aparece
      em cima dos caracteres (ruby).
   2. **Estrutura** — como a frase se monta (quem faz o quê, ordem, partículas,
      tempos) e uma versão literal "palavra por palavra".
   3. **Tradução sugerida** — natural, seguindo o prompt mãe e o glossário da obra.
   As três vêm de **uma** chamada (explicação), feita no primeiro pedido de dica e
   guardada no banco: reabrir a frase não gasta de novo.
3. **Corrigir minha tradução** — segunda chamada: veredito de sentido (certo /
   quase / errado), o que você acertou, cada problema com o trecho, o porquê
   (citando a palavra do original) e a sugestão, e uma **versão corrigida com o
   mínimo de mudanças** sobre o seu texto. Dá para corrigir de novo quantas vezes quiser.
4. **Salvar** a sua versão ou a corrigida na frase. A frase passa a "traduzida",
   com `origem_edicao = 'tutor'` — o botão Traduzir do capítulo não passa por cima,
   e a mineração de edições manuais não lê a tradução de quem está aprendendo como
   se fosse correção da IA.

## Vocabulário com repetição espaçada

- Qualquer palavra das dicas ou da correção vai para o vocabulário com um clique
  (“+”), com a frase de origem como exemplo. A palavra é única por idioma; adicionar
  de novo não zera o progresso dela.
- Página **Vocabulário**: lista por idioma e sessão de revisão. Cartão: frente com a
  palavra e o exemplo; verso com leitura, significado, nota e a tradução do exemplo.
  Quatro respostas — Errei / Difícil / Bom / Fácil — agendam a próxima revisão
  (SM-2 simplificado: 1 dia, 3 dias, depois intervalo × facilidade; "Errei" volta
  para hoje).
- Botão **Ouvir** usa a voz do sistema (Web Speech) quando existe voz instalada para
  o idioma; sem voz, o botão não aparece.

## Modelo e custo

- Papel novo `tutor` (provedor/modelo próprios em Configurações; vazio = cadeia
  normal). Configurado para **claude-code / sonnet**: são chamadas curtas e
  frequentes, por frase. Haiku ficou de fora porque, na comparação de 20/11, errou
  leitura e tempo verbal — e quem está no nível zero não tem como perceber o erro
  do tutor.
- Telemetria registra as chamadas com `papel = 'tutor'`.
- O prompt de sistema (instruções do tutor + regras da obra) é estável por obra e
  fica em cache; a frase, o contexto e o glossário relevante vão na mensagem.

## Dados

- `tutor_frases` (1 linha por frase): explicação e correção em JSON, tentativa,
  dicas vistas, número de tentativas, quando foi salva. Guarda o texto de origem da
  época: se a frase for dividida/mesclada e o texto mudar, a explicação velha é
  descartada em vez de explicar outra frase.
- `vocabulario`: palavra, leitura, significado, nota, exemplo (origem e PT), obra e
  frase de origem, e o estado da repetição espaçada.
- Fora da exportação por obra nesta versão (o backup do banco cobre).

## Fora desta versão

Cartões no sentido inverso (PT → palavra), estatísticas de progresso por semana,
exercícios fora do capítulo, áudio gerado por IA.
