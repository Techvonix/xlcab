import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:xlcab_app/services/api_service.dart';
import 'package:xlcab_app/services/auth_service.dart';
import 'package:xlcab_app/services/token_storage.dart';

/// JWT factice (seul le contenu est lu par l'app).
String fakeJwt(Map<String, Object?> claims) {
  String b64(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${b64({'alg': 'HS256'})}.${b64(claims)}.signature';
}

/// Stockage des jetons en mémoire (pas de coffre système en test).
class MemoryTokenStorage extends TokenStorage {
  MemoryTokenStorage() : super(const FlutterSecureStorage());

  String? access;
  String? refresh;

  @override
  Future<String?> readAccessToken() async => access;

  @override
  Future<String?> readRefreshToken() async => refresh;

  @override
  Future<void> saveTokens({required String access, required String refresh}) async {
    this.access = access;
    this.refresh = refresh;
  }

  @override
  Future<void> clear() async {
    access = null;
    refresh = null;
  }
}

class FakeAuthService extends AuthService {
  FakeAuthService() : super(Dio());

  AuthTokens? next;
  ApiException? error;
  final List<String> calls = [];
  String? loggedOutWith;

  @override
  Future<AuthTokens> login(String email, String password) async {
    calls.add('login:$email');
    if (error != null) throw error!;
    return next!;
  }

  @override
  Future<AuthTokens> signup(String email, String password) async {
    calls.add('signup:$email');
    if (error != null) throw error!;
    return next!;
  }

  @override
  Future<void> logout(String accessToken) async => loggedOutWith = accessToken;
}

class FakeTokenRefresher extends TokenRefresher {
  FakeTokenRefresher(this.storage) : super(Dio(), storage);

  final MemoryTokenStorage storage;
  RefreshResult result = RefreshResult.invalid;
  String? newAccess;
  int calls = 0;

  @override
  Future<RefreshResult> refresh() async {
    calls++;
    if (result == RefreshResult.ok && newAccess != null) {
      await storage.saveTokens(access: newAccess!, refresh: 'refresh-rotated');
    }
    return result;
  }
}
