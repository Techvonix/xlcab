import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/trip.dart';
import '../../router.dart';
import 'package:xlcab_core/services/api_service.dart';
import '../../services/booking_service.dart';
import 'package:xlcab_ui/theme/shuttle_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/utils/formatters.dart';
import 'package:xlcab_core/l10n/l10n.dart';

const historyPageSize = 20;

/// Historique des trajets du passager (écran 13), page par page.
/// Un appui ouvre le détail de la course (écran 8 : récapitulatif, QR,
/// annulation si encore possible).
class TripHistoryScreen extends ConsumerStatefulWidget {
  const TripHistoryScreen({super.key});

  @override
  ConsumerState<TripHistoryScreen> createState() => _TripHistoryScreenState();
}

class _TripHistoryScreenState extends ConsumerState<TripHistoryScreen> {
  final List<TripSummary> _trips = [];
  int _page = 0;
  bool _loading = false;
  bool _hasMore = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadMore();
  }

  Future<void> _loadMore() async {
    if (_loading || !_hasMore) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final next = await ref.read(bookingServiceProvider).history(limit: historyPageSize, page: _page + 1);
      if (!mounted) return;
      setState(() {
        _trips.addAll(next);
        _page++;
        _hasMore = next.length == historyPageSize;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e is ApiException ? e.message : l10n.historiqueIndisponible);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final locale = Localizations.localeOf(context).languageCode;
    final muted = scheme.onSurface.withValues(alpha: 0.75);

    Widget body;
    if (_trips.isEmpty && _loading) {
      body = Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargementDeLHistorique));
    } else if (_trips.isEmpty && _error != null) {
      body = Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(_error!),
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton(onPressed: _loadMore, child: Text(l10n.reessayer)),
        ]),
      );
    } else if (_trips.isEmpty) {
      body = Center(
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Text(l10n.aucunTrajetPourLeMoment, style: AppTypography.body.copyWith(color: muted)),
        ),
      );
    } else {
      body = ListView.separated(
        padding: const EdgeInsets.all(AppSpacing.md),
        itemCount: _trips.length + 1,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, i) {
          if (i == _trips.length) {
            if (!_hasMore) return const SizedBox(height: AppSpacing.md);
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
              child: _loading
                  ? Center(child: CircularProgressIndicator(semanticsLabel: l10n.chargement))
                  : OutlinedButton(onPressed: _loadMore, child: Text(_error ?? l10n.voirLesTrajetsPlusAnciens)),
            );
          }
          final t = _trips[i];
          final price = t.paidByCompany
              ? l10n.payeParLEntreprise
              : t.totalPriceCents == null
                  ? null
                  : formatPrice(t.totalPriceCents!, currency: t.currency, locale: locale);
          return ListTile(
            contentPadding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
            leading: ExcludeSemantics(
              child: Icon(t.parcelId != null ? Icons.inventory_2_outlined : t.shuttleType?.icon ?? Icons.directions_bus, color: t.shuttleType?.color),
            ),
            title: Text('${t.originAddress} → ${t.destinationAddress}', maxLines: 2, overflow: TextOverflow.ellipsis),
            subtitle: Text(
              [
                if (t.scheduledAt != null) formatTripDate(t.scheduledAt!, locale: locale),
                t.status.label,
                if (price != null) price,
              ].join(' · '),
              style: AppTypography.caption.copyWith(color: muted),
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push(t.parcelId != null ? AppRoutes.parcelTrackingFor(t.parcelId!) : AppRoutes.confirmationFor(t.id)),
          );
        },
      );
    }

    return Scaffold(appBar: AppBar(title: Text(l10n.historiqueDesTrajets)), body: body);
  }
}
