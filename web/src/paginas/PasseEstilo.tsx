// A varredura de estilo apontava e não tinha como ajudar a consertar: numa obra
// real o revisor desfez 57 mais-que-perfeitos à mão, um por um, com a lista de
// alertas aberta ao lado. Esta tela é o outro lado do laço — a IA propõe o par
// cirúrgico de cada violação que a varredura acusa, e aqui o revisor aprova,
// edita ou dispensa. Propor não escreve nada: quem grava é sempre um clique.
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aplicarCorrecao } from '@dao-tale/shared';
import type { Capitulo, Frase, ProgressoTraducao, ResultadoCorrecao } from '@dao-tale/shared';
import { api, mensagemDeErro } from '../api';
import {
  Aviso,
  Botao,
  CabecalhoPagina,
  Etiqueta,
  REGRA_ESTILO_ROTULO,
  TextoComDestaque,
  type CorEtiqueta,
} from '../App';
import { violacaoDaCorrecao, type CorrecaoPasse, type ViolacaoEstilo } from '../util/passeEstilo';
import { orientacaoDaRegra } from '../util/rotuloRegra';

interface DetalheCapitulo {
  capitulo: Capitulo;
  frases: Frase[];
  progresso: ProgressoTraducao;
}

interface RelatorioEstilo {
  frases_total: number;
  violacoes: ViolacaoEstilo[];
  por_terco: [number, number, number];
  ignoradas: number;
}

/** O que já aconteceu com cada correção nesta sessão. A lista do passe é um
 *  retrato do momento em que a IA respondeu: ela não se refaz sozinha, então é
 *  aqui que a linha aplicada para de parecer pendente. */
type Resolucao = 'aplicada' | 'dispensada';

/** O passe e tudo que o revisor já decidiu sobre ele. */
interface EstadoPasse {
  correcoes: CorrecaoPasse[];
  marcadas: Set<number>;
  emEdicao: Set<number>;
  textos: Record<number, string>;
  resolvidas: Record<number, Resolucao>;
}

const SEM_MARCA = new Set<number>();

