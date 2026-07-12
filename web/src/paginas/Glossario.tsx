import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoriaGlossario, EntradaGlossario } from '@dao-tale/shared';
import { CATEGORIAS_GLOSSARIO } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, Etiqueta } from '../App';

export function Glossario() {
  const { obraId } = useParams();
  const clienteQuery = useQueryClient();
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [erro, setErro] = useState('');
  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [csv, setCsv] = useState('');
  const [relatorio, setRelatorio] = useState('');

  const chaveQuery = ['glossario', obraId, busca, categoria];
  const { data: entradas } = useQuery({
    queryKey: chaveQuery,
    queryFn: () =>
      api<EntradaGlossario[]>(
        'GET',
        `/obras/${obraId}/glossario?busca=${encodeURIComponent(busca)}&categoria=${categoria}`,
      ),
  });

  const invalidar = () => clienteQuery.invalidateQueries({ queryKey: ['glossario', obraId] });

  const criar = useMutation({
    mutationFn: (dados: { termo_zh: string; termo_pt: string; categoria: CategoriaGlossario; nota?: string }) =>
      api('POST', `/obras/${obraId}/glossario`, dados),
    onSuccess: () => {
      invalidar();
      setErro('');
    },
    onError: (e) => setErro((e as Error).message),
  });

  const importar = useMutation({
    mutationFn: () => api<{ inseridos: number; duplicados: number; invalidos: number }>('POST', `/obras/${obraId}/glossario/importar`, { csv }),
    onSuccess: (r) => {
      invalidar();
      setRelatorio(`Importação: ${r.inseridos} inseridos, ${r.duplicados} duplicados, ${r.invalidos} inválidos.`);
      setCsv('');
      setMostrarImportar(false);
    },
    onError: (e) => setErro((e as Error).message),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar termo…"
          className="rounded border border-stone-300 px-2 py-1.5 text-sm"
        />
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="rounded border border-stone-300 px-2 py-1.5 text-sm"
        >
          <option value="">Todas as categorias</option>
          {CATEGORIAS_GLOSSARIO.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <Botao variante="secundario" onClick={() => setMostrarImportar((v) => !v)}>
            Importar CSV
          </Botao>
          <a href={`/api/obras/${obraId}/glossario/exportar`} download>
            <Botao variante="secundario">Exportar CSV</Botao>
          </a>
        </div>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {relatorio && <Aviso tipo="ok">{relatorio}</Aviso>}

      {mostrarImportar && (
        <div className="mb-4 space-y-2 rounded-lg border border-stone-300 bg-white p-4">
          <p className="text-sm text-stone-600">
            Cole o CSV: <code>termo_zh,termo_pt,categoria,nota</code> (categoria e nota opcionais).
          </p>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={6}
            className="w-full rounded border border-stone-300 px-2 py-1.5 font-mono text-xs"
          />
          <Botao onClick={() => importar.mutate()} disabled={!csv.trim() || importar.isPending}>
            Importar
          </Botao>
        </div>
      )}

      <FormularioNovoTermo enviando={criar.isPending} aoEnviar={(d) => criar.mutate(d)} />

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-stone-300 bg-white text-sm">
        <thead>
          <tr className="bg-stone-50 text-left">
            <th className="border-b border-stone-300 px-3 py-2">Termo (ZH)</th>
            <th className="border-b border-stone-300 px-3 py-2">Tradução (PT-BR)</th>
            <th className="border-b border-stone-300 px-3 py-2">Categoria</th>
            <th className="border-b border-stone-300 px-3 py-2">Nota</th>
            <th className="border-b border-stone-300 px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {entradas?.map((e) => <LinhaTermo key={e.id} entrada={e} aoMudar={invalidar} />)}
          {entradas?.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-stone-500">
                Nenhum termo encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function FormularioNovoTermo({
  aoEnviar,
  enviando,
}: {
  aoEnviar: (d: { termo_zh: string; termo_pt: string; categoria: CategoriaGlossario; nota?: string }) => void;
  enviando: boolean;
}) {
  const [zh, setZh] = useState('');
  const [pt, setPt] = useState('');
  const [cat, setCat] = useState<CategoriaGlossario>('outro');
  const [nota, setNota] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aoEnviar({ termo_zh: zh.trim(), termo_pt: pt.trim(), categoria: cat, nota: nota.trim() || undefined });
        setZh('');
        setPt('');
        setNota('');
      }}
      className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-stone-300 bg-white p-3"
    >
      <input required value={zh} onChange={(e) => setZh(e.target.value)} placeholder="termo chinês" className="texto-zh w-36 rounded border border-stone-300 px-2 py-1.5 text-sm" />
      <input required value={pt} onChange={(e) => setPt(e.target.value)} placeholder="tradução PT-BR" className="w-48 rounded border border-stone-300 px-2 py-1.5 text-sm" />
      <select value={cat} onChange={(e) => setCat(e.target.value as CategoriaGlossario)} className="rounded border border-stone-300 px-2 py-1.5 text-sm">
        {CATEGORIAS_GLOSSARIO.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="nota (opcional)" className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm" />
      <Botao type="submit" disabled={enviando}>
        Adicionar
      </Botao>
    </form>
  );
}

function LinhaTermo({ entrada, aoMudar }: { entrada: EntradaGlossario; aoMudar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [pt, setPt] = useState(entrada.termo_pt);
  const [cat, setCat] = useState(entrada.categoria);
  const [nota, setNota] = useState(entrada.nota ?? '');

  const salvar = useMutation({
    mutationFn: () =>
      api('PATCH', `/glossario/${entrada.id}`, { termo_pt: pt, categoria: cat, nota: nota || null }),
    onSuccess: () => {
      setEditando(false);
      aoMudar();
    },
  });

  const excluir = useMutation({
    mutationFn: () => api('DELETE', `/glossario/${entrada.id}`),
    onSuccess: aoMudar,
  });

  if (!editando) {
    return (
      <tr className="border-b border-stone-200 last:border-b-0">
        <td className="texto-zh px-3 py-2">{entrada.termo_zh}</td>
        <td className="px-3 py-2">{entrada.termo_pt}</td>
        <td className="px-3 py-2">
          <Etiqueta>{entrada.categoria}</Etiqueta>
          {entrada.origem === 'sugerido-ia' && <Etiqueta cor="indigo">IA</Etiqueta>}
        </td>
        <td className="px-3 py-2 text-stone-500">{entrada.nota}</td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <button onClick={() => setEditando(true)} className="text-xs text-stone-500 underline hover:text-stone-800">
            editar
          </button>
          <button
            onClick={() => window.confirm(`Excluir "${entrada.termo_zh}"?`) && excluir.mutate()}
            className="ml-2 text-xs text-red-500 underline hover:text-red-700"
          >
            excluir
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-stone-200 bg-amber-50 last:border-b-0">
      <td className="texto-zh px-3 py-2">{entrada.termo_zh}</td>
      <td className="px-3 py-1">
        <input value={pt} onChange={(e) => setPt(e.target.value)} className="w-full rounded border border-stone-300 px-2 py-1 text-sm" />
      </td>
      <td className="px-3 py-1">
        <select value={cat} onChange={(e) => setCat(e.target.value as CategoriaGlossario)} className="rounded border border-stone-300 px-2 py-1 text-sm">
          {CATEGORIAS_GLOSSARIO.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-1">
        <input value={nota} onChange={(e) => setNota(e.target.value)} className="w-full rounded border border-stone-300 px-2 py-1 text-sm" />
      </td>
      <td className="px-3 py-1 text-right whitespace-nowrap">
        <Botao onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          Salvar
        </Botao>
        <button onClick={() => setEditando(false)} className="ml-2 text-xs text-stone-500 underline">
          cancelar
        </button>
      </td>
    </tr>
  );
}
