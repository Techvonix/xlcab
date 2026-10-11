import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeJwt } from '@/test/fixtures';
import { ApiError, api, isTwoFactorRequired, login, twoFactor } from './api';
import { useAuth } from './auth-store';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('client API admin', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useAuth.getState().clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('envoie le jeton d’accès ; preuve 2FA et refresh en cookies HttpOnly (X-Client web, credentials include)', async () => {
    useAuth.getState().setAccessToken(fakeJwt({ sub: 'ops', role: 'admin' }));
    useAuth.getState().setTwoFactorVerified(true);
    fetchMock.mockResolvedValueOnce(json(200, {}));
    await api.analytics();
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.Authorization).toMatch(/^Bearer /);
    expect(headers['X-Client']).toBe('web');
    expect(headers['X-2FA-Token']).toBeUndefined();
    expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
    expect(sessionStorage.length).toBe(0);
  });

  it('preuve 2FA expirée côté serveur : effacée, l’app repasse sur l’écran de code', async () => {
    useAuth.getState().setAccessToken(fakeJwt({ sub: 'ops', role: 'admin' }));
    useAuth.getState().setTwoFactorVerified(true);
    fetchMock.mockResolvedValueOnce(json(403, { code: 'TWO_FACTOR_REQUIRED', message: 'Double authentification requise' }));

    const error = await api.analytics().catch((e) => e);
    expect(isTwoFactorRequired(error)).toBe(true);
    expect(useAuth.getState().twoFactorVerified).toBe(false);
    expect(useAuth.getState().accessToken).not.toBeNull(); // la session reste ouverte
  });

  it('vérification du code : la preuve reste dans son cookie, l’app note seulement que la 2FA est passée', async () => {
    useAuth.getState().setAccessToken(fakeJwt({ sub: 'ops', role: 'admin' }));
    fetchMock.mockResolvedValueOnce(json(200, { expiresIn: 43200 }));
    await twoFactor.verify('123456');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ code: '123456' });
    expect(useAuth.getState().twoFactorVerified).toBe(true);
  });

  it('seul le rôle admin peut se connecter', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { accessToken: fakeJwt({ sub: 'boss', role: 'corporate_admin' }) }));
    await expect(login('boss@acme.fr', 'x')).rejects.toBeInstanceOf(ApiError);
    expect(useAuth.getState().accessToken).toBeNull();
  });

  it('document : récupéré en blob via l’API authentifiée (pas d’URL publique)', async () => {
    useAuth.getState().setAccessToken(fakeJwt({ sub: 'ops', role: 'admin' }));
    useAuth.getState().setTwoFactorVerified(true);
    // Corps texte : le Response de jsdom ne sait pas relire un Blob.
    fetchMock.mockResolvedValueOnce(new Response('jpeg', { status: 200 }));
    const blob = await api.documentFile('d1', 'doc-3');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/admin/drivers/d1/documents/doc-3/file');
    // Le Blob de jsdom n'a pas .text() : on vérifie la taille reçue.
    expect(blob.size).toBe(4);
  });
});
