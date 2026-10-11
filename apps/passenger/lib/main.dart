import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:xlcab_core/services/preferences_store.dart';
import 'package:xlcab_ui/xlcab_app.dart';
import 'router.dart';
import 'services/payment_service.dart';

/// Application passager « XLCAB » : réserver, suivre un trajet, envoyer un colis.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialisation Hive (cache local léger : préférences, brouillons).
  await Hive.initFlutter();
  // Préférences d'affichage (thème), lues de façon synchrone ensuite.
  try {
    await Hive.openBox<dynamic>(prefsBoxName);
  } catch (_) {
    // Boîte illisible : préférences en mémoire pour cette session.
  }

  // Formats de date/heure de toutes les langues (fr, en, ga) : sans cela,
  // DateFormat(..., 'fr') lève une exception (utils/formatters.dart).
  await initializeDateFormatting();

  // Paiement Stripe (clé publiable via --dart-define=STRIPE_PUBLISHABLE_KEY).
  await initStripe();

  runApp(ProviderScope(child: XlcabApp(router: routerProvider)));
}
