import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { partirInline, type CapituloPublico, type CapituloPublicoDetalhe, type ObraPublica } from '@dao-tale/shared';
import { api } from '../api';
import { BotaoTema, Selo } from '../App';
import { SumarioVitrine, tituloCapitulo } from '../componentes/SumarioVitrine';
import { NotaInline } from '../componentes/NotaInline';
import { guardarUltimoCapitulo } from '../util/leitura';

// Leitor da vitrine pública (doc 14). É primo do `Leitor.tsx` da bancada e
// PROPOSITALMENTE não compartilha componente com ele: são duas superfícies com
// públicos diferentes, e um ajuste feito no leitor de trabalho — mostrar o
// chinês, marcar termo de glossário, botão de exportar — não pode escorregar
// para cá sem alguém decidir. O que a rua vê está inteiro neste arquivo.
//
// Diferenças em relação ao leitor da bancada, todas deliberadas: sem modo
// bilíngue (o texto de origem não é republicado), sem link para a obra na
// bancada, sem status de capítulo, sem download.
//
// ── Desenho de celular (doc 14 §10) ─────────────────────────────────────────
// Esta é a tela em que o visitante passa 99% do tempo, e ele passa esse tempo
// segurando um retângulo de 390px com uma mão. As decisões que vêm daí:
//
//   • A barra de cima carrega o mínimo (voltar, capítulo, sumário, Aa) e cada
//     alvo tem 44px — o resto do topo é texto.
//   • O que troca de capítulo é um botão do tamanho da tela NO FIM do capítulo,
//     onde a mão já está quando a pergunta aparece. Barra fixa no rodapé foi
//     recusada: come altura de leitura o tempo todo para servir a dois toques.
//   • O sumário é gaveta, não painel que empurra o texto — e abre no capítulo
//     em leitura, não no primeiro.
//   • "Largura da coluna" some no celular: não existe largura para escolher.

const CHAVE_CORPO = 'dao-tale-leitor-corpo';
const CHAVE_MEDIDA = 'dao-tale-leitor-medida';

const CORPOS = [1, 2, 3, 4, 5];
const MEDIDAS = [1, 2, 3];

function lerPreferencia(chave: string, padrao: number, maximo: number): number {
  const salvo = Number(localStorage.getItem(chave));
  return Number.isInteger(salvo) && salvo >= 1 && salvo <= maximo ? salvo : padrao;
}

/** Corpo inicial de quem nunca mexeu no A−/A+. Num aparelho estreito (SE, Mini)
 *  o passo 3 dá umas seis palavras por linha, e linha curta demais cansa tanto
 *  quanto letra pequena. Vale só para a primeira visita: a partir daí manda o
 *  que a pessoa escolheu. */
function corpoInicial(): number {
  return typeof window !== 'undefined' && window.innerWidth < 360 ? 2 : 3;
}

