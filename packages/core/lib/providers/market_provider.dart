import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/market.dart';
import '../services/market_service.dart';

// Bourse de transport : fil des demandes et propositions (opérateur),
// demandes et devis (client), sélecteurs de date et d'heure injectables.

final marketFeedProvider = FutureProvider.autoDispose<List<MarketFeedItem>>((ref) => ref.watch(marketServiceProvider).feed());

final myMarketOffersProvider = FutureProvider.autoDispose<List<MarketOffer>>((ref) => ref.watch(marketServiceProvider).myOffers());

final offerMessagesProvider = FutureProvider.autoDispose.family<List<OfferMessage>, String>(
  (ref, offerId) => ref.watch(marketServiceProvider).messages(offerId),
);

// ── Côté client (étape 4) ──

final myRequestsProvider = FutureProvider.autoDispose<List<MarketRequest>>((ref) => ref.watch(marketServiceProvider).myRequests());

final marketRequestProvider = FutureProvider.autoDispose.family<MarketRequest, String>(
  (ref, requestId) => ref.watch(marketServiceProvider).request(requestId),
);

final requestOffersProvider = FutureProvider.autoDispose.family<List<MarketOffer>, String>(
  (ref, requestId) => ref.watch(marketServiceProvider).offersFor(requestId),
);

/// Départs de lignes régulières qui répondent déjà à une demande.
final requestLinesProvider = FutureProvider.autoDispose.family<List<LineSearchResult>, String>(
  (ref, requestId) => ref.watch(marketServiceProvider).lineMatches(requestId),
);

/// Choix d'une heure (sélecteur natif ; injectable pour les tests).
final timePickerProvider = Provider<Future<TimeOfDay?> Function(BuildContext, TimeOfDay initial)>(
  (ref) => (context, initial) => showTimePicker(context: context, initialTime: initial),
);

/// Choix d'une date entre [first] et [last] (sélecteur natif ; injectable pour les tests).
final datePickerProvider = Provider<Future<DateTime?> Function(BuildContext, DateTime first, DateTime last, DateTime initial)>(
  (ref) => (context, first, last, initial) => showDatePicker(context: context, firstDate: first, lastDate: last, initialDate: initial),
);
