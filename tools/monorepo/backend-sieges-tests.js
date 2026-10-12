// Choix du siège : tests ajoutés aux tests d'intégration des réservations sur ligne.
const fs = require('fs');
const f = 'C:/xlcab/xlcab_backend/src/line-bookings/line-bookings.integration.spec.ts';
let s = fs.readFileSync(f, 'utf8');
const anchor = "    it('le chauffeur ne se désiste pas d’une réservation isolée : il annule le départ (protocole)', async () => {";
if (!s.includes(anchor)) throw new Error('ancre introuvable');
const tests = `    describe('choix du siège', () => {
      const bookSeats = (pax: string, seats: number, seatNumbers?: number[]) =>
        http().post('/api/v1/lines/bookings').set('Authorization', as(pax, 'passenger')).send({ departureId: departure().id, seats, seatNumbers });
      const seatMap = (pax = PAX2) => http().get(\`/api/v1/lines/bookings/seats/\${departure().id}\`).set('Authorization', as(pax, 'passenger'));

      it('sièges choisis : enregistrés, visibles sur le plan, dans la réservation et sur la liste du chauffeur', async () => {
        moveDeparture(5 * 60);
        expect((await seatMap()).body).toEqual({ departureId: departure().id, seatsTotal: 8, choosable: true, taken: [] });

        const res = await bookSeats(PAX1, 2, [5, 2]);
        expect(res.status).toBe(201);
        expect(res.body.seatNumbers).toEqual([2, 5]);
        expect((await seatMap()).body.taken).toEqual([2, 5]);

        const detail = await http().get(\`/api/v1/trips/\${res.body.tripId}\`).set('Authorization', as(PAX1, 'passenger'));
        expect(detail.body.booking.seatNumbers).toEqual([2, 5]);
        const manifest = await http().get(\`/api/v1/operators/me/departures/\${departure().id}/manifest\`).set('Authorization', driver(DJAMEL));
        expect(manifest.body.passengers[0]).toMatchObject({ firstName: 'Léa', seats: 2, seatNumbers: [2, 5] });
        // Le plan ne dit pas qui occupe quoi.
        expect(JSON.stringify((await seatMap()).body)).not.toContain(PAX1);
      });

      it('siège déjà pris : 409, aucune réservation créée, places rendues', async () => {
        moveDeparture(5 * 60);
        await bookSeats(PAX1, 2, [1, 2]);
        const clash = await bookSeats(PAX2, 2, [2, 3]);
        expect(clash.status).toBe(409);
        expect(clash.body.message).toContain('vient d’être pris');
        expect(tripsOf(departure().id)).toHaveLength(1);
        expect(departure().seatsBooked).toBe(2);
        expect((await seatMap()).body.taken).toEqual([1, 2]);
      });

      it('sans choix : les premiers sièges libres sont attribués', async () => {
        moveDeparture(5 * 60);
        await bookSeats(PAX1, 2, [1, 3]);
        const auto = await bookSeats(PAX2, 2);
        expect(auto.status).toBe(201);
        expect(auto.body.seatNumbers).toEqual([2, 4]);
      });

      it('demande incohérente refusée : mauvais nombre, siège inexistant, doublon', async () => {
        moveDeparture(5 * 60);
        expect((await bookSeats(PAX1, 2, [1])).status).toBe(400);
        expect((await bookSeats(PAX1, 1, [9])).status).toBe(400); // 8 sièges sur ce départ
        expect((await bookSeats(PAX1, 2, [3, 3])).status).toBe(400);
        expect((await bookSeats(PAX1, 1, [0])).status).toBe(400);
        expect(departure().seatsBooked).toBe(0);
        expect(db.lineSeat.rows).toHaveLength(0);
      });

      it('annulation : les sièges redeviennent libres', async () => {
        moveDeparture(5 * 60);
        const { body } = await bookSeats(PAX1, 2, [4, 5]);
        await http().post(\`/api/v1/trips/\${body.tripId}/cancel\`).set('Authorization', as(PAX1, 'passenger')).send({ reason: 'Vol annulé' });
        expect((await seatMap()).body.taken).toEqual([]);
        expect((await bookSeats(PAX2, 1, [4])).status).toBe(201);
      });

      it('départ privatisé (prix au véhicule) : pas de choix de siège', async () => {
        moveDeparture(5 * 60);
        departure().pricingMode = 'per_vehicle';
        expect((await seatMap()).body.choosable).toBe(false);
        expect((await bookSeats(PAX1, 1, [1])).status).toBe(400);
        const whole = await bookSeats(PAX1, 4);
        expect(whole.status).toBe(201);
        expect(whole.body.seatNumbers).toEqual([]);
      });

      it('plan des sièges : compte exigé, départ inconnu = 404', async () => {
        expect((await http().get(\`/api/v1/lines/bookings/seats/\${departure().id}\`)).status).toBe(401);
        expect((await http().get(\`/api/v1/lines/bookings/seats/\${id(999)}\`).set('Authorization', as(PAX1, 'passenger'))).status).toBe(404);
      });
    });

`;
s = s.replace(anchor, tests + anchor);
fs.writeFileSync(f, s);
console.log('ok');
