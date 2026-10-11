// Logo XLCAB, identité « Orbite » : un X (un trait continu, deux segments
// arrêtés au croisement) dans un anneau, avec un point satellite ; mot-symbole
// du site xlcab.com (traits fins, A sans barre, B ouvert). Géométrie identique
// à brand/xlcab-symbole.svg et brand/xlcab-mot-symbole.svg : à reporter ici en
// cas de retouche (voir brand/README.md). Couleurs du fond clair des portails.

const CYAN = '#0E7490';
const SATELLITE = '#A21CAF';

/** Symbole seul, décoratif : le nom « XLCAB » est toujours présent à côté. */
export function XlcabSymbol({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true" focusable="false" className={className}>
      <circle cx={60} cy={60} r={53} fill="none" stroke={CYAN} strokeWidth={4} />
      <path fill="none" stroke={CYAN} strokeWidth={10.5} strokeLinecap="round" d="M32 32 L88 88 M88 32 L69 51 M32 88 L51 69" />
      <circle cx={104} cy={30.5} r={8.5} fill={SATELLITE} />
    </svg>
  );
}

/** Mot-symbole « XLCAB » (couleur du texte courant) ; lu « XLCAB » par les lecteurs d'écran. */
export function XlcabWordmark({ height = 16, className }: { height?: number; className?: string }) {
  return (
    <svg viewBox="0 0 514 100" height={height} width={height * 5.14} role="img" aria-label="XLCAB" focusable="false" className={className}>
      <defs>
        <clipPath id="xlcab-cadre">
          <rect x={0} y={0} width={514} height={100} />
        </clipPath>
      </defs>
      <g clipPath="url(#xlcab-cadre)" fill="none" stroke="currentColor" strokeWidth={9}>
        <path d="M-4 -10 L92 110 M92 -10 L-4 110" />
        <path d="M116 0 V96 H182" />
        <path d="M288.53 17.47 A46 46 0 1 0 288.53 82.53" />
        <path d="M321 110 L371 9 L421 110" />
        <path d="M446 4 H486 A23 23 0 0 1 486 50 H446 M486 50 A23 23 0 0 1 486 96 H446" />
      </g>
    </svg>
  );
}

/** Symbole + mot-symbole + nom de l'espace (« Entreprise », « Admin »…) en couleur de marque. */
export function XlcabLogo({ space, size = 28 }: { space?: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <XlcabSymbol size={size} />
      <XlcabWordmark height={size * 0.5} />
      {space && <span className="font-heading font-bold tracking-tight text-primary">{space}</span>}
    </span>
  );
}
