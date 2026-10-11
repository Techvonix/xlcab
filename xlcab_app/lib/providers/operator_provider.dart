import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/operator.dart';
import '../services/operator_service.dart';

export 'package:xlcab_core/providers/market_provider.dart';

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
