// Étiquettes rapides de la note de fin de trajet, et origine de la course (ligne / instantanée)
// dans le détail d'une course pour « Réserver le retour ».
const fs = require('fs');
const R = 'C:/xlcab/xlcab_backend/';
function edit(file, steps) {
  let s = fs.readFileSync(R + file, 'utf8');
  for (const [from, to] of steps) {
    const ok = typeof from === 'string' ? s.includes(from) : from.test(s);
    if (!ok) throw new Error(`${file} : motif introuvable : ${from}`);
    s = s.replace(from, to);
  }
  fs.writeFileSync(R + file, s);
}

edit('prisma/schema.prisma', [
  ["  comment     String? // visible de l'équipe XLCAB seulement\n", "  comment     String? // visible de l'équipe XLCAB seulement\n  // Étiquettes rapides choisies par le passager (liste fermée RATING_TAGS).\n  tags        String[] @default([])\n"],
]);

edit('src/feedback/feedback.service.ts', [
  [
    "export const REPORT_REASONS = ",
    "/** Étiquettes rapides d'une note (ce que le passager a apprécié). Liste fermée : l'app les traduit. */\nexport const RATING_TAGS = ['conduite_sure', 'ponctuel', 'vehicule_propre', 'accueil', 'colis_soigne'] as const;\nexport type RatingTag = (typeof RATING_TAGS)[number];\n\nexport const REPORT_REASONS = ",
  ],
  ['  async rate(user: RequestUser, tripId: string, stars: number, comment: string | undefined, ctx: AuditCtx) {', '  async rate(user: RequestUser, tripId: string, stars: number, comment: string | undefined, ctx: AuditCtx, tags: RatingTag[] = []) {'],
  ['data: { tripId, passengerId: user.sub, driverId: trip.driverId, stars, comment: comment || null },', 'data: { tripId, passengerId: user.sub, driverId: trip.driverId, stars, comment: comment || null, tags },'],
  ["metadata: { stars }, ...ctx });\n    return { stars: rating.stars, createdAt: rating.createdAt };", "metadata: { stars, tags }, ...ctx });\n    return { stars: rating.stars, tags, createdAt: rating.createdAt };"],
]);

edit('src/feedback/feedback.controller.ts', [
  ["import { FeedbackService, REPORT_REASONS, type ReportReason } from './feedback.service';", "import { FeedbackService, RATING_TAGS, REPORT_REASONS, type RatingTag, type ReportReason } from './feedback.service';"],
  [
    "  @MaxLength(500, { message: 'Commentaire limité à 500 caractères' })\n  comment?: string;\n}",
    "  @MaxLength(500, { message: 'Commentaire limité à 500 caractères' })\n  comment?: string;\n\n  /** Étiquettes rapides (« Conduite sûre », « Colis soigné »…), facultatives. */\n  @IsOptional()\n  @IsArray({ message: 'Étiquettes invalides' })\n  @ArrayUnique({ message: 'Étiquettes invalides' })\n  @IsIn(RATING_TAGS, { each: true, message: 'Étiquette inconnue' })\n  tags?: RatingTag[];\n}",
  ],
  ['return this.feedback.rate(req.user, id, dto.stars, dto.comment, AuditService.context(req));', 'return this.feedback.rate(req.user, id, dto.stars, dto.comment, AuditService.context(req), dto.tags ?? []);'],
  [/import \{([^}]*)\} from 'class-validator';/, (m, names) => `import {${names.trimEnd().replace(/,$/, '')}, ArrayUnique, IsArray } from 'class-validator';`],
]);

edit('src/admin/ratings.ts', [['        comment: r.comment,\n', '        comment: r.comment,\n        tags: r.tags ?? [],\n']]);

// Détail d'une course : son origine, pour proposer le bon écran au retour.
edit('src/trips/trips.service.ts', [['      id: trip.id,\n      type: trip.type,\n      status: trip.status,', '      id: trip.id,\n      type: trip.type,\n      // instant | line | market : « Réserver le retour » ouvre l\'écran correspondant.\n      source: trip.source,\n      status: trip.status,']]);

edit('src/i18n/messages.en.ts', [
  ["  // ── Choix du siège (lignes vendues à la place) ───────────────────────", "  // ── Étiquettes rapides d'une note ────────────────────────────────────\n  'Étiquettes invalides': 'Invalid tags',\n  'Étiquette inconnue': 'Unknown tag',\n\n  // ── Choix du siège (lignes vendues à la place) ───────────────────────"],
]);
console.log('ok');
