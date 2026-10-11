import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeJwt } from '@/test/fixtures';
import { ApiError, api, apiFetch, login } from './api';
import { useAuth } from './auth-store';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('client API', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useAuth.getState().clear();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('ajoute le jeton d’accès en en-tête Authorization', async () => {
    useAuth.getState().setAccessToken(fakeJwt({ sub: 'u1', role: 'corporate_admin' }));
    fetchMock.mockResolvedValueOnce(json(200, []));
    await api.members();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/corporate/members');
    expect(init.headers.Authorization).toMatch(/^Bearer /);
  });

  it('session par cookies HttpOnly : X-Client web + credentials include, aucun jeton secret côté JavaScript', async () => {
    useAuth.getState().setAccessToken(fakeJwt({ sub: 'u1', role: 'corporate_admin' }));
    useAuth.getState().setTwoFactorVerified(true);
    fetchMock.mockResolvedValueOnce(json(200, []));
    await api.members();
    const init = fetchMock.mock.calls[0][1];
    expect(init.credentials).toBe('include');
    expect(init.headers['X-Client']).toBe('web');
    expect(init.headers['X-2FA-Token']).toBeUndefined();
    expect(sessionStorage.length).toBe(0);
  });

  it('preuve 2FA expirée : retour à l’écran de code', async () => {
    useAuth.getState().setAccessToken(fakeJwt({ sub: 'u1', role: 'corporate_admin' }));
    useAuth.getState().setTwoFactorVerified(true);

    fetchMock.mockResolvedValueOnce(json(403, { statusCode: 403, code: 'TWO_FACTOR_REQUIRED', message: 'Double authentification requise' }));
    await expect(api.members()).rejects.toMatchObject({ status: 403, code: 'TWO_FACTOR_REQUIRED' });
    expect(useAuth.getState().twoFactorVerified).toBe(false);
    // La session elle-même est conservée (pas de reconnexion complète).
    expect(useAuth.getState().session).not.toBeNull();
  });

  it('401 → rafraîchit la session une fois puis rejoue la requête', async () => {
    useAuth.getState().setAccessToken(fakeJwt({ sub: 'u1', role: 'corporate_admin' }));
    const fresh = fakeJwt({ sub: 'u1', role: 'corporate_admin', v: 2 });
    fetchMock
      .mockResolvedValueOnce(json(401, {}))
      .mockResolvedValueOnce(json(200, { accessToken: fresh }))
      .mockResolvedValueOnce(json(200, [{ id: 'm1' }]));

    await expect(api.members()).resolves.toEqual([{ id: 'm1' }]);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/auth/refresh');
    // Le refresh token est dans le cookie : corps vide, cookies envoyés.
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({});
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ credentials: 'include', headers: { 'X-Client': 'web' } });
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe(`Bearer ${fresh}`);
  });

  it('rafraîchissement refusé → session effacée, erreur "session expirée"', async () => {
    useAuth.getState().setAccessToken(fakeJwt({ sub: 'u1', role: 'corporate_admin' }));
    fetchMock.mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(401, {}));

    await expect(api.members()).rejects.toMatchObject({ status: 401, message: 'Votre session a expiré. Reconnectez-vous.' });
    expect(useAuth.getState().session).toBeNull();
    expect(useAuth.getState().twoFactorVerified).toBe(false);
  });

  it('relaie le message métier du serveur (400), pas les détails techniques', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { message: 'Plafond mensuel du collaborateur dépassé (reste 96,90 €)' }));
    await expect(apiFetch('/x')).rejects.toThrow('Plafond mensuel du collaborateur dépassé (reste 96,90 €)');

    fetchMock.mockResolvedValueOnce(json(400, { message: ['seats must not be greater than 7'] }));
    await expect(apiFetch('/x')).rejects.toThrow('Certaines informations sont invalides.');

    fetchMock.mockResolvedValueOnce(json(500, { message: 'TypeError at line 42' }));
    await expect(apiFetch('/x')).rejects.toThrow('Service momentanément indisponible');
  });

  describe('connexion', () => {
    it('admin corporate : session ouverte', async () => {
      fetchMock.mockResolvedValueOnce(json(200, { accessToken: fakeJwt({ sub: 'boss', role: 'corporate_admin' }) }));
      await login('boss@acme.fr', 'secret');
      expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'include', headers: { 'X-Client': 'web' } });
      expect(useAuth.getState().session).toMatchObject({ userId: 'boss', role: 'corporate_admin' });
    });

    it('autre rôle (passager, collaborateur…) : refusé sur ce portail', async () => {
      fetchMock.mockResolvedValueOnce(json(200, { accessToken: fakeJwt({ sub: 'emp', role: 'corporate_member' }) }));
      await expect(login('emp@acme.fr', 'secret')).rejects.toBeInstanceOf(ApiError);
      expect(useAuth.getState().session).toBeNull();
    });

    it('mauvais identifiants : message générique', async () => {
      fetchMock.mockResolvedValueOnce(json(401, { message: 'Email ou mot de passe incorrect' }));
      await expect(login('x@y.fr', 'bad')).rejects.toThrow('Email ou mot de passe incorrect.');
    });
  });
});
