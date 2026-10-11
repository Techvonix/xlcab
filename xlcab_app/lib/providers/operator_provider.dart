import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/market.dart';
import '../models/operator.dart';
import '../services/market_service.dart';
import '../services/operator_service.dart';

// Données de l'espace opérateur. Les écrans les lisent ici et les tests
// widget les remplacent (overrideWith) au lieu de simuler le réseau.

final operatorProfileProvider = FutureProvider.autoDispose<OperatorProfile>((ref) => ref.watch(operatorServiceProvider).profile());

final operatorVehiclesProvider = FutureProvider.autoDispose<List<OperatorVehicle>>((ref) => ref.watch(operatorServiceProvider).vehicles());

final myLinesProvider = FutureProvider.autoDispose<List<RecurringLine>>((ref) => ref.watch(operatorServiceProvider).lines());

final lineDeparturesProvider = FutureProvider.autoDispose.family<List<LineDeparture>, String>(
  (ref, lineId) => ref.watch(operatorServiceProvider).departures(lineId: lineId),
);

final lineBackupsProvider = FutureProvider.autoDispose.family<List<LineBackup>, String>(
  (ref, lineId) => ref.watch(operatorServiceProvider).backups(lineId),
);

/// Départs réservés que j'assure (mes lignes et reprises).
final assignmentsProvider = FutureProvider.autoDispose<List<Assignment>>((ref) => ref.watch(operatorServiceProvider).assignments());

final manifestProvider = FutureProvider.autoDispose.family<Manifest, String>(
  (ref, departureId) => ref.watch(operatorServiceProvider).manifest(departureId),
);

/// Départs à reprendre en urgence (je suis réserve, ou alerte générale).
final rescueOffersProvider = FutureProvider.autoDispose<List<RescueOffer>>((ref) => ref.watch(operatorServiceProvider).rescues());

final backupRolesProvider = FutureProvider.autoDispose<List<BackupRole>>((ref) => ref.watch(operatorServiceProvider).backupRoles());

final cancellationsProvider = FutureProvider.autoDispose<List<DriverCancellation>>((ref) => ref.watch(operatorServiceProvider).cancellations());

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
