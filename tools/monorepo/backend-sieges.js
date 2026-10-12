// Choix du siège sur les lignes vendues à la place : modifications du serveur.
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

fs.appendFileSync(
  R + 'prisma/schema.prisma',
  `
// Siège numéroté d'une réservation sur un départ de ligne vendu à la place.
// La contrainte d'unicité garantit qu'un siège n'est jamais vendu deux fois.
model LineSeat {
  id          String   @id @default(uuid())
  departureId String
  seatNumber  Int
  tripId      String
  createdAt   DateTime @default(now())

  @@unique([departureId, seatNumber])
  @@index([tripId])
}
`,
);

edit('src/line-bookings/dto.ts', [
  [
    "  /** Information utile au chauffeur (jamais de donnée sensible). */\n  @IsOptional()\n  @Transform(trim)\n  @IsString()\n  @MaxLength(300, { message: 'Message limité à 300 caractères' })\n  notes?: string;\n}",
    "  /** Information utile au chauffeur (jamais de donnée sensible). */\n  @IsOptional()\n  @Transform(trim)\n  @IsString()\n  @MaxLength(300, { message: 'Message limité à 300 caractères' })\n  notes?: string;\n\n  /**\n   * Sièges choisis (lignes vendues à la place) : autant que de places.\n   * Absent : les premiers sièges libres sont attribués.\n   */\n  @IsOptional()\n  @IsArray({ message: 'Sièges invalides' })\n  @ArrayMaxSize(60, { message: 'Sièges invalides' })\n  @ArrayUnique({ message: 'Un même siège ne peut pas être choisi deux fois' })\n  @IsInt({ each: true, message: 'Sièges invalides' })\n  @Min(1, { each: true, message: 'Sièges invalides' })\n  @Max(60, { each: true, message: 'Sièges invalides' })\n  seatNumbers?: number[];\n}",
  ],
  [/import \{([^}]*)\} from 'class-validator';/, (m, names) => `import {${names.trimEnd().replace(/,$/, '')}, ArrayMaxSize, ArrayUnique, IsArray } from 'class-validator';`],
]);

edit('src/line-bookings/line-bookings.service.ts', [
  // Sièges demandés : contrôlés avant de retenir les places.
  [
    "    // Places retenues d'abord (écriture conditionnelle) : pas de survente.\n",
    "    const perSeat = departure.pricingMode === 'per_seat';\n    if (dto.seatNumbers) {\n      if (!perSeat) throw new BadRequestException('Ce départ se réserve en entier : pas de choix de siège');\n      if (dto.seatNumbers.length !== dto.seats) throw new BadRequestException('Choisissez autant de sièges que de places');\n      if (dto.seatNumbers.some((n) => n > departure.seatsTotal)) throw new BadRequestException('Ce siège n’existe pas sur ce départ');\n    }\n\n    // Places retenues d'abord (écriture conditionnelle) : pas de survente.\n",
  ],
  [
    "        return created;\n      });\n\n      await this.notifications.notify(userId, 'line.booked'",
    "        // Sièges numérotés (vente à la place) : ceux choisis, sinon les premiers libres.\n        const seatNumbers = perSeat ? await this.assignSeats(tx, departure.id, created.id, dto.seats, departure.seatsTotal, dto.seatNumbers) : [];\n        return { ...created, seatNumbers };\n      });\n\n      await this.notifications.notify(userId, 'line.booked'",
  ],
  ["        seats: dto.seats,\n        totalPriceCents: total,\n        paymentMode: 'deferred',", "        seats: dto.seats,\n        seatNumbers: trip.seatNumbers,\n        totalPriceCents: total,\n        paymentMode: 'deferred',"],
  [
    "  // ── Départ côté chauffeur ───────────────────────────────────────────\n",
    `  /**
   * Attribue des sièges à une réservation. La contrainte d'unicité de la
   * base tranche si deux clients visent le même siège au même instant :
   * le second reçoit un 409 et sa réservation n'est pas créée.
   */
  private async assignSeats(tx: any, departureId: string, tripId: string, count: number, seatsTotal: number, wanted?: number[]) {
    const taken = new Set<number>((await tx.lineSeat.findMany({ where: { departureId }, select: { seatNumber: true } })).map((s: { seatNumber: number }) => s.seatNumber));
    let numbers: number[];
    if (wanted) {
      if (wanted.some((n) => taken.has(n))) throw new ConflictException('Ce siège vient d’être pris : choisissez-en un autre');
      numbers = [...wanted].sort((a, b) => a - b);
    } else {
      numbers = [];
      for (let n = 1; n <= seatsTotal && numbers.length < count; n++) if (!taken.has(n)) numbers.push(n);
    }
    try {
      for (const seatNumber of numbers) await tx.lineSeat.create({ data: { departureId, seatNumber, tripId } });
    } catch (err: any) {
      if (err?.code === 'P2002') throw new ConflictException('Ce siège vient d’être pris : choisissez-en un autre');
      throw err;
    }
    return numbers;
  }

  /** Plan des sièges d'un départ : ceux déjà pris (aucune identité), pour le choix à la réservation. */
  async seatMap(departureId: string) {
    const departure = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });
    if (!departure) throw new NotFoundException('Départ introuvable');
    const rows = await this.prisma.lineSeat.findMany({ where: { departureId }, select: { seatNumber: true } });
    return {
      departureId,
      seatsTotal: departure.seatsTotal,
      // Un départ privatisé (prix au véhicule) ne propose pas de choix de siège.
      choosable: departure.pricingMode === 'per_seat',
      taken: rows.map((r: { seatNumber: number }) => r.seatNumber).sort((a: number, b: number) => a - b),
    };
  }

  // ── Départ côté chauffeur ───────────────────────────────────────────
`,
  ],
  // Liste d'embarquement : le chauffeur voit le siège de chacun.
  [
    "    const outbound = departure.direction === 'outbound';\n    return {\n      departureId,\n      lineId: line.id,",
    "    const seatRows = await this.prisma.lineSeat.findMany({ where: { departureId }, select: { seatNumber: true, tripId: true } });\n    const seatsOf = (tripId: string) =>\n      seatRows.filter((s: { tripId: string }) => s.tripId === tripId).map((s: { seatNumber: number }) => s.seatNumber).sort((a: number, b: number) => a - b);\n    const outbound = departure.direction === 'outbound';\n    return {\n      departureId,\n      lineId: line.id,",
  ],
  ["          seats: t.passengerBooking?.seats ?? 0,\n          childSeats:", "          seats: t.passengerBooking?.seats ?? 0,\n          seatNumbers: seatsOf(t.id),\n          childSeats:"],
]);

