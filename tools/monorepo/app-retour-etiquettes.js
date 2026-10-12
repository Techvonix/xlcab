// « Réserver le retour » et étiquettes rapides de la note : applications et admin.
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
const num = (v) => `${v} is num ? (${v} as num).toDouble() : null`;

// ── Modèle commun : coordonnées et origine de la course ──
edit('packages/core/lib/models/trip_detail.dart', [
  ['    this.dispatchAt,\n    this.seatNumbers = const [],', '    this.dispatchAt,\n    this.seatNumbers = const [],\n    this.source,\n    this.originLat,\n    this.originLng,\n    this.destinationLat,\n    this.destinationLng,'],
  [
    '  final String id;\n  final TripStatus status;',
    "  /// instant | line | market (null : serveur plus ancien).\n  final String? source;\n\n  /// Réservation d'une place sur une ligne régulière.\n  bool get isLine => source == 'line';\n\n  /// Coordonnées des deux adresses : nécessaires pour proposer le trajet retour.\n  final double? originLat;\n  final double? originLng;\n  final double? destinationLat;\n  final double? destinationLng;\n\n  final String id;\n  final TripStatus status;",
  ],
  [
    "      id: json['id'] as String,\n",
    `      id: json['id'] as String,\n      source: json['source'] is String ? json['source'] as String : null,\n      originLat: ${num("origin['lat']")},\n      originLng: ${num("origin['lng']")},\n      destinationLat: ${num("destination['lat']")},\n      destinationLng: ${num("destination['lng']")},\n`,
  ],
]);

// ── Service : étiquettes de la note ──
edit('packages/core/lib/services/feedback_service.dart', [
  [
    "  Future<void> rate(String tripId, int stars, {String? comment}) => _guard(() => _dio.post<void>(\n        '${_trip(tripId)}/rating',\n        data: {'stars': stars, if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim()},\n      ));",
    "  Future<void> rate(String tripId, int stars, {String? comment, List<String> tags = const []}) => _guard(() => _dio.post<void>(\n        '${_trip(tripId)}/rating',\n        data: {\n          'stars': stars,\n          if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim(),\n          // Étiquettes rapides (liste fermée côté serveur).\n          if (tags.isNotEmpty) 'tags': tags,\n        },\n      ));",
  ],
]);

// ── Note : étiquettes proposées à partir de 4 étoiles ──
edit('apps/passenger/lib/screens/booking/driver_profile_screen.dart', [
  ['  int _stars = 0;\n  bool _busy = false;', "  int _stars = 0;\n\n  /// Étiquettes rapides choisies (codes du serveur).\n  final Set<String> _tags = {};\n  bool _busy = false;"],
  [
    "await ref.read(feedbackServiceProvider).rate(widget.tripId, _stars, comment: _comment.text);",
    "await ref.read(feedbackServiceProvider).rate(\n            widget.tripId,\n            _stars,\n            comment: _comment.text,\n            // Les étiquettes disent ce qui a plu : sans objet pour une note basse.\n            tags: _stars >= 4 ? _tags.toList() : const [],\n          );",
  ],
  [
    "              const SizedBox(height: AppSpacing.sm),\n              TextField(\n                controller: _comment,",
    "              if (_stars >= 4) ...[\n                const SizedBox(height: AppSpacing.sm),\n                Text(l10n.etqTitre, style: AppTypography.body.copyWith(color: onSurface)),\n                const SizedBox(height: AppSpacing.xs),\n                Wrap(\n                  spacing: AppSpacing.sm,\n                  runSpacing: AppSpacing.xs,\n                  children: [\n                    for (final (code, label) in ratingTags())\n                      FilterChip(\n                        label: Text(label),\n                        selected: _tags.contains(code),\n                        onSelected: _busy ? null : (on) => setState(() => on ? _tags.add(code) : _tags.remove(code)),\n                      ),\n                  ],\n                ),\n              ],\n              const SizedBox(height: AppSpacing.sm),\n              TextField(\n                controller: _comment,",
  ],
  [
    "class _RatingForm extends ConsumerStatefulWidget {",
    "/// Étiquettes rapides d'une note : code du serveur et libellé affiché\n/// (accesseur : les libellés suivent la langue courante).\nList<(String, String)> ratingTags() => [\n      ('conduite_sure', l10n.etqConduiteSure),\n      ('ponctuel', l10n.etqPonctuel),\n      ('vehicule_propre', l10n.etqVehiculePropre),\n      ('accueil', l10n.etqAccueil),\n      ('colis_soigne', l10n.etqColisSoigne),\n    ];\n\nclass _RatingForm extends ConsumerStatefulWidget {",
  ],
]);

// ── Récapitulatif : bouton « Réserver le retour » ──
edit('apps/passenger/lib/screens/booking/confirmation_screen.dart', [
  [
    "        if (trip.isCancellable)\n          Padding(",
    "        // Trajet retour : mêmes adresses inversées, sur l'écran qui correspond\n        // (lignes régulières pour une place de ligne, réservation classique sinon).\n        if (returnTripOf(trip) case final back?)\n          Padding(\n            padding: const EdgeInsets.only(bottom: AppSpacing.sm),\n            child: OutlinedButton.icon(\n              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(AppSpacing.buttonHeight)),\n              icon: const Icon(Icons.u_turn_left),\n              label: Text(l10n.retReserverLeRetour),\n              onPressed: () => trip.isLine\n                  ? context.push(AppRoutes.lineSearch, extra: back)\n                  : context.push(\n                      trip.shuttleType == null ? AppRoutes.passengerBooking : '${AppRoutes.passengerBooking}?type=${trip.shuttleType!.apiValue}',\n                      extra: back,\n                    ),\n            ),\n          ),\n        if (trip.isCancellable)\n          Padding(",
  ],
  [/^(import 'package:xlcab_core\/routes\.dart';)$/m, "$1\nimport '../../models/return_trip.dart';"],
]);

