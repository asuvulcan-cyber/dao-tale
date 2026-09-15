import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CategoriaGlossario, TermoSugerido } from '@dao-tale/shared';
import { ehCategoriaGlossarioPadrao } from '@dao-tale/shared';
import { api } from '../api';
import { Aviso, Botao, CabecalhoPagina, SeletorCategoria } from '../App';

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
      <CabecalhoPagina
        titulo="Termos sugeridos"
        descricao="A IA encontrou estes termos nas traduções; aceite para o cânone ou rejeite."
      />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {sugestoes?.length === 0 && <p className="text-tinta-2">Nenhuma sugestão pendente.</p>}
      {/* Fila de triagem (guia §五.5): uma linha = uma decisão */}
      {sugestoes && sugestoes.length > 0 && (
        <div className="cartao">
          {sugestoes.map((s) => (
            <CartaoSugestao key={s.id} sugestao={s} aoMudar={invalidar} aoErro={setErro} />
          ))}
        </div>
      )}
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
    ehCategoriaGlossarioPadrao(sugestao.categoria)
      ? (sugestao.categoria as CategoriaGlossario)
      : 'lexico-geral',
  );
  // Descrição da IA já entra como nota editável — ao aceitar, vira a nota do glossário.
  const [nota, setNota] = useState(sugestao.contexto ?? '');

  const aceitar = useMutation({
    mutationFn: () =>
      api('POST', `/termos-sugeridos/${sugestao.id}/aceitar`, {
        termo_pt: pt,
        categoria: cat,
        nota: nota.trim() || undefined,
      }),
    onSuccess: aoMudar,
    onError: (e) => aoErro((e as Error).message),
  });

  const rejeitar = useMutation({
    mutationFn: () => api('POST', `/termos-sugeridos/${sugestao.id}/rejeitar`),
    onSuccess: aoMudar,
  });

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-linha/50 px-4 py-3 last:border-b-0">
      <span className="texto-zh text-xl">{sugestao.termo_zh}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <input value={pt} onChange={(e) => setPt(e.target.value)} className="w-52 entrada text-sm" />
          <SeletorCategoria valor={cat} aoMudar={setCat} />
        </div>
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (descrição para lembrança) — vai para o glossário"
          title="Descrição do termo; salva como nota no glossário ao aceitar"
          className="entrada mt-1.5 w-full text-xs"
        />
      </div>
      <div className="flex shrink-0 gap-2">
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
