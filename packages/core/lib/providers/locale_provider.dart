import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/preferences_store.dart';

/// Langue choisie dans le profil ; null = langue du téléphone (français si le
/// téléphone est en français, anglais sinon : voir resolveAppLocale).
/// Valeur initiale lue sur l'appareil ; chaque choix est enregistré par
/// XlcabApp (app.dart).
final localeProvider = StateProvider<Locale?>((ref) {
  final code = ref.watch(preferencesStoreProvider).readLanguage();
  return code == null ? null : Locale(code);
});
