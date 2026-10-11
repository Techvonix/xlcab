import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/payment.dart';
import 'package:xlcab_core/models/quote.dart';
import '../../router.dart';
import 'package:xlcab_core/services/api_service.dart';
import '../../services/payment_service.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Écran 7 — Paiement (Partie 7) : récapitulatif puis feuille de paiement
/// Stripe (carte, Apple Pay, Google Pay). Prépaiement à la réservation ;
/// remboursement automatique selon les CGV en cas d'annulation.
class PaymentScreen extends ConsumerStatefulWidget {
  const PaymentScreen({super.key, required this.draft});

  /// Demande + devis venant de l'écran 6. null si l'écran est ouvert
  /// sans passer par la réservation (lien direct).
  final BookingDraft? draft;

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  /// Course créée au premier essai : les essais suivants reprennent le
  /// même paiement au lieu de créer une deuxième réservation.
  String? _tripId;

  /// Montant fixé par le serveur, s'il diffère du devis affiché.
  int? _serverAmount;
  bool _busy = false;
  String? _message;
  bool _messageIsError = true;

  Future<void> _pay() async {
    final draft = widget.draft!;
    final presenter = ref.read(paymentSheetPresenterProvider);
    final service = ref.read(paymentServiceProvider);
    if (!presenter.isAvailable) {
      _show(l10n.paiementMomentanementIndisponibleReessayezPlus);
      return;
    }

    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final params = _tripId == null ? await service.createBooking(draft.request) : await service.resume(_tripId!);
      _tripId = params.tripId;

      // Le serveur recalcule le prix : s'il diffère du devis affiché (le
      // tarif a pu évoluer), on montre le nouveau montant et on attend une
      // seconde confirmation. Jamais de débit d'un montant non affiché.
      if (params.amountCents != (_serverAmount ?? draft.quote.totalCents)) {
        setState(() => _serverAmount = params.amountCents);
        _show(
          l10n.lePrixAEteMis(formatPrice(params.amountCents, currency: params.currency)),
          isError: false,
        );
        return;
      }

      final result = await presenter.present(params);
      if (!mounted) return;
      switch (result.outcome) {
        case PaymentSheetOutcome.completed:
          // Le webhook Stripe fait foi ; la confirmation accélère seulement
          // la mise à jour (son échec n'annule pas le paiement).
          try {
            await service.confirm(params.tripId);
          } on ApiException {
            // Le serveur sera informé par Stripe.
          }
          if (mounted) context.go(AppRoutes.confirmationFor(params.tripId));
        case PaymentSheetOutcome.canceled:
          _show(l10n.paiementAnnuleVotreReservationN, isError: false);
        case PaymentSheetOutcome.failed:
          _show(result.message ?? l10n.paiementRefuseEssayezUnAutre);
      }
    } on ApiException catch (e) {
      _show(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _show(String message, {bool isError = true}) {
    if (!mounted) return;
    setState(() {
      _message = message;
      _messageIsError = isError;
    });
  }

  @override
  Widget build(BuildContext context) {
    final draft = widget.draft;
    if (draft == null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.paiement)),
        body: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(l10n.aucuneReservationEnCoursRecommencez),
              const SizedBox(height: AppSpacing.md),
              PrimaryButton(label: l10n.reserverUnTrajet, onPressed: () => context.go(AppRoutes.passengerBooking)),
            ],
          ),
        ),
      );
    }

    final onSurface = Theme.of(context).colorScheme.onSurface;
    final locale = Localizations.localeOf(context).languageCode;
    final quote = draft.quote;
    final request = draft.request;
    final amount = _serverAmount ?? quote.totalCents;
    String money(int cents) => formatPrice(cents, currency: quote.currency, locale: locale);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.paiement)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          _Section(
            title: l10n.votreTrajet,
            children: [
              _Line(icon: Icons.trip_origin, text: request.origin.address),
              _Line(icon: Icons.place, text: request.destination.address),
              _Line(icon: Icons.event, text: formatTripDate(request.departure, locale: locale)),
              _Line(
                icon: Icons.groups_outlined,
                text: '${l10n.passager2(request.seats, request.seats > 1 ? 's' : '', request.shuttleType.label)}${request.withParcel ? ' · avec colis' : ''}',
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          _Section(
            title: l10n.prix,
            children: [
              for (final l in quote.vatLines)
                _Amount(
                  label: l10n.htTva(l.isParcel ? 'Colis' : 'Transport passagers', l.ratePercent.toStringAsFixed(0)),
                  value: money(l.baseCents),
                ),
              const Divider(),
              _Amount(label: l10n.totalTtc, value: money(amount), strong: true),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          // Partie 13 (CGV) : conditions d'annulation, avant de payer.
          _Section(
            title: l10n.annulation,
            children: [
              Text(
                l10n.gratuiteJusquA24H +
                l10n.aucunFraisSiAucunChauffeur,
                style: AppTypography.body.copyWith(color: onSurface),
              ),
            ],
          ),
          if (_message != null) ...[
            const SizedBox(height: AppSpacing.md),
            Semantics(
              liveRegion: true,
              child: Container(
                padding: const EdgeInsets.all(AppSpacing.md),
                decoration: BoxDecoration(
                  border: Border.all(color: _messageIsError ? AppColors.error : AppColors.secondary, width: 2),
                  borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
                ),
                child: Row(
                  children: [
                    ExcludeSemantics(
                      child: Icon(_messageIsError ? Icons.error_outline : Icons.info_outline,
                          color: _messageIsError ? AppColors.error : AppColors.secondary),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(child: Text(_message!, style: AppTypography.body.copyWith(color: onSurface))),
                  ],
                ),
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              ExcludeSemantics(child: Icon(Icons.lock_outline, size: 16, color: onSurface.withValues(alpha: 0.7))),
              const SizedBox(width: AppSpacing.xs),
              Expanded(
                child: Text(
                  l10n.paiementSecuriseParStripeXlcab,
                  style: AppTypography.caption.copyWith(color: onSurface.withValues(alpha: 0.7)),
                ),
              ),
            ],
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.md),
          child: PrimaryButton(
            icon: Icons.lock_outline,
            label: _busy ? l10n.paiementEnCours : l10n.payer(money(amount)),
            onPressed: _busy ? null : _pay,
          ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        boxShadow: AppShadows.level1,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(header: true, child: Text(title, style: AppTypography.h3.copyWith(color: scheme.onSurface))),
          const SizedBox(height: AppSpacing.sm),
          ...children,
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ExcludeSemantics(child: Icon(icon, size: 18, color: onSurface.withValues(alpha: 0.7))),
          const SizedBox(width: AppSpacing.sm),
          Expanded(child: Text(text, style: AppTypography.body.copyWith(color: onSurface))),
        ],
      ),
    );
  }
}

class _Amount extends StatelessWidget {
  const _Amount({required this.label, required this.value, this.strong = false});

  final String label;
  final String value;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final style = (strong ? AppTypography.price : AppTypography.body).copyWith(
      color: onSurface,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(label, style: strong ? AppTypography.bodyBold.copyWith(color: onSurface) : style)),
          const SizedBox(width: AppSpacing.sm),
          Text(value, style: style),
        ],
      ),
    );
  }
}
