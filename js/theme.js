// Zentrale Theme-Verwaltung, auf allen Seiten eingebunden. Die eigentliche
// Zuweisung passiert bereits inline im <head> jeder Seite (siehe dortiges
// kleines Skript), damit beim Laden kein falsches Theme kurz aufblitzt
// (FOUC) - hier steckt nur die Umschalt-UI und Hilfsfunktionen, die von den
// anderen Skripten genutzt werden.

const THEME_STORAGE_KEY = 'eisstation_theme';
const THEMES = [
  { id: 'dark', label: 'Dunkel', swatch: '#E8A33D' },
  { id: 'kakigori', label: 'Kakigori', swatch: '#FF6F91' },
  { id: 'light', label: 'Hell', swatch: '#D98A2B' },
];

function getTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
  } catch (e) {
    return 'dark';
  }
}

// Liest eine CSS-Variable des aktuell aktiven Themes aus - so muessen
// Status-Farben & Co. im JavaScript nicht pro Theme dupliziert werden,
// sondern folgen automatisch dem, was gerade in style.css hinterlegt ist.
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch (e) {
    /* z.B. Inkognito ohne Storage-Zugriff - Theme gilt dann nur fuer diese Sitzung */
  }
  const logo = document.querySelector('.logo .emoji');
  if (logo) logo.textContent = id === 'kakigori' ? '🍧' : '🍦';
  renderThemeSwitcher();
  // Seiten koennen darauf reagieren, um bereits angezeigte Status-Farben
  // (Pills, Banner, ...) sofort neu zu berechnen statt erst beim naechsten
  // automatischen Refresh.
  document.dispatchEvent(new CustomEvent('eisstation:themechange'));
}

function renderThemeSwitcher() {
  const el = document.getElementById('theme-switcher');
  if (!el) return;
  const current = getTheme();
  el.innerHTML = THEMES.map(
    (t) => `
    <button
      onclick="applyTheme('${t.id}')"
      title="Layout: ${t.label}"
      style="
        width:26px;height:26px;border-radius:50%;cursor:pointer;padding:0;
        border:2px solid ${t.id === current ? cssVar('--text') : 'transparent'};
        background:${t.swatch};
      "
    ></button>`
  ).join('');
}

function syncThemeUI() {
  const logo = document.querySelector('.logo .emoji');
  if (logo) logo.textContent = getTheme() === 'kakigori' ? '🍧' : '🍦';
  renderThemeSwitcher();
}

document.addEventListener('DOMContentLoaded', syncThemeUI);
