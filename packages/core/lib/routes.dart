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
  static const trustedContacts = '/profile/contacts';
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

/// Onglets de l'application passager (barre du bas) qui n'avaient pas de route.
class PassengerTabs {
  PassengerTabs._();

  static const trips = '/trips';
  static const parcels = '/parcels';
  static const impact = '/impact';
}

/// Onglets de l'application chauffeur (« Aujourd'hui » = [AppRoutes.driverMode]).
class DriverTabs {
  DriverTabs._();

  static const departure = '/driver/departure';
  static const earnings = '/driver/earnings';
  static const profile = '/driver/profile';
}
