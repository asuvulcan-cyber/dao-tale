import { useState } from 'react';
import { ErroApi, api } from '../api';
import { Aviso, Botao } from '../App';

// Tela de entrada do modo hospedado (doc 13 §7). Primeira coisa que aparece no
// celular, então é desenhada mobile-first: um campo grande, um botão largo,
// nada de casca nem navegação (não há para onde ir sem sessão).

export function Login({ aoEntrar, senhaDefinida }: { aoEntrar: () => void; senhaDefinida: boolean }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!senha || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await api<{ ok: true }>('POST', '/sessao', { senha });
      setSenha('');
      aoEntrar();
    } catch (e) {
      // O servidor responde de propósito sem distinguir "senha errada" de
      // "senha inexistente"; aqui só repassamos o que ele disse.
      setErro(e instanceof ErroApi ? e.message : 'Não foi possível entrar.');
      setEnviando(false);
    }
  }

  return (
    <div className="vitrine vitrine-margem flex items-center justify-center py-10">
      <main className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="grid size-12 place-items-center rounded-selo bg-selo font-zh text-2xl leading-none text-papel-alto" aria-hidden>
            道
          </span>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Dao Tale</h1>
          <p className="text-sm text-tinta-2">Acesso pessoal — entre para continuar.</p>
        </div>

        <form onSubmit={enviar} className="cartao flex flex-col gap-3 p-4">
          <label htmlFor="senha" className="olho">
            Senha
          </label>
          <input
            id="senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            // 16px evita o zoom automático do iOS ao focar o campo.
            className="entrada w-full text-base"
            style={{ minHeight: 'var(--toque)' }}
            placeholder="sua frase-senha"
          />
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {!senhaDefinida && (
            <Aviso tipo="info">
              Nenhuma senha foi definida neste servidor. Rode <code>npm run senha</code> na máquina onde o Dao Tale está
              instalado.
            </Aviso>
          )}
          <Botao type="submit" disabled={enviando || !senha} className="acao-larga">
            {enviando ? 'Entrando…' : 'Entrar'}
          </Botao>
        </form>
      </main>
    </div>
  );
}
