import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/market.dart';
import '../models/parcel.dart';
import '../models/payment.dart';
import '../models/place.dart';
import 'api_service.dart';

/// Bourse de transport (xlcab_backend/src/market) : fil des demandes et
/// propositions côté opérateur, messagerie avant confirmation.
class MarketService {
  MarketService(this._dio);

  final Dio _dio;
  static const _base = '/api/v1/market';
  String _id(String id) => Uri.encodeComponent(id);

  // ── Côté opérateur ──

  Future<List<MarketFeedItem>> feed() => guardOperatorCall(() async {
        final res = await _dio.get<List<dynamic>>('$_base/feed');
        return (res.data ?? const []).map(MarketFeedItem.fromJson).whereType<MarketFeedItem>().toList();
      });

  Future<MarketOffer?> propose(
    String requestId, {
    required String vehicleId,
    required int priceCents,
    DateTime? pickupAt,
    bool includesReturn = false,
    String? conditions,
  }) =>
      guardOperatorCall(() async {
        final res = await _dio.post<Map<String, dynamic>>('$_base/requests/${_id(requestId)}/offers', data: {
          'vehicleId': vehicleId,
          'priceCents': priceCents,
          if (pickupAt != null) 'pickupAt': pickupAt.toUtc().toIso8601String(),
          'includesReturn': includesReturn,
          if (conditions != null && conditions.isNotEmpty) 'conditions': conditions,
        });
        return MarketOffer.fromJson(res.data);
      });

  Future<List<MarketOffer>> myOffers() => guardOperatorCall(() async {
        final res = await _dio.get<List<dynamic>>('$_base/my-offers');
        return (res.data ?? const []).map(MarketOffer.fromJson).whereType<MarketOffer>().toList();
      });

  Future<void> withdraw(String offerId) => guardOperatorCall(() => _dio.post<void>('$_base/offers/${_id(offerId)}/withdraw'));

  /// Le client a choisi cette proposition : je confirme ma disponibilité (la course est créée).
  Future<void> confirm(String offerId) => guardOperatorCall(() => _dio.post<void>('$_base/offers/${_id(offerId)}/confirm'));

  Future<void> decline(String offerId) => guardOperatorCall(() => _dio.post<void>('$_base/offers/${_id(offerId)}/decline'));

  // ── Côté client ──

  /// Publie une demande ; renvoie son identifiant.
  Future<String> createRequest(RequestDraft draft) => guardOperatorCall(() async {
        final res = await _dio.post<Map<String, dynamic>>('$_base/requests', data: draft.toJson());
        final id = res.data?['id'];
        if (id is! String) throw const FormatException('Demande sans identifiant');
        return id;
      });

  Future<List<MarketRequest>> myRequests() => guardOperatorCall(() async {
        final res = await _dio.get<List<dynamic>>('$_base/requests');
        return (res.data ?? const []).map(MarketRequest.fromJson).whereType<MarketRequest>().toList();
      });

  Future<MarketRequest> request(String requestId) => guardOperatorCall(() async {
        final res = await _dio.get<Map<String, dynamic>>('$_base/requests/${_id(requestId)}');
        final r = MarketRequest.fromJson(res.data);
        if (r == null) throw const FormatException('Demande incomplète');
        return r;
      });

  Future<List<MarketOffer>> offersFor(String requestId) => guardOperatorCall(() async {
        final res = await _dio.get<List<dynamic>>('$_base/requests/${_id(requestId)}/offers');
        return (res.data ?? const []).map(MarketOffer.fromJson).whereType<MarketOffer>().toList();
      });

  /// Départs de lignes régulières qui répondent déjà à la demande.
  Future<List<LineSearchResult>> lineMatches(String requestId) => guardOperatorCall(() async {
        final res = await _dio.get<List<dynamic>>('$_base/requests/${_id(requestId)}/lines');
        return (res.data ?? const []).map(LineSearchResult.fromJson).whereType<LineSearchResult>().toList();
      });

  /// Je choisis cette proposition : l'opérateur doit encore la reconfirmer.
  /// Choisit une proposition. Paiement en ligne activé : renvoie la feuille de
  /// paiement de l'empreinte de carte (rappelable : la même tant qu'elle est en cours).
  Future<OfferChoice> acceptOffer(String offerId) => guardOperatorCall(() async {
        final res = await _dio.post<Map<String, dynamic>>('$_base/offers/${_id(offerId)}/accept');
        return OfferChoice.fromJson(res.data);
      });

