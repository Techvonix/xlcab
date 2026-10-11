import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/models/quote.dart';
import 'package:xlcab_core/models/shuttle.dart';
import 'package:xlcab_core/providers/auth_provider.dart';
import 'package:xlcab_core/services/preferences_store.dart';

// Écrans — placeholders, à remplacer module par module (Partie 7).
import 'package:xlcab_ui/screens/splash_screen.dart';
import 'screens/onboarding/onboarding_screen.dart';
import 'package:xlcab_ui/screens/login_screen.dart';
import 'screens/home/home_screen.dart';
import 'screens/booking/shuttle_selection_screen.dart';
import 'screens/booking/passenger_booking_screen.dart';
import 'screens/booking/payment_screen.dart';
import 'screens/booking/confirmation_screen.dart';
import 'screens/tracking/tracking_screen.dart';
import 'screens/booking/driver_profile_screen.dart';
import 'screens/booking/parcel_creation_screen.dart';
import 'screens/booking/parcel_tracking_screen.dart';
import 'screens/profile/profile_screen.dart';
import 'screens/profile/payment_methods_screen.dart';
import 'screens/profile/trip_history_screen.dart';
import 'screens/profile/saved_addresses_screen.dart';
import 'screens/profile/notification_preferences_screen.dart';
import 'screens/corporate/corporate_portal_screen.dart';
import 'screens/driver/driver_mode_screen.dart';
import 'screens/driver/driver_onboarding_screen.dart';
import 'screens/market/line_search_screen.dart';
import 'screens/market/market_home_screen.dart';
import 'screens/market/request_detail_screen.dart';
import 'screens/market/request_form_screen.dart';
import 'screens/operator/cancellations_screen.dart';
import 'screens/operator/departure_screen.dart';
import 'screens/operator/line_detail_screen.dart';
import 'screens/operator/line_form_screen.dart';
import 'screens/operator/market_feed_screen.dart';
import 'screens/operator/my_lines_screen.dart';
import 'screens/operator/operator_profile_screen.dart';

/// Chemins de routes nommés — utilisés partout dans l'app pour éviter
/// les chaînes de caractères "magiques".
class AppRoutes {
  AppRoutes._();

  static const splash = '/';
  static const onboarding = '/onboarding';
  static const login = '/login';
  static const home = '/home';
  static const shuttleSelection = '/booking/shuttle';
  static const passengerBooking = '/booking/passenger';
  static const payment = '/booking/payment';
  static const confirmation = '/booking/confirmation/:tripId';
  static String confirmationFor(String tripId) => '/booking/confirmation/$tripId';
  static const tracking = '/tracking/:tripId';
  /// Écran 10 : chauffeur d'une course (accès contrôlé par le serveur via la course).
  static const driverProfile = '/trip/:tripId/driver';
  static String driverProfileFor(String tripId) => '/trip/$tripId/driver';
  static const parcelCreation = '/parcel/new';
  static const parcelTracking = '/parcel/:parcelId';
  static String parcelTrackingFor(String parcelId) => '/parcel/$parcelId';
  static const profile = '/profile';
  static const tripHistory = '/profile/trips';
  static const paymentMethods = '/profile/payment-methods';
  static const savedAddresses = '/profile/addresses';
  static const notificationPreferences = '/profile/notifications';
  static const corporatePortal = '/corporate';
  static const driverMode = '/driver-mode';
  static const driverOnboarding = '/driver/onboarding';
  // Espace opérateur (bourse de transport) : réservé aux chauffeurs.
  static const myLines = '/driver/lines';
  static const lineNew = '/driver/lines/new';
  static const lineDetail = '/driver/lines/:lineId';
  static String lineDetailFor(String lineId) => '/driver/lines/$lineId';
  static const departure = '/driver/departures/:departureId';
  static String departureFor(String departureId) => '/driver/departures/$departureId';
  static const operatorProfile = '/driver/operator';
  static const driverMarket = '/driver/market';
  static const driverCancellations = '/driver/cancellations';
  // Bourse de transport côté client : lignes régulières et demandes de devis.
  static const market = '/market';
  static const lineSearch = '/market/lines';
  static const requestNew = '/market/requests/new';
  static const requestDetail = '/market/requests/:requestId';
  static String requestDetailFor(String requestId) => '/market/requests/$requestId';
}

