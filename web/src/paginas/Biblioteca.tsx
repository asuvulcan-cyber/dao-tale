import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ObraPublica } from '@dao-tale/shared';
import { api } from '../api';
import { CascaVitrine } from '../componentes/CascaVitrine';

// Vitrine pública (doc 14): a porta da rua. É o que qualquer pessoa vê ao abrir
// o domínio sem senha — a estante das obras publicadas, e nada além disso.
//
// Desenhada para o celular (doc 14 §10), que é como o link é aberto na prática:
// uma coluna, capa grande o bastante para ser reconhecida, e o cartão inteiro
// como alvo de toque. As colunas extras só entram quando há tela para elas.
//
// Toda a busca de dados aqui passa por /publico/*. Nenhuma tela desta pasta
// pode chamar a API autenticada: o visitante levaria 401 e veria erro, e o
// componente estaria pedindo algo que não devia existir para ele.

export function Biblioteca() {
  const { data: obras, isPending, isError } = useQuery({
    queryKey: ['publico', 'obras'],
    queryFn: () => api<ObraPublica[]>('GET', '/publico/obras'),
  });

  return (
    <CascaVitrine>
      <main className="vitrine-margem mx-auto max-w-5xl pt-6 pb-10 sm:pt-10">
        <h1 className="font-display text-2xl font-semibold sm:text-3xl">Estante</h1>
        <p className="mt-1 text-sm text-tinta-2">Traduções do chinês, capítulo a capítulo.</p>

        <div className="mt-6">
          {isPending ? (
            <p className="text-sm text-tinta-2">Carregando…</p>
          ) : isError ? (
            <p className="text-sm text-tinta-2">Não foi possível carregar a estante agora.</p>
          ) : obras.length === 0 ? (
            <p className="text-sm text-tinta-2">Nenhuma obra publicada ainda. Volte em breve.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {obras.map((o) => (
                <li key={o.id}>
                  <CartaoObra obra={o} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </CascaVitrine>
  );
}

function CartaoObra({ obra }: { obra: ObraPublica }) {
  return (
    <Link
      to={`/ler/${obra.id}`}
      className="cartao flex h-full gap-3.5 p-3 transition active:border-jade sm:hover:border-jade"
    >
      <Capa obra={obra} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* line-clamp em vez de truncate: no celular um título de novela chinesa
            tem 40+ caracteres e cortar na primeira linha esconde metade dele.
            Duas linhas cabem; a terceira vira reticências. */}
        <p className="line-clamp-2 font-display text-base leading-snug font-semibold sm:text-lg">{obra.titulo}</p>
        {obra.titulo_original && (
          <p className="mt-0.5 truncate font-zh text-sm text-tinta-2">{obra.titulo_original}</p>
        )}
        {obra.autor && <p className="mt-0.5 truncate text-xs text-tinta-2">{obra.autor}</p>}

        {/* Sem `mt-auto`: numa obra sem autor nem título original, empurrar a
            contagem para o rodapé do cartão abria um buraco do tamanho da capa. */}
        <p className="mt-2 text-xs text-tinta-2">
          <span className="font-mono tabular-nums">{obra.capitulos_publicos}</span>{' '}
          {obra.capitulos_publicos === 1 ? 'capítulo' : 'capítulos'}
        </p>
        {obra.tags.length > 0 && (
          // Etiquetas que quebram linha e não vazam: a lista com `truncate` de
          // antes sumia inteira quando a primeira etiqueta era comprida.
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {obra.tags.slice(0, 3).map((t) => (
              <li key={t} className="tag-obra">
                {t}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Link>
  );
}

/** Capa em proporção de livro (2:3), a mesma que o EPUB usa. Largura fixa em
 *  vez de percentual: assim a coluna de texto começa sempre no mesmo lugar e a
 *  estante fica alinhada de cima a baixo. */
function Capa({ obra }: { obra: ObraPublica }) {
  const classe = 'w-[5.5rem] shrink-0 self-start aspect-[2/3] rounded object-cover sm:w-24';
  return obra.tem_capa ? (
    <img src={`/api/publico/obras/${obra.id}/capa`} alt="" className={classe} loading="lazy" />
  ) : (
    <div className={`${classe} grid place-items-center bg-papel-fundo font-zh text-3xl text-tinta-2/60`} aria-hidden>
      書
    </div>
  );
}
