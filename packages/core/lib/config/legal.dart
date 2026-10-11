/// Liens légaux affichés dans le profil (écran 13) et exigés par les
/// stores (Partie 12 : politique de confidentialité, CGU/CGV, suppression
/// de compte). Adresses à confirmer par XLCAB avant publication :
///   --dart-define=PRIVACY_POLICY_URL=... --dart-define=TERMS_URL=...
const String privacyPolicyUrl = String.fromEnvironment(
  'PRIVACY_POLICY_URL',
  defaultValue: 'https://www.xlcab.com/confidentialite',
);

const String termsUrl = String.fromEnvironment('TERMS_URL', defaultValue: 'https://www.xlcab.com/cgu');

// Versions anglaises (Partie 11 : politique de confidentialité bilingue FR/EN obligatoire).
const String privacyPolicyUrlEn = String.fromEnvironment(
  'PRIVACY_POLICY_URL_EN',
  defaultValue: 'https://www.xlcab.com/en/privacy',
);

const String termsUrlEn = String.fromEnvironment('TERMS_URL_EN', defaultValue: 'https://www.xlcab.com/en/terms');

/// Document dans la langue de l'interface (français, sinon anglais).
String privacyPolicyFor(String languageCode) => languageCode == 'fr' ? privacyPolicyUrl : privacyPolicyUrlEn;
String termsFor(String languageCode) => languageCode == 'fr' ? termsUrl : termsUrlEn;

/// Conditions générales opérateur (lignes régulières, bourse, protocole
/// d'annulation et pénalités) : acceptées avant de publier une ligne.
/// Adresses à confirmer par XLCAB, texte à faire valider par l'avocat.
const String operatorTermsUrl = String.fromEnvironment('OPERATOR_TERMS_URL', defaultValue: 'https://www.xlcab.com/conditions-operateurs');
const String operatorTermsUrlEn = String.fromEnvironment('OPERATOR_TERMS_URL_EN', defaultValue: 'https://www.xlcab.com/en/operator-terms');
String operatorTermsFor(String languageCode) => languageCode == 'fr' ? operatorTermsUrl : operatorTermsUrlEn;

/// Version affichée (Partie 7, écran 13). Fournie au build :
///   --dart-define=APP_VERSION=1.0.0+1
const String appVersion = String.fromEnvironment('APP_VERSION', defaultValue: '1.0.0');

/// Contact du délégué à la protection des données (Partie 13).
const String dpoEmail = 'dpo@xlcab.com';