export function LeitorPublico() {
  const { obraId, numero } = useParams();
  const navegar = useNavigate();

  const [corpo, setCorpo] = useState(() => lerPreferencia(CHAVE_CORPO, corpoInicial(), CORPOS.length));
  const [medida, setMedida] = useState(() => lerPreferencia(CHAVE_MEDIDA, 2, MEDIDAS.length));
  const [gaveta, setGaveta] = useState<'sumario' | 'ajustes' | null>(null);
  const [progresso, setProgresso] = useState(0);

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
      if (e.key === 'Escape') setGaveta(null);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [atualNumero]);

  // A gaveta aberta trava a rolagem de trás: sem isto, arrastar dentro do
  // sumário rola a página do capítulo no celular ("scroll chaining").
  useEffect(() => {
    if (!gaveta) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = antes;
    };
  }, [gaveta]);

  // Marca de leitura para a contracapa oferecer "continuar" (util/leitura.ts).
  useEffect(() => {
    if (posicao >= 0) guardarUltimoCapitulo(obraId, atualNumero);
  }, [obraId, atualNumero, posicao]);

  // Fio de progresso do capítulo. `passive` porque é leitura pura: um ouvinte
  // de scroll não-passivo é a causa clássica de rolagem travada no celular.
  useEffect(() => {
    const medir = () => {
      const rolavel = document.documentElement.scrollHeight - window.innerHeight;
      setProgresso(rolavel > 0 ? Math.min(100, Math.max(0, (window.scrollY / rolavel) * 100)) : 0);
    };
    medir();
    window.addEventListener('scroll', medir, { passive: true });
    window.addEventListener('resize', medir);
    return () => {
      window.removeEventListener('scroll', medir);
      window.removeEventListener('resize', medir);
    };
  }, [detalhe]);

  // Obra privada e obra inexistente respondem igual (404) — a tela também não
  // pode distinguir as duas, senão desfaz no cliente o cuidado do servidor.
  if (obraErrada) {
    return (
      <div className="vitrine vitrine-margem py-10">
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
      className="vitrine"
      style={{
        ['--leitor-corpo' as string]: `var(--leitor-txt-${corpo})`,
        ['--leitor-medida' as string]: `var(--leitor-medida-${medida})`,
      }}
    >
      <header className="vitrine-barra relative">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-2 py-1">
          {/* O selo volta para a contracapa da obra, um degrau acima — no
              celular não há migalha de pão nem aba: este canto É a volta. */}
          <Link to={`/ler/${obraId}`} className="toque shrink-0" title="Voltar para a obra">
            <Selo />
          </Link>

          {/* Duas linhas em vez de uma frase cortada: o título da obra e o do
              capítulo não cabem lado a lado em 390px, e o que o leitor precisa
              saber a qualquer momento é em que capítulo está. */}
          <div className="min-w-0 flex-1 px-1 leading-tight">
            <p className="truncate text-xs text-tinta-2">{obra?.titulo ?? '…'}</p>
            <p className="truncate font-display text-sm font-semibold">
              {atualNumero !== undefined ? `Capítulo ${atualNumero}` : '…'}
              {lista.length > 0 && <span className="font-normal text-tinta-2"> de {lista.length}</span>}
            </p>
          </div>

          <button
            type="button"
            className="toque shrink-0 rounded-full text-lg text-tinta-2"
            aria-expanded={gaveta === 'sumario'}
            onClick={() => setGaveta((v) => (v === 'sumario' ? null : 'sumario'))}
            title="Sumário"
          >
            <span aria-hidden>☰</span>
            <span className="sr-only">Sumário</span>
          </button>
          <button
            type="button"
            className="toque shrink-0 rounded-full text-tinta-2"
            aria-expanded={gaveta === 'ajustes'}
            onClick={() => setGaveta((v) => (v === 'ajustes' ? null : 'ajustes'))}
            title="Ajustes de leitura"
          >
            <span aria-hidden>Aa</span>
            <span className="sr-only">Ajustes de leitura</span>
          </button>
        </div>
        <div className="leitor-progresso" style={{ width: `${progresso}%` }} aria-hidden />
      </header>

      {gaveta === 'sumario' && (
        <Gaveta titulo="Sumário" aoFechar={() => setGaveta(null)}>
          <SumarioVitrine
            capitulos={lista}
            obraId={obraId}
            atual={atualNumero}
            aoEscolher={() => setGaveta(null)}
            saltarParaAtual
          />
        </Gaveta>
      )}

      {gaveta === 'ajustes' && (
        <Gaveta titulo="Leitura" aoFechar={() => setGaveta(null)}>
          <AjustesLeitura
            corpo={corpo}
            setCorpo={setCorpo}
            medida={medida}
            setMedida={setMedida}
          />
        </Gaveta>
      )}

      <main className="leitor-publico pt-6">
        {carregandoCapitulos ? (
          <p className="leitor-folha text-tinta-2">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="leitor-folha text-tinta-2">Esta obra ainda não tem capítulos publicados.</p>
        ) : posicao < 0 ? (
          <p className="leitor-folha text-tinta-2">
            O capítulo {numero} não está publicado.{' '}
            <Link to={`/ler/${obraId}`} className="text-jade-forte underline">
              Ver os capítulos disponíveis
            </Link>
            .
          </p>
        ) : (
          <article className="leitor-folha">
            <h1 className="font-display text-xl leading-tight font-semibold sm:text-2xl">
              {detalhe ? tituloCapitulo(detalhe) : '…'}
            </h1>
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
                      ) : s.tipo === 'nota' ? (
                        <NotaInline key={j} texto={s.texto} />
                      ) : (
                        s.texto
                      ),
                    )}
                  </p>
                </div>
              ))
            )}

            {/* Fim do capítulo: aqui o polegar já está na tela e a pergunta é
                uma só. Botão do tamanho da coluna, não pílula de 26px. */}
            <nav className="mt-10 flex flex-col gap-2 border-t border-linha pt-6">
              {proximo ? (
                <Link to={`/ler/${obraId}/${proximo.numero}`} className="acao-larga">
                  Próximo capítulo ›
                </Link>
              ) : (
                <p className="rounded border border-linha px-3 py-3 text-center text-sm text-tinta-2">
                  Fim do que está publicado.
                </p>
              )}
              <div className="flex gap-2">
                {anterior && (
                  <Link to={`/ler/${obraId}/${anterior.numero}`} className="acao-larga acao-larga--calma">
                    ‹ Anterior
                  </Link>
                )}
                <button type="button" className="acao-larga acao-larga--calma" onClick={() => setGaveta('sumario')}>
                  Sumário
                </button>
              </div>
            </nav>
          </article>
        )}
      </main>
    </div>
  );
}

