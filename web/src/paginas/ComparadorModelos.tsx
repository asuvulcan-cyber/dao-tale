import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EstadoConfiguracoes, PromptPadrao, ProvedorId } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, CabecalhoPagina, Etiqueta } from '../App';
import { SeletorModelo } from '../componentes/SeletorModelo';
import { NOME_CURTO } from '../componentes/IndicadorCota';

// Comparador: o mesmo trecho chinês passa por vários provedores/modelos em
// paralelo (com o prompt mãe e o glossário desta obra) — para testar chaves
// novas e escolher modelo vendo as traduções lado a lado.

interface ProvedorInfo {
  id: ProvedorId;
  nome: string;
  precisa_chave: boolean;
  modelo_padrao: string;
}

interface Alvo {
  chave: number;
  provedor: ProvedorId;
  modelo: string;
  /** '' = núcleo ativo. Preenchido, roda o portão A/B (doc 08 §12). */
  nucleo: string;
}

interface MetricasEstilo {
  palavras: number;
  aquele: number;
  demonstrativos: number;
  decalques: number;
  mente: number;
  glossario_esperados: number;
  glossario_aplicados: number;
}

interface ResultadoComparacao {
  provedor: string;
  modelo: string;
  nucleo_versao?: string;
  ok: boolean;
  texto_pt?: string;
  metricas?: MetricasEstilo;
  erro?: string;
  ms: number;
}

const CHAVE_TEXTO = 'dao-tale-comparador-texto';
let proximaChave = 1;

/** Contagens objetivas da saída (doc 08 §12). Não são nota — são o que impede a
    comparação entre dois núcleos de virar só impressão: menos "aquele" e menos
    decalque é exatamente o que o núcleo enxuto promete entregar. */
