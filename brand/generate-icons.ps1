# XLCAB — génère toutes les images matricielles de la marque (icônes d'app, écran de
# démarrage iOS, favicons, logo des e-mails) à partir de la géométrie du logo « Orbite ».
# Aucun outil à installer : moteur de dessin de Windows (System.Drawing).
#
# Usage (PowerShell, depuis C:\xlcab) :  .\brand\generate-icons.ps1
# À relancer après toute retouche de la géométrie ou des couleurs (voir README.md).

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot

# ── Couleurs (identité Orbite) ─────────────────────────────────────────
$tones = @{
  light = @{ Cyan = '#0E7490'; Dot = '#A21CAF'; Ink = '#0B1220' }   # fond clair
  night = @{ Cyan = '#22D3EE'; Dot = '#F0ABFC'; Ink = '#E8F1FF' }   # fond nuit
}
$brandBg = '#070B1A'
function Col([string]$hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }

# ── Symbole, repère 120 × 120 (identique à xlcab-symbole.svg) ──────────
function Draw-Symbol($g, [double]$scale, [double]$dx, [double]$dy, $tone) {
  $state = $g.Save()
  $g.TranslateTransform([single]$dx, [single]$dy)
  $g.ScaleTransform([single]$scale, [single]$scale)
  # Anneau.
  $ring = New-Object System.Drawing.Pen (Col $tone.Cyan), 4
  $g.DrawEllipse($ring, 7, 7, 106, 106)
  # Trait continu et deux segments arrêtés au croisement, bouts ronds.
  $pen = New-Object System.Drawing.Pen (Col $tone.Cyan), 10.5
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawLine($pen, 32, 32, 88, 88)
  $g.DrawLine($pen, 88, 32, 69, 51)
  $g.DrawLine($pen, 32, 88, 51, 69)
  # Satellite, posé sur l'anneau.
  $dot = New-Object System.Drawing.SolidBrush (Col $tone.Dot)
  $g.FillEllipse($dot, 95.5, 22, 17, 17)
  $ring.Dispose(); $pen.Dispose(); $dot.Dispose()
  $g.Restore($state)
}

# ── Mot-symbole, repère 514 × 100 (identique à xlcab-mot-symbole.svg) ──
function Draw-Wordmark($g, [double]$scale, [double]$dx, [double]$dy, [string]$ink) {
  $state = $g.Save()
  $g.TranslateTransform([single]$dx, [single]$dy)
  $g.ScaleTransform([single]$scale, [single]$scale)
  # Les traits obliques dépassent puis sont coupés net par ce cadre.
  $g.SetClip((New-Object System.Drawing.RectangleF 0, 0, 514, 100))
  $pen = New-Object System.Drawing.Pen (Col $ink), 8
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter
  $pen.MiterLimit = 10
  # X
  $g.DrawLine($pen, -4, -10, 92, 110)
  $g.DrawLine($pen, 92, -10, -4, 110)
  # L
  $l = New-Object System.Drawing.Drawing2D.GraphicsPath
  $l.AddLine(116, 0, 116, 96); $l.AddLine(116, 96, 182, 96)
  $g.DrawPath($pen, $l)
  # C : cercle ouvert à droite sur un quart
  $g.DrawArc($pen, 210, 4, 92, 92, 45, 270)
  # A sans barre
  $a = New-Object System.Drawing.Drawing2D.GraphicsPath
  $a.AddLine(321, 110, 371, 9); $a.AddLine(371, 9, 421, 110)
  $g.DrawPath($pen, $a)
  # B ouvert : trois barres et deux panses, sans montant
  $b = New-Object System.Drawing.Drawing2D.GraphicsPath
  $b.AddLine(446, 4, 486, 4); $b.AddArc(463, 4, 46, 46, -90, 180); $b.AddLine(486, 50, 446, 50)
  $b.StartFigure()
  $b.AddArc(463, 50, 46, 46, -90, 180); $b.AddLine(486, 96, 446, 96)
  $g.DrawPath($pen, $b)
  $pen.Dispose(); $l.Dispose(); $a.Dispose(); $b.Dispose()
  $g.Restore($state)
}

function New-Canvas([int]$w, [int]$h, [bool]$opaque = $false) {
  # Opaque = sans canal alpha (l'App Store refuse une icône avec canal alpha).
  $format = if ($opaque) { [System.Drawing.Imaging.PixelFormat]::Format24bppRgb } else { [System.Drawing.Imaging.PixelFormat]::Format32bppArgb }
  $bmp = New-Object System.Drawing.Bitmap $w, $h, $format
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  if (-not $opaque) { $g.Clear([System.Drawing.Color]::Transparent) }
  return @($bmp, $g)
}

