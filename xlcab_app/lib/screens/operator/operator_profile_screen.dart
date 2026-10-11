import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../config/legal.dart';
import '../../models/operator.dart';
import '../../providers/operator_provider.dart';
import '../../services/api_service.dart';
import '../../services/operator_service.dart';
import '../../theme/app_spacing.dart';
import '../../theme/app_typography.dart';
import '../../widgets/primary_button.dart';
import '../profile/profile_screen.dart' show legalLinkOpenerProvider;
import 'widgets.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Profil opérateur : présentation professionnelle, licence de transport
/// (vente à la place après vérification par XLCAB) et acceptation des
/// conditions générales opérateur (protocole d'annulation, pénalités).
class OperatorProfileScreen extends ConsumerWidget {
  const OperatorProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(operatorProfileProvider);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.opProfilOperateur)),
      body: AsyncBody(
        value: profile,
        loadingLabel: l10n.opChargementDuProfil,
        onRetry: () => ref.invalidate(operatorProfileProvider),
        data: (p) => _ProfileForm(profile: p),
      ),
    );
  }
}

String operatorKindLabel(String kind) => switch (kind) {
      'vtc_company' => l10n.opKindSocieteVtc,
      'fleet' => l10n.opKindFlotte,
      'collective' => l10n.opKindCollectif,
      _ => l10n.opKindIndependant,
    };

String operatorServiceLabel(String service) => switch (service) {
      'airport' => l10n.opServiceAeroport,
      'station' => l10n.opServiceGare,
      'intercity' => l10n.opServiceInterurbain,
      'group' => l10n.opServiceGroupe,
      'business' => l10n.opServiceAffaires,
      'tourism' => l10n.opServiceTourisme,
      _ => l10n.opServiceMiseADisposition,
    };

class _ProfileForm extends ConsumerStatefulWidget {
  const _ProfileForm({required this.profile});

  final OperatorProfile profile;

  @override
  ConsumerState<_ProfileForm> createState() => _ProfileFormState();
}

class _ProfileFormState extends ConsumerState<_ProfileForm> {
  late final _legalName = TextEditingController(text: widget.profile.legalName);
  late final _siret = TextEditingController(text: widget.profile.siret);
  late final _license = TextEditingController(text: widget.profile.transportLicense);
  late final _cities = TextEditingController(text: widget.profile.cities.join(', '));
  late final _description = TextEditingController(text: widget.profile.description);
  late String _kind = widget.profile.kind;
  late final Set<String> _services = {...widget.profile.services};
  bool _acceptTerms = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_legalName, _siret, _license, _cities, _description]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(operatorServiceProvider).saveProfile(
            kind: _kind,
            legalName: _legalName.text.trim(),
            siret: _siret.text.trim(),
            transportLicense: _license.text.trim(),
            cities: _cities.text.split(',').map((c) => c.trim()).where((c) => c.isNotEmpty).toList(),
            services: _services.toList(),
            description: _description.text.trim(),
            acceptTermsVersion: _acceptTerms ? widget.profile.termsVersion : null,
          );
      ref.invalidate(operatorProfileProvider);
      if (!mounted) return;
      showToast(context, l10n.opProfilEnregistre);
      context.pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.profile;
    final lang = Localizations.localeOf(context).languageCode;
    final status = switch (p.status) {
      OperatorStatus.verified => l10n.opStatutVerifie,
      OperatorStatus.suspended => l10n.opStatutSuspendu,
      OperatorStatus.pending => l10n.opStatutEnVerification,
    };
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.md),
      children: [
        Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [
          StatusPill(icon: Icons.verified_outlined, label: status),
          StatusPill(label: p.perSeatAllowed ? l10n.opVenteALaPlaceAutorisee : l10n.opVenteParVehiculeSeulement),
        ]),

        SectionTitle(l10n.opActivite),
        Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [
          for (final k in operatorKinds)
            ChoiceChip(label: Text(operatorKindLabel(k)), selected: _kind == k, onSelected: (_) => setState(() => _kind = k)),
        ]),
        const SizedBox(height: AppSpacing.sm),
        TextField(controller: _legalName, maxLength: 120, decoration: InputDecoration(labelText: l10n.opNomCommercial)),
        TextField(controller: _siret, keyboardType: TextInputType.number, decoration: InputDecoration(labelText: l10n.opSiret)),
        const SizedBox(height: AppSpacing.sm),
        TextField(
          controller: _license,
          maxLength: 60,
          decoration: InputDecoration(labelText: l10n.opLicenceTransport, helperText: l10n.opLicenceTransportAide, helperMaxLines: 3),
        ),

        SectionTitle(l10n.opPrestations),
        Wrap(spacing: AppSpacing.sm, runSpacing: AppSpacing.xs, children: [
          for (final s in operatorServices)
            FilterChip(
              label: Text(operatorServiceLabel(s)),
              selected: _services.contains(s),
              onSelected: (on) => setState(() => on ? _services.add(s) : _services.remove(s)),
            ),
        ]),
        const SizedBox(height: AppSpacing.sm),
        TextField(controller: _cities, decoration: InputDecoration(labelText: l10n.opVillesDesservies, hintText: l10n.opVillesExemple)),
        const SizedBox(height: AppSpacing.sm),
        TextField(
          controller: _description,
          maxLength: 1000,
          minLines: 2,
          maxLines: 5,
          decoration: InputDecoration(labelText: l10n.opPresentation),
        ),

        SectionTitle(l10n.opConditionsOperateur),
        if (p.termsAccepted)
          Text(l10n.opConditionsAcceptees, style: AppTypography.body)
        else ...[
          Text(l10n.opConditionsResume, style: AppTypography.body),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            value: _acceptTerms,
            onChanged: (v) => setState(() => _acceptTerms = v == true),
            title: Text(l10n.opJAccepteLesConditions),
            controlAffinity: ListTileControlAffinity.leading,
          ),
        ],
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            icon: const Icon(Icons.open_in_new),
            label: Text(l10n.opLireLesConditions),
            onPressed: () async {
              final messenger = ScaffoldMessenger.of(context);
              final ok = await ref.read(legalLinkOpenerProvider)(Uri.parse(operatorTermsFor(lang)));
              if (!ok) messenger.showSnackBar(SnackBar(content: Text(l10n.impossibleDOuvrirLeLien)));
            },
          ),
        ),
        if (_error != null)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            child: Text(_error!, style: AppTypography.body.copyWith(color: Theme.of(context).colorScheme.error)),
          ),
        const SizedBox(height: AppSpacing.md),
        PrimaryButton(label: l10n.enregistrer, icon: Icons.save_outlined, onPressed: _busy ? null : _save),
        const SizedBox(height: AppSpacing.lg),
      ],
    );
  }
}
