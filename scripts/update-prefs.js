const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'backups', 'de.ozerov.fully_preferences.xml');
let xml = fs.readFileSync(filePath, 'utf8');

// Update startURL
xml = xml.replace(/<string name="startURL">.*?<\/string>/, '<string name="startURL">https://home-dashboard.bwsveranstaltungstechnik.workers.dev/<\/string>');

// Ensure ignoreSSLerrors is true
xml = xml.replace(/<boolean name="ignoreSSLerrors" value=".*?" \/>/, '<boolean name="ignoreSSLerrors" value="true" />');

// Disable showSSLerrors
if (xml.includes('showSSLerrors')) {
  xml = xml.replace(/<boolean name="showSSLerrors" value=".*?" \/>/, '<boolean name="showSSLerrors" value="false" />');
} else {
  xml = xml.replace('</map>', '    <boolean name="showSSLerrors" value="false" />\n</map>');
}

// Fullscreen mode
xml = xml.replace(/<boolean name="fullScreenMode" value=".*?" \/>/, '<boolean name="fullScreenMode" value="true" />');

// Keep screen on while plugged in
xml = xml.replace(/<string name="timeToScreenOffV2">.*?<\/string>/, '<string name="timeToScreenOffV2">0</string>');

fs.writeFileSync(filePath, xml, 'utf8');
console.log('Preferences updated!');
