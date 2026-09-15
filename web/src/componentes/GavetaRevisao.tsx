// A gaveta saiu de EditorCapitulo.tsx (que passava de 1500 linhas) quando o fio de
// réplicas acrescentou estado próprio. Não é refactor oportunista: é a linha em que
// o arquivo deixava de caber inteiro na cabeça de quem o edita.
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aplicarCorrecao as aplicarCorrecao_previa, propostaPareceTrecho } from '@dao-tale/shared';
import type { CasoTeste, Frase } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, Etiqueta, EtiquetaCamada, STATUS_CASO_ROTULO, VEREDITO_ROTULO } from '../App';
import { agruparEmFios } from './fios';

interface TermoExtraido {
  termo_zh: string;
  termo_pt: string;
  categoria?: string;
  contexto?: string;
}

/**
 * Um turno do fio, só leitura: a pergunta do revisor e o que a IA respondeu.
 *
 * `resposta` é o texto principal — ela trata do motivo declarado na pergunta.
 * Regra e justificativa descem para uma linha discreta e só aparecem quando uma
 * REGRA decide o caso; na maioria das revisões elas vêm vazias, e um parágrafo
 * vazio no meio da conversa é pior que ausência.
 *
 * `acaoProposta` é o que torna a caixa da correção acionável. A caixa NÃO decide
 * sozinha se pode ser aplicada: quem sabe disso é o fio inteiro, e uma caixa ocre
 * sem botão promete uma decisão que não existe naquele ponto da tela.
 */
