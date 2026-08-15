// O que mudou no app, e até onde isso chegou NESTA máquina.
//
// A página cruza duas fontes com naturezas diferentes: a lista curada
// (web/src/util/changelog.ts), que conta a história, e o carimbo do deploy
// (`/saude`), que diz onde ela parou aqui. Sem o carimbo, a mesma tela num
// laptop mostraria como no ar coisas que só existem ali.
import { useQuery } from '@tanstack/react-query';
import type { EstadoSaude } from '@dao-tale/shared';
import { api } from '../api';
import { CabecalhoPagina, Etiqueta } from '../App';
import { CHANGELOG, marcarPublicadas } from '../util/changelog';

const dataLonga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

export function Changelog() {
  const { data: saude } = useQuery({
    queryKey: ['saude'],
    queryFn: () => api<EstadoSaude>('GET', '/saude'),
  });

  const carimbo = saude?.versao ?? { commit: null, publicado_em: null, assunto: null };
  const linhas = marcarPublicadas(CHANGELOG, carimbo);
  const pendentes = linhas.filter((l) => l.publicada === false).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <CabecalhoPagina
        titulo="O que mudou"
        descricao="As entregas do Dao Tale, da mais recente para a mais antiga. Agrupadas por entrega, não por commit — o que interessa é o que ficou diferente para você."
      />

      {/* O carimbo primeiro: é a única coisa desta tela que não pode envelhecer,
          e é a pergunta que traz o revisor aqui ("o que está no ar agora?"). */}
      <div className="cartao p-4 text-sm">
        {carimbo.publicado_em ? (
          <>
            <p>
              <span className="text-tinta-2">No ar desde</span>{' '}
              <strong>{new Date(carimbo.publicado_em).toLocaleString('pt-BR')}</strong>
              {carimbo.commit && (
                <>
                  {' '}
                  <span className="text-tinta-2">·</span>{' '}
                  <code className="rounded bg-papel-fundo px-1.5 py-0.5 text-xs">{carimbo.commit}</code>
                </>
              )}
            </p>
            {carimbo.assunto && <p className="mt-1 text-tinta-2">{carimbo.assunto}</p>}
            {pendentes > 0 && (
              <p className="mt-2 text-ocre-forte">
                {pendentes} entrega{pendentes === 1 ? '' : 's'} abaixo ainda não {pendentes === 1 ? 'está' : 'estão'} nesta
                máquina.
              </p>
            )}
          </>
        ) : (
          // Ausência de carimbo é o caso normal em desenvolvimento. Dizer "não
          // sei" é melhor que marcar tudo como publicado e mandar o revisor
          // procurar na tela uma função que só existe no laptop.
          <p className="text-tinta-2">
            Sem carimbo de publicação — esta instância não foi enviada pelo <code className="text-xs">subir</code>, então
            não dá para dizer o que está no ar. O carimbo aparece nas instâncias publicadas.
          </p>
        )}
      </div>

      <div className="space-y-5">
        {linhas.map(({ entrada, publicada }) => (
          <article key={`${entrada.em}-${entrada.titulo}`} className="cartao p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold tracking-tight">{entrada.titulo}</h2>
              <div className="flex items-center gap-2">
                {publicada === false && <Etiqueta cor="ocre">ainda não publicada</Etiqueta>}
                <span className="text-xs text-tinta-2">{dataLonga(entrada.em)}</span>
              </div>
            </div>

            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-tinta">
              {entrada.itens.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>

            {entrada.nota && (
              <p className="mt-3 border-l-2 border-ocre/50 bg-ocre-tint px-3 py-2 text-sm leading-relaxed text-tinta">
                {entrada.nota}
              </p>
            )}
          </article>
        ))}
      </div>

      <p className="text-xs text-tinta-2">
        O histórico de esquema fica no banco (tabela <code>migracoes</code>, com a data de cada uma) e o de deploys, na
        pasta de backups do servidor — cada envio grava um <code>pre-deploy-*.db</code> antes de tocar em qualquer coisa.
      </p>
    </div>
  );
}
