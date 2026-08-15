// O que mudou no app, por ENTREGA e não por commit.
//
// A granularidade é decisão de desenho: só este branch tem 46 commits, e uma
// lista deles seria ruído para quem quer saber "o que ficou diferente para mim".
// Cada entrada aqui é uma coisa que o revisor consegue reconhecer usando o app.
//
// Esta lista é CURADA — envelhece se ninguém escrever. O que não envelhece é o
// carimbo do deploy (`/saude` lê o VERSAO.json que o `subir.mjs` grava), e é ele
// que decide o que está no ar. Por isso a página cruza os dois: o texto conta a
// história, o carimbo diz até onde ela chegou na máquina que você está usando.

export interface EntradaChangelog {
  /** Data em que a entrega ficou pronta (ISO curto). É por ela que a página
   *  decide o que já está publicado. */
  em: string;
  titulo: string;
  /** Uma linha por mudança que dá para perceber usando o app. */
  itens: string[];
  /** O porquê, quando ele não é óbvio pelo título. Fica em destaque. */
  nota?: string;
}

export const CHANGELOG: readonly EntradaChangelog[] = [
  {
    em: '2026-08-15',
    titulo: 'Página de mudanças, e edições manuais que param de voltar',
    itens: [
      'Esta página: o que mudou no app, por entrega, com o carimbo do que está publicado nesta máquina.',
      'A edição manual que vira regra sai da lista de candidatas quando você SALVA a versão nova do prompt — recusar a proposta deixa o sinal vivo.',
      'Botão para marcar de uma vez as candidatas acumuladas, para quem já usava o app antes disso existir.',
      'Reescrever uma frase já tratada a devolve à lista: é lição nova sobre a mesma frase.',
    ],
    nota:
      'O banco de testes já consumia sozinho (caso confirmado ou rejeitado sai das recorrências); as edições manuais nasceram sem esse mecanismo e as mesmas 87 candidatas voltavam sempre. Com amostra de 15 por chamada, isso fazia você pagar para a IA repropor regra que você já tinha escrito.',
  },
  {
    em: '2026-08-15',
    titulo: 'Catálogo de erros comuns zh→pt-BR',
    itens: [
      'Uma varredura bilíngue nova acusa erro de tradução comparando o ORIGINAL com o português — as regras de estilo só olhavam o português.',
      'O achado entra na mesma lista de estilo do capítulo, com nome e uma linha dizendo o que é certo, e o botão Ignorar alerta funciona igual.',
      'O passe de estilo passou a receber o chinês da frase: consertar 一直 sem ver o original era adivinhar.',
      'A tela de Edições manuais ganhou o grupo "O catálogo já detecta" — o que a varredura pega de graça parou de virar pedido pago de regra no prompt.',
      'Script `aferir-catalogo.ts`: mede, no seu corpus, quantas vezes você consertou sozinho o que a regra acusa. É o número que decide se uma regra merece existir.',
    ],
    nota:
      'O catálogo começa com UMA entrada (一直 traduzido como "sempre") de propósito. A tabela de nove partículas do prompt antigo foi medida contra as suas 561 frases: das 81 frases que ela acusaria, você tinha mudado 4. O valor da entrega não é o tamanho da lista — é o piso medido que impede a lista de crescer errado.',
  },
  {
    em: '2026-08-15',
    titulo: 'Apelido não é nome de gente',
    itens: [
      'A Seção 5 separou o nome de nascimento (continua em pinyin) do apelido, que agora resolve-se como título: 飞鹰 → Águia Voadora, não "Feiying".',
      'O desempate "o leitor recebe uma imagem?" passou a declarar que não vale para nome de nascimento — era a contradição que produzia o erro.',
      'A varredura de estilo parou de acusar adjetivos em -ora/-eira dentro de apelido traduzido.',
    ],
  },
  {
    em: '2026-08-10',
    titulo: 'Consistência do glossário na obra inteira',
    itens: [
      'Aba Consistência, colada ao Glossário: varre a obra toda e agrupa por termo, que é como o conserto funciona.',
      'Conserto em lote com prévia — a prévia diz quantas frases mudariam sem gravar nada.',
      'Cadastrar, editar ou apagar um termo recalcula a contagem dos capítulos na hora.',
    ],
    nota:
      'O buraco não era o escopo da varredura: era o gatilho. Nada reexaminava os capítulos quando o glossário mudava, então "0 violações" era um número calculado ANTES de o termo existir — e zero calculado cedo demais é pior que nenhum número, porque parece resposta.',
  },
  {
    em: '2026-08-10',
    titulo: 'Aprender com as edições manuais',
    itens: [
      'Aba Edições manuais: tudo que você reescreveu por cima da IA, agrupado pela camada dona do problema.',
      'Só o grupo "Candidatas a diretriz" tem botão para o refinamento — os outros mandariam material que o refinamento é proibido de usar.',
      'Passe de estilo: a IA propõe o conserto de cada violação que a varredura acusa, você aprova uma a uma. Propor não grava nada.',
      'Frase consertada por botão não conta mais como edição sua em lugar nenhum.',
    ],
    nota: 'Eram 146 edições suas contra 25 casos no banco de testes — o canal mais rico era o único que o app não lia.',
  },
  {
    em: '2026-08-09',
    titulo: 'A revisão virou conversa',
    itens: [
      'Responder neste fio: a réplica continua a mesma dúvida em vez de reiniciá-la, e a IA recebe a conversa inteira.',
      'Discordo → Descartar o veredito, com motivo — e o motivo vira insumo do refinamento do prompt.',
      'A resposta à sua pergunta virou campo obrigatório do contrato, e citar uma regra deixou de ser.',
      'Veredito novo "escolha legítima", para o caso em que as duas traduções servem.',
    ],
    nota:
      'A causa dos vereditos contraditórios não era rigidez do modelo: era a obrigação de citar uma regra somada a uma lista de rótulos ordenada por frequência, que fazia a regra mais citada ser citada ainda mais.',
  },
  {
    em: '2026-08-03',
    titulo: 'Ajustes de prompt e configuração',
    itens: [
      'Temperatura por papel (tradução, revisão, extração), com override por obra.',
      'Núcleo Alfa enxuto ativado depois de A/B: mesma qualidade, 14% menos tokens.',
      'Contracapa com prompt próprio — título e sinopse pararam de sair truncados.',
      'Configuração fora da faixa parou de derrubar o "Salvar padrões" em silêncio.',
    ],
  },
  {
    em: '2026-08-01',
    titulo: 'Vitrine pública, leitura e hospedagem',
    itens: [
      'Exportação EPUB 3.3 e Markdown da obra, sem dependência externa.',
      'Modo leitura (/ler) para reler o que já está traduzido.',
      'Vitrine pública: obra marcada + capítulo finalizado ficam visíveis para quem tem o link.',
      'Hospedagem com login, TLS e serviço gerenciado — o app saiu do laptop.',
    ],
  },
  {
    em: '2026-07-29',
    titulo: 'Telemetria de custo',
    itens: [
      'Aba Custos: cada chamada de IA registrada com modelo, papel e preço.',
      'Os ganhos de token dos prompts em camadas viraram número conferível em vez de estimativa.',
    ],
  },
  {
    em: '2026-07-23',
    titulo: 'Pipeline em fases, QA e durabilidade',
    itens: [
      'Tradução em fases com checkpoint por métrica e lote durável com failover entre provedores.',
      'QA por uma segunda IA, opcional.',
      'Backup e restauração testados, trava de instância única, proteção contra requisição de origem estranha.',
    ],
  },
  {
    em: '2026-07-22',
    titulo: 'Prompt universal em camadas',
    itens: [
      'O prompt virou Alfa (núcleo zh→pt-BR), Beta (estilo da obra) e Delta (diretrizes), cada tema com uma camada dona.',
      'Modelo por papel: dá para usar um modelo caro na tradução e um barato na extração de termos.',
      'Refinamento do prompt pela IA, a partir do banco de testes.',
    ],
  },
  {
    em: '2026-07-13',
    titulo: 'Multi-provedor e comparador',
    itens: [
      'Quatro APIs além do Claude, com curadoria de modelos e cota diária à vista.',
      'Comparador de modelos lado a lado no mesmo trecho.',
      'Progresso ao vivo durante a tradução, e guia de uso dentro do app.',
    ],
  },
];

