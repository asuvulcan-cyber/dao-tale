import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { EstadoMetrica, SomaUso, TelemetriaCapitulo, TelemetriaObra } from '@dao-tale/shared';
import { api } from '../api';
import { CabecalhoPagina, Etiqueta, type CorEtiqueta } from '../App';
import { NOME_CURTO } from '../componentes/IndicadorCota';

// Painel de custo × qualidade da obra (doc 11 §5). Tudo aqui é MEDIDO: sai de
// eventos_ia, o livro-caixa de cada chamada de IA. As projeções (2ª passagem)
// continuam só nos scripts e nos docs.
//
// Não há nenhuma métrica de tempo nesta tela, de propósito: a revisão humana é
// integral em qualquer cenário, então o painel responde dinheiro e cota.

const PAPEL_ROTULO: Record<string, string> = {
  traducao: 'Tradução',
  revisao: 'Revisão',
  qa: 'QA por 2ª IA',
  extracao: 'Extração de termos',
  refinamento: 'Refinamento do prompt',
  titulo: 'Título e sinopse',
  comparador: 'Comparador',
  estilo: 'Passe de estilo',
};

const COR_ESTADO: Record<EstadoMetrica, CorEtiqueta> = {
  ok: 'jade',
  acima: 'selo',
  'amostra-insuficiente': 'neutro',
};

const numero = (n: number) => n.toLocaleString('pt-BR');

/** Custo em dólar, sempre com separador pt-BR e com casas extras quando o valor é
 * pequeno — centavo de fração não pode virar "0,00" e passar por gratuito. */
