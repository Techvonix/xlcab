// Session des portails web (corporate, admin) : jetons sensibles en cookies
// HttpOnly, illisibles par JavaScript — un script injecté (XSS) ne peut plus
// les voler (Partie 8). L'app mobile, elle, garde ses jetons dans le coffre
// sécurisé du téléphone et continue d'utiliser le corps des réponses.
//
// Le mode cookie n'est activé que si le client l'annonce (en-tête
// « X-Client: web ») : un en-tête personnalisé impose un pré-vol CORS,
// refusé pour toute origine hors liste blanche. Avec SameSite=Strict, un
// site tiers ne peut donc ni envoyer ni exploiter ces cookies (CSRF).

export const REFRESH_COOKIE = 'xlcab_refresh';
export const TWO_FACTOR_COOKIE = 'xlcab_2fa';
export const WEB_CLIENT_HEADER = 'x-client';

const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 3600; // = durée du refresh token
const REFRESH_PATH = '/api/v1/auth'; // envoyé seulement aux routes d'authentification

type Req = { headers?: Record<string, string | string[] | undefined> };
type Res = { append: (name: string, value: string) => unknown };

export function isWebClient(req: Req): boolean {
  const v = req.headers?.[WEB_CLIENT_HEADER];
  return (Array.isArray(v) ? v[0] : v) === 'web';
}

/** Valeur d'un cookie de la requête (sans dépendance externe). */
export function readCookie(req: Req, name: string): string | undefined {
  const raw = req.headers?.cookie;
  const header = Array.isArray(raw) ? raw.join(';') : raw;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** HTTPS obligatoire en production ; en local (http://localhost), Secure empêcherait le cookie. */
const secure = () => (process.env.NODE_ENV === 'production' ? '; Secure' : '');

export function setCookie(res: Res, name: string, value: string, maxAgeSeconds: number, path: string) {
  res.append(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=${path}; HttpOnly; SameSite=Strict${secure()}`,
  );
}

export function clearCookie(res: Res, name: string, path: string) {
  res.append('Set-Cookie', `${name}=; Max-Age=0; Path=${path}; HttpOnly; SameSite=Strict${secure()}`);
}

export const setRefreshCookie = (res: Res, token: string) => setCookie(res, REFRESH_COOKIE, token, REFRESH_MAX_AGE_SECONDS, REFRESH_PATH);
export const clearRefreshCookie = (res: Res) => clearCookie(res, REFRESH_COOKIE, REFRESH_PATH);

/**
 * Réponse de connexion / rotation : pour un portail web, le refresh token part
 * en cookie et n'apparaît plus dans le corps (inaccessible au JavaScript).
 */
export function webTokens<T extends { accessToken: string; refreshToken: string }>(req: Req, res: Res, tokens: T) {
  if (!isWebClient(req)) return tokens;
  setRefreshCookie(res, tokens.refreshToken);
  const { refreshToken: _hidden, ...rest } = tokens;
  return rest;
}
