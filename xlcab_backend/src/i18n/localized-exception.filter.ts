import { ArgumentsHost, Catch, HttpException, Module } from '@nestjs/common';
import { APP_FILTER, BaseExceptionFilter } from '@nestjs/core';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { LOCALE_HEADER, localizeBody, toEnglish, wantsEnglish } from './translate';

/**
 * Messages d'erreur HTTP dans la langue de l'app (en-tête X-Locale) : les
 * messages restent écrits en français dans le code et sont traduits ici
 * (catalogue messages.en.ts). Sans en-tête — portails web, outils —, la
 * réponse est inchangée. Les codes métier (TWO_FACTOR_REQUIRED…) et le statut
 * ne changent jamais : seul le texte est traduit.
 */
@Catch(HttpException)
export class LocalizedExceptionFilter extends BaseExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    if (host.getType() !== 'http') return super.catch(exception, host);
    const request = host.switchToHttp().getRequest<{ headers?: Record<string, string | string[] | undefined> }>();
    if (!wantsEnglish(request?.headers?.[LOCALE_HEADER])) return super.catch(exception, host);
    const translated = new HttpException(localizeBody(exception.getResponse()) as string | Record<string, unknown>, exception.getStatus(), { cause: exception });
    return super.catch(translated, host);
  }
}

@Module({ providers: [{ provide: APP_FILTER, useClass: LocalizedExceptionFilter }] })
export class I18nModule {}

/**
 * Même traduction pour le suivi en direct (Socket.io) : langue transmise par
 * l'app à la connexion, dans `auth.locale` (ou l'en-tête X-Locale).
 */
@Catch(WsException)
export class LocalizedWsExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: WsException, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<{ handshake?: { auth?: Record<string, unknown>; headers?: Record<string, string | string[] | undefined> } }>();
    if (!wantsEnglish(socketLocale(client))) return super.catch(exception, host);
    return super.catch(new WsException(localizeBody(exception.getError()) as string | object), host);
  }
}

/** Langue demandée par une socket : auth.locale, sinon en-tête X-Locale. */
export function socketLocale(client: { handshake?: { auth?: Record<string, unknown>; headers?: Record<string, string | string[] | undefined> } } | undefined) {
  const fromAuth = client?.handshake?.auth?.locale;
  return typeof fromAuth === 'string' ? fromAuth : client?.handshake?.headers?.[LOCALE_HEADER];
}

/** Message d'erreur de connexion Socket.io (middleware d'authentification). */
export function socketMessage(client: Parameters<typeof socketLocale>[0], message: string) {
  return wantsEnglish(socketLocale(client)) ? toEnglish(message) : message;
}
