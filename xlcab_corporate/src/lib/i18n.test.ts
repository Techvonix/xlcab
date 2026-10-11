import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from './i18n/en';
import { fr } from './i18n/fr';

// Portail en anglais : la langue est lue au chargement des modules, d'où
// un rechargement des modules (vi.resetModules) pour chaque langue testée.

async function loadIn(language: 'fr' | 'en') {
  localStorage.setItem('xlcab.corporate.lang', language);
  vi.resetModules();
  return {
    i18n: await import('./i18n'),
    format: await import('./format'),
  };
}

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('traduction du portail', () => {
  afterEach(() => {
    localStorage.setItem('xlcab.corporate.lang', 'fr');
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('dictionnaires : mêmes clés, mêmes paramètres, aucun texte vide', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    for (const key of Object.keys(fr) as (keyof typeof fr)[]) {
      expect(params(en[key]), key).toEqual(params(fr[key]));
      expect(en[key].trim(), key).not.toBe('');
    }
  });

  it('anglais : textes, paramètres, formats d’euros et de mois', async () => {
    const { i18n, format } = await loadIn('en');
    expect(i18n.lang).toBe('en');
    expect(i18n.t('seConnecter')).toBe('Sign in');
    expect(i18n.t('aEteAjouteEA', { email: 'lea@acme.fr' })).toBe('lea@acme.fr has been added to the team.');
    expect(format.formatEuros(12150)).toBe('€121.50');
    expect(format.formatMonth('2026-10')).toBe('October 2026');
    expect(document.documentElement.lang).toBe('en');
  });

  it('français : comportement d’origine', async () => {
    const { i18n, format } = await loadIn('fr');
    expect(i18n.t('seConnecter')).toBe('Se connecter');
    expect(format.formatMonth('2026-10')).toBe('octobre 2026');
  });

  it('les requêtes annoncent la langue au serveur (messages d’erreur traduits)', async () => {
    await loadIn('en');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accessToken: 'x.eyJyb2xlIjoicGFzc2VuZ2VyIn0.y' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { login } = await import('./api');
    await login('lea@acme.fr', 'secret').catch(() => undefined);
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'X-Client': 'web', 'X-Locale': 'en' });
  });

  it('langue du navigateur quand aucun choix n’est mémorisé', async () => {
    localStorage.removeItem('xlcab.corporate.lang');
    vi.resetModules();
    vi.stubGlobal('navigator', { language: 'fr-BE' });
    expect((await import('./i18n')).lang).toBe('fr');
    vi.resetModules();
    vi.stubGlobal('navigator', { language: 'de-DE' });
    expect((await import('./i18n')).lang).toBe('en');
  });
});
