import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../config/jurisdiction_config.dart';

/// Code de la juridiction active pour l'utilisateur courant (ex. "FR").
/// Déterminé au démarrage via géolocalisation/IP, puis modifiable par
/// l'utilisateur dans les préférences. Défaut : France (seul marché
/// actif au lancement — voir jurisdiction_config.dart).
final jurisdictionCodeProvider = StateProvider<String>((ref) => 'FR');

/// Expose directement l'objet de configuration complet pour la
/// juridiction active (TVA, REVTC, distance min., etc.).
final jurisdictionConfigProvider = Provider<JurisdictionConfig>((ref) {
  final code = ref.watch(jurisdictionCodeProvider);
  return JurisdictionConfig.of(code);
});
