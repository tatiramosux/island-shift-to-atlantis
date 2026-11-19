/**
 * Idioma da interface: inglês (padrão) ou português. A escolha fica salva no aparelho; trocar de idioma recarrega a
 * página (por isso os textos fixos, calculados uma vez, também mudam). Uso: `t('English text', 'Texto em português')`.
 */
export type Lang = 'en' | 'pt';

const KEY = 'ais-lang';
let lang: Lang = 'en';
try {
  const saved = localStorage.getItem(KEY);
  if (saved === 'pt' || saved === 'en') lang = saved;
} catch {
  /* sem armazenamento (janela privada, testes): fica no padrão */
}

export const getLang = (): Lang => lang;

/** Troca o idioma e recarrega a página. */
export const setLang = (l: Lang): void => {
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* sem armazenamento: o idioma volta ao padrão no próximo carregamento */
  }
  location.reload();
};

/** Escolhe o texto do idioma atual. */
export const t = (en: string, pt: string): string => (lang === 'pt' ? pt : en);
