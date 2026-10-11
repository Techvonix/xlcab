import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/quote.dart';
import 'package:xlcab_core/models/shuttle.dart';
import 'package:xlcab_core/providers/auth_provider.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/services/preferences_store.dart';
import 'package:xlcab_ui/screens/login_screen.dart';
import 'package:xlcab_ui/screens/splash_screen.dart';

import 'screens/booking/confirmation_screen.dart';
import 'screens/booking/driver_profile_screen.dart';
import 'screens/booking/parcel_creation_screen.dart';
import 'screens/booking/parcel_tracking_screen.dart';
import 'screens/booking/passenger_booking_screen.dart';
import 'screens/booking/payment_screen.dart';
import 'screens/booking/shuttle_selection_screen.dart';
import 'screens/corporate/corporate_portal_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/impact/impact_screen.dart';
import 'screens/market/line_search_screen.dart';
import 'screens/market/market_home_screen.dart';
import 'screens/market/request_detail_screen.dart';
import 'screens/market/request_form_screen.dart';
import 'screens/onboarding/onboarding_screen.dart';
import 'screens/parcels/parcels_screen.dart';
import 'screens/profile/notification_preferences_screen.dart';
import 'screens/profile/payment_methods_screen.dart';
import 'screens/profile/profile_screen.dart';
import 'screens/profile/saved_addresses_screen.dart';
import 'screens/profile/trip_history_screen.dart';
import 'screens/shell/passenger_shell.dart';
import 'screens/tracking/tracking_screen.dart';

export 'package:xlcab_core/routes.dart';

/// Routeur de l'application passager, reconstruit quand l'état
/// d'authentification change. Les cinq onglets vivent dans une coquille
/// (barre du bas) ; les autres écrans s'ouvrent par-dessus, en plein écran.
final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: AppRoutes.splash,
    debugLogDiagnostics: false,
    redirect: (context, state) {
      // Pendant la reprise de session au démarrage, on reste sur le splash.
      if (authState.isLoading) {
        return state.matchedLocation == AppRoutes.splash ? null : AppRoutes.splash;
      }

      final isAuthRoute =
          state.matchedLocation == AppRoutes.login ||
          state.matchedLocation == AppRoutes.onboarding ||
          state.matchedLocation == AppRoutes.splash;

      // Non connecté : vers la connexion, y compris depuis le splash.
      // Premier lancement : d'abord les 3 écrans de présentation (écran 2).
      if (!authState.isAuthenticated &&
          (!isAuthRoute || state.matchedLocation == AppRoutes.splash)) {
        final seen = ref.read(preferencesStoreProvider).readOnboardingSeen();
        return seen ? AppRoutes.login : AppRoutes.onboarding;
      }

      // Connecté et sur une route d'auth → accueil, quel que soit le rôle :
      // un chauffeur peut aussi voyager (son espace de travail est dans XLCAB Driver).
      if (authState.isAuthenticated && isAuthRoute) return AppRoutes.home;

      return null; // Pas de redirection nécessaire.
    },
    routes: [
      GoRoute(path: AppRoutes.splash, builder: (context, state) => const SplashScreen()),
      GoRoute(path: AppRoutes.onboarding, builder: (context, state) => const OnboardingScreen()),
      GoRoute(path: AppRoutes.login, builder: (context, state) => const LoginScreen()),

      // ── Les cinq onglets : Accueil, Trajets, Colis, Impact, Compte ──
      StatefulShellRoute.indexedStack(
        builder: (context, state, shell) => PassengerShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: AppRoutes.home, builder: (context, state) => const HomeScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: PassengerTabs.trips, builder: (context, state) => const TripHistoryScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: PassengerTabs.parcels, builder: (context, state) => const ParcelsScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: PassengerTabs.impact, builder: (context, state) => const ImpactScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: AppRoutes.profile, builder: (context, state) => const ProfileScreen()),
          ]),
        ],
      ),

      // ── Réservation ──
      GoRoute(path: AppRoutes.shuttleSelection, builder: (context, state) => const ShuttleSelectionScreen()),
      GoRoute(
        path: AppRoutes.passengerBooking,
        // ?type=rose|bleue|orange|accessibility : navette présélectionnée.
        builder: (context, state) => PassengerBookingScreen(
          initialShuttleType: ShuttleType.fromApi(state.uri.queryParameters['type']),
        ),
      ),
      GoRoute(
        path: AppRoutes.payment,
        // Demande + devis transmis par l'écran 6 (BookingDraft).
        builder: (context, state) => PaymentScreen(draft: state.extra is BookingDraft ? state.extra as BookingDraft : null),
      ),
      GoRoute(
        path: AppRoutes.confirmation,
        builder: (context, state) => ConfirmationScreen(tripId: state.pathParameters['tripId']!),
      ),
      GoRoute(
        path: AppRoutes.tracking,
        builder: (context, state) => TrackingScreen(tripId: state.pathParameters['tripId']!),
      ),
      GoRoute(
        path: AppRoutes.driverProfile,
        builder: (context, state) => DriverProfileScreen(tripId: state.pathParameters['tripId']!),
      ),

      // ── Colis ──
      GoRoute(path: AppRoutes.parcelCreation, builder: (context, state) => const ParcelCreationScreen()),
      GoRoute(
        path: AppRoutes.parcelTracking,
        builder: (context, state) => ParcelTrackingScreen(parcelId: state.pathParameters['parcelId']!),
      ),

      // ── Compte ──
      GoRoute(path: AppRoutes.tripHistory, builder: (context, state) => const TripHistoryScreen()),
      GoRoute(path: AppRoutes.paymentMethods, builder: (context, state) => const PaymentMethodsScreen()),
      GoRoute(path: AppRoutes.savedAddresses, builder: (context, state) => const SavedAddressesScreen()),
      GoRoute(path: AppRoutes.notificationPreferences, builder: (context, state) => const NotificationPreferencesScreen()),
      GoRoute(path: AppRoutes.corporatePortal, builder: (context, state) => const CorporatePortalScreen()),

      // ── Bourse de transport côté client : lignes régulières et devis ──
      GoRoute(path: AppRoutes.market, builder: (context, state) => const MarketHomeScreen()),
      GoRoute(path: AppRoutes.lineSearch, builder: (context, state) => const LineSearchScreen()),
      // Avant la route paramétrée : « new » n'est pas un identifiant de demande.
      GoRoute(path: AppRoutes.requestNew, builder: (context, state) => const RequestFormScreen()),
      GoRoute(
        path: AppRoutes.requestDetail,
        builder: (context, state) => RequestDetailScreen(requestId: state.pathParameters['requestId']!),
      ),
    ],
  );
});