// ── Routeur : la demande de retour est transmise aux deux écrans ──
edit('apps/passenger/lib/router.dart', [
  ["          initialShuttleType: ShuttleType.fromApi(state.uri.queryParameters['type']),\n", "          initialShuttleType: ShuttleType.fromApi(state.uri.queryParameters['type']),\n          initialReturn: state.extra is ReturnTripRequest ? state.extra as ReturnTripRequest : null,\n"],
  [
    '      GoRoute(path: AppRoutes.lineSearch, builder: (context, state) => const LineSearchScreen()),',
    '      GoRoute(\n        path: AppRoutes.lineSearch,\n        builder: (context, state) => LineSearchScreen(initial: state.extra is ReturnTripRequest ? state.extra as ReturnTripRequest : null),\n      ),',
  ],
  ["import 'screens/booking/confirmation_screen.dart';", "import 'models/return_trip.dart';\nimport 'screens/booking/confirmation_screen.dart';"],
]);

edit('apps/passenger/lib/screens/booking/passenger_booking_screen.dart', [
  [
    "  const PassengerBookingScreen({super.key, this.initialShuttleType});\n",
    "  const PassengerBookingScreen({super.key, this.initialShuttleType, this.initialReturn});\n\n  /// « Réserver le retour » : adresses (déjà inversées) et passagers préremplis.\n  final ReturnTripRequest? initialReturn;\n",
  ],
  [
    "    final initial = widget.initialShuttleType;\n    if (initial != null) {\n      // Un provider ne peut pas être modifié pendant la construction de\n      // l'arbre : on applique la présélection juste après la 1re image.\n      WidgetsBinding.instance.addPostFrameCallback((_) {\n        if (mounted) ref.read(bookingFormProvider.notifier).setShuttleType(initial);\n      });\n    }",
    "    final initial = widget.initialShuttleType;\n    final back = widget.initialReturn;\n    if (initial != null || back != null) {\n      // Un provider ne peut pas être modifié pendant la construction de\n      // l'arbre : on applique la présélection juste après la 1re image.\n      WidgetsBinding.instance.addPostFrameCallback((_) {\n        if (!mounted) return;\n        final form = ref.read(bookingFormProvider.notifier);\n        if (initial != null) form.setShuttleType(initial);\n        if (back != null) {\n          form.setOrigin(back.origin);\n          form.setDestination(back.destination);\n          form.setSeats(back.seats);\n        }\n      });\n    }",
  ],
  [/^(import 'package:xlcab_core\/routes\.dart';)$/m, "$1\nimport '../../models/return_trip.dart';"],
]);

edit('apps/passenger/lib/screens/market/line_search_screen.dart', [
  ["  const LineSearchScreen({super.key});\n", "  const LineSearchScreen({super.key, this.initial});\n\n  /// « Réserver le retour » : adresses (déjà inversées) et places préremplies.\n  final ReturnTripRequest? initial;\n"],
  ["  Place? _from;\n  Place? _to;\n  DateTime? _date;\n  int _seats = 1;", "  late Place? _from = widget.initial?.origin;\n  late Place? _to = widget.initial?.destination;\n  DateTime? _date;\n  late int _seats = (widget.initial?.seats ?? 1).clamp(1, 20);"],
  ["import 'seat_picker.dart';", "import '../../models/return_trip.dart';\nimport 'seat_picker.dart';"],
]);

// ── Double de test du service d'avis (signature de rate) ──
edit('apps/passenger/test/screens/driver_profile_screen_test.dart', [
  ["  Future<void> rate(String tripId, int stars, {String? comment}) async {\n    ratings.add((stars, comment));", "  Future<void> rate(String tripId, int stars, {String? comment, List<String> tags = const []}) async {\n    ratings.add((stars, comment));\n    ratedTags = tags;"],
  ["  final List<(int, String?)> ratings = [];", "  final List<(int, String?)> ratings = [];\n  List<String> ratedTags = const [];"],
]);

// ── Admin : étiquettes affichées avec la note ──
edit('xlcab_admin/src/lib/types.ts', [['  comment: string | null;', '  comment: string | null;\n  /** Étiquettes rapides choisies par le passager (codes). */\n  tags?: string[];']]);
edit('xlcab_admin/src/features/ratings/RatingsPage.tsx', [
  [
    '        {rating.comment ? (',
    '        {rating.tags && rating.tags.length > 0 ? (\n          <ul className="mt-3 flex flex-wrap gap-2" aria-label={t(\'etiquettesDeLaNote\')}>\n            {rating.tags.map((tag) => (\n              <li key={tag} className="rounded-full border border-line px-3 py-1 text-sm">{ratingTagLabel(tag)}</li>\n            ))}\n          </ul>\n        ) : null}\n        {rating.comment ? (',
  ],
]);
console.log('ok');
