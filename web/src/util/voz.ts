import { useEffect, useState } from 'react';

// "Ouvir" do tutor (doc 29): a voz do próprio sistema (Web Speech API), sem
// custo e sem rede. Nem todo sistema tem voz instalada para o mandarim — sem
// voz do idioma, o hook devolve null e o botão simplesmente não aparece, em vez
// de ler hanzi com a voz portuguesa.

function vozPara(bcp47: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const prefixo = bcp47.toLowerCase().split('-')[0];
  const vozes = window.speechSynthesis.getVoices();
  return (
    vozes.find((v) => v.lang.toLowerCase() === bcp47.toLowerCase()) ??
    // zh-Hans não é etiqueta de voz; as vozes vêm como zh-CN / zh-TW.
    vozes.find((v) => v.lang.toLowerCase().startsWith(`${prefixo}-cn`)) ??
    vozes.find((v) => v.lang.toLowerCase().split(/[-_]/)[0] === prefixo) ??
    null
  );
}

/** Função que fala o texto no idioma, ou null se não há voz para ele. */
export function useVoz(bcp47: string): ((texto: string) => void) | null {
  const [voz, setVoz] = useState<SpeechSynthesisVoice | null>(() => vozPara(bcp47));

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    // As vozes chegam assíncronas no Chromium: a primeira leitura vem vazia.
    const atualizar = () => setVoz(vozPara(bcp47));
    atualizar();
    window.speechSynthesis.addEventListener('voiceschanged', atualizar);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', atualizar);
  }, [bcp47]);

  if (!voz) return null;
  return (texto: string) => {
    window.speechSynthesis.cancel();
    const fala = new SpeechSynthesisUtterance(texto);
    fala.voice = voz;
    fala.lang = voz.lang;
    fala.rate = 0.85; // um pouco mais devagar: é para aprender, não para ouvir rádio.
    window.speechSynthesis.speak(fala);
  };
}
