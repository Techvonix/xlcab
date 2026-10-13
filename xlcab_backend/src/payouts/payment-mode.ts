/**
 * Paiement des lignes régulières et de la bourse (LINE_PAYMENT_MODE).
 *
 * - « deferred » (défaut) : réservation confirmée sans encaissement en
 *   ligne, pour les tests seulement — refusé en production.
 * - « connect » : Stripe Connect (décisions du 2026-10-13). Le passager
 *   paie à la réservation, la part de l'opérateur lui est reversée une
 *   fois le trajet terminé, XLCAB garde sa commission. Un opérateur doit
 *   avoir un compte de versement validé avant de vendre.
 */
export type LinePaymentMode = 'deferred' | 'connect';

export const linePaymentMode = (): LinePaymentMode => (process.env.LINE_PAYMENT_MODE === 'connect' ? 'connect' : 'deferred');
