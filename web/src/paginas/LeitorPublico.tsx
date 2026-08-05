import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { partirInline, type CapituloPublico, type CapituloPublicoDetalhe, type ObraPublica } from '@dao-tale/shared';
import { api } from '../api';
import { BotaoTema, MenuMais } from '../App';

// Leitor da vitrine pública (doc 14). É primo do `Leitor.tsx` da bancada e
// PROPOSITALMENTE não compartilha componente com ele: são duas superfícies com
// públicos diferentes, e um ajuste feito no leitor de trabalho — mostrar o
// chinês, marcar termo de glossário, botão de exportar — não pode escorregar
// para cá sem alguém decidir. O que a rua vê está inteiro neste arquivo.
//
// Diferenças em relação ao leitor da bancada, todas deliberadas: sem modo
// bilíngue (o texto de origem não é republicado), sem link para a obra na
// bancada, sem status de capítulo, sem download.

const CHAVE_CORPO = 'dao-tale-leitor-corpo';
const CHAVE_MEDIDA = 'dao-tale-leitor-medida';

const CORPOS = [1, 2, 3, 4, 5];
const MEDIDAS = [1, 2, 3];

function lerPreferencia(chave: string, padrao: number, maximo: number): number {
  const salvo = Number(localStorage.getItem(chave));
  return Number.isInteger(salvo) && salvo >= 1 && salvo <= maximo ? salvo : padrao;
}

