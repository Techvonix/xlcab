import 'package:dio/dio.dart';
import 'package:xlcab_core/models/driver_public_profile.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/feedback_service.dart';
import 'package:xlcab_passenger/services/safety_service.dart';

// Doubles de l'espace sécurité : contacts de confiance, partage du trajet,
// préférence de partage automatique. Aucun appel réseau.

const sharedTripUrl = 'https://api.exemple.test/suivi/7d7d0000-0000-4000-8000-0000000000aa.signature';

class FakeSafetyService extends SafetyService {
  FakeSafetyService() : super(Dio());

  final List<TrustedContact> saved = [];
  bool sharing = false;
  int shareCalls = 0;
  ApiException? shareError;
  ApiException? addError;

  @override
  Future<List<TrustedContact>> contacts() async => List.of(saved);

  @override
  Future<TrustedContact> addContact({required String name, required String phone}) async {
    if (addError != null) throw addError!;
    final contact = TrustedContact(id: 'c${saved.length + 1}', name: name, phone: phone);
    saved.add(contact);
    return contact;
  }

  @override
  Future<void> deleteContact(String id) async => saved.removeWhere((c) => c.id == id);

  @override
  Future<TripShare> shareStatus(String tripId) async => TripShare(active: sharing, url: sharing ? sharedTripUrl : null);

  @override
  Future<TripShare> share(String tripId) async {
    shareCalls++;
    if (shareError != null) throw shareError!;
    sharing = true;
    return const TripShare(active: true, url: sharedTripUrl);
  }

  @override
  Future<void> stopSharing(String tripId) async => sharing = false;
}

/// Préférences du compte seulement (le reste de FeedbackService n'est pas utilisé ici).
class FakePreferencesService extends FeedbackService {
  FakePreferencesService({this.autoShare = false}) : super(Dio());

  bool autoShare;
  bool womanDriver = false;
  final List<Map<String, bool>> changes = [];
  ApiException? updateError;

  @override
  Future<NotificationPreferences> preferences() async => NotificationPreferences(autoShareTrips: autoShare, preferWomanDriver: womanDriver);

  @override
  Future<NotificationPreferences> updatePreferences(Map<String, bool> changes) async {
    if (updateError != null) throw updateError!;
    this.changes.add(changes);
    autoShare = changes['autoShareTrips'] ?? autoShare;
    womanDriver = changes['preferWomanDriver'] ?? womanDriver;
    return preferences();
  }
}