edit('src/line-bookings/line-bookings.controller.ts', [
  [
    "    return this.bookings.book(req.user.sub, dto);\n  }\n}",
    "    return this.bookings.book(req.user.sub, dto);\n  }\n\n  /** Sièges déjà pris sur un départ (numéros seulement). */\n  @Get('seats/:departureId')\n  seatMap(@Param('departureId', ParseUUIDPipe) departureId: string) {\n    return this.bookings.seatMap(departureId);\n  }\n}",
  ],
]);

edit('src/operators/lines.service.ts', [
  [
    "  /** Rend des places (annulation d'une réservation). */\n  async releaseSeats(departureId: string, seats: number) {\n    const d = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });\n    if (!d) return;\n",
    "  /** Rend des places (annulation d'une réservation) et libère ses sièges numérotés. */\n  async releaseSeats(departureId: string, seats: number, tripId?: string) {\n    if (tripId) await this.prisma.lineSeat.deleteMany({ where: { departureId, tripId } });\n    const d = await this.prisma.lineDeparture.findUnique({ where: { id: departureId } });\n    if (!d) return;\n",
  ],
]);

edit('src/trips/trips.service.ts', [
  ['await this.lines.releaseSeats(trip.lineDepartureId, booking?.seats ?? 0);', 'await this.lines.releaseSeats(trip.lineDepartureId, booking?.seats ?? 0, tripId);'],
]);

edit('src/testing/memory-prisma.ts', [
  ['    trustedContact: new Table(() => ({ createdAt: new Date() })),', '    trustedContact: new Table(() => ({ createdAt: new Date() })),\n    lineSeat: new Table(() => ({ createdAt: new Date() })),'],
]);

edit('src/i18n/messages.en.ts', [
  [
    "  'Lien de suivi indisponible': 'Tracking link unavailable',",
    "  'Lien de suivi indisponible': 'Tracking link unavailable',\n\n  // ── Choix du siège (lignes vendues à la place) ───────────────────────\n  'Sièges invalides': 'Invalid seats',\n  'Un même siège ne peut pas être choisi deux fois': 'The same seat cannot be chosen twice',\n  'Ce départ se réserve en entier : pas de choix de siège': 'This departure is booked as a whole: no seat choice',\n  'Choisissez autant de sièges que de places': 'Choose as many seats as places booked',\n  'Ce siège n’existe pas sur ce départ': 'This seat does not exist on this departure',\n  'Ce siège vient d’être pris : choisissez-en un autre': 'This seat has just been taken: choose another one',",
  ],
]);
console.log('ok');
