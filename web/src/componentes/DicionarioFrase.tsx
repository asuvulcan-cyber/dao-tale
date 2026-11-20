// Dicionário da frase, sem IA (doc 30): cada palavra do original com o que o
// DCP (português) e o CC-CEDICT (inglês) dizem dela. É a conferência que não
// depende do modelo — quem está no nível zero não tem outro jeito de saber se
// a explicação do tutor ou a resposta da revisão leu a palavra certa.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ROTULO_FONTE,
  type DicionarioDaFrase,
  type FonteDicionario,
  type PalavraDicionario,
  type Verbete,
} from '@dao-tale/shared';
import { api, mensagemDeErro } from '../api';
import { Etiqueta } from '../App';

const SENTIDOS_VISIVEIS = 3;

function Fonte({ fonte, verbetes }: { fonte: FonteDicionario; verbetes: Verbete[] }) {
  const [tudo, setTudo] = useState(false);
  const acepcoes = verbetes.flatMap((v) => v.acepcoes);
  // Nome próprio por último: "sobrenome Dao" não é o que se procura em 刀.
  const ordenadas = [...acepcoes.filter((a) => !a.proprio), ...acepcoes.filter((a) => a.proprio)];
  const linhas = ordenadas.flatMap((a) =>
    a.sentidos.map((s) => ({ classe: a.proprio ? 'nome próprio' : a.classe, sentido: s })),
  );
  const notas = verbetes.map((v) => v.nota).filter(Boolean);
  const classificadores = [...new Set(verbetes.flatMap((v) => v.classificadores))];
  const exemplo = verbetes.flatMap((v) => v.exemplos)[0];
  const visiveis = tudo ? linhas : linhas.slice(0, SENTIDOS_VISIVEIS);
  if (linhas.length === 0 && notas.length === 0) return null;
  return (
    <div className="text-xs">
      <span className="mr-1 font-mono text-[10px] uppercase tracking-wide text-tinta-2">{ROTULO_FONTE[fonte]}</span>
      {notas.length > 0 && <span className="text-tinta-2">({notas.join('; ')}) </span>}
      <ul className="ml-3 list-disc">
        {visiveis.map((l, i) => (
          <li key={i}>
            {l.classe && <span className="mr-1 text-tinta-2">{l.classe}</span>}
            {l.sentido}
          </li>
        ))}
      </ul>
      {linhas.length > SENTIDOS_VISIVEIS && (
        <button type="button" onClick={() => setTudo((t) => !t)} className="ml-3 text-jade-forte hover:underline">
          {tudo ? 'menos' : `+${linhas.length - SENTIDOS_VISIVEIS} sentidos`}
        </button>
      )}
      {classificadores.length > 0 && (
        <p className="ml-3 text-tinta-2">
          classificador: <span className="texto-zh">{classificadores.join(' ')}</span>
        </p>
      )}
      {tudo && exemplo && (
        <p className="ml-3 text-tinta-2">
          <span className="texto-zh">{exemplo.origem}</span> — {exemplo.pt}
        </p>
      )}
    </div>
  );
}

function Palavra({ p }: { p: PalavraDicionario }) {
  // Agrupa por leitura: 长 cháng ("longo") e 长 zhǎng ("chefe") são palavras
  // diferentes, e é aí que o tutor mais erra.
  const porLeitura = new Map<string, Verbete[]>();
  for (const v of p.verbetes) {
    const k = v.leitura.replace(/\s+/g, '').toLowerCase();
    porLeitura.set(k, [...(porLeitura.get(k) ?? []), v]);
  }
  return (
    <li className="rounded border border-linha/70 px-2 py-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="texto-zh text-base font-medium">{p.texto}</span>
        {p.glossario && <Etiqueta cor="indigo">glossário: {p.glossario.termo_pt}</Etiqueta>}
        {p.verbetes.length === 0 && !p.glossario && <span className="text-xs text-tinta-2">fora dos dicionários</span>}
      </div>
      {[...porLeitura.entries()].map(([k, vs]) => (
        <div key={k} className="mt-1">
          <p className="text-sm text-tinta-2">{k}</p>
          {(['dcp', 'cedict'] as const).map((f) => (
            <Fonte key={f} fonte={f} verbetes={vs.filter((v) => v.fonte === f)} />
          ))}
        </div>
      ))}
    </li>
  );
}

/** Lista as palavras da frase. Só busca quando montado — as gavetas o põem
 *  dentro de um <details> que monta o conteúdo ao abrir. */
export function DicionarioFrase({ fraseId }: { fraseId: number }) {
  const { data, error, isLoading } = useQuery({
    queryKey: ['dicionario-frase', fraseId],
    queryFn: () => api<DicionarioDaFrase>('GET', `/frases/${fraseId}/dicionario`),
    staleTime: 5 * 60_000,
  });
  if (isLoading) return <p className="text-xs text-tinta-2">Consultando o dicionário…</p>;
  if (error) return <p className="text-xs text-selo-forte">{mensagemDeErro(error)}</p>;
  if (!data?.instalado) {
    return (
      <p className="text-xs text-tinta-2">
        Dicionário não instalado. Rode <code className="font-mono">npm run dicionarios</code> na pasta do Dao Tale
        (baixa o DCP e o CC-CEDICT, uns 40 MB).
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-tinta-2">
        Divisão automática em palavras; pode errar. Dicionário de uso geral: em distinções do gênero (刀 × 剑) quem
        decide é o glossário e o contexto.
      </p>
      <ul className="space-y-1.5">
        {data.palavras.map((p) => (
          <Palavra key={`${p.inicio}-${p.texto}`} p={p} />
        ))}
      </ul>
      <p className="text-[10px] text-tinta-2">
        {data.fontes.map((f, i) => (
          <span key={f.id}>
            {i > 0 && ' · '}
            <a href={f.url} target="_blank" rel="noreferrer" className="underline hover:text-tinta">
              {f.nome}
            </a>{' '}
            ({f.licenca})
          </span>
        ))}
      </p>
    </div>
  );
}

/** <details> que só monta (e só consulta) o dicionário quando aberto. */
export function DetalheDicionario({ fraseId, titulo }: { fraseId: number; titulo: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <details className="border-t border-linha/60 pt-3" onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary className="cursor-pointer text-xs font-medium text-tinta-2 hover:text-tinta">{titulo}</summary>
      {aberto && (
        <div className="mt-2">
          <DicionarioFrase fraseId={fraseId} />
        </div>
      )}
    </details>
  );
}
