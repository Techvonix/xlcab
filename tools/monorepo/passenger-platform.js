// Étape 2 : permissions de l'appli passager (pas de position en arrière-plan, pas de permission caméra Android).
const fs = require('fs');
const P = 'C:/xlcab/apps/passenger/';
function edit(file, fn) {
  const s = fs.readFileSync(P + file, 'utf8');
  const t = fn(s);
  if (t === s) throw new Error('aucun changement : ' + file);
  fs.writeFileSync(P + file, t);
}
function must(s, re, to) {
  if (!re.test(s)) throw new Error('motif introuvable : ' + re);
  return s.replace(re, to);
}

edit('android/app/src/main/AndroidManifest.xml', (s) => {
  s = must(s, /    <!-- Position : alerte SOS[^\n]*-->\n/, '    <!-- Position, seulement pendant l\'utilisation : alerte SOS et navettes proches.\n         Aucune position en arrière-plan dans l\'appli passager. -->\n');
  s = must(s, /    <!-- Mode chauffeur : la position continue[\s\S]*?FOREGROUND_SERVICE_LOCATION"\/>\n/, '');
  s = must(s, /    <!-- Scan du QR d'embarquement du passager\. -->\n    <uses-permission android:name="android\.permission\.CAMERA"\/>\n/, '    <!-- Pas de permission CAMERA : la photo d\'un colis passe par l\'appareil photo du téléphone. -->\n');
  s = must(s, /        <!-- Mode chauffeur : itinéraire ouvert dans Google Maps \/ Waze\. -->\n/, '        <!-- Liens légaux et partage du suivi ouverts dans le navigateur. -->\n');
  return s;
});

edit('ios/Runner/Info.plist', (s) => {
  s = must(s, /(<key>NSLocationWhenInUseUsageDescription<\/key>\n\t<string>)[^<]*(<\/string>\n)/, '$1XLCAB utilise votre position pour la joindre à une alerte SOS pendant un trajet et pour vous indiquer les navettes proches.$2');
  s = must(s, /\t<key>NSLocationAlwaysAndWhenInUseUsageDescription<\/key>\n\t<string>[^<]*<\/string>\n/, '');
  s = must(s, /\t<!-- Mode chauffeur en ligne[^\n]*-->\n\t<key>UIBackgroundModes<\/key>\n\t<array>\n\t\t<string>location<\/string>\n\t<\/array>\n/, '');
  s = must(s, /\t<!-- Onboarding chauffeur[^\n]*-->\n(\t<key>NSCameraUsageDescription<\/key>\n\t<string>)[^<]*(<\/string>\n\t<key>NSPhotoLibraryUsageDescription<\/key>\n\t<string>)[^<]*(<\/string>\n)/, '\t<!-- Photo d\'un colis à l\'envoi. -->\n$1XLCAB utilise l\'appareil photo pour photographier le colis que vous envoyez.$2XLCAB accède à vos photos uniquement pour que vous choisissiez la photo d\'un colis.$3');
  return s;
});
console.log('ok');