/** Gaveta: sobe do rodapé no celular, vira caixa centrada no desktop (a troca
 *  está no CSS, não aqui). Fecha no toque fora, no ✕ e no Esc. */
function Gaveta({
  titulo,
  aoFechar,
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
}) {
  const painel = useRef<HTMLDivElement>(null);
  return (
    <div
      className="gaveta"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onPointerDown={(e) => {
        if (!painel.current?.contains(e.target as Node)) aoFechar();
      }}
    >
      <div ref={painel} className="gaveta-painel">
        <div className="gaveta-puxador" aria-hidden />
        <div className="vitrine-margem flex shrink-0 items-center justify-between gap-2 py-1">
          <p className="olho">{titulo}</p>
          <button type="button" className="toque -mr-2 rounded-full text-tinta-2" onClick={aoFechar} title="Fechar">
            <span aria-hidden>✕</span>
            <span className="sr-only">Fechar</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AjustesLeitura({
  corpo,
  setCorpo,
  medida,
  setMedida,
}: {
  corpo: number;
  setCorpo: React.Dispatch<React.SetStateAction<number>>;
  medida: number;
  setMedida: React.Dispatch<React.SetStateAction<number>>;
}) {
  return (
    <div className="vitrine-margem flex flex-col gap-4 pt-2 pb-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">Tamanho da letra</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="ferramenta ferramenta-toque"
            onClick={() => setCorpo((v) => Math.max(1, v - 1))}
            aria-label="Diminuir a letra"
            aria-disabled={corpo === 1}
          >
            A−
          </button>
          <span className="w-8 text-center font-mono text-sm tabular-nums text-tinta-2">
            {corpo}/{CORPOS.length}
          </span>
          <button
            type="button"
            className="ferramenta ferramenta-toque"
            onClick={() => setCorpo((v) => Math.min(CORPOS.length, v + 1))}
            aria-label="Aumentar a letra"
            aria-disabled={corpo === CORPOS.length}
          >
            A+
          </button>
        </div>
      </div>

      {/* Só no desktop: no celular a coluna já é a largura da tela, e o controle
          seria um botão que não faz nada visível. */}
      <div className="hidden items-center justify-between gap-3 sm:flex">
        <span className="text-sm">Largura da coluna</span>
        <button
          type="button"
          className="ferramenta ferramenta-toque"
          onClick={() => setMedida((v) => (v % MEDIDAS.length) + 1)}
        >
          {medida}/{MEDIDAS.length}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-sm">Tema</span>
        <BotaoTema tamanho="toque" />
      </div>
    </div>
  );
}
