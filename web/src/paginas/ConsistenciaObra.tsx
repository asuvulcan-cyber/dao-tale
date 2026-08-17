// O glossário só vale se o texto o obedecer, e ninguém cadastra o termo antes de
// traduzir: o revisor descobre o nome certo no capítulo 12 e os onze anteriores
// já dizem outra coisa. Esta tela é a varredura reversa (doc 05 §4.2) rodada na
// OBRA inteira — toda frase cujo chinês tem um termo do glossário mas cujo
// português não tem o termo canônico.
//
// Agrupada por TERMO, e não por frase, porque o conserto é por termo: um
// `POST /glossario/:id/substituir` troca o texto antigo pelo canônico na obra
// toda. Uma lista por frase obrigaria o revisor a reconstruir mentalmente qual
// termo é qual antes de poder agir — e uma lista assim não se percorre até o fim.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, mensagemDeErro } from '../api';
import { Aviso, Botao, CabecalhoPagina, Etiqueta, TextoComDestaque } from '../App';
import { previaValida, type PreviaSubstituicao } from '../util/consistenciaObra';

/** Uma frase fora do padrão. `capitulo_id` é nulo quando a frase perdeu o
 *  capítulo (não acontece hoje, mas a rota tipa assim) — sem ele não há link. */
interface ViolacaoNaObra {
  frase_id: number;
  capitulo_id: number | null;
  capitulo_numero: number | null;
  ordem: number;
  texto_zh: string;
  texto_pt: string;
}

interface GrupoTermo {
  glossario_id: number;
  termo_zh: string;
  termo_pt: string;
  violacoes: ViolacaoNaObra[];
}

/** Uma ocorrência do gatilho chinês de um termo `ambiguo`, sem veredito — a
 *  varredura não sabe (nem tenta saber) se ali é o nome ou a palavra comum. */
interface OcorrenciaAmbigua {
  frase_id: number;
  capitulo_id: number | null;
  capitulo_numero: number | null;
  ordem: number;
  texto_zh: string;
  texto_pt: string;
}

/** Um termo `ambiguo` (Task 7) e onde o gatilho chinês dele aparece. Fora da
 *  contagem de violações — ver `BlocoAmbiguos`. */
interface GrupoTermoAmbiguo {
  glossario_id: number;
  termo_zh: string;
  termo_pt: string;
  nota_uso: string | null;
  ocorrencias: OcorrenciaAmbigua[];
}

/** O que `GET /obras/:id/consistencia` devolve. A rota calcula na hora a cada
 *  chamada (~10 ms numa obra real), então o que está na tela é o estado do
 *  banco agora — não um relatório guardado de ontem. */
interface RelatorioConsistencia {
  /** Pares (frase, termo) conferidos: quantas vezes um termo do glossário
   *  apareceu no chinês de uma frase traduzida. */
  ocorrencias: number;
  termos_curtos_ignorados: number;
  frases_examinadas: number;
  por_termo: GrupoTermo[];
  /** Termos ambíguos (小心: "cuidado" em 7 de 8 ocorrências da obra 1) — saíram
   *  da varredura acima porque ela erraria a maioria das vezes, mas não saem
   *  da tela: aqui embaixo, para conferência caso a caso. */
  por_termo_ambiguo: GrupoTermoAmbiguo[];
}

/** Acima disto a lista de um termo vira rolagem pura e o pé do bloco — onde
 *  mora o conserto — sai da tela. As 3 primeiras bastam para reconhecer o
 *  padrão do erro; o resto fica a um clique. */
const FRASES_VISIVEIS = 3;
const LIMITE_PARA_DOBRAR = 8;

