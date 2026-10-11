import { en } from './en';
import { fr, type MessageKey } from './fr';

// Langue du portail : choix mémorisé, sinon langue du navigateur (français
// pour le français, anglais sinon). Fixée pour toute la durée de la page :
// changer de langue recharge le portail (la session est conservée par les
// cookies HttpOnly), si bien que tous les textes — y compris ceux calculés
// au chargement des modules (menus, schémas de validation) — suivent.

export type Lang = 'fr' | 'en';
export type { MessageKey };

const STORAGE_KEY = 'xlcab.corporate.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  } catch {
    /* stockage indisponible : langue du navigateur */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export const lang: Lang = initialLang();

/** Locale des formats (montants, dates) : anglais d'Irlande (euro, jour/mois/année). */
export const locale = lang === 'fr' ? 'fr-FR' : 'en-IE';

if (typeof document !== 'undefined') {
  document.documentElement.lang = lang;
  // Titre de l'onglet (index.html est statique, en français).
  document.title = lang === 'fr' ? 'XLCAB — Espace entreprise' : 'XLCAB — Business portal';
}

const messages: Record<MessageKey, string> = lang === 'fr' ? fr : en;

/** Texte traduit ; « {nom} » remplacé par params.nom. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text = messages[key] ?? fr[key];
  return params ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m)) : text;
}

/** Change la langue du portail : mémorisée, puis rechargement. */
export function setLang(next: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* sans stockage : le rechargement revient à la langue du navigateur */
  }
  window.location.reload();
}
