// O que o revisor corrige à mão é o sinal mais forte que o app tem, e era o
// menos lido: na 死人经 foram 146 edições manuais contra 25 casos no banco de
// testes. Mas a contagem sozinha não diz o que fazer com elas — a maior parte
// NÃO vira regra nova. Esta tela mostra o roteamento: cada edição sob a camada
// dona do problema, e uma frase curta dizendo onde aquilo se resolve.
import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CapituloResumo } from '@dao-tale/shared';
import { api, mensagemDeErro } from '../api';
import { Aviso, Botao, CabecalhoPagina, Etiqueta, TextoComDestaque, type CorEtiqueta } from '../App';

type RotaEdicao = 'tipografia' | 'glossario' | 'chave-estilo' | 'nucleo' | 'diretriz';

/** O que `GET /obras/:id/edicoes-manuais` devolve (classificarEdicoes, no
 *  servidor). `de`/`para` são o menor trecho que mudou entre a tradução da IA e
 *  a sua; `detalhe` é o termo do glossário ou o id do tema que explica a rota. */
interface EdicaoClassificada {
  frase_id: number;
  ordem: number;
  capitulo_numero: number;
  texto_zh: string;
  ia: string;
  voce: string;
  de: string;
  para: string;
  rota: RotaEdicao;
  detalhe: string | null;
}

/**
 * Os grupos, em ordem DECRESCENTE do que dá para fazer com eles — não na ordem
 * do enum.
 *
 * `diretriz` vem primeiro porque é o único grupo com uma ação nesta tela; no
 * fim da página, atrás de 100 linhas de tipografia, o botão do refinamento não
 * seria encontrado, e a mineração inteira viraria relatório que ninguém lê.
 * `tipografia` fecha a lista pelo motivo oposto: é o grupo maior e o que menos
 * pede decisão.
 */
const GRUPOS: { rota: RotaEdicao; titulo: string; cor: CorEtiqueta; oQueFazer: string }[] = [
  {
    rota: 'diretriz',
    titulo: 'Candidatas a diretriz da obra',
    cor: 'jade',
    oQueFazer: 'Sem dono em nenhuma camada — é o que pode virar diretriz da obra.',
  },
  {
    rota: 'chave-estilo',
    titulo: 'Chave de estilo desobedecida',
    cor: 'selo',
    oQueFazer:
      'O modelo desobedeceu uma chave da Seção 5. Ou a chave está errada, ou é caso para o passe de estilo.',
  },
  {
    rota: 'nucleo',
    titulo: 'Falha do núcleo zh→pt-BR',
    cor: 'indigo',
    oQueFazer: 'Falha universal do zh→pt-BR, não específica desta obra. Candidata ao catálogo de erros comuns.',
  },
  {
    rota: 'glossario',
    titulo: 'Termo do glossário',
    cor: 'ocre',
    oQueFazer: 'Termo do glossário que derivou. Resolve-se na varredura de consistência, não no prompt.',
  },
  {
    rota: 'tipografia',
    titulo: 'Só tipografia',
    cor: 'neutro',
    oQueFazer:
      'Diferença só de aspas ou ênfase. Não ensina nada — está aqui para você conferir que é isso mesmo.',
  },
];

