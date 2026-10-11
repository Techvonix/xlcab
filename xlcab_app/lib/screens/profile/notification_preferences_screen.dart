import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/driver_public_profile.dart';
import 'package:xlcab_core/services/api_service.dart';
import '../../services/feedback_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Écran 13 — Préférences de notification. Les messages liés à une course en
/// cours (chauffeur en route, SOS…) restent envoyés : ils font partie du
/// service. La prospection n'est jamais activée sans accord (RGPD).
class NotificationPreferencesScreen extends ConsumerStatefulWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  ConsumerState<NotificationPreferencesScreen> createState() => _NotificationPreferencesScreenState();
}

class _NotificationPreferencesScreenState extends ConsumerState<NotificationPreferencesScreen> {
  /// Valeurs affichées pendant l'enregistrement (mise à jour optimiste).
  NotificationPreferences? _pending;

  Future<void> _set(NotificationPreferences current, String field, bool value) async {
    setState(() => _pending = NotificationPreferences(
          push: field == 'notifyPush' ? value : current.push,
          email: field == 'notifyEmail' ? value : current.email,
          sms: field == 'notifySms' ? value : current.sms,
          marketing: field == 'marketing' ? value : current.marketing,
        ));
    try {
      await ref.read(feedbackServiceProvider).updatePreferences({field: value});
      ref.invalidate(notificationPreferencesProvider);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _pending = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final prefs = ref.watch(notificationPreferencesProvider);
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.notifications)),
      body: prefs.when(
        loading: () => Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargementDesPreferences)),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(e is ApiException ? e.message : l10n.preferencesIndisponibles),
            TextButton(onPressed: () => ref.invalidate(notificationPreferencesProvider), child: Text(l10n.reessayer)),
          ]),
        ),
        data: (loaded) {
          final p = _pending ?? loaded;
          final busy = _pending != null;
          return ListView(
            padding: const EdgeInsets.all(AppSpacing.md),
            children: [
              Text(
                l10n.lesMessagesIndispensablesAUne,
                style: AppTypography.body.copyWith(color: onSurface),
              ),
              const SizedBox(height: AppSpacing.md),
              SwitchListTile(
                title: Text(l10n.notificationsSurLeTelephone),
                subtitle: Text(l10n.rappelsDeDepartSuiviDe),
                value: p.push,
                onChanged: busy ? null : (v) => _set(loaded, 'notifyPush', v),
              ),
              SwitchListTile(
                title: const Text('E-mails'),
                subtitle: Text(l10n.confirmationsFacturesRecus),
                value: p.email,
                onChanged: busy ? null : (v) => _set(loaded, 'notifyEmail', v),
              ),
              SwitchListTile(
                title: const Text('SMS'),
                subtitle: Text(l10n.rappelLaVeilleDuDepart),
                value: p.sms,
                onChanged: busy ? null : (v) => _set(loaded, 'notifySms', v),
              ),
              const Divider(height: AppSpacing.xl),
              SwitchListTile(
                title: Text(l10n.offresEtNouveautesXlcab),
                subtitle: Text(l10n.nouvellesLignesPromotionsDesactivableA),
                value: p.marketing,
                onChanged: busy ? null : (v) => _set(loaded, 'marketing', v),
              ),
            ],
          );
        },
      ),
    );
  }
}
