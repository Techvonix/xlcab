import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/providers/auth_provider.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_ui/screens/login_screen.dart';
import 'package:xlcab_ui/screens/splash_screen.dart';

// Écrans chauffeur (les écrans passager sont dans apps/passenger).
import 'screens/driver/driver_mode_screen.dart';
import 'screens/driver/driver_onboarding_screen.dart';
import 'screens/operator/cancellations_screen.dart';
import 'screens/operator/departure_screen.dart';
import 'screens/operator/line_detail_screen.dart';
import 'screens/operator/line_form_screen.dart';
import 'screens/operator/market_feed_screen.dart';
import 'screens/operator/my_lines_screen.dart';
import 'screens/operator/operator_profile_screen.dart';

export 'package:xlcab_core/routes.dart';

/// Routeur de l'application chauffeur, reconstruit quand l'état
/// d'authentification change.
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

      final isAuthRoute = state.matchedLocation == AppRoutes.login || state.matchedLocation == AppRoutes.splash;

      // Non connecté : vers la connexion, y compris depuis le splash.
      if (!authState.isAuthenticated) return isAuthRoute && state.matchedLocation != AppRoutes.splash ? null : AppRoutes.login;

      // Connecté : le mode chauffeur pour un compte chauffeur, sinon la
      // candidature (Module 8, ouverte à tout compte).
      final isDriver = authState.role == UserRole.driver;
      if (isAuthRoute) return isDriver ? AppRoutes.driverMode : AppRoutes.driverOnboarding;

      // Mode chauffeur et espace opérateur réservés aux chauffeurs (le serveur refuse de toute façon).
      if (!isDriver && state.matchedLocation != AppRoutes.driverOnboarding) return AppRoutes.driverOnboarding;

      return null; // Pas de redirection nécessaire.
    },
    routes: [
      GoRoute(path: AppRoutes.splash, builder: (context, state) => const SplashScreen()),
      GoRoute(path: AppRoutes.login, builder: (context, state) => const LoginScreen()),
      GoRoute(path: AppRoutes.driverMode, builder: (context, state) => const DriverModeScreen()),
      // Module 8 : candidature chauffeur.
      GoRoute(path: AppRoutes.driverOnboarding, builder: (context, state) => const DriverOnboardingScreen()),
      GoRoute(path: AppRoutes.myLines, builder: (context, state) => const MyLinesScreen()),
      // Avant la route paramétrée : « new » n'est pas un identifiant de ligne.
      GoRoute(path: AppRoutes.lineNew, builder: (context, state) => const LineFormScreen()),
      GoRoute(path: AppRoutes.lineDetail, builder: (context, state) => LineDetailScreen(lineId: state.pathParameters['lineId']!)),
      GoRoute(path: AppRoutes.departure, builder: (context, state) => DepartureScreen(departureId: state.pathParameters['departureId']!)),
      GoRoute(path: AppRoutes.operatorProfile, builder: (context, state) => const OperatorProfileScreen()),
      GoRoute(path: AppRoutes.driverMarket, builder: (context, state) => const MarketFeedScreen()),
      GoRoute(path: AppRoutes.driverCancellations, builder: (context, state) => const CancellationsScreen()),
    ],
  );
});
