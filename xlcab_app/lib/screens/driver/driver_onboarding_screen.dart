import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/driver_application.dart';
import 'package:xlcab_core/models/shuttle.dart';
import '../../providers/booking_provider.dart' show clockProvider;
import '../../providers/driver_onboarding_provider.dart';
import '../../router.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/validators.dart';
import 'package:xlcab_ui/widgets/date_field.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';
import 'widgets/document_upload_tile.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Module 8 — Onboarding chauffeur (Partie 9) : parcours en 5 étapes,
/// infos perso → docs véhicule → docs perso (VTC, REVTC) → infos
/// véhicule → envoi pour validation. Photos compressées sous 2 Mo et
/// envoyées une à une (POST /drivers/me/documents).
class DriverOnboardingScreen extends ConsumerWidget {
  const DriverOnboardingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(driverOnboardingProvider);

    if (state.loading) {
      return Scaffold(body: Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargement)));
    }
    if (state.loadError != null) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.devenirChauffeur)),
        body: Center(child: Padding(padding: const EdgeInsets.all(AppSpacing.lg), child: Text(state.loadError!))),
      );
    }
    if (state.status != DriverApplicationStatus.draft) {
      return _StatusView(status: state.status);
    }

    final controller = ref.read(driverOnboardingProvider.notifier);
    final now = ref.watch(clockProvider)();
    final errors = state.showErrors ? state.stepErrors(state.step, now) : const <String>[];
    final isLast = state.step == onboardingStepCount - 1;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.devenirChauffeur)),
      body: Column(
        children: [
          _StepHeader(step: state.step),
          Expanded(
            child: ListView(
              key: PageStorageKey('step-${state.step}'),
              padding: const EdgeInsets.all(AppSpacing.md),
              children: [
                ...switch (state.step) {
                  0 => _personalStep(state, controller),
                  1 => _documentsStep(state, controller, DriverDocumentType.vehicleDocuments,
                      l10n.photographiezChaqueDocumentEnEntier),
                  2 => _licensesStep(context, state, controller, now),
                  3 => _vehicleStep(context, state, controller, now),
                  _ => _reviewStep(context, state, controller),
                },
                if (errors.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.md),
                  _ErrorList(errors: errors),
                ],
                if (isLast && state.submitError != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  _ErrorList(errors: [state.submitError!]),
                ],
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.md),
          child: Row(
            children: [
              if (state.step > 0) ...[
                OutlinedButton(
                  style: OutlinedButton.styleFrom(minimumSize: const Size(0, AppSpacing.buttonHeight)),
                  onPressed: state.submitting ? null : controller.back,
                  child: Text(l10n.precedent),
                ),
                const SizedBox(width: AppSpacing.sm),
              ],
              Expanded(
                child: PrimaryButton(
                  label: isLast ? (state.submitting ? l10n.envoi : l10n.envoyerMonDossier) : l10n.suivant,
                  icon: isLast ? Icons.send : Icons.arrow_forward,
                  onPressed: state.submitting ? null : (isLast ? controller.submit : controller.next),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Étape 1 : infos perso ───────────────────────────────────────────

  List<Widget> _personalStep(OnboardingState s, DriverOnboardingController c) {
    final languages = {
      'fr': l10n.francais, 'en': l10n.anglais, 'ga': l10n.irlandais, 'es': l10n.espagnol,
      'it': l10n.italien, 'de': l10n.allemand, 'pt': l10n.portugais, 'ar': l10n.arabe,
    };
    return [
      _text(l10n.prenom, s.draft.firstName, (v) => c.update((d) => d.copyWith(firstName: v)),
          autofill: AutofillHints.givenName),
      _text(l10n.nom, s.draft.lastName, (v) => c.update((d) => d.copyWith(lastName: v)),
          autofill: AutofillHints.familyName),
      _text(l10n.telephoneMobile, s.draft.phone, (v) => c.update((d) => d.copyWith(phone: v)),
          hint: '06 12 34 56 78', keyboard: TextInputType.phone, autofill: AutofillHints.telephoneNumber),
      const SizedBox(height: AppSpacing.sm),
      _Label(l10n.languesParlees),
      Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          for (final e in languages.entries)
            FilterChip(
              label: Text(e.value),
              selected: s.draft.languages.contains(e.key),
              onSelected: (on) => c.update((d) => d.copyWith(
                    languages: on ? {...d.languages, e.key} : ({...d.languages}..remove(e.key)),
                  )),
            ),
        ],
      ),
    ];
  }

  // ── Étapes 2 et 3 : documents ───────────────────────────────────────

  List<Widget> _documentsStep(
    OnboardingState s,
    DriverOnboardingController c,
    List<DriverDocumentType> types,
    String help,
  ) {
    return [
      Text(help, style: AppTypography.body),
      const SizedBox(height: AppSpacing.md),
      for (final t in types) ...[
        DocumentUploadTile(type: t, upload: s.doc(t), onPick: (source) => c.pickAndUpload(t, source)),
        const SizedBox(height: AppSpacing.sm),
      ],
    ];
  }

  List<Widget> _licensesStep(BuildContext context, OnboardingState s, DriverOnboardingController c, DateTime now) {
    final tomorrow = DateTime(now.year, now.month, now.day + 1);
    final last = DateTime(now.year + 20);
    return [
      _Label(l10n.permisDeConduire),
      _text(l10n.numeroDePermis, s.draft.licenseNumber, (v) => c.update((d) => d.copyWith(licenseNumber: v))),
      DateField(
        label: l10n.dateDExpirationDuPermis2,
        value: s.draft.licenseExpiry,
        firstDate: tomorrow,
        lastDate: last,
        onChanged: (v) => c.update((d) => d.copyWith(licenseExpiry: v)),
      ),
      const SizedBox(height: AppSpacing.md),
      _Label(l10n.carteProfessionnelleVtc),
      _text(l10n.numeroDeCarteVtc, s.draft.vtcCardNumber, (v) => c.update((d) => d.copyWith(vtcCardNumber: v))),
      DateField(
        label: l10n.dateDExpirationDeLa2,
        value: s.draft.vtcCardExpiry,
        firstDate: tomorrow,
        lastDate: last,
        onChanged: (v) => c.update((d) => d.copyWith(vtcCardExpiry: v)),
      ),
      const SizedBox(height: AppSpacing.md),
      _text(l10n.numeroRevtcFacultatif, s.draft.revtcNumber, (v) => c.update((d) => d.copyWith(revtcNumber: v))),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(l10n.formeEALAccueil),
        subtitle: Text(l10n.obligatoirePourLaNavetteAccessibilite),
        value: s.draft.pmrTrained,
        onChanged: (v) => c.update((d) => d.copyWith(pmrTrained: v)),
      ),
      const SizedBox(height: AppSpacing.md),
      ..._documentsStep(s, c, DriverDocumentType.personalDocuments, l10n.photosDuPermisRectoEt),
    ];
  }

  // ── Étape 4 : infos véhicule ────────────────────────────────────────

  List<Widget> _vehicleStep(BuildContext context, OnboardingState s, DriverOnboardingController c, DateTime now) {
    final d = s.draft;
    final tomorrow = DateTime(now.year, now.month, now.day + 1);
    final last = DateTime(now.year + 5);
    return [
      _text(l10n.marque, d.brand, (v) => c.update((x) => x.copyWith(brand: v)), hint: 'Renault'),
      _text(l10n.modele, d.model, (v) => c.update((x) => x.copyWith(model: v)), hint: 'Trafic'),
      _text(l10n.couleur, d.color, (v) => c.update((x) => x.copyWith(color: v))),
      _text(l10n.immatriculation2, d.plate, (v) => c.update((x) => x.copyWith(plate: v)),
          hint: 'AB-123-CD', caps: TextCapitalization.characters),
      _Label(l10n.placesPassagers),
      // 7 ou 8 : navettes 7+ places ; au-delà de 8 passagers, ce n'est
      // plus du VTC (9 places conducteur compris).
      SegmentedButton<int>(
        segments: [
          ButtonSegment(value: 7, label: Text(l10n.n7Places)),
          ButtonSegment(value: 8, label: Text(l10n.n8Places)),
        ],
        selected: {d.capacity},
        onSelectionChanged: (v) => c.update((x) => x.copyWith(capacity: v.first)),
      ),
      const SizedBox(height: AppSpacing.md),
      _Label(l10n.navetteSouhaitee),
      Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          for (final t in ShuttleType.values)
            ChoiceChip(
              avatar: Icon(t.icon, color: t.color, size: 18),
              label: Text(t.label),
              selected: d.shuttleType == t,
              onSelected: (_) => c.update((x) => x.copyWith(shuttleType: t)),
            ),
        ],
      ),
      if (d.shuttleType == ShuttleType.rose)
        Padding(
          padding: const EdgeInsets.only(top: AppSpacing.xs),
          child: Text(l10n.navetteRoseConductricesUniquementSous),
        ),
      SwitchListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(l10n.vehiculeEquipePmrRampeFixations),
        value: d.pmrEquipped,
        onChanged: (v) => c.update((x) => x.copyWith(pmrEquipped: v)),
      ),
      CheckboxListTile(
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        title: Text(l10n.dashcamInstalleeEtFonctionnelleObligatoire),
        value: d.dashcamInstalled,
        onChanged: (v) => c.update((x) => x.copyWith(dashcamInstalled: v ?? false)),
      ),
      const SizedBox(height: AppSpacing.sm),
      DateField(
        label: l10n.echeanceDeLAssurance,
        value: d.insuranceExpiry,
        firstDate: tomorrow,
        lastDate: last,
        onChanged: (v) => c.update((x) => x.copyWith(insuranceExpiry: v)),
      ),
      const SizedBox(height: AppSpacing.md),
      DateField(
        label: l10n.echeanceDuControleTechnique,
        value: d.technicalControlExpiry,
        firstDate: tomorrow,
        lastDate: last,
        onChanged: (v) => c.update((x) => x.copyWith(technicalControlExpiry: v)),
      ),
    ];
  }

  // ── Étape 5 : récapitulatif et envoi ────────────────────────────────

  List<Widget> _reviewStep(BuildContext context, OnboardingState s, DriverOnboardingController c) {
    final d = s.draft;
    final docsCount = DriverDocumentType.required.where(s.isUploaded).length;
    return [
      _Summary(title: l10n.identite, lines: ['${d.firstName} ${d.lastName}', normalizePhone(d.phone) ?? d.phone]),
      _Summary(
        title: l10n.vehicule,
        lines: ['${d.brand} ${d.model} · ${d.color}', normalizePlate(d.plate) ?? d.plate, l10n.places2(d.capacity, d.shuttleType.label)],
      ),
      _Summary(title: l10n.documents, lines: [l10n.documentsObligatoiresRecus(docsCount, DriverDocumentType.required.length)]),
      const SizedBox(height: AppSpacing.sm),
      // Partie 8 : consentement explicite. Jamais pré-coché.
      CheckboxListTile(
        contentPadding: EdgeInsets.zero,
        controlAffinity: ListTileControlAffinity.leading,
        value: d.consent,
        onChanged: (v) => c.update((x) => x.copyWith(consent: v ?? false)),
        title: Text(
          l10n.jAccepteQueXlcabTraite +
          l10n.lesJustificatifsVtcSontConserves,
        ),
      ),
    ];
  }

  Widget _text(
    String label,
    String value,
    ValueChanged<String> onChanged, {
    String? hint,
    TextInputType? keyboard,
    String? autofill,
    TextCapitalization caps = TextCapitalization.sentences,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: TextFormField(
        key: ValueKey(label),
        initialValue: value,
        onChanged: onChanged,
        keyboardType: keyboard,
        textCapitalization: caps,
        autofillHints: autofill == null ? null : [autofill],
        decoration: InputDecoration(labelText: label, hintText: hint),
      ),
    );
  }
}

