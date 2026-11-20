// Vocabulário do tutor (doc 29): as palavras que você guardou estudando, por
// idioma, e a revisão do dia com repetição espaçada. Cada botão da revisão
// mostra para quando aquela resposta empurra o cartão — a conta é a mesma do
// servidor (shared/tutor.ts).
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  NOTAS_REVISAO,
  PERFIS_IDIOMA,
  ROTULO_NOTA,
  agendarRevisao,
  rotuloIntervalo,
  type IdiomaOrigem,
  type NotaRevisao,
  type PalavraVocabulario,
  type ResumoVocabulario,
} from '@dao-tale/shared';
import { api, mensagemDeErro } from '../api';
import { Aviso, Botao, CabecalhoPagina, TextoComDestaque } from '../App';
import { ProvedorPerfilObra } from '../perfilObra';
import { useVoz } from '../util/voz';

const CHAVE_IDIOMA = 'dao-tale-vocabulario-idioma';

export function Vocabulario() {
  const { data: resumo } = useQuery({
    queryKey: ['vocabulario-resumo'],
    queryFn: () => api<ResumoVocabulario[]>('GET', '/vocabulario/resumo'),
  });
  const [idioma, setIdioma] = useState<IdiomaOrigem>(() => {
    try {
      return localStorage.getItem(CHAVE_IDIOMA) === 'en' ? 'en' : 'zh';
    } catch {
      return 'zh';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_IDIOMA, idioma);
    } catch {
      // sem armazenamento: só não lembra a aba.
    }
  }, [idioma]);
  const [revisando, setRevisando] = useState(false);
  const doIdioma = resumo?.find((r) => r.idioma === idioma);

  return (
    <div className="max-w-4xl space-y-4">
      <CabecalhoPagina
        titulo="Vocabulário"
        descricao="As palavras que você guardou no modo tutor. Revise um pouco por dia: cada resposta decide quando a palavra volta."
      />

      <div className="flex flex-wrap items-center gap-2" role="tablist">
        {(['zh', 'en'] as const).map((id) => {
          const r = resumo?.find((x) => x.idioma === id);
          return (
            <button
              key={id}
              role="tab"
              aria-selected={idioma === id}
              onClick={() => {
                setIdioma(id);
                setRevisando(false);
              }}
              className={`rounded-full border px-3 py-1 text-sm ${
                idioma === id
                  ? 'border-transparent bg-marca text-papel-alto'
                  : 'border-linha text-tinta-2 hover:text-tinta'
              }`}
            >
              {PERFIS_IDIOMA[id].rotulo}
              {r ? ` · ${r.total}` : ''}
              {r && r.para_hoje > 0 ? ` · ${r.para_hoje} para hoje` : ''}
            </button>
          );
        })}
      </div>

      <ProvedorPerfilObra idioma={idioma}>
        <div className="space-y-4">
          {revisando ? (
            <SessaoRevisao key={idioma} idioma={idioma} aoSair={() => setRevisando(false)} />
          ) : (
            <section className="cartao flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-sm">
                {doIdioma && doIdioma.para_hoje > 0 ? (
                  <>
                    <strong>{doIdioma.para_hoje}</strong> palavra{doIdioma.para_hoje === 1 ? '' : 's'} para revisar
                    hoje.
                  </>
                ) : doIdioma && doIdioma.total > 0 ? (
                  <>
                    Nada para revisar hoje{doIdioma.revisadas_hoje > 0 ? ` — ${doIdioma.revisadas_hoje} revisadas` : ''}
                    .
                  </>
                ) : (
                  <>Nenhuma palavra ainda. No editor, ligue o modo Tutor e use o “+” ao lado das palavras.</>
                )}
              </div>
              {doIdioma && doIdioma.para_hoje > 0 && <Botao onClick={() => setRevisando(true)}>Revisar agora</Botao>}
            </section>
          )}
          <ListaPalavras idioma={idioma} />
        </div>
      </ProvedorPerfilObra>
    </div>
  );
}

