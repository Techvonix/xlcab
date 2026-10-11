import 'package:flutter/material.dart';
import '../theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';

/// Montant au style "Price" de la Partie 5 (20 px, chiffres tabulaires
/// pour que les prix restent alignés dans les listes).
class PriceDisplay extends StatelessWidget {
  const PriceDisplay({
    super.key,
    required this.cents,
    this.currency = 'EUR',
    this.prefix,
  });

  final int cents;
  final String currency;

  /// Texte avant le montant, ex. "à partir de".
  final String? prefix;

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context).languageCode;
    final amount = formatPrice(cents, currency: currency, locale: locale);
    return Text(
      prefix == null ? amount : '$prefix $amount',
      style: AppTypography.price.copyWith(color: Theme.of(context).colorScheme.onSurface),
    );
  }
}
