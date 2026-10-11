import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:intl/date_symbol_data_local.dart';
// import 'package:firebase_core/firebase_core.dart';
// import 'firebase_options.dart'; // Généré par `flutterfire configure`.
import 'app.dart';
import 'services/payment_service.dart';
import 'services/preferences_store.dart';

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

  // Initialisation Firebase — à décommenter une fois `flutterfire configure`
  // exécuté et les fichiers google-services.json / GoogleService-Info.plist
  // ajoutés (voir Module 1, étape 7 de la Partie 9).
  // await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);

  runApp(
    const ProviderScope(
      child: XlcabApp(),
    ),
  );
}