function SessaoRevisao({ idioma, aoSair }: { idioma: IdiomaOrigem; aoSair: () => void }) {
  const clienteQuery = useQueryClient();
  const falar = useVoz(PERFIS_IDIOMA[idioma].bcp47);
  const [fila, setFila] = useState<PalavraVocabulario[] | null>(null);
  const [verso, setVerso] = useState(false);
  const [feitas, setFeitas] = useState(0);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api<PalavraVocabulario[]>('GET', `/vocabulario/revisao?idioma=${idioma}&limite=100`)
      .then(setFila)
      .catch((e) => setErro(mensagemDeErro(e)));
  }, [idioma]);

  const atual = fila?.[0] ?? null;

  const responder = useMutation({
    mutationFn: ({ id, nota }: { id: number; nota: NotaRevisao }) =>
      api<PalavraVocabulario>('POST', `/vocabulario/${id}/revisar`, { nota }),
    onSuccess: (atualizada, { nota }) => {
      setFila((f) => {
        if (!f) return f;
        const resto = f.slice(1);
        // "Errei" volta para o fim da fila: a palavra reaparece nesta mesma sessão.
        return nota === 0 ? [...resto, atualizada] : resto;
      });
      setFeitas((n) => n + 1);
      setVerso(false);
      clienteQuery.invalidateQueries({ queryKey: ['vocabulario'] });
      clienteQuery.invalidateQueries({ queryKey: ['vocabulario-resumo'] });
    },
    onError: (e) => setErro(mensagemDeErro(e)),
  });

  // Teclado: espaço vira o cartão; 1–4 respondem.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (!atual || responder.isPending) return;
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key === ' ' && !verso) {
        e.preventDefault();
        setVerso(true);
      } else if (verso && ['1', '2', '3', '4'].includes(e.key)) {
        responder.mutate({ id: atual.id, nota: (Number(e.key) - 1) as NotaRevisao });
      }
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [atual, verso, responder]);

  if (erro) return <Aviso tipo="erro">{erro}</Aviso>;
  if (!fila) return <p className="text-sm text-tinta-2">Carregando…</p>;

  if (!atual) {
    return (
      <section className="cartao space-y-3 p-6 text-center">
        <p className="font-display text-lg">Revisão de hoje concluída.</p>
        <p className="text-sm text-tinta-2">{feitas} respostas nesta sessão.</p>
        <Botao variante="secundario" onClick={aoSair}>
          Voltar à lista
        </Botao>
      </section>
    );
  }

  return (
    <section className="cartao space-y-4 p-6">
      <div className="flex items-center justify-between text-xs text-tinta-2">
        <span>
          {fila.length} na fila · {feitas} respondidas
        </span>
        <button onClick={aoSair} className="hover:text-tinta">
          Encerrar
        </button>
      </div>

      <div className="text-center">
        <p className="texto-zh text-4xl font-medium">{atual.termo}</p>
        {atual.exemplo_origem && (
          <p className="texto-zh mt-3 text-sm text-tinta-2">
            <TextoComDestaque texto={atual.exemplo_origem} trecho={atual.termo} cor="jade" />
          </p>
        )}
      </div>

      {verso ? (
        <div className="space-y-2 border-t border-linha pt-4 text-center">
          {atual.leitura && <p className="text-lg text-tinta-2">{atual.leitura}</p>}
          <p className="text-lg">{atual.significado}</p>
          {atual.nota && <p className="text-sm text-tinta-2">{atual.nota}</p>}
          {atual.exemplo_pt && <p className="text-sm italic text-tinta-2">{atual.exemplo_pt}</p>}
          {falar && (
            <button onClick={() => falar(atual.termo)} className="text-xs text-jade-forte hover:underline">
              Ouvir
            </button>
          )}
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {NOTAS_REVISAO.map((nota) => (
              <Botao
                key={nota}
                variante={nota === 0 ? 'perigo' : nota === 2 ? 'primario' : 'secundario'}
                onClick={() => responder.mutate({ id: atual.id, nota })}
                disabled={responder.isPending}
                title={`Tecla ${nota + 1}`}
              >
                {ROTULO_NOTA[nota]}{' '}
                <span className="text-xs opacity-75">
                  · {rotuloIntervalo(agendarRevisao(atual, nota).intervalo_dias)}
                </span>
              </Botao>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center">
          <Botao onClick={() => setVerso(true)}>Mostrar resposta</Botao>
          <p className="mt-2 text-xs text-tinta-2">Tente lembrar o significado antes. Espaço também vira o cartão.</p>
        </div>
      )}
    </section>
  );
}

function ListaPalavras({ idioma }: { idioma: IdiomaOrigem }) {
  const clienteQuery = useQueryClient();
  const falar = useVoz(PERFIS_IDIOMA[idioma].bcp47);
  const [busca, setBusca] = useState('');
  const { data: palavras } = useQuery({
    queryKey: ['vocabulario', idioma],
    queryFn: () => api<PalavraVocabulario[]>('GET', `/vocabulario?idioma=${idioma}`),
  });

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return palavras ?? [];
    return (palavras ?? []).filter((p) =>
      [p.termo, p.leitura ?? '', p.significado].some((campo) => campo.toLowerCase().includes(t)),
    );
  }, [palavras, busca]);

  const invalidar = () => {
    clienteQuery.invalidateQueries({ queryKey: ['vocabulario'] });
    clienteQuery.invalidateQueries({ queryKey: ['vocabulario-resumo'] });
  };
  const editar = useMutation({
    mutationFn: ({ id, significado }: { id: number; significado: string }) =>
      api('PATCH', `/vocabulario/${id}`, { significado }),
    onSuccess: invalidar,
  });
  const remover = useMutation({
    mutationFn: (id: number) => api('DELETE', `/vocabulario/${id}`),
    onSuccess: invalidar,
  });

  if (!palavras || palavras.length === 0) return null;

  return (
    <section className="cartao p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="olho">Palavras ({palavras.length})</h2>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar…"
          className="entrada w-48 text-sm"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-linha text-left text-xs text-tinta-2">
              <th className="px-2 py-1.5 font-normal">Palavra</th>
              <th className="px-2 py-1.5 font-normal">Significado</th>
              <th className="px-2 py-1.5 font-normal">Próxima revisão</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {filtradas.map((p) => (
              <tr key={p.id} className="border-b border-linha/50 align-top last:border-b-0">
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => falar?.(p.termo)}
                    className={`texto-zh text-base font-medium ${falar ? 'hover:text-jade-forte' : 'cursor-text'}`}
                    title={falar ? 'Ouvir' : undefined}
                  >
                    {p.termo}
                  </button>
                  {p.leitura && <div className="text-xs text-tinta-2">{p.leitura}</div>}
                </td>
                <td className="px-2 py-1.5">
                  <input
                    defaultValue={p.significado}
                    onBlur={(e) => {
                      const novo = e.target.value.trim();
                      if (novo && novo !== p.significado) editar.mutate({ id: p.id, significado: novo });
                    }}
                    className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-linha focus:border-jade focus:outline-none"
                    title="Clique para corrigir o significado"
                  />
                  {p.nota && <div className="px-1 text-xs text-tinta-2">{p.nota}</div>}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5 text-xs tabular-nums text-tinta-2">
                  {new Date(`${p.proxima_revisao}T12:00:00`).toLocaleDateString()}
                  {p.total_revisoes > 0 && (
                    <div>
                      {p.total_revisoes} revisões · {p.total_erros} erros
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button
                    onClick={() => {
                      if (window.confirm(`Remover “${p.termo}” do vocabulário? O progresso dela se perde.`)) {
                        remover.mutate(p.id);
                      }
                    }}
                    className="text-xs text-tinta-2 hover:text-selo-forte"
                    aria-label={`Remover ${p.termo}`}
                  >
                    remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
