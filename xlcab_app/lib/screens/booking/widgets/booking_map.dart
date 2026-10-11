import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_core/l10n/l10n.dart';

typedef BookingMapBuilder = Widget Function(Place? origin, Place? destination);

/// Construit la carte de l'écran de réservation. Injectable : les tests
/// la remplacent (la carte Google est une vue native, absente en test).
final bookingMapBuilderProvider = Provider<BookingMapBuilder>(
  (ref) => (origin, destination) => BookingMap(origin: origin, destination: destination),
);

/// Carte Google avec les marqueurs de départ et d'arrivée, recadrée à
/// chaque changement d'adresse.
class BookingMap extends StatefulWidget {
  const BookingMap({super.key, this.origin, this.destination});

  final Place? origin;
  final Place? destination;

  @override
  State<BookingMap> createState() => _BookingMapState();
}

class _BookingMapState extends State<BookingMap> {
  // Centre de la France métropolitaine : vue de départ sans adresse.
  static const _initialCamera = CameraPosition(target: LatLng(46.6, 2.4), zoom: 5);

  GoogleMapController? _controller;

  @override
  void didUpdateWidget(covariant BookingMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.origin != widget.origin || oldWidget.destination != widget.destination) {
      _fitCamera();
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  void _fitCamera() {
    final controller = _controller;
    if (controller == null) return;
    final points = [widget.origin, widget.destination].whereType<Place>().toList();
    if (points.isEmpty) return;
    if (points.length == 1) {
      controller.animateCamera(CameraUpdate.newLatLngZoom(LatLng(points.first.lat, points.first.lng), 12));
      return;
    }
    final a = points[0];
    final b = points[1];
    final bounds = LatLngBounds(
      southwest: LatLng(a.lat < b.lat ? a.lat : b.lat, a.lng < b.lng ? a.lng : b.lng),
      northeast: LatLng(a.lat > b.lat ? a.lat : b.lat, a.lng > b.lng ? a.lng : b.lng),
    );
    controller.animateCamera(CameraUpdate.newLatLngBounds(bounds, 48));
  }

  Set<Marker> get _markers => {
        if (widget.origin != null)
          Marker(
            markerId: const MarkerId('origin'),
            position: LatLng(widget.origin!.lat, widget.origin!.lng),
            infoWindow: InfoWindow(title: l10n.depart, snippet: widget.origin!.address),
            icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
          ),
        if (widget.destination != null)
          Marker(
            markerId: const MarkerId('destination'),
            position: LatLng(widget.destination!.lat, widget.destination!.lng),
            infoWindow: InfoWindow(title: l10n.arrivee, snippet: widget.destination!.address),
            icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRose),
          ),
      };

  @override
  Widget build(BuildContext context) {
    // La carte est un repère visuel : départ et arrivée sont aussi écrits
    // en toutes lettres dans le formulaire, lus par le lecteur d'écran.
    return Semantics(
      label: l10n.carteDuTrajet,
      excludeSemantics: true,
      child: ColoredBox(
        color: AppColors.lightSurface,
        child: GoogleMap(
          initialCameraPosition: _initialCamera,
          markers: _markers,
          zoomControlsEnabled: false,
          myLocationButtonEnabled: false,
          mapToolbarEnabled: false,
          onMapCreated: (controller) {
            _controller = controller;
            _fitCamera();
          },
        ),
      ),
    );
  }
}
