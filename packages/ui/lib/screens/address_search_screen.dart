import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/models/driver_public_profile.dart';
import 'package:xlcab_core/services/api_service.dart';
import 'package:xlcab_core/services/feedback_service.dart';
import 'package:xlcab_core/services/places_service.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Recherche d'adresse avec autocomplétion Google Places (Partie 7,
/// écran 6). Renvoie la [Place] choisie via Navigator.pop, ou null.
/// Champ vide : les adresses favorites de l'utilisateur sont proposées.
class AddressSearchScreen extends ConsumerStatefulWidget {
  const AddressSearchScreen({super.key, required this.title});

  final String title;

  /// Ouvre l'écran et attend l'adresse choisie.
  static Future<Place?> open(BuildContext context, {required String title}) {
    return Navigator.of(context).push<Place>(
      MaterialPageRoute(builder: (_) => AddressSearchScreen(title: title)),
    );
  }

  @override
  ConsumerState<AddressSearchScreen> createState() => _AddressSearchScreenState();
}

class _AddressSearchScreenState extends ConsumerState<AddressSearchScreen> {
  // Pas de requête avant 3 caractères ; 300 ms après la dernière frappe.
  static const _minChars = 3;
  static const _debounce = Duration(milliseconds: 300);

  final _sessionToken = newPlacesSessionToken();
  Timer? _timer;
  int _requestId = 0; // ignore les réponses arrivées dans le désordre

  List<PlaceSuggestion> _suggestions = const [];
  bool _loading = false;
  String? _error;
  String _query = '';

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _onChanged(String value) {
    _query = value.trim();
    _timer?.cancel();
    if (_query.length < _minChars) {
      setState(() {
        _suggestions = const [];
        _loading = false;
        _error = null;
      });
      return;
    }
    _timer = Timer(_debounce, _search);
  }

  Future<void> _search() async {
    final id = ++_requestId;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await ref
          .read(placesServiceProvider)
          .autocomplete(_query, sessionToken: _sessionToken);
      if (!mounted || id != _requestId) return;
      setState(() {
        _suggestions = results;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted || id != _requestId) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  Future<void> _select(PlaceSuggestion suggestion) async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final place = await ref
          .read(placesServiceProvider)
          .details(suggestion.placeId, sessionToken: _sessionToken);
      if (mounted) Navigator.of(context).pop(place);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    // Favoris : seulement avant la saisie ; une erreur de chargement les masque
    // simplement (la recherche Google reste disponible).
    final favorites = _query.length < _minChars
        ? (ref.watch(savedAddressesProvider).valueOrNull ?? const <SavedAddress>[])
        : const <SavedAddress>[];

    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: TextField(
              autofocus: true,
              textInputAction: TextInputAction.search,
              onChanged: _onChanged,
              decoration: InputDecoration(
                hintText: l10n.adresseGareAeroport,
                prefixIcon: const Icon(Icons.search),
              ),
            ),
          ),
          if (_loading) LinearProgressIndicator(semanticsLabel: l10n.rechercheEnCours),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Text(_error!, style: AppTypography.body.copyWith(color: onSurface)),
            ),
          if (!_loading && _error == null && _query.length >= _minChars && _suggestions.isEmpty)
            Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Text(l10n.aucuneAdresseTrouvee, style: AppTypography.body.copyWith(color: onSurface)),
            ),
          Expanded(
            child: ListView.separated(
              itemCount: favorites.isNotEmpty ? favorites.length + 1 : _suggestions.length,
              separatorBuilder: (_, __) => const Divider(height: 1),
              itemBuilder: (context, index) {
                if (favorites.isNotEmpty) {
                  if (index == 0) {
                    return Padding(
                      padding: const EdgeInsets.fromLTRB(AppSpacing.md, AppSpacing.sm, AppSpacing.md, AppSpacing.sm),
                      child: Semantics(header: true, child: Text(l10n.adressesFavorites, style: AppTypography.bodyBold.copyWith(color: onSurface))),
                    );
                  }
                  final f = favorites[index - 1];
                  return ListTile(
                    minTileHeight: AppSpacing.minTapTarget,
                    leading: const Icon(Icons.star_outline_rounded),
                    title: Text(f.label),
                    subtitle: Text(f.address),
                    onTap: () => Navigator.of(context).pop(Place(address: f.address, lat: f.lat, lng: f.lng)),
                  );
                }
                final s = _suggestions[index];
                return ListTile(
                  minTileHeight: AppSpacing.minTapTarget,
                  leading: const Icon(Icons.place_outlined),
                  title: Text(s.mainText),
                  subtitle: s.secondaryText.isEmpty ? null : Text(s.secondaryText),
                  onTap: _loading ? null : () => _select(s),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Choix d'une adresse (injectable pour les tests : pas d'appel Google).
final addressPickerProvider = Provider<Future<Place?> Function(BuildContext, String)>(
  (ref) => (context, title) => AddressSearchScreen.open(context, title: title),
);
