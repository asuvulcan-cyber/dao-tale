import { useState } from 'react';
import {
  filtrarPorEscopo,
  STATUS_CAPITULO,
  STATUS_LEGIVEIS,
  type CapituloResumo,
  type EscopoExportacao,
} from '@dao-tale/shared';
import { Botao } from '../App';

// Painel de exportação da obra inteira (doc 12 §5). A contagem usa
// filtrarPorEscopo — a MESMA função que o servidor aplica — então o que o painel
// promete é exatamente o que entra no arquivo.

type Formato = 'epub' | 'md' | 'md-bilingue';

const FORMATOS: { id: Formato; rotulo: string; explicacao: string }[] = [
  { id: 'epub', rotulo: 'EPUB', explicacao: 'Livro para e-reader, com capa, sumário e metadados.' },
  { id: 'md', rotulo: 'Markdown', explicacao: 'Obra inteira em um .md, só o português.' },
  { id: 'md-bilingue', rotulo: 'Markdown bilíngue', explicacao: 'Cada parágrafo em chinês e português.' },
];

export function PainelExportacao({ obraId, capitulos }: { obraId: string; capitulos: CapituloResumo[] }) {
  const [formato, setFormato] = useState<Formato>('epub');
  const [todosStatus, setTodosStatus] = useState(false);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');

  const escopo: EscopoExportacao = {
    status: todosStatus ? [...STATUS_CAPITULO] : STATUS_LEGIVEIS,
    ...(de.trim() ? { de: Number(de) } : {}),
    ...(ate.trim() ? { ate: Number(ate) } : {}),
  };
  const invalido =
    (de.trim() && !Number.isInteger(Number(de))) ||
    (ate.trim() && !Number.isInteger(Number(ate))) ||
    (escopo.de !== undefined && escopo.ate !== undefined && escopo.de > escopo.ate);
  const selecionados = invalido ? [] : filtrarPorEscopo(capitulos, escopo);

  const consulta = new URLSearchParams({ status: escopo.status.join(',') });
  if (escopo.de !== undefined) consulta.set('de', String(escopo.de));
  if (escopo.ate !== undefined) consulta.set('ate', String(escopo.ate));
  if (formato === 'md-bilingue') consulta.set('formato', 'bilingue');
  const rota = formato === 'epub' ? 'epub' : 'markdown';
  const url = `/api/obras/${obraId}/${rota}?${consulta.toString()}`;

  const faixa =
    selecionados.length === 0
      ? null
      : selecionados.length === 1
        ? `capítulo ${selecionados[0]!.numero}`
        : `capítulos ${selecionados[0]!.numero}–${selecionados[selecionados.length - 1]!.numero}`;

  return (
    <div className="cartao mb-6 p-4">
      <h3 className="mb-3 text-sm font-semibold">Exportar a obra como livro</h3>

      <div className="flex flex-wrap items-center gap-3">
        <div className="seg">
          {FORMATOS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={formato === f.id}
              title={f.explicacao}
              onClick={() => setFormato(f.id)}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ferramenta"
          aria-pressed={todosStatus}
          title="Inclui rascunho, parcial e em tradução — o texto pendente sai em branco"
          onClick={() => setTodosStatus((v) => !v)}
        >
          incluir não terminados
        </button>
        <label className="flex items-center gap-1.5 text-sm text-tinta-2">
          de
          <input
            value={de}
            onChange={(e) => setDe(e.target.value)}
            inputMode="numeric"
            placeholder="118"
            className="entrada w-20 font-mono tabular-nums"
          />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-tinta-2">
          até
          <input
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            inputMode="numeric"
            placeholder="129"
            className="entrada w-20 font-mono tabular-nums"
          />
        </label>
      </div>

      <p className="mt-3 text-sm text-tinta-2">{FORMATOS.find((f) => f.id === formato)!.explicacao}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {selecionados.length > 0 ? (
          // download deixa o navegador salvar o arquivo sem trocar de página.
          <a href={url} download className="rounded bg-acao px-3 py-1.5 text-sm font-medium text-papel-alto hover:bg-acao-forte">
            Baixar {formato === 'epub' ? '.epub' : '.md'}
          </a>
        ) : (
          <Botao disabled>Baixar</Botao>
        )}
        <span className="text-sm text-tinta-2">
          {invalido
            ? 'Intervalo inválido.'
            : selecionados.length === 0
              ? 'Nenhum capítulo bate com o filtro.'
              : `${selecionados.length} capítulo${selecionados.length === 1 ? '' : 's'} · ${faixa}`}
        </span>
      </div>
    </div>
  );
}