function PlacarEstilo({ m }: { m: MetricasEstilo }) {
  const itens: [string, string][] = [
    ['"aquele"', String(m.aquele)],
    ['demonstrativos', String(m.demonstrativos)],
    ['decalques', String(m.decalques)],
    ['-mente', String(m.mente)],
    ['glossário', `${m.glossario_aplicados}/${m.glossario_esperados}`],
    ['palavras', String(m.palavras)],
  ];
  return (
    <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-linha/50 pt-2 text-xs text-tinta-2">
      {itens.map(([rotulo, valor]) => (
        <div key={rotulo} className="flex gap-1">
          <dt>{rotulo}:</dt>
          <dd className="font-mono font-semibold text-tinta">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ComparadorModelos() {
  const { obraId } = useParams();
  const clienteQuery = useQueryClient();
  const [texto, setTexto] = useState(() => localStorage.getItem(CHAVE_TEXTO) ?? '');
  const [alvos, setAlvos] = useState<Alvo[]>([]);
  const [resultados, setResultados] = useState<ResultadoComparacao[] | null>(null);

  useEffect(() => localStorage.setItem(CHAVE_TEXTO, texto), [texto]);

  const { data: provedores } = useQuery({
    queryKey: ['provedores'],
    queryFn: () => api<ProvedorInfo[]>('GET', '/provedores'),
  });

  const { data: estado } = useQuery({
    queryKey: ['configuracoes'],
    queryFn: () => api<EstadoConfiguracoes>('GET', '/configuracoes'),
  });

  // Versões do núcleo: com mais de uma, o comparador vira também o portão A/B —
  // mesmo modelo, mesmo trecho, núcleos diferentes.
  const { data: nucleos } = useQuery({
    queryKey: ['prompt-padrao'],
    queryFn: () => api<PromptPadrao[]>('GET', '/prompt-padrao'),
  });

  // Pré-preenche uma linha por provedor com chave configurada (modelo padrão).
  useEffect(() => {
    if (alvos.length > 0 || !estado || !provedores) return;
    const configurados = provedores.filter(
      (p) => p.precisa_chave && estado.credenciais.some((c) => c.provedor === p.id && c.configurada),
    );
    const iniciais = (configurados.length > 0 ? configurados : provedores.filter((p) => p.id === 'mock')).map(
      (p): Alvo => ({ chave: proximaChave++, provedor: p.id, modelo: '', nucleo: '' }),
    );
    setAlvos(iniciais);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, provedores]);

  const comparar = useMutation({
    mutationFn: () =>
      api<{ frases_total: number; resultados: ResultadoComparacao[] }>('POST', `/obras/${obraId}/comparar`, {
        texto_zh: texto,
        alvos: alvos.map((a) => ({
          provedor: a.provedor,
          ...(a.modelo ? { modelo: a.modelo } : {}),
          ...(a.nucleo ? { nucleo_id: Number(a.nucleo) } : {}),
        })),
      }),
    onSuccess: (r) => {
      setResultados(r.resultados);
      clienteQuery.invalidateQueries({ queryKey: ['uso-hoje'] });
    },
  });

  if (!provedores || !estado) return <p className="text-tinta-2">Carregando…</p>;

  const podeComparar = texto.trim().length > 0 && alvos.length > 0 && !comparar.isPending;

  return (
    <div className="max-w-4xl">
      <CabecalhoPagina
        titulo="Comparar modelos"
        descricao="Cole um trecho em chinês e veja a tradução de vários modelos lado a lado, usando o prompt mãe e o glossário desta obra. Com mais de uma versão do núcleo, dá para repetir o mesmo modelo em núcleos diferentes e comparar as duas — é o portão A/B. Cada execução gasta 1 requisição por alvo."
      />

      <div className="cartao space-y-3 p-4">
        <label className="block text-sm">
          Trecho em chinês (um parágrafo ou dois bastam para comparar)
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            placeholder="Cole aqui o texto de exemplo…"
            className="entrada texto-zh mt-1 w-full"
          />
        </label>

        <div>
          <p className="mb-1.5 text-sm font-medium">Modelos a comparar</p>
          <div className="space-y-2">
            {alvos.map((alvo) => {
              const info = provedores.find((p) => p.id === alvo.provedor);
              const semChave =
                info?.precisa_chave && !estado.credenciais.some((c) => c.provedor === alvo.provedor && c.configurada);
              return (
                <div key={alvo.chave} className="flex flex-wrap items-center gap-2">
                  <select
                    value={alvo.provedor}
                    onChange={(e) =>
                      setAlvos((l) =>
                        l.map((a) => (a.chave === alvo.chave ? { ...a, provedor: e.target.value as ProvedorId, modelo: '' } : a)),
                      )
                    }
                    className="entrada w-44 text-sm"
                  >
                    {provedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                  <div className="w-72">
                    <SeletorModelo
                      provedor={alvo.provedor}
                      valor={alvo.modelo}
                      aoMudar={(novo) =>
                        setAlvos((l) => l.map((a) => (a.chave === alvo.chave ? { ...a, modelo: novo } : a)))
                      }
                      modeloPadraoProvedor={info?.modelo_padrao}
                    />
                  </div>
                  {(nucleos?.length ?? 0) >= 2 && (
                    <select
                      value={alvo.nucleo}
                      onChange={(e) =>
                        setAlvos((l) => l.map((a) => (a.chave === alvo.chave ? { ...a, nucleo: e.target.value } : a)))
                      }
                      className="entrada w-40 text-sm"
                      title="Versão do núcleo universal a usar neste alvo"
                    >
                      <option value="">núcleo ativo</option>
                      {nucleos!.map((n) => (
                        <option key={n.id} value={String(n.id)}>
                          núcleo v{n.versao}
                          {n.ativo ? ' (ativo)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {semChave && <Etiqueta cor="selo">sem chave</Etiqueta>}
                  <button
                    type="button"
                    onClick={() => setAlvos((l) => l.filter((a) => a.chave !== alvo.chave))}
                    className="text-sm text-tinta-2 hover:text-erro"
                    title="Remover esta linha"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Botao
              variante="secundario"
              onClick={() =>
                setAlvos((l) => [...l, { chave: proximaChave++, provedor: provedores[0].id, modelo: '', nucleo: '' }])
              }
              disabled={alvos.length >= 8}
            >
              + Adicionar modelo
            </Botao>
            <span className="text-xs text-tinta-2">
              Chaves são configuradas em <Link to="/configuracoes" className="text-jade-forte underline">Configurações</Link>;
              como criar cada uma está no <Link to="/docs#chaves" className="text-jade-forte underline">guia</Link>.
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Botao onClick={() => comparar.mutate()} disabled={!podeComparar}>
            {comparar.isPending ? 'Comparando…' : 'Comparar'}
          </Botao>
          {comparar.isPending && (
            <span className="animate-pulse text-sm text-tinta-2">
              Consultando {alvos.length} modelo{alvos.length === 1 ? '' : 's'} em paralelo…
            </span>
          )}
        </div>
        {comparar.isError && <Aviso tipo="erro">{(comparar.error as Error).message}</Aviso>}
      </div>

      {resultados && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {resultados.map((r, i) => (
            <div key={i} className="cartao flex flex-col p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-medium">{NOME_CURTO[r.provedor] ?? r.provedor}</span>
                <code className="rounded bg-papel-fundo px-1.5 py-0.5 text-xs text-tinta-2">{r.modelo}</code>
                {r.nucleo_versao && <Etiqueta cor="indigo">núcleo v{r.nucleo_versao}</Etiqueta>}
                {r.ok ? (
                  <Etiqueta cor="jade">{(r.ms / 1000).toFixed(1)}s</Etiqueta>
                ) : (
                  <Etiqueta cor="selo">falhou</Etiqueta>
                )}
              </div>
              {r.ok ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.texto_pt}</p>
              ) : (
                <p className="text-sm text-erro">{r.erro}</p>
              )}
              {r.metricas && <PlacarEstilo m={r.metricas} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