/** O que a página precisa saber sobre a máquina em que está rodando. */
export interface CarimboDeploy {
  /** Hash curto do commit publicado. `null` em desenvolvimento. */
  commit: string | null;
  /** ISO do momento do deploy. `null` em desenvolvimento. */
  publicado_em: string | null;
}

/**
 * Marca cada entrada como publicada ou não, comparando a data da entrega com a
 * do deploy.
 *
 * Existe porque texto curado não sabe onde está rodando: numa máquina de
 * desenvolvimento a lista inteira aparece como se estivesse no ar, e o revisor
 * procuraria na tela uma função que só existe no seu laptop. Sem carimbo
 * (`publicado_em: null`) nada é afirmado — é honesto dizer "não sei" em vez de
 * chutar que tudo está publicado.
 *
 * A comparação é por DIA, não por instante: a entrada carrega `em: 'YYYY-MM-DD'`
 * e o deploy carrega um ISO completo. Um deploy às 14h de uma entrega da manhã
 * do mesmo dia conta como publicada, que é o que o revisor espera.
 */
export function marcarPublicadas(
  entradas: readonly EntradaChangelog[],
  carimbo: CarimboDeploy,
): { entrada: EntradaChangelog; publicada: boolean | null }[] {
  const dia = carimbo.publicado_em ? carimbo.publicado_em.slice(0, 10) : null;
  return entradas.map((entrada) => ({
    entrada,
    publicada: dia === null ? null : entrada.em <= dia,
  }));
}
