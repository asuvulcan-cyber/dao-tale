import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CapituloPublico } from '@dao-tale/shared';

// Sumário da vitrine (doc 14 §10). A obra do usuário passa de cem capítulos, e
// cem capítulos numa tela de 390px são um rolo de vários metros: sem filtro e
// sem "onde eu estava", achar o capítulo 88 é uma tarefa de paciência.
//
// A mesma lista serve a contracapa (seção da página) e o leitor (gaveta). Só o
// invólucro muda; a linha, o filtro e o salto para o capítulo atual são um só
// código — duas listas de capítulo divergindo em detalhe é bug futuro.

/** A partir daqui a rolagem cega deixa de funcionar e o campo de filtro paga o
 *  espaço que ocupa. Abaixo disso ele só ficaria no caminho. */
const MINIMO_PARA_FILTRAR = 12;

export function tituloCapitulo(c: CapituloPublico): string {
  return c.titulo?.trim() ? `Capítulo ${c.numero} — ${c.titulo.trim()}` : `Capítulo ${c.numero}`;
}

export function SumarioVitrine({
  capitulos,
  obraId,
  atual,
  aoEscolher,
  saltarParaAtual = false,
}: {
  capitulos: CapituloPublico[];
  obraId: string | undefined;
  /** Capítulo em leitura, destacado e (na gaveta) trazido para a vista. */
  atual?: number;
  aoEscolher?: () => void;
  saltarParaAtual?: boolean;
}) {
  const [busca, setBusca] = useState('');
  const refAtual = useRef<HTMLAnchorElement>(null);
  const refRolagem = useRef<HTMLDivElement>(null);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return capitulos;
    // Digitar só o número é o caso comum ("quero o 88"), então ele casa pelo
    // número exato além do texto do título.
    return capitulos.filter(
      (c) => String(c.numero) === termo || tituloCapitulo(c).toLowerCase().includes(termo),
    );
  }, [capitulos, busca]);

  // Abrir a gaveta no capítulo em leitura, não no capítulo 1. `auto` (sem
  // animação) porque o salto de 100 linhas animado é um borrão.
  //
  // Depende do tamanho da lista, e não só de `saltarParaAtual`: na primeira
  // pintura a lista costuma estar vazia (a consulta ainda voltando) e não há
  // linha nenhuma para trazer à vista.
  useEffect(() => {
    if (!saltarParaAtual) return;
    refAtual.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [saltarParaAtual, atual, capitulos.length]);

  return (
    <>
      {capitulos.length >= MINIMO_PARA_FILTRAR && (
        <div className="vitrine-margem pb-2">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar capítulo ou número"
            aria-label="Buscar capítulo"
            // 16px de corpo (`text-base`) é o que impede o iOS de dar zoom
            // sozinho ao focar o campo — e o zoom automático desloca a página
            // inteira, que é como se perde o lugar da leitura.
            className="entrada w-full text-base"
            style={{ minHeight: 'var(--toque)' }}
          />
        </div>
      )}

      <div ref={refRolagem} className="gaveta-rolagem vitrine-margem flex-1">
        {filtrados.length === 0 ? (
          <p className="py-6 text-center text-sm text-tinta-2">Nenhum capítulo com “{busca.trim()}”.</p>
        ) : (
          <ol>
            {filtrados.map((c) => {
              const ehAtual = c.numero === atual;
              return (
                <li key={c.numero}>
                  <Link
                    ref={ehAtual ? refAtual : undefined}
                    to={`/ler/${obraId}/${c.numero}`}
                    onClick={aoEscolher}
                    aria-current={ehAtual ? 'true' : undefined}
                    className="linha-toque"
                  >
                    <span className="w-10 shrink-0 font-mono text-sm tabular-nums text-tinta-2">{c.numero}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {c.titulo?.trim() ? c.titulo.trim() : <span className="text-tinta-2">sem título</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </>
  );
}
