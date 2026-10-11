import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/auth_service.dart';

class _Capture implements HttpClientAdapter {
  _Capture(this.status, this.body);
  final int status;
  final Object body;
  RequestOptions? last;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    last = options;
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  test('inscription : consentement et version des CGU envoyés (preuve RGPD côté serveur)', () async {
    final adapter = _Capture(201, {'accessToken': 'a', 'refreshToken': 'r'});
    final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;

    await AuthService(dio).signup(' new@x.fr ', 'secret123');

    expect(adapter.last!.path, '/api/v1/auth/signup');
    expect(adapter.last!.data, {
      'email': 'new@x.fr',
      'password': 'secret123',
      'acceptTerms': true,
      'termsVersion': termsVersion,
    });
  });

  test('CGU mises à jour côté serveur : message demandant la mise à jour de l’app', () async {
    final adapter = _Capture(400, {
      'statusCode': 400,
      'message': 'Les conditions générales ont été mises à jour : mettez l’application à jour pour les accepter',
    });
    final dio = Dio(BaseOptions(baseUrl: 'http://test'))..httpClientAdapter = adapter;

    await expectLater(
      AuthService(dio).signup('new@x.fr', 'secret123'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('mettez l’application à jour'))),
    );
  });
}
