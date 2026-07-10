import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoriaGlossario, TermoSugerido } from '@dao-tale/shared';
import { CATEGORIAS_GLOSSARIO } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao } from '../App';

export function TermosSugeridos() {
  const { obraId } = useParams();
  const clienteQuery = useQueryClient();
  const [erro, setErro] = useState('');

  const { data: sugestoes } = useQuery({
    queryKey: ['termos-sugeridos', obraId, 'pendente'],
    queryFn: () => api<TermoSugerido[]>('GET', `/obras/${obraId}/termos-sugeridos?status=pendente`),
  });

  const invalidar = () => {
    clienteQuery.invalidateQueries({ queryKey: ['termos-sugeridos', obraId, 'pendente'] });
    clienteQuery.invalidateQueries({ queryKey: ['glossario', obraId] });
  };

  return (
    <div>
      <p className="mb-4 text-sm text-stone-600">
        Termos que a IA encontrou durante as traduções e que ainda não estão no glossário. Aceitar move o termo
        para o glossário da obra (ajuste a tradução ou a categoria antes, se necessário).
      </p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {sugestoes?.length === 0 && <p className="text-stone-500">Nenhuma sugestão pendente.</p>}
      <div className="space-y-2">
        {sugestoes?.map((s) => (
          <CartaoSugestao key={s.id} sugestao={s} aoMudar={invalidar} aoErro={setErro} />
        ))}
      </div>
    </div>
  );
}

function CartaoSugestao({
  sugestao,
  aoMudar,
  aoErro,
}: {
  sugestao: TermoSugerido;
  aoMudar: () => void;
  aoErro: (m: string) => void;
}) {
  const [pt, setPt] = useState(sugestao.termo_pt);
  const [cat, setCat] = useState<CategoriaGlossario>(
    (CATEGORIAS_GLOSSARIO as string[]).includes(sugestao.categoria ?? '')
      ? (sugestao.categoria as CategoriaGlossario)
      : 'outro',
  );

  const aceitar = useMutation({
    mutationFn: () => api('POST', `/termos-sugeridos/${sugestao.id}/aceitar`, { termo_pt: pt, categoria: cat }),
    onSuccess: aoMudar,
    onError: (e) => aoErro((e as Error).message),
  });

  const rejeitar = useMutation({
    mutationFn: () => api('POST', `/termos-sugeridos/${sugestao.id}/rejeitar`),
    onSuccess: aoMudar,
  });

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-stone-300 bg-white px-4 py-3">
      <span className="texto-zh text-lg">{sugestao.termo_zh}</span>
      <span className="text-stone-400">→</span>
      <input value={pt} onChange={(e) => setPt(e.target.value)} className="w-52 rounded border border-stone-300 px-2 py-1.5 text-sm" />
      <select value={cat} onChange={(e) => setCat(e.target.value as CategoriaGlossario)} className="rounded border border-stone-300 px-2 py-1.5 text-sm">
        {CATEGORIAS_GLOSSARIO.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      {sugestao.contexto && (
        <span className="texto-zh max-w-md truncate text-xs text-stone-400" title={sugestao.contexto}>
          {sugestao.contexto}
        </span>
      )}
      <div className="ml-auto flex gap-2">
        <Botao onClick={() => aceitar.mutate()} disabled={aceitar.isPending || !pt.trim()}>
          Aceitar
        </Botao>
        <Botao variante="secundario" onClick={() => rejeitar.mutate()}>
          Rejeitar
        </Botao>
      </div>
    </div>
  );
}