  /// Après la feuille de paiement : la carte est autorisée, le choix part chez l'opérateur.
  Future<void> authorizeOffer(String offerId) => guardOperatorCall(() => _dio.post<void>('$_base/offers/${_id(offerId)}/authorize'));

  Future<void> cancelRequest(String requestId) => guardOperatorCall(() => _dio.post<void>('$_base/requests/${_id(requestId)}/cancel'));

  // ── Lignes régulières (recherche et réservation) ──

  Future<List<LineSearchResult>> searchLines({
    required Place from,
    required Place to,
    required String date,
    required int seats,
    int luggage = 0,
    bool parcels = false,
  }) =>
      guardOperatorCall(() async {
        final res = await _dio.get<List<dynamic>>('/api/v1/lines/search', queryParameters: {
          // Recherche « colis » : départs qui ont encore un emplacement, au prix du colis.
          if (parcels) 'parcels': 'true',
          'fromLat': from.lat,
          'fromLng': from.lng,
          'toLat': to.lat,
          'toLng': to.lng,
          'date': date,
          'seats': seats,
          'luggage': luggage,
        });
        return (res.data ?? const []).map(LineSearchResult.fromJson).whereType<LineSearchResult>().toList();
      });

  /// Réserve des places sur un départ ; renvoie la course créée et, si le
  /// paiement en ligne est activé, sa feuille de paiement.
  Future<LineBooking> bookLine(
    String departureId, {
    required int seats,
    int childSeats = 0,
    int luggage = 0,
    String? notes,
    List<int>? seatNumbers,
    String? boardStopId,
    String? alightStopId,
  }) =>
      guardOperatorCall(() async {
        final res = await _dio.post<Map<String, dynamic>>('/api/v1/lines/bookings', data: {
          'departureId': departureId,
          'seats': seats,
          'childSeats': childSeats,
          'luggage': luggage,
          if (notes != null && notes.isNotEmpty) 'notes': notes,
          // Sièges choisis ; absents : le serveur attribue les premiers libres.
          if (seatNumbers != null && seatNumbers.isNotEmpty) 'seatNumbers': seatNumbers,
          // Tronçon : arrêts de montée / descente (absents = extrémités de la ligne).
          if (boardStopId != null) 'boardStopId': boardStopId,
          if (alightStopId != null) 'alightStopId': alightStopId,
        });
        return LineBooking.fromJson(res.data);
      });

  /// Confie un colis à un départ de ligne : remis au chauffeur au point de montée.
  Future<LineParcelBooking> bookLineParcel(LineSearchResult departure, ParcelRequest parcel) => guardOperatorCall(() async {
        final res = await _dio.post<Map<String, dynamic>>('/api/v1/lines/bookings/parcel', data: {
          'departureId': departure.departureId,
          if (departure.board?.stopId != null) 'boardStopId': departure.board!.stopId,
          if (departure.alight?.stopId != null) 'alightStopId': departure.alight!.stopId,
          'description': parcel.description.trim(),
          'isFragile': parcel.isFragile,
          'weightKg': parcel.weightKg,
          'lengthCm': parcel.lengthCm,
          'widthCm': parcel.widthCm,
          'heightCm': parcel.heightCm,
          'recipientName': parcel.recipientName.trim(),
          'recipientPhone': parcel.recipientPhone,
          'prohibitedItemsDeclined': true,
        });
        return LineParcelBooking.fromJson(res.data);
      });

  /// Sièges déjà pris sur un départ (choix du siège à la réservation).
  Future<SeatMap> seatMap(String departureId) => guardOperatorCall(() async {
        final res = await _dio.get<Map<String, dynamic>>('/api/v1/lines/bookings/seats/${Uri.encodeComponent(departureId)}');
        return SeatMap.fromJson(res.data);
      });

  // ── Messagerie (client ou opérateur) ──

  Future<List<OfferMessage>> messages(String offerId) => guardOperatorCall(() async {
        final res = await _dio.get<List<dynamic>>('$_base/offers/${_id(offerId)}/messages');
        return (res.data ?? const []).map(OfferMessage.fromJson).whereType<OfferMessage>().toList();
      });

  Future<void> sendMessage(String offerId, String body) =>
      guardOperatorCall(() => _dio.post<void>('$_base/offers/${_id(offerId)}/messages', data: {'body': body}));
}

final marketServiceProvider = Provider<MarketService>((ref) => MarketService(ref.watch(dioProvider)));
