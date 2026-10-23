import 'package:xlcab_core/routes.dart';

/// Écran ouvert quand on touche une notification (push ou boîte de réception) dans l'appli
/// passager, d'après les identifiants qu'elle porte. Null : rien de plus à montrer.
String? passengerNotificationTarget(Map<String, String> data) {
  final parcelId = data['parcelId'];
  if (parcelId != null && parcelId.isNotEmpty) return AppRoutes.parcelTrackingFor(parcelId);
  final tripId = data['tripId'];
  if (tripId != null && tripId.isNotEmpty) return AppRoutes.confirmationFor(tripId);
  final requestId = data['requestId'];
  if (requestId != null && requestId.isNotEmpty) return AppRoutes.requestDetailFor(requestId);
  return null;
}
