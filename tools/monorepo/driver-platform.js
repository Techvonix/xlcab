// Étape 3 : l'appli chauffeur n'embarque pas la carte Google (itinéraire ouvert dans Maps / Waze).
const fs = require('fs');
const P = 'C:/xlcab/apps/driver/android/app/';
function edit(file, steps) {
  let s = fs.readFileSync(P + file, 'utf8');
  for (const [re, to] of steps) {
    if (!re.test(s)) throw new Error(file + ' : motif introuvable : ' + re);
    s = s.replace(re, to);
  }
  fs.writeFileSync(P + file, s);
}
edit('src/main/AndroidManifest.xml', [
  [/        <!-- Clé Google Maps SDK, injectée par build\.gradle\.kts\. -->\n        <meta-data\n            android:name="com\.google\.android\.geo\.API_KEY"\n            android:value="\$\{mapsApiKey\}" \/>\n/, ''],
  [/    <!-- API XLCAB, WebSocket de suivi, Google Maps\./, '    <!-- API XLCAB et canal temps réel des missions.'],
  [/    <!-- Position : alerte SOS \(écran 9\) et mode chauffeur en ligne \(écran 15\)\. -->/, '    <!-- Position du chauffeur en ligne (missions proches, suivi par le passager). -->'],
  [/    <!-- Scan du QR d'embarquement du passager\. -->/, "    <!-- Scan du QR d'embarquement des passagers et des colis, photo des documents. -->"],
]);
edit('build.gradle.kts', [
  [/import java\.util\.Properties\n\n\/\/ Clé Google Maps SDK[\s\S]*?    \?: ""\n\n/, ''],
  [/        manifestPlaceholders\["mapsApiKey"\] = mapsApiKey\n/, ''],
]);
console.log('ok');
