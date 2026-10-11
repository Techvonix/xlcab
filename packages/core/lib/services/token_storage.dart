import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Stockage des jetons JWT dans le trousseau sécurisé du système
/// (Keychain iOS / Keystore Android), jamais dans Hive ni en clair.
///
/// L'écriture des jetons (login, refresh) sera faite par le service
/// d'authentification Flutter, qui n'existe pas encore : le Module 2
/// n'a couvert que le backend.
class TokenStorage {
  TokenStorage(this._storage);

  final FlutterSecureStorage _storage;

  static const _accessKey = 'xlcab_access_token';
  static const _refreshKey = 'xlcab_refresh_token';

  // Le coffre du système peut échouer (clés Android corrompues après une
  // restauration de sauvegarde, etc.) : une lecture impossible équivaut à
  // "pas de session", l'utilisateur se reconnecte au lieu d'un plantage.
  Future<String?> readAccessToken() => _safeRead(_accessKey);

  Future<String?> readRefreshToken() => _safeRead(_refreshKey);

  Future<String?> _safeRead(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (_) {
      return null;
    }
  }

  Future<void> saveTokens({required String access, required String refresh}) async {
    await _storage.write(key: _accessKey, value: access);
    await _storage.write(key: _refreshKey, value: refresh);
  }

  Future<void> clear() async {
    try {
      await _storage.delete(key: _accessKey);
      await _storage.delete(key: _refreshKey);
    } catch (_) {
      // Rien de plus à faire : la session est de toute façon abandonnée.
    }
  }
}

final tokenStorageProvider = Provider<TokenStorage>(
  (ref) => TokenStorage(const FlutterSecureStorage()),
);
