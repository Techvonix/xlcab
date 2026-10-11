import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/account.dart';
import 'package:xlcab_core/models/payment.dart';
import 'package:xlcab_core/services/account_service.dart';
import 'package:xlcab_core/services/api_service.dart';
import '../../services/payment_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';
import 'package:xlcab_core/l10n/l10n.dart';

final savedCardsProvider = FutureProvider.autoDispose<List<SavedCard>>((ref) => ref.watch(accountServiceProvider).cards());

/// Moyens de paiement (écran 13) : cartes enregistrées chez Stripe.
/// XLCAB ne voit jamais le numéro : marque, 4 derniers chiffres, expiration.
class PaymentMethodsScreen extends ConsumerStatefulWidget {
  const PaymentMethodsScreen({super.key});

  @override
  ConsumerState<PaymentMethodsScreen> createState() => _PaymentMethodsScreenState();
}

class _PaymentMethodsScreenState extends ConsumerState<PaymentMethodsScreen> {
  bool _busy = false;

  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _add() async {
    final presenter = ref.read(paymentSheetPresenterProvider);
    if (!presenter.isAvailable) {
      _snack(l10n.paiementMomentanementIndisponibleReessayezPlus);
      return;
    }
    setState(() => _busy = true);
    try {
      final params = await ref.read(accountServiceProvider).startAddCard();
      final result = await presenter.presentSetup(params);
      switch (result.outcome) {
        case PaymentSheetOutcome.completed:
          _snack(l10n.carteEnregistree);
          ref.invalidate(savedCardsProvider);
        case PaymentSheetOutcome.canceled:
          break;
        case PaymentSheetOutcome.failed:
          _snack(result.message ?? l10n.carteRefusee);
      }
    } on ApiException catch (e) {
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(SavedCard card) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.supprimerCetteCarte),
        content: Text(l10n.seTerminantPar(card.brandLabel, card.last4 ?? '••••')),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: Text(l10n.garder)),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.supprimer),
          ),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(accountServiceProvider).deleteCard(card.id);
      ref.invalidate(savedCardsProvider);
      if (mounted) _snack(l10n.carteSupprimee);
    } on ApiException catch (e) {
      if (mounted) _snack(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cards = ref.watch(savedCardsProvider);
    final scheme = Theme.of(context).colorScheme;
    final muted = scheme.onSurface.withValues(alpha: 0.75);

    return Scaffold(
      appBar: AppBar(title: Text(l10n.moyensDePaiement)),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          cards.when(
            loading: () => Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargementDesCartes)),
            ),
            error: (e, _) => Column(children: [
              Text(e is ApiException ? e.message : l10n.cartesIndisponibles),
              TextButton(onPressed: () => ref.invalidate(savedCardsProvider), child: Text(l10n.reessayer)),
            ]),
            data: (list) => list.isEmpty
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
                    child: Text(
                      l10n.aucuneCarteEnregistreeVousPourrez,
                      textAlign: TextAlign.center,
                      style: AppTypography.body.copyWith(color: muted),
                    ),
                  )
                : Column(
                    children: [
                      for (final c in list)
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const ExcludeSemantics(child: Icon(Icons.credit_card)),
                          title: Text('${c.brandLabel} •••• ${c.last4 ?? '----'}'),
                          subtitle: c.expiry == null
                              ? null
                              : Text(
                                  c.isExpired() ? l10n.expiree(c.expiry ?? '') : l10n.expireFin(c.expiry ?? ''),
                                  style: AppTypography.caption.copyWith(color: muted),
                                ),
                          trailing: IconButton(
                            tooltip: l10n.supprimerLaCarteSeTerminant(c.brandLabel, c.last4 ?? ''),
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () => _delete(c),
                          ),
                        ),
                    ],
                  ),
          ),
          const SizedBox(height: AppSpacing.md),
          PrimaryButton(icon: Icons.add_card, label: l10n.ajouterUneCarte, onPressed: _busy ? null : _add),
          const SizedBox(height: AppSpacing.sm),
          Text(
            l10n.cartesConserveesParStripeCertifie,
            textAlign: TextAlign.center,
            style: AppTypography.caption.copyWith(color: muted),
          ),
        ],
      ),
    );
  }
}
