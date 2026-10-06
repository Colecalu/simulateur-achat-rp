/**
 * Image de partage d'Æquo (Open Graph, Twitter) : frontend/img/partage.png,
 * 1200 × 630, une seule image pour les deux pages.
 *
 *   cd outils
 *   npm install            # une fois
 *   npm run image-partage  # ou : node image-partage.mjs
 *
 * Le gabarit (image-partage.html) ne recopie rien à la main : la maison en
 * papier est lue dans frontend/index.html et ses couleurs dans accueil.css.
 * Si la couverture change, relancer ce script suffit.
 *
 * Les polices sont injectées en base64 : chargées depuis des fichiers locaux,
 * elles seraient bloquées par le navigateur, et l'image tomberait en police
 * système sans prévenir.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const ICI = dirname(fileURLToPath(import.meta.url));
const FRONT = join(ICI, '..', 'frontend');
const lire = (...chemin) => readFileSync(join(...chemin), 'utf8');

const polices = lire(FRONT, 'css', 'polices.css').replace(
  /url\(\.\.\/fonts\/([^)]+)\)/g,
  (_, fichier) => 'url(data:font/woff2;base64,' +
    readFileSync(join(FRONT, 'fonts', fichier)).toString('base64') + ')');

const maison = lire(FRONT, 'index.html').match(/<svg class="house"[\s\S]*?<\/svg>/);
if (!maison) throw new Error('Maison introuvable dans index.html (<svg class="house">).');

const html = lire(ICI, 'image-partage.html')
  .replace('{{POLICES}}', polices)
  .replace('{{ACCUEIL}}', lire(FRONT, 'css', 'accueil.css'))
  .replace('{{MAISON}}', maison[0]);

const navigateur = await chromium.launch();
const page = await navigateur.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
mkdirSync(join(FRONT, 'img'), { recursive: true });
const sortie = join(FRONT, 'img', 'partage.png');
await page.screenshot({ path: sortie });
await navigateur.close();

const ko = Math.round(statSync(sortie).size / 1024);
console.log(`img/partage.png écrite : 1200 × 630, ${ko} Ko${ko > 300 ? ' — AU-DESSUS DE 300 Ko' : ''}`);
