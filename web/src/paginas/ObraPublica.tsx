import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { CapituloPublico, ObraPublica as TipoObraPublica } from '@dao-tale/shared';
import { api } from '../api';
import { CascaVitrine } from '../componentes/CascaVitrine';
import { SumarioVitrine } from '../componentes/SumarioVitrine';
import { lerUltimoCapitulo } from '../util/leitura';

// Contracapa da vitrine (doc 14 §10). Antes, o cartão da estante caía direto no
// capítulo 1 — e a sinopse, que a API sempre devolveu, não tinha onde aparecer.
// Quem chega por um link recebia o meio de uma cena sem saber o que estava
// abrindo, e no celular isso é pior: não há barra lateral nem aba para voltar e
// se situar.
//
// Aqui a obra se apresenta: capa, autor, gênero, sinopse, tamanho — e UMA ação
// grande, "começar a ler" ou "continuar", que é a única coisa que a maior parte
// das visitas quer apertar.
//
// Só fala com `/publico/*` (ver o cabeçalho de Biblioteca.tsx).

export function ObraPublica() {
  const { obraId } = useParams();

  const { data: obra, isPending, isError } = useQuery({
    queryKey: ['publico', 'obra', obraId],
    queryFn: () => api<TipoObraPublica>('GET', `/publico/obras/${obraId}`),
    retry: false,
  });
  const { data: capitulos } = useQuery({
    queryKey: ['publico', 'capitulos', obraId],
    queryFn: () => api<CapituloPublico[]>('GET', `/publico/obras/${obraId}/capitulos`),
    retry: false,
  });

  const lista = capitulos ?? [];
  const primeiro = lista[0]?.numero;
  // "Onde eu estava" mora no aparelho, não no servidor: a vitrine não tem conta
  // de leitor e não escreve nada do lado de lá (doc 14 §8).
  const salvo = lerUltimoCapitulo(obraId);
  const retomar = salvo !== undefined && lista.some((c) => c.numero === salvo) ? salvo : undefined;

  // Obra privada e obra inexistente respondem igual (404) — a tela também não
  // pode distinguir as duas, senão desfaz no cliente o cuidado do servidor.
  if (isError) {
    return (
      <CascaVitrine voltar={{ para: '/', rotulo: 'Estante' }}>
        <main className="vitrine-margem mx-auto max-w-2xl py-10 text-tinta-2">
          <p>Esta obra não está disponível.</p>
          <Link to="/" className="mt-4 acao-larga acao-larga--calma">
            Voltar para a estante
          </Link>
        </main>
      </CascaVitrine>
    );
  }

  return (
    <CascaVitrine voltar={{ para: '/', rotulo: 'Estante' }}>
      <main className="mx-auto max-w-2xl pb-[calc(var(--esp-6)+var(--seguro-baixo))]">
        <div className="vitrine-margem pt-6">
          {/* Capa e identificação lado a lado desde o celular: empilhar jogaria
              a sinopse para baixo da dobra num aparelho de 844px de altura. */}
          <div className="flex gap-4">
            <Capa obra={obra} />
            <div className="flex min-w-0 flex-1 flex-col">
              <h1 className="font-display text-xl leading-tight font-semibold sm:text-2xl">
                {obra?.titulo ?? '…'}
              </h1>
              {obra?.titulo_original && <p className="mt-1 font-zh text-sm text-tinta-2">{obra.titulo_original}</p>}
              {obra?.autor && <p className="mt-1.5 text-sm text-tinta-2">{obra.autor}</p>}
              {obra && (
                <p className="mt-1.5 text-xs text-tinta-2">
                  <span className="font-mono tabular-nums">{obra.capitulos_publicos}</span>{' '}
                  {obra.capitulos_publicos === 1 ? 'capítulo publicado' : 'capítulos publicados'}
                </p>
              )}
            </div>
          </div>

          {obra && obra.tags.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {obra.tags.map((t) => (
                <li key={t} className="tag-obra">
                  {t}
                </li>
              ))}
            </ul>
          )}

          {/* A ação principal vem ANTES da sinopse: quem já conhece a obra não
              deve ter que rolar um texto para achar o botão de ler. */}
          {primeiro !== undefined && (
            // No celular a ação ocupa a largura toda; no desktop uma faixa de
            // 20rem já é um alvo enorme, e esticá-la vira faixa de propaganda.
            <div className="mt-5 flex flex-col gap-2 sm:max-w-xs">
              <Link to={`/ler/${obraId}/${retomar ?? primeiro}`} className="acao-larga">
                {retomar !== undefined ? `Continuar do capítulo ${retomar}` : 'Começar a ler'}
              </Link>
              {retomar !== undefined && retomar !== primeiro && (
                <Link to={`/ler/${obraId}/${primeiro}`} className="acao-larga acao-larga--calma">
                  Começar do início
                </Link>
              )}
            </div>
          )}

          {obra?.sinopse && (
            <section className="mt-6">
              <h2 className="olho">Sinopse</h2>
              <p className="mt-2 leading-relaxed whitespace-pre-line text-tinta">{obra.sinopse}</p>
            </section>
          )}
        </div>

        <section className="mt-8">
          <h2 className="olho vitrine-margem mb-2">
            Capítulos {lista.length > 0 && <span className="font-mono">({lista.length})</span>}
          </h2>
          {isPending ? (
            <p className="vitrine-margem text-sm text-tinta-2">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="vitrine-margem text-sm text-tinta-2">Esta obra ainda não tem capítulos publicados.</p>
          ) : (
            <SumarioVitrine capitulos={lista} obraId={obraId} atual={retomar} />
          )}
        </section>
      </main>
    </CascaVitrine>
  );
}

function Capa({ obra }: { obra: TipoObraPublica | undefined }) {
  const classe = 'w-28 shrink-0 aspect-[2/3] rounded object-cover sm:w-36';
  if (obra?.tem_capa) {
    return <img src={`/api/publico/obras/${obra.id}/capa`} alt="" className={classe} />;
  }
  return (
    <div className={`${classe} grid place-items-center bg-papel-fundo font-zh text-4xl text-tinta-2/60`} aria-hidden>
      書
    </div>
  );
}
