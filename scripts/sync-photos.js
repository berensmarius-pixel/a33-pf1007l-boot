const fs = require('fs');
const path = require('path');

const photosDir = path.join(__dirname, '..', 'dashboard', 'public', 'photos');
const dataJsPath = path.join(__dirname, '..', 'dashboard', 'js', 'data.js');

if (!fs.existsSync(photosDir)) {
  fs.mkdirSync(photosDir, { recursive: true });
}

const files = fs.readdirSync(photosDir).filter(f => /\.(jpe?g|png|webp|avif)$/i.test(f));

if (files.length === 0) {
  console.log('Keine Bilder in dashboard/public/photos/ gefunden.');
  console.log('Kopiere einfach deine JPG/PNG Fotos in diesen Ordner!');
  process.exit(0);
}

console.log(`${files.length} Foto(s) gefunden:`, files);

const photoEntries = files.map((file, i) => {
  const nameWithoutExt = path.parse(file).name.replace(/[-_]/g, ' ');
  return {
    url: `/photos/${file}`,
    o: 'l', // Standard: Querformat
    date: new Date().toISOString().slice(0, 10),
    place: nameWithoutExt,
    from: i % 2 === 0 ? 'marius' : 'soraya',
    tag: 'eigene-fotos'
  };
});

let dataJs = fs.readFileSync(dataJsPath, 'utf8');

const regex = /var photos = \[[\s\S]*?\];/;
const replacement = `var photos = ${JSON.stringify(photoEntries, null, 2)};`;

if (regex.test(dataJs)) {
  dataJs = dataJs.replace(regex, replacement);
  fs.writeFileSync(dataJsPath, dataJs, 'utf8');
  console.log(`Erfolgreich ${photoEntries.length} Fotos in data.js registriert!`);
} else {
  console.error('Konnte "var photos = [...]" in data.js nicht finden.');
}
