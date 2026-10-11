import 'package:flutter/material.dart';
import '../theme/app_spacing.dart';

/// Bouton primaire XLCAB (Partie 5) : fond Rose, hauteur 52, rayon 12
/// (via elevatedButtonTheme d'AppTheme), et léger enfoncement à 0,98
/// pendant l'appui (animation "micro" de 150 ms).
class PrimaryButton extends StatefulWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
  });

  final String label;

  /// null = bouton désactivé.
  final VoidCallback? onPressed;
  final IconData? icon;

  @override
  State<PrimaryButton> createState() => _PrimaryButtonState();
}

class _PrimaryButtonState extends State<PrimaryButton> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed != value) setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onPressed != null;
    final label = Text(widget.label, textAlign: TextAlign.center);

    // Listener plutôt que GestureDetector : il n'entre pas en concurrence
    // avec la détection de tap du bouton lui-même.
    return Listener(
      onPointerDown: (_) => _setPressed(enabled),
      onPointerUp: (_) => _setPressed(false),
      onPointerCancel: (_) => _setPressed(false),
      child: AnimatedScale(
        scale: _pressed ? 0.98 : 1,
        duration: AppDurations.micro,
        curve: AppDurations.enterCurve,
        child: widget.icon == null
            ? ElevatedButton(onPressed: widget.onPressed, child: label)
            : ElevatedButton.icon(
                onPressed: widget.onPressed,
                icon: Icon(widget.icon),
                label: label,
              ),
      ),
    );
  }
}
