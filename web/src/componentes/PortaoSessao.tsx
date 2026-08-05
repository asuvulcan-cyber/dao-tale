import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { EstadoSessao } from '@dao-tale/shared';
import { EVENTO_SESSAO_EXPIRADA } from '../api';
import { CHAVE_SESSAO, usarSessao } from '../sessao';

// Portão do modo hospedado (doc 13 §3). Em modo local o servidor responde
// `autenticado: true` e este componente é um passa-direto — a experiência de
// desktop não muda em nada.
//
// Com a vitrine (doc 14) o portão deixou de ser "bancada ou login" e passou a
// ser "bancada ou vitrine": sem sessão, o visitante recebe um roteador
// DIFERENTE, que não conhece as rotas da bancada. A separação é de conveniência
// para o visitante, não é a trava — quem barra o acesso aos dados é
// `exigirSessao` no servidor, e nenhuma tela da vitrine sabe pedir outra coisa.

export function PortaoSessao({ children, vitrine }: { children: React.ReactNode; vitrine: React.ReactNode }) {
  const cliente = useQueryClient();
  const { data, isPending, isError, error, refetch } = usarSessao();

  // A sessão pode cair com a aba aberta (venceu, ou o serviço subiu com senha
  // nova). Qualquer 401 da API derruba o cache e volta para o login.
  useEffect(() => {
    const aoExpirar = () => {
      cliente.setQueryData(CHAVE_SESSAO, (atual: EstadoSessao | undefined) =>
        atual ? { ...atual, autenticado: false } : atual,
      );
    };
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, aoExpirar);
  }, [cliente]);

  if (isPending) {
    return <p className="p-6 text-sm text-tinta-2">Carregando…</p>;
  }

  if (isError) {
    return (
      <div className="p-6 text-sm text-tinta-2">
        <p>Não foi possível falar com o servidor do Dao Tale.</p>
        <p className="mt-1 text-xs">{(error as Error)?.message}</p>
        <button type="button" className="ferramenta mt-3" onClick={() => void refetch()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!data.autenticado) {
    return <>{vitrine}</>;
  }

  return <>{children}</>;
}
