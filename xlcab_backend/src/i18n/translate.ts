import { MESSAGES_EN } from './messages.en';

/** Langue demandée par le client : en-tête X-Locale (app mobile). Absent → français. */
export const LOCALE_HEADER = 'x-locale';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = new Map(Object.entries(MESSAGES_EN));
// Gabarits : « Documents manquants : {} » → /^Documents manquants : (.+?)$/.
const patterns = [...exact.entries()]
  .filter(([fr]) => fr.includes('{}'))
  .map(([fr, en]) => ({ re: new RegExp(`^${fr.split('{}').map(esc).join('(.+?)')}$`, 's'), en }));

/** Anglais pour toute langue autre que le français (irlandais compris, faute de traduction). */
export function wantsEnglish(header: string | string[] | undefined): boolean {
  const value = (Array.isArray(header) ? header[0] : header)?.trim().toLowerCase();
  return !!value && !value.startsWith('fr');
}

/** Partie variable : traduite si elle est connue (nom de document, liste « a, b »). */
function part(value: string): string {
  return exact.get(value) ?? value.split(', ').map((p) => exact.get(p) ?? p).join(', ');
}

/** Message français → anglais ; inchangé s'il est absent du catalogue. */
export function toEnglish(message: string): string {
  const direct = exact.get(message);
  if (direct) return direct;
  for (const { re, en } of patterns) {
    const m = re.exec(message);
    if (m) {
      let i = 1;
      return en.replace(/\{\}/g, () => part(m[i++]));
    }
  }
  return message;
}

/** Corps d'erreur Nest : chaîne, ou objet dont `message` est une chaîne ou une liste. */
export function localizeBody(body: unknown): unknown {
  if (typeof body === 'string') return toEnglish(body);
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message: unknown }).message;
    return {
      ...(body as object),
      message: typeof message === 'string' ? toEnglish(message) : Array.isArray(message) ? message.map((m) => (typeof m === 'string' ? toEnglish(m) : m)) : message,
    };
  }
  return body;
}
