/* Wrap game.html into a standalone index.html for static hosting.

   game.html is authored for the Claude Artifacts platform, which supplies the
   document skeleton at publish time. A plain web server does not, so without a
   doctype the browser falls into quirks mode and the height:100% layout breaks.
   This adds the same skeleton the platform would.

   Run after any change to game.html:   node build-pages.js
*/
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'game.html');
const OUT = path.join(__dirname, 'index.html');

let body = fs.readFileSync(SRC, 'utf8');

/* the title belongs in <head>, not adrift in the body */
let title = 'Petri Automaton';
body = body.replace(/^<title>([\s\S]*?)<\/title>\s*/i, (_, t) => { title = t.trim(); return ''; });

/* a tiny inline favicon so the console stays clean */
const ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="7" fill="#0c1412"/>' +
    '<circle cx="16" cy="16" r="9" fill="none" stroke="#4fe3c1" stroke-width="2.5"/>' +
    '<circle cx="16" cy="16" r="3" fill="#4fe3c1"/></svg>'
  );

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="A programming automation game: write Python to drive a nanobot around a petri dish.">
<link rel="icon" href="${ICON}">
<style>
  /* the same baseline the Artifacts platform injects */
  :root{
    color-scheme: dark;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  html, body { margin: 0; }
  img { max-width: 100%; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
${body}
</body>
</html>
`;

fs.writeFileSync(OUT, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log('wrote ' + path.basename(OUT) + '  (' + kb + ' KB, self-contained)');
console.log('title: ' + title);
