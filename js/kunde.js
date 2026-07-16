const orderId = location.pathname.split('/').pop();
let flavorsCache = null;
let currentOrder = null;
let pollTimer = null;

function euro(n) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDuration(ms) {
  if (ms <= 0) return '0:00';
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m + ':' + String(s).padStart(2, '0');
}
function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
}

async function api(path, opts) {
  const res = await fetch(API_BASE + path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Fehler');
  return data;
}

function deriveOrderStatus(order) {
  const relevant = order.items.filter((i) => i.status !== 'storniert');
  if (relevant.length === 0) return 'storniert';
  if (relevant.every((i) => i.status === 'fertig')) return 'fertig';
  if (relevant.some((i) => i.status !== 'offen')) return 'in_bearbeitung';
  return 'offen';
}
function orderTotal(order) {
  const gross = order.items.filter((i) => i.status !== 'storniert').reduce((s, i) => s + i.qty * i.unitPrice, 0);
  return Math.max(0, gross - (Number(order.discount) || 0));
}
async function ensureFlavors() {
  if (!flavorsCache) flavorsCache = await api('/api/public/flavors');
  return flavorsCache;
}

async function init() {
  let order;
  try {
    order = await api('/api/public/orders/' + orderId);
  } catch (e) {
    document.getElementById('kunde-panel').innerHTML = '<p>Bestellung nicht gefunden.</p>';
    return;
  }
  await renderAll(order);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refresh, 5000);
}

async function refresh() {
  // Waehrend gerade in ein Eingabefeld getippt wird (z.B. die optionale
  // Telefonnummer), soll die automatische Aktualisierung nicht
  // dazwischenfunken und das Feld leeren.
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) {
    return;
  }
  let order;
  try {
    order = await api('/api/public/orders/' + orderId);
  } catch (e) {
    return;
  }
  await renderAll(order);
}

async function linkPhone() {
  const phone = document.getElementById('phone-input').value.trim();
  const errEl = document.getElementById('kunde-error');
  if (!phone) {
    errEl.textContent = 'Bitte Telefonnummer eingeben.';
    return;
  }
  try {
    await api('/api/public/orders/' + orderId + '/link-phone', { method: 'POST', body: JSON.stringify({ phone }) });
    init();
  } catch (e) {
    errEl.textContent = e.message;
  }
}

