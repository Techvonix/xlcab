import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xlcab_app/models/driver_application.dart';
import 'package:xlcab_app/models/shuttle.dart';
import 'package:xlcab_app/providers/booking_provider.dart';
import 'package:xlcab_app/providers/driver_onboarding_provider.dart';
import 'package:xlcab_app/services/api_service.dart';
import 'package:xlcab_app/services/document_picker.dart';
import 'package:xlcab_app/services/driver_service.dart';

import '../support/fakes.dart';

void main() {
  late FakeDriverService service;
  late FakeDocumentPicker picker;
  late ProviderContainer container;

  OnboardingState read() => container.read(driverOnboardingProvider);
  DriverOnboardingController ctrl() => container.read(driverOnboardingProvider.notifier);
  Future<void> settle() => Future<void>.delayed(Duration.zero);

  Future<void> uploadAll() async {
    for (final t in DriverDocumentType.required) {
      await ctrl().pickAndUpload(t, DocumentSource.camera);
    }
  }

  setUp(() async {
    service = FakeDriverService();
    picker = FakeDocumentPicker();
    container = ProviderContainer(overrides: [
      driverServiceProvider.overrideWithValue(service),
      documentPickerProvider.overrideWithValue(picker),
      clockProvider.overrideWithValue(() => now),
    ]);
    addTearDown(container.dispose);
    container.listen(driverOnboardingProvider, (_, __) {});
    await settle();
  });

  test('démarre à l’étape 1, en brouillon', () {
    expect(read().loading, isFalse);
    expect(read().status, DriverApplicationStatus.draft);
    expect(read().step, 0);
  });

  test('reprend les documents déjà reçus par le serveur', () async {
    service.serverDocs.add(DriverDocumentType.drivingLicense);
    final c = ProviderContainer(overrides: [driverServiceProvider.overrideWithValue(service)]);
    addTearDown(c.dispose);
    c.listen(driverOnboardingProvider, (_, __) {});
    await settle();
    expect(c.read(driverOnboardingProvider).isUploaded(DriverDocumentType.drivingLicense), isTrue);
  });

  test('"Suivant" bloqué tant que l’étape est incomplète, avec les manques affichés', () {
    expect(ctrl().next(), isFalse);
    expect(read().step, 0);
    expect(read().showErrors, isTrue);
    expect(read().stepErrors(0, now), containsAll(['Prénom requis', 'Nom requis', 'Numéro de téléphone invalide']));

    ctrl().update((_) => completeDraft());
    expect(ctrl().next(), isTrue);
    expect(read().step, 1);
    expect(read().showErrors, isFalse);
  });

  test('étape 2 : les 3 documents du véhicule sont exigés', () async {
    ctrl().update((_) => completeDraft());
    ctrl().next();
    expect(ctrl().next(), isFalse);
    for (final t in DriverDocumentType.vehicleDocuments) {
      await ctrl().pickAndUpload(t, DocumentSource.gallery);
    }
    expect(ctrl().next(), isTrue);
    expect(service.uploads, DriverDocumentType.vehicleDocuments);
  });

  test('étape 3 : le REVTC est facultatif, le permis et la carte VTC non', () async {
    ctrl().update((_) => completeDraft());
    await ctrl().pickAndUpload(DriverDocumentType.drivingLicense, DocumentSource.camera);
    expect(read().stepErrors(2, now), ['Carte professionnelle VTC à envoyer']);
    await ctrl().pickAndUpload(DriverDocumentType.vtcCard, DocumentSource.camera);
    expect(read().stepErrors(2, now), isEmpty);
  });

  test('étape 4 : dashcam obligatoire, échéances futures, format d’immatriculation', () {
    ctrl().update((_) => completeDraft().copyWith(
          dashcamInstalled: false,
          plate: '1234 AB 75',
          insuranceExpiry: DateTime(2026, 9, 30),
        ));
    expect(read().stepErrors(3, now), containsAll([
      'Une dashcam est obligatoire',
      'Immatriculation au format AB-123-CD',
      'Échéance d’assurance à venir requise',
    ]));
  });

  test('navette Accessibilité : équipement ET formation PMR', () {
    ctrl().update((_) => completeDraft().copyWith(shuttleType: ShuttleType.accessibility, pmrEquipped: true));
    expect(read().stepErrors(3, now), contains(startsWith('Navette Accessibilité')));
    ctrl().update((d) => d.copyWith(pmrTrained: true));
    expect(read().stepErrors(3, now), isEmpty);
  });

  group('documents', () {
    test('annulation du choix de photo : rien n’est envoyé', () async {
      picker.next = null;
      await ctrl().pickAndUpload(DriverDocumentType.vtcCard, DocumentSource.camera);
      expect(service.uploads, isEmpty);
      expect(read().doc(DriverDocumentType.vtcCard).status, DocUploadStatus.missing);
    });

    test('échec d’envoi : message affiché, document marqué en échec', () async {
      service.uploadError = const ApiException('Fichier trop volumineux (2 Mo maximum).');
      await ctrl().pickAndUpload(DriverDocumentType.vtcCard, DocumentSource.camera);
      expect(read().doc(DriverDocumentType.vtcCard).status, DocUploadStatus.failed);
      expect(read().doc(DriverDocumentType.vtcCard).error, 'Fichier trop volumineux (2 Mo maximum).');
    });

    test('remplacement raté : le document déjà reçu reste valable', () async {
      await ctrl().pickAndUpload(DriverDocumentType.vtcCard, DocumentSource.camera);
      service.uploadError = const ApiException('Pas de connexion internet. Vérifiez votre réseau.');
      await ctrl().pickAndUpload(DriverDocumentType.vtcCard, DocumentSource.camera);
      expect(read().isUploaded(DriverDocumentType.vtcCard), isTrue);
      expect(read().doc(DriverDocumentType.vtcCard).error, isNotNull);
    });
  });

  group('envoi (étape 5)', () {
    test('dossier complet : envoi normalisé, statut "en cours de vérification"', () async {
      ctrl().update((_) => completeDraft());
      await uploadAll();
      await ctrl().submit();

      expect(read().status, DriverApplicationStatus.pending);
      final json = service.lastApplication!;
      expect(json['personal']['phone'], '+33612345678');
      expect(json['vehicle']['plate'], 'AB-123-CD');
      expect(json['vehicle']['dashcamInstalled'], isTrue);
      expect(json['consent'], isTrue);
      // Jamais de champs réservés à l'admin.
      expect(json.keys, isNot(contains('roseEligible')));
    });

    test('étape incomplète : retour à la première étape fautive, rien n’est envoyé', () async {
      ctrl().update((_) => completeDraft());
      // Aucun document envoyé.
      await ctrl().submit();
      expect(read().step, 1);
      expect(read().showErrors, isTrue);
      expect(service.lastApplication, isNull);
    });

    test('sans consentement : envoi refusé', () async {
      ctrl().update((_) => completeDraft().copyWith(consent: false));
      await uploadAll();
      await ctrl().submit();
      expect(read().step, 4);
      expect(service.lastApplication, isNull);
    });

    test('refus du serveur : message affiché, dossier toujours modifiable', () async {
      service.applyError = const ApiException('Ce véhicule est déjà enregistré');
      ctrl().update((_) => completeDraft());
      await uploadAll();
      await ctrl().submit();
      expect(read().status, DriverApplicationStatus.draft);
      expect(read().submitError, 'Ce véhicule est déjà enregistré');
      expect(read().submitting, isFalse);
    });
  });
}