export function EdicoesManuais() {
  const { obraId } = useParams();
  const navegar = useNavigate();

  const { data: edicoes, isLoading, error } = useQuery({
    queryKey: ['edicoes-manuais', obraId],
    queryFn: () => api<EdicaoClassificada[]>('GET', `/obras/${obraId}/edicoes-manuais`),
  });

  // A classificação vem com o NÚMERO do capítulo (é o que serve para ler), e o
  // link para a frase precisa do id — o de-para mora aqui, não no servidor.
  const { data: capitulos } = useQuery({
    queryKey: ['capitulos', obraId],
    queryFn: () => api<CapituloResumo[]>('GET', `/obras/${obraId}/capitulos`),
  });
  const idPorNumero = useMemo(
    () => new Map((capitulos ?? []).map((c) => [c.numero, c.id])),
    [capitulos],
  );

  const porRota = useMemo(() => {
    const mapa = new Map<RotaEdicao, EdicaoClassificada[]>();
    for (const e of edicoes ?? []) mapa.set(e.rota, [...(mapa.get(e.rota) ?? []), e]);
    return mapa;
  }, [edicoes]);

  const total = edicoes?.length ?? 0;
  const candidatas = porRota.get('diretriz')?.length ?? 0;

  return (
    <div>
      <CabecalhoPagina
        titulo="O que você corrigiu à mão"
        descricao="Toda frase que você reescreveu por cima da tradução da IA, agrupada pela camada dona do problema. Só o que não tem dono em nenhuma camada é candidato a virar diretriz da obra."
      />

      {error && <Aviso tipo="erro">{mensagemDeErro(error)}</Aviso>}
      {isLoading && <p className="text-sm text-tinta-2">Classificando as edições…</p>}

      {edicoes && total === 0 && (
        <Aviso tipo="info">
          Nenhuma edição manual nesta obra ainda. Só conta o que você <strong>digitou</strong> por cima da
          tradução: o que veio de botão (correção da revisão, passe de estilo, QA) já é decisão registrada em
          outro canal e ensinaria a mesma lição duas vezes.
        </Aviso>
      )}

      {edicoes && total > 0 && (
        <>
          <p className="mb-4 text-sm text-tinta-2">
            {total} edição{total === 1 ? '' : 'ões'} manual{total === 1 ? '' : 'is'} ·{' '}
            <span className="font-medium text-jade-forte">
              {candidatas} candidata{candidatas === 1 ? '' : 's'} a diretriz
            </span>{' '}
            — o resto tem dono em outro lugar.
          </p>

          <div className="space-y-3">
            {GRUPOS.map((g) => {
              const doGrupo = porRota.get(g.rota) ?? [];
              if (doGrupo.length === 0) return null;
              return (
                <details key={g.rota} className="cartao p-4" open={g.rota === 'diretriz'}>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                    <Etiqueta cor={g.cor}>{g.rota}</Etiqueta>
                    <span className="font-display font-semibold">{g.titulo}</span>
                    <span className="text-sm text-tinta-2">
                      {doGrupo.length} edição{doGrupo.length === 1 ? '' : 'ões'}
                    </span>
                  </summary>

                  <p className="mt-2 max-w-[62ch] text-sm text-tinta-2">{g.oQueFazer}</p>

                  {/* Só a `diretriz` ganha botão: é a única rota cujo destino é o
                      prompt da obra. Nas outras, um botão daqui mandaria material
                      que o refinamento é PROIBIDO de usar. */}
                  {g.rota === 'diretriz' && (
                    <div className="mt-2">
                      <Botao onClick={() => navegar(`/obras/${obraId}/prompt?painel=refinar`)}>
                        Incluir no próximo refinamento
                      </Botao>
                    </div>
                  )}

                  <div className="mt-3 border-t border-linha/50">
                    {doGrupo.map((e) => (
                      <LinhaEdicao
                        key={e.frase_id}
                        edicao={e}
                        obraId={obraId!}
                        capituloId={idPorNumero.get(e.capitulo_numero) ?? null}
                      />
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function LinhaEdicao({
  edicao,
  obraId,
  capituloId,
}: {
  edicao: EdicaoClassificada;
  obraId: string;
  capituloId: number | null;
}) {
  return (
    <div className="border-b border-linha/50 py-2.5 last:border-b-0">
      <p className="flex flex-wrap items-baseline gap-1.5 text-sm">
        <TrechoDoPar texto={edicao.de} cor="selo" />
        <span className="text-tinta-2">→</span>
        <TrechoDoPar texto={edicao.para} cor="jade" />
      </p>
      {/* A frase mostrada é a SUA, com o trecho novo realçado: o par acima diz o
          que mudou, e a frase inteira diz se a mudança se sustenta no contexto. */}
      <p className="mt-1 text-sm leading-relaxed">
        <TextoComDestaque texto={edicao.voce} trecho={edicao.para} cor="jade" />
      </p>
      <p className="texto-zh mt-0.5 text-xs text-tinta-2">{edicao.texto_zh}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-tinta-2">
        <span>
          cap. {edicao.capitulo_numero} · frase {edicao.ordem + 1}
        </span>
        {edicao.detalhe && <span title="O termo ou tema que explica a rota">· {edicao.detalhe}</span>}
        {capituloId != null && (
          <Link
            to={`/obras/${obraId}/capitulos/${capituloId}?frase=${edicao.frase_id}`}
            className="text-jade-forte hover:underline"
          >
            ir à frase
          </Link>
        )}
      </p>
    </div>
  );
}

/** Um lado do par `de → para`. Trecho vazio acontece de verdade (inserção pura
 *  ou remoção pura) e um chip em branco parece defeito de renderização. */
function TrechoDoPar({ texto, cor }: { texto: string; cor: 'selo' | 'jade' }) {
  if (!texto.trim()) return <span className="text-tinta-2">(nada)</span>;
  const cores = { selo: 'bg-selo-tint text-selo-forte', jade: 'bg-jade-tint text-jade-forte' };
  return <span className={`rounded px-1.5 py-0.5 ${cores[cor]}`}>{texto}</span>;
}
