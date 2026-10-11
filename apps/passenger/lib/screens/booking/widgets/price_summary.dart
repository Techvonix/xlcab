import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/quote.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/widgets/price_display.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Récapitulatif du prix (Partie 7, écran 6). Affiche séparément la part
/// transport de personnes et la part colis, chacune avec son taux de TVA
/// (Partie 11.4).
class PriceSummary extends StatelessWidget {
  const PriceSummary({super.key, required this.quote, required this.missingHint});

  final AsyncValue<PassengerQuote?> quote;

  /// Texte affiché tant que le formulaire est incomplet.
  final String missingHint;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final onSurface = scheme.onSurface;
    final value = quote.valueOrNull;

    Widget content;
    if (quote.hasError && !quote.isLoading) {
      final error = quote.error;
      content = Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const ExcludeSemantics(child: Icon(Icons.error_outline, color: AppColors.error)),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              error is ApiException ? error.message : l10n.impossibleDeCalculerLePrix,
              style: AppTypography.body.copyWith(color: onSurface),
            ),
          ),
        ],
      );
    } else if (value == null && !quote.isLoading) {
      content = Text(missingHint, style: AppTypography.body.copyWith(color: onSurface.withValues(alpha: 0.7)));
    } else if (value == null) {
      content = Text(l10n.calculDuPrix, style: AppTypography.body.copyWith(color: onSurface));
    } else {
      content = _QuoteDetails(quote: value);
    }

    return Semantics(
      liveRegion: true, // annonce le nouveau prix au lecteur d'écran
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: scheme.surface,
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
          boxShadow: AppShadows.level1,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Semantics(
              header: true,
              child: Text(l10n.recapitulatif, style: AppTypography.h3.copyWith(color: onSurface)),
            ),
            const SizedBox(height: AppSpacing.sm),
            // Recalcul en cours : on garde l'ancien prix visible, avec une
            // barre de progression, au lieu de le faire clignoter.
            if (quote.isLoading)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: LinearProgressIndicator(semanticsLabel: l10n.calculDuPrixEnCours),
              ),
            content,
          ],
        ),
      ),
    );
  }
}

class _QuoteDetails extends StatelessWidget {
  const _QuoteDetails({required this.quote});

  final PassengerQuote quote;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final locale = Localizations.localeOf(context).languageCode;
    final muted = AppTypography.caption.copyWith(color: onSurface.withValues(alpha: 0.7));
    String money(int cents) => formatPrice(cents, currency: quote.currency, locale: locale);
    String rate(double r) => '${r == r.roundToDouble() ? r.toInt() : r} %';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          l10n.environ(formatDistance(quote.distanceKm, locale: locale), formatDuration(quote.durationMin)),
          style: AppTypography.body.copyWith(color: onSurface),
        ),
        const SizedBox(height: AppSpacing.sm),
        for (final line in quote.vatLines)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.xs),
            child: _Line(
              label: line.isParcel ? l10n.colisHt : l10n.transportPassagersHt,
              detail: l10n.tva(rate(line.ratePercent), money(line.vatCents)),
              amount: money(line.baseCents),
              detailStyle: muted,
            ),
          ),
        const Divider(),
        Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: AppSpacing.md,
          children: [
            Text(l10n.totalTtc, style: AppTypography.bodyBold.copyWith(color: onSurface)),
            PriceDisplay(cents: quote.totalCents, currency: quote.currency),
          ],
        ),
      ],
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.label, required this.detail, required this.amount, required this.detailStyle});

  final String label;
  final String detail;
  final String amount;
  final TextStyle detailStyle;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: AppTypography.body.copyWith(color: onSurface)),
              Text(detail, style: detailStyle),
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Text(
          amount,
          style: AppTypography.body.copyWith(
            color: onSurface,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }
}
