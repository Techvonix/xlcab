import 'dart:convert';

/// Contenu d'un JWT (sans vérification de signature : c'est le rôle du
/// serveur). Sert uniquement à l'interface (rôle, identifiant).
Map<String, dynamic> decodeJwtPayload(String token) {
  try {
    final parts = token.split('.');
    if (parts.length != 3) return const {};
    final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
    final json = jsonDecode(payload);
    return json is Map<String, dynamic> ? json : const {};
  } catch (_) {
    return const {};
  }
}
