import React, { createContext, useContext, type ReactNode } from 'react';
import { PERFIL_MANDARIM, estiloDoOriginal, perfilDe, type PerfilIdioma } from '@dao-tale/shared';

// O perfil de idioma da obra aberta, para as telas da bancada.
//
// Por que contexto e não prop: a classe de tipografia do original e o rótulo do
// idioma aparecem em ~30 pontos espalhados por quinze arquivos — editor, mapa de
// glossário, gaveta de revisão, consistência, banco de testes. Passar isso por
// prop atravessaria uma dúzia de componentes que não têm nada a ver com idioma,
// e o primeiro que alguém esquecesse voltaria a renderizar inglês com fonte CJK
// sem ninguém notar. O layout da obra já carrega a obra; ele provê, e quem
// precisa pergunta.
//
// O padrão é o mandarim: fora da árvore de uma obra (Configurações, Docs) não há
// perfil, e o mandarim é o que toda obra anterior aos perfis é.

const PerfilObraContexto = createContext<PerfilIdioma>(PERFIL_MANDARIM);

export function ProvedorPerfilObra({
  idioma,
  children,
}: {
  idioma: string | null | undefined;
  children: ReactNode;
}) {
  const perfil = perfilDe(idioma);
  // O `div` não é decorativo: é onde as variáveis de tipografia do original
  // entram na árvore. Tudo que usa `.texto-zh` daqui para baixo herda a fonte e
  // a entrelinha deste perfil sem saber que perfis existem.
  return (
    <PerfilObraContexto.Provider value={perfil}>
      <div style={estiloDoOriginal(perfil) as React.CSSProperties}>{children}</div>
    </PerfilObraContexto.Provider>
  );
}

/** Perfil da obra aberta. A tipografia do original já vem por herança CSS
 *  (classe `.texto-zh`); este hook serve ao que o CSS não resolve — `.rotulo`
 *  para o nome do idioma na tela e `.ehDaOrigem` para decidir o que traduzir. */
export function usePerfilObra(): PerfilIdioma {
  return useContext(PerfilObraContexto);
}
