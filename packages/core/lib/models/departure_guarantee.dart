/// Seuil de départ garanti d'un départ de ligne (CLARIFICATION_MODELE.md,
/// section 4.5) : le chauffeur part d'office dès [minPassengers] passagers.
/// Avant le seuil, le départ est « en attente » ; s'il ne l'atteint pas avant
/// [deadline], il est annulé et chaque passager est remboursé intégralement.
class DepartureGuarantee {
  const DepartureGuarantee({
    required this.guaranteed,
    this.minPassengers,
    this.missed = false,
    this.deadline,
    this.missingPassengers = 0,
  });

  /// Seuil fixé par le chauffeur ; null = départ garanti dès sa confirmation.
  final int? minPassengers;

  /// Seuil atteint, ou départ confirmé par le chauffeur (« top départ »).
  final bool guaranteed;

  /// Seuil non atteint à l'échéance (ou chauffeur retiré avant) : départ annulé.
  final bool missed;

  /// Heure limite pour atteindre le seuil (null une fois garanti).
  final DateTime? deadline;

  /// Passagers qui manquent encore (recherche seulement).
  final int missingPassengers;

  /// En attente de passagers : seuil fixé, pas encore atteint, pas annulé.
  bool get pending => !guaranteed && !missed && minPassengers != null;

  static DepartureGuarantee? fromJson(Object? json) {
    if (json is! Map) return null;
    final deadline = json['deadline'];
    final min = json['minPassengers'];
    final missing = json['missingPassengers'];
    return DepartureGuarantee(
      guaranteed: json['guaranteed'] == true,
      minPassengers: min is num ? min.toInt() : null,
      missed: json['missed'] == true,
      deadline: deadline is String ? DateTime.tryParse(deadline)?.toLocal() : null,
      missingPassengers: missing is num ? missing.toInt() : 0,
    );
  }
}
