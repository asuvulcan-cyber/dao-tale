import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

// Guia de uso do aplicativo: página estática com sumário lateral e seções
// ancoradas (padrão "getting started"). Sem dados do servidor — só conteúdo.

const SECOES = [
  { id: 'comecando', titulo: 'Começando' },
  { id: 'chaves', titulo: 'Chaves de API' },
  { id: 'traduzindo', titulo: 'Traduzindo um capítulo' },
  { id: 'glossario', titulo: 'Glossário e termos sugeridos' },
  { id: 'prompt-mae', titulo: 'Prompt mãe' },
  { id: 'revisao', titulo: 'Revisão com IA' },
  { id: 'cotas', titulo: 'Cotas e uso' },
  { id: 'economia', titulo: 'Economizando tokens' },
  { id: 'dados', titulo: 'Backup e dados' },
  { id: 'publicar', titulo: 'Publicar uma obra' },
];

function Secao({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="font-display text-xl font-semibold tracking-tight">{titulo}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-tinta">{children}</div>
    </section>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-4 font-medium text-tinta">{children}</h3>;
}

function Passos({ itens }: { itens: React.ReactNode[] }) {
  return (
    <ol className="list-decimal space-y-1.5 pl-5">
      {itens.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

function LinkExterno({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-jade-forte underline">
      {children}
    </a>
  );
}

/** Cartão de um provedor na seção de chaves: onde criar a chave e o que esperar. */
function CartaoProvedor({
  nome,
  gratis,
  children,
}: {
  nome: string;
  gratis: string;
  children: React.ReactNode;
}) {
  return (
    <div className="cartao p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{nome}</span>
        <span className="text-xs text-tinta-2">{gratis}</span>
      </div>
      <div className="mt-1.5 space-y-1.5 text-sm text-tinta-2">{children}</div>
    </div>
  );
}

export function Docs() {
  // Navegação SPA não rola até a âncora sozinha (ex.: link /docs#chaves vindo
  // de Configurações) — rola manualmente quando o hash muda.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <div className="flex gap-8">
      {/* Sumário lateral (some no mobile; as âncoras continuam funcionando) */}
      <nav className="sticky top-6 hidden h-fit w-48 shrink-0 md:block" aria-label="Sumário do guia">
        <p className="olho mb-2">Guia de uso</p>
        <ul className="space-y-1 border-l border-linha text-sm">
          {SECOES.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="-ml-px block border-l-2 border-transparent py-0.5 pl-3 text-tinta-2 hover:border-jade hover:text-tinta">
                {s.titulo}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 max-w-[72ch] flex-1 space-y-10 pb-16">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Guia de uso</h1>
          <p className="mt-1 text-sm text-tinta-2">
            Como traduzir uma obra do chinês ao português com o Dao Tale, do zero à exportação — incluindo como
            criar chaves de API gratuitas e gastar o mínimo possível de tokens.
          </p>
        </div>

        <Secao id="comecando" titulo="Começando">
          <p>
            O Dao Tale é um estúdio local de tradução assistida por IA para novels em chinês. Ele quebra cada
            capítulo em frases, traduz em blocos mantendo consistência de nomes e estilo, e guarda tudo num banco
            local — nada sai da sua máquina além das chamadas diretas à API de IA que você escolher.
          </p>
          <p>O fluxo completo tem cinco passos:</p>
          <Passos
            itens={[
              <>
                <strong>Configure um provedor de IA</strong> em <Link className="text-jade-forte underline" to="/configuracoes">Configurações</Link>:
                cole uma chave de API (veja <a href="#chaves" className="text-jade-forte underline">como criar uma</a>) e
                escolha provedor e modelo padrão. Sem chave nenhuma, o provedor <em>Simulado</em> permite testar o
                fluxo inteiro com traduções de mentira.
              </>,
              <>
                <strong>Crie a obra</strong> na tela inicial: título, sinopse, capa e tags são opcionais, mas o{' '}
                <em>prompt mãe</em> (as regras de tradução da obra) é obrigatório para traduzir — um modelo inicial
                é oferecido na criação.
              </>,
              <>
                <strong>Adicione capítulos</strong> colando o texto em chinês. O aplicativo segmenta o texto em
                frases automaticamente; você pode dividir ou juntar frases depois, no editor.
              </>,
              <>
                <strong>Traduza</strong> com o botão "Traduzir" do capítulo. O progresso avança a cada bloco de
                frases concluído e pode ser pausado e retomado a qualquer momento (<a href="#traduzindo" className="text-jade-forte underline">detalhes</a>).
              </>,
              <>
                <strong>Revise e exporte</strong>: edite frases no editor lado a lado, questione escolhas da IA com
                o Protocolo de Revisão e baixe o capítulo pronto em Markdown.
              </>,
            ]}
          />
        </Secao>

        <Secao id="chaves" titulo="Chaves de API">
          <p>
            O aplicativo não tem servidor próprio de IA: ele chama a API do provedor que você configurar, com a sua
            chave. Criar chave é grátis em todos os provedores abaixo — vários têm nível gratuito de uso que já dá
            para traduzir bastante. A chave é colada em{' '}
            <Link className="text-jade-forte underline" to="/configuracoes">Configurações → Chaves de API</Link>, onde o
            botão <em>Testar</em> confirma que ela funciona.
          </p>
          <p className="text-tinta-2">
            Regra geral em todos: crie a conta, gere a chave, copie-a na hora (alguns sites só a mostram uma vez) e
            cole aqui. Nunca compartilhe a chave nem a suba para repositórios públicos.
          </p>

          <div className="grid gap-3">
            <CartaoProvedor nome="Gemini (Google)" gratis="Nível gratuito generoso — melhor ponto de partida">
              <p>
                Crie a chave no <LinkExterno href="https://aistudio.google.com/apikey">Google AI Studio</LinkExterno> com
                uma conta Google ("Create API key"). Sem cartão de crédito.
              </p>
              <p>
                O plano gratuito renova por dia; use os apelidos <code>gemini-flash-latest</code> (recomendado) e{' '}
                <code>gemini-flash-lite-latest</code> — o lite tem cota diária separada, dobrando o que dá para
                traduzir de graça. Os limites reais da sua conta aparecem em{' '}
                <LinkExterno href="https://aistudio.google.com/rate-limit">aistudio.google.com/rate-limit</LinkExterno>.
              </p>
            </CartaoProvedor>

            <CartaoProvedor nome="DeepSeek" gratis="Sem nível gratuito contínuo, mas muito barato — e forte em chinês">
              <p>
                Crie a conta em <LinkExterno href="https://platform.deepseek.com">platform.deepseek.com</LinkExterno> e gere a
                chave em "API Keys". Novas contas ganham um bônus de tokens para testar; depois é pré-pago, com
                preço na faixa de centavos de dólar por milhão de tokens.
              </p>
              <p>
                Por ser um modelo chinês, é uma das melhores relações custo-qualidade para traduzir do chinês. Use{' '}
                <code>deepseek-v4-flash</code> para traduzir; o modelo com raciocínio serve melhor para revisão.
              </p>
            </CartaoProvedor>

            <CartaoProvedor nome="OpenRouter" gratis="Modelos ':free' — 50 req/dia grátis (1000 com US$ 10 de recarga única)">
              <p>
                Uma chave só dá acesso a centenas de modelos de vários fabricantes. Crie a conta em{' '}
                <LinkExterno href="https://openrouter.ai/keys">openrouter.ai/keys</LinkExterno> e gere a chave — sem cartão.
              </p>
              <p>
                Modelos com sufixo <code>:free</code> não gastam créditos, mas têm limite diário de requisições e
                podem mudar de catálogo sem aviso. Prefira famílias fortes em chinês (Qwen, DeepSeek, GLM, Kimi).
              </p>
            </CartaoProvedor>

            <CartaoProvedor nome="Groq" gratis="Nível gratuito real por dia — e o mais rápido de todos">
              <p>
                Crie a conta em <LinkExterno href="https://console.groq.com/keys">console.groq.com/keys</LinkExterno> e gere a
                chave. O plano gratuito dá cerca de 1.000 requisições/dia por modelo (30 por minuto) — de sobra
                para uso pessoal.
              </p>
              <p>
                Serve modelos abertos (Llama, Qwen, GPT-OSS) com velocidade altíssima. Qualidade de tradução um
                degrau abaixo de Gemini/DeepSeek, mas ótimo para rascunhos e volume.
              </p>
            </CartaoProvedor>

            <CartaoProvedor nome="Mistral (La Plateforme)" gratis="Tier gratuito de experimentação cobre todos os modelos">
              <p>
                Crie a conta em <LinkExterno href="https://console.mistral.ai">console.mistral.ai</LinkExterno>, ative o plano
                "Experiment" (gratuito) e gere a chave em "API Keys".
              </p>
              <p>
                O tier gratuito é para avaliação, com limites que aparecem no próprio console. Menos forte em
                chinês que as opções acima — vale como alternativa quando as outras cotas acabarem.
              </p>
            </CartaoProvedor>

            <CartaoProvedor nome="Claude (Anthropic)" gratis="Sem nível gratuito — qualidade máxima, pago">
              <p>
                Crie a conta em <LinkExterno href="https://console.anthropic.com">console.anthropic.com</LinkExterno>, adicione
                créditos e gere a chave em "API Keys".
              </p>
              <p>
                Melhor qualidade literária de tradução entre os provedores suportados; o aplicativo usa cache de
                prompt automaticamente para reduzir o custo dos blocos seguintes de cada capítulo.
              </p>
            </CartaoProvedor>
          </div>

          <Sub>Qual escolher?</Sub>
          <p>
            Para começar sem gastar nada: <strong>Gemini</strong> (limites diários folgados) com{' '}
            <strong>Groq</strong> ou <strong>OpenRouter :free</strong> de reserva para quando a cota do dia acabar.
            Quando quiser pagar pouco por qualidade alta em chinês: <strong>DeepSeek</strong>. Para o texto final
            de capítulos importantes: <strong>Claude</strong>.
          </p>
          <p>
            E não precisa escolher no escuro: a aba <strong>Comparar modelos</strong> de cada obra passa o mesmo
            trecho por vários provedores/modelos de uma vez e mostra as traduções lado a lado — também serve para
            confirmar que uma chave recém-criada funciona.
          </p>
        </Secao>

        <Secao id="traduzindo" titulo="Traduzindo um capítulo">
          <p>
            A tradução acontece em <strong>blocos de frases</strong> (tamanho configurável, padrão 20). Cada bloco
            é enviado com o prompt mãe, os termos de glossário relevantes, as últimas frases já traduzidas (para
            continuidade de tom) e algumas frases futuras ainda em chinês (para contexto). O título do capítulo é
            traduzido junto com o primeiro bloco.
          </p>
          <Passos
            itens={[
              <>Abra o capítulo e clique em <strong>Traduzir</strong>. Você pode escolher provedor/modelo só para esta execução ou usar os padrões da obra.</>,
              <>Acompanhe o progresso: as frases do bloco em tradução aparecem pulsando como "(traduzindo…)" e o texto chega a cada bloco concluído. Pode fechar a página: o trabalho segue no servidor local.</>,
              <>Erros transitórios são retentados sozinhos (com espera crescente). Um bloco que falhar de vez é marcado com erro e a tradução continua no resto do capítulo.</>,
              <>Se a cota do provedor acabar (erro 429) e a opção "usar somente a cota gratuita" estiver ligada, a tradução <strong>pausa limpa</strong> — use <strong>Retomar tradução</strong> quando o limite renovar.</>,
              <>"Sobrescrever" retraduz frases já traduzidas; por padrão as frases <em>editadas à mão</em> são preservadas, a menos que você marque sobrescrevê-las também.</>,
            ]}
          />
          <p>
            No editor, cada frase mostra o chinês e o português lado a lado. Editar uma frase marca-a como editada
            manualmente e guarda a versão original da IA no histórico de revisões da frase.
          </p>
        </Secao>

        <Secao id="glossario" titulo="Glossário e termos sugeridos">
          <p>
            O glossário é o que mantém nomes de personagens, técnicas e lugares consistentes ao longo da obra.
            Cada entrada tem o termo em chinês, a tradução adotada, uma categoria e uma nota opcional.
          </p>
          <p>
            Durante a tradução, a IA aponta termos novos que encontrou e ainda não estão no glossário. Eles caem em{' '}
            <strong>Termos sugeridos</strong> como pendentes: aceite (vira entrada de glossário) ou rejeite. Nada
            entra no glossário sem a sua aprovação.
          </p>
          <p>
            O glossário pode ser importado e exportado em CSV — útil para migrar traduções começadas em outra
            ferramenta.
          </p>
        </Secao>

        <Secao id="prompt-mae" titulo="Prompt mãe">
          <p>
            O prompt mãe é o manual de estilo da obra: tom narrativo, tratamento entre personagens, convenções de
            nomes, o que manter em pinyin, formatação de pensamentos e falas, etc. Ele é enviado em toda chamada de
            tradução e revisão — quanto mais claro, mais consistente o resultado.
          </p>
          <p>
            Ele é <strong>versionado</strong>: cada edição pode virar uma versão nova com notas do que mudou, e uma
            versão fica marcada como ativa. Assim dá para saber com quais regras cada capítulo foi traduzido e
            voltar atrás se uma mudança piorar o resultado.
          </p>
        </Secao>

        <Secao id="revisao" titulo="Revisão com IA">
          <p>
            Estranhou uma escolha de tradução? Selecione a frase no editor e faça uma pergunta ("esse nome não
            deveria seguir o glossário?", "esse tom está certo aqui?"). O <strong>Protocolo de Revisão</strong>{' '}
            responde à pergunta que você fez — a resposta trata do motivo que você declarou, e não de um resumo
            genérico da frase. Junto vêm o trecho chinês que fundamenta a resposta e, se for o caso, a frase
            corrigida completa, que você aplica com um clique.
          </p>
          <p>
            O veredito tem <strong>três</strong> valores: <em>correto</em>, <em>incorreto</em> e{' '}
            <em>escolha legítima</em> — este último para quando a tradução não está errada, mas também não é a
            única leitura defensável. Sem ele, toda divergência de gosto era espremida em "correto" com uma regra
            inventada em cima. <strong>Regra e justificativa só aparecem quando uma regra decide o caso</strong>;
            na maioria das perguntas não há regra nenhuma em jogo, e o campo fica vazio de propósito.
          </p>
          <p>
            A revisão é uma <strong>conversa</strong>, não um oráculo. No pé da resposta você pode{' '}
            <strong>replicar</strong> — pedir alternativa, dar contexto, contestar — e a IA responde sabendo o que
            já disse no fio. E pode <strong>discordar</strong>: o veredito é descartado (com um motivo opcional,
            que vira insumo do refinamento do prompt) e para de contar como padrão recorrente. Replicar e discordar
            são gestos diferentes: um continua a discussão, o outro a encerra.
          </p>
          <p>
            Cada turno vira um caso no <strong>Banco de testes</strong> da obra, com a etiqueta da camada dona da
            regra citada (Alfa, Beta ou Delta). Marque os casos como confirmados/corrigidos e use os que exigirem
            "regra nova" como lembrete de atualizar a camada certa.
          </p>
        </Secao>

        <Secao id="cotas" titulo="Cotas e uso">
          <p>
            O aplicativo conta localmente as requisições feitas a cada provedor e mostra uma barra de cota diária
            (configurável em <Link className="text-jade-forte underline" to="/configuracoes">Configurações</Link>). Importante
            entender o que essa contagem é — e o que não é:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              As APIs <strong>não expõem o consumo da sua conta</strong> para o aplicativo consultar; a barra é uma
              estimativa local, que zera à meia-noite do seu fuso e não enxerga uso feito fora do aplicativo.
            </li>
            <li>
              A fonte da verdade é o painel do provedor: no Gemini,{' '}
              <LinkExterno href="https://aistudio.google.com/usage">aistudio.google.com/usage</LinkExterno> mostra o consumo
              real e <LinkExterno href="https://aistudio.google.com/rate-limit">aistudio.google.com/rate-limit</LinkExterno>{' '}
              mostra os limites vigentes da sua conta (eles variam por conta e mudam sem aviso — copie o valor de
              lá para o campo de cota do aplicativo). Groq, OpenRouter e Mistral têm páginas equivalentes no
              console de cada um.
            </li>
            <li>
              As cotas diárias dos provedores renovam em horários próprios (o Gemini, por exemplo, à meia-noite do
              Pacífico) — a barra local pode zerar antes ou depois do provedor.
            </li>
            <li>
              Com "usar somente a cota gratuita" ligado, o aviso definitivo é o <strong>429 do próprio provedor</strong>:
              a tradução pausa na hora certa mesmo que a estimativa local esteja defasada.
            </li>
          </ul>
        </Secao>

        <Secao id="economia" titulo="Economizando tokens">
          <p>O aplicativo já corta gasto sozinho em três frentes:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Glossário relevante</strong> (Configurações, ligado por padrão): cada bloco leva só os termos
              do glossário que aparecem no trecho, em vez do glossário inteiro — em obras longas isso costuma ser o
              maior corte de tokens de entrada.
            </li>
            <li>
              <strong>Raciocínio desligado na tradução</strong>: em modelos Gemini 2.5 Flash o "thinking" é
              desativado nas chamadas de tradução (ele encarece a saída sem melhorar texto literário). Na revisão o
              raciocínio fica ligado, porque lá ele melhora o veredito.
            </li>
            <li>
              <strong>Cache de prompt</strong> (Claude): as regras da obra são cacheadas entre blocos do mesmo
              capítulo, reduzindo o custo de entrada dos blocos seguintes.
            </li>
          </ul>
          <Sub>O que você controla</Sub>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Frases por bloco</strong>: blocos maiores repetem menos vezes o prompt mãe (menos tokens e
              menos requisições — importante em cota por requisição, como a do Gemini), mas um erro invalida mais
              frases de uma vez. 20–40 é um bom intervalo.
            </li>
            <li>
              <strong>Cauda de contexto</strong>: 2–3 frases bastam para continuidade; valores altos pagam tokens
              sem ganho perceptível.
            </li>
            <li>
              <strong>Modelo pelo tamanho da tarefa</strong>: rascunho de volume com Flash/Groq; texto final com
              DeepSeek/Claude/Pro. Não gaste modelo caro em capítulo que você ainda vai retrabalhar.
            </li>
            <li>
              <strong>Prompt mãe enxuto</strong>: ele acompanha toda chamada — regras redundantes ou exemplos
              longos demais custam em todos os blocos de todos os capítulos.
            </li>
            <li>
              <strong>Traduza uma vez</strong>: "Sobrescrever" retraduz o capítulo inteiro; para consertar frases
              pontuais, edite à mão ou use a revisão, que custa uma requisição só.
            </li>
          </ul>
        </Secao>

        <Secao id="dados" titulo="Backup e dados">
          <p>
            Tudo fica no diretório de dados mostrado em Configurações: banco SQLite com obras, frases, glossário,
            prompts e histórico, além das chaves (no cofre do sistema quando disponível). Para backup manual, copie
            o diretório inteiro com o aplicativo fechado.
          </p>
          <p>
            Cada obra também pode ser exportada/importada como arquivo JSON (na lista de obras), e capítulos prontos
            saem em Markdown pelo editor.
          </p>
        </Secao>

        <Secao id="publicar" titulo="Publicar uma obra">
          <p>
            Quando o app está hospedado com senha, ele pode mostrar uma <strong>vitrine</strong> para quem abrir o
            endereço sem entrar: uma estante com as obras publicadas e um leitor limpo. É o único pedaço do Dao Tale
            que responde sem senha.
          </p>
          <Sub>Precisa dos dois sins</Sub>
          <Passos
            itens={[
              <>
                A <strong>obra</strong> precisa estar publicada — o botão fica na aba de capítulos, em{' '}
                <em>Editar detalhes</em>.
              </>,
              <>
                O <strong>capítulo</strong> precisa estar com status <em>finalizado</em>. Rascunho, traduzido e
                revisado ficam de fora.
              </>,
            ]}
          />
          <p>
            Publicar uma obra não publica o que ainda está sendo revisado: capítulo novo só aparece na rua quando você
            o marca como finalizado. <strong>Tirar do ar</strong> é um clique e vale na hora.
          </p>
          <Sub>O que a vitrine nunca mostra</Sub>
          <p>
            Glossário, prompt mãe, custos, banco de testes, termos sugeridos, o texto original em chinês e os
            downloads (EPUB, PDF, Markdown) continuam só seus. O visitante lê o português na tela e nada mais — nem
            consegue ver quantos capítulos inéditos existem.
          </p>
          <p>
            Buscadores são desencorajados por padrão (<code>robots.txt</code>), porque publicar é para mandar o link a
            quem você quiser; aparecer no Google é outra decisão.
          </p>
        </Secao>
      </div>
    </div>
  );
}
