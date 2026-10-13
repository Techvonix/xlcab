// Appli passager : paiement en ligne des lignes (feuille Stripe à la réservation)
// et de la bourse (empreinte de carte au choix d'une proposition).
const fs = require('fs');
const R = 'C:/xlcab/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    if (!s.includes(from)) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, () => to);
  }
  fs.writeFileSync(R + file, s);
}

// ── Modèles ─────────────────────────────────────────────────────────────
edit('packages/core/lib/models/payment.dart', [
  [
    "  final String tripId;\n  final String paymentIntentClientSecret;",
    "  /// Course payée. Vide pour une empreinte de carte de la bourse : la course\n  /// n'existe qu'une fois la proposition confirmée par l'opérateur.\n  final String tripId;\n  final String paymentIntentClientSecret;",
  ],
  [
    "/// Issue de la feuille de paiement.",
    `/// Réservation d'une place de ligne. [payment] est présent quand le paiement
/// en ligne est activé : la réservation n'est confirmée qu'une fois payée.
class LineBooking {
  const LineBooking({required this.tripId, this.payment});

  final String tripId;
  final PaymentSheetParams? payment;

  factory LineBooking.fromJson(Object? data) {
    if (data is! Map || data['tripId'] is! String) throw const FormatException('Réservation sans identifiant');
    return LineBooking(tripId: data['tripId'] as String, payment: data['payment'] == null ? null : PaymentSheetParams.fromJson(data['payment']));
  }
}

/// Choix d'une proposition de la bourse. [payment] est présent quand le
/// paiement en ligne est activé : la carte doit être autorisée (empreinte,
/// sans débit) pour que le choix soit transmis à l'opérateur.
class OfferChoice {
  const OfferChoice({this.payment});

  final PaymentSheetParams? payment;

  bool get needsCard => payment != null;

  factory OfferChoice.fromJson(Object? data) {
    final p = data is Map ? data['payment'] : null;
    if (p == null) return const OfferChoice();
    if (p is! Map || p['paymentIntentClientSecret'] is! String || p['customerId'] is! String || p['ephemeralKeySecret'] is! String || p['amountCents'] is! int) {
      throw const FormatException('Paramètres de paiement incomplets');
    }
    return OfferChoice(
      payment: PaymentSheetParams(
        tripId: '',
        paymentIntentClientSecret: p['paymentIntentClientSecret'] as String,
        customerId: p['customerId'] as String,
        ephemeralKeySecret: p['ephemeralKeySecret'] as String,
        amountCents: p['amountCents'] as int,
        currency: p['currency'] is String ? p['currency'] as String : 'EUR',
      ),
    );
  }
}

/// Issue de la feuille de paiement.`,
  ],
]);

edit('packages/core/lib/models/market.dart', [
  [
    "enum OfferStatus {\n  pending,\n",
    "enum OfferStatus {\n  pending,\n  /// Choisie par le client, carte à valider (empreinte) : l'opérateur n'est pas encore prévenu.\n  authorizing,\n",
  ],
]);

// ── Service ─────────────────────────────────────────────────────────────
edit('packages/core/lib/services/market_service.dart', [
  [
    "  Future<void> acceptOffer(String offerId) => guardOperatorCall(() => _dio.post<void>('$_base/offers/${_id(offerId)}/accept'));",
    "  /// Choisit une proposition. Paiement en ligne activé : renvoie la feuille de\n  /// paiement de l'empreinte de carte (rappelable : la même tant qu'elle est en cours).\n  Future<OfferChoice> acceptOffer(String offerId) => guardOperatorCall(() async {\n        final res = await _dio.post<Map<String, dynamic>>('$_base/offers/${_id(offerId)}/accept');\n        return OfferChoice.fromJson(res.data);\n      });\n\n  /// Après la feuille de paiement : la carte est autorisée, le choix part chez l'opérateur.\n  Future<void> authorizeOffer(String offerId) => guardOperatorCall(() => _dio.post<void>('$_base/offers/${_id(offerId)}/authorize'));",
  ],
  ["  /// Réserve des places sur un départ ; renvoie l'identifiant de la course créée.\n  Future<String> bookLine(", "  /// Réserve des places sur un départ ; renvoie la course créée et, si le\n  /// paiement en ligne est activé, sa feuille de paiement.\n  Future<LineBooking> bookLine("],
  [
    "        final id = res.data?['tripId'];\n        if (id is! String) throw const FormatException('Réservation sans identifiant');\n        return id;",
    "        return LineBooking.fromJson(res.data);",
  ],
]);
{
  const f = R + 'packages/core/lib/services/market_service.dart';
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes("models/payment.dart")) {
    const at = s.indexOf("import '../models/market.dart';");
    if (at < 0) {
      const alt = s.indexOf("import 'package:xlcab_core/models/market.dart';");
      if (alt < 0) throw new Error('import market introuvable');
      s = s.replace("import 'package:xlcab_core/models/market.dart';", "import 'package:xlcab_core/models/market.dart';\nimport 'package:xlcab_core/models/payment.dart';");
    } else {
      s = s.replace("import '../models/market.dart';", "import '../models/market.dart';\nimport '../models/payment.dart';");
    }
  }
  fs.writeFileSync(f, s);
}

