import 'dart:io' show Platform;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/l10n/l10n.dart';

// Accès matériel du mode chauffeur (GPS, caméra, applis externes),
// derrière des interfaces remplacées dans les tests.

class DevicePosition {
  const DevicePosition({required this.lat, required this.lng, this.heading, this.speedKmh});

  final double lat;
  final double lng;
  final double? heading;
  final double? speedKmh;
}

enum LocationAccess { granted, denied, serviceDisabled }

/// Flux de positions GPS tant que le chauffeur est en ligne.
abstract class PositionSource {
  Future<LocationAccess> ensureAccess();
  Stream<DevicePosition> watch();
}

class GeolocatorPositionSource implements PositionSource {
  @override
  Future<LocationAccess> ensureAccess() async {
    if (!await Geolocator.isLocationServiceEnabled()) return LocationAccess.serviceDisabled;
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
    return permission == LocationPermission.denied || permission == LocationPermission.deniedForever
        ? LocationAccess.denied
        : LocationAccess.granted;
  }

  @override
  Stream<DevicePosition> watch() {
    final LocationSettings settings;
    if (!kIsWeb && Platform.isAndroid) {
      settings = AndroidSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
        // Service de premier plan : les positions continuent écran
        // verrouillé, avec une notification visible (exigence Android).
        foregroundNotificationConfig: ForegroundNotificationConfig(
          notificationTitle: l10n.xlcabVousEtesEnLigne,
          notificationText: l10n.votrePositionEstPartageePour,
          enableWakeLock: true,
        ),
      );
    } else if (!kIsWeb && Platform.isIOS) {
      settings = AppleSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 10,
        activityType: ActivityType.automotiveNavigation,
        pauseLocationUpdatesAutomatically: false,
        allowBackgroundLocationUpdates: true,
        // Indicateur bleu iOS : le chauffeur voit que sa position est utilisée.
        showBackgroundLocationIndicator: true,
      );
    } else {
      settings = const LocationSettings(accuracy: LocationAccuracy.high, distanceFilter: 10);
    }
    return Geolocator.getPositionStream(locationSettings: settings).map(
      (p) => DevicePosition(
        lat: p.latitude,
        lng: p.longitude,
        heading: p.heading >= 0 && p.heading <= 360 ? p.heading : null,
        // m/s → km/h, borné comme côté serveur (0–250).
        speedKmh: p.speed >= 0 ? (p.speed * 3.6).clamp(0, 250).toDouble() : null,
      ),
    );
  }
}

/// Scan du QR d'embarquement présenté par le passager (écran 8).
abstract class QrScanner {
  /// Contenu du QR, ou null si le chauffeur a fermé le scanner.
  Future<String?> scan(BuildContext context);
}

class CameraQrScanner implements QrScanner {
  @override
  Future<String?> scan(BuildContext context) =>
      Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const _QrScanPage(), fullscreenDialog: true));
}

class _QrScanPage extends StatefulWidget {
  const _QrScanPage();

  @override
  State<_QrScanPage> createState() => _QrScanPageState();
}

class _QrScanPageState extends State<_QrScanPage> {
  final _controller = MobileScannerController(formats: const [BarcodeFormat.qrCode]);
  bool _done = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(l10n.scannerLeQrDuPassager)),
      body: Stack(
        children: [
          MobileScanner(
            controller: _controller,
            onDetect: (capture) {
              final value = capture.barcodes.isEmpty ? null : capture.barcodes.first.rawValue;
              if (value == null || _done) return;
              _done = true; // un seul retour, même si plusieurs images détectent le code
              Navigator.of(context).pop(value);
            },
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(
                l10n.cadrezLeQrCodeAffiche,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white, backgroundColor: Colors.black54),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Itinéraire et appel, dans les applications du téléphone.
abstract class DriverLauncher {
  Future<bool> navigateTo(Place place);
  Future<bool> call(String phone);
}

class UrlDriverLauncher implements DriverLauncher {
  @override
  Future<bool> navigateTo(Place place) => launchUrl(
        // Lien universel Google Maps : ouvre l'appli si elle est installée,
        // sinon le navigateur. Coordonnées plutôt qu'adresse : plus fiable.
        Uri.https('www.google.com', '/maps/dir/', {
          'api': '1',
          'destination': '${place.lat},${place.lng}',
          'travelmode': 'driving',
        }),
        mode: LaunchMode.externalApplication,
      );

  @override
  Future<bool> call(String phone) => launchUrl(Uri(scheme: 'tel', path: phone));
}

final positionSourceProvider = Provider<PositionSource>((ref) => GeolocatorPositionSource());
final qrScannerProvider = Provider<QrScanner>((ref) => CameraQrScanner());
final driverLauncherProvider = Provider<DriverLauncher>((ref) => UrlDriverLauncher());

/// Ouvre une page web dans le navigateur du téléphone (pages de Stripe du compte de versement).
typedef ExternalLinkOpener = Future<bool> Function(Uri url);

final externalLinkOpenerProvider = Provider<ExternalLinkOpener>((ref) => (url) => launchUrl(url, mode: LaunchMode.externalApplication));
