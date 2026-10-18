import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_fr.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'generated/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('fr')
  ];

  /// No description provided for @france.
  ///
  /// In fr, this message translates to:
  /// **'France'**
  String get france;

  /// No description provided for @irlande.
  ///
  /// In fr, this message translates to:
  /// **'Irlande'**
  String get irlande;

  /// No description provided for @espagne.
  ///
  /// In fr, this message translates to:
  /// **'Espagne'**
  String get espagne;

  /// No description provided for @italie.
  ///
  /// In fr, this message translates to:
  /// **'Italie'**
  String get italie;

  /// No description provided for @allemagne.
  ///
  /// In fr, this message translates to:
  /// **'Allemagne'**
  String get allemagne;

  /// No description provided for @portugal.
  ///
  /// In fr, this message translates to:
  /// **'Portugal'**
  String get portugal;

  /// No description provided for @carte.
  ///
  /// In fr, this message translates to:
  /// **'Carte'**
  String get carte;

  /// No description provided for @carteGrise.
  ///
  /// In fr, this message translates to:
  /// **'Carte grise'**
  String get carteGrise;

  /// No description provided for @attestationDAssurance.
  ///
  /// In fr, this message translates to:
  /// **'Attestation d’assurance'**
  String get attestationDAssurance;

  /// No description provided for @controleTechnique.
  ///
  /// In fr, this message translates to:
  /// **'Contrôle technique'**
  String get controleTechnique;

  /// No description provided for @permisDeConduire.
  ///
  /// In fr, this message translates to:
  /// **'Permis de conduire'**
  String get permisDeConduire;

  /// No description provided for @carteProfessionnelleVtc.
  ///
  /// In fr, this message translates to:
  /// **'Carte professionnelle VTC'**
  String get carteProfessionnelleVtc;

  /// No description provided for @justificatifRevtcFacultatif.
  ///
  /// In fr, this message translates to:
  /// **'Justificatif REVTC (facultatif)'**
  String get justificatifRevtcFacultatif;

  /// No description provided for @comportementDuChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Comportement du chauffeur'**
  String get comportementDuChauffeur;

  /// No description provided for @conduiteDangereuse.
  ///
  /// In fr, this message translates to:
  /// **'Conduite dangereuse'**
  String get conduiteDangereuse;

  /// No description provided for @etatDuVehicule.
  ///
  /// In fr, this message translates to:
  /// **'État du véhicule'**
  String get etatDuVehicule;

  /// No description provided for @retardImportant.
  ///
  /// In fr, this message translates to:
  /// **'Retard important'**
  String get retardImportant;

  /// No description provided for @autre.
  ///
  /// In fr, this message translates to:
  /// **'Autre'**
  String get autre;

  /// No description provided for @francais.
  ///
  /// In fr, this message translates to:
  /// **'Français'**
  String get francais;

  /// No description provided for @anglais.
  ///
  /// In fr, this message translates to:
  /// **'Anglais'**
  String get anglais;

  /// No description provided for @irlandais.
  ///
  /// In fr, this message translates to:
  /// **'Irlandais'**
  String get irlandais;

  /// No description provided for @espagnol.
  ///
  /// In fr, this message translates to:
  /// **'Espagnol'**
  String get espagnol;

  /// No description provided for @italien.
  ///
  /// In fr, this message translates to:
  /// **'Italien'**
  String get italien;

  /// No description provided for @allemand.
  ///
  /// In fr, this message translates to:
  /// **'Allemand'**
  String get allemand;

  /// No description provided for @portugais.
  ///
  /// In fr, this message translates to:
  /// **'Portugais'**
  String get portugais;

  /// No description provided for @arabe.
  ///
  /// In fr, this message translates to:
  /// **'Arabe'**
  String get arabe;

  /// No description provided for @paiementEnAttente.
  ///
  /// In fr, this message translates to:
  /// **'Paiement en attente'**
  String get paiementEnAttente;

  /// No description provided for @enAttenteDEnlevement.
  ///
  /// In fr, this message translates to:
  /// **'En attente d’enlèvement'**
  String get enAttenteDEnlevement;

  /// No description provided for @prisEnCharge.
  ///
  /// In fr, this message translates to:
  /// **'Pris en charge'**
  String get prisEnCharge;

  /// No description provided for @enRoute.
  ///
  /// In fr, this message translates to:
  /// **'En route'**
  String get enRoute;

  /// No description provided for @livre.
  ///
  /// In fr, this message translates to:
  /// **'Livré'**
  String get livre;

  /// No description provided for @problemeSignale.
  ///
  /// In fr, this message translates to:
  /// **'Problème signalé'**
  String get problemeSignale;

  /// No description provided for @annule.
  ///
  /// In fr, this message translates to:
  /// **'Annulé'**
  String get annule;

  /// No description provided for @navetteRose.
  ///
  /// In fr, this message translates to:
  /// **'Navette Rose'**
  String get navetteRose;

  /// No description provided for @femmesFamilles.
  ///
  /// In fr, this message translates to:
  /// **'Femmes & familles'**
  String get femmesFamilles;

  /// No description provided for @navetteBleue.
  ///
  /// In fr, this message translates to:
  /// **'Navette Bleue'**
  String get navetteBleue;

  /// No description provided for @suburbainMixte.
  ///
  /// In fr, this message translates to:
  /// **'Suburbain mixte'**
  String get suburbainMixte;

  /// No description provided for @navetteOrange.
  ///
  /// In fr, this message translates to:
  /// **'Navette Orange'**
  String get navetteOrange;

  /// No description provided for @corporateB2b.
  ///
  /// In fr, this message translates to:
  /// **'Corporate / B2B'**
  String get corporateB2b;

  /// No description provided for @navetteAccessibilite.
  ///
  /// In fr, this message translates to:
  /// **'Navette Accessibilité'**
  String get navetteAccessibilite;

  /// No description provided for @personnesAMobiliteReduite.
  ///
  /// In fr, this message translates to:
  /// **'Personnes à mobilité réduite'**
  String get personnesAMobiliteReduite;

  /// No description provided for @votreChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Votre chauffeur'**
  String get votreChauffeur;

  /// No description provided for @enAttente.
  ///
  /// In fr, this message translates to:
  /// **'En attente'**
  String get enAttente;

  /// No description provided for @rechercheDUnChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Recherche d\'un chauffeur'**
  String get rechercheDUnChauffeur;

  /// No description provided for @aucunChauffeurDisponible.
  ///
  /// In fr, this message translates to:
  /// **'Aucun chauffeur disponible'**
  String get aucunChauffeurDisponible;

  /// No description provided for @chauffeurEnRoute.
  ///
  /// In fr, this message translates to:
  /// **'Chauffeur en route'**
  String get chauffeurEnRoute;

  /// No description provided for @enCours.
  ///
  /// In fr, this message translates to:
  /// **'En cours'**
  String get enCours;

  /// No description provided for @termine.
  ///
  /// In fr, this message translates to:
  /// **'Terminé'**
  String get termine;

  /// No description provided for @confieAUneNavette.
  ///
  /// In fr, this message translates to:
  /// **'Confié à une navette'**
  String get confieAUneNavette;

  /// No description provided for @statutInconnu.
  ///
  /// In fr, this message translates to:
  /// **'Statut inconnu'**
  String get statutInconnu;

  /// No description provided for @votreCompteAEteSupprime.
  ///
  /// In fr, this message translates to:
  /// **'Votre compte a été supprimé. Merci d’avoir voyagé avec XLCAB.'**
  String get votreCompteAEteSupprime;

  /// No description provided for @votreSessionAExpireReconnectez.
  ///
  /// In fr, this message translates to:
  /// **'Votre session a expiré. Reconnectez-vous.'**
  String get votreSessionAExpireReconnectez;

  /// No description provided for @connexionImpossibleReessayezPlusTard.
  ///
  /// In fr, this message translates to:
  /// **'Connexion impossible. Réessayez plus tard.'**
  String get connexionImpossibleReessayezPlusTard;

  /// No description provided for @serviceMomentanementIndisponibleReessayezPlus.
  ///
  /// In fr, this message translates to:
  /// **'Service momentanément indisponible. Réessayez plus tard.'**
  String get serviceMomentanementIndisponibleReessayezPlus;

  /// No description provided for @activezLaLocalisationDuTelephone.
  ///
  /// In fr, this message translates to:
  /// **'Activez la localisation du téléphone pour passer en ligne.'**
  String get activezLaLocalisationDuTelephone;

  /// No description provided for @autorisezLAccesAVotre.
  ///
  /// In fr, this message translates to:
  /// **'Autorisez l’accès à votre position pour recevoir des missions.'**
  String get autorisezLAccesAVotre;

  /// No description provided for @offreExpireeLaCourseA.
  ///
  /// In fr, this message translates to:
  /// **'Offre expirée : la course a été proposée à un autre chauffeur.'**
  String get offreExpireeLaCourseA;

  /// No description provided for @uneDeVosCoursesA.
  ///
  /// In fr, this message translates to:
  /// **'Une de vos courses a été annulée.'**
  String get uneDeVosCoursesA;

  /// No description provided for @missionAcceptee.
  ///
  /// In fr, this message translates to:
  /// **'Mission acceptée.'**
  String get missionAcceptee;

  /// No description provided for @courseDemarree.
  ///
  /// In fr, this message translates to:
  /// **'Course démarrée.'**
  String get courseDemarree;

  /// No description provided for @passagerEmbarqueCourseDemarree.
  ///
  /// In fr, this message translates to:
  /// **'Passager embarqué, course démarrée.'**
  String get passagerEmbarqueCourseDemarree;

  /// No description provided for @courseTermineeMerci.
  ///
  /// In fr, this message translates to:
  /// **'Course terminée. Merci !'**
  String get courseTermineeMerci;

  /// No description provided for @desistementEnregistreLaCourseEst.
  ///
  /// In fr, this message translates to:
  /// **'Désistement enregistré : la course est proposée à un autre chauffeur.'**
  String get desistementEnregistreLaCourseEst;

  /// No description provided for @colisABord.
  ///
  /// In fr, this message translates to:
  /// **'Colis à bord.'**
  String get colisABord;

  /// No description provided for @colisRemisMerci.
  ///
  /// In fr, this message translates to:
  /// **'Colis remis. Merci !'**
  String get colisRemisMerci;

  /// No description provided for @problemeSignaleALEquipe.
  ///
  /// In fr, this message translates to:
  /// **'Problème signalé à l’équipe XLCAB.'**
  String get problemeSignaleALEquipe;

  /// No description provided for @informationsPersonnelles.
  ///
  /// In fr, this message translates to:
  /// **'Informations personnelles'**
  String get informationsPersonnelles;

  /// No description provided for @documentsDuVehicule.
  ///
  /// In fr, this message translates to:
  /// **'Documents du véhicule'**
  String get documentsDuVehicule;

  /// No description provided for @documentsPersonnels.
  ///
  /// In fr, this message translates to:
  /// **'Documents personnels'**
  String get documentsPersonnels;

  /// No description provided for @informationsVehicule.
  ///
  /// In fr, this message translates to:
  /// **'Informations véhicule'**
  String get informationsVehicule;

  /// No description provided for @envoiPourValidation.
  ///
  /// In fr, this message translates to:
  /// **'Envoi pour validation'**
  String get envoiPourValidation;

  /// No description provided for @aEnvoyer.
  ///
  /// In fr, this message translates to:
  /// **'{value1} à envoyer'**
  String aEnvoyer(Object value1);

  /// No description provided for @prenomRequis.
  ///
  /// In fr, this message translates to:
  /// **'Prénom requis'**
  String get prenomRequis;

  /// No description provided for @nomRequis.
  ///
  /// In fr, this message translates to:
  /// **'Nom requis'**
  String get nomRequis;

  /// No description provided for @numeroDeTelephoneInvalide.
  ///
  /// In fr, this message translates to:
  /// **'Numéro de téléphone invalide'**
  String get numeroDeTelephoneInvalide;

  /// No description provided for @auMoinsUneLangueParlee.
  ///
  /// In fr, this message translates to:
  /// **'Au moins une langue parlée'**
  String get auMoinsUneLangueParlee;

  /// No description provided for @numeroDePermisRequis.
  ///
  /// In fr, this message translates to:
  /// **'Numéro de permis requis'**
  String get numeroDePermisRequis;

  /// No description provided for @dateDExpirationDuPermis.
  ///
  /// In fr, this message translates to:
  /// **'Date d’expiration du permis à venir requise'**
  String get dateDExpirationDuPermis;

  /// No description provided for @numeroDeCarteVtcRequis.
  ///
  /// In fr, this message translates to:
  /// **'Numéro de carte VTC requis'**
  String get numeroDeCarteVtcRequis;

  /// No description provided for @dateDExpirationDeLa.
  ///
  /// In fr, this message translates to:
  /// **'Date d’expiration de la carte VTC à venir requise'**
  String get dateDExpirationDeLa;

  /// No description provided for @marqueRequise.
  ///
  /// In fr, this message translates to:
  /// **'Marque requise'**
  String get marqueRequise;

  /// No description provided for @modeleRequis.
  ///
  /// In fr, this message translates to:
  /// **'Modèle requis'**
  String get modeleRequis;

  /// No description provided for @couleurRequise.
  ///
  /// In fr, this message translates to:
  /// **'Couleur requise'**
  String get couleurRequise;

  /// No description provided for @immatriculationAuFormatAb123.
  ///
  /// In fr, this message translates to:
  /// **'Immatriculation au format AB-123-CD'**
  String get immatriculationAuFormatAb123;

  /// No description provided for @uneDashcamEstObligatoire.
  ///
  /// In fr, this message translates to:
  /// **'Une dashcam est obligatoire'**
  String get uneDashcamEstObligatoire;

  /// No description provided for @echeanceDAssuranceAVenir.
  ///
  /// In fr, this message translates to:
  /// **'Échéance d’assurance à venir requise'**
  String get echeanceDAssuranceAVenir;

  /// No description provided for @echeanceDuControleTechniqueA.
  ///
  /// In fr, this message translates to:
  /// **'Échéance du contrôle technique à venir requise'**
  String get echeanceDuControleTechniqueA;

  /// No description provided for @navetteAccessibiliteVehiculeEquipePmr.
  ///
  /// In fr, this message translates to:
  /// **'Navette Accessibilité : véhicule équipé PMR et formation PMR requis'**
  String get navetteAccessibiliteVehiculeEquipePmr;

  /// No description provided for @consentementRequisPourEnvoyerVotre.
  ///
  /// In fr, this message translates to:
  /// **'Consentement requis pour envoyer votre dossier'**
  String get consentementRequisPourEnvoyerVotre;

  /// No description provided for @accessibilite.
  ///
  /// In fr, this message translates to:
  /// **'Accessibilité'**
  String get accessibilite;

  /// No description provided for @laTailleDuTexteSuit.
  ///
  /// In fr, this message translates to:
  /// **'La taille du texte suit les réglages de votre téléphone, jusqu\'à 200 %.'**
  String get laTailleDuTexteSuit;

  /// No description provided for @affichage.
  ///
  /// In fr, this message translates to:
  /// **'Affichage'**
  String get affichage;

  /// No description provided for @auto.
  ///
  /// In fr, this message translates to:
  /// **'Auto'**
  String get auto;

  /// No description provided for @clair.
  ///
  /// In fr, this message translates to:
  /// **'Clair'**
  String get clair;

  /// No description provided for @sombre.
  ///
  /// In fr, this message translates to:
  /// **'Sombre'**
  String get sombre;

  /// No description provided for @reserverUneNavetteAccessibilite.
  ///
  /// In fr, this message translates to:
  /// **'Réserver une Navette Accessibilité'**
  String get reserverUneNavetteAccessibilite;

  /// No description provided for @seConnecter.
  ///
  /// In fr, this message translates to:
  /// **'Se connecter'**
  String get seConnecter;

  /// No description provided for @creerUnCompte.
  ///
  /// In fr, this message translates to:
  /// **'Créer un compte'**
  String get creerUnCompte;

  /// No description provided for @email.
  ///
  /// In fr, this message translates to:
  /// **'Email'**
  String get email;

  /// No description provided for @emailRequis.
  ///
  /// In fr, this message translates to:
  /// **'Email requis'**
  String get emailRequis;

  /// No description provided for @motDePasse.
  ///
  /// In fr, this message translates to:
  /// **'Mot de passe'**
  String get motDePasse;

  /// No description provided for @n8CaracteresMinimum.
  ///
  /// In fr, this message translates to:
  /// **'8 caractères minimum'**
  String get n8CaracteresMinimum;

  /// No description provided for @afficherLeMotDePasse.
  ///
  /// In fr, this message translates to:
  /// **'Afficher le mot de passe'**
  String get afficherLeMotDePasse;

  /// No description provided for @masquerLeMotDePasse.
  ///
  /// In fr, this message translates to:
  /// **'Masquer le mot de passe'**
  String get masquerLeMotDePasse;

  /// No description provided for @motDePasseRequis.
  ///
  /// In fr, this message translates to:
  /// **'Mot de passe requis'**
  String get motDePasseRequis;

  /// No description provided for @leMotDePasseDoit.
  ///
  /// In fr, this message translates to:
  /// **'Le mot de passe doit contenir au moins 8 caractères'**
  String get leMotDePasseDoit;

  /// No description provided for @jAccepteLesConditionsGenerales.
  ///
  /// In fr, this message translates to:
  /// **'J’accepte les conditions générales d’utilisation et la politique de confidentialité de XLCAB.'**
  String get jAccepteLesConditionsGenerales;

  /// No description provided for @vousDevezAccepterLesConditions.
  ///
  /// In fr, this message translates to:
  /// **'Vous devez accepter les conditions pour créer un compte.'**
  String get vousDevezAccepterLesConditions;

  /// No description provided for @patientez.
  ///
  /// In fr, this message translates to:
  /// **'Patientez…'**
  String get patientez;

  /// No description provided for @creerMonCompte.
  ///
  /// In fr, this message translates to:
  /// **'Créer mon compte'**
  String get creerMonCompte;

  /// No description provided for @adresseGareAeroport.
  ///
  /// In fr, this message translates to:
  /// **'Adresse, gare, aéroport…'**
  String get adresseGareAeroport;

  /// No description provided for @rechercheEnCours.
  ///
  /// In fr, this message translates to:
  /// **'Recherche en cours'**
  String get rechercheEnCours;

  /// No description provided for @aucuneAdresseTrouvee.
  ///
  /// In fr, this message translates to:
  /// **'Aucune adresse trouvée.'**
  String get aucuneAdresseTrouvee;

  /// No description provided for @adressesFavorites.
  ///
  /// In fr, this message translates to:
  /// **'Adresses favorites'**
  String get adressesFavorites;

  /// No description provided for @reservation.
  ///
  /// In fr, this message translates to:
  /// **'Réservation'**
  String get reservation;

  /// No description provided for @chargementDeLaReservation.
  ///
  /// In fr, this message translates to:
  /// **'Chargement de la réservation'**
  String get chargementDeLaReservation;

  /// No description provided for @impossibleDeChargerLaReservation.
  ///
  /// In fr, this message translates to:
  /// **'Impossible de charger la réservation.'**
  String get impossibleDeChargerLaReservation;

  /// No description provided for @reessayer.
  ///
  /// In fr, this message translates to:
  /// **'Réessayer'**
  String get reessayer;

  /// No description provided for @reservationAnnulee.
  ///
  /// In fr, this message translates to:
  /// **'Réservation annulée'**
  String get reservationAnnulee;

  /// No description provided for @courseTerminee.
  ///
  /// In fr, this message translates to:
  /// **'Course terminée'**
  String get courseTerminee;

  /// No description provided for @reservationConfirmee.
  ///
  /// In fr, this message translates to:
  /// **'Réservation confirmée'**
  String get reservationConfirmee;

  /// No description provided for @qrCodeDEmbarquementA.
  ///
  /// In fr, this message translates to:
  /// **'QR code d’embarquement, à présenter au chauffeur'**
  String get qrCodeDEmbarquementA;

  /// No description provided for @aPresenterAuChauffeurA.
  ///
  /// In fr, this message translates to:
  /// **'À présenter au chauffeur à la montée'**
  String get aPresenterAuChauffeurA;

  /// No description provided for @suivreMaCourse.
  ///
  /// In fr, this message translates to:
  /// **'Suivre ma course'**
  String get suivreMaCourse;

  /// No description provided for @noterLeTrajet.
  ///
  /// In fr, this message translates to:
  /// **'Noter le trajet'**
  String get noterLeTrajet;

  /// No description provided for @profilDuChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Profil du chauffeur'**
  String get profilDuChauffeur;

  /// No description provided for @annulerLaReservation.
  ///
  /// In fr, this message translates to:
  /// **'Annuler la réservation'**
  String get annulerLaReservation;

  /// No description provided for @telechargerLaFacture.
  ///
  /// In fr, this message translates to:
  /// **'Télécharger la facture {value1}'**
  String telechargerLaFacture(Object value1);

  /// No description provided for @retourALAccueil.
  ///
  /// In fr, this message translates to:
  /// **'Retour à l’accueil'**
  String get retourALAccueil;

  /// No description provided for @votreChauffeurSeraAttribueA.
  ///
  /// In fr, this message translates to:
  /// **'Votre chauffeur sera attribué à partir du {value1}'**
  String votreChauffeurSeraAttribueA(Object value1);

  /// No description provided for @impossibleDOuvrirLaFacture.
  ///
  /// In fr, this message translates to:
  /// **'Impossible d’ouvrir la facture sur ce téléphone.'**
  String get impossibleDOuvrirLaFacture;

  /// No description provided for @annulerLaReservation2.
  ///
  /// In fr, this message translates to:
  /// **'Annuler la réservation ?'**
  String get annulerLaReservation2;

  /// No description provided for @gratuitJusquA24H.
  ///
  /// In fr, this message translates to:
  /// **'Gratuit jusqu’à 24 h avant le départ (ou si aucun chauffeur n’a encore été trouvé), '**
  String get gratuitJusquA24H;

  /// No description provided for @puis50DeFraisJusqu.
  ///
  /// In fr, this message translates to:
  /// **'puis 50 % de frais jusqu’à 2 h avant, 100 % ensuite. Le remboursement est automatique.'**
  String get puis50DeFraisJusqu;

  /// No description provided for @garder.
  ///
  /// In fr, this message translates to:
  /// **'Garder'**
  String get garder;

  /// No description provided for @annulationParLePassager.
  ///
  /// In fr, this message translates to:
  /// **'Annulation par le passager'**
  String get annulationParLePassager;

  /// No description provided for @reservationAnnuleeLeRemboursementSera.
  ///
  /// In fr, this message translates to:
  /// **'Réservation annulée. Le remboursement sera traité par notre équipe.'**
  String get reservationAnnuleeLeRemboursementSera;

  /// No description provided for @reservationAnnuleeRemboursementDeFrais.
  ///
  /// In fr, this message translates to:
  /// **'Réservation annulée. Remboursement de {refund} (frais : {value1}).'**
  String reservationAnnuleeRemboursementDeFrais(Object refund, Object value1);

  /// No description provided for @reservationAnnuleeRemboursementIntegralDe.
  ///
  /// In fr, this message translates to:
  /// **'Réservation annulée. Remboursement intégral de {refund}.'**
  String reservationAnnuleeRemboursementIntegralDe(Object refund);

  /// No description provided for @passager.
  ///
  /// In fr, this message translates to:
  /// **'{value1} passager{value2}'**
  String passager(Object value1, Object value2);

  /// No description provided for @montant.
  ///
  /// In fr, this message translates to:
  /// **'Montant : {value1}'**
  String montant(Object value1);

  /// No description provided for @chargementDuProfil.
  ///
  /// In fr, this message translates to:
  /// **'Chargement du profil'**
  String get chargementDuProfil;

  /// No description provided for @profilIndisponible.
  ///
  /// In fr, this message translates to:
  /// **'Profil indisponible.'**
  String get profilIndisponible;

  /// No description provided for @nouveauChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Nouveau chauffeur'**
  String get nouveauChauffeur;

  /// No description provided for @n5Avis.
  ///
  /// In fr, this message translates to:
  /// **'★ {value1} / 5 · {value2} avis'**
  String n5Avis(Object value1, Object value2);

  /// No description provided for @nouveauChauffeurPasEncoreNote.
  ///
  /// In fr, this message translates to:
  /// **'Nouveau chauffeur, pas encore noté'**
  String get nouveauChauffeurPasEncoreNote;

  /// No description provided for @noteSur5Avis.
  ///
  /// In fr, this message translates to:
  /// **'Note {value1} sur 5, {value2} avis'**
  String noteSur5Avis(Object value1, Object value2);

  /// No description provided for @trajetsRealises.
  ///
  /// In fr, this message translates to:
  /// **'{value1} trajets réalisés'**
  String trajetsRealises(Object value1);

  /// No description provided for @dashcamActive.
  ///
  /// In fr, this message translates to:
  /// **'Dashcam active'**
  String get dashcamActive;

  /// No description provided for @formeALAccueilPmr.
  ///
  /// In fr, this message translates to:
  /// **'Formé à l’accueil PMR'**
  String get formeALAccueilPmr;

  /// No description provided for @vehiculeEquipePmr.
  ///
  /// In fr, this message translates to:
  /// **'Véhicule équipé PMR'**
  String get vehiculeEquipePmr;

  /// No description provided for @languesParlees.
  ///
  /// In fr, this message translates to:
  /// **'Langues parlées'**
  String get languesParlees;

  /// No description provided for @vousAvezDonne5.
  ///
  /// In fr, this message translates to:
  /// **'Vous avez donné {value1} / 5'**
  String vousAvezDonne5(Object value1);

  /// No description provided for @merciVotreAvisAideLes.
  ///
  /// In fr, this message translates to:
  /// **'Merci, votre avis aide les autres passagers.'**
  String get merciVotreAvisAideLes;

  /// No description provided for @signalerUnProbleme.
  ///
  /// In fr, this message translates to:
  /// **'Signaler un problème'**
  String get signalerUnProbleme;

  /// No description provided for @signalementEnvoyeNotreEquipeLe.
  ///
  /// In fr, this message translates to:
  /// **'Signalement envoyé. Notre équipe le traite et peut vous recontacter.'**
  String get signalementEnvoyeNotreEquipeLe;

  /// No description provided for @vehicule.
  ///
  /// In fr, this message translates to:
  /// **'Véhicule'**
  String get vehicule;

  /// No description provided for @places.
  ///
  /// In fr, this message translates to:
  /// **'{value1} places'**
  String places(Object value1);

  /// No description provided for @immatriculation.
  ///
  /// In fr, this message translates to:
  /// **'Immatriculation {value1}'**
  String immatriculation(Object value1);

  /// No description provided for @merciPourVotreNote.
  ///
  /// In fr, this message translates to:
  /// **'Merci pour votre note !'**
  String get merciPourVotreNote;

  /// No description provided for @commentSEstPasseVotre.
  ///
  /// In fr, this message translates to:
  /// **'Comment s’est passé votre trajet avec {value1} ?'**
  String commentSEstPasseVotre(Object value1);

  /// No description provided for @n1Etoile.
  ///
  /// In fr, this message translates to:
  /// **'1 étoile'**
  String get n1Etoile;

  /// No description provided for @etoiles.
  ///
  /// In fr, this message translates to:
  /// **'{i} étoiles'**
  String etoiles(Object i);

  /// No description provided for @tresDecevant.
  ///
  /// In fr, this message translates to:
  /// **'Très décevant'**
  String get tresDecevant;

  /// No description provided for @decevant.
  ///
  /// In fr, this message translates to:
  /// **'Décevant'**
  String get decevant;

  /// No description provided for @correct.
  ///
  /// In fr, this message translates to:
  /// **'Correct'**
  String get correct;

  /// No description provided for @bien.
  ///
  /// In fr, this message translates to:
  /// **'Bien'**
  String get bien;

  /// No description provided for @excellent.
  ///
  /// In fr, this message translates to:
  /// **'Excellent'**
  String get excellent;

  /// No description provided for @unCommentaireFacultatif.
  ///
  /// In fr, this message translates to:
  /// **'Un commentaire ? (facultatif)'**
  String get unCommentaireFacultatif;

  /// No description provided for @luUniquementParLEquipe.
  ///
  /// In fr, this message translates to:
  /// **'Lu uniquement par l’équipe XLCAB'**
  String get luUniquementParLEquipe;

  /// No description provided for @envoyerMaNote.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer ma note'**
  String get envoyerMaNote;

  /// No description provided for @enCasDeDangerImmediat.
  ///
  /// In fr, this message translates to:
  /// **'En cas de danger immédiat, appelez le 112.'**
  String get enCasDeDangerImmediat;

  /// No description provided for @queSEstIlPasse.
  ///
  /// In fr, this message translates to:
  /// **'Que s’est-il passé ? (facultatif)'**
  String get queSEstIlPasse;

  /// No description provided for @annuler.
  ///
  /// In fr, this message translates to:
  /// **'Annuler'**
  String get annuler;

  /// No description provided for @envoyer.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer'**
  String get envoyer;

  /// No description provided for @dateDEnlevement.
  ///
  /// In fr, this message translates to:
  /// **'Date d’enlèvement'**
  String get dateDEnlevement;

  /// No description provided for @heureDEnlevement.
  ///
  /// In fr, this message translates to:
  /// **'Heure d’enlèvement'**
  String get heureDEnlevement;

  /// No description provided for @choisissezLAdresseDEnlevement.
  ///
  /// In fr, this message translates to:
  /// **'Choisissez l’adresse d’enlèvement.'**
  String get choisissezLAdresseDEnlevement;

  /// No description provided for @choisissezLAdresseDeLivraison.
  ///
  /// In fr, this message translates to:
  /// **'Choisissez l’adresse de livraison.'**
  String get choisissezLAdresseDeLivraison;

  /// No description provided for @enlevementEtLivraisonDoiventEtre.
  ///
  /// In fr, this message translates to:
  /// **'Enlèvement et livraison doivent être différents.'**
  String get enlevementEtLivraisonDoiventEtre;

  /// No description provided for @choisissezLaDateDEnlevement.
  ///
  /// In fr, this message translates to:
  /// **'Choisissez la date d’enlèvement.'**
  String get choisissezLaDateDEnlevement;

  /// No description provided for @envoiAuMoins2H.
  ///
  /// In fr, this message translates to:
  /// **'Envoi au moins 2 h à l’avance.'**
  String get envoiAuMoins2H;

  /// No description provided for @confirmezQueLeColisNe.
  ///
  /// In fr, this message translates to:
  /// **'Confirmez que le colis ne contient aucun objet interdit.'**
  String get confirmezQueLeColisNe;

  /// No description provided for @aucuneOptionDisponiblePourCe.
  ///
  /// In fr, this message translates to:
  /// **'Aucune option disponible pour ce trajet.'**
  String get aucuneOptionDisponiblePourCe;

  /// No description provided for @paiementMomentanementIndisponibleReessayezPlus.
  ///
  /// In fr, this message translates to:
  /// **'Paiement momentanément indisponible. Réessayez plus tard.'**
  String get paiementMomentanementIndisponibleReessayezPlus;

  /// No description provided for @paiementAnnuleVotreEnvoiN.
  ///
  /// In fr, this message translates to:
  /// **'Paiement annulé. Votre envoi n’est pas confirmé.'**
  String get paiementAnnuleVotreEnvoiN;

  /// No description provided for @paiementRefuse.
  ///
  /// In fr, this message translates to:
  /// **'Paiement refusé.'**
  String get paiementRefuse;

  /// No description provided for @adresseDEnlevement.
  ///
  /// In fr, this message translates to:
  /// **'Adresse d’enlèvement'**
  String get adresseDEnlevement;

  /// No description provided for @adresseDeLivraison.
  ///
  /// In fr, this message translates to:
  /// **'Adresse de livraison'**
  String get adresseDeLivraison;

  /// No description provided for @requis.
  ///
  /// In fr, this message translates to:
  /// **'Requis'**
  String get requis;

  /// No description provided for @envoyerUnColis.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer un colis'**
  String get envoyerUnColis;

  /// No description provided for @trajet.
  ///
  /// In fr, this message translates to:
  /// **'Trajet'**
  String get trajet;

  /// No description provided for @dateEtHeureDEnlevement.
  ///
  /// In fr, this message translates to:
  /// **'Date et heure d’enlèvement'**
  String get dateEtHeureDEnlevement;

  /// No description provided for @auMoins2HA.
  ///
  /// In fr, this message translates to:
  /// **'Au moins 2 h à l’avance'**
  String get auMoins2HA;

  /// No description provided for @colis.
  ///
  /// In fr, this message translates to:
  /// **'Colis'**
  String get colis;

  /// No description provided for @poidsKg.
  ///
  /// In fr, this message translates to:
  /// **'Poids (kg)'**
  String get poidsKg;

  /// No description provided for @n30KgMaximum.
  ///
  /// In fr, this message translates to:
  /// **'30 kg maximum'**
  String get n30KgMaximum;

  /// No description provided for @longueurCm.
  ///
  /// In fr, this message translates to:
  /// **'Longueur (cm)'**
  String get longueurCm;

  /// No description provided for @largeurCm.
  ///
  /// In fr, this message translates to:
  /// **'Largeur (cm)'**
  String get largeurCm;

  /// No description provided for @hauteurCm.
  ///
  /// In fr, this message translates to:
  /// **'Hauteur (cm)'**
  String get hauteurCm;

  /// No description provided for @tropGrand1208080.
  ///
  /// In fr, this message translates to:
  /// **'Trop grand : 120 × 80 × 80 cm maximum.'**
  String get tropGrand1208080;

  /// No description provided for @maximum30KgEt120.
  ///
  /// In fr, this message translates to:
  /// **'Maximum 30 kg et 120 × 80 × 80 cm.'**
  String get maximum30KgEt120;

  /// No description provided for @contenuExCartonDeLivres.
  ///
  /// In fr, this message translates to:
  /// **'Contenu (ex. carton de livres)'**
  String get contenuExCartonDeLivres;

  /// No description provided for @decrivezLeContenu.
  ///
  /// In fr, this message translates to:
  /// **'Décrivez le contenu'**
  String get decrivezLeContenu;

  /// No description provided for @colisFragile.
  ///
  /// In fr, this message translates to:
  /// **'Colis fragile'**
  String get colisFragile;

  /// No description provided for @destinataire.
  ///
  /// In fr, this message translates to:
  /// **'Destinataire'**
  String get destinataire;

  /// No description provided for @nomDuDestinataire.
  ///
  /// In fr, this message translates to:
  /// **'Nom du destinataire'**
  String get nomDuDestinataire;

  /// No description provided for @telephoneDuDestinataire.
  ///
  /// In fr, this message translates to:
  /// **'Téléphone du destinataire'**
  String get telephoneDuDestinataire;

  /// No description provided for @numeroInvalide.
  ///
  /// In fr, this message translates to:
  /// **'Numéro invalide'**
  String get numeroInvalide;

  /// No description provided for @jeCertifieQueLeColis.
  ///
  /// In fr, this message translates to:
  /// **'Je certifie que le colis ne contient aucun objet interdit : matières dangereuses, '**
  String get jeCertifieQueLeColis;

  /// No description provided for @armesStupefiantsAnimauxDenreesPerissables.
  ///
  /// In fr, this message translates to:
  /// **'armes, stupéfiants, animaux, denrées périssables, objets de valeur (bijoux, espèces).'**
  String get armesStupefiantsAnimauxDenreesPerissables;

  /// No description provided for @commentVoyageVotreColis.
  ///
  /// In fr, this message translates to:
  /// **'Comment voyage votre colis ?'**
  String get commentVoyageVotreColis;

  /// No description provided for @navettePartageeTrajetRetour.
  ///
  /// In fr, this message translates to:
  /// **'Navette partagée (trajet retour)'**
  String get navettePartageeTrajetRetour;

  /// No description provided for @navettePartagee.
  ///
  /// In fr, this message translates to:
  /// **'Navette partagée'**
  String get navettePartagee;

  /// No description provided for @votreColisVoyageAuRetour.
  ///
  /// In fr, this message translates to:
  /// **'Votre colis voyage au retour d’une navette XLCAB qui rentrerait sinon à vide.'**
  String get votreColisVoyageAuRetour;

  /// No description provided for @votreColisVoyageAvecUne.
  ///
  /// In fr, this message translates to:
  /// **'Votre colis voyage avec une navette déjà prévue sur ce trajet, avec des passagers.'**
  String get votreColisVoyageAvecUne;

  /// No description provided for @navetteDediee.
  ///
  /// In fr, this message translates to:
  /// **'Navette dédiée'**
  String get navetteDediee;

  /// No description provided for @uneNavettePartPourVotre.
  ///
  /// In fr, this message translates to:
  /// **'Une navette part pour votre colis à l’heure choisie.'**
  String get uneNavettePartPourVotre;

  /// No description provided for @annulationGratuiteJusquAL.
  ///
  /// In fr, this message translates to:
  /// **'Annulation gratuite jusqu’à l’enlèvement si aucun chauffeur n’est encore engagé ; '**
  String get annulationGratuiteJusquAL;

  /// No description provided for @sinon50DeFraisEntre.
  ///
  /// In fr, this message translates to:
  /// **'sinon 50 % de frais entre 24 h et 2 h avant, 100 % ensuite.'**
  String get sinon50DeFraisEntre;

  /// No description provided for @voirLesOptionsEtLe.
  ///
  /// In fr, this message translates to:
  /// **'Voir les options et le prix'**
  String get voirLesOptionsEtLe;

  /// No description provided for @aucuneOptionDisponible.
  ///
  /// In fr, this message translates to:
  /// **'Aucune option disponible'**
  String get aucuneOptionDisponible;

  /// No description provided for @payer.
  ///
  /// In fr, this message translates to:
  /// **'Payer {value1}'**
  String payer(Object value1);

  /// No description provided for @indisponible.
  ///
  /// In fr, this message translates to:
  /// **'Indisponible'**
  String get indisponible;

  /// No description provided for @departPrevu.
  ///
  /// In fr, this message translates to:
  /// **'Départ prévu : {value1}'**
  String departPrevu(Object value1);

  /// No description provided for @suiviDuColis.
  ///
  /// In fr, this message translates to:
  /// **'Suivi du colis'**
  String get suiviDuColis;

  /// No description provided for @actualiser.
  ///
  /// In fr, this message translates to:
  /// **'Actualiser'**
  String get actualiser;

  /// No description provided for @chargementDuColis.
  ///
  /// In fr, this message translates to:
  /// **'Chargement du colis'**
  String get chargementDuColis;

  /// No description provided for @suiviIndisponible.
  ///
  /// In fr, this message translates to:
  /// **'Suivi indisponible.'**
  String get suiviIndisponible;

  /// No description provided for @navettePartageeAuRetourD.
  ///
  /// In fr, this message translates to:
  /// **'Navette partagée, au retour d’un chauffeur XLCAB'**
  String get navettePartageeAuRetourD;

  /// No description provided for @navettePartageeAvecDesPassagers.
  ///
  /// In fr, this message translates to:
  /// **'Navette partagée, avec des passagers'**
  String get navettePartageeAvecDesPassagers;

  /// No description provided for @notreEquipeVousRecontacte.
  ///
  /// In fr, this message translates to:
  /// **'{value1}. Notre équipe vous recontacte.'**
  String notreEquipeVousRecontacte(Object value1);

  /// No description provided for @qrCodeDuColisA.
  ///
  /// In fr, this message translates to:
  /// **'QR code du colis, à présenter au chauffeur à l’enlèvement'**
  String get qrCodeDuColisA;

  /// No description provided for @aPresenterAuChauffeurA2.
  ///
  /// In fr, this message translates to:
  /// **'À présenter au chauffeur à l’enlèvement'**
  String get aPresenterAuChauffeurA2;

  /// No description provided for @codeDeRemise.
  ///
  /// In fr, this message translates to:
  /// **'Code de remise'**
  String get codeDeRemise;

  /// No description provided for @codeDeRemise2.
  ///
  /// In fr, this message translates to:
  /// **'Code de remise : {value1}'**
  String codeDeRemise2(Object value1);

  /// No description provided for @transmettezCeCodeAIl.
  ///
  /// In fr, this message translates to:
  /// **'Transmettez ce code à {value1} : il le donnera au chauffeur pour recevoir le colis.'**
  String transmettezCeCodeAIl(Object value1);

  /// No description provided for @copierLeCode.
  ///
  /// In fr, this message translates to:
  /// **'Copier le code'**
  String get copierLeCode;

  /// No description provided for @codeCopie.
  ///
  /// In fr, this message translates to:
  /// **'Code copié.'**
  String get codeCopie;

  /// No description provided for @destinataire2.
  ///
  /// In fr, this message translates to:
  /// **'Destinataire : {value1}'**
  String destinataire2(Object value1);

  /// No description provided for @ajouterUnePhotoDuColis.
  ///
  /// In fr, this message translates to:
  /// **'Ajouter une photo du colis'**
  String get ajouterUnePhotoDuColis;

  /// No description provided for @annulerLEnvoi.
  ///
  /// In fr, this message translates to:
  /// **'Annuler l’envoi'**
  String get annulerLEnvoi;

  /// No description provided for @photoAjoutee.
  ///
  /// In fr, this message translates to:
  /// **'Photo ajoutée.'**
  String get photoAjoutee;

  /// No description provided for @annulerLEnvoi2.
  ///
  /// In fr, this message translates to:
  /// **'Annuler l’envoi ?'**
  String get annulerLEnvoi2;

  /// No description provided for @leRemboursementEstAutomatiqueSelon.
  ///
  /// In fr, this message translates to:
  /// **'Le remboursement est automatique, selon les conditions d’annulation.'**
  String get leRemboursementEstAutomatiqueSelon;

  /// No description provided for @annulationParLExpediteur.
  ///
  /// In fr, this message translates to:
  /// **'Annulation par l’expéditeur'**
  String get annulationParLExpediteur;

  /// No description provided for @envoiAnnuleLeRemboursementSera.
  ///
  /// In fr, this message translates to:
  /// **'Envoi annulé. Le remboursement sera traité par notre équipe.'**
  String get envoiAnnuleLeRemboursementSera;

  /// No description provided for @envoiAnnuleRemboursementDe.
  ///
  /// In fr, this message translates to:
  /// **'Envoi annulé. Remboursement de {value1}.'**
  String envoiAnnuleRemboursementDe(Object value1);

  /// No description provided for @envoiConfirme.
  ///
  /// In fr, this message translates to:
  /// **'Envoi confirmé'**
  String get envoiConfirme;

  /// No description provided for @prisEnChargeParLe.
  ///
  /// In fr, this message translates to:
  /// **'Pris en charge par le chauffeur'**
  String get prisEnChargeParLe;

  /// No description provided for @livreAuDestinataire.
  ///
  /// In fr, this message translates to:
  /// **'Livré au destinataire'**
  String get livreAuDestinataire;

  /// No description provided for @reserverUnTrajet.
  ///
  /// In fr, this message translates to:
  /// **'Réserver un trajet'**
  String get reserverUnTrajet;

  /// No description provided for @depart.
  ///
  /// In fr, this message translates to:
  /// **'Départ'**
  String get depart;

  /// No description provided for @adresseDeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Adresse de départ'**
  String get adresseDeDepart;

  /// No description provided for @inverserDepartEtArrivee.
  ///
  /// In fr, this message translates to:
  /// **'Inverser départ et arrivée'**
  String get inverserDepartEtArrivee;

  /// No description provided for @arrivee.
  ///
  /// In fr, this message translates to:
  /// **'Arrivée'**
  String get arrivee;

  /// No description provided for @lArriveeDoitEtreDifferente.
  ///
  /// In fr, this message translates to:
  /// **'L\'arrivée doit être différente du départ'**
  String get lArriveeDoitEtreDifferente;

  /// No description provided for @adresseDArrivee.
  ///
  /// In fr, this message translates to:
  /// **'Adresse d\'arrivée'**
  String get adresseDArrivee;

  /// No description provided for @reservationAuMoins2H.
  ///
  /// In fr, this message translates to:
  /// **'Réservation au moins 2 h à l’avance (à partir de '**
  String get reservationAuMoins2H;

  /// No description provided for @passagers.
  ///
  /// In fr, this message translates to:
  /// **'Passagers'**
  String get passagers;

  /// No description provided for @ajouterUnColis.
  ///
  /// In fr, this message translates to:
  /// **'Ajouter un colis'**
  String get ajouterUnColis;

  /// No description provided for @votreColisVoyageAvecVous.
  ///
  /// In fr, this message translates to:
  /// **'Votre colis voyage avec vous'**
  String get votreColisVoyageAvecVous;

  /// No description provided for @renseignezLeDepartLArrivee.
  ///
  /// In fr, this message translates to:
  /// **'Renseignez le départ, l’arrivée et la date pour obtenir un prix.'**
  String get renseignezLeDepartLArrivee;

  /// No description provided for @payer2.
  ///
  /// In fr, this message translates to:
  /// **'Payer'**
  String get payer2;

  /// No description provided for @dateDeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Date de départ'**
  String get dateDeDepart;

  /// No description provided for @heureDeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Heure de départ'**
  String get heureDeDepart;

  /// No description provided for @navette.
  ///
  /// In fr, this message translates to:
  /// **'Navette'**
  String get navette;

  /// No description provided for @ouvreLaRechercheDAdresse.
  ///
  /// In fr, this message translates to:
  /// **'Ouvre la recherche d’adresse'**
  String get ouvreLaRechercheDAdresse;

  /// No description provided for @dateEtHeureDeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Date et heure de départ : {value1}'**
  String dateEtHeureDeDepart(Object value1);

  /// No description provided for @dateEtHeureDeDepart2.
  ///
  /// In fr, this message translates to:
  /// **'Date et heure de départ'**
  String get dateEtHeureDeDepart2;

  /// No description provided for @retirerUn.
  ///
  /// In fr, this message translates to:
  /// **'Retirer un {unit}'**
  String retirerUn(Object unit);

  /// No description provided for @ajouterUn.
  ///
  /// In fr, this message translates to:
  /// **'Ajouter un {unit}'**
  String ajouterUn(Object unit);

  /// No description provided for @siegeEnfant.
  ///
  /// In fr, this message translates to:
  /// **'{value1} siège{value2} enfant'**
  String siegeEnfant(Object value1, Object value2);

  /// No description provided for @bagageSupplementaire.
  ///
  /// In fr, this message translates to:
  /// **'bagage supplémentaire'**
  String get bagageSupplementaire;

  /// No description provided for @options.
  ///
  /// In fr, this message translates to:
  /// **'Options'**
  String get options;

  /// No description provided for @aucuneOption.
  ///
  /// In fr, this message translates to:
  /// **'Aucune option'**
  String get aucuneOption;

  /// No description provided for @siegesEnfants.
  ///
  /// In fr, this message translates to:
  /// **'Sièges enfants'**
  String get siegesEnfants;

  /// No description provided for @siegeEnfant2.
  ///
  /// In fr, this message translates to:
  /// **'siège enfant'**
  String get siegeEnfant2;

  /// No description provided for @wiFiABord.
  ///
  /// In fr, this message translates to:
  /// **'Wi-Fi à bord'**
  String get wiFiABord;

  /// No description provided for @bagageSupplementaire2.
  ///
  /// In fr, this message translates to:
  /// **'Bagage supplémentaire'**
  String get bagageSupplementaire2;

  /// No description provided for @lePrixAEteMis.
  ///
  /// In fr, this message translates to:
  /// **'Le prix a été mis à jour : {value1}. Confirmez pour payer ce montant.'**
  String lePrixAEteMis(Object value1);

  /// No description provided for @paiementAnnuleVotreReservationN.
  ///
  /// In fr, this message translates to:
  /// **'Paiement annulé. Votre réservation n’est pas confirmée tant qu’elle n’est pas payée.'**
  String get paiementAnnuleVotreReservationN;

  /// No description provided for @paiementRefuseEssayezUnAutre.
  ///
  /// In fr, this message translates to:
  /// **'Paiement refusé. Essayez un autre moyen de paiement.'**
  String get paiementRefuseEssayezUnAutre;

  /// No description provided for @paiement.
  ///
  /// In fr, this message translates to:
  /// **'Paiement'**
  String get paiement;

  /// No description provided for @aucuneReservationEnCoursRecommencez.
  ///
  /// In fr, this message translates to:
  /// **'Aucune réservation en cours. Recommencez depuis l’écran de réservation.'**
  String get aucuneReservationEnCoursRecommencez;

  /// No description provided for @votreTrajet.
  ///
  /// In fr, this message translates to:
  /// **'Votre trajet'**
  String get votreTrajet;

  /// No description provided for @passager2.
  ///
  /// In fr, this message translates to:
  /// **'{value1} passager{value2} · {value3}'**
  String passager2(Object value1, Object value2, Object value3);

  /// No description provided for @prix.
  ///
  /// In fr, this message translates to:
  /// **'Prix'**
  String get prix;

  /// No description provided for @htTva.
  ///
  /// In fr, this message translates to:
  /// **'{value1} (HT, TVA {value2} %)'**
  String htTva(Object value1, Object value2);

  /// No description provided for @totalTtc.
  ///
  /// In fr, this message translates to:
  /// **'Total TTC'**
  String get totalTtc;

  /// No description provided for @annulation.
  ///
  /// In fr, this message translates to:
  /// **'Annulation'**
  String get annulation;

  /// No description provided for @gratuiteJusquA24H.
  ///
  /// In fr, this message translates to:
  /// **'Gratuite jusqu’à 24 h avant le départ, puis 50 % de frais jusqu’à 2 h avant, 100 % ensuite. '**
  String get gratuiteJusquA24H;

  /// No description provided for @aucunFraisSiAucunChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Aucun frais si aucun chauffeur n’a encore été trouvé. Remboursement automatique.'**
  String get aucunFraisSiAucunChauffeur;

  /// No description provided for @paiementSecuriseParStripeXlcab.
  ///
  /// In fr, this message translates to:
  /// **'Paiement sécurisé par Stripe. XLCAB ne voit jamais votre numéro de carte.'**
  String get paiementSecuriseParStripeXlcab;

  /// No description provided for @paiementEnCours.
  ///
  /// In fr, this message translates to:
  /// **'Paiement en cours…'**
  String get paiementEnCours;

  /// No description provided for @selectionNavetteAVenir.
  ///
  /// In fr, this message translates to:
  /// **'Sélection navette — à venir'**
  String get selectionNavetteAVenir;

  /// No description provided for @carteDuTrajet.
  ///
  /// In fr, this message translates to:
  /// **'Carte du trajet'**
  String get carteDuTrajet;

  /// No description provided for @impossibleDeCalculerLePrix.
  ///
  /// In fr, this message translates to:
  /// **'Impossible de calculer le prix.'**
  String get impossibleDeCalculerLePrix;

  /// No description provided for @calculDuPrix.
  ///
  /// In fr, this message translates to:
  /// **'Calcul du prix…'**
  String get calculDuPrix;

  /// No description provided for @recapitulatif.
  ///
  /// In fr, this message translates to:
  /// **'Récapitulatif'**
  String get recapitulatif;

  /// No description provided for @calculDuPrixEnCours.
  ///
  /// In fr, this message translates to:
  /// **'Calcul du prix en cours'**
  String get calculDuPrixEnCours;

  /// No description provided for @environ.
  ///
  /// In fr, this message translates to:
  /// **'{value1} · environ {value2}'**
  String environ(Object value1, Object value2);

  /// No description provided for @colisHt.
  ///
  /// In fr, this message translates to:
  /// **'Colis (HT)'**
  String get colisHt;

  /// No description provided for @transportPassagersHt.
  ///
  /// In fr, this message translates to:
  /// **'Transport passagers (HT)'**
  String get transportPassagersHt;

  /// No description provided for @tva.
  ///
  /// In fr, this message translates to:
  /// **'TVA {value1} : {value2}'**
  String tva(Object value1, Object value2);

  /// No description provided for @portailCorporateAVenir.
  ///
  /// In fr, this message translates to:
  /// **'Portail corporate — à venir'**
  String get portailCorporateAVenir;

  /// No description provided for @impossibleDOuvrirLItineraire.
  ///
  /// In fr, this message translates to:
  /// **'Impossible d’ouvrir l’itinéraire sur ce téléphone.'**
  String get impossibleDOuvrirLItineraire;

  /// No description provided for @photoDuColisRemisObligatoire.
  ///
  /// In fr, this message translates to:
  /// **'Photo du colis remis obligatoire.'**
  String get photoDuColisRemisObligatoire;

  /// No description provided for @demarrerSansScanner.
  ///
  /// In fr, this message translates to:
  /// **'Démarrer sans scanner ?'**
  String get demarrerSansScanner;

  /// No description provided for @leScanDuQrProuve.
  ///
  /// In fr, this message translates to:
  /// **'Le scan du QR prouve que le passager est bien monté. Sans lui, '**
  String get leScanDuQrProuve;

  /// No description provided for @lEmbarquementNeSeraPas.
  ///
  /// In fr, this message translates to:
  /// **'l’embarquement ne sera pas confirmé en cas de litige.'**
  String get lEmbarquementNeSeraPas;

  /// No description provided for @demarrer.
  ///
  /// In fr, this message translates to:
  /// **'Démarrer'**
  String get demarrer;

  /// No description provided for @terminerLaCourse.
  ///
  /// In fr, this message translates to:
  /// **'Terminer la course ?'**
  String get terminerLaCourse;

  /// No description provided for @confirmezQueLePassagerA.
  ///
  /// In fr, this message translates to:
  /// **'Confirmez que le passager a été déposé à destination.'**
  String get confirmezQueLePassagerA;

  /// No description provided for @terminer.
  ///
  /// In fr, this message translates to:
  /// **'Terminer'**
  String get terminer;

  /// No description provided for @vousDesister.
  ///
  /// In fr, this message translates to:
  /// **'Vous désister ?'**
  String get vousDesister;

  /// No description provided for @laCourseSeraProposeeA.
  ///
  /// In fr, this message translates to:
  /// **'La course sera proposée à un autre chauffeur. Les désistements '**
  String get laCourseSeraProposeeA;

  /// No description provided for @repetesPeuventEntrainerUneSuspension.
  ///
  /// In fr, this message translates to:
  /// **'répétés peuvent entraîner une suspension du compte.'**
  String get repetesPeuventEntrainerUneSuspension;

  /// No description provided for @meDesister.
  ///
  /// In fr, this message translates to:
  /// **'Me désister'**
  String get meDesister;

  /// No description provided for @desistementDuChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Désistement du chauffeur'**
  String get desistementDuChauffeur;

  /// No description provided for @qrCodeNonReconnuCe.
  ///
  /// In fr, this message translates to:
  /// **'QR code non reconnu : ce n’est pas un QR XLCAB.'**
  String get qrCodeNonReconnuCe;

  /// No description provided for @retour.
  ///
  /// In fr, this message translates to:
  /// **'Retour'**
  String get retour;

  /// No description provided for @modeChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Mode chauffeur'**
  String get modeChauffeur;

  /// No description provided for @monCompte.
  ///
  /// In fr, this message translates to:
  /// **'Mon compte'**
  String get monCompte;

  /// No description provided for @chargementDuModeChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Chargement du mode chauffeur'**
  String get chargementDuModeChauffeur;

  /// No description provided for @votreCompteChauffeurEstEn.
  ///
  /// In fr, this message translates to:
  /// **'Votre compte chauffeur est en cours de validation par XLCAB. '**
  String get votreCompteChauffeurEstEn;

  /// No description provided for @vousPourrezPasserEnLigne.
  ///
  /// In fr, this message translates to:
  /// **'Vous pourrez passer en ligne dès son approbation.'**
  String get vousPourrezPasserEnLigne;

  /// No description provided for @enCourse.
  ///
  /// In fr, this message translates to:
  /// **'En course'**
  String get enCourse;

  /// No description provided for @mission.
  ///
  /// In fr, this message translates to:
  /// **'Mission'**
  String get mission;

  /// No description provided for @missionsAVenir.
  ///
  /// In fr, this message translates to:
  /// **'Missions à venir'**
  String get missionsAVenir;

  /// No description provided for @revenus.
  ///
  /// In fr, this message translates to:
  /// **'Revenus'**
  String get revenus;

  /// No description provided for @coursesRecentes.
  ///
  /// In fr, this message translates to:
  /// **'Courses récentes'**
  String get coursesRecentes;

  /// No description provided for @passezEnLignePourRecevoir.
  ///
  /// In fr, this message translates to:
  /// **'Passez en ligne pour recevoir des missions.'**
  String get passezEnLignePourRecevoir;

  /// No description provided for @connexionAuServeurLesMissions.
  ///
  /// In fr, this message translates to:
  /// **'Connexion au serveur… Les missions arriveront dès qu’elle sera rétablie.'**
  String get connexionAuServeurLesMissions;

  /// No description provided for @enAttenteDeMissionsGardez.
  ///
  /// In fr, this message translates to:
  /// **'En attente de missions. Gardez l’application ouverte.'**
  String get enAttenteDeMissionsGardez;

  /// No description provided for @enLigne.
  ///
  /// In fr, this message translates to:
  /// **'En ligne'**
  String get enLigne;

  /// No description provided for @horsLigne.
  ///
  /// In fr, this message translates to:
  /// **'Hors ligne'**
  String get horsLigne;

  /// No description provided for @noteCourses.
  ///
  /// In fr, this message translates to:
  /// **'Note {value1} · {value2} courses'**
  String noteCourses(Object value1, Object value2);

  /// No description provided for @disponiblePourDesMissions.
  ///
  /// In fr, this message translates to:
  /// **'Disponible pour des missions'**
  String get disponiblePourDesMissions;

  /// No description provided for @course.
  ///
  /// In fr, this message translates to:
  /// **'{value1} course{value2}'**
  String course(Object value1, Object value2);

  /// No description provided for @aujourdHui.
  ///
  /// In fr, this message translates to:
  /// **'Aujourd’hui'**
  String get aujourdHui;

  /// No description provided for @cetteSemaine.
  ///
  /// In fr, this message translates to:
  /// **'Cette semaine'**
  String get cetteSemaine;

  /// No description provided for @ceMois.
  ///
  /// In fr, this message translates to:
  /// **'Ce mois'**
  String get ceMois;

  /// No description provided for @revenuNetDesCoursesTerminees.
  ///
  /// In fr, this message translates to:
  /// **'Revenu net des courses terminées.'**
  String get revenuNetDesCoursesTerminees;

  /// No description provided for @revenuNetCommissionXlcabDe.
  ///
  /// In fr, this message translates to:
  /// **'Revenu net, commission XLCAB de {value1} déduite. '**
  String revenuNetCommissionXlcabDe(Object value1);

  /// No description provided for @ceMoisPayesParLes.
  ///
  /// In fr, this message translates to:
  /// **'Ce mois : {value1} payés par les clients, '**
  String ceMoisPayesParLes(Object value1);

  /// No description provided for @commission.
  ///
  /// In fr, this message translates to:
  /// **'commission {value1}.'**
  String commission(Object value1);

  /// No description provided for @remiseDuColis.
  ///
  /// In fr, this message translates to:
  /// **'Remise du colis'**
  String get remiseDuColis;

  /// No description provided for @demandezAuDestinataireSonCode.
  ///
  /// In fr, this message translates to:
  /// **'Demandez au destinataire son code de remise à 4 chiffres, puis photographiez le colis remis.'**
  String get demandezAuDestinataireSonCode;

  /// No description provided for @photographierEtValider.
  ///
  /// In fr, this message translates to:
  /// **'Photographier et valider'**
  String get photographierEtValider;

  /// No description provided for @jeNeRentrePasPar.
  ///
  /// In fr, this message translates to:
  /// **'Je ne rentre pas par ce trajet'**
  String get jeNeRentrePasPar;

  /// No description provided for @expediteurAbsent.
  ///
  /// In fr, this message translates to:
  /// **'Expéditeur absent'**
  String get expediteurAbsent;

  /// No description provided for @colisNonConformePoidsTaille.
  ///
  /// In fr, this message translates to:
  /// **'Colis non conforme (poids, taille, contenu)'**
  String get colisNonConformePoidsTaille;

  /// No description provided for @destinataireAbsentOuInjoignable.
  ///
  /// In fr, this message translates to:
  /// **'Destinataire absent ou injoignable'**
  String get destinataireAbsentOuInjoignable;

  /// No description provided for @codeDeRemiseRefuse.
  ///
  /// In fr, this message translates to:
  /// **'Code de remise refusé'**
  String get codeDeRemiseRefuse;

  /// No description provided for @colisEndommage.
  ///
  /// In fr, this message translates to:
  /// **'Colis endommagé'**
  String get colisEndommage;

  /// No description provided for @signaler.
  ///
  /// In fr, this message translates to:
  /// **'Signaler'**
  String get signaler;

  /// No description provided for @chargement.
  ///
  /// In fr, this message translates to:
  /// **'Chargement'**
  String get chargement;

  /// No description provided for @devenirChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Devenir chauffeur'**
  String get devenirChauffeur;

  /// No description provided for @photographiezChaqueDocumentEnEntier.
  ///
  /// In fr, this message translates to:
  /// **'Photographiez chaque document en entier, à plat et bien éclairé.'**
  String get photographiezChaqueDocumentEnEntier;

  /// No description provided for @precedent.
  ///
  /// In fr, this message translates to:
  /// **'Précédent'**
  String get precedent;

  /// No description provided for @envoi.
  ///
  /// In fr, this message translates to:
  /// **'Envoi…'**
  String get envoi;

  /// No description provided for @envoyerMonDossier.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer mon dossier'**
  String get envoyerMonDossier;

  /// No description provided for @suivant.
  ///
  /// In fr, this message translates to:
  /// **'Suivant'**
  String get suivant;

  /// No description provided for @prenom.
  ///
  /// In fr, this message translates to:
  /// **'Prénom'**
  String get prenom;

  /// No description provided for @nom.
  ///
  /// In fr, this message translates to:
  /// **'Nom'**
  String get nom;

  /// No description provided for @telephoneMobile.
  ///
  /// In fr, this message translates to:
  /// **'Téléphone mobile'**
  String get telephoneMobile;

  /// No description provided for @numeroDePermis.
  ///
  /// In fr, this message translates to:
  /// **'Numéro de permis'**
  String get numeroDePermis;

  /// No description provided for @dateDExpirationDuPermis2.
  ///
  /// In fr, this message translates to:
  /// **'Date d’expiration du permis'**
  String get dateDExpirationDuPermis2;

  /// No description provided for @numeroDeCarteVtc.
  ///
  /// In fr, this message translates to:
  /// **'Numéro de carte VTC'**
  String get numeroDeCarteVtc;

  /// No description provided for @dateDExpirationDeLa2.
  ///
  /// In fr, this message translates to:
  /// **'Date d’expiration de la carte VTC'**
  String get dateDExpirationDeLa2;

  /// No description provided for @numeroRevtcFacultatif.
  ///
  /// In fr, this message translates to:
  /// **'Numéro REVTC (facultatif)'**
  String get numeroRevtcFacultatif;

  /// No description provided for @formeEALAccueil.
  ///
  /// In fr, this message translates to:
  /// **'Formé(e) à l’accueil des personnes à mobilité réduite'**
  String get formeEALAccueil;

  /// No description provided for @obligatoirePourLaNavetteAccessibilite.
  ///
  /// In fr, this message translates to:
  /// **'Obligatoire pour la Navette Accessibilité'**
  String get obligatoirePourLaNavetteAccessibilite;

  /// No description provided for @photosDuPermisRectoEt.
  ///
  /// In fr, this message translates to:
  /// **'Photos du permis (recto) et de la carte VTC.'**
  String get photosDuPermisRectoEt;

  /// No description provided for @marque.
  ///
  /// In fr, this message translates to:
  /// **'Marque'**
  String get marque;

  /// No description provided for @modele.
  ///
  /// In fr, this message translates to:
  /// **'Modèle'**
  String get modele;

  /// No description provided for @couleur.
  ///
  /// In fr, this message translates to:
  /// **'Couleur'**
  String get couleur;

  /// No description provided for @immatriculation2.
  ///
  /// In fr, this message translates to:
  /// **'Immatriculation'**
  String get immatriculation2;

  /// No description provided for @placesPassagers.
  ///
  /// In fr, this message translates to:
  /// **'Places passagers'**
  String get placesPassagers;

  /// No description provided for @n7Places.
  ///
  /// In fr, this message translates to:
  /// **'7 places'**
  String get n7Places;

  /// No description provided for @n8Places.
  ///
  /// In fr, this message translates to:
  /// **'8 places'**
  String get n8Places;

  /// No description provided for @navetteSouhaitee.
  ///
  /// In fr, this message translates to:
  /// **'Navette souhaitée'**
  String get navetteSouhaitee;

  /// No description provided for @navetteRoseConductricesUniquementSous.
  ///
  /// In fr, this message translates to:
  /// **'Navette Rose : conductrices uniquement, sous réserve d’habilitation par l’équipe XLCAB.'**
  String get navetteRoseConductricesUniquementSous;

  /// No description provided for @vehiculeEquipePmrRampeFixations.
  ///
  /// In fr, this message translates to:
  /// **'Véhicule équipé PMR (rampe, fixations)'**
  String get vehiculeEquipePmrRampeFixations;

  /// No description provided for @dashcamInstalleeEtFonctionnelleObligatoire.
  ///
  /// In fr, this message translates to:
  /// **'Dashcam installée et fonctionnelle (obligatoire)'**
  String get dashcamInstalleeEtFonctionnelleObligatoire;

  /// No description provided for @echeanceDeLAssurance.
  ///
  /// In fr, this message translates to:
  /// **'Échéance de l’assurance'**
  String get echeanceDeLAssurance;

  /// No description provided for @echeanceDuControleTechnique.
  ///
  /// In fr, this message translates to:
  /// **'Échéance du contrôle technique'**
  String get echeanceDuControleTechnique;

  /// No description provided for @identite.
  ///
  /// In fr, this message translates to:
  /// **'Identité'**
  String get identite;

  /// No description provided for @places2.
  ///
  /// In fr, this message translates to:
  /// **'{value1} places · {value2}'**
  String places2(Object value1, Object value2);

  /// No description provided for @documents.
  ///
  /// In fr, this message translates to:
  /// **'Documents'**
  String get documents;

  /// No description provided for @documentsObligatoiresRecus.
  ///
  /// In fr, this message translates to:
  /// **'{docsCount} / {value1} documents obligatoires reçus'**
  String documentsObligatoiresRecus(Object docsCount, Object value1);

  /// No description provided for @jAccepteQueXlcabTraite.
  ///
  /// In fr, this message translates to:
  /// **'J’accepte que XLCAB traite mes documents pour vérifier mon dossier chauffeur. '**
  String get jAccepteQueXlcabTraite;

  /// No description provided for @lesJustificatifsVtcSontConserves.
  ///
  /// In fr, this message translates to:
  /// **'Les justificatifs VTC sont conservés 10 ans (obligation légale).'**
  String get lesJustificatifsVtcSontConserves;

  /// No description provided for @etapeSur.
  ///
  /// In fr, this message translates to:
  /// **'Étape {value1} sur {onboardingStepCount} : {value2}'**
  String etapeSur(Object value1, Object onboardingStepCount, Object value2);

  /// No description provided for @etapeSur2.
  ///
  /// In fr, this message translates to:
  /// **'Étape {value1} sur {onboardingStepCount}'**
  String etapeSur2(Object value1, Object onboardingStepCount);

  /// No description provided for @compteChauffeurValide.
  ///
  /// In fr, this message translates to:
  /// **'Compte chauffeur validé'**
  String get compteChauffeurValide;

  /// No description provided for @dossierEnCoursDeVerification.
  ///
  /// In fr, this message translates to:
  /// **'Dossier en cours de vérification'**
  String get dossierEnCoursDeVerification;

  /// No description provided for @vousPouvezPasserEnLigne.
  ///
  /// In fr, this message translates to:
  /// **'Vous pouvez passer en ligne et recevoir des missions.'**
  String get vousPouvezPasserEnLigne;

  /// No description provided for @lEquipeXlcabVerifieVos.
  ///
  /// In fr, this message translates to:
  /// **'L’équipe XLCAB vérifie vos documents. Vous serez informé(e) dès la validation de votre dossier.'**
  String get lEquipeXlcabVerifieVos;

  /// No description provided for @passerEnModeChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Passer en mode chauffeur'**
  String get passerEnModeChauffeur;

  /// No description provided for @nonEnvoye.
  ///
  /// In fr, this message translates to:
  /// **'Non envoyé'**
  String get nonEnvoye;

  /// No description provided for @envoiEnCours.
  ///
  /// In fr, this message translates to:
  /// **'Envoi en cours…'**
  String get envoiEnCours;

  /// No description provided for @recuEnAttenteDeVerification.
  ///
  /// In fr, this message translates to:
  /// **'Reçu — en attente de vérification'**
  String get recuEnAttenteDeVerification;

  /// No description provided for @echecDeLEnvoi.
  ///
  /// In fr, this message translates to:
  /// **'Échec de l’envoi'**
  String get echecDeLEnvoi;

  /// No description provided for @texte8.
  ///
  /// In fr, this message translates to:
  /// **'{value1} : {text}'**
  String texte8(Object value1, Object text);

  /// No description provided for @reprendreLaPhoto.
  ///
  /// In fr, this message translates to:
  /// **'Reprendre la photo'**
  String get reprendreLaPhoto;

  /// No description provided for @photographier.
  ///
  /// In fr, this message translates to:
  /// **'Photographier'**
  String get photographier;

  /// No description provided for @galerie.
  ///
  /// In fr, this message translates to:
  /// **'Galerie'**
  String get galerie;

  /// No description provided for @retourColisARamener.
  ///
  /// In fr, this message translates to:
  /// **'Retour : colis à ramener'**
  String get retourColisARamener;

  /// No description provided for @courseEnCours.
  ///
  /// In fr, this message translates to:
  /// **'Course en cours'**
  String get courseEnCours;

  /// No description provided for @navetteColis.
  ///
  /// In fr, this message translates to:
  /// **'Navette colis'**
  String get navetteColis;

  /// No description provided for @prochaineMission.
  ///
  /// In fr, this message translates to:
  /// **'Prochaine mission'**
  String get prochaineMission;

  /// No description provided for @embarque.
  ///
  /// In fr, this message translates to:
  /// **'{value1} (embarqué)'**
  String embarque(Object value1);

  /// No description provided for @colisARamenerAuRetour.
  ///
  /// In fr, this message translates to:
  /// **'{value1} colis à ramener au retour : vous ne rentrerez pas à vide.'**
  String colisARamenerAuRetour(Object value1);

  /// No description provided for @itineraireDuRetour.
  ///
  /// In fr, this message translates to:
  /// **'Itinéraire du retour'**
  String get itineraireDuRetour;

  /// No description provided for @versLArrivee.
  ///
  /// In fr, this message translates to:
  /// **'Vers l’arrivée'**
  String get versLArrivee;

  /// No description provided for @versLeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Vers le départ'**
  String get versLeDepart;

  /// No description provided for @appeler.
  ///
  /// In fr, this message translates to:
  /// **'Appeler'**
  String get appeler;

  /// No description provided for @terminerLaCourse2.
  ///
  /// In fr, this message translates to:
  /// **'Terminer la course'**
  String get terminerLaCourse2;

  /// No description provided for @scannerLeColisEtDemarrer.
  ///
  /// In fr, this message translates to:
  /// **'Scanner le colis et démarrer'**
  String get scannerLeColisEtDemarrer;

  /// No description provided for @scannerLeQrEtDemarrer.
  ///
  /// In fr, this message translates to:
  /// **'Scanner le QR et démarrer'**
  String get scannerLeQrEtDemarrer;

  /// No description provided for @demarrerSansScanner2.
  ///
  /// In fr, this message translates to:
  /// **'Démarrer sans scanner'**
  String get demarrerSansScanner2;

  /// No description provided for @demarragePossible1HAvant.
  ///
  /// In fr, this message translates to:
  /// **'Démarrage possible 1 h avant le départ.'**
  String get demarragePossible1HAvant;

  /// No description provided for @meDesisterDeCetteCourse.
  ///
  /// In fr, this message translates to:
  /// **'Me désister de cette course'**
  String get meDesisterDeCetteCourse;

  /// No description provided for @pass.
  ///
  /// In fr, this message translates to:
  /// **'{value1} pass.'**
  String pass(Object value1);

  /// No description provided for @colis2.
  ///
  /// In fr, this message translates to:
  /// **'{value1} colis'**
  String colis2(Object value1);

  /// No description provided for @nouvelleMission.
  ///
  /// In fr, this message translates to:
  /// **'Nouvelle mission'**
  String get nouvelleMission;

  /// No description provided for @priseEnChargeA.
  ///
  /// In fr, this message translates to:
  /// **'Prise en charge à {value1}'**
  String priseEnChargeA(Object value1);

  /// No description provided for @refuser.
  ///
  /// In fr, this message translates to:
  /// **'Refuser'**
  String get refuser;

  /// No description provided for @accepter.
  ///
  /// In fr, this message translates to:
  /// **'Accepter'**
  String get accepter;

  /// No description provided for @secondesPourRepondre.
  ///
  /// In fr, this message translates to:
  /// **'{seconds} secondes pour répondre'**
  String secondesPourRepondre(Object seconds);

  /// No description provided for @colisTraite.
  ///
  /// In fr, this message translates to:
  /// **'Colis ({done}/{value1} traité{value2})'**
  String colisTraite(Object done, Object value1, Object value2);

  /// No description provided for @remise.
  ///
  /// In fr, this message translates to:
  /// **'Remise : {value1} — {value2}'**
  String remise(Object value1, Object value2);

  /// No description provided for @enlevement.
  ///
  /// In fr, this message translates to:
  /// **'Enlèvement : {value1} — {value2}'**
  String enlevement(Object value1, Object value2);

  /// No description provided for @scannerLeColis.
  ///
  /// In fr, this message translates to:
  /// **'Scanner le colis'**
  String get scannerLeColis;

  /// No description provided for @remettreLeColis.
  ///
  /// In fr, this message translates to:
  /// **'Remettre le colis'**
  String get remettreLeColis;

  /// No description provided for @appelerLExpediteur.
  ///
  /// In fr, this message translates to:
  /// **'Appeler l’expéditeur'**
  String get appelerLExpediteur;

  /// No description provided for @appelerLeDestinataire.
  ///
  /// In fr, this message translates to:
  /// **'Appeler le destinataire'**
  String get appelerLeDestinataire;

  /// No description provided for @nosNavettes.
  ///
  /// In fr, this message translates to:
  /// **'Nos navettes'**
  String get nosNavettes;

  /// No description provided for @derniersTrajets.
  ///
  /// In fr, this message translates to:
  /// **'Derniers trajets'**
  String get derniersTrajets;

  /// No description provided for @chargementDeVosTrajets.
  ///
  /// In fr, this message translates to:
  /// **'Chargement de vos trajets'**
  String get chargementDeVosTrajets;

  /// No description provided for @impossibleDeChargerVosTrajets.
  ///
  /// In fr, this message translates to:
  /// **'Impossible de charger vos trajets.'**
  String get impossibleDeChargerVosTrajets;

  /// No description provided for @monProfil.
  ///
  /// In fr, this message translates to:
  /// **'Mon profil'**
  String get monProfil;

  /// No description provided for @bonjour.
  ///
  /// In fr, this message translates to:
  /// **'Bonjour'**
  String get bonjour;

  /// No description provided for @ouAllonsNousAujourdHui.
  ///
  /// In fr, this message translates to:
  /// **'Où allons-nous aujourd\'hui ?'**
  String get ouAllonsNousAujourdHui;

  /// No description provided for @notifications.
  ///
  /// In fr, this message translates to:
  /// **'Notifications'**
  String get notifications;

  /// No description provided for @lesNotificationsArriventBientot.
  ///
  /// In fr, this message translates to:
  /// **'Les notifications arrivent bientôt.'**
  String get lesNotificationsArriventBientot;

  /// No description provided for @navettes7PlacesTrajets60.
  ///
  /// In fr, this message translates to:
  /// **'Navettes 7+ places · Trajets 60 km+ · Colis inclus'**
  String get navettes7PlacesTrajets60;

  /// No description provided for @aucunTrajetPourLInstant.
  ///
  /// In fr, this message translates to:
  /// **'Aucun trajet pour l\'instant'**
  String get aucunTrajetPourLInstant;

  /// No description provided for @vosProchainsTrajetsApparaitrontIci.
  ///
  /// In fr, this message translates to:
  /// **'Vos prochains trajets apparaîtront ici.'**
  String get vosProchainsTrajetsApparaitrontIci;

  /// No description provided for @vousEtesChauffeurVtc.
  ///
  /// In fr, this message translates to:
  /// **'Vous êtes chauffeur VTC ?'**
  String get vousEtesChauffeurVtc;

  /// No description provided for @rejoignezXlcabEtConduisezUne.
  ///
  /// In fr, this message translates to:
  /// **'Rejoignez XLCAB et conduisez une navette 7+ places sur des trajets de 60 km et plus.'**
  String get rejoignezXlcabEtConduisezUne;

  /// No description provided for @devenirChauffeurXlcab.
  ///
  /// In fr, this message translates to:
  /// **'Devenir chauffeur XLCAB'**
  String get devenirChauffeurXlcab;

  /// No description provided for @accueil.
  ///
  /// In fr, this message translates to:
  /// **'Accueil'**
  String get accueil;

  /// No description provided for @reserver.
  ///
  /// In fr, this message translates to:
  /// **'Réserver'**
  String get reserver;

  /// No description provided for @profil.
  ///
  /// In fr, this message translates to:
  /// **'Profil'**
  String get profil;

  /// No description provided for @ouvreLeSuiviEnTemps.
  ///
  /// In fr, this message translates to:
  /// **'Ouvre le suivi en temps réel'**
  String get ouvreLeSuiviEnTemps;

  /// No description provided for @depart2.
  ///
  /// In fr, this message translates to:
  /// **'Départ : {value1}'**
  String depart2(Object value1);

  /// No description provided for @arrivee2.
  ///
  /// In fr, this message translates to:
  /// **'Arrivée : {value1}'**
  String arrivee2(Object value1);

  /// No description provided for @navettes7Places.
  ///
  /// In fr, this message translates to:
  /// **'Navettes 7+ places'**
  String get navettes7Places;

  /// No description provided for @voyagezAPlusieursDansUne.
  ///
  /// In fr, this message translates to:
  /// **'Voyagez à plusieurs dans une navette confortable, réservée à l’avance.'**
  String get voyagezAPlusieursDansUne;

  /// No description provided for @trajets60Km.
  ///
  /// In fr, this message translates to:
  /// **'Trajets 60 km+'**
  String get trajets60Km;

  /// No description provided for @pensePourLesLonguesDistances.
  ///
  /// In fr, this message translates to:
  /// **'Pensé pour les longues distances : grandes villes, aéroports, régions voisines.'**
  String get pensePourLesLonguesDistances;

  /// No description provided for @colisInclus.
  ///
  /// In fr, this message translates to:
  /// **'Colis inclus'**
  String get colisInclus;

  /// No description provided for @envoyezUnColisSurLe.
  ///
  /// In fr, this message translates to:
  /// **'Envoyez un colis sur le trajet d’une navette, suivi jusqu’à sa remise.'**
  String get envoyezUnColisSurLe;

  /// No description provided for @passer.
  ///
  /// In fr, this message translates to:
  /// **'Passer'**
  String get passer;

  /// No description provided for @pageSur.
  ///
  /// In fr, this message translates to:
  /// **'Page {value1} sur {value2}'**
  String pageSur(Object value1, Object value2);

  /// No description provided for @commencer.
  ///
  /// In fr, this message translates to:
  /// **'Commencer'**
  String get commencer;

  /// No description provided for @chargementDesPreferences.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des préférences'**
  String get chargementDesPreferences;

  /// No description provided for @preferencesIndisponibles.
  ///
  /// In fr, this message translates to:
  /// **'Préférences indisponibles.'**
  String get preferencesIndisponibles;

  /// No description provided for @lesMessagesIndispensablesAUne.
  ///
  /// In fr, this message translates to:
  /// **'Les messages indispensables à une course (chauffeur en route, arrivée, sécurité) sont toujours envoyés.'**
  String get lesMessagesIndispensablesAUne;

  /// No description provided for @notificationsSurLeTelephone.
  ///
  /// In fr, this message translates to:
  /// **'Notifications sur le téléphone'**
  String get notificationsSurLeTelephone;

  /// No description provided for @rappelsDeDepartSuiviDe.
  ///
  /// In fr, this message translates to:
  /// **'Rappels de départ, suivi de colis'**
  String get rappelsDeDepartSuiviDe;

  /// No description provided for @confirmationsFacturesRecus.
  ///
  /// In fr, this message translates to:
  /// **'Confirmations, factures, reçus'**
  String get confirmationsFacturesRecus;

  /// No description provided for @rappelLaVeilleDuDepart.
  ///
  /// In fr, this message translates to:
  /// **'Rappel la veille du départ'**
  String get rappelLaVeilleDuDepart;

  /// No description provided for @offresEtNouveautesXlcab.
  ///
  /// In fr, this message translates to:
  /// **'Offres et nouveautés XLCAB'**
  String get offresEtNouveautesXlcab;

  /// No description provided for @nouvellesLignesPromotionsDesactivableA.
  ///
  /// In fr, this message translates to:
  /// **'Nouvelles lignes, promotions. Désactivable à tout moment.'**
  String get nouvellesLignesPromotionsDesactivableA;

  /// No description provided for @carteEnregistree.
  ///
  /// In fr, this message translates to:
  /// **'Carte enregistrée.'**
  String get carteEnregistree;

  /// No description provided for @carteRefusee.
  ///
  /// In fr, this message translates to:
  /// **'Carte refusée.'**
  String get carteRefusee;

  /// No description provided for @supprimerCetteCarte.
  ///
  /// In fr, this message translates to:
  /// **'Supprimer cette carte ?'**
  String get supprimerCetteCarte;

  /// No description provided for @seTerminantPar.
  ///
  /// In fr, this message translates to:
  /// **'{value1} se terminant par {value2}'**
  String seTerminantPar(Object value1, Object value2);

  /// No description provided for @supprimer.
  ///
  /// In fr, this message translates to:
  /// **'Supprimer'**
  String get supprimer;

  /// No description provided for @carteSupprimee.
  ///
  /// In fr, this message translates to:
  /// **'Carte supprimée.'**
  String get carteSupprimee;

  /// No description provided for @moyensDePaiement.
  ///
  /// In fr, this message translates to:
  /// **'Moyens de paiement'**
  String get moyensDePaiement;

  /// No description provided for @chargementDesCartes.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des cartes'**
  String get chargementDesCartes;

  /// No description provided for @cartesIndisponibles.
  ///
  /// In fr, this message translates to:
  /// **'Cartes indisponibles.'**
  String get cartesIndisponibles;

  /// No description provided for @aucuneCarteEnregistreeVousPourrez.
  ///
  /// In fr, this message translates to:
  /// **'Aucune carte enregistrée. Vous pourrez aussi en enregistrer une au moment du paiement.'**
  String get aucuneCarteEnregistreeVousPourrez;

  /// No description provided for @expiree.
  ///
  /// In fr, this message translates to:
  /// **'Expirée ({value1})'**
  String expiree(Object value1);

  /// No description provided for @expireFin.
  ///
  /// In fr, this message translates to:
  /// **'Expire fin {value1}'**
  String expireFin(Object value1);

  /// No description provided for @supprimerLaCarteSeTerminant.
  ///
  /// In fr, this message translates to:
  /// **'Supprimer la carte {value1} se terminant par {value2}'**
  String supprimerLaCarteSeTerminant(Object value1, Object value2);

  /// No description provided for @ajouterUneCarte.
  ///
  /// In fr, this message translates to:
  /// **'Ajouter une carte'**
  String get ajouterUneCarte;

  /// No description provided for @cartesConserveesParStripeCertifie.
  ///
  /// In fr, this message translates to:
  /// **'Cartes conservées par Stripe (certifié PCI-DSS). XLCAB ne voit jamais votre numéro de carte.'**
  String get cartesConserveesParStripeCertifie;

  /// No description provided for @passager3.
  ///
  /// In fr, this message translates to:
  /// **'Passager'**
  String get passager3;

  /// No description provided for @chauffeur2.
  ///
  /// In fr, this message translates to:
  /// **'Chauffeur'**
  String get chauffeur2;

  /// No description provided for @administrateurEntreprise.
  ///
  /// In fr, this message translates to:
  /// **'Administrateur entreprise'**
  String get administrateurEntreprise;

  /// No description provided for @collaborateurEntreprise.
  ///
  /// In fr, this message translates to:
  /// **'Collaborateur entreprise'**
  String get collaborateurEntreprise;

  /// No description provided for @equipeXlcab.
  ///
  /// In fr, this message translates to:
  /// **'Équipe XLCAB'**
  String get equipeXlcab;

  /// No description provided for @mesTrajetsEtPaiements.
  ///
  /// In fr, this message translates to:
  /// **'Mes trajets et paiements'**
  String get mesTrajetsEtPaiements;

  /// No description provided for @historiqueDesTrajets.
  ///
  /// In fr, this message translates to:
  /// **'Historique des trajets'**
  String get historiqueDesTrajets;

  /// No description provided for @preferences.
  ///
  /// In fr, this message translates to:
  /// **'Préférences'**
  String get preferences;

  /// No description provided for @informationsLegales.
  ///
  /// In fr, this message translates to:
  /// **'Informations légales'**
  String get informationsLegales;

  /// No description provided for @politiqueDeConfidentialite.
  ///
  /// In fr, this message translates to:
  /// **'Politique de confidentialité'**
  String get politiqueDeConfidentialite;

  /// No description provided for @conditionsGeneralesCguCgv.
  ///
  /// In fr, this message translates to:
  /// **'Conditions générales (CGU / CGV)'**
  String get conditionsGeneralesCguCgv;

  /// No description provided for @protectionDesDonnees.
  ///
  /// In fr, this message translates to:
  /// **'Protection des données'**
  String get protectionDesDonnees;

  /// No description provided for @seDeconnecter.
  ///
  /// In fr, this message translates to:
  /// **'Se déconnecter'**
  String get seDeconnecter;

  /// No description provided for @supprimerMonCompte.
  ///
  /// In fr, this message translates to:
  /// **'Supprimer mon compte'**
  String get supprimerMonCompte;

  /// No description provided for @xlcabVersion.
  ///
  /// In fr, this message translates to:
  /// **'XLCAB version {appVersion}'**
  String xlcabVersion(Object appVersion);

  /// No description provided for @impossibleDOuvrirLeLien.
  ///
  /// In fr, this message translates to:
  /// **'Impossible d’ouvrir le lien sur ce téléphone.'**
  String get impossibleDOuvrirLeLien;

  /// No description provided for @modifierMonNom.
  ///
  /// In fr, this message translates to:
  /// **'Modifier mon nom'**
  String get modifierMonNom;

  /// No description provided for @champObligatoire.
  ///
  /// In fr, this message translates to:
  /// **'Champ obligatoire'**
  String get champObligatoire;

  /// No description provided for @monNom.
  ///
  /// In fr, this message translates to:
  /// **'Mon nom'**
  String get monNom;

  /// No description provided for @enregistrer.
  ///
  /// In fr, this message translates to:
  /// **'Enregistrer'**
  String get enregistrer;

  /// No description provided for @supprimerVotreCompte.
  ///
  /// In fr, this message translates to:
  /// **'Supprimer votre compte ?'**
  String get supprimerVotreCompte;

  /// No description provided for @cetteActionEstDefinitiveVos.
  ///
  /// In fr, this message translates to:
  /// **'Cette action est définitive. Vos nom, e-mail, téléphone et cartes enregistrées seront effacés. '**
  String get cetteActionEstDefinitiveVos;

  /// No description provided for @lHistoriqueDeVosCourses.
  ///
  /// In fr, this message translates to:
  /// **'L’historique de vos courses est conservé de façon anonyme pour nos obligations comptables.'**
  String get lHistoriqueDeVosCourses;

  /// No description provided for @garderMonCompte.
  ///
  /// In fr, this message translates to:
  /// **'Garder mon compte'**
  String get garderMonCompte;

  /// No description provided for @apparence.
  ///
  /// In fr, this message translates to:
  /// **'Apparence'**
  String get apparence;

  /// No description provided for @systeme.
  ///
  /// In fr, this message translates to:
  /// **'Système'**
  String get systeme;

  /// No description provided for @nouvelleAdresseFavorite.
  ///
  /// In fr, this message translates to:
  /// **'Nouvelle adresse favorite'**
  String get nouvelleAdresseFavorite;

  /// No description provided for @ajouteeAVosAdresses.
  ///
  /// In fr, this message translates to:
  /// **'« {label} » ajoutée à vos adresses.'**
  String ajouteeAVosAdresses(Object label);

  /// No description provided for @supprimer2.
  ///
  /// In fr, this message translates to:
  /// **'Supprimer « {value1} » ?'**
  String supprimer2(Object value1);

  /// No description provided for @chargementDesAdresses.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des adresses'**
  String get chargementDesAdresses;

  /// No description provided for @adressesIndisponibles.
  ///
  /// In fr, this message translates to:
  /// **'Adresses indisponibles.'**
  String get adressesIndisponibles;

  /// No description provided for @enregistrezVosAdressesHabituellesMaison.
  ///
  /// In fr, this message translates to:
  /// **'Enregistrez vos adresses habituelles (maison, travail…) pour réserver plus vite.'**
  String get enregistrezVosAdressesHabituellesMaison;

  /// No description provided for @supprimer3.
  ///
  /// In fr, this message translates to:
  /// **'Supprimer {value1}'**
  String supprimer3(Object value1);

  /// No description provided for @ajouterUneAdresse.
  ///
  /// In fr, this message translates to:
  /// **'Ajouter une adresse'**
  String get ajouterUneAdresse;

  /// No description provided for @n10AdressesAuMaximumSupprimez.
  ///
  /// In fr, this message translates to:
  /// **'10 adresses au maximum : supprimez-en une pour en ajouter.'**
  String get n10AdressesAuMaximumSupprimez;

  /// No description provided for @nomDeLAdresse.
  ///
  /// In fr, this message translates to:
  /// **'Nom de l’adresse'**
  String get nomDeLAdresse;

  /// No description provided for @maison.
  ///
  /// In fr, this message translates to:
  /// **'Maison'**
  String get maison;

  /// No description provided for @travail.
  ///
  /// In fr, this message translates to:
  /// **'Travail'**
  String get travail;

  /// No description provided for @famille.
  ///
  /// In fr, this message translates to:
  /// **'Famille'**
  String get famille;

  /// No description provided for @historiqueIndisponible.
  ///
  /// In fr, this message translates to:
  /// **'Historique indisponible.'**
  String get historiqueIndisponible;

  /// No description provided for @chargementDeLHistorique.
  ///
  /// In fr, this message translates to:
  /// **'Chargement de l’historique'**
  String get chargementDeLHistorique;

  /// No description provided for @aucunTrajetPourLeMoment.
  ///
  /// In fr, this message translates to:
  /// **'Aucun trajet pour le moment.'**
  String get aucunTrajetPourLeMoment;

  /// No description provided for @voirLesTrajetsPlusAnciens.
  ///
  /// In fr, this message translates to:
  /// **'Voir les trajets plus anciens'**
  String get voirLesTrajetsPlusAnciens;

  /// No description provided for @payeParLEntreprise.
  ///
  /// In fr, this message translates to:
  /// **'Payé par l’entreprise'**
  String get payeParLEntreprise;

  /// No description provided for @navettes7PlacesTrajets602.
  ///
  /// In fr, this message translates to:
  /// **'Navettes 7+ places.\nTrajets 60 km+. Colis inclus.'**
  String get navettes7PlacesTrajets602;

  /// No description provided for @suiviDuTrajet.
  ///
  /// In fr, this message translates to:
  /// **'Suivi du trajet'**
  String get suiviDuTrajet;

  /// No description provided for @chargementDuSuivi.
  ///
  /// In fr, this message translates to:
  /// **'Chargement du suivi'**
  String get chargementDuSuivi;

  /// No description provided for @environMinutes.
  ///
  /// In fr, this message translates to:
  /// **'{value1} : environ {value2} minutes'**
  String environMinutes(Object value1, Object value2);

  /// No description provided for @voirLeProfilDuChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Voir le profil du chauffeur'**
  String get voirLeProfilDuChauffeur;

  /// No description provided for @avantLArriveeDuChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'avant l’arrivée du chauffeur'**
  String get avantLArriveeDuChauffeur;

  /// No description provided for @avantLArriveeADestination.
  ///
  /// In fr, this message translates to:
  /// **'avant l’arrivée à destination'**
  String get avantLArriveeADestination;

  /// No description provided for @noteSur5.
  ///
  /// In fr, this message translates to:
  /// **'Note {value1} sur 5'**
  String noteSur5(Object value1);

  /// No description provided for @dashcam.
  ///
  /// In fr, this message translates to:
  /// **'Dashcam'**
  String get dashcam;

  /// No description provided for @equipePmr.
  ///
  /// In fr, this message translates to:
  /// **'Équipé PMR'**
  String get equipePmr;

  /// No description provided for @message.
  ///
  /// In fr, this message translates to:
  /// **'Message'**
  String get message;

  /// No description provided for @partager.
  ///
  /// In fr, this message translates to:
  /// **'Partager'**
  String get partager;

  /// No description provided for @jeSuisEnTrajetXlcab.
  ///
  /// In fr, this message translates to:
  /// **'Je suis en trajet XLCAB vers {value1}.'**
  String jeSuisEnTrajetXlcab(Object value1);

  /// No description provided for @chauffeur3.
  ///
  /// In fr, this message translates to:
  /// **'Chauffeur : {value1}'**
  String chauffeur3(Object value1);

  /// No description provided for @arriveeEstimeeDansMin.
  ///
  /// In fr, this message translates to:
  /// **'Arrivée estimée dans ≈ {value1} min.'**
  String arriveeEstimeeDansMin(Object value1);

  /// No description provided for @infosDuTrajetCopieesCollez.
  ///
  /// In fr, this message translates to:
  /// **'Infos du trajet copiées : collez-les dans un message à un proche.'**
  String get infosDuTrajetCopieesCollez;

  /// No description provided for @connexionAuSuiviEnDirect.
  ///
  /// In fr, this message translates to:
  /// **'Connexion au suivi en direct…'**
  String get connexionAuSuiviEnDirect;

  /// No description provided for @connexionPerdueMiseAJour.
  ///
  /// In fr, this message translates to:
  /// **'Connexion perdue · mise à jour toutes les 10 s'**
  String get connexionPerdueMiseAJour;

  /// No description provided for @messages.
  ///
  /// In fr, this message translates to:
  /// **'Messages'**
  String get messages;

  /// No description provided for @aucunMessagePourLInstant.
  ///
  /// In fr, this message translates to:
  /// **'Aucun message pour l’instant.'**
  String get aucunMessagePourLInstant;

  /// No description provided for @votreMessage.
  ///
  /// In fr, this message translates to:
  /// **'Votre message'**
  String get votreMessage;

  /// No description provided for @sosAlerteDUrgence.
  ///
  /// In fr, this message translates to:
  /// **'SOS, alerte d’urgence'**
  String get sosAlerteDUrgence;

  /// No description provided for @besoinDAide.
  ///
  /// In fr, this message translates to:
  /// **'Besoin d’aide ?'**
  String get besoinDAide;

  /// No description provided for @enCasDeDangerImmediat2.
  ///
  /// In fr, this message translates to:
  /// **'En cas de danger immédiat, appelez le 112.\n\n'**
  String get enCasDeDangerImmediat2;

  /// No description provided for @vousPouvezAussiAlerterL.
  ///
  /// In fr, this message translates to:
  /// **'Vous pouvez aussi alerter l’équipe XLCAB : votre position sera '**
  String get vousPouvezAussiAlerterL;

  /// No description provided for @transmiseAvecLAlerte.
  ///
  /// In fr, this message translates to:
  /// **'transmise avec l’alerte.'**
  String get transmiseAvecLAlerte;

  /// No description provided for @appelerLe.
  ///
  /// In fr, this message translates to:
  /// **'Appeler le {emergencyNumber}'**
  String appelerLe(Object emergencyNumber);

  /// No description provided for @alerterXlcab.
  ///
  /// In fr, this message translates to:
  /// **'Alerter XLCAB'**
  String get alerterXlcab;

  /// No description provided for @alerteEnvoyeeALEquipe.
  ///
  /// In fr, this message translates to:
  /// **'Alerte envoyée à l’équipe XLCAB avec votre position.'**
  String get alerteEnvoyeeALEquipe;

  /// No description provided for @alerteNonTransmiseAppelezLe.
  ///
  /// In fr, this message translates to:
  /// **'Alerte non transmise. Appelez le {emergencyNumber}.'**
  String alerteNonTransmiseAppelezLe(Object emergencyNumber);

  /// No description provided for @carteDuTrajetEnTemps.
  ///
  /// In fr, this message translates to:
  /// **'Carte du trajet en temps réel'**
  String get carteDuTrajetEnTemps;

  /// No description provided for @reponseInattendueDuServeurReessayez.
  ///
  /// In fr, this message translates to:
  /// **'Réponse inattendue du serveur. Réessayez plus tard.'**
  String get reponseInattendueDuServeurReessayez;

  /// No description provided for @pasDeConnexionInternetVerifiez.
  ///
  /// In fr, this message translates to:
  /// **'Pas de connexion internet. Vérifiez votre réseau.'**
  String get pasDeConnexionInternetVerifiez;

  /// No description provided for @emailOuMotDePasse.
  ///
  /// In fr, this message translates to:
  /// **'Email ou mot de passe incorrect.'**
  String get emailOuMotDePasse;

  /// No description provided for @photoTropLourdeMemeApres.
  ///
  /// In fr, this message translates to:
  /// **'Photo trop lourde même après compression. Réessayez avec une photo plus nette et mieux cadrée.'**
  String get photoTropLourdeMemeApres;

  /// No description provided for @xlcabVousEtesEnLigne.
  ///
  /// In fr, this message translates to:
  /// **'XLCAB — vous êtes en ligne'**
  String get xlcabVousEtesEnLigne;

  /// No description provided for @votrePositionEstPartageePour.
  ///
  /// In fr, this message translates to:
  /// **'Votre position est partagée pour recevoir des missions.'**
  String get votrePositionEstPartageePour;

  /// No description provided for @scannerLeQrDuPassager.
  ///
  /// In fr, this message translates to:
  /// **'Scanner le QR du passager'**
  String get scannerLeQrDuPassager;

  /// No description provided for @cadrezLeQrCodeAffiche.
  ///
  /// In fr, this message translates to:
  /// **'Cadrez le QR code affiché sur le téléphone du passager'**
  String get cadrezLeQrCodeAffiche;

  /// No description provided for @fichierTropVolumineux2Mo.
  ///
  /// In fr, this message translates to:
  /// **'Fichier trop volumineux (2 Mo maximum).'**
  String get fichierTropVolumineux2Mo;

  /// No description provided for @colisIntrouvable.
  ///
  /// In fr, this message translates to:
  /// **'Colis introuvable.'**
  String get colisIntrouvable;

  /// No description provided for @rechercheDAdresseIndisponibleCle.
  ///
  /// In fr, this message translates to:
  /// **'Recherche d\'adresse indisponible (clé Google non configurée).'**
  String get rechercheDAdresseIndisponibleCle;

  /// No description provided for @adresseIntrouvableEssayezUneAutre.
  ///
  /// In fr, this message translates to:
  /// **'Adresse introuvable. Essayez une autre suggestion.'**
  String get adresseIntrouvableEssayezUneAutre;

  /// No description provided for @rechercheDAdresseMomentanementIndisponible.
  ///
  /// In fr, this message translates to:
  /// **'Recherche d\'adresse momentanément indisponible.'**
  String get rechercheDAdresseMomentanementIndisponible;

  /// No description provided for @trajetIntrouvable.
  ///
  /// In fr, this message translates to:
  /// **'Trajet introuvable.'**
  String get trajetIntrouvable;

  /// No description provided for @factureIntrouvable.
  ///
  /// In fr, this message translates to:
  /// **'Facture introuvable.'**
  String get factureIntrouvable;

  /// No description provided for @avancementDuTrajet.
  ///
  /// In fr, this message translates to:
  /// **'Avancement du trajet'**
  String get avancementDuTrajet;

  /// No description provided for @disponible.
  ///
  /// In fr, this message translates to:
  /// **', disponible'**
  String get disponible;

  /// No description provided for @indisponible2.
  ///
  /// In fr, this message translates to:
  /// **', indisponible'**
  String get indisponible2;

  /// No description provided for @disponible2.
  ///
  /// In fr, this message translates to:
  /// **'Disponible'**
  String get disponible2;

  /// No description provided for @navettes7PlacesTrajets603.
  ///
  /// In fr, this message translates to:
  /// **'Navettes 7+ places. Trajets 60 km+. Colis inclus.'**
  String get navettes7PlacesTrajets603;

  /// No description provided for @xlcab.
  ///
  /// In fr, this message translates to:
  /// **'XLCAB. {baseline}'**
  String xlcab(Object baseline);

  /// Plaque au milieu d’une phrase (partage du trajet)
  ///
  /// In fr, this message translates to:
  /// **'immatriculation {plate}'**
  String plaqueDansPhrase(Object plate);

  /// No description provided for @langue.
  ///
  /// In fr, this message translates to:
  /// **'Langue'**
  String get langue;

  /// No description provided for @langueDuTelephone.
  ///
  /// In fr, this message translates to:
  /// **'Téléphone'**
  String get langueDuTelephone;

  /// No description provided for @choisissezVotreNavette.
  ///
  /// In fr, this message translates to:
  /// **'Choisissez votre navette'**
  String get choisissezVotreNavette;

  /// No description provided for @aPartirDe.
  ///
  /// In fr, this message translates to:
  /// **'À partir de {price}'**
  String aPartirDe(Object price);

  /// No description provided for @prixPourUnTrajetDe.
  ///
  /// In fr, this message translates to:
  /// **'Prix pour un trajet de {km} km, 1 passager, sans option.'**
  String prixPourUnTrajetDe(Object km);

  /// No description provided for @disponibiliteExplication.
  ///
  /// In fr, this message translates to:
  /// **'« Disponible » : un chauffeur est en ligne près de vous en ce moment. Vous pouvez réserver à l’avance dans tous les cas.'**
  String get disponibiliteExplication;

  /// No description provided for @chargementDesNavettes.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des navettes'**
  String get chargementDesNavettes;

  /// No description provided for @navettesIndisponibles.
  ///
  /// In fr, this message translates to:
  /// **'Navettes indisponibles pour le moment.'**
  String get navettesIndisponibles;

  /// No description provided for @offreNavetteSemantique.
  ///
  /// In fr, this message translates to:
  /// **'{name}, {audience}{availability}, à partir de {price}'**
  String offreNavetteSemantique(
      Object name, Object audience, Object availability, Object price);

  /// No description provided for @pasEncoreDeNoteCourses.
  ///
  /// In fr, this message translates to:
  /// **'Pas encore de note · {count} courses'**
  String pasEncoreDeNoteCourses(Object count);

  /// No description provided for @mkAConfirmerAvant.
  ///
  /// In fr, this message translates to:
  /// **'À confirmer avant {date}'**
  String mkAConfirmerAvant(String date);

  /// No description provided for @mkAccessible.
  ///
  /// In fr, this message translates to:
  /// **'Accès PMR'**
  String get mkAccessible;

  /// No description provided for @mkAucunMessage.
  ///
  /// In fr, this message translates to:
  /// **'Aucun message pour l’instant.'**
  String get mkAucunMessage;

  /// No description provided for @mkAucunVehiculeAdapte.
  ///
  /// In fr, this message translates to:
  /// **'Aucun de vos véhicules ne convient (places ou accès PMR).'**
  String get mkAucunVehiculeAdapte;

  /// No description provided for @mkAucuneDemande.
  ///
  /// In fr, this message translates to:
  /// **'Aucune demande compatible avec vos véhicules pour le moment.'**
  String get mkAucuneDemande;

  /// No description provided for @mkAucuneProposition.
  ///
  /// In fr, this message translates to:
  /// **'Vous n’avez fait aucune proposition.'**
  String get mkAucuneProposition;

  /// No description provided for @mkBagages.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{1 bagage} other{{count} bagages}}'**
  String mkBagages(int count);

  /// No description provided for @mkBourse.
  ///
  /// In fr, this message translates to:
  /// **'Bourse de transport'**
  String get mkBourse;

  /// No description provided for @mkBudget.
  ///
  /// In fr, this message translates to:
  /// **'Budget {amount}'**
  String mkBudget(String amount);

  /// No description provided for @mkChargementDesDemandes.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des demandes'**
  String get mkChargementDesDemandes;

  /// No description provided for @mkChargementDesMessages.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des messages'**
  String get mkChargementDesMessages;

  /// No description provided for @mkChargementDesPropositions.
  ///
  /// In fr, this message translates to:
  /// **'Chargement de vos propositions'**
  String get mkChargementDesPropositions;

  /// No description provided for @mkChoisieAConfirmer.
  ///
  /// In fr, this message translates to:
  /// **'Choisie par le client : à confirmer'**
  String get mkChoisieAConfirmer;

  /// No description provided for @mkConfirmee.
  ///
  /// In fr, this message translates to:
  /// **'Confirmée : course réservée'**
  String get mkConfirmee;

  /// No description provided for @mkDemandes.
  ///
  /// In fr, this message translates to:
  /// **'Demandes'**
  String get mkDemandes;

  /// No description provided for @mkEnAttenteDuClient.
  ///
  /// In fr, this message translates to:
  /// **'En attente du client'**
  String get mkEnAttenteDuClient;

  /// No description provided for @mkEnvoyer.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer'**
  String get mkEnvoyer;

  /// No description provided for @mkEnvoyerLaProposition.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer la proposition'**
  String get mkEnvoyerLaProposition;

  /// No description provided for @mkExpiree.
  ///
  /// In fr, this message translates to:
  /// **'Expirée'**
  String get mkExpiree;

  /// No description provided for @mkFaireUneProposition.
  ///
  /// In fr, this message translates to:
  /// **'Faire une proposition'**
  String get mkFaireUneProposition;

  /// No description provided for @mkFeedExplication.
  ///
  /// In fr, this message translates to:
  /// **'Demandes que vos véhicules peuvent assurer. L’identité du client et l’adresse exacte ne sont communiquées qu’après confirmation.'**
  String get mkFeedExplication;

  /// No description provided for @mkJeConfirme.
  ///
  /// In fr, this message translates to:
  /// **'Je confirme ma disponibilité'**
  String get mkJeConfirme;

  /// No description provided for @mkJeNePeuxPlus.
  ///
  /// In fr, this message translates to:
  /// **'Je ne peux plus'**
  String get mkJeNePeuxPlus;

  /// No description provided for @mkKm.
  ///
  /// In fr, this message translates to:
  /// **'{count} km'**
  String mkKm(int count);

  /// No description provided for @mkMesPropositions.
  ///
  /// In fr, this message translates to:
  /// **'Mes propositions'**
  String get mkMesPropositions;

  /// No description provided for @mkMesPropositionsAConfirmer.
  ///
  /// In fr, this message translates to:
  /// **'Mes propositions ({count} à confirmer)'**
  String mkMesPropositionsAConfirmer(int count);

  /// No description provided for @mkMessages.
  ///
  /// In fr, this message translates to:
  /// **'Messages'**
  String get mkMessages;

  /// No description provided for @mkNonRetenue.
  ///
  /// In fr, this message translates to:
  /// **'Non retenue'**
  String get mkNonRetenue;

  /// No description provided for @mkPasDeCoordonnees.
  ///
  /// In fr, this message translates to:
  /// **'Pas de téléphone ni d’e-mail avant la confirmation : la messagerie XLCAB reste votre canal.'**
  String get mkPasDeCoordonnees;

  /// No description provided for @mkPassagers.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{1 passager} other{{count} passagers}}'**
  String mkPassagers(int count);

  /// No description provided for @mkPrixTtc.
  ///
  /// In fr, this message translates to:
  /// **'Prix TTC'**
  String get mkPrixTtc;

  /// No description provided for @mkPropositionEnvoyee.
  ///
  /// In fr, this message translates to:
  /// **'Proposition envoyée au client.'**
  String get mkPropositionEnvoyee;

  /// No description provided for @mkPropositionNEngagePas.
  ///
  /// In fr, this message translates to:
  /// **'Si le client choisit votre proposition, vous devrez reconfirmer votre disponibilité sous 2 heures.'**
  String get mkPropositionNEngagePas;

  /// No description provided for @mkRefuseeParVous.
  ///
  /// In fr, this message translates to:
  /// **'Non confirmée par vous'**
  String get mkRefuseeParVous;

  /// No description provided for @mkRegulier.
  ///
  /// In fr, this message translates to:
  /// **'Besoin régulier'**
  String get mkRegulier;

  /// No description provided for @mkReservationConfirmeeMission.
  ///
  /// In fr, this message translates to:
  /// **'Réservation confirmée : la course est dans vos missions.'**
  String get mkReservationConfirmeeMission;

  /// No description provided for @mkRetiree.
  ///
  /// In fr, this message translates to:
  /// **'Retirée'**
  String get mkRetiree;

  /// No description provided for @mkRetirer.
  ///
  /// In fr, this message translates to:
  /// **'Retirer'**
  String get mkRetirer;

  /// No description provided for @mkRetourCompris.
  ///
  /// In fr, this message translates to:
  /// **'Retour compris'**
  String get mkRetourCompris;

  /// No description provided for @mkRetourLe.
  ///
  /// In fr, this message translates to:
  /// **'Retour : {date}'**
  String mkRetourLe(String date);

  /// No description provided for @mkSouplesse.
  ///
  /// In fr, this message translates to:
  /// **'± {minutes} min'**
  String mkSouplesse(int minutes);

  /// No description provided for @mkVotreMessage.
  ///
  /// In fr, this message translates to:
  /// **'Votre message'**
  String get mkVotreMessage;

  /// No description provided for @mkVotreProposition.
  ///
  /// In fr, this message translates to:
  /// **'Votre proposition : {price} · {status}'**
  String mkVotreProposition(String price, String status);

  /// No description provided for @opAConfirmer.
  ///
  /// In fr, this message translates to:
  /// **'À confirmer'**
  String get opAConfirmer;

  /// No description provided for @opAConfirmerEnRoute.
  ///
  /// In fr, this message translates to:
  /// **'« Je suis en route » à confirmer'**
  String get opAConfirmerEnRoute;

  /// No description provided for @opAccepter.
  ///
  /// In fr, this message translates to:
  /// **'Accepter'**
  String get opAccepter;

  /// No description provided for @opAcceptezLesConditionsAvantDePublier.
  ///
  /// In fr, this message translates to:
  /// **'Acceptez d’abord les conditions générales opérateur.'**
  String get opAcceptezLesConditionsAvantDePublier;

  /// No description provided for @opActivite.
  ///
  /// In fr, this message translates to:
  /// **'Activité'**
  String get opActivite;

  /// No description provided for @opAjouterUnRetour.
  ///
  /// In fr, this message translates to:
  /// **'Ajouter'**
  String get opAjouterUnRetour;

  /// No description provided for @opAlerteGenerale.
  ///
  /// In fr, this message translates to:
  /// **'Urgent : un départ cherche un chauffeur'**
  String get opAlerteGenerale;

  /// No description provided for @opAller.
  ///
  /// In fr, this message translates to:
  /// **'Aller'**
  String get opAller;

  /// No description provided for @opAnnulationComptee.
  ///
  /// In fr, this message translates to:
  /// **'Annulation de dernière minute comptée'**
  String get opAnnulationComptee;

  /// No description provided for @opAnnulationLe.
  ///
  /// In fr, this message translates to:
  /// **'Le {date}, {delay} avant le départ'**
  String opAnnulationLe(String date, String delay);

  /// No description provided for @opAnnulationLevee.
  ///
  /// In fr, this message translates to:
  /// **'Levée par XLCAB'**
  String get opAnnulationLevee;

  /// No description provided for @opAnnulationNonComptee.
  ///
  /// In fr, this message translates to:
  /// **'Prévenue à temps : non comptée'**
  String get opAnnulationNonComptee;

  /// No description provided for @opAnnulerCeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Annuler ce départ'**
  String get opAnnulerCeDepart;

  /// No description provided for @opAnnulerCeDepartExplication.
  ///
  /// In fr, this message translates to:
  /// **'Vos passagers seront confiés à un chauffeur de secours. Une annulation le jour même ou moins de 12 h avant compte : à partir de la 3e en 12 mois, pénalité de 260 €. Cas de force majeure : vous pourrez envoyer un justificatif.'**
  String get opAnnulerCeDepartExplication;

  /// No description provided for @opAnnulerLeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Annuler le départ'**
  String get opAnnulerLeDepart;

  /// No description provided for @opAppelerLePassager.
  ///
  /// In fr, this message translates to:
  /// **'Appeler {name}'**
  String opAppelerLePassager(String name);

  /// No description provided for @opApresPublication.
  ///
  /// In fr, this message translates to:
  /// **'Les départs sont créés pour les 30 prochains jours. Confirmez ceux que vous assurez : seuls ceux-là sont proposés aux voyageurs.'**
  String get opApresPublication;

  /// No description provided for @opArreterLaVente.
  ///
  /// In fr, this message translates to:
  /// **'Arrêter la vente'**
  String get opArreterLaVente;

  /// No description provided for @opArriveeDeLaLigne.
  ///
  /// In fr, this message translates to:
  /// **'Arrivée'**
  String get opArriveeDeLaLigne;

  /// No description provided for @opAuPlus.
  ///
  /// In fr, this message translates to:
  /// **'{count} au plus'**
  String opAuPlus(int count);

  /// No description provided for @opAucunDepartAVenir.
  ///
  /// In fr, this message translates to:
  /// **'Aucun départ à venir.'**
  String get opAucunDepartAVenir;

  /// No description provided for @opAucunVehicule.
  ///
  /// In fr, this message translates to:
  /// **'Aucun véhicule enregistré sur votre compte.'**
  String get opAucunVehicule;

  /// No description provided for @opAucunVehiculeAssezGrand.
  ///
  /// In fr, this message translates to:
  /// **'Il faut un véhicule d’au moins {count} places passagers.'**
  String opAucunVehiculeAssezGrand(int count);

  /// No description provided for @opAucuneAnnulation.
  ///
  /// In fr, this message translates to:
  /// **'Aucune annulation. Merci pour votre fiabilité !'**
  String get opAucuneAnnulation;

  /// No description provided for @opAucuneLignePresentation.
  ///
  /// In fr, this message translates to:
  /// **'Publiez vos trajets réguliers (par exemple Paris – Beauvais à 5 h) : XLCAB les propose aux voyageurs, entreprises et agences.'**
  String get opAucuneLignePresentation;

  /// No description provided for @opBagagesParDepart.
  ///
  /// In fr, this message translates to:
  /// **'Bagages par départ'**
  String get opBagagesParDepart;

  /// No description provided for @opBanniereConditions.
  ///
  /// In fr, this message translates to:
  /// **'Acceptez les conditions générales opérateur pour publier vos lignes.'**
  String get opBanniereConditions;

  /// No description provided for @opBanniereSuspendu.
  ///
  /// In fr, this message translates to:
  /// **'Votre profil opérateur est suspendu : vos lignes ne sont plus proposées. Contactez le support XLCAB.'**
  String get opBanniereSuspendu;

  /// No description provided for @opBanniereVerification.
  ///
  /// In fr, this message translates to:
  /// **'Profil en cours de vérification par XLCAB : vos lignes seront proposées aux voyageurs après validation.'**
  String get opBanniereVerification;

  /// No description provided for @opBanniereVerifiePlace.
  ///
  /// In fr, this message translates to:
  /// **'Profil vérifié : vente à la place et par véhicule.'**
  String get opBanniereVerifiePlace;

  /// No description provided for @opBanniereVerifieVehicule.
  ///
  /// In fr, this message translates to:
  /// **'Profil vérifié : vente par véhicule. Vente à la place après vérification de votre licence de transport.'**
  String get opBanniereVerifieVehicule;

  /// No description provided for @opBonneRoute.
  ///
  /// In fr, this message translates to:
  /// **'Bonne route !'**
  String get opBonneRoute;

  /// No description provided for @opCapaciteEtPrix.
  ///
  /// In fr, this message translates to:
  /// **'Capacité et prix'**
  String get opCapaciteEtPrix;

  /// No description provided for @opCaracteresMinimum.
  ///
  /// In fr, this message translates to:
  /// **'{count} caractères minimum'**
  String opCaracteresMinimum(int count);

  /// No description provided for @opChargementDesAnnulations.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des annulations'**
  String get opChargementDesAnnulations;

  /// No description provided for @opChargementDesDeparts.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des départs'**
  String get opChargementDesDeparts;

  /// No description provided for @opChargementDesLignes.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des lignes'**
  String get opChargementDesLignes;

  /// No description provided for @opChargementDesReserves.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des réserves'**
  String get opChargementDesReserves;

  /// No description provided for @opChargementDesVehicules.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des véhicules'**
  String get opChargementDesVehicules;

  /// No description provided for @opChargementDuDepart.
  ///
  /// In fr, this message translates to:
  /// **'Chargement du départ'**
  String get opChargementDuDepart;

  /// No description provided for @opChargementDuProfil.
  ///
  /// In fr, this message translates to:
  /// **'Chargement du profil'**
  String get opChargementDuProfil;

  /// No description provided for @opChargementImpossible.
  ///
  /// In fr, this message translates to:
  /// **'Chargement impossible. Vérifiez votre connexion.'**
  String get opChargementImpossible;

  /// No description provided for @opChauffeursDeReserve.
  ///
  /// In fr, this message translates to:
  /// **'Chauffeurs de réserve'**
  String get opChauffeursDeReserve;

  /// No description provided for @opChoisirUneAdresse.
  ///
  /// In fr, this message translates to:
  /// **'Choisir une adresse'**
  String get opChoisirUneAdresse;

  /// No description provided for @opChoisissezAuMoinsUnJour.
  ///
  /// In fr, this message translates to:
  /// **'Choisissez au moins un jour.'**
  String get opChoisissezAuMoinsUnJour;

  /// No description provided for @opChoisissezDepartEtArrivee.
  ///
  /// In fr, this message translates to:
  /// **'Choisissez le départ et l’arrivée.'**
  String get opChoisissezDepartEtArrivee;

  /// No description provided for @opChoisissezUnVehicule.
  ///
  /// In fr, this message translates to:
  /// **'Choisissez un véhicule.'**
  String get opChoisissezUnVehicule;

  /// No description provided for @opConditionsAcceptees.
  ///
  /// In fr, this message translates to:
  /// **'Conditions générales opérateur acceptées.'**
  String get opConditionsAcceptees;

  /// No description provided for @opConditionsExemple.
  ///
  /// In fr, this message translates to:
  /// **'Ex. : 1 valise + 1 bagage cabine par personne'**
  String get opConditionsExemple;

  /// No description provided for @opConditionsFacultatif.
  ///
  /// In fr, this message translates to:
  /// **'Conditions (facultatif)'**
  String get opConditionsFacultatif;

  /// No description provided for @opConditionsOperateur.
  ///
  /// In fr, this message translates to:
  /// **'Conditions générales opérateur'**
  String get opConditionsOperateur;

  /// No description provided for @opConditionsResume.
  ///
  /// In fr, this message translates to:
  /// **'Elles prévoient notamment le protocole de secours en cas d’annulation et la pénalité de 260 € à partir de la 3e annulation de dernière minute sur 12 mois.'**
  String get opConditionsResume;

  /// No description provided for @opConfirmerQuinzeJours.
  ///
  /// In fr, this message translates to:
  /// **'Confirmer les 14 prochains jours'**
  String get opConfirmerQuinzeJours;

  /// No description provided for @opConfirmerSeptJours.
  ///
  /// In fr, this message translates to:
  /// **'J’assure mes départs des 7 prochains jours'**
  String get opConfirmerSeptJours;

  /// No description provided for @opContestationEnvoyee.
  ///
  /// In fr, this message translates to:
  /// **'Contestation envoyée : rien n’est retenu en attendant la décision.'**
  String get opContestationEnvoyee;

  /// No description provided for @opContester.
  ///
  /// In fr, this message translates to:
  /// **'Contester'**
  String get opContester;

  /// No description provided for @opContesterLaPenalite.
  ///
  /// In fr, this message translates to:
  /// **'Contester la pénalité'**
  String get opContesterLaPenalite;

  /// No description provided for @opContinuer.
  ///
  /// In fr, this message translates to:
  /// **'Continuer'**
  String get opContinuer;

  /// No description provided for @opDecliner.
  ///
  /// In fr, this message translates to:
  /// **'Décliner'**
  String get opDecliner;

  /// No description provided for @opDemarrerLeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Démarrer le départ'**
  String get opDemarrerLeDepart;

  /// No description provided for @opDepart.
  ///
  /// In fr, this message translates to:
  /// **'Départ'**
  String get opDepart;

  /// No description provided for @opDepartConfieAuSecours.
  ///
  /// In fr, this message translates to:
  /// **'Départ annulé : un chauffeur de secours est sollicité.'**
  String get opDepartConfieAuSecours;

  /// No description provided for @opDepartDeLaLigne.
  ///
  /// In fr, this message translates to:
  /// **'Départ'**
  String get opDepartDeLaLigne;

  /// No description provided for @opDepartRepris.
  ///
  /// In fr, this message translates to:
  /// **'Merci ! Le départ est à vous.'**
  String get opDepartRepris;

  /// No description provided for @opDepartTermine.
  ///
  /// In fr, this message translates to:
  /// **'Départ terminé. Merci !'**
  String get opDepartTermine;

  /// No description provided for @opDepartsAConfirmer.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{1 départ à confirmer} other{{count} départs à confirmer}}'**
  String opDepartsAConfirmer(int count);

  /// No description provided for @opDepartsAConfirmerExplication.
  ///
  /// In fr, this message translates to:
  /// **'Un départ n’est proposé aux voyageurs qu’une fois confirmé par vous.'**
  String get opDepartsAConfirmerExplication;

  /// No description provided for @opDepartsAReprendre.
  ///
  /// In fr, this message translates to:
  /// **'Départs à reprendre en urgence'**
  String get opDepartsAReprendre;

  /// No description provided for @opDepartsConfirmes.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =0{Aucun départ à confirmer} =1{1 départ confirmé} other{{count} départs confirmés}}'**
  String opDepartsConfirmes(int count);

  /// No description provided for @opDim.
  ///
  /// In fr, this message translates to:
  /// **'Dim'**
  String get opDim;

  /// No description provided for @opDuLundiAuVendredi.
  ///
  /// In fr, this message translates to:
  /// **'Du lundi au vendredi'**
  String get opDuLundiAuVendredi;

  /// No description provided for @opDureeEstimeeMinutes.
  ///
  /// In fr, this message translates to:
  /// **'Durée estimée (minutes)'**
  String get opDureeEstimeeMinutes;

  /// No description provided for @opEmbarque.
  ///
  /// In fr, this message translates to:
  /// **'à bord'**
  String get opEmbarque;

  /// No description provided for @opEnCours.
  ///
  /// In fr, this message translates to:
  /// **'En cours'**
  String get opEnCours;

  /// No description provided for @opEnRoute.
  ///
  /// In fr, this message translates to:
  /// **'En route'**
  String get opEnRoute;

  /// No description provided for @opEnRouteConfirme.
  ///
  /// In fr, this message translates to:
  /// **'« Je suis en route » confirmé.'**
  String get opEnRouteConfirme;

  /// No description provided for @opEnVente.
  ///
  /// In fr, this message translates to:
  /// **'En vente'**
  String get opEnVente;

  /// No description provided for @opEnvoyerUnJustificatif.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer un justificatif'**
  String get opEnvoyerUnJustificatif;

  /// No description provided for @opEspaceOperateur.
  ///
  /// In fr, this message translates to:
  /// **'Espace opérateur'**
  String get opEspaceOperateur;

  /// No description provided for @opFermer.
  ///
  /// In fr, this message translates to:
  /// **'Fermer'**
  String get opFermer;

  /// No description provided for @opFermerLaLigne.
  ///
  /// In fr, this message translates to:
  /// **'Fermer la ligne'**
  String get opFermerLaLigne;

  /// No description provided for @opFermerLaLigneExplication.
  ///
  /// In fr, this message translates to:
  /// **'La ligne ne sera plus proposée. Les départs déjà réservés restent dus aux passagers.'**
  String get opFermerLaLigneExplication;

  /// No description provided for @opFermerUnJour.
  ///
  /// In fr, this message translates to:
  /// **'Fermer un jour'**
  String get opFermerUnJour;

  /// No description provided for @opForceMajeureReconnue.
  ///
  /// In fr, this message translates to:
  /// **'Force majeure reconnue : non comptée'**
  String get opForceMajeureReconnue;

  /// No description provided for @opHeureDeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Heure de départ'**
  String get opHeureDeDepart;

  /// No description provided for @opHoraireJours.
  ///
  /// In fr, this message translates to:
  /// **'{time} · {days}'**
  String opHoraireJours(String time, String days);

  /// No description provided for @opHoraireRetourJours.
  ///
  /// In fr, this message translates to:
  /// **'{time}, retour {returnTime} · {days}'**
  String opHoraireRetourJours(String time, String returnTime, String days);

  /// No description provided for @opHorairesEtJours.
  ///
  /// In fr, this message translates to:
  /// **'Horaires et jours'**
  String get opHorairesEtJours;

  /// No description provided for @opInvitationDeclinee.
  ///
  /// In fr, this message translates to:
  /// **'Invitation déclinée'**
  String get opInvitationDeclinee;

  /// No description provided for @opInvitationEnAttente.
  ///
  /// In fr, this message translates to:
  /// **'Invitation en attente de réponse'**
  String get opInvitationEnAttente;

  /// No description provided for @opInvitationEnvoyee.
  ///
  /// In fr, this message translates to:
  /// **'Invitation envoyée.'**
  String get opInvitationEnvoyee;

  /// No description provided for @opInvitationReserve.
  ///
  /// In fr, this message translates to:
  /// **'Invitation : chauffeur de réserve n° {rank}'**
  String opInvitationReserve(int rank);

  /// No description provided for @opInvitationReserveExplication.
  ///
  /// In fr, this message translates to:
  /// **'Si le chauffeur de cette ligne annule, vous serez sollicité pour reprendre ses passagers (au prix du départ, plus un bonus de reprise).'**
  String get opInvitationReserveExplication;

  /// No description provided for @opInvitationsDeReserve.
  ///
  /// In fr, this message translates to:
  /// **'Invitations de réserve'**
  String get opInvitationsDeReserve;

  /// No description provided for @opInviter.
  ///
  /// In fr, this message translates to:
  /// **'Inviter'**
  String get opInviter;

  /// No description provided for @opInviterReserve.
  ///
  /// In fr, this message translates to:
  /// **'Inviter la réserve n° {rank}'**
  String opInviterReserve(int rank);

  /// No description provided for @opInviterReserveExplication.
  ///
  /// In fr, this message translates to:
  /// **'E-mail du compte XLCAB d’un chauffeur validé. Il devra accepter et choisir son véhicule.'**
  String get opInviterReserveExplication;

  /// No description provided for @opJAccepteLesConditions.
  ///
  /// In fr, this message translates to:
  /// **'J’ai lu et j’accepte les conditions générales opérateur'**
  String get opJAccepteLesConditions;

  /// No description provided for @opJeNePeuxPas.
  ///
  /// In fr, this message translates to:
  /// **'Je ne peux pas'**
  String get opJeNePeuxPas;

  /// No description provided for @opJeReprends.
  ///
  /// In fr, this message translates to:
  /// **'Je reprends ce départ'**
  String get opJeReprends;

  /// No description provided for @opJeSuisEnRoute.
  ///
  /// In fr, this message translates to:
  /// **'Je suis en route'**
  String get opJeSuisEnRoute;

  /// No description provided for @opJeSuisEnRouteExplication.
  ///
  /// In fr, this message translates to:
  /// **'Confirmez avant 1 h du départ : sans confirmation, un chauffeur de secours sera sollicité.'**
  String get opJeSuisEnRouteExplication;

  /// No description provided for @opJeu.
  ///
  /// In fr, this message translates to:
  /// **'Jeu'**
  String get opJeu;

  /// No description provided for @opJourFerme.
  ///
  /// In fr, this message translates to:
  /// **'Jour fermé.'**
  String get opJourFerme;

  /// No description provided for @opJoursSansDepart.
  ///
  /// In fr, this message translates to:
  /// **'Jours sans départ'**
  String get opJoursSansDepart;

  /// No description provided for @opJustificatif.
  ///
  /// In fr, this message translates to:
  /// **'Justificatif'**
  String get opJustificatif;

  /// No description provided for @opJustificatifEnExamen.
  ///
  /// In fr, this message translates to:
  /// **'Justificatif en cours d’examen'**
  String get opJustificatifEnExamen;

  /// No description provided for @opJustificatifEnvoye.
  ///
  /// In fr, this message translates to:
  /// **'Justificatif envoyé à l’équipe XLCAB.'**
  String get opJustificatifEnvoye;

  /// No description provided for @opJustificatifExplication.
  ///
  /// In fr, this message translates to:
  /// **'Accident, hospitalisation, panne constatée… Décrivez la situation ; l’équipe XLCAB pourra vous demander un document.'**
  String get opJustificatifExplication;

  /// No description provided for @opKindCollectif.
  ///
  /// In fr, this message translates to:
  /// **'Transport collectif'**
  String get opKindCollectif;

  /// No description provided for @opKindFlotte.
  ///
  /// In fr, this message translates to:
  /// **'Exploitant de flotte'**
  String get opKindFlotte;

  /// No description provided for @opKindIndependant.
  ///
  /// In fr, this message translates to:
  /// **'Chauffeur indépendant'**
  String get opKindIndependant;

  /// No description provided for @opKindSocieteVtc.
  ///
  /// In fr, this message translates to:
  /// **'Société VTC'**
  String get opKindSocieteVtc;

  /// No description provided for @opLicenceTransport.
  ///
  /// In fr, this message translates to:
  /// **'Licence de transport (LOTI, registre)'**
  String get opLicenceTransport;

  /// No description provided for @opLicenceTransportAide.
  ///
  /// In fr, this message translates to:
  /// **'Nécessaire pour vendre à la place. Vérifiée par XLCAB ; la modifier suspend la vente à la place jusqu’à la nouvelle vérification.'**
  String get opLicenceTransportAide;

  /// No description provided for @opLigne.
  ///
  /// In fr, this message translates to:
  /// **'Ligne régulière'**
  String get opLigne;

  /// No description provided for @opLigneActive.
  ///
  /// In fr, this message translates to:
  /// **'Active'**
  String get opLigneActive;

  /// No description provided for @opLigneEnPause.
  ///
  /// In fr, this message translates to:
  /// **'En pause'**
  String get opLigneEnPause;

  /// No description provided for @opLigneFermee.
  ///
  /// In fr, this message translates to:
  /// **'Fermée'**
  String get opLigneFermee;

  /// No description provided for @opLigneIntrouvable.
  ///
  /// In fr, this message translates to:
  /// **'Ligne introuvable.'**
  String get opLigneIntrouvable;

  /// No description provided for @opLignePublieeConfirmez.
  ///
  /// In fr, this message translates to:
  /// **'Ligne publiée. Confirmez maintenant les départs que vous assurez.'**
  String get opLignePublieeConfirmez;

  /// No description provided for @opLireLesConditions.
  ///
  /// In fr, this message translates to:
  /// **'Lire les conditions générales opérateur'**
  String get opLireLesConditions;

  /// No description provided for @opListeDEmbarquement.
  ///
  /// In fr, this message translates to:
  /// **'Liste d’embarquement'**
  String get opListeDEmbarquement;

  /// No description provided for @opLun.
  ///
  /// In fr, this message translates to:
  /// **'Lun'**
  String get opLun;

  /// No description provided for @opMar.
  ///
  /// In fr, this message translates to:
  /// **'Mar'**
  String get opMar;

  /// No description provided for @opMer.
  ///
  /// In fr, this message translates to:
  /// **'Mer'**
  String get opMer;

  /// No description provided for @opMesAnnulations.
  ///
  /// In fr, this message translates to:
  /// **'Mes annulations'**
  String get opMesAnnulations;

  /// No description provided for @opMesDepartsDeLigne.
  ///
  /// In fr, this message translates to:
  /// **'Mes départs de ligne'**
  String get opMesDepartsDeLigne;

  /// No description provided for @opMesLignes.
  ///
  /// In fr, this message translates to:
  /// **'Mes lignes régulières'**
  String get opMesLignes;

  /// No description provided for @opMettreEnPause.
  ///
  /// In fr, this message translates to:
  /// **'Mettre en pause'**
  String get opMettreEnPause;

  /// No description provided for @opMotif.
  ///
  /// In fr, this message translates to:
  /// **'Motif'**
  String get opMotif;

  /// No description provided for @opMotifFacultatif.
  ///
  /// In fr, this message translates to:
  /// **'Motif (facultatif)'**
  String get opMotifFacultatif;

  /// No description provided for @opNomCommercial.
  ///
  /// In fr, this message translates to:
  /// **'Nom commercial ou raison sociale'**
  String get opNomCommercial;

  /// No description provided for @opNombreInvalide.
  ///
  /// In fr, this message translates to:
  /// **'Nombre invalide'**
  String get opNombreInvalide;

  /// No description provided for @opNouvelleLigne.
  ///
  /// In fr, this message translates to:
  /// **'Nouvelle ligne'**
  String get opNouvelleLigne;

  /// No description provided for @opParPlace.
  ///
  /// In fr, this message translates to:
  /// **'Par place'**
  String get opParPlace;

  /// No description provided for @opParVehicule.
  ///
  /// In fr, this message translates to:
  /// **'Par véhicule'**
  String get opParVehicule;

  /// No description provided for @opPasDeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Pas de départ'**
  String get opPasDeDepart;

  /// No description provided for @opPasDeRetour.
  ///
  /// In fr, this message translates to:
  /// **'Pas de retour'**
  String get opPasDeRetour;

  /// No description provided for @opPassager.
  ///
  /// In fr, this message translates to:
  /// **'Passager'**
  String get opPassager;

  /// No description provided for @opPassagerEmbarque.
  ///
  /// In fr, this message translates to:
  /// **'{name} est à bord.'**
  String opPassagerEmbarque(String name);

  /// No description provided for @opPassagersNonScannes.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{1 réservation n’a pas été scannée. Démarrer quand même ?} other{{count} réservations n’ont pas été scannées. Démarrer quand même ?}}'**
  String opPassagersNonScannes(int count);

  /// No description provided for @opPassagersReservations.
  ///
  /// In fr, this message translates to:
  /// **'{seats, plural, =1{1 passager} other{{seats} passagers}} · {bookings, plural, =1{1 réservation} other{{bookings} réservations}}'**
  String opPassagersReservations(int seats, int bookings);

  /// No description provided for @opPenalite.
  ///
  /// In fr, this message translates to:
  /// **'Pénalité {amount} · {status}'**
  String opPenalite(String amount, String status);

  /// No description provided for @opPenaliteAnnulee.
  ///
  /// In fr, this message translates to:
  /// **'annulée'**
  String get opPenaliteAnnulee;

  /// No description provided for @opPenaliteAppliquee.
  ///
  /// In fr, this message translates to:
  /// **'retenue sur vos versements'**
  String get opPenaliteAppliquee;

  /// No description provided for @opPenaliteContestable.
  ///
  /// In fr, this message translates to:
  /// **'contestable pendant 7 jours'**
  String get opPenaliteContestable;

  /// No description provided for @opPenaliteContestee.
  ///
  /// In fr, this message translates to:
  /// **'contestée, en attente de décision'**
  String get opPenaliteContestee;

  /// No description provided for @opPersonneDesigne.
  ///
  /// In fr, this message translates to:
  /// **'Personne pour l’instant'**
  String get opPersonneDesigne;

  /// No description provided for @opPlaces.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{1 place} other{{count} places}}'**
  String opPlaces(int count);

  /// No description provided for @opPlacesCeJour.
  ///
  /// In fr, this message translates to:
  /// **'{count} places ce jour-là'**
  String opPlacesCeJour(int count);

  /// No description provided for @opPlacesParDepart.
  ///
  /// In fr, this message translates to:
  /// **'Places par départ'**
  String get opPlacesParDepart;

  /// No description provided for @opPlacesReservees.
  ///
  /// In fr, this message translates to:
  /// **'{booked}/{total} places réservées'**
  String opPlacesReservees(int booked, int total);

  /// No description provided for @opPremierJour.
  ///
  /// In fr, this message translates to:
  /// **'Premier jour'**
  String get opPremierJour;

  /// No description provided for @opPresentation.
  ///
  /// In fr, this message translates to:
  /// **'Présentation'**
  String get opPresentation;

  /// No description provided for @opPrestations.
  ///
  /// In fr, this message translates to:
  /// **'Prestations'**
  String get opPrestations;

  /// No description provided for @opPrixDuVehiculeTtc.
  ///
  /// In fr, this message translates to:
  /// **'Prix du véhicule (TTC)'**
  String get opPrixDuVehiculeTtc;

  /// No description provided for @opPrixInvalide.
  ///
  /// In fr, this message translates to:
  /// **'Prix invalide (1 € minimum)'**
  String get opPrixInvalide;

  /// No description provided for @opPrixParPlace.
  ///
  /// In fr, this message translates to:
  /// **'{price} par place · {seats} places'**
  String opPrixParPlace(String price, int seats);

  /// No description provided for @opPrixParPlaceTtc.
  ///
  /// In fr, this message translates to:
  /// **'Prix par place (TTC)'**
  String get opPrixParPlaceTtc;

  /// No description provided for @opPrixVehicule.
  ///
  /// In fr, this message translates to:
  /// **'{price} le véhicule · {seats} places'**
  String opPrixVehicule(String price, int seats);

  /// No description provided for @opProchainsDeparts.
  ///
  /// In fr, this message translates to:
  /// **'Prochains départs'**
  String get opProchainsDeparts;

  /// No description provided for @opProfilEnregistre.
  ///
  /// In fr, this message translates to:
  /// **'Profil enregistré.'**
  String get opProfilEnregistre;

  /// No description provided for @opProfilOperateur.
  ///
  /// In fr, this message translates to:
  /// **'Profil opérateur'**
  String get opProfilOperateur;

  /// No description provided for @opPublierLaLigne.
  ///
  /// In fr, this message translates to:
  /// **'Publier la ligne'**
  String get opPublierLaLigne;

  /// No description provided for @opReglesAnnulation.
  ///
  /// In fr, this message translates to:
  /// **'Une annulation le jour même ou moins de 12 h avant le départ compte. À partir de la 3e sur 12 mois : 260 € retenus, contestables pendant 7 jours. La force majeure justifiée ne compte pas.'**
  String get opReglesAnnulation;

  /// No description provided for @opRepondezAvant.
  ///
  /// In fr, this message translates to:
  /// **'Répondez avant {date}'**
  String opRepondezAvant(String date);

  /// No description provided for @opReprendre.
  ///
  /// In fr, this message translates to:
  /// **'Reprendre'**
  String get opReprendre;

  /// No description provided for @opRepris.
  ///
  /// In fr, this message translates to:
  /// **'repris en secours'**
  String get opRepris;

  /// No description provided for @opReserveAcceptee.
  ///
  /// In fr, this message translates to:
  /// **'Vous êtes chauffeur de réserve sur cette ligne.'**
  String get opReserveAcceptee;

  /// No description provided for @opReserveConfirmee.
  ///
  /// In fr, this message translates to:
  /// **'Confirmée · {vehicle}'**
  String opReserveConfirmee(String vehicle);

  /// No description provided for @opReserveNumero.
  ///
  /// In fr, this message translates to:
  /// **'Réserve n° {rank}'**
  String opReserveNumero(int rank);

  /// No description provided for @opReservesExplication.
  ///
  /// In fr, this message translates to:
  /// **'Si vous annulez un départ réservé, le n° 2 puis le n° 3 sont sollicités, puis tous les opérateurs compatibles.'**
  String get opReservesExplication;

  /// No description provided for @opRetablirCeJour.
  ///
  /// In fr, this message translates to:
  /// **'Rétablir ce jour'**
  String get opRetablirCeJour;

  /// No description provided for @opRetirerCetteReserve.
  ///
  /// In fr, this message translates to:
  /// **'Retirer cette réserve'**
  String get opRetirerCetteReserve;

  /// No description provided for @opRetirerLeRetour.
  ///
  /// In fr, this message translates to:
  /// **'Retirer le retour'**
  String get opRetirerLeRetour;

  /// No description provided for @opRetour.
  ///
  /// In fr, this message translates to:
  /// **'Retour'**
  String get opRetour;

  /// No description provided for @opRetourLeMemeJour.
  ///
  /// In fr, this message translates to:
  /// **'Retour le même jour'**
  String get opRetourLeMemeJour;

  /// No description provided for @opRouvrir.
  ///
  /// In fr, this message translates to:
  /// **'Rouvrir'**
  String get opRouvrir;

  /// No description provided for @opSam.
  ///
  /// In fr, this message translates to:
  /// **'Sam'**
  String get opSam;

  /// No description provided for @opScannerUnQr.
  ///
  /// In fr, this message translates to:
  /// **'Scanner le QR d’un passager'**
  String get opScannerUnQr;

  /// No description provided for @opServiceAeroport.
  ///
  /// In fr, this message translates to:
  /// **'Aéroports'**
  String get opServiceAeroport;

  /// No description provided for @opServiceAffaires.
  ///
  /// In fr, this message translates to:
  /// **'Affaires'**
  String get opServiceAffaires;

  /// No description provided for @opServiceGare.
  ///
  /// In fr, this message translates to:
  /// **'Gares'**
  String get opServiceGare;

  /// No description provided for @opServiceGroupe.
  ///
  /// In fr, this message translates to:
  /// **'Groupes'**
  String get opServiceGroupe;

  /// No description provided for @opServiceInterurbain.
  ///
  /// In fr, this message translates to:
  /// **'Interurbain'**
  String get opServiceInterurbain;

  /// No description provided for @opServiceMiseADisposition.
  ///
  /// In fr, this message translates to:
  /// **'Mise à disposition'**
  String get opServiceMiseADisposition;

  /// No description provided for @opServiceTourisme.
  ///
  /// In fr, this message translates to:
  /// **'Tourisme'**
  String get opServiceTourisme;

  /// No description provided for @opSiegesEnfant.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{1 siège enfant} other{{count} sièges enfant}}'**
  String opSiegesEnfant(int count);

  /// No description provided for @opSiret.
  ///
  /// In fr, this message translates to:
  /// **'SIRET'**
  String get opSiret;

  /// No description provided for @opStatutEnVerification.
  ///
  /// In fr, this message translates to:
  /// **'En vérification'**
  String get opStatutEnVerification;

  /// No description provided for @opStatutSuspendu.
  ///
  /// In fr, this message translates to:
  /// **'Suspendu'**
  String get opStatutSuspendu;

  /// No description provided for @opStatutVerifie.
  ///
  /// In fr, this message translates to:
  /// **'Vérifié par XLCAB'**
  String get opStatutVerifie;

  /// No description provided for @opTerminerLeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Terminer le départ'**
  String get opTerminerLeDepart;

  /// No description provided for @opTerminerLeDepartExplication.
  ///
  /// In fr, this message translates to:
  /// **'Confirmez que tous les passagers sont arrivés à destination.'**
  String get opTerminerLeDepartExplication;

  /// No description provided for @opTousEmbarques.
  ///
  /// In fr, this message translates to:
  /// **'Tous les passagers sont à bord.'**
  String get opTousEmbarques;

  /// No description provided for @opTousLesJours.
  ///
  /// In fr, this message translates to:
  /// **'Tous les jours'**
  String get opTousLesJours;

  /// No description provided for @opTrajet.
  ///
  /// In fr, this message translates to:
  /// **'{origin} → {destination}'**
  String opTrajet(String origin, String destination);

  /// No description provided for @opTrajetNonModifiable.
  ///
  /// In fr, this message translates to:
  /// **'Le trajet ne pourra plus être modifié : pour en changer, fermez la ligne et créez-en une autre.'**
  String get opTrajetNonModifiable;

  /// No description provided for @opTrajetSection.
  ///
  /// In fr, this message translates to:
  /// **'Trajet'**
  String get opTrajetSection;

  /// No description provided for @opTriggerAnnulation.
  ///
  /// In fr, this message translates to:
  /// **'Départ annulé'**
  String get opTriggerAnnulation;

  /// No description provided for @opTriggerPasEnRoute.
  ///
  /// In fr, this message translates to:
  /// **'« Je suis en route » non confirmé à 1 h du départ'**
  String get opTriggerPasEnRoute;

  /// No description provided for @opTriggerSansPosition.
  ///
  /// In fr, this message translates to:
  /// **'Plus de position GPS avant le départ'**
  String get opTriggerSansPosition;

  /// No description provided for @opVehicule.
  ///
  /// In fr, this message translates to:
  /// **'Véhicule'**
  String get opVehicule;

  /// No description provided for @opVehiculePlaces.
  ///
  /// In fr, this message translates to:
  /// **'{label} · {count} places'**
  String opVehiculePlaces(String label, int count);

  /// No description provided for @opVen.
  ///
  /// In fr, this message translates to:
  /// **'Ven'**
  String get opVen;

  /// No description provided for @opVenteALaPlaceAutorisee.
  ///
  /// In fr, this message translates to:
  /// **'Vente à la place autorisée'**
  String get opVenteALaPlaceAutorisee;

  /// No description provided for @opVenteALaPlaceReservee.
  ///
  /// In fr, this message translates to:
  /// **'Vente à la place : réservée aux licences de transport collectif vérifiées par XLCAB.'**
  String get opVenteALaPlaceReservee;

  /// No description provided for @opVenteArretee.
  ///
  /// In fr, this message translates to:
  /// **'Vente arrêtée'**
  String get opVenteArretee;

  /// No description provided for @opVenteParVehiculeSeulement.
  ///
  /// In fr, this message translates to:
  /// **'Vente par véhicule seulement'**
  String get opVenteParVehiculeSeulement;

  /// No description provided for @opVillesDesservies.
  ///
  /// In fr, this message translates to:
  /// **'Villes desservies (séparées par des virgules)'**
  String get opVillesDesservies;

  /// No description provided for @opVillesExemple.
  ///
  /// In fr, this message translates to:
  /// **'Paris, Beauvais, Orléans'**
  String get opVillesExemple;

  /// No description provided for @opVousEtesReserve.
  ///
  /// In fr, this message translates to:
  /// **'Vous êtes réserve : ce départ a besoin de vous'**
  String get opVousEtesReserve;

  /// No description provided for @mkcAChoisir.
  ///
  /// In fr, this message translates to:
  /// **'À choisir'**
  String get mkcAChoisir;

  /// No description provided for @mkcAllerSimple.
  ///
  /// In fr, this message translates to:
  /// **'Aller simple'**
  String get mkcAllerSimple;

  /// No description provided for @mkcAnnulerLaDemande.
  ///
  /// In fr, this message translates to:
  /// **'Annuler la demande'**
  String get mkcAnnulerLaDemande;

  /// No description provided for @mkcAnnulerLaDemandeExplication.
  ///
  /// In fr, this message translates to:
  /// **'Les opérateurs qui ont fait une proposition seront prévenus.'**
  String get mkcAnnulerLaDemandeExplication;

  /// No description provided for @mkcArrivee.
  ///
  /// In fr, this message translates to:
  /// **'Arrivée'**
  String get mkcArrivee;

  /// No description provided for @mkcAucunDepart.
  ///
  /// In fr, this message translates to:
  /// **'Aucun départ de ligne ce jour-là pour ce trajet. Demandez des devis : les opérateurs vérifiés vous répondent.'**
  String get mkcAucunDepart;

  /// No description provided for @mkcAucuneDemande.
  ///
  /// In fr, this message translates to:
  /// **'Vous n’avez pas encore de demande.'**
  String get mkcAucuneDemande;

  /// No description provided for @mkcAucunePropositionPourLInstant.
  ///
  /// In fr, this message translates to:
  /// **'Pas encore de proposition. Vous serez prévenu dès qu’un opérateur répond.'**
  String get mkcAucunePropositionPourLInstant;

  /// No description provided for @mkcBagages.
  ///
  /// In fr, this message translates to:
  /// **'Bagages'**
  String get mkcBagages;

  /// No description provided for @mkcBesoinsExemple.
  ///
  /// In fr, this message translates to:
  /// **'Ex. : un siège bébé, un fauteuil pliant'**
  String get mkcBesoinsExemple;

  /// No description provided for @mkcBesoinsParticuliers.
  ///
  /// In fr, this message translates to:
  /// **'Besoins particuliers (facultatif)'**
  String get mkcBesoinsParticuliers;

  /// No description provided for @mkcBudgetFacultatif.
  ///
  /// In fr, this message translates to:
  /// **'Budget indicatif (facultatif)'**
  String get mkcBudgetFacultatif;

  /// No description provided for @mkcCarteAccueilTexte.
  ///
  /// In fr, this message translates to:
  /// **'Réservez une place sur une ligne régulière, ou décrivez votre trajet et comparez les prix d’opérateurs vérifiés.'**
  String get mkcCarteAccueilTexte;

  /// No description provided for @mkcChoisir.
  ///
  /// In fr, this message translates to:
  /// **'Choisir'**
  String get mkcChoisir;

  /// No description provided for @mkcChoisirCetteProposition.
  ///
  /// In fr, this message translates to:
  /// **'Choisir cette proposition ?'**
  String get mkcChoisirCetteProposition;

  /// No description provided for @mkcChoisirExplication.
  ///
  /// In fr, this message translates to:
  /// **'{operator} doit encore confirmer sa disponibilité (sous 2 heures). Votre trajet à {price} sera réservé à ce moment-là.'**
  String mkcChoisirExplication(String operator, String price);

  /// No description provided for @mkcChoisissezDateHeure.
  ///
  /// In fr, this message translates to:
  /// **'Choisissez la date et l’heure du départ.'**
  String get mkcChoisissezDateHeure;

  /// No description provided for @mkcConfirmerPrix.
  ///
  /// In fr, this message translates to:
  /// **'Confirmer · {price}'**
  String mkcConfirmerPrix(String price);

  /// No description provided for @mkcDate.
  ///
  /// In fr, this message translates to:
  /// **'Date'**
  String get mkcDate;

  /// No description provided for @mkcDateEtHeure.
  ///
  /// In fr, this message translates to:
  /// **'Date et heure du départ'**
  String get mkcDateEtHeure;

  /// No description provided for @mkcDemandeGratuite.
  ///
  /// In fr, this message translates to:
  /// **'Publier une demande est gratuit et ne vous engage pas.'**
  String get mkcDemandeGratuite;

  /// No description provided for @mkcDemandeIntro.
  ///
  /// In fr, this message translates to:
  /// **'Décrivez votre trajet : les opérateurs vérifiés qui peuvent l’assurer vous proposent un prix. Votre nom et votre adresse exacte ne leur sont communiqués qu’après confirmation.'**
  String get mkcDemandeIntro;

  /// No description provided for @mkcDemanderDesDevis.
  ///
  /// In fr, this message translates to:
  /// **'Demander des devis'**
  String get mkcDemanderDesDevis;

  /// No description provided for @mkcDemanderDesDevisTexte.
  ///
  /// In fr, this message translates to:
  /// **'Groupe, aéroport, trajet sur mesure : comparez les propositions.'**
  String get mkcDemanderDesDevisTexte;

  /// No description provided for @mkcDepart.
  ///
  /// In fr, this message translates to:
  /// **'Départ'**
  String get mkcDepart;

  /// No description provided for @mkcDepartsDisponibles.
  ///
  /// In fr, this message translates to:
  /// **'Départs disponibles'**
  String get mkcDepartsDisponibles;

  /// No description provided for @mkcEnAttenteDeConfirmation.
  ///
  /// In fr, this message translates to:
  /// **'En attente de confirmation'**
  String get mkcEnAttenteDeConfirmation;

  /// No description provided for @mkcExplicationAnnulee.
  ///
  /// In fr, this message translates to:
  /// **'Cette demande est annulée.'**
  String get mkcExplicationAnnulee;

  /// No description provided for @mkcExplicationAttente.
  ///
  /// In fr, this message translates to:
  /// **'L’opérateur que vous avez choisi doit confirmer sa disponibilité. S’il ne le fait pas, vous pourrez choisir une autre proposition.'**
  String get mkcExplicationAttente;

  /// No description provided for @mkcExplicationConfirmee.
  ///
  /// In fr, this message translates to:
  /// **'Votre trajet est réservé. Retrouvez le QR d’embarquement et le suivi dans votre réservation.'**
  String get mkcExplicationConfirmee;

  /// No description provided for @mkcExplicationExpiree.
  ///
  /// In fr, this message translates to:
  /// **'Aucune réservation n’a pu être confirmée à temps. Vous pouvez publier une nouvelle demande.'**
  String get mkcExplicationExpiree;

  /// No description provided for @mkcExplicationPropositions.
  ///
  /// In fr, this message translates to:
  /// **'Comparez les propositions et choisissez celle qui vous convient.'**
  String get mkcExplicationPropositions;

  /// No description provided for @mkcExplicationRecherche.
  ///
  /// In fr, this message translates to:
  /// **'Les opérateurs compatibles ont été prévenus. Les propositions arrivent ici.'**
  String get mkcExplicationRecherche;

  /// No description provided for @mkcExplicationTerminee.
  ///
  /// In fr, this message translates to:
  /// **'Trajet terminé. Merci d’avoir voyagé avec XLCAB.'**
  String get mkcExplicationTerminee;

  /// No description provided for @mkcHeureExacte.
  ///
  /// In fr, this message translates to:
  /// **'Heure exacte'**
  String get mkcHeureExacte;

  /// No description provided for @mkcLOperateur.
  ///
  /// In fr, this message translates to:
  /// **'L’opérateur'**
  String get mkcLOperateur;

  /// No description provided for @mkcLignesCompatibles.
  ///
  /// In fr, this message translates to:
  /// **'Lignes régulières disponibles'**
  String get mkcLignesCompatibles;

  /// No description provided for @mkcLignesCompatiblesTexte.
  ///
  /// In fr, this message translates to:
  /// **'Ces départs correspondent déjà à votre trajet : réservables tout de suite.'**
  String get mkcLignesCompatiblesTexte;

  /// No description provided for @mkcLignesEtDevis.
  ///
  /// In fr, this message translates to:
  /// **'Lignes régulières et devis'**
  String get mkcLignesEtDevis;

  /// No description provided for @mkcLignesRegulieres.
  ///
  /// In fr, this message translates to:
  /// **'Lignes régulières'**
  String get mkcLignesRegulieres;

  /// No description provided for @mkcLignesRegulieresTexte.
  ///
  /// In fr, this message translates to:
  /// **'Une place dans une navette à horaire fixe, au meilleur prix.'**
  String get mkcLignesRegulieresTexte;

  /// No description provided for @mkcMaDemande.
  ///
  /// In fr, this message translates to:
  /// **'Ma demande'**
  String get mkcMaDemande;

  /// No description provided for @mkcMesDemandes.
  ///
  /// In fr, this message translates to:
  /// **'Mes demandes de devis'**
  String get mkcMesDemandes;

  /// No description provided for @mkcMessageAuChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Message au chauffeur (facultatif)'**
  String get mkcMessageAuChauffeur;

  /// No description provided for @mkcMessageExemple.
  ///
  /// In fr, this message translates to:
  /// **'Ex. : vol de 8 h 10'**
  String get mkcMessageExemple;

  /// No description provided for @mkcMoins.
  ///
  /// In fr, this message translates to:
  /// **'Moins : {label}'**
  String mkcMoins(String label);

  /// No description provided for @mkcNote.
  ///
  /// In fr, this message translates to:
  /// **'{rating} / 5 ({count} avis)'**
  String mkcNote(String rating, int count);

  /// No description provided for @mkcPaiementPlusTard.
  ///
  /// In fr, this message translates to:
  /// **'Aucun paiement en ligne pour l’instant : votre place est réservée dès la confirmation.'**
  String get mkcPaiementPlusTard;

  /// No description provided for @mkcPasEncoreNote.
  ///
  /// In fr, this message translates to:
  /// **'Pas encore de note'**
  String get mkcPasEncoreNote;

  /// No description provided for @mkcPassagers.
  ///
  /// In fr, this message translates to:
  /// **'Passagers'**
  String get mkcPassagers;

  /// No description provided for @mkcPlaces.
  ///
  /// In fr, this message translates to:
  /// **'Places'**
  String get mkcPlaces;

  /// No description provided for @mkcPlus.
  ///
  /// In fr, this message translates to:
  /// **'Plus : {label}'**
  String mkcPlus(String label);

  /// No description provided for @mkcPoserUneQuestion.
  ///
  /// In fr, this message translates to:
  /// **'Poser une question'**
  String get mkcPoserUneQuestion;

  /// No description provided for @mkcPriseEnCharge.
  ///
  /// In fr, this message translates to:
  /// **'Prise en charge : {date}'**
  String mkcPriseEnCharge(String date);

  /// No description provided for @mkcPrixParPlace.
  ///
  /// In fr, this message translates to:
  /// **'{price} par place'**
  String mkcPrixParPlace(String price);

  /// No description provided for @mkcPropositionChoisie.
  ///
  /// In fr, this message translates to:
  /// **'Proposition choisie : l’opérateur doit confirmer.'**
  String get mkcPropositionChoisie;

  /// No description provided for @mkcPropositionsRecues.
  ///
  /// In fr, this message translates to:
  /// **'Propositions reçues'**
  String get mkcPropositionsRecues;

  /// No description provided for @mkcPublierLaDemande.
  ///
  /// In fr, this message translates to:
  /// **'Publier la demande'**
  String get mkcPublierLaDemande;

  /// No description provided for @mkcRaisonArrivee.
  ///
  /// In fr, this message translates to:
  /// **'Arrivée à {km} km'**
  String mkcRaisonArrivee(String km);

  /// No description provided for @mkcRaisonDepart.
  ///
  /// In fr, this message translates to:
  /// **'Départ à {km} km'**
  String mkcRaisonDepart(String km);

  /// No description provided for @mkcRaisonOperateurVerifie.
  ///
  /// In fr, this message translates to:
  /// **'Opérateur vérifié'**
  String get mkcRaisonOperateurVerifie;

  /// No description provided for @mkcRaisonPlaces.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{1 place libre} other{{count} places libres}}'**
  String mkcRaisonPlaces(int count);

  /// No description provided for @mkcRaisonVehiculePrive.
  ///
  /// In fr, this message translates to:
  /// **'Véhicule privatisé'**
  String get mkcRaisonVehiculePrive;

  /// No description provided for @mkcRechercheEnCours.
  ///
  /// In fr, this message translates to:
  /// **'Recherche en cours'**
  String get mkcRechercheEnCours;

  /// No description provided for @mkcRechercher.
  ///
  /// In fr, this message translates to:
  /// **'Rechercher'**
  String get mkcRechercher;

  /// No description provided for @mkcReserver.
  ///
  /// In fr, this message translates to:
  /// **'Réserver'**
  String get mkcReserver;

  /// No description provided for @mkcReserverCeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Réserver ce départ'**
  String get mkcReserverCeDepart;

  /// No description provided for @mkcRetour.
  ///
  /// In fr, this message translates to:
  /// **'Retour'**
  String get mkcRetour;

  /// No description provided for @mkcSiegesEnfant.
  ///
  /// In fr, this message translates to:
  /// **'Sièges enfant'**
  String get mkcSiegesEnfant;

  /// No description provided for @mkcSouplesseHoraire.
  ///
  /// In fr, this message translates to:
  /// **'Souplesse sur l’horaire'**
  String get mkcSouplesseHoraire;

  /// No description provided for @mkcStatutAnnulee.
  ///
  /// In fr, this message translates to:
  /// **'Annulée'**
  String get mkcStatutAnnulee;

  /// No description provided for @mkcStatutAttenteOperateur.
  ///
  /// In fr, this message translates to:
  /// **'En attente de l’opérateur'**
  String get mkcStatutAttenteOperateur;

  /// No description provided for @mkcStatutBrouillon.
  ///
  /// In fr, this message translates to:
  /// **'Brouillon'**
  String get mkcStatutBrouillon;

  /// No description provided for @mkcStatutConfirmee.
  ///
  /// In fr, this message translates to:
  /// **'Réservation confirmée'**
  String get mkcStatutConfirmee;

  /// No description provided for @mkcStatutEnCours.
  ///
  /// In fr, this message translates to:
  /// **'Trajet en cours'**
  String get mkcStatutEnCours;

  /// No description provided for @mkcStatutExpiree.
  ///
  /// In fr, this message translates to:
  /// **'Expirée'**
  String get mkcStatutExpiree;

  /// No description provided for @mkcStatutPropositions.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{1 proposition reçue} other{{count} propositions reçues}}'**
  String mkcStatutPropositions(int count);

  /// No description provided for @mkcStatutRecherche.
  ///
  /// In fr, this message translates to:
  /// **'Recherche d’opérateurs'**
  String get mkcStatutRecherche;

  /// No description provided for @mkcStatutTerminee.
  ///
  /// In fr, this message translates to:
  /// **'Terminée'**
  String get mkcStatutTerminee;

  /// No description provided for @mkcVehiculeAccessible.
  ///
  /// In fr, this message translates to:
  /// **'Véhicule accessible aux fauteuils roulants'**
  String get mkcVehiculeAccessible;

  /// No description provided for @mkcVehiculeEntier.
  ///
  /// In fr, this message translates to:
  /// **'Véhicule entier, prix fixe'**
  String get mkcVehiculeEntier;

  /// No description provided for @mkcVoirLeRetour.
  ///
  /// In fr, this message translates to:
  /// **'Voir la réservation du retour'**
  String get mkcVoirLeRetour;

  /// No description provided for @mkcVoirLignesEtDevis.
  ///
  /// In fr, this message translates to:
  /// **'Lignes régulières et devis'**
  String get mkcVoirLignesEtDevis;

  /// No description provided for @mkcVoirMaReservation.
  ///
  /// In fr, this message translates to:
  /// **'Voir ma réservation'**
  String get mkcVoirMaReservation;

  /// No description provided for @tabTrajets.
  ///
  /// In fr, this message translates to:
  /// **'Trajets'**
  String get tabTrajets;

  /// No description provided for @tabColis.
  ///
  /// In fr, this message translates to:
  /// **'Colis'**
  String get tabColis;

  /// No description provided for @tabImpact.
  ///
  /// In fr, this message translates to:
  /// **'Impact'**
  String get tabImpact;

  /// No description provided for @tabCompte.
  ///
  /// In fr, this message translates to:
  /// **'Compte'**
  String get tabCompte;

  /// No description provided for @colisMesColis.
  ///
  /// In fr, this message translates to:
  /// **'Mes colis'**
  String get colisMesColis;

  /// No description provided for @colisIntro.
  ///
  /// In fr, this message translates to:
  /// **'Votre colis voyage dans une navette XLCAB : suivi en direct, photo à la remise, code de remise connu de vous seul.'**
  String get colisIntro;

  /// No description provided for @colisAucun.
  ///
  /// In fr, this message translates to:
  /// **'Aucun colis parmi vos dernières réservations.'**
  String get colisAucun;

  /// No description provided for @colisIndisponible.
  ///
  /// In fr, this message translates to:
  /// **'Impossible de charger vos colis.'**
  String get colisIndisponible;

  /// No description provided for @colisChargement.
  ///
  /// In fr, this message translates to:
  /// **'Chargement de vos colis'**
  String get colisChargement;

  /// No description provided for @impactTitre.
  ///
  /// In fr, this message translates to:
  /// **'Mon impact'**
  String get impactTitre;

  /// No description provided for @impactBientotTitre.
  ///
  /// In fr, this message translates to:
  /// **'Bientôt disponible'**
  String get impactBientotTitre;

  /// No description provided for @impactBientotTexte.
  ///
  /// In fr, this message translates to:
  /// **'Vous verrez ici le CO₂ économisé en partageant vos trajets et en confiant vos colis à une navette déjà en route. Le mode de calcul est en préparation.'**
  String get impactBientotTexte;

  /// No description provided for @appliChauffeurTitre.
  ///
  /// In fr, this message translates to:
  /// **'Application XLCAB Driver'**
  String get appliChauffeurTitre;

  /// No description provided for @appliChauffeurTexte.
  ///
  /// In fr, this message translates to:
  /// **'L’espace chauffeur (candidature, missions, lignes, revenus) se trouve dans l’application XLCAB Driver. Connectez-vous-y avec ce même compte.'**
  String get appliChauffeurTexte;

  /// No description provided for @compris.
  ///
  /// In fr, this message translates to:
  /// **'Compris'**
  String get compris;

  /// No description provided for @drvAucunDepart.
  ///
  /// In fr, this message translates to:
  /// **'Aucun départ de ligne à assurer pour le moment.'**
  String get drvAucunDepart;

  /// No description provided for @drvDepartsIndisponibles.
  ///
  /// In fr, this message translates to:
  /// **'Impossible de charger vos départs.'**
  String get drvDepartsIndisponibles;

  /// No description provided for @drvMesDocuments.
  ///
  /// In fr, this message translates to:
  /// **'Mes documents chauffeur'**
  String get drvMesDocuments;

  /// No description provided for @drvOutils.
  ///
  /// In fr, this message translates to:
  /// **'Lignes et bourse'**
  String get drvOutils;

  /// No description provided for @drvAucuneCourseRecente.
  ///
  /// In fr, this message translates to:
  /// **'Aucune course récente.'**
  String get drvAucuneCourseRecente;

  /// No description provided for @drvCompteNonValide.
  ///
  /// In fr, this message translates to:
  /// **'Disponible dès que votre compte chauffeur est validé par XLCAB.'**
  String get drvCompteNonValide;

  /// No description provided for @secContacts.
  ///
  /// In fr, this message translates to:
  /// **'Contacts de confiance'**
  String get secContacts;

  /// No description provided for @secContactsIntro.
  ///
  /// In fr, this message translates to:
  /// **'Ces proches peuvent suivre vos trajets : vous leur envoyez un lien, ils n’ont pas besoin de l’application.'**
  String get secContactsIntro;

  /// No description provided for @secAucunContact.
  ///
  /// In fr, this message translates to:
  /// **'Aucun contact pour l’instant.'**
  String get secAucunContact;

  /// No description provided for @secAjouterContact.
  ///
  /// In fr, this message translates to:
  /// **'Ajouter un contact'**
  String get secAjouterContact;

  /// No description provided for @secNom.
  ///
  /// In fr, this message translates to:
  /// **'Nom'**
  String get secNom;

  /// No description provided for @secTelephone.
  ///
  /// In fr, this message translates to:
  /// **'Téléphone'**
  String get secTelephone;

  /// No description provided for @secNomRequis.
  ///
  /// In fr, this message translates to:
  /// **'Indiquez un nom'**
  String get secNomRequis;

  /// No description provided for @secTelephoneInvalide.
  ///
  /// In fr, this message translates to:
  /// **'Numéro invalide'**
  String get secTelephoneInvalide;

  /// No description provided for @secSupprimerContact.
  ///
  /// In fr, this message translates to:
  /// **'Supprimer {name} ?'**
  String secSupprimerContact(String name);

  /// No description provided for @secSupprimerContactAction.
  ///
  /// In fr, this message translates to:
  /// **'Supprimer {name}'**
  String secSupprimerContactAction(String name);

  /// No description provided for @secContactsMax.
  ///
  /// In fr, this message translates to:
  /// **'5 contacts au maximum. Supprimez-en un pour en ajouter un autre.'**
  String get secContactsMax;

  /// No description provided for @secContactsIndisponibles.
  ///
  /// In fr, this message translates to:
  /// **'Contacts indisponibles'**
  String get secContactsIndisponibles;

  /// No description provided for @secChargementContacts.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des contacts'**
  String get secChargementContacts;

  /// No description provided for @secPartageAuto.
  ///
  /// In fr, this message translates to:
  /// **'Proposer le partage à chaque trajet'**
  String get secPartageAuto;

  /// No description provided for @secPartageAutoAide.
  ///
  /// In fr, this message translates to:
  /// **'À l’ouverture du suivi, XLCAB vous propose d’envoyer le lien à vos contacts.'**
  String get secPartageAutoAide;

  /// No description provided for @secPartagerTrajet.
  ///
  /// In fr, this message translates to:
  /// **'Partager mon trajet'**
  String get secPartagerTrajet;

  /// No description provided for @secPartageExplication.
  ///
  /// In fr, this message translates to:
  /// **'Votre proche voit le chauffeur, le véhicule et la position de la navette, sans installer l’application. Votre adresse exacte n’est pas affichée.'**
  String get secPartageExplication;

  /// No description provided for @secEnvoyerA.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer à {name}'**
  String secEnvoyerA(String name);

  /// No description provided for @secCopierLien.
  ///
  /// In fr, this message translates to:
  /// **'Copier le lien'**
  String get secCopierLien;

  /// No description provided for @secLienCopie.
  ///
  /// In fr, this message translates to:
  /// **'Lien de suivi copié.'**
  String get secLienCopie;

  /// No description provided for @secArreterPartage.
  ///
  /// In fr, this message translates to:
  /// **'Arrêter le partage'**
  String get secArreterPartage;

  /// No description provided for @secPartageArrete.
  ///
  /// In fr, this message translates to:
  /// **'Partage arrêté : le lien ne fonctionne plus.'**
  String get secPartageArrete;

  /// No description provided for @secMessageSuivi.
  ///
  /// In fr, this message translates to:
  /// **'Je voyage avec XLCAB. Suis mon trajet en direct : {url}'**
  String secMessageSuivi(String url);

  /// No description provided for @secGererContacts.
  ///
  /// In fr, this message translates to:
  /// **'Gérer mes contacts de confiance'**
  String get secGererContacts;

  /// No description provided for @secSmsImpossible.
  ///
  /// In fr, this message translates to:
  /// **'Impossible d’ouvrir la messagerie. Le lien a été copié.'**
  String get secSmsImpossible;

  /// No description provided for @secPartageIndisponible.
  ///
  /// In fr, this message translates to:
  /// **'Partage indisponible pour le moment.'**
  String get secPartageIndisponible;

  /// No description provided for @secAucunContactFeuille.
  ///
  /// In fr, this message translates to:
  /// **'Ajoutez des contacts de confiance pour leur envoyer le lien en un geste.'**
  String get secAucunContactFeuille;

  /// No description provided for @secPreparation.
  ///
  /// In fr, this message translates to:
  /// **'Préparation du lien de suivi'**
  String get secPreparation;

  /// No description provided for @sgTitre.
  ///
  /// In fr, this message translates to:
  /// **'Choisir mes sièges (facultatif)'**
  String get sgTitre;

  /// No description provided for @sgAide.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{Touchez un siège, ou laissez XLCAB l’attribuer.} other{Touchez {count} sièges, ou laissez XLCAB les attribuer.}}'**
  String sgAide(int count);

  /// No description provided for @sgReste.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{Encore 1 siège à choisir} other{Encore {count} sièges à choisir}}'**
  String sgReste(int count);

  /// No description provided for @sgSiegeLibre.
  ///
  /// In fr, this message translates to:
  /// **'Siège {number}, libre'**
  String sgSiegeLibre(int number);

  /// No description provided for @sgSiegePris.
  ///
  /// In fr, this message translates to:
  /// **'Siège {number}, déjà pris'**
  String sgSiegePris(int number);

  /// No description provided for @sgSiegeChoisi.
  ///
  /// In fr, this message translates to:
  /// **'Siège {number}, sélectionné'**
  String sgSiegeChoisi(int number);

  /// No description provided for @sgNumeros.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{Siège {list}} other{Sièges {list}}}'**
  String sgNumeros(int count, String list);

  /// No description provided for @sgPlanIndisponible.
  ///
  /// In fr, this message translates to:
  /// **'Plan des sièges indisponible : ils seront attribués automatiquement.'**
  String get sgPlanIndisponible;

  /// No description provided for @sgDisposition.
  ///
  /// In fr, this message translates to:
  /// **'Sièges présentés par numéro : la disposition dépend du véhicule.'**
  String get sgDisposition;

  /// No description provided for @retReserverLeRetour.
  ///
  /// In fr, this message translates to:
  /// **'Réserver le retour'**
  String get retReserverLeRetour;

  /// No description provided for @etqTitre.
  ///
  /// In fr, this message translates to:
  /// **'Qu’avez-vous apprécié ? (facultatif)'**
  String get etqTitre;

  /// No description provided for @etqConduiteSure.
  ///
  /// In fr, this message translates to:
  /// **'Conduite sûre'**
  String get etqConduiteSure;

  /// No description provided for @etqPonctuel.
  ///
  /// In fr, this message translates to:
  /// **'Ponctualité'**
  String get etqPonctuel;

  /// No description provided for @etqVehiculePropre.
  ///
  /// In fr, this message translates to:
  /// **'Véhicule propre'**
  String get etqVehiculePropre;

  /// No description provided for @etqAccueil.
  ///
  /// In fr, this message translates to:
  /// **'Accueil agréable'**
  String get etqAccueil;

  /// No description provided for @etqColisSoigne.
  ///
  /// In fr, this message translates to:
  /// **'Colis bien traité'**
  String get etqColisSoigne;

  /// No description provided for @impKgEvites.
  ///
  /// In fr, this message translates to:
  /// **'{kg} kg de CO₂ évités'**
  String impKgEvites(String kg);

  /// No description provided for @impSousTitre.
  ///
  /// In fr, this message translates to:
  /// **'en partageant vos trajets en navette'**
  String get impSousTitre;

  /// No description provided for @impTrajets.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =0{Aucun trajet terminé} =1{1 trajet terminé} other{{count} trajets terminés}}'**
  String impTrajets(int count);

  /// No description provided for @impDistance.
  ///
  /// In fr, this message translates to:
  /// **'{km} km en navette'**
  String impDistance(int km);

  /// No description provided for @impMethodeTitre.
  ///
  /// In fr, this message translates to:
  /// **'Comment c’est calculé'**
  String get impMethodeTitre;

  /// No description provided for @impMethode.
  ///
  /// In fr, this message translates to:
  /// **'C’est une estimation. Nous comparons votre trajet au même trajet fait seul en voiture thermique ({car} kg de CO₂e par km, source ADEME). La navette ({shuttle} kg par km) est partagée entre les voyageurs à bord. Seul à bord, rien n’est compté.'**
  String impMethode(String car, String shuttle);

  /// No description provided for @impAucun.
  ///
  /// In fr, this message translates to:
  /// **'Votre bilan apparaîtra ici après votre premier trajet terminé.'**
  String get impAucun;

  /// No description provided for @impIndisponible.
  ///
  /// In fr, this message translates to:
  /// **'Bilan indisponible pour le moment.'**
  String get impIndisponible;

  /// No description provided for @impChargement.
  ///
  /// In fr, this message translates to:
  /// **'Calcul de votre bilan'**
  String get impChargement;

  /// No description provided for @secConductrice.
  ///
  /// In fr, this message translates to:
  /// **'Préférer une conductrice'**
  String get secConductrice;

  /// No description provided for @secConductriceAide.
  ///
  /// In fr, this message translates to:
  /// **'Quand une conductrice est disponible près de vous, elle est sollicitée en premier. Ce n’est pas une garantie : sinon, un autre chauffeur prend votre course.'**
  String get secConductriceAide;

  /// No description provided for @secPreferences.
  ///
  /// In fr, this message translates to:
  /// **'Mes préférences de sécurité'**
  String get secPreferences;

  /// No description provided for @payTitre.
  ///
  /// In fr, this message translates to:
  /// **'Compte de versement'**
  String get payTitre;

  /// No description provided for @payEntree.
  ///
  /// In fr, this message translates to:
  /// **'Compte de versement et reversements'**
  String get payEntree;

  /// No description provided for @payChargement.
  ///
  /// In fr, this message translates to:
  /// **'Chargement du compte de versement'**
  String get payChargement;

  /// No description provided for @payEtatAucun.
  ///
  /// In fr, this message translates to:
  /// **'Aucun compte de versement'**
  String get payEtatAucun;

  /// No description provided for @payEtatAucunAide.
  ///
  /// In fr, this message translates to:
  /// **'Pour recevoir vos revenus des lignes et de la bourse, ouvrez un compte de versement chez Stripe, notre prestataire de paiement. Prévoyez une pièce d’identité et votre IBAN.'**
  String get payEtatAucunAide;

  /// No description provided for @payEtatIncomplet.
  ///
  /// In fr, this message translates to:
  /// **'Compte de versement à compléter'**
  String get payEtatIncomplet;

  /// No description provided for @payEtatIncompletAide.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =0{Stripe attend la fin de votre inscription.} =1{Stripe attend encore 1 information.} other{Stripe attend encore {count} informations.}}'**
  String payEtatIncompletAide(int count);

  /// No description provided for @payEtatVerification.
  ///
  /// In fr, this message translates to:
  /// **'Vérification en cours'**
  String get payEtatVerification;

  /// No description provided for @payEtatVerificationAide.
  ///
  /// In fr, this message translates to:
  /// **'Votre dossier est envoyé. Stripe vérifie vos informations : cela prend en général moins de deux jours ouvrés.'**
  String get payEtatVerificationAide;

  /// No description provided for @payEtatPret.
  ///
  /// In fr, this message translates to:
  /// **'Compte de versement validé'**
  String get payEtatPret;

  /// No description provided for @payEtatPretAide.
  ///
  /// In fr, this message translates to:
  /// **'Vos revenus sont versés sur ce compte après chaque trajet terminé.'**
  String get payEtatPretAide;

  /// No description provided for @payExige.
  ///
  /// In fr, this message translates to:
  /// **'Tant qu’il n’est pas validé, vous ne pouvez ni ouvrir un départ à la réservation ni proposer sur la bourse.'**
  String get payExige;

  /// No description provided for @payOuvrir.
  ///
  /// In fr, this message translates to:
  /// **'Ouvrir mon compte de versement'**
  String get payOuvrir;

  /// No description provided for @payCompleter.
  ///
  /// In fr, this message translates to:
  /// **'Compléter mon dossier'**
  String get payCompleter;

  /// No description provided for @payEspaceStripe.
  ///
  /// In fr, this message translates to:
  /// **'Voir mon espace Stripe'**
  String get payEspaceStripe;

  /// No description provided for @payConfidentialite.
  ///
  /// In fr, this message translates to:
  /// **'Votre identité et votre IBAN sont saisis sur les pages de Stripe : XLCAB n’y a pas accès.'**
  String get payConfidentialite;

  /// No description provided for @payOuvertureImpossible.
  ///
  /// In fr, this message translates to:
  /// **'Impossible d’ouvrir la page de Stripe. Réessayez.'**
  String get payOuvertureImpossible;

  /// No description provided for @payReversements.
  ///
  /// In fr, this message translates to:
  /// **'Mes reversements'**
  String get payReversements;

  /// No description provided for @payReversementsIndisponibles.
  ///
  /// In fr, this message translates to:
  /// **'Reversements indisponibles pour le moment.'**
  String get payReversementsIndisponibles;

  /// No description provided for @payVerse.
  ///
  /// In fr, this message translates to:
  /// **'Versé'**
  String get payVerse;

  /// No description provided for @payEnAttente.
  ///
  /// In fr, this message translates to:
  /// **'En attente'**
  String get payEnAttente;

  /// No description provided for @payRetenu.
  ///
  /// In fr, this message translates to:
  /// **'Retenu'**
  String get payRetenu;

  /// No description provided for @payExplication.
  ///
  /// In fr, this message translates to:
  /// **'Après chaque trajet de ligne ou de bourse payé en ligne, vous recevez le prix hors taxes moins la commission XLCAB.'**
  String get payExplication;

  /// No description provided for @payVoirPenalites.
  ///
  /// In fr, this message translates to:
  /// **'Voir mes annulations et pénalités'**
  String get payVoirPenalites;

  /// No description provided for @payAucunReversement.
  ///
  /// In fr, this message translates to:
  /// **'Aucun reversement pour le moment.'**
  String get payAucunReversement;

  /// No description provided for @payStatutEnCours.
  ///
  /// In fr, this message translates to:
  /// **'Virement en cours'**
  String get payStatutEnCours;

  /// No description provided for @payStatutVerse.
  ///
  /// In fr, this message translates to:
  /// **'Versé'**
  String get payStatutVerse;

  /// No description provided for @payStatutBloque.
  ///
  /// In fr, this message translates to:
  /// **'En attente de votre compte de versement'**
  String get payStatutBloque;

  /// No description provided for @payStatutRetenu.
  ///
  /// In fr, this message translates to:
  /// **'Retenu pour une pénalité'**
  String get payStatutRetenu;

  /// No description provided for @payDetailRetenue.
  ///
  /// In fr, this message translates to:
  /// **'Revenu {gross} · retenu {withheld} au titre d’une pénalité d’annulation'**
  String payDetailRetenue(String gross, String withheld);

  /// No description provided for @payBanniere.
  ///
  /// In fr, this message translates to:
  /// **'Ouvrez votre compte de versement pour mettre vos départs en vente et répondre aux demandes.'**
  String get payBanniere;

  /// No description provided for @payPenaliteRecouvree.
  ///
  /// In fr, this message translates to:
  /// **'Déjà retenu sur vos reversements : {amount}'**
  String payPenaliteRecouvree(String amount);

  /// No description provided for @mkcPaiementAbandonne.
  ///
  /// In fr, this message translates to:
  /// **'Paiement non finalisé : votre réservation n’est pas enregistrée et rien n’a été débité.'**
  String get mkcPaiementAbandonne;

  /// No description provided for @mkcCarteAValider.
  ///
  /// In fr, this message translates to:
  /// **'Carte à valider'**
  String get mkcCarteAValider;

  /// No description provided for @mkcValiderMaCarte.
  ///
  /// In fr, this message translates to:
  /// **'Valider ma carte'**
  String get mkcValiderMaCarte;

  /// No description provided for @mkcCarteAutorisee.
  ///
  /// In fr, this message translates to:
  /// **'Carte autorisée. L’opérateur a 2 heures pour confirmer : vous ne serez débité qu’à ce moment-là.'**
  String get mkcCarteAutorisee;

  /// No description provided for @mkcCarteNonValidee.
  ///
  /// In fr, this message translates to:
  /// **'Carte non validée : votre choix n’est pas encore transmis. Vous avez 15 minutes pour la valider.'**
  String get mkcCarteNonValidee;

  /// No description provided for @payBonus.
  ///
  /// In fr, this message translates to:
  /// **'Bonus de reprise'**
  String get payBonus;

  /// No description provided for @payBonusAide.
  ///
  /// In fr, this message translates to:
  /// **'Pour un départ que vous avez sauvé. Le bonus est versé dès que la pénalité du chauffeur remplacé a été recouvrée.'**
  String get payBonusAide;

  /// No description provided for @payBonusEnAttente.
  ///
  /// In fr, this message translates to:
  /// **'En attente du recouvrement de la pénalité'**
  String get payBonusEnAttente;

  /// No description provided for @payFacturePenalite.
  ///
  /// In fr, this message translates to:
  /// **'Facture {number} : {amount} restent à régler avant le {date}'**
  String payFacturePenalite(String number, String amount, String date);

  /// No description provided for @expTitre.
  ///
  /// In fr, this message translates to:
  /// **'Télécharger mes données'**
  String get expTitre;

  /// No description provided for @expSousTitre.
  ///
  /// In fr, this message translates to:
  /// **'Profil, trajets, paiements, préférences'**
  String get expSousTitre;

  /// No description provided for @expExplication.
  ///
  /// In fr, this message translates to:
  /// **'Votre navigateur va télécharger un fichier avec toutes les données de votre compte : profil, trajets, paiements, préférences, contacts de confiance. Le lien est valable 5 minutes et ne sert qu’une fois. Cinq téléchargements par jour au plus.'**
  String get expExplication;

  /// No description provided for @expTelecharger.
  ///
  /// In fr, this message translates to:
  /// **'Télécharger'**
  String get expTelecharger;

  /// No description provided for @expOuvert.
  ///
  /// In fr, this message translates to:
  /// **'Le téléchargement a démarré dans votre navigateur.'**
  String get expOuvert;

  /// No description provided for @expPreparation.
  ///
  /// In fr, this message translates to:
  /// **'Préparation du téléchargement'**
  String get expPreparation;

  /// No description provided for @gtConfirme.
  ///
  /// In fr, this message translates to:
  /// **'Départ confirmé'**
  String get gtConfirme;

  /// No description provided for @gtEnAttente.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{Encore 1 passager pour confirmer le départ} other{Encore {count} passagers pour confirmer le départ}}'**
  String gtEnAttente(int count);

  /// No description provided for @gtEnAttenteCourt.
  ///
  /// In fr, this message translates to:
  /// **'En attente d’autres passagers pour confirmer le départ'**
  String get gtEnAttenteCourt;

  /// No description provided for @gtAnnule.
  ///
  /// In fr, this message translates to:
  /// **'Départ annulé : pas assez de passagers'**
  String get gtAnnule;

  /// No description provided for @gtRemboursement.
  ///
  /// In fr, this message translates to:
  /// **'S’il n’est pas confirmé avant le {date}, le départ est annulé et vous êtes remboursé intégralement.'**
  String gtRemboursement(String date);

  /// No description provided for @gtSeuilTitre.
  ///
  /// In fr, this message translates to:
  /// **'Seuil de départ garanti'**
  String get gtSeuilTitre;

  /// No description provided for @gtSeuilAide.
  ///
  /// In fr, this message translates to:
  /// **'Vous partez d’office dès que ce nombre de passagers a réservé. S’il n’est pas atteint 24 h avant le départ, le départ est annulé sans frais, les passagers sont remboursés et vous n’avez aucune pénalité.'**
  String get gtSeuilAide;

  /// No description provided for @gtSeuilChamp.
  ///
  /// In fr, this message translates to:
  /// **'Je pars dès … passagers'**
  String get gtSeuilChamp;

  /// No description provided for @gtSeuilInvalide.
  ///
  /// In fr, this message translates to:
  /// **'Entre 1 et le nombre de places'**
  String get gtSeuilInvalide;

  /// No description provided for @gtSeuilRappel.
  ///
  /// In fr, this message translates to:
  /// **'{count, plural, =1{Votre seuil : 1 passager.} other{Votre seuil : {count} passagers.}}'**
  String gtSeuilRappel(int count);

  /// No description provided for @gtEcheance.
  ///
  /// In fr, this message translates to:
  /// **'À atteindre avant le {date}'**
  String gtEcheance(String date);

  /// No description provided for @gtJePars.
  ///
  /// In fr, this message translates to:
  /// **'Je pars quand même'**
  String get gtJePars;

  /// No description provided for @gtJeParsTitre.
  ///
  /// In fr, this message translates to:
  /// **'Partir sans attendre le seuil ?'**
  String get gtJeParsTitre;

  /// No description provided for @gtJeParsTexte.
  ///
  /// In fr, this message translates to:
  /// **'Votre départ devient ferme : vos passagers sont prévenus, et une annulation de votre part suivra le protocole habituel (chauffeur de secours, pénalités).'**
  String get gtJeParsTexte;

  /// No description provided for @gtJeParsFait.
  ///
  /// In fr, this message translates to:
  /// **'Départ confirmé : vos passagers sont prévenus.'**
  String get gtJeParsFait;

  /// No description provided for @gtRetirerExplication.
  ///
  /// In fr, this message translates to:
  /// **'Votre seuil n’est pas atteint : vos passagers seront remboursés intégralement, sans chauffeur de secours et sans pénalité pour vous.'**
  String get gtRetirerExplication;

  /// No description provided for @gtDepartRetire.
  ///
  /// In fr, this message translates to:
  /// **'Départ retiré : vos passagers sont remboursés.'**
  String get gtDepartRetire;

  /// No description provided for @gtAnnulationGratuite.
  ///
  /// In fr, this message translates to:
  /// **'Gratuit tant que le départ n’est pas confirmé : vous êtes remboursé intégralement.'**
  String get gtAnnulationGratuite;

  /// No description provided for @poPublierUnDepart.
  ///
  /// In fr, this message translates to:
  /// **'Publier un départ'**
  String get poPublierUnDepart;

  /// No description provided for @poPublierLeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Publier et mettre en vente'**
  String get poPublierLeDepart;

  /// No description provided for @poDateEtHeure.
  ///
  /// In fr, this message translates to:
  /// **'Date et heure'**
  String get poDateEtHeure;

  /// No description provided for @poJourDuDepart.
  ///
  /// In fr, this message translates to:
  /// **'Jour du départ'**
  String get poJourDuDepart;

  /// No description provided for @poDepartPublie.
  ///
  /// In fr, this message translates to:
  /// **'Départ publié : il est en vente.'**
  String get poDepartPublie;

  /// No description provided for @poApresPublication.
  ///
  /// In fr, this message translates to:
  /// **'Votre départ est mis en vente dès sa publication. Les voyageurs le trouvent dans « Trouver une place ».'**
  String get poApresPublication;

  /// No description provided for @poDepartPonctuelLe.
  ///
  /// In fr, this message translates to:
  /// **'Départ ponctuel le {date} à {time}'**
  String poDepartPonctuelLe(String date, String time);

  /// No description provided for @stArrets.
  ///
  /// In fr, this message translates to:
  /// **'Arrêts'**
  String get stArrets;

  /// No description provided for @stArretsAide.
  ///
  /// In fr, this message translates to:
  /// **'Facultatif : des points de rencontre XLCAB sur votre trajet. Chaque voyageur paie seulement sa partie du trajet (différence entre les prix depuis le départ).'**
  String get stArretsAide;

  /// No description provided for @stAjouterUnArret.
  ///
  /// In fr, this message translates to:
  /// **'Ajouter un arrêt'**
  String get stAjouterUnArret;

  /// No description provided for @stAjouter.
  ///
  /// In fr, this message translates to:
  /// **'Ajouter'**
  String get stAjouter;

  /// No description provided for @stRetirerArret.
  ///
  /// In fr, this message translates to:
  /// **'Retirer l’arrêt {name}'**
  String stRetirerArret(String name);

  /// No description provided for @stPassagePrix.
  ///
  /// In fr, this message translates to:
  /// **'Passage {offset} · {price} depuis le départ'**
  String stPassagePrix(String offset, String price);

  /// No description provided for @stArretLigne.
  ///
  /// In fr, this message translates to:
  /// **'Arrêt : {name} ({offset}, {price} depuis le départ)'**
  String stArretLigne(String name, String offset, String price);

  /// No description provided for @stChargementDesPoints.
  ///
  /// In fr, this message translates to:
  /// **'Chargement des points de rencontre'**
  String get stChargementDesPoints;

  /// No description provided for @stAucunPoint.
  ///
  /// In fr, this message translates to:
  /// **'Aucun autre point de rencontre au catalogue pour le moment.'**
  String get stAucunPoint;

  /// No description provided for @stPassageMinutes.
  ///
  /// In fr, this message translates to:
  /// **'Passage, en minutes après le départ'**
  String get stPassageMinutes;

  /// No description provided for @stPrixDepuisDepart.
  ///
  /// In fr, this message translates to:
  /// **'Prix par place depuis le départ'**
  String get stPrixDepuisDepart;

  /// No description provided for @stDureeRequise.
  ///
  /// In fr, this message translates to:
  /// **'Indiquez la durée du trajet pour placer des arrêts.'**
  String get stDureeRequise;

  /// No description provided for @stMonteA.
  ///
  /// In fr, this message translates to:
  /// **'monte à {place}'**
  String stMonteA(String place);

  /// No description provided for @stDescendA.
  ///
  /// In fr, this message translates to:
  /// **'descend à {place}'**
  String stDescendA(String place);

  /// No description provided for @stTroncon.
  ///
  /// In fr, this message translates to:
  /// **'Une partie du trajet : vous payez seulement votre tronçon.'**
  String get stTroncon;

  /// No description provided for @stPointDeRencontre.
  ///
  /// In fr, this message translates to:
  /// **'Point de rencontre : {name}'**
  String stPointDeRencontre(String name);

  /// No description provided for @lcColis.
  ///
  /// In fr, this message translates to:
  /// **'Colis'**
  String get lcColis;

  /// No description provided for @lcColisAide.
  ///
  /// In fr, this message translates to:
  /// **'Facultatif : des colis remis par leurs expéditeurs au point de départ ou à un arrêt, livrés à l’arrivée avec le code du destinataire.'**
  String get lcColisAide;

  /// No description provided for @lcColisParDepart.
  ///
  /// In fr, this message translates to:
  /// **'Colis acceptés par départ (0 = aucun)'**
  String get lcColisParDepart;

  /// No description provided for @lcVingtAuPlus.
  ///
  /// In fr, this message translates to:
  /// **'20 au plus'**
  String get lcVingtAuPlus;

  /// No description provided for @lcPrixParColis.
  ///
  /// In fr, this message translates to:
  /// **'Prix par colis (TTC)'**
  String get lcPrixParColis;

  /// No description provided for @lcLigneReguliere.
  ///
  /// In fr, this message translates to:
  /// **'Ligne régulière · {operator}'**
  String lcLigneReguliere(String operator);

  /// No description provided for @lcRemiseAuChauffeur.
  ///
  /// In fr, this message translates to:
  /// **'Remise au chauffeur : {place}, {time}'**
  String lcRemiseAuChauffeur(String place, String time);

  /// No description provided for @lcRetraitA.
  ///
  /// In fr, this message translates to:
  /// **'Livré à : {place}'**
  String lcRetraitA(String place);

  /// No description provided for @lcEnvoyerSurCeDepart.
  ///
  /// In fr, this message translates to:
  /// **'Envoyer · {price}'**
  String lcEnvoyerSurCeDepart(String price);

  /// No description provided for @lcLigne.
  ///
  /// In fr, this message translates to:
  /// **'Ligne régulière : remis au chauffeur au point de rendez-vous'**
  String get lcLigne;

  /// No description provided for @dcTitre.
  ///
  /// In fr, this message translates to:
  /// **'Charte caméra embarquée'**
  String get dcTitre;

  /// No description provided for @dcChargement.
  ///
  /// In fr, this message translates to:
  /// **'Chargement de la charte'**
  String get dcChargement;

  /// No description provided for @dcIntro.
  ///
  /// In fr, this message translates to:
  /// **'Votre véhicule est équipé d’une caméra embarquée. Cette charte fixe ce qu’elle filme, quand les images sont utilisées et vos engagements. Vous devez l’accepter pour recevoir des trajets.'**
  String get dcIntro;

  /// No description provided for @dcPourquoiTitre.
  ///
  /// In fr, this message translates to:
  /// **'Pourquoi'**
  String get dcPourquoiTitre;

  /// No description provided for @dcPourquoi1.
  ///
  /// In fr, this message translates to:
  /// **'Uniquement pour la sécurité des personnes et des biens : établir les faits en cas d’accident, d’agression, de SOS ou de litige grave.'**
  String get dcPourquoi1;

  /// No description provided for @dcPourquoi2.
  ///
  /// In fr, this message translates to:
  /// **'Jamais pour surveiller votre travail, vous noter, ni pour un usage commercial.'**
  String get dcPourquoi2;

  /// No description provided for @dcCommentTitre.
  ///
  /// In fr, this message translates to:
  /// **'Comment'**
  String get dcCommentTitre;

  /// No description provided for @dcComment1.
  ///
  /// In fr, this message translates to:
  /// **'L’enregistrement reste dans la caméra du véhicule : l’appli XLCAB ne filme rien et ne reçoit aucune image.'**
  String get dcComment1;

  /// No description provided for @dcComment2.
  ///
  /// In fr, this message translates to:
  /// **'Enregistrement en boucle, effacé automatiquement au bout de 72 heures au plus.'**
  String get dcComment2;

  /// No description provided for @dcComment3.
  ///
  /// In fr, this message translates to:
  /// **'Sans le son. Un autocollant informe les passagers dès l’entrée du véhicule.'**
  String get dcComment3;

  /// No description provided for @dcQuandTitre.
  ///
  /// In fr, this message translates to:
  /// **'Quand les images sont extraites'**
  String get dcQuandTitre;

  /// No description provided for @dcQuand1.
  ///
  /// In fr, this message translates to:
  /// **'Après un SOS ou un incident signalé : l’équipe XLCAB vous demande, dans l’appli, de conserver l’enregistrement du trajet concerné.'**
  String get dcQuand1;

  /// No description provided for @dcQuand2.
  ///
  /// In fr, this message translates to:
  /// **'Sur réquisition des forces de l’ordre ou de la justice. Seule la séquence utile est remise, par le canal sécurisé indiqué par l’équipe.'**
  String get dcQuand2;

  /// No description provided for @dcEngagementsTitre.
  ///
  /// In fr, this message translates to:
  /// **'Vos engagements'**
  String get dcEngagementsTitre;

  /// No description provided for @dcEngagement1.
  ///
  /// In fr, this message translates to:
  /// **'Garder la caméra active, réglée en boucle de 72 h, sans le son.'**
  String get dcEngagement1;

  /// No description provided for @dcEngagement2.
  ///
  /// In fr, this message translates to:
  /// **'Apposer l’autocollant d’information fourni par XLCAB.'**
  String get dcEngagement2;

  /// No description provided for @dcEngagement3.
  ///
  /// In fr, this message translates to:
  /// **'Conserver l’enregistrement demandé après un incident et le remettre par le canal sécurisé indiqué.'**
  String get dcEngagement3;

  /// No description provided for @dcEngagement4.
  ///
  /// In fr, this message translates to:
  /// **'Ne jamais consulter, copier ni diffuser les images en dehors de ces cas ; signaler toute panne, perte ou vol.'**
  String get dcEngagement4;

  /// No description provided for @dcJAccepte.
  ///
  /// In fr, this message translates to:
  /// **'J’accepte la charte'**
  String get dcJAccepte;

  /// No description provided for @dcAcceptee.
  ///
  /// In fr, this message translates to:
  /// **'Charte acceptée.'**
  String get dcAcceptee;

  /// No description provided for @dcDejaAcceptee.
  ///
  /// In fr, this message translates to:
  /// **'Charte acceptée'**
  String get dcDejaAcceptee;

  /// No description provided for @dcAccepteeLe.
  ///
  /// In fr, this message translates to:
  /// **'Charte acceptée le {date}'**
  String dcAccepteeLe(String date);

  /// No description provided for @dcVersion.
  ///
  /// In fr, this message translates to:
  /// **'Version {version}'**
  String dcVersion(String version);

  /// No description provided for @dcAAccepter.
  ///
  /// In fr, this message translates to:
  /// **'Acceptez la charte caméra embarquée pour passer en ligne et démarrer vos trajets.'**
  String get dcAAccepter;

  /// No description provided for @dcLireLaCharte.
  ///
  /// In fr, this message translates to:
  /// **'Lire la charte'**
  String get dcLireLaCharte;

  /// No description provided for @dcConserverTitre.
  ///
  /// In fr, this message translates to:
  /// **'Conservez l’enregistrement'**
  String get dcConserverTitre;

  /// No description provided for @dcConserverTexte.
  ///
  /// In fr, this message translates to:
  /// **'Un incident a été signalé sur votre trajet du {date} ({route}). Ne laissez pas la caméra l’effacer : l’équipe XLCAB vous indiquera comment le remettre.'**
  String dcConserverTexte(String date, String route);

  /// No description provided for @dcCestNote.
  ///
  /// In fr, this message translates to:
  /// **'C’est noté, je l’ai conservé'**
  String get dcCestNote;

  /// No description provided for @dcMerciConserve.
  ///
  /// In fr, this message translates to:
  /// **'Merci : l’équipe est prévenue.'**
  String get dcMerciConserve;

  /// No description provided for @pcTitre.
  ///
  /// In fr, this message translates to:
  /// **'Caméra embarquée'**
  String get pcTitre;

  /// No description provided for @pcLigne.
  ///
  /// In fr, this message translates to:
  /// **'Véhicule équipé d’une caméra embarquée (sécurité)'**
  String get pcLigne;

  /// No description provided for @pcExplication.
  ///
  /// In fr, this message translates to:
  /// **'Pour la sécurité de tous, le véhicule est équipé d’une caméra. L’enregistrement reste dans la caméra, sans le son, et s’efface automatiquement au bout de 72 heures au plus. Il n’est consulté qu’en cas de SOS, d’incident signalé ou de réquisition judiciaire. Détails et droits : politique de confidentialité.'**
  String get pcExplication;

  /// No description provided for @pcCompris.
  ///
  /// In fr, this message translates to:
  /// **'Compris'**
  String get pcCompris;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en', 'fr'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
    case 'fr':
      return AppLocalizationsFr();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
