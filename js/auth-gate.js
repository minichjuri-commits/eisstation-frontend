// Login fuer den Personal-Bereich. Da Frontend (Vercel) und Backend (Render)
// unterschiedliche Adressen sind, kann der Browser keinen automatischen
// Login-Dialog mehr anzeigen (das ging nur, solange alles auf demselben
// Server lief) - stattdessen zeigt dieses Skript ein eigenes Login-Feld und
// prueft die Eingabe direkt gegen die Backend-API. Die Zugangsdaten werden
// nur fuer die Dauer des Browser-Tabs gespeichert (sessionStorage).

function getStoredAuth() {
  return sessionStorage.getItem('eisstation_auth');
}
function authHeader() {
  const t = getStoredAuth();
  return t ? { Authorization: 'Basic ' + t } : {};
}
async function testAuth(token) {
  try {
    const res = await fetch(API_BASE + '/api/machines', { headers: { Authorization: 'Basic ' + token } });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function requireStaffLogin(onReady) {
  const existing = getStoredAuth();
  if (existing && (await testAuth(existing))) {
    onReady();
    return;
  }
  sessionStorage.removeItem('eisstation_auth');
  showLoginOverlay(onReady);
}

function showLoginOverlay(onReady) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="panel-alt" style="max-width:320px;width:100%;">
      <h3 class="font-display">Personal-Login</h3>
      <p class="small" style="margin-bottom:12px;">Zugang zum Personal-Bereich der Eisstation.</p>
      <label class="small">Benutzername</label>
      <input id="login-user" style="width:100%;margin:4px 0 10px;" />
      <label class="small">Passwort</label>
      <input id="login-pass" type="password" style="width:100%;margin:4px 0 10px;" />
      <p id="login-error" class="small" style="color:#D9637E;min-height:16px;"></p>
      <button class="btn btn-amber" style="width:100%;" id="login-submit">Anmelden</button>
    </div>
  `;
  document.body.appendChild(overlay);

  async function submit() {
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const token = btoa(user + ':' + pass);
    document.getElementById('login-error').textContent = 'Prüfe...';
    const ok = await testAuth(token);
    if (!ok) {
      document.getElementById('login-error').textContent = 'Benutzername oder Passwort falsch (oder Backend nicht erreichbar).';
      return;
    }
    sessionStorage.setItem('eisstation_auth', token);
    document.body.removeChild(overlay);
    onReady();
  }

  document.getElementById('login-submit').addEventListener('click', submit);
  document.getElementById('login-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}
