// Documents du parcours d'inscription chauffeur (Partie 9, Module 8) :
// étape 2 "docs véhicule", étape 3 "docs perso (VTC, REVTC)".
export const DOCUMENT_TYPES = [
  'vehicle_registration', // carte grise
  'vehicle_insurance', // attestation d'assurance
  'technical_control', // contrôle technique
  'driving_license', // permis de conduire
  'vtc_card', // carte professionnelle VTC
  'revtc_proof', // justificatif REVTC (facultatif : l'inscription REVTC est celle de l'exploitant, Partie 11.2)
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Documents obligatoires avant l'envoi en validation. */
export function requiredDocuments(requiresVtcCard: boolean): DocumentType[] {
  return [
    'vehicle_registration',
    'vehicle_insurance',
    'technical_control',
    'driving_license',
    ...(requiresVtcCard ? (['vtc_card'] as const) : []),
  ];
}

// Partie 9 : "Upload avec compression 2MB max". L'app compresse ; le
// serveur refuse tout ce qui dépasse, quoi que prétende le client.
export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

// Valeur proposée : un parcours complet = 6 documents, avec de la marge
// pour les photos ratées.
export const DOCUMENT_UPLOADS_PER_HOUR = 20;

export type ApplicationStatus = 'draft' | 'pending' | 'approved';
