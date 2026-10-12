// Choix du siège : modèles et service communs, feuille de réservation, récapitulatif, liste du chauffeur.
const fs = require('fs');
const R = 'C:/xlcab/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    const ok = typeof from === 'string' ? s.includes(from) : from.test(s);
    if (!ok) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, to);
  }
  fs.writeFileSync(R + file, s);
}
const seatList = "(p['seatNumbers'] is List ? (p['seatNumbers'] as List).whereType<num>().map((n) => n.toInt()).toList() : const <int>[])";

fs.appendFileSync(
  R + 'packages/core/lib/models/market.dart',
  `
/// Plan des sièges d'un départ de ligne : numéros de 1 à [seatsTotal], dont
/// ceux déjà pris. Aucune identité : on ne sait pas qui occupe quoi.
class SeatMap {
  const SeatMap({required this.seatsTotal, required this.taken, required this.choosable});

  final int seatsTotal;
  final Set<int> taken;

  /// false pour un départ privatisé (prix au véhicule) : pas de choix de siège.
  final bool choosable;

  factory SeatMap.fromJson(Map<String, dynamic>? json) {
    final total = json?['seatsTotal'];
    final taken = json?['taken'];
    if (total is! int || taken is! List) throw const FormatException('plan des sièges');
    return SeatMap(seatsTotal: total, taken: taken.whereType<num>().map((n) => n.toInt()).toSet(), choosable: json?['choosable'] == true);
  }
}
`,
);

edit('packages/core/lib/models/operator.dart', [
  ['    this.firstName,\n    this.phone,\n    this.notes,\n  });\n\n  final String tripId;\n  final String? firstName;', '    this.firstName,\n    this.phone,\n    this.notes,\n    this.seatNumbers = const [],\n  });\n\n  final String tripId;\n  final String? firstName;'],
  ['  final int seats;\n  final int childSeats;\n  final bool checkedIn;\n  final bool started;\n  final String? notes;\n}', "  final int seats;\n\n  /// Sièges numérotés de la réservation (ligne vendue à la place), sinon vide.\n  final List<int> seatNumbers;\n  final int childSeats;\n  final bool checkedIn;\n  final bool started;\n  final String? notes;\n}"],
  ["                    seats: _int(p['seats']) ?? 0,\n                    childSeats:", `                    seats: _int(p['seats']) ?? 0,\n                    seatNumbers: ${seatList},\n                    childSeats:`],
]);

edit('packages/core/lib/models/trip_detail.dart', [
  ['    this.dispatchAt,\n    this.invoiceId,', '    this.dispatchAt,\n    this.seatNumbers = const [],\n    this.invoiceId,'],
  ['  final int? seats;\n', "  final int? seats;\n\n  /// Sièges numérotés (ligne régulière vendue à la place), sinon vide.\n  final List<int> seatNumbers;\n"],
  [
    "      seats: booking is Map && booking['seats'] is int ? booking['seats'] as int : null,\n",
    "      seats: booking is Map && booking['seats'] is int ? booking['seats'] as int : null,\n      seatNumbers: booking is Map && booking['seatNumbers'] is List\n          ? (booking['seatNumbers'] as List).whereType<num>().map((n) => n.toInt()).toList()\n          : const [],\n",
  ],
]);

edit('packages/core/lib/services/market_service.dart', [
  [
    "  Future<String> bookLine(String departureId, {required int seats, int childSeats = 0, int luggage = 0, String? notes}) =>",
    "  Future<String> bookLine(\n    String departureId, {\n    required int seats,\n    int childSeats = 0,\n    int luggage = 0,\n    String? notes,\n    List<int>? seatNumbers,\n  }) =>",
  ],
  ["          if (notes != null && notes.isNotEmpty) 'notes': notes,\n        });\n        final id = res.data?['tripId'];", "          if (notes != null && notes.isNotEmpty) 'notes': notes,\n          // Sièges choisis ; absents : le serveur attribue les premiers libres.\n          if (seatNumbers != null && seatNumbers.isNotEmpty) 'seatNumbers': seatNumbers,\n        });\n        final id = res.data?['tripId'];"],
  [
    "  // ── Messagerie (client ou opérateur) ──",
    "  /// Sièges déjà pris sur un départ (choix du siège à la réservation).\n  Future<SeatMap> seatMap(String departureId) => guardOperatorCall(() async {\n        final res = await _dio.get<Map<String, dynamic>>('/api/v1/lines/bookings/seats/\${Uri.encodeComponent(departureId)}');\n        return SeatMap.fromJson(res.data);\n      });\n\n  // ── Messagerie (client ou opérateur) ──",
  ],
]);

