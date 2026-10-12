import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Coquille de l'application chauffeur : les quatre onglets de la barre du bas.
/// Chaque onglet garde son état quand on en change (l'onglet « Aujourd'hui »
/// porte la session en ligne : canal temps réel et position).
class DriverShell extends StatelessWidget {
  const DriverShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: shell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        // Un second appui sur l'onglet courant le ramène à son premier écran.
        onDestinationSelected: (index) => shell.goBranch(index, initialLocation: index == shell.currentIndex),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.today_outlined), selectedIcon: const Icon(Icons.today), label: l10n.aujourdHui),
          NavigationDestination(icon: const Icon(Icons.airport_shuttle_outlined), selectedIcon: const Icon(Icons.airport_shuttle), label: l10n.depart),
          NavigationDestination(icon: const Icon(Icons.payments_outlined), selectedIcon: const Icon(Icons.payments), label: l10n.revenus),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: l10n.profil),
        ],
      ),
    );
  }
}
