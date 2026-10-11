import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/preferences_store.dart';

/// Gère le mode d'affichage (clair / sombre / système) de l'application.
/// Valeur initiale lue sur l'appareil ; chaque modification (profil, fiche
/// accessibilité) est enregistrée par XlcabApp (app.dart).
final themeModeProvider = StateProvider<ThemeMode>((ref) => ref.watch(preferencesStoreProvider).readTheme());
