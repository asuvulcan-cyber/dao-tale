import { useQuery } from '@tanstack/react-query';
import type { ModeloInfo } from '@dao-tale/shared';
import { api } from '../api';
import { classificarModelos } from '../util/modelos';

// Seletor de modelo com a lista real do provedor, agrupada em "recomendados"
// e "outros", com descrição de custo/qualidade do modelo escolhido. Se a lista
// não puder ser carregada (sem chave, sem rede), cai para o campo de texto
// livre que existia antes — o valor digitado continua valendo.

export function SeletorModelo({
  provedor,
  valor,
  aoMudar,
  modeloPadraoProvedor,
}: {
  provedor: string;
  valor: string;
  aoMudar: (novo: string) => void;
  /** Usado no rótulo da opção vazia ("padrão do provedor"). */
  modeloPadraoProvedor?: string;
}) {
  const { data: modelos, isError, isLoading } = useQuery({
    queryKey: ['modelos', provedor],
    queryFn: () => api<ModeloInfo[]>('GET', `/provedores/${provedor}/modelos`),
    enabled: !!provedor,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const estiloCampo = 'entrada mt-1 w-full';

  if (isError || (!isLoading && !modelos?.length)) {
    return (
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={modeloPadraoProvedor}
        title="Não foi possível listar os modelos do provedor (chave não configurada?). Digite o id do modelo."
        className={estiloCampo}
      />
    );
  }

  const classificados = classificarModelos(provedor, modelos ?? []);
  const recomendados = classificados.filter((m) => m.grupo === 'recomendado');
  const outros = classificados.filter((m) => m.grupo === 'outro');
  const selecionado = classificados.find((m) => m.id === valor);
  // Valor vindo de config antiga que não está (mais) na lista: preserva como opção.
  const valorForaDaLista = valor && !selecionado;

  return (
    <>
      {/* A descrição do modelo vive no title (hover) para não quebrar o layout. */}
      <select
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        className={estiloCampo}
        disabled={isLoading}
        title={selecionado?.descricao ?? 'Passe o mouse após escolher para ver a descrição do modelo'}
      >
        <option value="">
          {isLoading ? 'Carregando modelos…' : `Padrão do provedor${modeloPadraoProvedor ? ` (${modeloPadraoProvedor})` : ''}`}
        </option>
        {valorForaDaLista && <option value={valor}>{valor} (fora da lista atual)</option>}
        {recomendados.length > 0 && (
          <optgroup label="Recomendados">
            {recomendados.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </optgroup>
        )}
        {outros.length > 0 && (
          <optgroup label="Outros modelos de texto">
            {outros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </>
  );
}