// Die Bestellverfolgung (Status, Warteschlange, Gesamtpreis) ist immer
// sichtbar - unabhaengig davon, ob eine Telefonnummer hinterlegt ist. Die
// Telefonnummer ist rein optional und dient nur der zusaetzlichen
// SMS-Benachrichtigung.
async function renderAll(order) {
  currentOrder = order;
  const el = document.getElementById('kunde-panel');

  const flavors = await ensureFlavors();
  const status = deriveOrderStatus(order);
  const groups = {};
  order.items.forEach((i) => {
    if (i.status === 'storniert') return;
    if (!groups[i.flavorId]) groups[i.flavorId] = { total: 0, fertig: 0, flavor: flavors.find((f) => f.id === i.flavorId) };
    groups[i.flavorId].total += i.qty;
    if (i.status === 'fertig') groups[i.flavorId].fertig += i.qty;
  });
  const groupRows = Object.values(groups)
    .map((g) => {
      const done = g.fertig === g.total;
      const color = done ? cssVar('--green') : g.fertig > 0 ? cssVar('--amber') : cssVar('--pink');
      const label = done ? 'Fertig' : g.fertig > 0 ? `${g.fertig}/${g.total} fertig` : 'Offen';
      return `<div class="row card" style="margin-bottom:6px;">
      <span><span class="dot" style="background:${g.flavor ? g.flavor.color : '#888'};width:10px;height:10px;"></span> ${g.total}x ${escapeHtml(g.flavor ? g.flavor.name : '?')}</span>
      <span class="pill" style="background:${color}22;color:${color};">${label}</span>
    </div>`;
    })
    .join('');

  let pickupBanner = '';
  if (status === 'fertig' && order.completedAt) {
    const deadline = order.completedAt + 2 * 60 * 1000;
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      pickupBanner = `<div class="panel-alt" style="border:1px solid ${cssVar('--amber')};margin-bottom:12px;">
        <p class="small" style="color:${cssVar('--amber')};font-weight:600;">⏱ Bitte jetzt abholen!</p>
        <p class="small">Fertiggestellte Bestellungen müssen innerhalb von 2 Minuten abgeholt werden, sonst geht die Bestellung an den nächsten Kunden.</p>
        <p class="font-mono" id="pickup-countdown" style="font-size:20px;">${fmtDuration(remaining)}</p>
      </div>`;
    } else {
      pickupBanner = `<div class="panel-alt" style="border:1px solid ${cssVar('--pink')};margin-bottom:12px;">
        <p class="small" style="color:${cssVar('--pink')};font-weight:600;">⏱ Abholzeit abgelaufen</p>
        <p class="small">Bitte wenden Sie sich an das Personal.</p>
      </div>`;
    }
  }

  let queueSection = '';
  if (status === 'offen' || status === 'in_bearbeitung') {
    try {
      const q = await api('/api/public/orders/' + orderId + '/queue');
      const etaText = q.overallEstimateMs > 0 ? `ca. ${Math.ceil(q.overallEstimateMs / 60000)} Min.` : 'sehr bald';
      queueSection = `
        <div class="panel" style="margin-top:16px;">
          <p class="small">Geschätzte Wartezeit</p>
          <p class="font-mono" style="font-size:22px;font-weight:600;">${etaText}</p>
          <p class="small" style="margin-top:4px;">Basierend auf der durchschnittlichen Bearbeitungszeit bisheriger Bestellungen (ca. ${Math.round((q.avgProcessingMs / 60000) * 10) / 10} Min./Artikel).</p>
          ${q.machineQueues
            .map(
              (mq) => `
            <div style="margin-top:12px;">
              <p class="small" style="color:var(--text-dim);">${escapeHtml(mq.machineName)}</p>
              <div class="stack">
                ${
                  mq.queue.length
                    ? mq.queue
                        .map(
                          (item, idx) => `
                  <div class="card" style="font-size:12px;${item.isMine ? `border-color:${cssVar('--amber')};background:${cssVar('--amber')}14;` : ''}">
                    ${item.isMine ? `<strong>Ihre Bestellung (${escapeHtml(item.orderId)})</strong>` : 'Andere Bestellung'}
                    — Position ${idx + 1} — ${item.status === 'in_bearbeitung' ? 'wird zubereitet' : 'wartet'}
                  </div>`
                        )
                        .join('')
                    : '<p class="small">Warteschlange leer.</p>'
                }
              </div>
            </div>`
            )
            .join('')}
        </div>
      `;
    } catch (e) {
      /* Warteschlange konnte nicht geladen werden - Ansicht bleibt ohne diesen Abschnitt */
    }
  }

  // Ereignis-Zeitleiste: jede Bestellung hat mindestens den Zeitpunkt der
  // Aufgabe; ist eine Telefonnummer hinterlegt, kommen SMS-Ereignisse und
  // die Fertigstellung mit dazu - jeweils mit Datum + Uhrzeit.
  const events = [{ label: 'Bestellung aufgegeben', time: order.createdAt }];
  order.messages.forEach((m) => {
    events.push({
      label: m.type === 'completion' ? 'Fertigstellungs-SMS verschickt' : 'Bestellbestätigung per SMS verschickt',
      time: m.time,
      detail: m.text,
    });
  });
  if (order.completedAt) {
    events.push({ label: 'Bestellung komplett fertiggestellt', time: order.completedAt });
  }
  events.sort((a, b) => a.time - b.time);
  const timelineSection = `
    <div class="panel" style="margin-top:16px;">
      <p class="small" style="margin-bottom:8px;color:var(--text-dim);">Verlauf</p>
      <div class="stack">
        ${events
          .map(
            (e) => `
          <div class="card small">
            <div class="row"><strong>${escapeHtml(e.label)}</strong><span class="font-mono small" style="color:var(--text-dim);">${fmtDateTime(e.time)}</span></div>
            ${e.detail ? `<p class="small" style="margin-top:4px;">${escapeHtml(e.detail)}</p>` : ''}
          </div>`
          )
          .join('')}
      </div>
    </div>
  `;

  let phoneSection;
  if (!order.phone) {
    phoneSection = `
      <div class="panel-alt" style="margin-top:4px;">
        <p class="small" style="margin-bottom:8px;">Optional: Telefonnummer angeben, um zusätzlich per SMS benachrichtigt zu werden. Die Verfolgung hier funktioniert auch ohne.</p>
        <div class="row" style="gap:8px;">
          <input id="phone-input" placeholder="+49 151 23456789" style="flex:1;" />
          <button class="btn btn-amber" onclick="linkPhone()">Verknüpfen</button>
        </div>
        <p id="kunde-error" class="small" style="color:${cssVar('--pink')};margin-top:6px;"></p>
      </div>
    `;
  } else {
    phoneSection = '';
  }

  el.innerHTML = `
    <div class="row" style="margin-bottom:12px;">
      <span class="font-mono" style="font-size:20px;font-weight:600;">${order.id}</span>
      <span class="small">${[...new Set(order.items.map((i) => i.machine))].sort((a, b) => a - b).map((m) => 'M' + m).join(' / ')}</span>
    </div>
    ${pickupBanner}
    ${groupRows}
    ${
      order.discount > 0
        ? `<div class="row" style="padding-top:4px;"><span class="small">Rabatt</span><span class="font-mono small" style="color:${cssVar('--green')};">-${euro(order.discount)}</span></div>`
        : ''
    }
    <div class="row" style="border-top:1px solid var(--border);padding-top:8px;margin:12px 0;">
      <span class="small">Gesamtpreis</span><span class="font-mono" style="font-weight:600;">${euro(orderTotal(order))}</span>
    </div>
    ${phoneSection}
    ${timelineSection}
    ${queueSection}
  `;
}

setInterval(() => {
  if (!currentOrder || !currentOrder.completedAt) return;
  const el = document.getElementById('pickup-countdown');
  if (!el) return;
  const remaining = currentOrder.completedAt + 2 * 60 * 1000 - Date.now();
  el.textContent = fmtDuration(Math.max(0, remaining));
}, 1000);

document.addEventListener('eisstation:themechange', () => {
  if (currentOrder) renderAll(currentOrder);
});

init();