/// Fournit le GoRouter, reconstruit automatiquement quand l'état
/// d'authentification change (via refreshListenable ou re-lecture ref).
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

      // Non connecté : vers la connexion, y compris depuis le splash (sans
      // cela, un utilisateur non connecté restait bloqué sur le splash).
      // Premier lancement : d'abord les 3 écrans de présentation (écran 2).
      if (!authState.isAuthenticated &&
          (!isAuthRoute || state.matchedLocation == AppRoutes.splash)) {
        final seen = ref.read(preferencesStoreProvider).readOnboardingSeen();
        return seen ? AppRoutes.login : AppRoutes.onboarding;
      }

      // Connecté et sur une route d'auth → accueil, ou mode chauffeur pour
      // un compte chauffeur (écran 15).
      if (authState.isAuthenticated && isAuthRoute) {
        return authState.role == UserRole.driver ? AppRoutes.driverMode : AppRoutes.home;
      }

      // Mode chauffeur et espace opérateur réservés aux chauffeurs (le serveur refuse de toute façon).
      final driverOnly = state.matchedLocation == AppRoutes.driverMode ||
          (state.matchedLocation.startsWith('/driver/') && state.matchedLocation != AppRoutes.driverOnboarding);
      if (driverOnly && authState.role != UserRole.driver) {
        return AppRoutes.home;
      }

      return null; // Pas de redirection nécessaire.
    },
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: AppRoutes.onboarding,
        builder: (context, state) => const OnboardingScreen(),
      ),
      GoRoute(
        path: AppRoutes.login,
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: AppRoutes.home,
        builder: (context, state) => const HomeScreen(),
      ),
      GoRoute(
        path: AppRoutes.shuttleSelection,
        builder: (context, state) => const ShuttleSelectionScreen(),
      ),
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
        builder: (context, state) => TrackingScreen(
          tripId: state.pathParameters['tripId']!,
        ),
      ),
      GoRoute(
        path: AppRoutes.driverProfile,
        builder: (context, state) => DriverProfileScreen(
          tripId: state.pathParameters['tripId']!,
        ),
      ),
      GoRoute(
        path: AppRoutes.savedAddresses,
        builder: (context, state) => const SavedAddressesScreen(),
      ),
      GoRoute(
        path: AppRoutes.notificationPreferences,
        builder: (context, state) => const NotificationPreferencesScreen(),
      ),
      GoRoute(
        path: AppRoutes.parcelCreation,
        builder: (context, state) => const ParcelCreationScreen(),
      ),
      GoRoute(
        path: AppRoutes.parcelTracking,
        builder: (context, state) => ParcelTrackingScreen(
          parcelId: state.pathParameters['parcelId']!,
        ),
      ),
      GoRoute(
        path: AppRoutes.profile,
        builder: (context, state) => const ProfileScreen(),
      ),
      GoRoute(
        path: AppRoutes.tripHistory,
        builder: (context, state) => const TripHistoryScreen(),
      ),
      GoRoute(
        path: AppRoutes.paymentMethods,
        builder: (context, state) => const PaymentMethodsScreen(),
      ),
      GoRoute(
        path: AppRoutes.corporatePortal,
        builder: (context, state) => const CorporatePortalScreen(),
      ),
      GoRoute(
        path: AppRoutes.driverMode,
        builder: (context, state) => const DriverModeScreen(),
      ),
      // Module 8 : candidature chauffeur (ouverte à tout compte passager).
      GoRoute(
        path: AppRoutes.driverOnboarding,
        builder: (context, state) => const DriverOnboardingScreen(),
      ),
      GoRoute(path: AppRoutes.myLines, builder: (context, state) => const MyLinesScreen()),
      // Avant la route paramétrée : « new » n'est pas un identifiant de ligne.
      GoRoute(path: AppRoutes.lineNew, builder: (context, state) => const LineFormScreen()),
      GoRoute(path: AppRoutes.lineDetail, builder: (context, state) => LineDetailScreen(lineId: state.pathParameters['lineId']!)),
      GoRoute(path: AppRoutes.departure, builder: (context, state) => DepartureScreen(departureId: state.pathParameters['departureId']!)),
      GoRoute(path: AppRoutes.operatorProfile, builder: (context, state) => const OperatorProfileScreen()),
      GoRoute(path: AppRoutes.driverMarket, builder: (context, state) => const MarketFeedScreen()),
      GoRoute(path: AppRoutes.driverCancellations, builder: (context, state) => const CancellationsScreen()),
      GoRoute(path: AppRoutes.market, builder: (context, state) => const MarketHomeScreen()),
      GoRoute(path: AppRoutes.lineSearch, builder: (context, state) => const LineSearchScreen()),
      // Avant la route paramétrée : « new » n'est pas un identifiant de demande.
      GoRoute(path: AppRoutes.requestNew, builder: (context, state) => const RequestFormScreen()),
      GoRoute(path: AppRoutes.requestDetail, builder: (context, state) => RequestDetailScreen(requestId: state.pathParameters['requestId']!)),
    ],
  );
});