export function ConsistenciaObra() {
  const { obraId } = useParams();

  const {
    data: relatorio,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['consistencia-obra', obraId],
    queryFn: () => api<RelatorioConsistencia>('GET', `/obras/${obraId}/consistencia`),
  });

  const grupos = relatorio?.por_termo ?? [];
  const total = grupos.reduce((n, g) => n + g.violacoes.length, 0);

  return (
    <div>
      <CabecalhoPagina
        titulo="Consistência do glossário"
        descricao="Toda frase cujo chinês tem um termo do glossário mas cuja tradução não tem o termo canônico. Acontece quando o termo é cadastrado depois de os capítulos já estarem traduzidos."
      >
        {/* A varredura roda a cada chamada, e é barata. O botão existe para o
            "agora" do resumo ser verificável: sem ele, uma aba aberta há uma
            hora mostra números de uma hora atrás sem dizer isso. */}
        <Botao variante="secundario" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Varrendo…' : 'Varrer de novo'}
        </Botao>
      </CabecalhoPagina>

      {isLoading && <p className="text-sm text-tinta-2">Varrendo a obra…</p>}

      {/* Sem isto a tela mentiria do jeito mais caro possível: a consulta que
          falha deixa `grupos` vazio, e o estado vazio — que existe para dizer
          "foi conferido" — passaria a dizer isso depois de um 500. */}
      {error && (
        <Aviso tipo="erro">
          Não deu para varrer a obra: {mensagemDeErro(error)} Nada foi conferido — recarregue antes de concluir
          que o glossário está sendo obedecido.
        </Aviso>
      )}

      {relatorio && (
        <>
          <Resumo relatorio={relatorio} total={total} />
          {grupos.length === 0 ? (
            <EstadoVazio relatorio={relatorio} />
          ) : (
            <div className="space-y-3">
              {grupos.map((g) => (
                <BlocoTermo key={g.termo_zh} grupo={g} obraId={obraId!} />
              ))}
            </div>
          )}
          {/* Fora da contagem de cima de propósito: um termo ambíguo não prova
              erro nem acerto, então misturá-lo à lista de violações ensinaria
              o revisor a desconfiar da lista inteira (o próprio problema que
              esta tela existe para evitar). */}
          {relatorio.por_termo_ambiguo.length > 0 && (
            <BlocoAmbiguos grupos={relatorio.por_termo_ambiguo} obraId={obraId!} />
          )}
        </>
      )}
    </div>
  );
}

/** O que foi examinado, sempre — inclusive quando não há nada a consertar. A
 *  diferença entre "está limpo" e "ninguém olhou" é o defeito que esta tela
 *  existe para consertar; escondê-la aqui seria irônico. */
function Resumo({ relatorio, total }: { relatorio: RelatorioConsistencia; total: number }) {
  const { ocorrencias, frases_examinadas, termos_curtos_ignorados } = relatorio;
  return (
    <p className="mb-4 max-w-[62ch] text-sm text-tinta-2">
      {ocorrencias} termo{ocorrencias === 1 ? '' : 's'} conferido{ocorrencias === 1 ? '' : 's'} ·{' '}
      {frases_examinadas} frase{frases_examinadas === 1 ? '' : 's'} examinada
      {frases_examinadas === 1 ? '' : 's'} ·{' '}
      {/* Sem nenhuma ocorrência conferida não há jade nenhum a dar: um "nada
          fora do padrão" verde depois de "0 frases examinadas" é justamente o
          "tudo certo" solto que esta tela existe para não repetir. */}
      {ocorrencias === 0 ? (
        <span>nada conferido.</span>
      ) : total === 0 ? (
        <span className="font-medium text-jade-forte">nada fora do padrão.</span>
      ) : (
        <span className="font-medium text-ocre-forte">
          {total} fora do padrão, em {relatorio.por_termo.length} termo
          {relatorio.por_termo.length === 1 ? '' : 's'}.
        </span>
      )}
      {termos_curtos_ignorados > 0 && (
        <>
          {' '}
          {termos_curtos_ignorados} termo{termos_curtos_ignorados === 1 ? '' : 's'} de um caractere ficou
          {termos_curtos_ignorados === 1 ? '' : 'ram'} de fora: um caractere sozinho aparece dentro de dezenas
          de palavras comuns, e conferi-lo só produziria ruído.
        </>
      )}
    </p>
  );
}

/** Três vazios diferentes, e nenhum deles é "tudo certo".
 *
 *  Sem frase traduzida não houve exame nenhum; sem ocorrência, o glossário
 *  existe mas nenhum termo dele apareceu no chinês conferido — que é notícia
 *  sobre o glossário, não sobre a tradução. Só o terceiro caso é limpeza de
 *  verdade, e mesmo ele diz contra o que foi medido. */
function EstadoVazio({ relatorio }: { relatorio: RelatorioConsistencia }) {
  const { ocorrencias, frases_examinadas } = relatorio;

  if (frases_examinadas === 0) {
    return (
      <Aviso tipo="info">
        Nenhuma frase traduzida nesta obra ainda — não houve o que conferir. A varredura compara o chinês com a
        tradução, então frase pendente fica de fora.
      </Aviso>
    );
  }

  if (ocorrencias === 0) {
    return (
      <Aviso tipo="info">
        Nenhum termo do glossário apareceu no chinês das {frases_examinadas} frases traduzidas. Isso é notícia
        sobre o <strong>glossário</strong>, não sobre a tradução: ou ele está vazio, ou os termos cadastrados
        não são os que o texto usa.
      </Aviso>
    );
  }

  return (
    <Aviso tipo="ok">
      Nada fora do padrão: {ocorrencias} termo{ocorrencias === 1 ? '' : 's'} conferido
      {ocorrencias === 1 ? '' : 's'} contra {frases_examinadas} frase
      {frases_examinadas === 1 ? '' : 's'} traduzida{frases_examinadas === 1 ? '' : 's'}, agora.
    </Aviso>
  );
}

