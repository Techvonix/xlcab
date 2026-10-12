import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';

/// Préférences locales de l'appareil (écran 13). Rien de personnel :
/// uniquement des réglages d'affichage, stockés en clair dans Hive.
abstract class PreferencesStore {
  ThemeMode readTheme();
  Future<void> writeTheme(ThemeMode mode);

  /// Langue choisie dans le profil (fr, en) ; null = langue du téléphone.
  String? readLanguage();
  Future<void> writeLanguage(String? code);

  /// Les 3 écrans de présentation (écran 2) ont été vus ou passés.
  bool readOnboardingSeen();
  Future<void> writeOnboardingSeen();
}

const prefsBoxName = 'prefs';

class HivePreferencesStore implements PreferencesStore {
  HivePreferencesStore(this._box);

  final Box<dynamic> _box;

  @override
  ThemeMode readTheme() {
    final name = _box.get('themeMode');
    // Identité Orbite : thème clair « Orbite Jour » par défaut ; le sombre se choisit dans le profil.
    return ThemeMode.values.firstWhere((m) => m.name == name, orElse: () => ThemeMode.light);
  }

  @override
  Future<void> writeTheme(ThemeMode mode) => _box.put('themeMode', mode.name);

  @override
  String? readLanguage() => _box.get('language') as String?;

  @override
  Future<void> writeLanguage(String? code) => code == null ? _box.delete('language') : _box.put('language', code);

  @override
  bool readOnboardingSeen() => _box.get('onboardingSeen') == true;

  @override
  Future<void> writeOnboardingSeen() => _box.put('onboardingSeen', true);
}

/// Repli (tests, ou boîte Hive indisponible) : préférences en mémoire.
class MemoryPreferencesStore implements PreferencesStore {
  MemoryPreferencesStore({this.onboardingSeen = false, this.language});

  ThemeMode theme = ThemeMode.system;
  String? language;
  bool onboardingSeen;

  @override
  ThemeMode readTheme() => theme;

  @override
  Future<void> writeTheme(ThemeMode mode) async => theme = mode;

  @override
  String? readLanguage() => language;

  @override
  Future<void> writeLanguage(String? code) async => language = code;

  @override
  bool readOnboardingSeen() => onboardingSeen;

  @override
  Future<void> writeOnboardingSeen() async => onboardingSeen = true;
}

/// La boîte est ouverte au démarrage (main.dart).
final preferencesStoreProvider = Provider<PreferencesStore>(
  (ref) => Hive.isBoxOpen(prefsBoxName) ? HivePreferencesStore(Hive.box(prefsBoxName)) : MemoryPreferencesStore(),
);
