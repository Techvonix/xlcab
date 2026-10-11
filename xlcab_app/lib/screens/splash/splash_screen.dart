import 'package:flutter/material.dart';
import '../../theme/app_colors.dart';
import '../../theme/app_spacing.dart';
import '../../widgets/xlcab_logo.dart';
import 'package:xlcab_app/l10n/l10n.dart';

/// Écran 1 — Splash (Partie 7) : affiché pendant la reprise de session ;
/// le routeur redirige ensuite vers l'onboarding, la connexion ou l'accueil.
/// Même fond nuit et même symbole que l'écran de démarrage natif (Android et
/// iOS) : pas de saut visuel au lancement.
/// (Détection du pays : à faire avec la géolocalisation, juridiction FR
/// par défaut en attendant.)
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.darkBackground,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const XlcabLogo(size: 120, tone: LogoTone.onBrand, wordmark: false),
            const SizedBox(height: AppSpacing.lg),
            const SizedBox(
              width: 34 * XlcabWordmarkPainter.aspect,
              height: 34,
              child: CustomPaint(painter: XlcabWordmarkPainter(AppColors.darkText)),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              l10n.navettes7PlacesTrajets602,
              textAlign: TextAlign.center,
              style: const TextStyle(fontFamily: 'Inter', fontWeight: FontWeight.w600, fontSize: 14, height: 1.5, color: Color(0xFFA9B8D6)),
            ),
            const SizedBox(height: AppSpacing.xl),
            SizedBox.square(
              dimension: 28,
              child: CircularProgressIndicator(strokeWidth: 3, color: AppColors.brand, semanticsLabel: l10n.chargement),
            ),
          ],
        ),
      ),
    );
  }
}
