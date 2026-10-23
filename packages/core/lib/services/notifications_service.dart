import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'api_service.dart';

/// Une notification de la boîte de réception (`GET /users/me/notifications`).
class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    required this.createdAt,
    this.data = const {},
    this.readAt,
  });

  final String id;
  final String type;
  final String title;
  final String body;
  /// Identifiants utiles pour ouvrir le bon écran (tripId, parcelId, departureId…).
  final Map<String, String> data;
  final DateTime createdAt;
  final DateTime? readAt;

  bool get unread => readAt == null;

  static AppNotification? fromJson(Object? json) {
    if (json is! Map || json['id'] is! String) return null;
    final created = DateTime.tryParse('${json['createdAt']}');
    if (created == null) return null;
    final raw = json['data'];
    return AppNotification(
      id: json['id'] as String,
      type: '${json['type'] ?? ''}',
      title: '${json['title'] ?? ''}',
      body: '${json['body'] ?? ''}',
      createdAt: created.toLocal(),
      readAt: json['readAt'] == null ? null : DateTime.tryParse('${json['readAt']}')?.toLocal(),
      data: raw is Map ? {for (final e in raw.entries) '${e.key}': '${e.value}'} : const {},
    );
  }
}

class Inbox {
  const Inbox({required this.items, required this.unread});

  final List<AppNotification> items;
  final int unread;

  static Inbox fromJson(Object? json) {
    final m = json is Map ? json : const {};
    final items = m['items'] is List ? (m['items'] as List).map(AppNotification.fromJson).whereType<AppNotification>().toList() : <AppNotification>[];
    return Inbox(items: items, unread: m['unread'] is int ? m['unread'] as int : items.where((n) => n.unread).length);
  }
}

/// Boîte de réception et téléphones qui reçoivent les notifications push.
class NotificationsService {
  NotificationsService(this._dio);

  final Dio _dio;

  Future<Inbox> inbox({int page = 1}) async {
    try {
      final res = await _dio.get<Object?>('/api/v1/users/me/notifications', queryParameters: {'page': page});
      return Inbox.fromJson(res.data);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  /// Marque lues les notifications données, ou toutes si [ids] est absent.
  Future<void> markRead([List<String>? ids]) async {
    try {
      await _dio.post<Object?>('/api/v1/users/me/notifications/read', data: {if (ids != null) 'ids': ids});
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  Future<void> registerDevice({required String token, required String platform, required String app}) async {
    await _dio.put<Object?>('/api/v1/users/me/devices', data: {'token': token, 'platform': platform, 'app': app});
  }

  Future<void> removeDevice(String token) async {
    await _dio.post<Object?>('/api/v1/users/me/devices/remove', data: {'token': token});
  }
}

final notificationsServiceProvider = Provider<NotificationsService>((ref) => NotificationsService(ref.watch(dioProvider)));

/// Première page de la boîte de réception (rechargée à chaque notification reçue).
final inboxProvider = FutureProvider.autoDispose<Inbox>((ref) => ref.watch(notificationsServiceProvider).inbox());

/// Nombre de notifications non lues (pastille de la cloche) ; 0 si la lecture échoue.
final unreadNotificationsProvider = Provider.autoDispose<int>((ref) => ref.watch(inboxProvider).valueOrNull?.unread ?? 0);