function TurnoFio({
  caso,
  frase,
  acaoProposta,
}: {
  caso: CasoTeste;
  frase: Frase;
  acaoProposta?: React.ReactNode;
}) {
  const veredito = VEREDITO_ROTULO[caso.veredito];
  const status = STATUS_CASO_ROTULO[caso.status];
  // A migração 022 copiou `justificativa` para `resposta` nos casos anteriores ao
  // fio: sem esta comparação todo caso antigo mostraria o mesmo texto duas vezes.
  const justificativaPropria = caso.justificativa && caso.justificativa !== caso.resposta;
  return (
    <div className="space-y-1.5">
      <p className="rounded bg-papel-fundo/60 px-2 py-1.5 text-sm">
        <span className="mr-1.5 text-xs font-medium uppercase text-tinta-2">você</span>
        {caso.pergunta}
      </p>
      <div className="space-y-1.5 border-l-2 border-linha pl-2.5 text-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <Etiqueta cor={veredito.cor}>{veredito.texto}</Etiqueta>
          {caso.status !== 'pendente' && status && <Etiqueta cor={status.cor}>{status.texto}</Etiqueta>}
          <span className="text-xs text-tinta-2">
            {new Date(caso.criado_em).toLocaleDateString('pt-BR')} · caso #{caso.id}
          </span>
        </div>
        {/* O trecho que fundamenta a resposta; a frase inteira já está no topo da gaveta. */}
        {caso.trecho_zh && caso.trecho_zh !== frase.texto_zh && (
          <p className="texto-zh rounded bg-papel-fundo/60 px-2 py-1 text-xs">{caso.trecho_zh}</p>
        )}
        <p>{caso.resposta}</p>
        {(caso.secao_regra || justificativaPropria) && (
          <p className="text-xs text-tinta-2">
            {caso.secao_regra && (
              <>
                <span className="mr-1.5">regra: {caso.secao_regra}</span>
                <EtiquetaCamada rotulo={caso.secao_regra} />
              </>
            )}
            {justificativaPropria && <span className="ml-1.5">{caso.justificativa}</span>}
          </p>
        )}
        {caso.motivo_rejeicao && (
          <p className="text-xs text-tinta-2">
            <span className="font-medium">Você discordou:</span> {caso.motivo_rejeicao}
          </p>
        )}
        {caso.correcao_proposta && (
          <div
            className={
              acaoProposta || caso.status === 'corrigido'
                ? 'rounded border border-ocre/50 bg-ocre-tint p-2'
                : // Ocre é o pigmento de "isto pede uma decisão sua". Sem ação possível
                  // aqui, a caixa fica neutra: ela é registro do que a IA propôs, não um
                  // botão que sumiu.
                  'rounded border border-linha bg-papel-fundo/60 p-2 text-tinta-2'
            }
          >
            <p className="mb-1 text-xs font-medium">Correção proposta</p>
            <p>{caso.correcao_proposta}</p>
            {acaoProposta}
            {!acaoProposta && caso.status === 'corrigido' && (
              <p className="mt-2">
                <Etiqueta cor="indigo">Correção aplicada</Etiqueta>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function GavetaRevisao({
  frase,
  referencia,
  proxima,
  capituloId,
  aoFechar,
  aoEditarTexto,
}: {
  frase: Frase;
  referencia: string;
  proxima: Frase | null;
  capituloId: string;
  aoFechar: () => void;
  aoEditarTexto: (antes: string, depois: string, fraseId: number) => void;
}) {
  const clienteQuery = useQueryClient();
  const { obraId } = useParams();
  const [pergunta, setPergunta] = useState('');
  const [replica, setReplica] = useState('');
  const [discordando, setDiscordando] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [erro, setErro] = useState('');
  const [dividindo, setDividindo] = useState(false);
  const [textoPt, setTextoPt] = useState(frase.texto_pt);

  /**
   * Fecha a caixa de discordância APAGANDO o motivo — os dois são um estado só.
   *
   * `motivo_rejeicao` não é um rascunho: ele alimenta a seção "casos em que o revisor
   * RECUSOU o veredito" do refinamento do prompt da obra. Um motivo escrito sobre o
   * veredito do turno 3 e gravado na recusa do turno 4 não é só um campo sujo — é
   * insumo errado indo para a proposta de regras. Por isso todo caminho que fecha a
   * caixa passa por aqui, e nunca por `setDiscordando(false)` sozinho.
   */
  function fecharDiscordancia() {
    setDiscordando(false);
    setMotivoRejeicao('');
  }

  // Limpa o painel ao trocar de frase.
  useEffect(() => {
    setPergunta('');
    setReplica('');
    fecharDiscordancia();
    setErro('');
    setDividindo(false);
    setCandidatos(null);
  }, [frase.id]);

  // Edição direta da tradução pelo painel — é assim que se edita nos modos de
  // leitura, onde as frases não têm textarea próprio (item 9 do backlog).
  useEffect(() => setTextoPt(frase.texto_pt), [frase.texto_pt, frase.id]);
  const salvarPt = useMutation({
    mutationFn: (texto_pt: string) => api<Frase>('PATCH', `/frases/${frase.id}`, { texto_pt }),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] }),
    onError: (e) => setErro((e as Error).message),
  });

  const mesclar = useMutation({
    mutationFn: () => api('POST', '/frases/mesclar', { frase_ids: [frase.id, proxima!.id] }),
    onSuccess: () => {
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });

  // Consultas anteriores desta frase no banco de testes (item 12 do backlog).
  const { data: historico } = useQuery({
    queryKey: ['testes-frase', frase.id],
    queryFn: () => api<CasoTeste[]>('GET', `/frases/${frase.id}/testes`),
  });

  // O fio mais recente é a conversa em curso; os outros são revisões encerradas.
  const fios = agruparEmFios(historico ?? []);
  const corrente = fios[0];
  const anteriores = fios.slice(1);
  const ultimo = corrente?.at(-1);

  // Turno novo = veredito novo. A caixa aberta apontava para o turno anterior, e o
  // motivo escrito nela não pode viajar junto — vale para qualquer origem do turno,
  // não só para a réplica feita aqui.
  useEffect(() => fecharDiscordancia(), [ultimo?.id]);

  const invalidarCasos = () => {
    clienteQuery.invalidateQueries({ queryKey: ['testes-frase', frase.id] });
    clienteQuery.invalidateQueries({ queryKey: ['testes-capitulo', capituloId] });
    clienteQuery.invalidateQueries({ queryKey: ['recorrencias', obraId] });
  };

  // Pergunta nova = fio novo (sem `caso_pai_id`); a réplica no pé do fio manda o
  // último turno como pai, e é o que faz a IA responder sabendo o que já disse.
  const revisar = useMutation({
    mutationFn: (corpo: { pergunta: string; caso_pai_id?: number }) =>
      api('POST', `/frases/${frase.id}/revisar`, corpo),
    onSuccess: (_r, corpo) => {
      if (corpo.caso_pai_id === undefined) setPergunta('');
      else setReplica('');
      // O turno novo tem veredito próprio: um "Discordo" aberto sobre o anterior
      // ficaria apontando para um caso que não é mais o pé do fio.
      fecharDiscordancia();
      setErro('');
      invalidarCasos();
    },
    onError: (e) => setErro((e as Error).message),
  });

  // Os dois campos partilham a mutação (e o bloqueio durante a chamada), mas só um
  // deles está esperando resposta — o outro não deve dizer "Consultando a IA…".
  const replicando = revisar.isPending && revisar.variables?.caso_pai_id !== undefined;

  const aplicarCorrecao = useMutation({
    // O servidor devolve a frase já gravada: o texto pode ser a troca cirúrgica
    // (só o trecho errado) e não a proposta inteira, então quem manda é ele.
    mutationFn: (casoId: number) => api<{ frase: Frase }>('POST', `/testes/${casoId}/aplicar-correcao`),
    onSuccess: (dados) => {
      if (dados?.frase?.texto_pt) {
        aoEditarTexto(frase.texto_pt, dados.frase.texto_pt, frase.id);
      }
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
      invalidarCasos();
    },
    onError: (e) => setErro((e as Error).message),
  });

  // Discordar é DESCARTAR o veredito, não discutir: o caso sai das recorrências e
  // dos rótulos oferecidos ao modelo. Quem quer discutir replica no pé do fio.
  const rejeitar = useMutation({
    mutationFn: (casoId: number) =>
      api('PATCH', `/testes/${casoId}`, {
        status: 'rejeitado',
        motivo_rejeicao: motivoRejeicao.trim() || null,
      }),
    onSuccess: () => {
      fecharDiscordancia();
      setErro('');
      invalidarCasos();
    },
    onError: (e) => setErro((e as Error).message),
  });

  const reverter = useMutation({
    mutationFn: () => api('POST', `/frases/${frase.id}/reverter-ia`),
    onSuccess: () => clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] }),
  });

  // Curadoria sob demanda: varre a frase atrás de termos que o pipeline deixou
  // passar (o termos_novos da tradução é oportunista e ignora muita coisa). A IA
  // alinha ZH↔PT, então você escolhe pelo português e adiciona num clique.
  const [candidatos, setCandidatos] = useState<TermoExtraido[] | null>(null);
  const sugerirTermos = useMutation({
    mutationFn: () => api<{ termos: TermoExtraido[] }>('POST', `/frases/${frase.id}/sugerir-termos`, {}),
    onSuccess: (r) => {
      setCandidatos(r.termos);
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });
  const adicionarAoGlossario = useMutation({
    mutationFn: (t: TermoExtraido) =>
      api('POST', `/obras/${obraId}/glossario`, {
        termo_zh: t.termo_zh,
        termo_pt: t.termo_pt,
        categoria: t.categoria || 'lexico-geral',
        nota: t.contexto || undefined,
      }),
    onSuccess: (_r, t) => {
      setCandidatos((cs) => cs?.filter((c) => c.termo_zh !== t.termo_zh) ?? null);
      clienteQuery.invalidateQueries({ queryKey: ['glossario', obraId] });
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });

  // ── Arrasto da gaveta ──────────────────────────────────────────────────
  // Puxa pelo cabeçalho; a posição fica em localStorage para a próxima sessão.
  const [posicao, setPosicao] = useState<{ x: number; y: number } | null>(() => {
    try {
      const salvo = localStorage.getItem('dao-tale-gaveta-pos');
      return salvo ? (JSON.parse(salvo) as { x: number; y: number }) : null;
    } catch {
      return null;
    }
  });
  const arrasto = useRef<{ dx: number; dy: number } | null>(null);
  const ultimaPosicao = useRef(posicao);

  function aoIniciarArrasto(e: React.PointerEvent<HTMLDivElement>) {
    // O ✕ (e qualquer botão no cabeçalho) não inicia arrasto — a captura de
    // ponteiro engoliria o clique e o botão nunca dispararia.
    if ((e.target as Element).closest('button')) return;
    const alvo = e.currentTarget.closest('aside');
    if (!alvo) return;
    const r = alvo.getBoundingClientRect();
    arrasto.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function aoMoverArrasto(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrasto.current) return;
    const x = Math.min(Math.max(4, e.clientX - arrasto.current.dx), window.innerWidth - 80);
    const y = Math.min(Math.max(4, e.clientY - arrasto.current.dy), window.innerHeight - 60);
    ultimaPosicao.current = { x, y };
    setPosicao(ultimaPosicao.current);
  }
  function aoSoltarArrasto() {
    if (!arrasto.current) return;
    arrasto.current = null;
    if (ultimaPosicao.current) {
      localStorage.setItem('dao-tale-gaveta-pos', JSON.stringify(ultimaPosicao.current));
    }
  }

  /**
   * Qual proposta ainda dá para aplicar: a do turno MAIS RECENTE que tenha uma, não
   * a do último turno.
   *
   * O fio torna comum o caso que o desenho de um resultado só não previa: turno 1
   * volta `incorreto` com uma correção boa, você replica "e se fosse X?", e o turno
   * 2 volta `escolha-legitima` sem proposta nenhuma. Olhando só o último turno, o
   * botão sumia e a correção do turno 1 ficava órfã na tela — desenhada, com cara de
   * acionável, e só aplicável indo até o Banco de testes.
   *
   * `corrigido` e `rejeitado` saem: um já foi aplicado, e no outro o revisor recusou
   * justamente o juízo que propôs aquele texto.
   */
  const alvoProposta = corrente
    ?.slice()
    .reverse()
    .find((c) => c.correcao_proposta && c.status !== 'corrigido' && c.status !== 'rejeitado');

  // A proposta SUBSTITUI a frase inteira. Quando ela é bem menor que o texto
  // atual, quase sempre é a IA devolvendo só o trecho que consertou — aplicar
  // apagaria o resto sem aviso.
  const propostaEncurtaDemais =
    !!alvoProposta?.correcao_proposta &&
    aplicarCorrecao_previa(frase.texto_pt, alvoProposta).tipo === 'frase-inteira' &&
    propostaPareceTrecho(frase.texto_pt, alvoProposta.correcao_proposta);

  // Anda junto com a caixa da proposta a que se refere — se ficasse no pé do fio,
  // apontaria para o turno errado sempre que a conversa passasse da proposta.
  const acaoProposta = alvoProposta && (
    <div className="mt-2 space-y-2">
      {propostaEncurtaDemais && (
        <p className="rounded border border-erro/40 bg-papel-alto px-2 py-1 text-xs">
          <strong>Atenção:</strong> a proposta é bem mais curta que a frase atual (
          {alvoProposta.correcao_proposta!.trim().length} contra {frase.texto_pt.trim().length} caracteres). Ela
          pode ser só o trecho corrigido — e aplicar <strong>substitui a frase inteira</strong>, apagando o resto.
          Confira antes; se for o caso, edite a frase à mão em vez de aplicar.
        </p>
      )}
      <Botao
        onClick={() => {
          const proposta = alvoProposta.correcao_proposta!;
          if (
            propostaEncurtaDemais &&
            !window.confirm(
              'A correção proposta é bem mais curta que a frase atual e pode ser só um trecho dela.\n\n' +
                'Aplicar SUBSTITUI a frase inteira:\n\n' +
                `ATUAL:\n${frase.texto_pt}\n\nFICARÁ:\n${proposta}\n\n` +
                'Aplicar mesmo assim?',
            )
          ) {
            return;
          }
          aplicarCorrecao.mutate(alvoProposta.id);
        }}
        disabled={aplicarCorrecao.isPending}
      >
        Aplicar correção
      </Botao>
    </div>
  );

  return (
    // Gaveta flutuante: sobre o papel, nunca reflui o texto. Arrastável pelo cabeçalho.
    <aside
      className="fixed z-20 w-96 max-w-[calc(100vw-1.5rem)]"
      style={
        posicao
          ? { left: posicao.x, top: posicao.y, maxHeight: `calc(100vh - ${posicao.y + 12}px)` }
          : { top: '4rem', right: '0.75rem', maxHeight: 'calc(100vh - 5rem)' }
      }
    >
      <div className="cartao max-h-[inherit] space-y-3 overflow-y-auto p-4 shadow-xl shadow-tinta/10">
        <div
          className="-m-4 mb-0 flex cursor-grab touch-none items-start justify-between rounded-t-[9px] border-b border-linha bg-papel-fundo/60 px-4 py-2.5 active:cursor-grabbing"
          onPointerDown={aoIniciarArrasto}
          onPointerMove={aoMoverArrasto}
          onPointerUp={aoSoltarArrasto}
          title="Arraste para mover a gaveta"
        >
          <h3 className="font-display font-semibold">
            Protocolo de Revisão <span className="font-mono text-xs font-normal text-tinta-2">[{referencia}]</span>
          </h3>
          <button onClick={aoFechar} aria-label="Fechar revisão" className="text-tinta-2 hover:text-tinta">
            ✕
          </button>
        </div>

        <p className="texto-zh rounded bg-papel-fundo/60 px-2 py-1.5 text-sm">{frase.texto_zh}</p>
        <textarea
          value={textoPt}
          onChange={(e) => setTextoPt(e.target.value)}
          onBlur={() => {
            if (textoPt !== frase.texto_pt) {
              salvarPt.mutate(textoPt, {
                onSuccess: () => aoEditarTexto(frase.texto_pt, textoPt, frase.id),
              });
            }
          }}
          rows={Math.max(2, Math.ceil(textoPt.length / 44))}
          placeholder="(sem tradução — escreva aqui)"
          title="A tradução desta frase; alterações são salvas ao sair do campo"
          className="w-full resize-none rounded border border-transparent bg-papel-fundo/60 px-2 py-1.5 text-sm leading-relaxed hover:border-linha focus:border-jade focus:outline-none"
        />
        {frase.editado_manualmente && frase.texto_pt_original_ia && (
          <button onClick={() => reverter.mutate()} className="text-xs text-tinta-2 underline hover:text-tinta">
            Reverter para a tradução original da IA
          </button>
        )}

        {/* Com um fio em curso a conversa é o assunto da gaveta: o que é ferramenta
            de apoio recolhe para não empurrar o fio para fora da tela. */}
        <details className="border-t border-linha/60 pt-3" open={!!historico && !corrente}>
          <summary className="cursor-pointer text-xs font-medium text-tinta-2 hover:text-tinta">
            Termos desta frase para o glossário
          </summary>
          <div className="mt-2 space-y-1.5">
            <button
              onClick={() => sugerirTermos.mutate()}
              disabled={sugerirTermos.isPending}
              className="text-xs text-jade-forte underline hover:text-jade disabled:opacity-50"
            >
              {sugerirTermos.isPending ? 'Procurando termos…' : 'Sugerir termos desta frase para o glossário (IA)'}
            </button>
            {candidatos?.length === 0 && (
              <p className="text-xs text-tinta-2">Nenhum termo novo digno de glossário nesta frase.</p>
            )}
            {candidatos && candidatos.length > 0 && (
              <div className="space-y-1.5">
                {candidatos.map((t) => (
                  <div key={t.termo_zh} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate" title={t.contexto ?? undefined}>
                      <span className="font-medium">{t.termo_pt}</span>
                      <span className="texto-zh ml-1.5 text-xs text-tinta-2">{t.termo_zh}</span>
                    </span>
                    <button
                      onClick={() => adicionarAoGlossario.mutate(t)}
                      disabled={adicionarAoGlossario.isPending}
                      title={t.contexto ? `Nota: ${t.contexto}` : 'Adicionar ao glossário'}
                      className="shrink-0 rounded border border-linha px-2 py-0.5 text-xs text-jade-forte hover:border-jade disabled:opacity-50"
                    >
                      + glossário
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>

        <textarea
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          rows={3}
          placeholder="Pergunte sobre a escolha de tradução desta frase…"
          className="entrada w-full text-sm"
        />
        <Botao
          onClick={() => revisar.mutate({ pergunta })}
          disabled={!pergunta.trim() || revisar.isPending}
          title={corrente ? 'Abre um fio novo — para continuar a conversa, responda no pé do fio' : undefined}
          className="w-full"
        >
          {revisar.isPending && !replicando ? 'Consultando a IA…' : 'Perguntar'}
        </Botao>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {corrente && ultimo && (
          <div className="space-y-2 border-t border-linha/60 pt-3">
            {corrente.map((caso, i) => (
              <div key={caso.id} className={i > 0 ? 'border-t border-linha/40 pt-2' : undefined}>
                {/* Aplicar pertence à caixa da proposta; discordar pertence ao pé do
                    fio, porque é o veredito corrente que se recusa. */}
                <TurnoFio
                  caso={caso}
                  frase={frase}
                  acaoProposta={caso.id === alvoProposta?.id ? acaoProposta : undefined}
                />
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              {ultimo.status !== 'rejeitado' && (
                <Botao
                  variante="secundario"
                  onClick={() => (discordando ? fecharDiscordancia() : setDiscordando(true))}
                  title="Descarta este veredito — para discutir, responda no pé do fio"
                >
                  Discordo
                </Botao>
              )}
            </div>

            {discordando && ultimo.status !== 'rejeitado' && (
              <div className="space-y-1.5 rounded border border-linha bg-papel-fundo/60 p-2">
                <textarea
                  value={motivoRejeicao}
                  onChange={(e) => setMotivoRejeicao(e.target.value)}
                  rows={2}
                  placeholder="Por que o veredito está errado? (opcional — vira insumo do refinamento do prompt)"
                  className="entrada w-full text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <Botao variante="perigo" onClick={() => rejeitar.mutate(ultimo.id)} disabled={rejeitar.isPending}>
                    Descartar o veredito
                  </Botao>
                  <Botao variante="secundario" onClick={fecharDiscordancia}>
                    Cancelar
                  </Botao>
                </div>
              </div>
            )}

            {/* O pé do fio: a réplica leva o último turno como pai. */}
            <div className="space-y-1.5 pt-1">
              <textarea
                value={replica}
                onChange={(e) => setReplica(e.target.value)}
                rows={2}
                placeholder="Responder neste fio — pedir alternativa, dar contexto, contestar…"
                className="entrada w-full text-sm"
              />
              <Botao
                variante="secundario"
                onClick={() => revisar.mutate({ pergunta: replica, caso_pai_id: ultimo.id })}
                disabled={!replica.trim() || revisar.isPending}
                className="w-full"
              >
                {replicando ? 'Consultando a IA…' : 'Responder'}
              </Botao>
            </div>
          </div>
        )}

        {anteriores.length > 0 && (
          <details className="border-t border-linha/60 pt-3">
            <summary className="cursor-pointer text-xs font-medium text-tinta-2 hover:text-tinta">
              Revisões anteriores desta frase ({anteriores.length})
            </summary>
            <div className="mt-2 space-y-2">
              {anteriores.map((fio) => {
                const folha = fio.at(-1)!;
                const veredito = VEREDITO_ROTULO[folha.veredito];
                return (
                  <details key={fio[0].id} className="rounded border border-linha/60 bg-papel-fundo/60 p-2">
                    <summary className="cursor-pointer text-xs text-tinta-2 hover:text-tinta">
                      <Etiqueta cor={veredito.cor}>{veredito.texto}</Etiqueta>{' '}
                      {new Date(folha.criado_em).toLocaleDateString('pt-BR')}
                      {fio.length > 1 && ` · ${fio.length} turnos`} — {fio[0].pergunta}
                    </summary>
                    <div className="mt-2 space-y-2">
                      {fio.map((caso) => (
                        <TurnoFio key={caso.id} caso={caso} frase={frase} />
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </details>
        )}

        {/* Correção de segmentação */}
        <details className="border-t border-linha/60 pt-3" open={!!historico && !corrente}>
          <summary className="cursor-pointer text-xs font-medium text-tinta-2 hover:text-tinta">
            Segmentação errada?
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {proxima && proxima.paragrafo === frase.paragrafo && (
              <Botao
                variante="secundario"
                onClick={() =>
                  window.confirm('Mesclar esta frase com a seguinte? Casos de teste serão religados à frase resultante.') &&
                  mesclar.mutate()
                }
                disabled={mesclar.isPending}
              >
                Mesclar com a próxima
              </Botao>
            )}
            {[...frase.texto_zh].length > 1 && (
              <Botao variante="secundario" onClick={() => setDividindo(true)}>
                Dividir frase
              </Botao>
            )}
          </div>
        </details>
      </div>

      {dividindo && (
        <ModalDividir
          frase={frase}
          capituloId={capituloId}
          aoFechar={() => setDividindo(false)}
          aoErro={setErro}
        />
      )}
    </aside>
  );
}

/** Só a gaveta abre este modal — veio junto na extração para não virar um import
    cruzado entre página e componente. */
function ModalDividir({
  frase,
  capituloId,
  aoFechar,
  aoErro,
}: {
  frase: Frase;
  capituloId: string;
  aoFechar: () => void;
  aoErro: (m: string) => void;
}) {
  const clienteQuery = useQueryClient();
  const caracteres = [...frase.texto_zh];
  const [corte, setCorte] = useState(Math.ceil(caracteres.length / 2));
  const [pt1, setPt1] = useState(frase.texto_pt);
  const [pt2, setPt2] = useState('');

  const dividir = useMutation({
    mutationFn: () =>
      api('POST', `/frases/${frase.id}/dividir`, {
        texto_zh_1: caracteres.slice(0, corte).join(''),
        texto_zh_2: caracteres.slice(corte).join(''),
        texto_pt_1: pt1,
        texto_pt_2: pt2,
      }),
    onSuccess: () => {
      clienteQuery.invalidateQueries({ queryKey: ['capitulo', capituloId] });
      aoFechar();
    },
    onError: (e) => aoErro((e as Error).message),
  });

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40" onClick={aoFechar}>
      <div className="w-[36rem] max-w-full space-y-3 cartao p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">Dividir frase</h3>
        <p className="text-sm text-tinta-2">Clique no caractere onde a segunda frase deve começar:</p>
        <p className="texto-zh rounded bg-papel-fundo/60 p-2 text-lg leading-loose">
          {caracteres.map((ch, i) => (
            <span
              key={i}
              onClick={() => i > 0 && setCorte(i)}
              className={`cursor-pointer ${i === corte ? 'border-l-2 border-selo' : ''} ${
                i >= corte ? 'bg-ocre-tint' : ''
              }`}
            >
              {ch}
            </span>
          ))}
        </p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="texto-zh mb-1 rounded bg-papel-fundo/60 px-2 py-1 text-xs">{caracteres.slice(0, corte).join('')}</p>
            <textarea
              value={pt1}
              onChange={(e) => setPt1(e.target.value)}
              rows={3}
              placeholder="Tradução da 1ª parte"
              className="entrada w-full"
            />
          </div>
          <div>
            <p className="texto-zh mb-1 rounded bg-ocre-tint px-2 py-1 text-xs">{caracteres.slice(corte).join('')}</p>
            <textarea
              value={pt2}
              onChange={(e) => setPt2(e.target.value)}
              rows={3}
              placeholder="Tradução da 2ª parte (vazio = pendente)"
              className="entrada w-full"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao onClick={() => dividir.mutate()} disabled={dividir.isPending}>
            Dividir
          </Botao>
        </div>
      </div>
    </div>
  );
}
