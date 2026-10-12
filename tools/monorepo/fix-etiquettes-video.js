// Deux retouches d'affichage de la notation, et données de démo pour la vidéo.
const fs = require('fs');
const R = 'C:/xlcab/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    const ok = typeof from === 'string' ? s.includes(from) : from.test(s);
    if (!ok) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, to);
  }
  fs.writeFileSync(R + file, s);
}

edit('apps/passenger/lib/screens/booking/driver_profile_screen.dart', [
  // Étoiles : orange vif sur fond nuit, orange foncé sur fond clair (contraste dans les deux thèmes).
  [
    "    final onSurface = Theme.of(context).colorScheme.onSurface;\n    return Card(\n      child: Padding(\n        padding: const EdgeInsets.all(AppSpacing.md),\n        child: Column(\n          crossAxisAlignment: CrossAxisAlignment.stretch,\n          children: [\n            Text(l10n.commentSEstPasseVotre(widget.firstName)",
    "    final onSurface = Theme.of(context).colorScheme.onSurface;\n    final starColor = Theme.of(context).brightness == Brightness.dark ? AppColors.tertiary : AppColors.tertiaryText;\n    return Card(\n      child: Padding(\n        padding: const EdgeInsets.all(AppSpacing.md),\n        child: Column(\n          crossAxisAlignment: CrossAxisAlignment.stretch,\n          children: [\n            Text(l10n.commentSEstPasseVotre(widget.firstName)",
  ],
  ['color: i <= _stars ? AppColors.tertiaryText : onSurface.withValues(alpha: 0.6)),', 'color: i <= _stars ? starColor : onSurface.withValues(alpha: 0.6)),'],
  // Étiquettes : icône de largeur fixe (+ / coche) au lieu de la coche qui élargit la pastille
  // et fait bouger les autres ; l'état reste montré autrement que par la seule couleur.
  [
    "                      FilterChip(\n                        label: Text(label),\n                        selected: _tags.contains(code),",
    "                      FilterChip(\n                        showCheckmark: false,\n                        avatar: Icon(_tags.contains(code) ? Icons.check : Icons.add, size: 18),\n                        label: Text(label),\n                        selected: _tags.contains(code),",
  ],
]);

edit('xlcab_backend/prisma/seed-demo.ts', [
  [
    "  await recomputeDriverRating(prisma as never, nadia.id);\n",
    "  await recomputeDriverRating(prisma as never, nadia.id);\n  // Une course terminée hier, pas encore notée : notation, étiquettes et « Réserver le retour ».\n  const yesterday = inHours(-20);\n  await trip({ passengerId: lea.id, status: 'completed', driverId: nadia.id, vehicleId: van.id, scheduledAt: yesterday, startedAt: yesterday, completedAt: new Date(yesterday.getTime() + 97 * 60_000) });\n",
  ],
  ['  // Léa a réservé 3 places sur le départ de demain.', '  // Thomas a réservé 3 places (sièges 1 à 3) sur le départ de demain : Léa peut y choisir les siennes.'],
  ["source: 'line', lineDepartureId: first.id, passengerId: lea.id, driverId: djamel.id", "source: 'line', lineDepartureId: first.id, passengerId: member.id, driverId: djamel.id"],
  [
    "  // Bourse : demande publiée par Léa",
    "  // Espace sécurité de Léa : un contact de confiance (numéro fictif) et le partage proposé à chaque trajet.\n  await prisma.trustedContact.create({ data: { userId: lea.id, name: 'Maman', phone: '0600000099' } });\n  await prisma.userPreference.create({ data: { userId: lea.id, autoShareTrips: true } });\n\n  // Bourse : demande publiée par Léa",
  ],
]);
console.log('ok');
