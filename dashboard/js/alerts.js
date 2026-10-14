// Wetterwarnungen aus Open-Meteo-Stundenwerten (reine Funktion, testbar).
// Warnungen für die nächsten ~14 Stunden (Open-Meteo-Stundenwerte, Index 0 = heute 00:00)
export function computeAlerts(data, h0) {
  var H = data.hourly, out = [], end = Math.min(h0 + 14, H.time.length);
  function hh(i) { return (i % 24) + ' Uhr'; }
  var storm = -1, snow = -1, rain = -1, rainEnd = -1, minT = 99, minAt = -1, maxT = -99, maxG = 0;
  for (var i = h0; i < end; i++) {
    var code = H.weather_code[i], p = H.precipitation_probability[i] || 0, tt = H.temperature_2m[i], g = H.wind_gusts_10m ? (H.wind_gusts_10m[i] || 0) : 0;
    if (code >= 95 && code <= 99 && storm < 0) storm = i;
    if (((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) && snow < 0) snow = i;
    if (p >= 60 && i < h0 + 8) { if (rain < 0) rain = i; rainEnd = i + 1; }
    if (tt < minT) { minT = tt; minAt = i; }
    if (tt > maxT) maxT = tt;
    if (g > maxG) maxG = g;
  }
  if (storm > -1) out.push({ level: 'alert', icon: 'bolt', title: 'Gewitter ab ' + hh(storm), text: 'Geräte ausstecken, Fenster zu' });
  if (maxG >= 60) out.push({ level: 'alert', icon: 'bolt', title: 'Sturmböen bis ' + Math.round(maxG) + ' km/h', text: 'Draußen alles sichern' });
  if (snow > -1) out.push({ level: 'warn', icon: 'cloud', title: 'Schnee ab ' + hh(snow), text: 'Früher losfahren, Glätte möglich' });
  else if (rain > -1) out.push({ level: 'warn', icon: 'rain', title: rain === h0 ? 'Regen bis ' + hh(rainEnd) : 'Regen ab ' + hh(rain), text: 'Wäsche reinholen, Schirm mitnehmen' });
  if (minT <= 0) out.push({ level: 'warn', icon: 'thermo', title: 'Frost: bis ' + Math.round(minT) + '° um ' + hh(minAt), text: 'Autoscheiben und Pflanzen schützen' });
  if (maxT >= 30) out.push({ level: 'warn', icon: 'sun', title: 'Hitze bis ' + Math.round(maxT) + '°', text: 'Viel trinken, Rollläden runter' });
  return out;
}
