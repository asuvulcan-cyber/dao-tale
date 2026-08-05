import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { ObraPublica } from '@dao-tale/shared';
import { api } from '../api';
import { BotaoTema, Marca } from '../App';

// Vitrine pública (doc 14): a porta da rua. É o que qualquer pessoa vê ao abrir
// o domínio sem senha — a estante das obras publicadas, e nada além disso.
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
    <div className="min-h-screen bg-papel text-tinta">
      <header className="border-b border-linha bg-papel-alto">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <Marca />
          </Link>
          <div className="flex items-center gap-2">
            <BotaoTema />
            {/* Discreto de propósito: a porta de serviço não é atração da
                vitrine, mas o dono precisa dela em qualquer aparelho. */}
            <Link to="/entrar" className="ferramenta text-tinta-2" title="Entrar na bancada">
              entrar
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="font-display text-2xl font-semibold">Estante</h1>
        <p className="mt-1 text-sm text-tinta-2">Traduções do chinês, capítulo a capítulo.</p>

        <div className="mt-8">
          {isPending ? (
            <p className="text-sm text-tinta-2">Carregando…</p>
          ) : isError ? (
            <p className="text-sm text-tinta-2">Não foi possível carregar a estante agora.</p>
          ) : obras.length === 0 ? (
            <p className="text-sm text-tinta-2">Nenhuma obra publicada ainda. Volte em breve.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {obras.map((o) => (
                <li key={o.id}>
                  <CartaoObra obra={o} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function CartaoObra({ obra }: { obra: ObraPublica }) {
  return (
    <Link
      to={`/ler/${obra.id}`}
      className="flex h-full gap-3 rounded-lg border border-linha bg-papel-alto p-3 transition hover:border-jade"
    >
      {obra.tem_capa ? (
        <img
          src={`/api/publico/obras/${obra.id}/capa`}
          alt=""
          className="h-28 w-20 shrink-0 rounded object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded bg-papel-fundo font-zh text-2xl text-tinta-2/60">
          書
        </div>
      )}
      <div className="min-w-0">
        <p className="font-display font-semibold leading-tight">{obra.titulo}</p>
        {obra.titulo_original && <p className="mt-0.5 font-zh text-sm text-tinta-2">{obra.titulo_original}</p>}
        {obra.autor && <p className="mt-1 text-xs text-tinta-2">{obra.autor}</p>}
        <p className="mt-2 text-xs text-tinta-2">
          {obra.capitulos_publicos} {obra.capitulos_publicos === 1 ? 'capítulo' : 'capítulos'}
        </p>
        {obra.tags.length > 0 && (
          <p className="mt-1 truncate text-xs text-tinta-2/80">{obra.tags.join(' · ')}</p>
        )}
      </div>
    </Link>
  );
}
