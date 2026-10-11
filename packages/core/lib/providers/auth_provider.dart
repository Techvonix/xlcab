import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/token_storage.dart';
import '../utils/jwt.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Rôles utilisateur, alignés sur `User.role` (Partie 4).
enum UserRole {
  passenger('passenger'),
  driver('driver'),
  corporateAdmin('corporate_admin'),
  corporateMember('corporate_member'),
  admin('admin');

  const UserRole(this.apiValue);
  final String apiValue;

  static UserRole? fromApi(Object? value) {
    for (final r in values) {
      if (r.apiValue == value) return r;
    }
    return null;
  }
}

/// État d'authentification de l'application.
class AuthState {
  final bool isAuthenticated;
  final String? userId;
  final UserRole? role;
  final bool isLoading;

  /// Message à afficher après une déconnexion forcée (session expirée).
  final String? notice;

  const AuthState({
    this.isAuthenticated = false,
    this.userId,
    this.role,
    this.isLoading = true, // vérification de la session au démarrage
    this.notice,
  });

  static AuthState fromAccessToken(String token) {
    final claims = decodeJwtPayload(token);
    return AuthState(
      isAuthenticated: true,
      userId: claims['sub'] as String?,
      role: UserRole.fromApi(claims['role']),
      isLoading: false,
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._service, this._tokens, this._refresher) : super(const AuthState()) {
    _restoreSession();
  }

  final AuthService _service;
  final TokenStorage _tokens;
  final TokenRefresher _refresher;

  /// Au démarrage : rotation du refresh token stocké. Le rôle est ainsi
  /// relu en base (ex. passager devenu chauffeur depuis la dernière fois).
  Future<void> _restoreSession() async {
    switch (await _refresher.refresh()) {
      case RefreshResult.ok:
        final access = await _tokens.readAccessToken();
        state = access == null ? const AuthState(isLoading: false) : AuthState.fromAccessToken(access);
      case RefreshResult.offline:
        // Hors ligne : on garde la session locale ; les requêtes
        // retenteront le rafraîchissement au retour du réseau.
        final access = await _tokens.readAccessToken();
        state = access == null ? const AuthState(isLoading: false) : AuthState.fromAccessToken(access);
      case RefreshResult.invalid:
        state = const AuthState(isLoading: false);
    }
  }

  Future<void> login(String email, String password) async {
    final t = await _service.login(email, password);
    await _open(t);
  }

  Future<void> signup(String email, String password) async {
    final t = await _service.signup(email, password);
    await _open(t);
  }

  Future<void> _open(AuthTokens t) async {
    await _tokens.saveTokens(access: t.accessToken, refresh: t.refreshToken);
    state = AuthState.fromAccessToken(t.accessToken);
  }

  /// Déconnexion volontaire : révocation de la session de cet appareil.
  Future<void> signOut() async {
    final access = await _tokens.readAccessToken();
    if (access != null) await _service.logout(access);
    await _tokens.clear();
    state = const AuthState(isLoading: false);
  }

  /// Compte supprimé (RGPD) : le serveur a déjà révoqué toutes les sessions.
  Future<void> accountDeleted() async {
    await _tokens.clear();
    state = AuthState(isLoading: false, notice: l10n.votreCompteAEteSupprime);
  }

  /// Le serveur a refusé le refresh token (révoqué, expiré).
  Future<void> sessionExpired() async {
    await _tokens.clear();
    state = AuthState(isLoading: false, notice: l10n.votreSessionAExpireReconnectez);
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (ref) => AuthNotifier(
    ref.watch(authServiceProvider),
    ref.watch(tokenStorageProvider),
    ref.watch(tokenRefresherProvider),
  ),
);

/// Exposé pour les tests : erreur affichable d'une tentative de connexion.
String authErrorMessage(Object e) =>
    e is ApiException ? e.message : l10n.connexionImpossibleReessayezPlusTard;
