import { useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { usarSessao } from '../sessao';
import { Login } from './Login';

// A porta de serviço da vitrine (doc 14). Existe como rota própria porque, com
// a vitrine pública no `/`, o login deixou de ser "a tela que aparece quando
// não há sessão" e virou um lugar aonde se vai.
//
// Depois de entrar não há navegação a fazer: o `PortaoSessao` troca o roteador
// inteiro pela bancada, e a rota `*` da bancada devolve quem estava em /entrar
// para a lista de obras.
export function Entrar() {
  const cliente = useQueryClient();
  const { data, refetch, isPending } = usarSessao();

  // Fora da lista de IPs (doc 14 §7): nem o formulário aparece. O servidor já
  // responderia 404 ao POST; mostrar o campo de senha só ensinaria a insistir.
  if (isPending) return <p className="p-6 text-sm text-tinta-2">Carregando…</p>;
  if (data && !data.pode_entrar) return <Navigate to="/" replace />;

  return (
    <Login
      senhaDefinida={data?.senha_definida ?? true}
      aoEntrar={() => {
        // O cache atual foi montado SEM sessão (é a vitrine): descartar tudo
        // evita a bancada abrir com dados públicos recozidos.
        cliente.clear();
        void refetch();
      }}
    />
  );
}