// ── Réservation d'une ligne ─────────────────────────────────────────────
edit('apps/passenger/lib/screens/market/line_search_screen.dart', [
  [
    "      final tripId = await ref.read(marketServiceProvider).bookLine(",
    "      final booking = await ref.read(marketServiceProvider).bookLine(",
  ],
  [
    "      ref.invalidate(recentTripsProvider);\n      navigator.pop();",
    "      final tripId = booking.tripId;\n      // Paiement en ligne : la réservation n'est confirmée qu'une fois payée.\n      if (booking.payment != null && !await _pay(tripId, booking.payment!)) return;\n      ref.invalidate(recentTripsProvider);\n      navigator.pop();",
  ],
  [
    "  @override\n  Widget build(BuildContext context) {\n",
    `  /// Feuille de paiement Stripe. Abandon ou refus : la réservation est
  /// annulée tout de suite (places rendues), rien n'est débité.
  Future<bool> _pay(String tripId, PaymentSheetParams params) async {
    final presenter = ref.read(paymentSheetPresenterProvider);
    final result = presenter.isAvailable
        ? await presenter.present(params)
        : PaymentSheetResult(PaymentSheetOutcome.failed, l10n.paiementMomentanementIndisponibleReessayezPlus);
    if (result.outcome == PaymentSheetOutcome.completed) {
      try {
        await ref.read(paymentServiceProvider).confirm(tripId);
      } on ApiException {
        // Le serveur confirmera seul à la notification de Stripe.
      }
      return true;
    }
    try {
      await ref.read(tripServiceProvider).cancel(tripId, 'Paiement non finalisé');
    } on ApiException {
      // Sans paiement, la réservation tombe d'elle-même au bout de 30 minutes.
    }
    ref.invalidate(seatMapProvider(widget.result.departureId));
    if (mounted) {
      setState(() {
        _error = result.outcome == PaymentSheetOutcome.canceled ? l10n.mkcPaiementAbandonne : (result.message ?? l10n.paiementRefuse);
        _picked = [];
      });
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
`,
  ],
]);

// ── Choix d'une proposition ─────────────────────────────────────────────
edit('apps/passenger/lib/screens/market/request_detail_screen.dart', [
  [
    "    if (ok) await _do(() => ref.read(marketServiceProvider).acceptOffer(offer.id), success: l10n.mkcPropositionChoisie);\n  }",
    `    if (ok) await _accept(offer);
  }

  /// Choisit la proposition. Paiement en ligne : la carte est d'abord
  /// autorisée (empreinte, sans débit) ; l'opérateur n'est prévenu qu'ensuite
  /// et le débit n'a lieu qu'à sa confirmation.
  Future<void> _accept(MarketOffer offer) async {
    if (_busy) return;
    setState(() => _busy = true);
    final market = ref.read(marketServiceProvider);
    String message;
    try {
      final choice = await market.acceptOffer(offer.id);
      if (!choice.needsCard) {
        message = l10n.mkcPropositionChoisie;
      } else {
        final presenter = ref.read(paymentSheetPresenterProvider);
        final result = presenter.isAvailable
            ? await presenter.present(choice.payment!)
            : PaymentSheetResult(PaymentSheetOutcome.failed, l10n.paiementMomentanementIndisponibleReessayezPlus);
        if (result.outcome == PaymentSheetOutcome.completed) {
          await market.authorizeOffer(offer.id);
          message = l10n.mkcCarteAutorisee;
        } else {
          message = result.outcome == PaymentSheetOutcome.canceled ? l10n.mkcCarteNonValidee : (result.message ?? l10n.carteRefusee);
        }
      }
    } on ApiException catch (e) {
      message = e.message;
    }
    if (!mounted) return;
    setState(() => _busy = false);
    showToast(context, message);
    _refresh();
  }`,
  ],
  [
    "if (_open.contains(r.status) || r.status == RequestStatus.accepted) _Offers(requestId: r.id, canChoose: _open.contains(r.status) && !_busy, onChoose: _choose),",
    "if (_open.contains(r.status) || r.status == RequestStatus.accepted)\n                _Offers(requestId: r.id, canChoose: _open.contains(r.status) && !_busy, onChoose: _choose, onAuthorize: _busy ? null : _accept),",
  ],
  [
    "list.where((o) => [OfferStatus.pending, OfferStatus.accepted, OfferStatus.confirmed].contains(o.status)).toList();",
    "list.where((o) => [OfferStatus.pending, OfferStatus.authorizing, OfferStatus.accepted, OfferStatus.confirmed].contains(o.status)).toList();",
  ],
  ["                highlight: o.status == OfferStatus.accepted,", "                highlight: o.status == OfferStatus.accepted || o.status == OfferStatus.authorizing,"],
  [
    "                    if (o.status == OfferStatus.accepted) StatusPill(icon: Icons.hourglass_top, label: l10n.mkcEnAttenteDeConfirmation),",
    "                    if (o.status == OfferStatus.accepted) StatusPill(icon: Icons.hourglass_top, label: l10n.mkcEnAttenteDeConfirmation),\n                    if (o.status == OfferStatus.authorizing) StatusPill(icon: Icons.credit_card, label: l10n.mkcCarteAValider),",
  ],
  [
    "                    if (o.status == OfferStatus.pending) FilledButton(onPressed: canChoose ? () => onChoose(o) : null, child: Text(l10n.mkcChoisir)),",
    "                    if (o.status == OfferStatus.pending) FilledButton(onPressed: canChoose ? () => onChoose(o) : null, child: Text(l10n.mkcChoisir)),\n                    // Feuille de paiement fermée avant la fin : le client la rouvre (même empreinte).\n                    if (o.status == OfferStatus.authorizing)\n                      FilledButton(onPressed: onAuthorize == null ? null : () => onAuthorize!(o), child: Text(l10n.mkcValiderMaCarte)),",
  ],
]);
console.log('ok');
