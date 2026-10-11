import 'package:xlcab_core/l10n/l10n.dart';
/// Configuration réglementaire et fiscale par pays (juridiction).
///
/// Reflète le modèle Prisma `JurisdictionConfig` côté backend (Partie 4)
/// et le cadre juridique de la Partie 11. La France est le seul marché
/// actif au lancement ; les autres sont préconfigurés pour l'expansion
/// européenne prévue (Partie 1.1).
class JurisdictionConfig {
  final String code; // Code ISO du pays (ex. "FR")
  final String name;
  final double vatPassengerRate; // TVA transport de personnes (%)
  final double vatParcelRate; // TVA transport de marchandises (%)
  final bool requiresRevtc; // Inscription REVTC obligatoire
  final bool requiresVtcCard; // Carte VTC chauffeur obligatoire
  final int minTripKm; // Distance minimale de trajet (km)
  final int? financialGuaranteePerVehicleCents; // Garantie financière/véhicule
  final String currency;
  final String? leadDpa; // Autorité de protection des données cheffe de file
  final bool isActive; // Marché ouvert aux réservations

  const JurisdictionConfig({
    required this.code,
    required this.name,
    required this.vatPassengerRate,
    required this.vatParcelRate,
    required this.requiresRevtc,
    required this.requiresVtcCard,
    required this.minTripKm,
    this.financialGuaranteePerVehicleCents,
    required this.currency,
    this.leadDpa,
    required this.isActive,
  });

  /// Registre de toutes les juridictions supportées.
  ///
  /// FR : marché de lancement — TVA personnes exonérée (art. 261-4-4° CGI),
  /// TVA colis 20%, REVTC + carte VTC obligatoires, min. 60 km (Partie 11.2).
  /// IE : siège social XLCAB Ltd., lead DPA RGPD (DPC Irlande).
  /// ES, IT, DE, PT : expansion future — configuration provisoire,
  /// marché inactif tant que la conformité locale n'est pas validée.
  // Accesseur : les noms traduits suivent la langue courante.
  static Map<String, JurisdictionConfig> get registry => {
    'FR': JurisdictionConfig(
      code: 'FR',
      name: l10n.france,
      vatPassengerRate: 0,
      vatParcelRate: 20,
      requiresRevtc: true,
      requiresVtcCard: true,
      minTripKm: 60,
      financialGuaranteePerVehicleCents: 150000, // 1 500 €
      currency: 'EUR',
      leadDpa: 'CNIL',
      isActive: true,
    ),
    'IE': JurisdictionConfig(
      code: 'IE',
      name: l10n.irlande,
      vatPassengerRate: 0,
      vatParcelRate: 23,
      requiresRevtc: false,
      requiresVtcCard: false,
      minTripKm: 60,
      currency: 'EUR',
      leadDpa: 'DPC',
      isActive: false,
    ),
    'ES': JurisdictionConfig(
      code: 'ES',
      name: l10n.espagne,
      vatPassengerRate: 10,
      vatParcelRate: 21,
      requiresRevtc: false,
      requiresVtcCard: true,
      minTripKm: 60,
      currency: 'EUR',
      leadDpa: 'AEPD',
      isActive: false,
    ),
    'IT': JurisdictionConfig(
      code: 'IT',
      name: l10n.italie,
      vatPassengerRate: 10,
      vatParcelRate: 22,
      requiresRevtc: false,
      requiresVtcCard: true,
      minTripKm: 60,
      currency: 'EUR',
      leadDpa: 'Garante Privacy',
      isActive: false,
    ),
    'DE': JurisdictionConfig(
      code: 'DE',
      name: l10n.allemagne,
      vatPassengerRate: 7,
      vatParcelRate: 19,
      requiresRevtc: false,
      requiresVtcCard: true,
      minTripKm: 60,
      currency: 'EUR',
      leadDpa: 'BfDI',
      isActive: false,
    ),
    'PT': JurisdictionConfig(
      code: 'PT',
      name: l10n.portugal,
      vatPassengerRate: 6,
      vatParcelRate: 23,
      requiresRevtc: false,
      requiresVtcCard: true,
      minTripKm: 60,
      currency: 'EUR',
      leadDpa: 'CNPD',
      isActive: false,
    ),
  };

  /// Récupère la config d'une juridiction, avec repli sur FR par défaut.
  static JurisdictionConfig of(String code) =>
      registry[code] ?? registry['FR']!;

  /// Liste des juridictions actuellement ouvertes aux réservations.
  static List<JurisdictionConfig> get activeMarkets =>
      registry.values.where((j) => j.isActive).toList();
}
