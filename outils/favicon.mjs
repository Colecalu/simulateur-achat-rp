/**
 * Favicon d'Æquo : un « Æ » en DM Sans gras, encre sur jaune.
 *
 *   cd outils
 *   npm install          # une fois : fontkit, wawoff2, Playwright — jamais déployés
 *   npm run favicon      # ou : node favicon.mjs
 *
 * Produit, dans frontend/ :
 *   favicon.svg            l'icône de référence, coins arrondis
 *   favicon.ico            32 × 32, repli des vieux navigateurs
 *   apple-touch-icon.png   180 × 180, SANS coins arrondis ni transparence :
 *                          iOS arrondit lui-même, et remplit de noir ce qui
 *                          est transparent.
 *
 * Le « Æ » est le TRACÉ de la police, extrait du fichier même que sert le
 * site (fonts/dm-sans-variable.woff2, graisse 700) : un favicon ne peut pas
 * charger de police, un <text> s'afficherait en police système.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as fontkit from 'fontkit';
import { decompress } from 'wawoff2';
import { chromium } from 'playwright';

const ICI = dirname(fileURLToPath(import.meta.url));
const FRONT = join(ICI, '..', 'frontend');

// Les deux couleurs de la couverture (--yellow, --ink de accueil.css).
const JAUNE = '#f3da78';
const ENCRE = '#312c43';

const COTE = 64;      // viewBox carré
const RAYON = 12;     // coins « légèrement » arrondis
const LARGEUR = 46;   // largeur du Æ : assez grand pour rester lisible à 16 px

/** Le tracé du « Æ » en DM Sans 700, centré dans le carré. */
async function traceAe() {
  // fontkit ne sait pas instancier une graisse depuis un woff2 : on le
  // décompresse d'abord en ttf, qu'il sait lire et faire varier.
  const ttf = await decompress(readFileSync(join(FRONT, 'fonts', 'dm-sans-variable.woff2')));
  const police = fontkit.create(Buffer.from(ttf)).getVariation({ wght: 700 });
  const glyphe = police.glyphForCodePoint('Æ'.codePointAt(0));
  const { minX, minY, maxX, maxY } = glyphe.path.bbox;
  const echelle = LARGEUR / (maxX - minX);
  const hauteur = (maxY - minY) * echelle;
  // Les unités de police ont l'axe vertical vers le haut : on retourne.
  const dx = (COTE - LARGEUR) / 2 - minX * echelle;
  const dy = (COTE + hauteur) / 2 + minY * echelle;
  return `<path fill="${ENCRE}" transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) ` +
    `scale(${echelle.toFixed(5)} ${(-echelle).toFixed(5)})" d="${glyphe.path.toSVG()}"/>`;
}

async function svg(rayon) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${COTE} ${COTE}">` +
    `<rect width="${COTE}" height="${COTE}" rx="${rayon}" fill="${JAUNE}"/>` +
    (await traceAe()) + '</svg>\n';
}

/** Rend un SVG en PNG à la taille demandée. */
async function png(navigateur, source, taille) {
  const page = await navigateur.newPage({ viewport: { width: taille, height: taille } });
  const url = 'data:image/svg+xml;base64,' + Buffer.from(source).toString('base64');
  await page.setContent(
    `<html><body style="margin:0"><img src="${url}" width="${taille}" height="${taille}"></body></html>`);
  const image = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: taille, height: taille } });
  await page.close();
  return image;
}

/**
 * Un .ico peut contenir directement un PNG : un en-tête de 6 octets, une
 * entrée de 16, puis le PNG tel quel. Pas besoin d'autre bibliothèque.
 */
function ico(pngData, taille) {
  const tete = Buffer.alloc(22);
  tete.writeUInt16LE(0, 0);          // réservé
  tete.writeUInt16LE(1, 2);          // type : icône
  tete.writeUInt16LE(1, 4);          // une image
  tete.writeUInt8(taille, 6);        // largeur
  tete.writeUInt8(taille, 7);        // hauteur
  tete.writeUInt8(0, 8);             // pas de palette
  tete.writeUInt8(0, 9);
  tete.writeUInt16LE(1, 10);         // plans
  tete.writeUInt16LE(32, 12);        // bits par pixel
  tete.writeUInt32LE(pngData.length, 14);
  tete.writeUInt32LE(22, 18);        // l'image commence après l'en-tête
  return Buffer.concat([tete, pngData]);
}

const reference = await svg(RAYON);
writeFileSync(join(FRONT, 'favicon.svg'), reference);

const navigateur = await chromium.launch();
writeFileSync(join(FRONT, 'favicon.ico'), ico(await png(navigateur, reference, 32), 32));
writeFileSync(join(FRONT, 'apple-touch-icon.png'), await png(navigateur, await svg(0), 180));
await navigateur.close();

console.log('favicon.svg, favicon.ico et apple-touch-icon.png écrits dans frontend/');