function Save-Png($bmp, [string]$path) {
  New-Item -ItemType Directory -Force (Split-Path -Parent $path) | Out-Null
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Host "  $($path.Substring($root.Length + 1))"
}

# Icône carrée : fond nuit (plein, ou arrondi pour les anciens Android), symbole au centre.
# $fill = part du côté occupée par le carré 120 du symbole.
function Render-Icon([int]$size, [string]$path, [double]$radiusRatio = 0, [double]$fill = 0.62) {
  $bmp, $g = New-Canvas $size $size ($radiusRatio -eq 0)
  $bg = New-Object System.Drawing.SolidBrush (Col $brandBg)
  if ($radiusRatio -gt 0) {
    $r = [single]($size * $radiusRatio); $d = 2 * $r; $s = [single]$size
    $shape = New-Object System.Drawing.Drawing2D.GraphicsPath
    $shape.AddArc(0, 0, $d, $d, 180, 90); $shape.AddArc($s - $d, 0, $d, $d, 270, 90)
    $shape.AddArc($s - $d, $s - $d, $d, $d, 0, 90); $shape.AddArc(0, $s - $d, $d, $d, 90, 90)
    $shape.CloseFigure(); $g.FillPath($bg, $shape); $shape.Dispose()
  } else {
    $g.FillRectangle($bg, 0, 0, $size, $size)
  }
  $scale = $size * $fill / 120
  $off = ($size - 120 * $scale) / 2
  Draw-Symbol $g $scale $off $off $tones.night
  Save-Png $bmp $path
  $bg.Dispose(); $g.Dispose(); $bmp.Dispose()
}

# Symbole seul sur fond transparent.
function Render-Symbol([int]$size, [string]$path, $tone) {
  $bmp, $g = New-Canvas $size $size
  Draw-Symbol $g ($size / 120) 0 0 $tone
  Save-Png $bmp $path
  $g.Dispose(); $bmp.Dispose()
}

Write-Host 'Android (versions < 8 ; les autres utilisent l''icone adaptative vectorielle) :'
$android = "$root\xlcab_app\android\app\src\main\res"
@{ mdpi = 48; hdpi = 72; xhdpi = 96; xxhdpi = 144; xxxhdpi = 192 }.GetEnumerator() | ForEach-Object {
  Render-Icon $_.Value "$android\mipmap-$($_.Key)\ic_launcher.png" 0.18
}

Write-Host 'iOS (opaques : l''App Store refuse la transparence) :'
$ios = "$root\xlcab_app\ios\Runner\Assets.xcassets"
$iosIcons = [ordered]@{
  'Icon-App-20x20@1x' = 20; 'Icon-App-20x20@2x' = 40; 'Icon-App-20x20@3x' = 60
  'Icon-App-29x29@1x' = 29; 'Icon-App-29x29@2x' = 58; 'Icon-App-29x29@3x' = 87
  'Icon-App-40x40@1x' = 40; 'Icon-App-40x40@2x' = 80; 'Icon-App-40x40@3x' = 120
  'Icon-App-60x60@2x' = 120; 'Icon-App-60x60@3x' = 180
  'Icon-App-76x76@1x' = 76; 'Icon-App-76x76@2x' = 152; 'Icon-App-83.5x83.5@2x' = 167
  'Icon-App-1024x1024@1x' = 1024
}
foreach ($k in $iosIcons.Keys) { Render-Icon $iosIcons[$k] "$ios\AppIcon.appiconset\$k.png" }
# Écran de démarrage iOS : symbole cyan sur le fond nuit du storyboard (120 pt).
Render-Symbol 120 "$ios\LaunchImage.imageset\LaunchImage.png" $tones.night
Render-Symbol 240 "$ios\LaunchImage.imageset\LaunchImage@2x.png" $tones.night
Render-Symbol 360 "$ios\LaunchImage.imageset\LaunchImage@3x.png" $tones.night

Write-Host 'Portails web (favicon PNG de secours et icone d''ecran d''accueil iOS) :'
foreach ($portal in 'xlcab_corporate', 'xlcab_admin') {
  Render-Symbol 32 "$root\$portal\public\favicon-32.png" $tones.light
  Render-Icon 180 "$root\$portal\public\apple-touch-icon.png"
}

Write-Host 'Logo des e-mails (PNG : les messageries n''affichent pas le SVG) :'
# 2× la taille d'affichage (280 × 80) pour les écrans haute densité ; fond clair.
$bmp, $g = New-Canvas 560 160
Draw-Symbol $g (160 / 120) 0 0 $tones.light
# Mot-symbole : hauteur 70 px (échelle 0,70), à droite du symbole.
Draw-Wordmark $g 0.70 196 45 $tones.light.Ink
Save-Png $bmp "$root\brand\xlcab-logo-email.png"
$g.Dispose(); $bmp.Dispose()

Write-Host 'Termine.'