function moeda(valor: number, simbolo: string): string {
  const casas = valor > 0 && valor < 0.01 ? 5 : 2;
  return `${simbolo} ${valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}

function usd(valor: number | null): string {
  return valor === null ? '—' : moeda(valor, 'US$');
}

function brl(valor: number | null, taxa: number): string | null {
  if (valor === null || taxa <= 0) return null;
  return moeda(valor * taxa, 'R$');
}

/** Custo de um bloco, com o aviso de incompleto quando falta preço. */
function Custo({ soma, taxa }: { soma: SomaUso; taxa: number }) {
  const reais = brl(soma.custo_usd, taxa);
  return (
    <span
      className="tabular-nums"
      title={
        soma.chamadas_sem_preco > 0
          ? `${soma.chamadas_sem_preco} chamada(s) sem preço cadastrado — este total está incompleto.`
          : undefined
      }
    >
      {usd(soma.custo_usd)}
      {reais && <span className="ml-1 text-tinta-2">({reais})</span>}
      {soma.chamadas_sem_preco > 0 && <span className="ml-1 text-ocre-forte">+?</span>}
    </span>
  );
}

export function Telemetria() {
  const { obraId } = useParams();
  const { data: t } = useQuery({
    queryKey: ['telemetria', obraId],
    queryFn: () => api<TelemetriaObra>('GET', `/obras/${obraId}/telemetria`),
    refetchInterval: 30_000,
  });

  if (!t) return <p className="text-tinta-2">Carregando…</p>;

  const semDados = t.total.chamadas === 0;

  return (
    <div>
      <CabecalhoPagina
        titulo="Custos"
        descricao="Consumo real de cada chamada de IA, medido no momento em que foi paga, ao lado da qualidade do capítulo. Nada aqui é estimativa."
      />

      {semDados ? (
        <p className="text-tinta-2">
          Nenhuma chamada de IA registrada nesta obra ainda. Traduza um capítulo e os números aparecem aqui.
        </p>
      ) : (
        <>
          {t.sem_preco.length > 0 && (
            <div className="my-2 rounded border border-l-4 border-ocre bg-ocre-tint px-3 py-2 text-sm text-ocre-forte">
              <strong>Custo incompleto.</strong> Estes pares não têm preço cadastrado, então o gasto deles é
              desconhecido (não é zero):{' '}
              {t.sem_preco.map((p) => `${NOME_CURTO[p.provedor] ?? p.provedor} · ${p.modelo} (${p.chamadas})`).join(', ')}.{' '}
              <Link className="underline" to="/configuracoes#precos">
                Cadastre os preços em Configurações
              </Link>{' '}
              e use “Recalcular custos” para preencher o histórico.
            </div>
          )}

          <section className="cartao mb-4 p-4">
            <h2 className="olho mb-3">Total da obra</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-tinta-2">Custo</dt>
                <dd className="font-display text-lg">
                  <Custo soma={t.total} taxa={t.taxa_usd_brl} />
                </dd>
              </div>
              <div>
                <dt className="text-tinta-2">Chamadas</dt>
                <dd className="font-display text-lg tabular-nums">{numero(t.total.chamadas)}</dd>
              </div>
              <div>
                <dt className="text-tinta-2">Entrada · saída</dt>
                <dd className="tabular-nums">
                  {numero(t.total.tokens_entrada)} · {numero(t.total.tokens_saida)}
                </dd>
              </div>
              <div>
                <dt className="text-tinta-2">Cache lido · escrito</dt>
                <dd className="tabular-nums">
                  {numero(t.total.tokens_cache_leitura)} · {numero(t.total.tokens_cache_criacao)}
                </dd>
              </div>
            </dl>

            {t.por_papel.length > 0 && (
              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr>
                    <th className="olho border-b border-linha px-2 py-1.5 text-left">Para quê</th>
                    <th className="olho border-b border-linha px-2 py-1.5 text-right">Chamadas</th>
                    <th className="olho border-b border-linha px-2 py-1.5 text-right">Entrada</th>
                    <th className="olho border-b border-linha px-2 py-1.5 text-right">Saída</th>
                    <th className="olho border-b border-linha px-2 py-1.5 text-right">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {t.por_papel.map((p) => (
                    <tr key={p.papel} className="border-b border-linha/50 last:border-b-0">
                      <td className="px-2 py-1.5">{PAPEL_ROTULO[p.papel] ?? p.papel}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{numero(p.chamadas)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{numero(p.tokens_entrada)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{numero(p.tokens_saida)}</td>
                      <td className="px-2 py-1.5 text-right">
                        <Custo soma={p} taxa={t.taxa_usd_brl} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* As duas perguntas financeiras que o painel existe para responder. */}
          <div className="mb-4 grid gap-4 md:grid-cols-2">
            <section className="cartao p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="olho">O prompt caching está acertando?</h2>
                <Etiqueta cor={COR_ESTADO[t.cache.estado]}>
                  {t.cache.acerto_pct === null ? 'sem amostra' : `${t.cache.acerto_pct.toFixed(1)}%`}
                </Etiqueta>
              </div>
              <p className="text-sm text-tinta-2">{t.cache.detalhe}</p>
              {t.cache.economia_usd !== null && (
                <p className="mt-1 text-sm">
                  Economia do cache: <Custo soma={{ ...t.total, custo_usd: t.cache.economia_usd, chamadas_sem_preco: 0 }} taxa={t.taxa_usd_brl} />
                </p>
              )}
              {t.cache.escrita_perdida.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-sm text-selo-forte">
                  {t.cache.escrita_perdida.map((e) => (
                    <li key={`${e.provedor}/${e.modelo}/${e.papel}`}>
                      {PAPEL_ROTULO[e.papel] ?? e.papel} em {NOME_CURTO[e.provedor] ?? e.provedor} · {e.modelo}:{' '}
                      {numero(e.tokens)} tokens de escrita de cache nunca lidos.
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="cartao p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h2 className="olho">O lote compensou em dinheiro?</h2>
                <Etiqueta cor={COR_ESTADO[t.lote.estado]}>
                  {t.lote.diferenca_pct === null
                    ? 'sem amostra'
                    : `${t.lote.diferenca_pct > 0 ? '+' : ''}${t.lote.diferenca_pct.toFixed(1)}%`}
                </Etiqueta>
              </div>
              <p className="text-sm text-tinta-2">{t.lote.detalhe}</p>
              <table className="mt-2 text-sm">
                <tbody>
                  <tr>
                    <td className="pr-4 text-tinta-2">Em lote</td>
                    <td className="pr-3 tabular-nums">{t.lote.lote.capitulos} cap.</td>
                    <td className="tabular-nums">{usd(t.lote.lote.custo_por_mil_frases)} / 1k frases</td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-tinta-2">Sequencial</td>
                    <td className="pr-3 tabular-nums">{t.lote.sequencial.capitulos} cap.</td>
                    <td className="tabular-nums">{usd(t.lote.sequencial.custo_por_mil_frases)} / 1k frases</td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>

          <TabelaCapitulos capitulos={t.capitulos} taxa={t.taxa_usd_brl} obraId={obraId!} />
        </>
      )}
    </div>
  );
}

/** Custo e qualidade na MESMA linha — é o ponto da tela (doc 11 §5). */
function TabelaCapitulos({
  capitulos,
  taxa,
  obraId,
}: {
  capitulos: TelemetriaCapitulo[];
  taxa: number;
  obraId: string;
}) {
  const comChamadas = capitulos.filter((c) => c.chamadas > 0);
  if (comChamadas.length === 0) return null;

  const pct = (parte: number, total: number) => (total > 0 ? `${((parte / total) * 100).toFixed(0)}%` : '—');

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse overflow-hidden cartao text-sm">
        <thead>
          <tr>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2 text-left">Cap.</th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2 text-right">Chamadas</th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2 text-right">Entrada</th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2 text-right">Cache lido</th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2 text-right">Custo</th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2 text-right" title="Normaliza capítulos de tamanhos diferentes">
              US$/1k frases
            </th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2 text-right" title="Frases que você editou à mão (métrica do checkpoint)">
              Edição
            </th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2 text-right" title="Termos novos sugeridos (métrica do checkpoint)">
              Termos
            </th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2 text-right" title="Violações de consistência do glossário">
              Violações
            </th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2 text-right" title="Apontamentos de QA pendentes de triagem">
              QA
            </th>
            <th className="olho whitespace-nowrap border-b border-linha px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {comChamadas.map((c) => (
            <tr key={c.capitulo_id} className="border-b border-linha/50 last:border-b-0">
              <td className="whitespace-nowrap px-2 py-1.5">
                <Link className="text-jade-forte hover:underline" to={`/obras/${obraId}/capitulos/${c.capitulo_id}`}>
                  {c.numero}
                </Link>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{numero(c.chamadas)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{numero(c.tokens_entrada)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{numero(c.tokens_cache_leitura)}</td>
              <td className="px-2 py-1.5 text-right">
                <Custo soma={c} taxa={taxa} />
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{usd(c.custo_por_mil_frases)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums" title={`${c.frases_editadas} de ${c.frases_total} frases`}>
                {pct(c.frases_editadas, c.frases_total)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{numero(c.termos_sugeridos)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                {c.consistencia_violacoes === null ? '—' : numero(c.consistencia_violacoes)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{c.qa_pendentes || '—'}</td>
              <td className="whitespace-nowrap px-2 py-1.5">
                {c.em_lote && <Etiqueta cor="indigo">lote</Etiqueta>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
