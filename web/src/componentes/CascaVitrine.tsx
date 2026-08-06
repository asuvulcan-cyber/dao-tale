import { Link } from 'react-router-dom';
import { BotaoTema, Marca, Selo } from '../App';
import { usarSessao } from '../sessao';

// Casca das telas de vitrine (doc 14 §10). Existe para a estante e a contracapa
// terem a MESMA barra — no celular a barra é a única âncora fixa que o leitor
// tem, e duas barras ligeiramente diferentes entre duas telas vizinhas é o tipo
// de coisa que se sente antes de perceber.
//
// O leitor de capítulo NÃO usa esta casca: a barra dele carrega progresso,
// sumário e ajustes, e some do caminho do texto. É outra função.
//
// Como todo o resto da vitrine, esta casca só fala com `/publico/*` e com
// `/sessao` — nada daqui pode chamar a API autenticada.

export function CascaVitrine({
  voltar,
  titulo,
  children,
}: {
  /** Para onde o selo leva. Sem isto ele é a marca; com isto, é o "voltar" —
      no celular o mesmo canto superior esquerdo serve para as duas coisas, e é
      o alvo que o polegar encontra sem olhar. */
  voltar?: { para: string; rotulo: string };
  titulo?: string;
  children: React.ReactNode;
}) {
  const { data: sessao } = usarSessao();
  const podeEntrar = sessao?.pode_entrar ?? false;

  return (
    <div className="vitrine">
      <header className="vitrine-barra">
        <div className="vitrine-margem mx-auto flex max-w-5xl items-center gap-2 py-1.5">
          {voltar ? (
            <Link to={voltar.para} className="toque -ml-2 gap-2 pr-1 pl-2" title={voltar.rotulo}>
              <Selo />
              <span className="text-sm text-tinta-2">{voltar.rotulo}</span>
            </Link>
          ) : (
            <Link to="/" className="toque -ml-2 gap-2.5 pr-1 pl-2">
              <Marca />
            </Link>
          )}

          {/* O título da tela só entra na barra quando a marca virou "voltar":
              senão são dois nomes disputando 390px de largura. */}
          {voltar && titulo && (
            <span className="min-w-0 flex-1 truncate font-display text-sm text-tinta-2">{titulo}</span>
          )}

          <div className={`flex items-center gap-1 ${voltar && titulo ? '' : 'ml-auto'}`}>
            <BotaoTema tamanho="toque" />
            {/* Discreto de propósito: a porta de serviço não é atração da
                vitrine, mas o dono precisa dela em qualquer aparelho. Some por
                completo para quem está fora da lista de IPs (doc 14 §7) — não
                adianta oferecer uma porta que vai responder 404. */}
            {podeEntrar && (
              <Link to="/entrar" className="ferramenta ferramenta-toque text-tinta-2" title="Entrar na bancada">
                entrar
              </Link>
            )}
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