export function PasseEstilo() {
  const { obraId, capituloId } = useParams();
  const clienteQuery = useQueryClient();

  const { data: detalhe } = useQuery({
    queryKey: ['capitulo', capituloId],
    queryFn: () => api<DetalheCapitulo>('GET', `/capitulos/${capituloId}`),
  });

  // A mesma consulta do modal de estilo do editor (mesma chave): é dela que sai
  // a trinca que o botão Dispensar precisa, e é ela que tem de encolher quando
  // uma correção é aplicada — a prova visível de que o conserto pegou.
  const {
    data: varredura,
    isLoading: varreduraCarregando,
    error: erroVarredura,
  } = useQuery({
    queryKey: ['estilo', capituloId],
    queryFn: () => api<RelatorioEstilo>('GET', `/capitulos/${capituloId}/estilo`),
    staleTime: 0,
  });

  /**
   * O resultado do passe mora no CACHE, não em `useState`.
   *
   * A tela existe justamente para o revisor sair até a frase e voltar (é a
   * razão de ela não ser um modal). Com estado local, "ir à frase" desmontava a
   * página e a volta trazia a lista vazia — e o passe é uma chamada paga, então
   * o revisor pagava de novo pela mesma resposta. As decisões já tomadas
   * (marcadas, editadas, aplicadas) vão junto pelo mesmo motivo.
   *
   * `enabled: false` porque isto não é uma consulta: nada aqui busca sozinho, o
   * passe só roda no botão. `gcTime: Infinity` porque o custo de descartar a
   * entrada é uma chamada paga, e o custo de guardá-la é uma lista pequena que
   * morre no primeiro recarregamento da página.
   */
  const chavePasse = ['passe', capituloId];
  const { data: estado } = useQuery<EstadoPasse | null>({
    queryKey: chavePasse,
    queryFn: () => null,
    enabled: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const correcoes = estado?.correcoes ?? null;
  const marcadas = estado?.marcadas ?? SEM_MARCA;
  const emEdicao = estado?.emEdicao ?? SEM_MARCA;
  const textos = estado?.textos ?? {};
  const resolvidas = estado?.resolvidas ?? {};

  const mudarEstado = (mudanca: (e: EstadoPasse) => EstadoPasse) =>
    clienteQuery.setQueryData<EstadoPasse | null>(chavePasse, (atual) => (atual ? mudanca(atual) : atual));

  // O erro anda colado na linha que falhou: "trecho não encontrado" no pé da
  // tela, sem dizer de quem, manda o revisor conferir 20 propostas uma a uma.
  // `origem` distingue quem parou — só a aplicação em série tem "e o resto não
  // foi", que é o que o resumo do pé anuncia. Fica em `useState` de propósito:
  // ao contrário das decisões, um erro velho não deve voltar com a tela.
  const [falha, setFalha] = useState<{ indice: number; mensagem: string; origem: 'aplicar' | 'dispensar' } | null>(
    null,
  );

  const frasesPorId = useMemo(
    () => new Map((detalhe?.frases ?? []).map((f) => [f.id, f])),
    [detalhe],
  );

  const invalidar = () => {
    clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
    clienteQuery.invalidateQueries({ queryKey: ['estilo', capituloId] });
  };

  const passe = useMutation({
    mutationFn: () => api<{ correcoes: CorrecaoPasse[] }>('POST', `/capitulos/${capituloId}/estilo/passe`),
    onSuccess: (r) => {
      clienteQuery.setQueryData<EstadoPasse>(chavePasse, {
        correcoes: r.correcoes,
        marcadas: new Set(),
        emEdicao: new Set(),
        textos: {},
        resolvidas: {},
      });
      setFalha(null);
    },
  });

  /** O texto que vai substituir o trecho: o editado, se o revisor mexeu. */
  const corrigidoDe = (i: number) => textos[i] ?? correcoes?.[i]?.trecho_pt_corrigido ?? '';

  /**
   * A prévia de uma correção, RECALCULADA sobre o texto que a frase tem AGORA e
   * não a que o servidor mandou junto com a proposta.
   *
   * A do servidor é um retrato do instante do passe. Duas violações na mesma
   * frase são o caso comum: aplicar a primeira muda o texto, e a prévia da
   * segunda passaria a mostrar a frase antiga — exatamente no momento em que
   * ela pode ter deixado de ancorar. O espalhamento (`...c`) preserva qualquer
   * campo que a rota venha a acrescentar ao par cirúrgico.
   *
   * Fica no PAI, e não na linha, porque quem monta o lote precisa da mesma
   * resposta: uma proposta que não ancora tem de sair de "Marcar todos" — a
   * caixa desabilitada sozinha não protege de nada.
   */
  const previaDe = (i: number): ResultadoCorrecao | null => {
    const c = correcoes?.[i];
    if (!c) return null;
    const frase = c.frase_id != null ? frasesPorId.get(c.frase_id) : undefined;
    return frase ? aplicarCorrecao(frase.texto_pt, { ...c, trecho_pt_corrigido: corrigidoDe(i) }) : c.previa;
  };

  /**
   * Aplica em SEQUÊNCIA e para no primeiro erro — serve tanto ao botão de uma
   * linha só quanto ao "Aplicar os marcados".
   *
   * A função devolve a falha em vez de lançá-la: parar no erro só é útil se o
   * que já foi gravado antes dele continuar marcado como aplicado na tela.
   * Lançar faria o react-query descartar `feitas`, e as linhas já gravadas
   * voltariam a parecer pendentes — convidando o revisor a aplicá-las de novo,
   * agora sobre um texto que já mudou.
   *
   * A ordem importa por outro motivo: duas violações na mesma frase são duas
   * chamadas sobre o MESMO texto, e a segunda só ancora depois que a primeira
   * gravou. Por isso é sequencial, nunca em paralelo.
   */
  const aplicar = useMutation({
    mutationFn: async (indices: number[]) => {
      const feitas: number[] = [];
      for (const i of indices) {
        const c = correcoes![i];
        try {
          await api('POST', `/frases/${c.frase_id}/estilo/aplicar`, {
            trecho_pt_errado: c.trecho_pt_errado,
            trecho_pt_corrigido: corrigidoDe(i),
          });
          feitas.push(i);
        } catch (e) {
          return { feitas, falhou: { indice: i, mensagem: mensagemDeErro(e), origem: 'aplicar' as const } };
        }
      }
      return { feitas, falhou: null };
    },
    onSuccess: (r) => {
      mudarEstado((e) => {
        const marcadasNovas = new Set(e.marcadas);
        for (const i of r.feitas) marcadasNovas.delete(i);
        return {
          ...e,
          marcadas: marcadasNovas,
          resolvidas: { ...e.resolvidas, ...Object.fromEntries(r.feitas.map((i) => [i, 'aplicada' as const])) },
        };
      });
      setFalha(r.falhou);
      invalidar();
    },
  });

  const dispensar = useMutation({
    mutationFn: (d: { indice: number; frase_id: number; regra: string; trecho: string }) =>
      api('POST', `/frases/${d.frase_id}/estilo/dispensar`, { regra: d.regra, trecho: d.trecho }),
    onSuccess: (_r, d) => {
      mudarEstado((e) => ({ ...e, resolvidas: { ...e.resolvidas, [d.indice]: 'dispensada' } }));
      setFalha(null);
      invalidar();
    },
    onError: (e, d) => setFalha({ indice: d.indice, mensagem: mensagemDeErro(e), origem: 'dispensar' }),
  });

  const ocupado = aplicar.isPending || dispensar.isPending;
  const pendentes = varredura?.violacoes ?? [];

  // Índices, não cópias: o índice é a identidade da correção (a rota não devolve
  // id) e é por ele que marcação, edição e resolução se acham.
  const indices = (correcoes ?? []).map((_, i) => i);
  const propostas = indices.filter((i) => !correcoes![i].descartar);
  const descartes = indices.filter((i) => correcoes![i].descartar);
  // Só entra no lote o que de fato ancora. Antes bastava ter frase, e "Marcar
  // todos" passava por cima da caixa desabilitada de quem não ancorava: numa
  // fila de 20 com 3 paráfrases, o lote gravava 4, batia 400 na 5ª e desistia
  // das 15 seguintes.
  const aplicaveis = propostas.filter((i) => {
    if (resolvidas[i] || correcoes![i].frase_id == null) return false;
    const p = previaDe(i);
    return p != null && p.tipo !== 'impossivel';
  });
  const marcadasValidas = [...marcadas].filter((i) => aplicaveis.includes(i)).sort((a, b) => a - b);

  /**
   * Qual ocorrência esta correção é entre as que citam a MESMA (ordem, regra).
   *
   * É o desempate de última instância de `violacaoDaCorrecao`, e o único
   * disponível quando `descartar: true` — o schema obriga `trecho_pt_errado` a
   * ser `null` nesse caso, então não há texto nenhum para ancorar. O modelo
   * recebe as violações de uma frase em lista e devolve uma correção por
   * violação, na mesma ordem: a enésima correção fala da enésima violação.
   */
  const ocorrencias = (() => {
    const vistas = new Map<string, number>();
    return (correcoes ?? []).map((c) => {
      const chave = `${c.ordem}|${c.regra}`;
      const n = vistas.get(chave) ?? 0;
      vistas.set(chave, n + 1);
      return n;
    });
  })();
  const violacaoDe = (i: number) => violacaoDaCorrecao(pendentes, correcoes![i], ocorrencias[i]);

  const capitulo = detalhe?.capitulo;

  return (
    <div>
      <CabecalhoPagina
        titulo={`Passe de estilo${capitulo ? ` — capítulo ${capitulo.numero}` : ''}`}
        descricao="A varredura acusa as violações das preferências desta obra; o passe pede à IA o conserto pontual de cada uma. Nada é gravado sem a sua aprovação."
      >
        <Link
          to={`/obras/${obraId}/capitulos/${capituloId}`}
          className="text-sm text-jade-forte hover:underline"
        >
          ‹ Voltar ao capítulo
        </Link>
        {/* Só desliga quando SABEMOS que não há nada. Com a varredura ainda
            carregando (ou falhada) o botão continua vivo: a rota do passe refaz
            a varredura no servidor e devolve lista vazia sem gastar chamada, o
            que é bem melhor que travar o revisor por causa de um GET que caiu. */}
        <Botao onClick={() => passe.mutate()} disabled={passe.isPending || (!!varredura && pendentes.length === 0)}>
          {passe.isPending ? 'Consultando a IA…' : correcoes ? 'Propor de novo' : 'Propor consertos'}
        </Botao>
      </CabecalhoPagina>

      {varreduraCarregando && <p className="mb-3 text-sm text-tinta-2">Verificando o estilo do capítulo…</p>}

      {/* Sem isto a tela mentia: a varredura que falha deixava `pendentes` vazio,
          e o aviso verde de "não há o que consertar" ficava permanente — o
          revisor concluía que o capítulo estava limpo depois de um 500. */}
      {erroVarredura && (
        <Aviso tipo="erro">
          Não deu para ler a varredura de estilo: {mensagemDeErro(erroVarredura)} Sem ela esta tela não sabe
          quantas violações existem, nem consegue dispensar alerta nenhum — recarregue antes de concluir que o
          capítulo está limpo.
        </Aviso>
      )}

      {varredura && (
        <p className="mb-3 text-sm text-tinta-2">
          {varredura.frases_total} frase{varredura.frases_total === 1 ? '' : 's'} ·{' '}
          {pendentes.length === 0 ? (
            <span className="font-medium text-jade-forte">nada fora das preferências.</span>
          ) : (
            <span className="font-medium text-selo-forte">
              {pendentes.length} fora das preferências
              {correcoes ? ' ainda na varredura.' : ' esperando conserto.'}
            </span>
          )}
          {varredura.ignoradas > 0 && (
            <> · {varredura.ignoradas} dispensada{varredura.ignoradas === 1 ? '' : 's'}</>
          )}
        </p>
      )}

      {varredura && pendentes.length === 0 && !correcoes && (
        <Aviso tipo="ok">
          Não há o que consertar neste capítulo — o passe nem chega a ser chamado quando a varredura está limpa,
          então não custa nada descobrir isso aqui.
        </Aviso>
      )}

      {passe.error && <Aviso tipo="erro">{mensagemDeErro(passe.error)}</Aviso>}

      {correcoes && propostas.length === 0 && descartes.length === 0 && (
        <Aviso tipo="info">
          A IA não devolveu conserto nenhum para estas violações. Vale reler os alertas no capítulo: pode ser
          caso de dispensar, ou de a regra estar acusando o que não deve.
        </Aviso>
      )}

      {correcoes && propostas.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display font-semibold">
              {propostas.length} conserto{propostas.length === 1 ? '' : 's'} proposto
              {propostas.length === 1 ? '' : 's'}
            </h3>
            {aplicaveis.length > 0 && (
              // Nada vem marcado de propósito: a premissa do projeto é revisão
              // humana integral, e uma tela que já chega com 57 caixas marcadas
              // convida ao clique único que ninguém leu. Marcar todos continua a
              // um clique de distância para quem já leu.
              <label className="flex items-center gap-1.5 text-sm text-tinta-2">
                <input
                  type="checkbox"
                  checked={marcadasValidas.length === aplicaveis.length}
                  onChange={(e) =>
                    mudarEstado((s) => ({ ...s, marcadas: e.target.checked ? new Set(aplicaveis) : new Set() }))
                  }
                  disabled={ocupado}
                />
                Marcar todos
              </label>
            )}
          </div>

          <div className="cartao">
            {propostas.map((i) => (
              <LinhaCorrecao
                key={i}
                correcao={correcoes[i]}
                frase={correcoes[i].frase_id != null ? (frasesPorId.get(correcoes[i].frase_id!) ?? null) : null}
                violacao={violacaoDe(i)}
                previa={previaDe(i)}
                obraId={obraId!}
                capituloId={capituloId!}
                corrigido={corrigidoDe(i)}
                editando={emEdicao.has(i)}
                marcada={marcadas.has(i)}
                resolucao={resolvidas[i]}
                ocupado={ocupado}
                erro={falha?.indice === i ? falha.mensagem : null}
                aoMarcar={(v) =>
                  mudarEstado((s) => {
                    const nova = new Set(s.marcadas);
                    if (v) nova.add(i);
                    else nova.delete(i);
                    return { ...s, marcadas: nova };
                  })
                }
                aoEditar={(texto) => mudarEstado((s) => ({ ...s, textos: { ...s.textos, [i]: texto } }))}
                aoAlternarEdicao={() =>
                  mudarEstado((s) => {
                    const nova = new Set(s.emEdicao);
                    if (nova.has(i)) nova.delete(i);
                    else nova.add(i);
                    return { ...s, emEdicao: nova };
                  })
                }
                aoAplicar={() => aplicar.mutate([i])}
                aoDispensar={(v) =>
                  dispensar.mutate({ indice: i, frase_id: v.frase_id!, regra: v.regra, trecho: v.trecho })
                }
              />
            ))}

            <div className="flex flex-wrap items-center gap-3 border-t border-linha bg-papel-fundo/60 px-4 py-3">
              <Botao
                onClick={() => aplicar.mutate(marcadasValidas)}
                disabled={marcadasValidas.length === 0 || ocupado}
              >
                {aplicar.isPending
                  ? 'Aplicando…'
                  : `Aplicar ${marcadasValidas.length} marcada${marcadasValidas.length === 1 ? '' : 's'}`}
              </Botao>
              <span className="text-xs text-tinta-2">
                Aplicadas na ordem da lista; a primeira que falhar interrompe o resto, e as anteriores ficam
                gravadas.
              </span>
            </div>
          </div>

          {aplicar.error && <Aviso tipo="erro">{mensagemDeErro(aplicar.error)}</Aviso>}
          {/* Resumo só da aplicação EM LOTE: numa fila de 20 a linha que falhou
              pode estar fora da tela, e o que a linha não diz é o que aconteceu
              com as outras 19. No botão de uma linha só, o erro já está nela. */}
          {falha?.origem === 'aplicar' && (aplicar.variables?.length ?? 0) > 1 && (
            <Aviso tipo="erro">
              Parou na frase {correcoes[falha.indice].ordem + 1}: {falha.mensagem} As correções anteriores da fila
              já estão gravadas; as seguintes não foram tentadas.
            </Aviso>
          )}
        </section>
      )}

      {correcoes && descartes.length > 0 && (
        <section>
          <h3 className="font-display font-semibold">A IA acha que não é violação</h3>
          <p className="mb-2 max-w-[62ch] text-sm text-tinta-2">
            A varredura é heurística por sufixo e erra — “romãzeira” e “prepara” já apareceram como
            mais-que-perfeito. Aqui a IA leu a frase e diz que está certa assim. Dispensar tira o alerta da
            varredura e da contagem, sem tocar no texto.
          </p>
          <div className="cartao">
            {descartes.map((i) => (
              <LinhaDescarte
                key={i}
                correcao={correcoes[i]}
                frase={correcoes[i].frase_id != null ? (frasesPorId.get(correcoes[i].frase_id!) ?? null) : null}
                violacao={violacaoDe(i)}
                obraId={obraId!}
                capituloId={capituloId!}
                resolucao={resolvidas[i]}
                ocupado={ocupado}
                erro={falha?.indice === i ? falha.mensagem : null}
                aoDispensar={(v) =>
                  dispensar.mutate({ indice: i, frase_id: v.frase_id!, regra: v.regra, trecho: v.trecho })
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Qual alerta exatamente vai sumir da varredura.
 *
 *  Quando a frase tem duas violações da MESMA regra, o de-para escolhe uma
 *  delas por posição (ver `violacaoDaCorrecao`) — uma escolha determinística,
 *  mas ainda assim uma escolha. Ela vai no title do botão para ser visível em
 *  vez de silenciosa: silenciar o alerta errado sem o revisor poder conferir é
 *  o que fazia o botão sumir na versão anterior. */
const alvoDoDispensar = (v: ViolacaoEstilo) =>
  `Tira da varredura o alerta “${REGRA_ESTILO_ROTULO[v.regra] ?? v.regra}” no trecho “${v.trecho}” — sem tocar no texto`;

/** Cabeçalho comum das duas listas: que regra, que frase, e o caminho de fuga
 *  para o texto — sempre disponível, porque nem toda decisão cabe num botão. */
function CabecalhoLinha({
  regra,
  ordem,
  fraseId,
  obraId,
  capituloId,
  resolucao,
  // Selo é "isto está errado"; ocre é "isto pede um olhar". No grupo do
  // descarte a IA já disse que não há erro, e um chip vermelho contradiria o
  // título logo acima dele.
  cor = 'selo',
}: {
  regra: string;
  ordem: number;
  fraseId: number | null;
  obraId: string;
  capituloId: string;
  resolucao?: Resolucao;
  cor?: CorEtiqueta;
}) {
  // O modelo ecoa a regra e o schema aceita string vazia; sem violação casada
  // para suprir o nome, uma etiqueta colorida em branco é só uma mancha na tela.
  const rotulo = REGRA_ESTILO_ROTULO[regra] ?? regra;
  // Só as regras do catálogo (Task 1) sabem dizer o que é certo — regra de
  // estilo puro devolve null e a linha de orientação nem aparece.
  const orientacao = orientacaoDaRegra(regra);
  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        {rotulo && <Etiqueta cor={resolucao ? 'neutro' : cor}>{rotulo}</Etiqueta>}
        <span className="text-xs text-tinta-2">frase {ordem + 1}</span>
        {fraseId != null && (
          <Link
            to={`/obras/${obraId}/capitulos/${capituloId}?frase=${fraseId}`}
            className="text-xs text-jade-forte hover:underline"
          >
            ir à frase
          </Link>
        )}
        {resolucao === 'aplicada' && <Etiqueta cor="indigo">aplicada</Etiqueta>}
        {resolucao === 'dispensada' && <Etiqueta cor="neutro">dispensada</Etiqueta>}
      </div>
      {/* Texto auxiliar, subordinado ao rótulo acima — não um bloco que
          compete com ele. */}
      {orientacao && <p className="mt-1 text-xs text-tinta-2">{orientacao}</p>}
    </>
  );
}

function LinhaCorrecao({
  correcao,
  frase,
  violacao,
  previa,
  obraId,
  capituloId,
  corrigido,
  editando,
  marcada,
  resolucao,
  ocupado,
  erro,
  aoMarcar,
  aoEditar,
  aoAlternarEdicao,
  aoAplicar,
  aoDispensar,
}: {
  correcao: CorrecaoPasse;
  frase: Frase | null;
  violacao: ViolacaoEstilo | null;
  /** Calculada no pai (ver `previaDe`) — o lote precisa da mesma resposta. */
  previa: ResultadoCorrecao | null;
  obraId: string;
  capituloId: string;
  corrigido: string;
  editando: boolean;
  marcada: boolean;
  resolucao?: Resolucao;
  ocupado: boolean;
  erro: string | null;
  aoMarcar: (v: boolean) => void;
  aoEditar: (texto: string) => void;
  aoAlternarEdicao: () => void;
  aoAplicar: () => void;
  aoDispensar: (v: ViolacaoEstilo) => void;
}) {
  const errado = correcao.trecho_pt_errado ?? '';
  const textoAtual = frase?.texto_pt ?? '';

  const impossivel = !frase || previa == null || previa.tipo === 'impossivel';
  const podeAplicar = !resolucao && !impossivel && !ocupado;

  /**
   * RAMO INALCANÇÁVEL HOJE, mantido por desenho.
   *
   * `aplicarCorrecao` só devolve `frase-inteira` quando a correção traz
   * `correcao_proposta`, e o contrato do passe (`CONTRATO_PASSE_ESTILO`,
   * `respostaPasseEstiloSchema`) não tem esse campo — só o par cirúrgico. Par
   * que não ancora cai em `impossivel`, nunca aqui. Se um dia o contrato ganhar
   * `correcao_proposta`, isto acorda pronto.
   *
   * A condição é a MESMA da gaveta de revisão (`encurtaMuito`, que é
   * `propostaPareceTrecho`), não "todo frase-inteira": o aviso fala em "bem mais
   * curta que a frase atual", e dispará-lo para uma proposta do mesmo tamanho
   * seria um aviso que mente — e aviso que mente é aviso que se aprende a
   * ignorar. Texto do parágrafo e do confirm são os de lá, palavra por palavra.
   */
  const encurtaDemais = previa?.tipo === 'frase-inteira' && previa.encurtaMuito;

  function confirmarEAplicar() {
    if (
      previa?.tipo === 'frase-inteira' &&
      previa.encurtaMuito &&
      !window.confirm(
        'A correção proposta é bem mais curta que a frase atual e pode ser só um trecho dela.\n\n' +
          'Aplicar SUBSTITUI a frase inteira:\n\n' +
          `ATUAL:\n${textoAtual}\n\nFICARÁ:\n${previa.texto}\n\n` +
          'Aplicar mesmo assim?',
      )
    ) {
      return;
    }
    aoAplicar();
  }

  return (
    <div
      className={`border-b border-linha/50 px-4 py-3 last:border-b-0 ${resolucao ? 'text-tinta-2 opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={marcada}
          onChange={(e) => aoMarcar(e.target.checked)}
          disabled={!podeAplicar}
          title={
            impossivel
              ? 'Esta proposta não ancora no texto atual — aplicar em lote falharia nela'
              : 'Incluir em “Aplicar as marcadas”'
          }
          className="mt-1.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <CabecalhoLinha
            regra={violacao?.regra ?? correcao.regra}
            ordem={correcao.ordem}
            fraseId={correcao.frase_id}
            obraId={obraId}
            capituloId={capituloId}
            resolucao={resolucao}
          />

          <p className="text-sm leading-relaxed">
            <TextoComDestaque texto={textoAtual} trecho={errado || (violacao?.trecho ?? '')} />
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
            <span className="rounded bg-selo-tint px-1.5 py-0.5 text-selo-forte">{errado || '—'}</span>
            <span className="text-tinta-2">→</span>
            {editando ? (
              <input
                value={corrigido}
                onChange={(e) => aoEditar(e.target.value)}
                placeholder="(vazio = apagar o trecho)"
                title="O que o trecho acusado deve virar; a prévia abaixo acompanha"
                className="entrada min-w-0 flex-1 text-sm"
              />
            ) : (
              <span className="rounded bg-jade-tint px-1.5 py-0.5 text-jade-forte">{corrigido || '(nada)'}</span>
            )}
          </div>

          {/* A prévia só ganha linha própria quando acrescenta algo: com a troca
              cirúrgica desenhada acima, repetir a frase inteira é ruído. */}
          {!resolucao && impossivel && (
            <p className="mt-1.5 rounded border border-erro/40 bg-papel-alto px-2 py-1 text-xs">
              <strong>Não dá para aplicar:</strong>{' '}
              {frase
                ? `o trecho “${errado}” não aparece exatamente uma vez no texto atual da frase. A IA pode ter parafraseado ao copiar, ou o texto mudou desde o passe. Conserte à mão na frase, ou rode o passe de novo.`
                : 'esta proposta não aponta para nenhuma frase deste capítulo.'}
            </p>
          )}

          {!resolucao && previa?.tipo === 'frase-inteira' && (
            <>
              {encurtaDemais && (
                <p className="mt-1.5 rounded border border-erro/40 bg-papel-alto px-2 py-1 text-xs">
                  <strong>Atenção:</strong> a proposta é bem mais curta que a frase atual (
                  {previa.texto.trim().length} contra {textoAtual.trim().length} caracteres). Ela pode ser só o
                  trecho corrigido — e aplicar <strong>substitui a frase inteira</strong>, apagando o resto.
                  Confira antes; se for o caso, edite a frase à mão em vez de aplicar.
                </p>
              )}
              <p className="mt-1.5 rounded bg-papel-fundo/60 px-2 py-1 text-sm">{previa.texto}</p>
            </>
          )}

          {erro && <p className="mt-1.5 text-xs text-selo-forte">{erro}</p>}

          {!resolucao && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Botao onClick={confirmarEAplicar} disabled={!podeAplicar}>
                Aplicar
              </Botao>
              <Botao variante="secundario" onClick={aoAlternarEdicao} disabled={ocupado}>
                {editando ? 'Fechar edição' : 'Editar'}
              </Botao>
              {violacao?.frase_id != null && (
                <Botao
                  variante="secundario"
                  onClick={() => aoDispensar(violacao)}
                  disabled={ocupado}
                  title={alvoDoDispensar(violacao)}
                >
                  Dispensar
                </Botao>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Correção com `descartar: true`: a IA leu a frase e diz que a varredura errou.
 *  Sem botão de aplicar — não há par cirúrgico nenhum para aplicar — e com
 *  Dispensar como ação principal, que é a decisão que a linha está pedindo. */
function LinhaDescarte({
  correcao,
  frase,
  violacao,
  obraId,
  capituloId,
  resolucao,
  ocupado,
  erro,
  aoDispensar,
}: {
  correcao: CorrecaoPasse;
  frase: Frase | null;
  violacao: ViolacaoEstilo | null;
  obraId: string;
  capituloId: string;
  resolucao?: Resolucao;
  ocupado: boolean;
  erro: string | null;
  aoDispensar: (v: ViolacaoEstilo) => void;
}) {
  return (
    <div className={`border-b border-linha/50 px-4 py-3 last:border-b-0 ${resolucao ? 'opacity-60' : ''}`}>
      <CabecalhoLinha
        regra={violacao?.regra ?? correcao.regra}
        ordem={correcao.ordem}
        fraseId={correcao.frase_id}
        obraId={obraId}
        capituloId={capituloId}
        resolucao={resolucao}
        cor="ocre"
      />
      <p className="text-sm leading-relaxed">
        <TextoComDestaque texto={frase?.texto_pt ?? ''} trecho={violacao?.trecho ?? ''} />
      </p>
      {erro && <p className="mt-1.5 text-xs text-selo-forte">{erro}</p>}
      {!resolucao && violacao?.frase_id != null && (
        <div className="mt-2">
          <Botao onClick={() => aoDispensar(violacao)} disabled={ocupado} title={alvoDoDispensar(violacao)}>
            Dispensar — está certo assim
          </Botao>
        </div>
      )}
    </div>
  );
}
