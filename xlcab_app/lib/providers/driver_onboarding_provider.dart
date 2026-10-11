import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/driver_application.dart';
import '../models/shuttle.dart';
import '../services/api_service.dart';
import '../services/document_picker.dart';
import '../services/driver_service.dart';
import '../utils/validators.dart';
import 'booking_provider.dart' show clockProvider;
import 'package:xlcab_app/l10n/l10n.dart';

/// Nombre d'étapes du parcours (Partie 9, Module 8).
const int onboardingStepCount = 5;

/// Titres des étapes, dans l'ordre de la spec.
// Accesseur (pas une constante) : les titres suivent la langue courante.
List<String> get onboardingStepTitles => [
  l10n.informationsPersonnelles,
  l10n.documentsDuVehicule,
  l10n.documentsPersonnels,
  l10n.informationsVehicule,
  l10n.envoiPourValidation,
];

enum DocUploadStatus { missing, uploading, uploaded, failed }

@immutable
class DocUpload {
  const DocUpload(this.status, [this.error]);

  final DocUploadStatus status;
  final String? error;

  static const missing = DocUpload(DocUploadStatus.missing);
}

@immutable
class OnboardingState {
  const OnboardingState({
    this.loading = true,
    this.loadError,
    this.status = DriverApplicationStatus.draft,
    this.step = 0,
    this.draft = const DriverApplicationDraft(),
    this.documents = const {},
    this.showErrors = false,
    this.submitting = false,
    this.submitError,
  });

  final bool loading;
  final String? loadError;
  final DriverApplicationStatus status;
  final int step;
  final DriverApplicationDraft draft;
  final Map<DriverDocumentType, DocUpload> documents;

  /// Les erreurs de l'étape ne s'affichent qu'après un appui sur "Suivant".
  final bool showErrors;
  final bool submitting;
  final String? submitError;

  DocUpload doc(DriverDocumentType t) => documents[t] ?? DocUpload.missing;

  bool isUploaded(DriverDocumentType t) => doc(t).status == DocUploadStatus.uploaded;

  OnboardingState copyWith({
    bool? loading,
    String? loadError,
    DriverApplicationStatus? status,
    int? step,
    DriverApplicationDraft? draft,
    Map<DriverDocumentType, DocUpload>? documents,
    bool? showErrors,
    bool? submitting,
    String? submitError,
    bool clearSubmitError = false,
  }) {
    return OnboardingState(
      loading: loading ?? this.loading,
      loadError: loadError ?? this.loadError,
      status: status ?? this.status,
      step: step ?? this.step,
      draft: draft ?? this.draft,
      documents: documents ?? this.documents,
      showErrors: showErrors ?? this.showErrors,
      submitting: submitting ?? this.submitting,
      submitError: clearSubmitError ? null : (submitError ?? this.submitError),
    );
  }

  /// Ce qui manque pour passer l'étape [s]. Vide = étape valide.
  /// Mêmes règles que le serveur (DriverApplicationDto), pour guider
  /// sans aller-retour réseau ; le serveur reste l'autorité.
  List<String> stepErrors(int s, DateTime now) {
    final d = draft;
    final errors = <String>[];
    void docs(List<DriverDocumentType> types) {
      for (final t in types) {
        if (DriverDocumentType.required.contains(t) && !isUploaded(t)) errors.add(l10n.aEnvoyer(t.label));
      }
    }

    switch (s) {
      case 0:
        if (d.firstName.trim().isEmpty) errors.add(l10n.prenomRequis);
        if (d.lastName.trim().isEmpty) errors.add(l10n.nomRequis);
        if (normalizePhone(d.phone) == null) errors.add(l10n.numeroDeTelephoneInvalide);
        if (d.languages.isEmpty) errors.add(l10n.auMoinsUneLangueParlee);
      case 1:
        docs(DriverDocumentType.vehicleDocuments);
      case 2:
        if (d.licenseNumber.trim().isEmpty) errors.add(l10n.numeroDePermisRequis);
        if (!isFutureDate(d.licenseExpiry, now)) errors.add(l10n.dateDExpirationDuPermis);
        if (d.vtcCardNumber.trim().isEmpty) errors.add(l10n.numeroDeCarteVtcRequis);
        if (!isFutureDate(d.vtcCardExpiry, now)) errors.add(l10n.dateDExpirationDeLa);
        docs(DriverDocumentType.personalDocuments);
      case 3:
        if (d.brand.trim().isEmpty) errors.add(l10n.marqueRequise);
        if (d.model.trim().isEmpty) errors.add(l10n.modeleRequis);
        if (d.color.trim().isEmpty) errors.add(l10n.couleurRequise);
        if (normalizePlate(d.plate) == null) errors.add(l10n.immatriculationAuFormatAb123);
        if (!d.dashcamInstalled) errors.add(l10n.uneDashcamEstObligatoire);
        if (!isFutureDate(d.insuranceExpiry, now)) errors.add(l10n.echeanceDAssuranceAVenir);
        if (!isFutureDate(d.technicalControlExpiry, now)) errors.add(l10n.echeanceDuControleTechniqueA);
        if (d.shuttleType == ShuttleType.accessibility && (!d.pmrEquipped || !d.pmrTrained)) {
          errors.add(l10n.navetteAccessibiliteVehiculeEquipePmr);
        }
      case 4:
        if (!d.consent) errors.add(l10n.consentementRequisPourEnvoyerVotre);
    }
    return errors;
  }
}

