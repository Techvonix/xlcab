import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:xlcab_core/l10n/l10n.dart';
import 'package:xlcab_core/services/api_service.dart';

/// Un proche à qui le passager envoie le lien de suivi de ses trajets.
class TrustedContact {
  const TrustedContact({required this.id, required this.name, required this.phone});

  final String id;
  final String name;
  final String phone;

  factory TrustedContact.fromJson(dynamic json) {
    if (json is! Map) throw const FormatException('contact');
    final id = json['id'], name = json['name'], phone = json['phone'];
    if (id is! String || name is! String || phone is! String) throw const FormatException('contact');
    return TrustedContact(id: id, name: name, phone: phone);
  }
}

/// État du partage d'un trajet : lien de suivi actif ou non.
class TripShare {
  const TripShare({required this.active, this.url});

  final bool active;

  /// Page de suivi à transmettre à un proche (null si le partage est arrêté).
  final String? url;

  factory TripShare.fromJson(Map<String, dynamic>? json) {
    final url = json?['url'];
    return TripShare(active: json?['active'] == true && url is String, url: url is String ? url : null);
  }
}

const maxTrustedContacts = 5;

/// Espace sécurité du passager : contacts de confiance et partage du trajet
/// par un lien de suivi (le serveur n'envoie rien : c'est le passager qui
/// transmet le lien depuis sa messagerie).
class SafetyService {
  SafetyService(this._dio);

  final Dio _dio;

  static const _contacts = '/api/v1/users/me/contacts';
  String _share(String tripId) => '/api/v1/trips/${Uri.encodeComponent(tripId)}/share';

  Future<List<TrustedContact>> contacts() => _guard(() async {
        final res = await _dio.get<List<dynamic>>(_contacts);
        return (res.data ?? const []).map(TrustedContact.fromJson).toList();
      });

  Future<TrustedContact> addContact({required String name, required String phone}) => _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>(_contacts, data: {'name': name, 'phone': phone});
        return TrustedContact.fromJson(res.data);
      });

  Future<void> deleteContact(String id) => _guard(() => _dio.delete<void>('$_contacts/${Uri.encodeComponent(id)}'));

  /// Partage en cours pour ce trajet, s'il y en a un.
  Future<TripShare> shareStatus(String tripId) => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>(_share(tripId));
        return TripShare.fromJson(res.data);
      });

  /// Lien de suivi du trajet (le même tant qu'il est actif).
  Future<TripShare> share(String tripId) => _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>(_share(tripId));
        return TripShare.fromJson(res.data);
      });

  /// Coupe le lien : la page de suivi cesse aussitôt de fonctionner.
  Future<void> stopSharing(String tripId) => _guard(() => _dio.delete<void>(_share(tripId)));

  Future<T> _guard<T>(Future<T> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      final data = e.response?.data;
      // 404 / 409 : messages destinés à l'utilisateur (« Ce trajet est terminé… »).
      if (const {404, 409}.contains(e.response?.statusCode) && data is Map && data['message'] is String) {
        throw ApiException(data['message'] as String);
      }
      throw ApiException.fromDio(e);
    } on FormatException {
      throw ApiException(l10n.reponseInattendueDuServeurReessayez);
    }
  }
}

final safetyServiceProvider = Provider<SafetyService>((ref) => SafetyService(ref.watch(dioProvider)));

final trustedContactsProvider = FutureProvider.autoDispose<List<TrustedContact>>(
  (ref) => ref.watch(safetyServiceProvider).contacts(),
);

/// Ouvre la messagerie du téléphone avec le SMS déjà rédigé (le passager
/// appuie lui-même sur Envoyer). Injectable pour les tests. false = échec.
final smsComposerProvider = Provider<Future<bool> Function(String phone, String body)>(
  (ref) => (phone, body) async {
    try {
      return await launchUrl(Uri(scheme: 'sms', path: phone, queryParameters: {'body': body}));
    } catch (_) {
      return false;
    }
  },
);

/// Copie dans le presse-papiers (injectable pour les tests).
final clipboardWriterProvider = Provider<Future<void> Function(String text)>(
  (ref) => (text) => Clipboard.setData(ClipboardData(text: text)),
);