/**
 * Um termo e tudo que se pode fazer com ele.
 *
 * O estado do conserto (campo, prévia, resultado) mora aqui e é chaveado por
 * `termo_zh` na lista: assim ele sobrevive à invalidação da consulta — trocar
 * um termo refaz a lista inteira, e o revisor que já digitou noutro bloco não
 * perde o que digitou.
 */
function BlocoTermo({ grupo, obraId }: { grupo: GrupoTermo; obraId: string }) {
  const clienteQuery = useQueryClient();
  const [de, setDe] = useState('');
  const [previa, setPrevia] = useState<PreviaSubstituicao | null>(null);
  const [trocado, setTrocado] = useState<number | null>(null);

  // O texto que de fato vai para a rota. A prévia e a troca mandam exatamente o
  // mesmo, e é por isso que dá para comparar um com o outro logo abaixo.
  const alvo = de.trim();

  const invalidar = () => {
    clienteQuery.invalidateQueries({ queryKey: ['consistencia-obra', obraId] });
    // O selo de glossário da lista de capítulos sai da mesma varredura, e o
    // servidor recalcula a obra ao substituir: sem invalidar aqui, a lista
    // continuaria acusando violações que esta tela acabou de resolver.
    clienteQuery.invalidateQueries({ queryKey: ['capitulos', obraId] });
    // Trocar reescreve o texto das frases; um capítulo aberto noutra aba do
    // cache mostraria o texto anterior à troca.
    clienteQuery.invalidateQueries({ queryKey: ['capitulo'] });
  };

  const prever = useMutation({
    mutationFn: () =>
      api<{ frases: number; capitulos: number }>('POST', `/glossario/${grupo.glossario_id}/substituir`, {
        de: alvo,
        previa: true,
      }),
    onSuccess: (r) => {
      setPrevia({ de: alvo, frases: r.frases });
      setTrocado(null);
    },
  });

  const trocar = useMutation({
    mutationFn: () =>
      api<{ frases: number; capitulos: number }>('POST', `/glossario/${grupo.glossario_id}/substituir`, {
        de: alvo,
        previa: false,
      }),
    onSuccess: (r) => {
      setTrocado(r.frases);
      // A prévia morre com a troca — ela contava um estado do banco que acabou
      // de deixar de existir. O campo fica como estava, dizendo o que foi
      // trocado; pedir a prévia de novo é o que reabilita o botão.
      setPrevia(null);
      invalidar();
    },
  });

  const dispensar = useMutation({
    mutationFn: (fraseId: number) =>
      api('POST', `/frases/${fraseId}/consistencia/dispensar`, { termo_zh: grupo.termo_zh }),
    onSuccess: invalidar,
  });

  // Trocar só habilita depois da prévia PARA O TEXTO ATUAL do campo. A regra
  // mora em `util/consistenciaObra.ts`, com teste: errá-la é silencioso, e o
  // preço é uma obra inteira reescrita a partir da contagem de outra palavra.
  const previaAtual = previaValida(previa, de);
  const ocupado = prever.isPending || trocar.isPending || dispensar.isPending;
  const erro = prever.error ?? trocar.error ?? dispensar.error;

  const visiveis = grupo.violacoes.length > LIMITE_PARA_DOBRAR ? FRASES_VISIVEIS : grupo.violacoes.length;
  const dobradas = grupo.violacoes.slice(visiveis);

  const linha = (v: ViolacaoNaObra) => (
    <LinhaViolacao
      key={`${v.frase_id}|${grupo.termo_zh}`}
      violacao={v}
      termoZh={grupo.termo_zh}
      obraId={obraId}
      ocupado={ocupado}
      aoDispensar={() => dispensar.mutate(v.frase_id)}
    />
  );

  return (
    <section className="cartao p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="texto-zh text-lg">{grupo.termo_zh}</span>
        <span className="text-tinta-2">→</span>
        <span className="font-display font-semibold">{grupo.termo_pt}</span>
        {/* Ocre, não selo: aqui não está provado que há erro. Nem toda ausência
            é defeito, e é a mesma razão de Dispensar existir logo abaixo. */}
        <Etiqueta cor="ocre">
          {grupo.violacoes.length} frase{grupo.violacoes.length === 1 ? '' : 's'}
        </Etiqueta>
      </div>

      <div className="mt-2 border-t border-linha/50">
        {grupo.violacoes.slice(0, visiveis).map(linha)}
        {dobradas.length > 0 && (
          <details>
            <summary className="cursor-pointer py-2 text-sm text-jade-forte hover:underline">
              mostrar as outras {dobradas.length} frases
            </summary>
            {dobradas.map(linha)}
          </details>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-linha/50 pt-3">
        <label className="text-xs text-tinta-2">
          O que está escrito no lugar
          <input
            value={de}
            onChange={(e) => {
              setDe(e.target.value);
              setTrocado(null);
            }}
            placeholder={`ex.: a tradução antiga de ${grupo.termo_zh}`}
            className="entrada mt-0.5 block w-64 text-sm"
            disabled={ocupado}
          />
        </label>
        <span className="pb-1.5 text-sm text-tinta-2">
          vira <span className="font-medium text-tinta">{grupo.termo_pt}</span>
        </span>
        <Botao variante="secundario" onClick={() => prever.mutate()} disabled={!alvo || ocupado}>
          {prever.isPending ? 'Contando…' : 'Prévia'}
        </Botao>
        <Botao
          onClick={() => trocar.mutate()}
          disabled={previaAtual == null || previaAtual.frases === 0 || ocupado}
          title={
            previaAtual == null
              ? 'Peça a prévia deste texto antes de trocar na obra inteira'
              : `Troca em ${previaAtual.frases} frase(s) da obra`
          }
        >
          {trocar.isPending ? 'Trocando…' : 'Trocar'}
        </Botao>
        {previaAtual && (
          <span className="pb-1.5 text-sm text-tinta-2">
            {previaAtual.frases === 0
              ? 'nenhuma frase seria alterada — confira o texto acima'
              : `${previaAtual.frases} frase${previaAtual.frases === 1 ? '' : 's'} ${
                  previaAtual.frases === 1 ? 'seria alterada' : 'seriam alteradas'
                }`}
          </span>
        )}
        {trocado != null && (
          <span className="pb-1.5 text-sm text-jade-forte">
            Trocado em {trocado} frase{trocado === 1 ? '' : 's'}.
          </span>
        )}
      </div>

      <p className="mt-1 max-w-[62ch] text-xs text-tinta-2">
        A troca só alcança frases cujo original tem {grupo.termo_zh}, e só o texto isolado por palavra. As
        frases trocadas passam a contar como editadas.
      </p>

      {erro && <Aviso tipo="erro">{mensagemDeErro(erro)}</Aviso>}
    </section>
  );
}

/** Uma frase fora do padrão, com as duas saídas legítimas lado a lado.
 *
 *  Dispensar tem o mesmo peso do conserto de propósito: quando o referente já
 *  está estabelecido, o português omite em vez de repetir, e isso é boa
 *  tradução, não desvio. Uma lista que só oferecesse "consertar" ensinaria o
 *  revisor a ignorá-la inteira. */
function LinhaViolacao({
  violacao,
  termoZh,
  obraId,
  ocupado,
  aoDispensar,
}: {
  violacao: ViolacaoNaObra;
  termoZh: string;
  obraId: string;
  ocupado: boolean;
  aoDispensar: () => void;
}) {
  return (
    <div className="border-b border-linha/50 py-2.5 last:border-b-0">
      <p className="text-sm leading-relaxed">{violacao.texto_pt}</p>
      {/* O chinês com o termo marcado: é a prova de que a varredura acusou esta
          frase por este termo, e o que o revisor precisa ler para decidir entre
          trocar e dispensar. Jade porque é o canônico, não o erro. */}
      <p className="texto-zh mt-0.5 text-xs text-tinta-2">
        <TextoComDestaque texto={violacao.texto_zh} trecho={termoZh} cor="jade" />
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-tinta-2">
        <span>
          cap. {violacao.capitulo_numero ?? '—'} · frase {violacao.ordem + 1}
        </span>
        {violacao.capitulo_id != null && (
          <Link
            to={`/obras/${obraId}/capitulos/${violacao.capitulo_id}?frase=${violacao.frase_id}`}
            className="text-jade-forte hover:underline"
          >
            ir à frase
          </Link>
        )}
        <Botao
          variante="secundario"
          onClick={aoDispensar}
          disabled={ocupado}
          title={`Tira esta frase da varredura para o termo ${termoZh} — sem tocar no texto`}
        >
          Dispensar
        </Botao>
      </div>
    </div>
  );
}

/**
 * Termo ambíguo (Task 7): o gatilho chinês nem sempre é este termo — 小心 é
 * "cuidado" em 7 das 8 ocorrências medidas na obra 1, e só 1 é a criada Xiao
 * Xin. A varredura de cima já tira esses termos da contagem (checaria errado
 * na maioria das vezes), mas tirar da CONTAGEM não é tirar da TELA: sem este
 * bloco o revisor não teria como notar que escreveu o nome errado nas vezes
 * em que o gatilho É a personagem — silenciar de vez trocaria ruído por
 * cegueira, o mesmo problema do lado oposto.
 *
 * Nem Dispensar nem Trocar aparecem aqui: as duas ações assumem que existe
 * uma violação a resolver, e aqui não há veredito nenhum para resolver —
 * só uma lista para o revisor olhar caso a caso.
 */
function BlocoAmbiguos({ grupos, obraId }: { grupos: GrupoTermoAmbiguo[]; obraId: string }) {
  return (
    <section className="mt-6 border-t border-linha/50 pt-4">
      <h3 className="font-display text-base font-semibold">Termo ambíguo — confira caso a caso</h3>
      <p className="mt-1 max-w-[62ch] text-sm text-tinta-2">
        O chinês destes termos também é uma palavra comum, então contar como violação acertaria só a minoria
        das ocorrências. Cada frase abaixo precisa de um olhar: o gatilho ali é o nome, ou é a palavra do
        dia a dia?
      </p>
      <div className="mt-3 space-y-3">
        {grupos.map((g) => (
          <BlocoTermoAmbiguo key={g.termo_zh} grupo={g} obraId={obraId} />
        ))}
      </div>
    </section>
  );
}

function BlocoTermoAmbiguo({ grupo, obraId }: { grupo: GrupoTermoAmbiguo; obraId: string }) {
  const visiveis = grupo.ocorrencias.length > LIMITE_PARA_DOBRAR ? FRASES_VISIVEIS : grupo.ocorrencias.length;
  const dobradas = grupo.ocorrencias.slice(visiveis);

  const linha = (o: OcorrenciaAmbigua) => (
    <div key={`${o.frase_id}|${grupo.termo_zh}`} className="border-b border-linha/50 py-2.5 last:border-b-0">
      <p className="text-sm leading-relaxed">{o.texto_pt}</p>
      {/* Mesmo destaque jade da lista de violações: aqui ele marca "achei o
          gatilho", não "está certo" — a decisão sobre o que ele significa é
          do revisor, não da varredura. */}
      <p className="texto-zh mt-0.5 text-xs text-tinta-2">
        <TextoComDestaque texto={o.texto_zh} trecho={grupo.termo_zh} cor="jade" />
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-tinta-2">
        <span>
          cap. {o.capitulo_numero ?? '—'} · frase {o.ordem + 1}
        </span>
        {o.capitulo_id != null && (
          <Link
            to={`/obras/${obraId}/capitulos/${o.capitulo_id}?frase=${o.frase_id}`}
            className="text-jade-forte hover:underline"
          >
            ir à frase
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <section className="cartao p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="texto-zh text-lg">{grupo.termo_zh}</span>
        <span className="text-tinta-2">→</span>
        <span className="font-display font-semibold">{grupo.termo_pt}</span>
        {/* Neutro, não ocre: ocre aqui diria "fora do padrão", e nenhuma
            destas ocorrências foi julgada — é só onde o gatilho aparece. */}
        <Etiqueta cor="neutro">
          {grupo.ocorrencias.length} ocorrência{grupo.ocorrencias.length === 1 ? '' : 's'}
        </Etiqueta>
      </div>
      {grupo.nota_uso && <p className="mt-1 max-w-[62ch] text-xs text-tinta-2">{grupo.nota_uso}</p>}

      <div className="mt-2 border-t border-linha/50">
        {grupo.ocorrencias.slice(0, visiveis).map(linha)}
        {dobradas.length > 0 && (
          <details>
            <summary className="cursor-pointer py-2 text-sm text-jade-forte hover:underline">
              mostrar as outras {dobradas.length} ocorrências
            </summary>
            {dobradas.map(linha)}
          </details>
        )}
      </div>
    </section>
  );
}