export function LeitorPublico() {
  const { obraId, numero } = useParams();
  const navegar = useNavigate();

  const [corpo, setCorpo] = useState(() => lerPreferencia(CHAVE_CORPO, 3, CORPOS.length));
  const [medida, setMedida] = useState(() => lerPreferencia(CHAVE_MEDIDA, 2, MEDIDAS.length));
  const [sumarioAberto, setSumarioAberto] = useState(false);

  useEffect(() => {
    localStorage.setItem(CHAVE_CORPO, String(corpo));
  }, [corpo]);
  useEffect(() => {
    localStorage.setItem(CHAVE_MEDIDA, String(medida));
  }, [medida]);

  const { data: obra, isError: obraErrada } = useQuery({
    queryKey: ['publico', 'obra', obraId],
    queryFn: () => api<ObraPublica>('GET', `/publico/obras/${obraId}`),
    retry: false,
  });
  const { data: capitulos, isPending: carregandoCapitulos } = useQuery({
    queryKey: ['publico', 'capitulos', obraId],
    queryFn: () => api<CapituloPublico[]>('GET', `/publico/obras/${obraId}/capitulos`),
    retry: false,
  });

  const lista = capitulos ?? [];
  const atualNumero = numero ? Number(numero) : lista[0]?.numero;
  const posicao = lista.findIndex((c) => c.numero === atualNumero);
  const anterior = posicao > 0 ? lista[posicao - 1] : undefined;
  const proximo = posicao >= 0 && posicao < lista.length - 1 ? lista[posicao + 1] : undefined;

  const { data: detalhe, isPending: carregandoTexto } = useQuery({
    queryKey: ['publico', 'capitulo', obraId, atualNumero],
    queryFn: () => api<CapituloPublicoDetalhe>('GET', `/publico/obras/${obraId}/capitulos/${atualNumero}`),
    enabled: atualNumero !== undefined && posicao >= 0,
    retry: false,
  });

  const irPara = (cap: CapituloPublico | undefined) => {
    if (cap) navegar(`/ler/${obraId}/${cap.numero}`);
  };

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      if (e.key === 'ArrowLeft') irPara(anterior);
      if (e.key === 'ArrowRight') irPara(proximo);
      if (e.key === 'Escape') setSumarioAberto(false);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [atualNumero]);

  // Obra privada e obra inexistente respondem igual (404) — a tela também não
  // pode distinguir as duas, senão desfaz no cliente o cuidado do servidor.
  if (obraErrada) {
    return (
      <div className="min-h-screen bg-papel p-6 text-tinta">
        <p className="leitor-folha text-tinta-2">
          Esta obra não está disponível.{' '}
          <Link to="/" className="text-jade-forte underline">
            Voltar para a estante
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-papel text-tinta"
      style={{
        ['--leitor-corpo' as string]: `var(--leitor-txt-${corpo})`,
        ['--leitor-medida' as string]: `var(--leitor-medida-${medida})`,
      }}
    >
      <header className="sticky top-0 z-20 border-b border-linha bg-papel-alto/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2">
          <Link to="/" className="ferramenta shrink-0" title="Voltar para a estante">
            ‹ Estante
          </Link>
          <span className="min-w-0 flex-1 truncate font-display text-sm text-tinta-2">
            {obra?.titulo ?? '…'}
            {detalhe && ` · ${tituloCapitulo(detalhe)}`}
          </span>
          <button
            type="button"
            className="ferramenta shrink-0"
            aria-pressed={sumarioAberto}
            onClick={() => setSumarioAberto((v) => !v)}
            title="Sumário"
          >
            ☰
          </button>
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            <AjustesLeitura setCorpo={setCorpo} setMedida={setMedida} />
          </div>
          <div className="shrink-0 sm:hidden">
            <MenuMais titulo="Ajustes de leitura" rotulo="Aa">
              <AjustesLeitura setCorpo={setCorpo} setMedida={setMedida} />
            </MenuMais>
          </div>
        </div>
      </header>

      {sumarioAberto && (
        <div className="border-b border-linha bg-papel-fundo/60">
          <div className="mx-auto max-h-[60vh] max-w-6xl overflow-y-auto px-4 py-3">
            <p className="olho mb-2">Sumário</p>
            <ol className="grid gap-0.5 sm:grid-cols-2">
              {lista.map((c) => (
                <li key={c.numero}>
                  <Link
                    to={`/ler/${obraId}/${c.numero}`}
                    onClick={() => setSumarioAberto(false)}
                    className={`block truncate rounded px-2 py-1 text-sm hover:bg-papel-alto ${
                      c.numero === atualNumero ? 'font-semibold text-jade-forte' : 'text-tinta'
                    }`}
                  >
                    {tituloCapitulo(c)}
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <main className="px-4 py-10">
        {carregandoCapitulos ? (
          <p className="leitor-folha text-tinta-2">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="leitor-folha text-tinta-2">Esta obra ainda não tem capítulos publicados.</p>
        ) : posicao < 0 ? (
          <p className="leitor-folha text-tinta-2">
            O capítulo {numero} não está publicado.{' '}
            <Link to={`/ler/${obraId}`} className="text-jade-forte underline">
              Ir para o primeiro capítulo
            </Link>
            .
          </p>
        ) : (
          <article className="leitor-folha">
            <h1 className="font-display text-2xl font-semibold">{detalhe ? tituloCapitulo(detalhe) : '…'}</h1>
            <div className="leitor-ornamento" aria-hidden />

            {carregandoTexto || !detalhe ? (
              <p className="text-tinta-2">Carregando…</p>
            ) : (
              detalhe.paragrafos.map((p, i) => (
                <div key={i} className="leitor-bloco">
                  <p>
                    {partirInline(p).map((s, j) =>
                      s.tipo === 'negrito' ? (
                        <strong key={j}>{s.texto}</strong>
                      ) : s.tipo === 'italico' ? (
                        <em key={j}>{s.texto}</em>
                      ) : (
                        s.texto
                      ),
                    )}
                  </p>
                </div>
              ))
            )}

            <nav className="mt-12 flex items-center justify-between gap-3 border-t border-linha pt-4">
              {anterior ? (
                <Link to={`/ler/${obraId}/${anterior.numero}`} className="ferramenta">
                  ‹ {anterior.numero}
                </Link>
              ) : (
                <span />
              )}
              {proximo ? (
                <Link to={`/ler/${obraId}/${proximo.numero}`} className="ferramenta">
                  {proximo.numero} ›
                </Link>
              ) : (
                <span className="text-sm text-tinta-2">Fim do que está publicado.</span>
              )}
            </nav>
          </article>
        )}
      </main>
    </div>
  );
}

/** Cabeçalho do capítulo. Não usa `cabecalhoPt` do shared: aquele lê campos de
    `CapituloResumo` que a vitrine não recebe. */
function tituloCapitulo(c: CapituloPublico): string {
  return c.titulo?.trim() ? `Capítulo ${c.numero} — ${c.titulo.trim()}` : `Capítulo ${c.numero}`;
}

function AjustesLeitura({
  setCorpo,
  setMedida,
}: {
  setCorpo: React.Dispatch<React.SetStateAction<number>>;
  setMedida: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <>
      <div className="seg shrink-0" data-manter>
        <button type="button" onClick={() => setCorpo((v) => Math.max(1, v - 1))} title="Diminuir a letra">
          A−
        </button>
        <button type="button" onClick={() => setCorpo((v) => Math.min(CORPOS.length, v + 1))} title="Aumentar a letra">
          A+
        </button>
      </div>
      <button
        type="button"
        className="ferramenta shrink-0"
        data-manter
        onClick={() => setMedida((v) => (v % MEDIDAS.length) + 1)}
        title="Largura da coluna de texto"
      >
        largura
      </button>
      <BotaoTema />
    </>
  );
}
