// Coordonnées bancaires du vendeur, imprimées sur les factures à régler par
// virement (factures mensuelles d'entreprise, factures de pénalité).
// Renseignées par le porteur de projet dans .env.local :
//   INVOICE_SELLER_IBAN, INVOICE_SELLER_BIC (facultatif).

export interface BankDetails {
  /** IBAN sans espaces, en majuscules. */
  iban: string;
  bic: string | null;
}

export const normalizeIban = (raw: string) => raw.replace(/\s+/g, '').toUpperCase();

/** Contrôle de l'IBAN (ISO 13616) : structure, puis clé modulo 97. */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  // Les 4 premiers caractères passent à la fin ; A=10 … Z=35 ; le nombre obtenu modulo 97 doit valoir 1.
  const digits = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  return remainder === 1;
}

/** BIC / SWIFT : 8 ou 11 caractères. */
export const isValidBic = (raw: string) => /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(raw.replace(/\s+/g, '').toUpperCase());

/** « FR76 3000 6000 0112 3456 7890 189 » : groupes de 4 pour la lecture. */
export const formatIban = (iban: string) => normalizeIban(iban).replace(/(.{4})/g, '$1 ').trim();

/**
 * Coordonnées bancaires configurées, ou null si l'IBAN est absent ou
 * erroné : un IBAN faux n'est JAMAIS imprimé (l'argent partirait ailleurs).
 * Un BIC erroné est simplement omis.
 */
export function bankDetailsFrom(get: (key: string) => string | undefined): BankDetails | null {
  const iban = get('INVOICE_SELLER_IBAN');
  if (!iban || !isValidIban(iban)) return null;
  const bic = get('INVOICE_SELLER_BIC');
  return { iban: normalizeIban(iban), bic: bic && isValidBic(bic) ? bic.replace(/\s+/g, '').toUpperCase() : null };
}
