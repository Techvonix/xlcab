import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:xlcab_core/l10n/l10n.dart';

/// Coquille de l'application passager : les cinq onglets de la barre du bas.
/// Chaque onglet garde son état (défilement, saisie) quand on en change.
class PassengerShell extends StatelessWidget {
  const PassengerShell({super.key, required this.shell});

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
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: l10n.accueil),
          NavigationDestination(icon: const Icon(Icons.route_outlined), selectedIcon: const Icon(Icons.route), label: l10n.tabTrajets),
          NavigationDestination(icon: const Icon(Icons.inventory_2_outlined), selectedIcon: const Icon(Icons.inventory_2), label: l10n.tabColis),
          NavigationDestination(icon: const Icon(Icons.eco_outlined), selectedIcon: const Icon(Icons.eco), label: l10n.tabImpact),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: l10n.tabCompte),
        ],
      ),
    );
  }
}
