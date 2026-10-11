import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Fond sur lequel le logo est posé : fixe les couleurs du symbole et du nom.
enum LogoTone {
  /// Fond clair : cyan profond, satellite magenta, nom presque noir.
  light,

  /// Fond sombre : cyan orbite, satellite lilas, nom clair.
  dark,

  /// Fond nuit de la marque (démarrage, icône) : mêmes couleurs que [dark].
  onBrand,
}

/// Logo XLCAB, identité « Orbite » (2026-10-10) : un X — un trait continu et
/// deux segments qui s'arrêtent au croisement — dans un anneau, avec un point
/// satellite. Le nom reprend le mot-symbole du site xlcab.com : traits fins,
/// A sans barre, B ouvert. Seule définition du logo dans l'app ; la géométrie
/// est celle de `brand/xlcab-symbole.svg` (voir `brand/README.md`).
class XlcabLogo extends StatelessWidget {
  const XlcabLogo({
    super.key,
    this.size = 40,
    this.tone,
    this.wordmark = true,
    this.tagline = false,
  });

  /// Hauteur du symbole (le nom est proportionné).
  final double size;

  /// Par défaut : déduit de la luminosité du thème.
  final LogoTone? tone;
  final bool wordmark;
  final bool tagline;

  static String get baseline => l10n.navettes7PlacesTrajets603;

  @override
  Widget build(BuildContext context) {
    final t = tone ?? (Theme.of(context).brightness == Brightness.dark ? LogoTone.dark : LogoTone.light);
    final ink = t == LogoTone.light ? AppColors.lightText : AppColors.darkText;
    final sub = t == LogoTone.light ? const Color(0xFF44506A) : const Color(0xFFA9B8D6);

    final symbol = SizedBox.square(dimension: size, child: CustomPaint(painter: XlcabSymbolPainter(t)));
    if (!wordmark) {
      return Semantics(label: 'XLCAB', image: true, child: ExcludeSemantics(child: symbol));
    }

    // Hauteur du mot-symbole ≈ 0,46 × le symbole (rapport largeur / hauteur : 5,14).
    final wordHeight = size * 0.46;
    return Semantics(
      label: tagline ? l10n.xlcab(baseline) : 'XLCAB',
      container: true,
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            symbol,
            SizedBox(width: size * 0.3),
            Flexible(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: wordHeight * XlcabWordmarkPainter.aspect,
                    height: wordHeight,
                    child: CustomPaint(painter: XlcabWordmarkPainter(ink)),
                  ),
                  if (tagline) ...[
                    SizedBox(height: size * 0.12),
                    Text(
                      baseline,
                      style: TextStyle(
                        fontFamily: 'Inter',
                        fontWeight: FontWeight.w600,
                        fontSize: (size * 0.17).clamp(12, 18).toDouble(),
                        height: 1.3,
                        color: sub,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Symbole dans un repère 120 × 120 mis à l'échelle de la zone : anneau fin,
/// trait continu, deux segments arrêtés à 8 unités du croisement, satellite
/// posé sur l'anneau en haut à droite.
class XlcabSymbolPainter extends CustomPainter {
  const XlcabSymbolPainter(this.tone);

  final LogoTone tone;

  @override
  void paint(Canvas canvas, Size size) {
    final light = tone == LogoTone.light;
    final cyan = light ? AppColors.brandDeep : AppColors.brand;
    final dot = light ? AppColors.satelliteDeep : AppColors.satellite;

    canvas.save();
    canvas.scale(size.width / 120, size.height / 120);

    canvas.drawCircle(
      const Offset(60, 60),
      53,
      Paint()
        ..color = cyan
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4
        ..isAntiAlias = true,
    );
    final stroke = Paint()
      ..color = cyan
      ..strokeWidth = 10.5
      ..strokeCap = StrokeCap.round
      ..isAntiAlias = true;
    canvas.drawLine(const Offset(32, 32), const Offset(88, 88), stroke);
    canvas.drawLine(const Offset(88, 32), const Offset(69, 51), stroke);
    canvas.drawLine(const Offset(32, 88), const Offset(51, 69), stroke);
    canvas.drawCircle(const Offset(104, 30.5), 8.5, Paint()..color = dot);
    canvas.restore();
  }

  @override
  bool shouldRepaint(XlcabSymbolPainter oldDelegate) => oldDelegate.tone != tone;
}

/// Mot-symbole « XLCAB » du site xlcab.com, redessiné en traits : repère
/// 514 × 100, épaisseur 8, extrémités coupées à plat sur les bords haut et bas.
class XlcabWordmarkPainter extends CustomPainter {
  const XlcabWordmarkPainter(this.color);

  final Color color;

  /// Largeur / hauteur du mot-symbole.
  static const double aspect = 5.14;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 514, size.height / 100);
    // Les traits obliques dépassent puis sont coupés net par ce cadre.
    canvas.clipRect(const Rect.fromLTWH(0, 0, 514, 100));
    final p = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..strokeCap = StrokeCap.butt
      ..strokeJoin = StrokeJoin.miter
      ..isAntiAlias = true;

    // X
    canvas.drawLine(const Offset(-4, -10), const Offset(92, 110), p);
    canvas.drawLine(const Offset(92, -10), const Offset(-4, 110), p);
    // L
    canvas.drawPath(Path()..moveTo(116, 0)..lineTo(116, 96)..lineTo(182, 96), p);
    // C : cercle ouvert à droite sur un quart
    canvas.drawArc(Rect.fromCircle(center: const Offset(256, 50), radius: 46), math.pi / 4, 1.5 * math.pi, false, p);
    // A sans barre
    canvas.drawPath(Path()..moveTo(321, 110)..lineTo(371, 9)..lineTo(421, 110), p);
    // B ouvert : trois barres et deux panses, sans montant
    canvas.drawPath(
      Path()
        ..moveTo(446, 4)
        ..lineTo(486, 4)
        ..arcToPoint(const Offset(486, 50), radius: const Radius.circular(23))
        ..lineTo(446, 50)
        ..moveTo(486, 50)
        ..arcToPoint(const Offset(486, 96), radius: const Radius.circular(23))
        ..lineTo(446, 96),
      p,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(XlcabWordmarkPainter oldDelegate) => oldDelegate.color != color;
}