edit('apps/passenger/lib/screens/booking/confirmation_screen.dart', [
  [
    "          if (trip.seats != null) line(Icons.groups_outlined, l10n.passager(trip.seats!, trip.seats! > 1 ? 's' : '')),\n",
    "          if (trip.seats != null) line(Icons.groups_outlined, l10n.passager(trip.seats!, trip.seats! > 1 ? 's' : '')),\n          if (trip.seatNumbers.isNotEmpty)\n            line(Icons.event_seat_outlined, l10n.sgNumeros(trip.seatNumbers.length, trip.seatNumbers.join(', '))),\n",
  ],
]);

edit('apps/driver/lib/screens/operator/departure_screen.dart', [
  ["      l10n.opPlaces(p.seats),\n", "      l10n.opPlaces(p.seats),\n      if (p.seatNumbers.isNotEmpty) l10n.sgNumeros(p.seatNumbers.length, p.seatNumbers.join(', ')),\n"],
]);

edit('apps/passenger/lib/screens/market/line_search_screen.dart', [
  ["import 'package:xlcab_core/l10n/l10n.dart';", "import 'package:xlcab_core/l10n/l10n.dart';\n\nimport 'seat_picker.dart';"],
  ['  int _luggage = 0;\n  final _notes = TextEditingController();', "  int _luggage = 0;\n\n  /// Sièges choisis, dans l'ordre des touchers. Vide = attribution automatique.\n  List<int> _picked = [];\n  final _notes = TextEditingController();"],
  ["            notes: _notes.text.trim(),\n          );", "            notes: _notes.text.trim(),\n            seatNumbers: _picked.isEmpty ? null : _picked,\n          );"],
  [
    "    } on ApiException catch (e) {\n      if (mounted) setState(() => _error = e.message);\n    } finally {\n      if (mounted) setState(() => _busy = false);\n    }\n  }",
    "    } on ApiException catch (e) {\n      // Siège pris entre-temps : le plan est rechargé pour montrer les sièges restants.\n      ref.invalidate(seatMapProvider(widget.result.departureId));\n      if (mounted) {\n        setState(() {\n          _error = e.message;\n          _picked = [];\n        });\n      }\n    } finally {\n      if (mounted) setState(() => _busy = false);\n    }\n  }",
  ],
  [
    "    final total = r.perSeat ? r.unitPriceCents * _seats : r.totalPriceCents;\n",
    "    final total = r.perSeat ? r.unitPriceCents * _seats : r.totalPriceCents;\n    // Choix facultatif, mais jamais partiel : aucun siège, ou un par place.\n    final missing = _picked.isEmpty ? 0 : _seats - _picked.length;\n",
  ],
  [
    "onChanged: (v) => setState(() => _seats = v)),",
    "onChanged: (v) => setState(() {\n            _seats = v;\n            if (_picked.length > v) _picked = _picked.sublist(_picked.length - v);\n          })),",
  ],
  [
    "          SeatStepper(label: l10n.mkcBagages,",
    "          if (r.perSeat)\n            SeatPicker(\n              departureId: r.departureId,\n              count: _seats,\n              selected: _picked,\n              onChanged: (seats) => setState(() => _picked = seats),\n            ),\n          SeatStepper(label: l10n.mkcBagages,",
  ],
  [
    "          PrimaryButton(label: l10n.mkcConfirmerPrix(formatPrice(total, locale: locale)), onPressed: _busy ? null : _book),",
    "          if (missing > 0) Text(l10n.sgReste(missing), style: AppTypography.caption),\n          PrimaryButton(label: l10n.mkcConfirmerPrix(formatPrice(total, locale: locale)), onPressed: _busy || missing > 0 ? null : _book),",
  ],
]);
console.log('ok');
