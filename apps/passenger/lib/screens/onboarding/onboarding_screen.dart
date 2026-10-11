import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/routes.dart';
import 'package:xlcab_core/services/preferences_store.dart';
import 'package:xlcab_ui/theme/app_colors.dart';
import 'package:xlcab_ui/theme/app_spacing.dart';
import 'package:xlcab_ui/theme/app_typography.dart';
import 'package:xlcab_ui/widgets/primary_button.dart';
import 'package:xlcab_ui/widgets/xlcab_logo.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Une page de présentation.
class _Slide {
  const _Slide({required this.title, required this.body, required this.tint, required this.accent, this.big, this.icon});

  final String title;
  final String body;
  final Color tint;
  final Color accent;

  /// Chiffre mis en avant (« 7+ », « 60 km+ ») ou, à défaut, une icône.
  final String? big;
  final IconData? icon;
}

// Accesseur : les textes suivent la langue courante.
List<_Slide> get _slides => [
  _Slide(
    big: '7+',
    title: l10n.navettes7Places,
    body: l10n.voyagezAPlusieursDansUne,
    tint: const Color(0xFFCFFAFE),
    accent: AppColors.primaryButton,
  ),
  _Slide(
    big: '60 km+',
    title: l10n.trajets60Km,
    body: l10n.pensePourLesLonguesDistances,
    tint: const Color(0xFFE3F2FD),
    accent: AppColors.secondaryText,
  ),
  _Slide(
    icon: Icons.inventory_2_outlined,
    title: l10n.colisInclus,
    body: l10n.envoyezUnColisSurLe,
    tint: const Color(0xFFFFF3E0),
    accent: AppColors.tertiaryText,
  ),
];

/// Écran 2 — Onboarding (Partie 7) : 3 pages (Navettes 7+, Trajets 60 km+,
/// Colis inclus), affichées au premier lancement seulement.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _pages = PageController();
  int _index = 0;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  bool get _last => _index == _slides.length - 1;

  Future<void> _finish() async {
    await ref.read(preferencesStoreProvider).writeOnboardingSeen();
    if (mounted) context.go(AppRoutes.login);
  }

  void _next() {
    if (_last) {
      _finish();
      return;
    }
    // Animation standard de la Partie 5 (300 ms, ease-out).
    _pages.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
  }

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const XlcabLogo(size: 26),
                  const Spacer(),
                  if (!_last)
                    TextButton(
                      onPressed: _finish,
                      style: TextButton.styleFrom(minimumSize: const Size(AppSpacing.minTapTarget, AppSpacing.minTapTarget)),
                      child: Text(l10n.passer),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              Expanded(
                child: PageView.builder(
                  controller: _pages,
                  itemCount: _slides.length,
                  onPageChanged: (i) => setState(() => _index = i),
                  itemBuilder: (context, i) => _SlideView(slide: _slides[i], onSurface: onSurface),
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              Row(
                children: [
                  Semantics(
                    label: l10n.pageSur(_index + 1, _slides.length),
                    child: ExcludeSemantics(
                      child: Row(
                        children: [
                          for (var i = 0; i < _slides.length; i++)
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 150),
                              margin: const EdgeInsets.only(right: AppSpacing.sm),
                              width: i == _index ? 24 : 8,
                              height: 8,
                              decoration: BoxDecoration(
                                color: i == _index ? AppColors.primaryButton : AppColors.lightBorder,
                                borderRadius: BorderRadius.circular(4),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const Spacer(),
                  SizedBox(
                    width: 180,
                    child: PrimaryButton(label: _last ? l10n.commencer : l10n.suivant, onPressed: _next),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SlideView extends StatelessWidget {
  const _SlideView({required this.slide, required this.onSurface});

  final _Slide slide;
  final Color onSurface;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: DecoratedBox(
            decoration: BoxDecoration(color: slide.tint, borderRadius: BorderRadius.circular(AppSpacing.radiusModal)),
            child: ExcludeSemantics(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  if (slide.big != null)
                    FittedBox(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                        child: Text(
                          slide.big!,
                          style: TextStyle(
                            fontFamily: 'Poppins',
                            fontWeight: FontWeight.w700,
                            fontSize: 88,
                            height: 1,
                            letterSpacing: -2.6,
                            color: slide.accent,
                          ),
                        ),
                      ),
                    )
                  else
                    Icon(slide.icon, size: 112, color: slide.accent),
                  const SizedBox(height: AppSpacing.lg),
                  // Les quatre couleurs de navettes, signature de la marque.
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      for (final c in const [AppColors.primary, AppColors.secondary, AppColors.tertiary, AppColors.accessibility])
                        Container(
                          width: 28,
                          height: 8,
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(4)),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(slide.title, style: AppTypography.h1.copyWith(color: onSurface)),
        const SizedBox(height: AppSpacing.sm),
        Text(slide.body, style: AppTypography.body.copyWith(fontSize: 16, height: 1.5, color: onSurface.withValues(alpha: 0.75))),
      ],
    );
  }
}
