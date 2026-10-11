# XLCAB — identité visuelle « Orbite »

Identité choisie par le porteur de projet le 10 octobre 2026 (elle remplace la piste A
« Le Trajet »). Ce dossier est la **référence unique** du logo : toute retouche part d'ici,
puis est reportée aux endroits listés plus bas.

## Le symbole

Un X dans un anneau, avec un point satellite. Le X garde l'idée d'origine : deux routes
qui se croisent, l'une continue, l'autre interrompue au croisement. Repère de 120 × 120 :

| Élément | Géométrie |
|---|---|
| Anneau | cercle de centre (60, 60), rayon 53, trait de 4 |
| Trait continu | ligne (32, 32) → (88, 88), épaisseur 10,5, bouts ronds |
| Deux segments | (88, 32) → (69, 51) et (32, 88) → (51, 69), même trait |
| Satellite | disque de centre (104, 30,5), rayon 8,5, posé sur l'anneau |

## Le nom

Le mot-symbole est celui du site xlcab.com (`/images/xlcab.png`), redessiné en traits :
lettres fines et géométriques, **A sans barre**, **B ouvert sans montant**. Repère de
514 × 100, trait de 8 (9 dans les portails, pour la lisibilité en petite taille),
extrémités coupées à plat en haut et en bas (`xlcab-mot-symbole.svg`).

Dans le logo horizontal : hauteur du mot-symbole ≈ 0,46 × celle du symbole, espace
symbole–nom ≈ 0,3 ×. Baseline : « Navettes 7+ places. Trajets 60 km+. Colis inclus. »
(Inter SemiBold).

## Couleurs

| Usage | Fond sombre (par défaut dans l'app) | Fond clair |
|---|---|---|
| Fond | nuit #070B1A, cartes #111936 | blanc, surfaces #F4F7FB |
| Marque, actions | cyan orbite #22D3EE (12:1 sur la nuit) | cyan profond #0E7490 (5,4:1 sur blanc) |
| Texte sur un bouton | #04202B sur le cyan orbite | blanc sur le cyan profond |
| Satellite, signaux secondaires | lilas #F0ABFC | magenta #A21CAF |
| Texte | #E8F1FF | #0B1220 |
| Bordures | #2A3A66 | #D9E0EA |

Le cyan orbite ne s'utilise **que sur fond sombre** : sur blanc, il est illisible (1,8:1).

Les couleurs des navettes restent les repères de catégorie de service, sans changement :
Rose #E91E63, Bleue #2196F3, Orange #FF9800, PMR #607D8B (textes sur fond clair :
#1565C0, #A85A00, #546E7A).

## Fichiers

| Fichier | Usage |
|---|---|
| `xlcab-symbole.svg` | Symbole, fond clair (favicon des portails) |
| `xlcab-symbole-nuit.svg` | Symbole, fond sombre |
| `xlcab-mot-symbole.svg` | Mot-symbole seul |
| `xlcab-icone-app.svg` | Icône d'application 1024 × 1024 (carré plein nuit, l'OS arrondit) |
| `xlcab-logo.svg`, `xlcab-logo-sombre.svg` | Logo horizontal, fond clair / sombre |
| `xlcab-logo-email.png` | Logo des futurs e-mails (560 × 160, affiché en 280 × 80) |
| `generate-icons.ps1` | Régénère toutes les images PNG ci-dessous |

## Où le logo est défini (à mettre à jour après une retouche)

1. Les SVG de ce dossier.
2. **App Flutter** : `xlcab_app/lib/widgets/xlcab_logo.dart` (`XlcabSymbolPainter`,
   `XlcabWordmarkPainter`) — splash, onboarding, connexion, accueil. Couleurs :
   `lib/theme/app_colors.dart` ; thème sombre par défaut (`PreferencesStore.readTheme`).
3. **Android** : `xlcab_app/android/app/src/main/res/drawable/ic_launcher_foreground.xml`
   (icône adaptative, écran de démarrage Android 12+, et celui des versions antérieures via
   `launch_background.xml`). Couleur de fond : `values/colors.xml`.
4. **Portails web** : `src/components/brand/XlcabLogo.tsx` dans `xlcab_corporate` et
   `xlcab_admin` (copie identique), `public/favicon.svg` (copie de `xlcab-symbole.svg`),
   couleurs dans `src/index.css` (`--color-primary`). Les portails restent en thème clair.
5. **Factures PDF** : `drawSymbol` dans `xlcab_backend/src/invoices/invoice-pdf.ts`.
6. Puis, depuis `C:\xlcab` : `.\brand\generate-icons.ps1`, qui régénère les icônes Android
   (versions < 8), toutes les icônes iOS (opaques, exigence App Store), l'image du démarrage
   iOS, les favicons PNG et `apple-touch-icon.png` des portails, le logo des e-mails.

Nom affiché sous l'icône : « XLCAB » (`android:label` dans `AndroidManifest.xml`,
`CFBundleDisplayName` dans `ios/Runner/Info.plist`). Fond du démarrage iOS : nuit #070B1A
dans `ios/Runner/Base.lproj/LaunchScreen.storyboard`.

## Avant le dépôt de marque (EUIPO)

Faire vérifier par un conseil en propriété intellectuelle que le symbole et le mot-symbole
ne ressemblent pas à une marque existante dans les classes visées (transport, logistique,
logiciels). Le graphisme reste à faire valider par le web développeur.
