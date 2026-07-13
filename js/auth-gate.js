function getStoredAuth() {
  return sessionStorage.getItem('eisstation_auth');
}
function authHeader() {
  const t = getStoredAuth();
  return t ? { Authorization: 'Basic ' + t } : {};
}

// btoa() kann nur "Latin1"-Zeichen kodieren. Enthaelt Benutzername oder
// Passwort Umlaute, Sonderzeichen oder Emojis, wuerde btoa() sonst mit
// einem Fehler abbrechen (und der Login-Button wuerde scheinbar gar nichts
// tun, ohne Fehlermeldung). Dieser Umweg macht daraus eine korrekte
// UTF-8-Kodierung, die mit beliebigen Zeichen funktioniert.
function toBase64Utf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function testAuth(token) {
  try {
    const res = await fetch(API_BASE + '/api/machines', { headers: { Authorization: 'Basic ' + token } });
    if (res.status === 401) return { ok: false, reason: 'auth' };
    if (!res.ok) return { ok: false, reason: 'server' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'network' };
  }
}

async function requireStaffLogin(onReady) {
  const existing = getStoredAuth();
  if (existing) {
    const result = await testAuth(existing);
    if (result.ok) {
      onReady();
      return;
    }
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
      <p id="login-error" class="small" style="color:#D9637E;min-height:32px;"></p>
      <button class="btn btn-amber" style="width:100%;" id="login-submit">Anmelden</button>
    </div>
  `;
  document.body.appendChild(overlay);

  async function submit() {
    const errEl = document.getElementById('login-error');
    try {
      const user = document.getElementById('login-user').value;
      const pass = document.getElementById('login-pass').value;
      const token = toBase64Utf8(user + ':' + pass);
      errEl.textContent = 'Prüfe...';
      const result = await testAuth(token);
      if (!result.ok) {
        if (result.reason === 'network') {
          errEl.textContent = 'Backend nicht erreichbar. Falls es länger nicht benutzt wurde, kann das Aufwachen 30-60 Sekunden dauern - kurz warten und nochmal versuchen.';
        } else if (result.reason === 'auth') {
          errEl.textContent = 'Benutzername oder Passwort falsch.';
        } else {
          errEl.textContent = 'Unerwarteter Fehler vom Backend (Status nicht ok). Bitte Render-Log prüfen.';
        }
        return;
      }
      sessionStorage.setItem('eisstation_auth', token);
      document.body.removeChild(overlay);
      onReady();
    } catch (e) {
      errEl.textContent = 'Unerwarteter Fehler: ' + e.message;
    }
  }

  document.getElementById('login-submit').addEventListener('click', submit);
  document.getElementById('login-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
}
