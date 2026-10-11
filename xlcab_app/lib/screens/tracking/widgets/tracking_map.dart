import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:xlcab_core/models/place.dart';
import 'package:xlcab_core/models/tracking.dart';
import 'package:xlcab_core/utils/geo.dart';
import 'package:xlcab_core/l10n/l10n.dart';

typedef TrackingMapBuilder = Widget Function(Place origin, Place destination, LivePosition? driver);

/// Carte plein écran du suivi. Injectable : remplacée dans les tests
/// (la carte Google est une vue native).
final trackingMapBuilderProvider = Provider<TrackingMapBuilder>(
  (ref) => (origin, destination, driver) =>
      TrackingMap(origin: origin, destination: destination, driver: driver),
);

/// Durée d'animation du marqueur entre deux positions (Partie 16 :
/// "marqueur animé 3s", cadence d'envoi en course).
const Duration markerAnimationDuration = Duration(seconds: 3);

class TrackingMap extends StatefulWidget {
  const TrackingMap({super.key, required this.origin, required this.destination, this.driver});

  final Place origin;
  final Place destination;
  final LivePosition? driver;

  @override
  State<TrackingMap> createState() => _TrackingMapState();
}

class _TrackingMapState extends State<TrackingMap> with SingleTickerProviderStateMixin {
  late final AnimationController _anim = AnimationController(vsync: this, duration: markerAnimationDuration);
  GoogleMapController? _controller;

  // Position affichée : glisse de _from vers _to au lieu de sauter.
  ({double lat, double lng, double heading})? _from;
  ({double lat, double lng, double heading})? _to;

  @override
  void initState() {
    super.initState();
    final d = widget.driver;
    if (d != null) _to = (lat: d.lat, lng: d.lng, heading: d.heading ?? 0);
  }

  @override
  void didUpdateWidget(covariant TrackingMap oldWidget) {
    super.didUpdateWidget(oldWidget);
    final d = widget.driver;
    if (d == null || identical(d, oldWidget.driver)) return;
    _from = _current ?? (lat: d.lat, lng: d.lng, heading: d.heading ?? 0);
    _to = (lat: d.lat, lng: d.lng, heading: d.heading ?? _from!.heading);
    _anim.forward(from: 0);
    _controller?.animateCamera(CameraUpdate.newLatLng(LatLng(d.lat, d.lng)));
  }

  ({double lat, double lng, double heading})? get _current {
    final to = _to;
    final from = _from;
    if (to == null) return null;
    if (from == null) return to;
    final t = Curves.linear.transform(_anim.value);
    final p = lerpPosition(from.lat, from.lng, to.lat, to.lng, t);
    return (lat: p.lat, lng: p.lng, heading: lerpHeading(from.heading, to.heading, t));
  }

  @override
  void dispose() {
    _anim.dispose();
    _controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final start = widget.driver ?? widget.origin;
    final (lat, lng) = switch (start) {
      LivePosition p => (p.lat, p.lng),
      Place p => (p.lat, p.lng),
      _ => (widget.origin.lat, widget.origin.lng),
    };

    return Semantics(
      label: l10n.carteDuTrajetEnTemps,
      excludeSemantics: true,
      child: AnimatedBuilder(
        animation: _anim,
        builder: (context, _) {
          final car = _current;
          return GoogleMap(
            initialCameraPosition: CameraPosition(target: LatLng(lat, lng), zoom: 13),
            zoomControlsEnabled: false,
            myLocationButtonEnabled: false,
            mapToolbarEnabled: false,
            onMapCreated: (c) => _controller = c,
            markers: {
              Marker(
                markerId: const MarkerId('origin'),
                position: LatLng(widget.origin.lat, widget.origin.lng),
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
                infoWindow: InfoWindow(title: l10n.depart, snippet: widget.origin.address),
              ),
              Marker(
                markerId: const MarkerId('destination'),
                position: LatLng(widget.destination.lat, widget.destination.lng),
                icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRose),
                infoWindow: InfoWindow(title: l10n.arrivee, snippet: widget.destination.address),
              ),
              if (car != null)
                Marker(
                  markerId: const MarkerId('driver'),
                  position: LatLng(car.lat, car.lng),
                  rotation: car.heading,
                  flat: true,
                  anchor: const Offset(0.5, 0.5),
                  icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueViolet),
                  infoWindow: InfoWindow(title: l10n.votreChauffeur),
                ),
            },
          );
        },
      ),
    );
  }
}