// ── Éléments ─────────────────────────────────────────────────────────────

class _StepHeader extends StatelessWidget {
  const _StepHeader({required this.step});

  final int step;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Padding(
      padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, 0),
      child: Semantics(
        header: true,
        label: l10n.etapeSur(step + 1, onboardingStepCount, onboardingStepTitles[step]),
        excludeSemantics: true,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.etapeSur2(step + 1, onboardingStepCount),
                style: AppTypography.caption.copyWith(color: onSurface.withValues(alpha: 0.7))),
            Text(onboardingStepTitles[step], style: AppTypography.h2.copyWith(color: onSurface)),
            const SizedBox(height: AppSpacing.sm),
            ClipRRect(
              borderRadius: BorderRadius.circular(2),
              child: LinearProgressIndicator(
                value: (step + 1) / onboardingStepCount,
                minHeight: AppSpacing.etaBarHeight,
                color: AppColors.primaryButton,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.sm),
        child: Text(text, style: AppTypography.bodyBold.copyWith(color: Theme.of(context).colorScheme.onSurface)),
      );
}

class _ErrorList extends StatelessWidget {
  const _ErrorList({required this.errors});

  final List<String> errors;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          border: Border.all(color: AppColors.error, width: 2),
          borderRadius: BorderRadius.circular(AppSpacing.radiusCard),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final e in errors)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const ExcludeSemantics(child: Icon(Icons.error_outline, size: 18, color: AppColors.error)),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(child: Text(e, style: AppTypography.body.copyWith(color: onSurface))),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.title, required this.lines});

  final String title;
  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: AppTypography.bodyBold.copyWith(color: onSurface)),
          for (final l in lines) Text(l, style: AppTypography.body.copyWith(color: onSurface)),
        ],
      ),
    );
  }
}

/// Dossier envoyé ou déjà validé : plus de formulaire.
class _StatusView extends StatelessWidget {
  const _StatusView({required this.status});

  final DriverApplicationStatus status;

  @override
  Widget build(BuildContext context) {
    final approved = status == DriverApplicationStatus.approved;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Scaffold(
      appBar: AppBar(title: Text(l10n.devenirChauffeur)),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ExcludeSemantics(
                child: Icon(approved ? Icons.verified : Icons.hourglass_top, size: 64, color: onSurface),
              ),
              const SizedBox(height: AppSpacing.md),
              Semantics(
                header: true,
                child: Text(
                  approved ? l10n.compteChauffeurValide : l10n.dossierEnCoursDeVerification,
                  textAlign: TextAlign.center,
                  style: AppTypography.h2.copyWith(color: onSurface),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                approved
                    ? l10n.vousPouvezPasserEnLigne
                    : l10n.lEquipeXlcabVerifieVos,
                textAlign: TextAlign.center,
                style: AppTypography.body.copyWith(color: onSurface),
              ),
              if (approved) ...[
                const SizedBox(height: AppSpacing.lg),
                PrimaryButton(label: l10n.passerEnModeChauffeur, onPressed: () => context.go(AppRoutes.driverMode)),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
