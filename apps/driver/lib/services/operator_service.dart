import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/meeting_point.dart';
import 'package:xlcab_core/models/operator.dart';
import 'package:xlcab_core/models/payouts.dart';
import 'package:xlcab_core/services/api_service.dart';

/// Espace opérateur (xlcab_backend/src/operators et src/line-bookings) :
/// profil, véhicules, lignes régulières, départs, réserves, reprises de
/// départ et annulations. Réservé au rôle chauffeur.
class OperatorService {
  OperatorService(this._dio);

  final Dio _dio;
  static const _me = '/api/v1/operators/me';
  String _id(String id) => Uri.encodeComponent(id);

  // ── Profil et véhicules ──

  Future<OperatorProfile> profile() => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>(_me);
        return OperatorProfile.fromJson(res.data);
      });

  /// Enregistre le profil ; [acceptTermsVersion] = version des conditions générales opérateur acceptées.
  Future<OperatorProfile> saveProfile({
    required String kind,
    String? legalName,
    String? siret,
    String? transportLicense,
    List<String> cities = const [],
    List<String> services = const [],
    String? description,
    String? acceptTermsVersion,
  }) =>
      _guard(() async {
        final res = await _dio.put<Map<String, dynamic>>(_me, data: {
          'kind': kind,
          if (legalName != null && legalName.isNotEmpty) 'legalName': legalName,
          if (siret != null && siret.isNotEmpty) 'siret': siret,
          if (transportLicense != null && transportLicense.isNotEmpty) 'transportLicense': transportLicense,
          'cities': cities,
          'services': services,
          if (description != null && description.isNotEmpty) 'description': description,
          if (acceptTermsVersion != null) ...{'acceptTerms': true, 'termsVersion': acceptTermsVersion},
        });
        return OperatorProfile.fromJson(res.data);
      });

  Future<List<OperatorVehicle>> vehicles() => _guard(() async {
        final res = await _dio.get<List<dynamic>>('$_me/vehicles');
        return (res.data ?? const []).map(OperatorVehicle.fromJson).whereType<OperatorVehicle>().toList();
      });

  // ── Lignes ──

  Future<List<RecurringLine>> lines() => _guard(() async {
        final res = await _dio.get<List<dynamic>>('$_me/lines');
        return (res.data ?? const []).map(RecurringLine.fromJson).whereType<RecurringLine>().toList();
      });

  Future<void> createLine(LineDraft draft) => _guard(() => _dio.post<void>('$_me/lines', data: draft.toJson()));

  /// Points de rencontre actifs du catalogue (arrêts des lignes).
  Future<List<MeetingPoint>> meetingPoints() => _guard(() async {
        final res = await _dio.get<List<dynamic>>('/api/v1/meeting-points');
        return (res.data ?? const []).map(MeetingPoint.fromJson).whereType<MeetingPoint>().toList();
      });

  /// Remplace les arrêts d'une ligne (refusé dès qu'une place est vendue).
  Future<void> replaceStops(String lineId, List<StopDraft> stops) =>
      _guard(() => _dio.put<void>('$_me/lines/${_id(lineId)}/stops', data: {'stops': stops.map((s) => s.toJson()).toList()}));

  /// Départ ponctuel : publié et mis en vente aussitôt (le jour = `startDate` du brouillon).
  Future<void> publishDeparture(LineDraft draft) => _guard(() => _dio.post<void>('$_me/departures', data: draft.toOneOffJson()));

  Future<void> setLineStatus(String lineId, LineStatus status) => _guard(() => _dio.post<void>(
        '$_me/lines/${_id(lineId)}/${switch (status) { LineStatus.active => 'resume', LineStatus.paused => 'pause', LineStatus.closed => 'close' }}',
      ));

  /// Jour sans départ ([seats] null) ou à capacité réduite.
  Future<void> addException(String lineId, String date, {int? seats, String? reason}) => _guard(() => _dio.post<void>(
        '$_me/lines/${_id(lineId)}/exceptions',
        data: {'date': date, if (seats != null) 'seats': seats, if (reason != null && reason.isNotEmpty) 'reason': reason},
      ));

  Future<void> removeException(String lineId, String date) =>
      _guard(() => _dio.delete<void>('$_me/lines/${_id(lineId)}/exceptions/${_id(date)}'));

  // ── Départs de mes lignes ──

  Future<List<LineDeparture>> departures({String? lineId}) => _guard(() async {
        final res = await _dio.get<List<dynamic>>('$_me/departures', queryParameters: {if (lineId != null) 'lineId': lineId});
        return (res.data ?? const []).map(LineDeparture.fromJson).whereType<LineDeparture>().toList();
      });

  /// « J'assure ces départs jusqu'au … » : ils deviennent réservables.
  Future<int> confirmDepartures({required String until, String? lineId}) => _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>('$_me/departures/confirm', data: {'until': until, if (lineId != null) 'lineId': lineId});
        final n = res.data?['confirmed'];
        return n is num ? n.toInt() : 0;
      });

  /// Arrêter (« plus de places ») ou reprendre la vente d'un départ.
  Future<void> setDepartureClosed(String departureId, bool closed) =>
      _guard(() => _dio.patch<void>('$_me/departures/${_id(departureId)}', data: {'closed': closed}));

  // ── Départs que j'assure ──

  Future<List<Assignment>> assignments() => _guard(() async {
        final res = await _dio.get<List<dynamic>>('$_me/assignments');
        return (res.data ?? const []).map(Assignment.fromJson).whereType<Assignment>().toList();
      });

  Future<Manifest> manifest(String departureId) => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>('$_me/departures/${_id(departureId)}/manifest');
        return Manifest.fromJson(res.data);
      });

  /// « Je pars quand même » : départ garanti sans attendre le seuil.
  Future<void> guaranteeDeparture(String departureId) => _guard(() => _dio.post<void>('$_me/departures/${_id(departureId)}/guarantee'));

  Future<void> ready(String departureId) => _guard(() => _dio.post<void>('$_me/departures/${_id(departureId)}/ready'));

  /// Scan du QR d'un passager ; renvoie son prénom.
  Future<String?> checkIn(String departureId, String qrCode) => _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>('$_me/departures/${_id(departureId)}/checkin', data: {'qrCode': qrCode});
        final name = res.data?['firstName'];
        return name is String ? name : null;
      });

  Future<void> startDeparture(String departureId) => _guard(() => _dio.post<void>('$_me/departures/${_id(departureId)}/start'));

  Future<void> completeDeparture(String departureId) => _guard(() => _dio.post<void>('$_me/departures/${_id(departureId)}/complete'));

  /// Annule le départ : un chauffeur de secours prend le relais (protocole d'annulation).
  Future<void> cancelDeparture(String departureId, String reason) =>
      _guard(() => _dio.post<void>('$_me/departures/${_id(departureId)}/cancel', data: {'reason': reason}));

  // ── Réserves ──

  Future<List<LineBackup>> backups(String lineId) => _guard(() async {
        final res = await _dio.get<List<dynamic>>('$_me/lines/${_id(lineId)}/backups');
        return (res.data ?? const []).map(LineBackup.fromJson).whereType<LineBackup>().toList();
      });

  Future<void> inviteBackup(String lineId, String email, int rank) =>
      _guard(() => _dio.post<void>('$_me/lines/${_id(lineId)}/backups', data: {'email': email, 'rank': rank}));

  Future<void> removeBackup(String lineId, int rank) => _guard(() => _dio.delete<void>('$_me/lines/${_id(lineId)}/backups/$rank'));

  Future<List<BackupRole>> backupRoles() => _guard(() async {
        final res = await _dio.get<List<dynamic>>('$_me/backups');
        return (res.data ?? const []).map(BackupRole.fromJson).whereType<BackupRole>().toList();
      });

  Future<void> answerBackup(String backupId, {required bool accept, String? vehicleId}) => _guard(() => _dio.post<void>(
        '$_me/backups/${_id(backupId)}/${accept ? 'accept' : 'decline'}',
        data: accept ? {'vehicleId': vehicleId} : null,
      ));

  // ── Reprises ──

  Future<List<RescueOffer>> rescues() => _guard(() async {
        final res = await _dio.get<List<dynamic>>('$_me/rescues');
        return (res.data ?? const []).map(RescueOffer.fromJson).whereType<RescueOffer>().toList();
      });

  Future<void> answerRescue(String offerId, {required bool accept}) =>
      _guard(() => _dio.post<void>('$_me/rescues/${_id(offerId)}/${accept ? 'accept' : 'decline'}', data: accept ? <String, dynamic>{} : null));

  // ── Compte de versement et reversements (Stripe Connect) ──

  Future<PayoutAccount> payoutAccount() => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>('$_me/payout-account');
        return PayoutAccount.fromJson(res.data);
      });

  /// Lien (usage unique, quelques minutes) vers les pages de Stripe où ouvrir ou compléter le compte.
  Future<Uri> payoutOnboardingLink() => _payoutLink('onboarding-link');

  /// Lien vers l'espace Stripe de l'opérateur (versements reçus, IBAN).
  Future<Uri> payoutDashboardLink() => _payoutLink('dashboard-link');

  Future<Uri> _payoutLink(String kind) => _guard(() async {
        final res = await _dio.post<Map<String, dynamic>>('$_me/payout-account/$kind');
        final url = Uri.tryParse(res.data?['url'] is String ? res.data!['url'] as String : '');
        // Jamais autre chose qu'une page web sécurisée, quoi que réponde le serveur.
        if (url == null || url.scheme != 'https' || url.host.isEmpty) throw const FormatException('lien');
        return url;
      });

  Future<PayoutSummary> payouts() => _guard(() async {
        final res = await _dio.get<Map<String, dynamic>>('$_me/payouts');
        return PayoutSummary.fromJson(res.data);
      });

  // ── Annulations et pénalités ──

  Future<List<DriverCancellation>> cancellations() => _guard(() async {
        final res = await _dio.get<List<dynamic>>('$_me/cancellations');
        return (res.data ?? const []).map(DriverCancellation.fromJson).whereType<DriverCancellation>().toList();
      });

  Future<void> justify(String cancellationId, String justification) =>
      _guard(() => _dio.post<void>('$_me/cancellations/${_id(cancellationId)}/justify', data: {'justification': justification}));

  Future<void> contest(String penaltyId, String reason) =>
      _guard(() => _dio.post<void>('$_me/penalties/${_id(penaltyId)}/contest', data: {'reason': reason}));

  Future<T> _guard<T>(Future<T> Function() call) => guardOperatorCall(call);
}

final operatorServiceProvider = Provider<OperatorService>((ref) => OperatorService(ref.watch(dioProvider)));
