/// Téléphone saisi → format international E.164 exigé par le backend.
/// "06 12 34 56 78" → "+33612345678". null si invalide.
String? normalizePhone(String input, {String countryPrefix = '+33'}) {
  final compact = input.replaceAll(RegExp(r'[\s.\-()]'), '');
  if (RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(compact)) return compact;
  if (compact.startsWith('00') && RegExp(r'^00[1-9]\d{7,14}$').hasMatch(compact)) {
    return '+${compact.substring(2)}';
  }
  // Numéro national français : 0 + 9 chiffres.
  if (RegExp(r'^0[1-9]\d{8}$').hasMatch(compact)) return '$countryPrefix${compact.substring(1)}';
  return null;
}

/// Immatriculation française (SIV) → "AB-123-CD". Accepte "ab123cd",
/// "AB 123 CD"… null si le format n'est pas reconnu.
String? normalizePlate(String input) {
  final compact = input.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
  final m = RegExp(r'^([A-Z]{2})(\d{3})([A-Z]{2})$').firstMatch(compact);
  return m == null ? null : '${m[1]}-${m[2]}-${m[3]}';
}

/// Date d'échéance valide : strictement après aujourd'hui.
bool isFutureDate(DateTime? date, DateTime now) {
  if (date == null) return false;
  final today = DateTime(now.year, now.month, now.day);
  return DateTime(date.year, date.month, date.day).isAfter(today);
}