class DriverOnboardingController extends AutoDisposeNotifier<OnboardingState> {
  bool _disposed = false;

  @override
  OnboardingState build() {
    ref.onDispose(() => _disposed = true);
    Future.microtask(_load);
    return const OnboardingState();
  }

  DateTime get _now => ref.read(clockProvider)();

  Future<void> _load() async {
    if (_disposed) return;
    final service = ref.read(driverServiceProvider);
    try {
      final view = await service.application();
      if (_disposed) return;
      state = state.copyWith(
        loading: false,
        status: view.status,
        // Documents déjà envoyés lors d'une session précédente.
        documents: {for (final t in view.uploaded) t: const DocUpload(DocUploadStatus.uploaded)},
      );
    } on ApiException catch (e) {
      if (!_disposed) state = state.copyWith(loading: false, loadError: e.message);
    }
  }

  void update(DriverApplicationDraft Function(DriverApplicationDraft d) change) {
    state = state.copyWith(draft: change(state.draft), clearSubmitError: true);
  }

  /// Étape suivante si l'étape courante est complète ; sinon affiche ce
  /// qui manque.
  bool next() {
    if (state.stepErrors(state.step, _now).isNotEmpty) {
      state = state.copyWith(showErrors: true);
      return false;
    }
    if (state.step < onboardingStepCount - 1) {
      state = state.copyWith(step: state.step + 1, showErrors: false);
    }
    return true;
  }

  void back() {
    if (state.step > 0) state = state.copyWith(step: state.step - 1, showErrors: false);
  }

  /// Photo (appareil ou galerie) → compression < 2 Mo → envoi.
  Future<void> pickAndUpload(DriverDocumentType type, DocumentSource source) async {
    final picker = ref.read(documentPickerProvider);
    final service = ref.read(driverServiceProvider);

    PickedDocument? picked;
    try {
      picked = await picker.pick(source);
    } on ApiException catch (e) {
      _setDoc(type, DocUpload(DocUploadStatus.failed, e.message));
      return;
    }
    if (picked == null || _disposed) return; // annulé

    final previous = state.doc(type);
    _setDoc(type, const DocUpload(DocUploadStatus.uploading));
    try {
      await service.uploadDocument(type, picked);
      _setDoc(type, const DocUpload(DocUploadStatus.uploaded));
    } on ApiException catch (e) {
      // Un document déjà reçu le reste si le remplacement échoue.
      _setDoc(
        type,
        previous.status == DocUploadStatus.uploaded
            ? DocUpload(DocUploadStatus.uploaded, e.message)
            : DocUpload(DocUploadStatus.failed, e.message),
      );
    }
  }

  void _setDoc(DriverDocumentType type, DocUpload value) {
    if (_disposed) return;
    state = state.copyWith(documents: {...state.documents, type: value});
  }

  /// Étape 5 : envoi du dossier complet.
  Future<void> submit() async {
    final now = _now;
    for (var s = 0; s < onboardingStepCount; s++) {
      if (state.stepErrors(s, now).isNotEmpty) {
        state = state.copyWith(step: s, showErrors: true);
        return;
      }
    }
    final d = state.draft;
    final normalized = d.copyWith(phone: normalizePhone(d.phone), plate: normalizePlate(d.plate));

    state = state.copyWith(submitting: true, clearSubmitError: true);
    try {
      final view = await ref.read(driverServiceProvider).apply(normalized);
      if (!_disposed) state = state.copyWith(submitting: false, status: view.status);
    } on ApiException catch (e) {
      if (!_disposed) state = state.copyWith(submitting: false, submitError: e.message);
    }
  }
}

final driverOnboardingProvider =
    NotifierProvider.autoDispose<DriverOnboardingController, OnboardingState>(DriverOnboardingController.new);
