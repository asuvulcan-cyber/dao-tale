import { useQueryClient } from '@tanstack/react-query';
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
  const { data, refetch } = usarSessao();

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
