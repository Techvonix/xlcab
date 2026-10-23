import 'package:xlcab_core/routes.dart';

/// Écran ouvert quand on touche une notification (push ou boîte de réception) dans l'appli
/// chauffeur, d'après son type et les identifiants qu'elle porte. Null : rien de plus à montrer.
String? driverNotificationTarget(Map<String, String> data) {
  final type = data['type'] ?? '';
  final departureId = data['departureId'];
  if (departureId != null && departureId.isNotEmpty) return AppRoutes.departureFor(departureId);
  if (type.startsWith('payout.') || type == 'line.rescue.bonus') return AppRoutes.driverPayouts;
  if (type.startsWith('line.penalty') || type.startsWith('line.cancel')) return AppRoutes.driverCancellations;
  if (type.startsWith('market.')) return AppRoutes.driverMarket;
  // Demande de conservation de la caméra, missions, documents : écran « Aujourd'hui ».
  if (type.startsWith('dashcam.') || type.startsWith('trip.') || data['tripId'] != null) return AppRoutes.driverMode;
  return null;
}
