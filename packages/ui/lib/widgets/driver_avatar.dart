import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Avatar chauffeur (rayon 50 %, Partie 5) : initiale du prénom en
/// attendant les photos de profil (upload S3, Module 8).
class DriverAvatar extends StatelessWidget {
  const DriverAvatar({super.key, this.firstName, this.size = 48});

  final String? firstName;
  final double size;

  @override
  Widget build(BuildContext context) {
    final initial = (firstName != null && firstName!.isNotEmpty) ? firstName![0].toUpperCase() : null;
    return ExcludeSemantics(
      child: CircleAvatar(
        radius: size / 2,
        backgroundColor: AppColors.secondary.withValues(alpha: 0.15),
        child: initial == null
            ? Icon(Icons.person, color: Theme.of(context).colorScheme.onSurface)
            : Text(
                initial,
                style: AppTypography.h3.copyWith(color: Theme.of(context).colorScheme.onSurface),
              ),
      ),
    );
  }
}
