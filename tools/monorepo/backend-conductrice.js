// Préférence « conductrice » (non exclusive), appuyée sur l'habilitation Navette Rose.
const fs = require('fs');
const R = 'C:/xlcab/xlcab_backend/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    const ok = typeof from === 'string' ? s.includes(from) : from.test(s);
    if (!ok) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.split(from).join(to);
  }
  fs.writeFileSync(R + file, s);
}

edit('prisma/schema.prisma', [
  [
    "  autoShareTrips Boolean @default(false)\n",
    "  autoShareTrips Boolean @default(false)\n  // Préférence (jamais une exigence) : solliciter d'abord une conductrice habilitée Navette Rose.\n  preferWomanDriver Boolean @default(false)\n",
  ],
]);

edit('src/users/user-settings.ts', [
  ['marketing: false, autoShareTrips: false };', 'marketing: false, autoShareTrips: false, preferWomanDriver: false };'],
  [
    '  @IsOptional() @IsBoolean() autoShareTrips?: boolean;',
    "  @IsOptional() @IsBoolean() autoShareTrips?: boolean;\n  /** Préférence, pas exigence : une conductrice habilitée est sollicitée en premier quand il y en a une. */\n  @IsOptional() @IsBoolean() preferWomanDriver?: boolean;",
  ],
  ['  autoShareTrips: p.autoShareTrips,', '  autoShareTrips: p.autoShareTrips,\n  preferWomanDriver: p.preferWomanDriver,'],
]);

edit('src/users/users.service.ts', [['marketing: true, autoShareTrips: true, updatedAt: true }', 'marketing: true, autoShareTrips: true, preferWomanDriver: true, updatedAt: true }']]);
edit('src/testing/memory-prisma.ts', [['marketing: false, autoShareTrips: false, updatedAt: new Date() }', 'marketing: false, autoShareTrips: false, preferWomanDriver: false, updatedAt: new Date() }']]);

edit('src/matching/matching.service.ts', [
  [
    "  /** Arrivée de la course : un chauffeur qui rentre par ce trajet reste sollicitable. */\n  destination?: { lat: number; lng: number };\n}",
    "  /** Arrivée de la course : un chauffeur qui rentre par ce trajet reste sollicitable. */\n  destination?: { lat: number; lng: number };\n  /**\n   * Préférence du passager : les conductrices habilitées Navette Rose sont\n   * sollicitées en premier. Aucun chauffeur n'est écarté pour autant.\n   */\n  preferRose?: boolean;\n}",
  ],
  ['      select: { id: true },\n    });\n    if (drivers.length === 0) return [];', '      select: { id: true, roseEligible: true },\n    });\n    if (drivers.length === 0) return [];'],
  [
    "    // 5. On conserve l'ordre de proximité de l'étape 1.\n    return available\n      .filter((a) => vehicleByDriver.has(a.driverId))\n",
    "    // 5. On conserve l'ordre de proximité de l'étape 1. Préférence « conductrice » :\n    // les habilitées Navette Rose passent devant, toujours par proximité (tri stable) ;\n    // les autres chauffeurs suivent, personne n'est retiré de la liste.\n    const rose = new Set(drivers.filter((d) => d.roseEligible).map((d) => d.id));\n    const ordered = criteria.preferRose\n      ? [...available.filter((a) => rose.has(a.driverId)), ...available.filter((a) => !rose.has(a.driverId))]\n      : available;\n    return ordered\n      .filter((a) => vehicleByDriver.has(a.driverId))\n",
  ],
]);

edit('src/matching/dispatch.service.ts', [
  [
    "    const candidates = await this.matching.findEligibleDrivers({\n      lat: trip.originLat,",
    "    const candidates = await this.matching.findEligibleDrivers({\n      preferRose: await this.prefersWomanDriver(trip.passengerId),\n      lat: trip.originLat,",
  ],
]);
{
  const f = R + 'src/matching/dispatch.service.ts';
  let s = fs.readFileSync(f, 'utf8');
  const idx = s.lastIndexOf('\n}');
  s =
    s.slice(0, idx) +
    "\n\n  /** Préférence « conductrice » du passager. Une préférence ne bloque jamais une course : illisible = non. */\n  private async prefersWomanDriver(passengerId: string | null): Promise<boolean> {\n    if (!passengerId) return false;\n    try {\n      const pref = await this.prisma.userPreference.findUnique({ where: { userId: passengerId }, select: { preferWomanDriver: true } });\n      return pref?.preferWomanDriver === true;\n    } catch {\n      return false;\n    }\n  }\n}" +
    s.slice(idx + 2);
  fs.writeFileSync(f, s);
}

// Tests existants : la réponse des préférences porte un champ de plus.
edit('src/users/user-settings.integration.spec.ts', [[/autoShareTrips: false \}\)/g, 'autoShareTrips: false, preferWomanDriver: false })']]);
console.log('ok');
