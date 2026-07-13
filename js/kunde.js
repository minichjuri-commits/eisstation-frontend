const orderId = location.pathname.split('/').pop();
let flavorsCache = null;
let linked = false;
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
  return order.items.filter((i) => i.status !== 'storniert').reduce((s, i) => s + i.qty * i.unitPrice, 0);
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
  linked = !!order.phone;
  await renderAll(order);
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(refresh, 5000);
}
async function refresh() {
  let order;
  try {
    order = await api('/api/public/orders/' + orderId);
  } catch (e) {
    return;
  }
  linked = !!order.phone;
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

async function renderAll(order) {
  currentOrder = order;
  const el = document.getElementById('kunde-panel');

  if (!linked) {
    el.innerHTML = `
      <h2 class="font-display">Bestellung verfolgen</h2>
      <p class="small">Telefonnummer angeben, um eine Bestellbestätigung sowie eine Benachrichtigung bei Fertigstellung per SMS zu erhalten.</p>
      <label class="small">Bestellnummer</label>
      <input value="${order.id}" disabled style="width:100%;margin:4px 0 12px;" />
      <label class="small">Telefonnummer</label>
      <input id="phone-input" placeholder="+49 151 23456789" style="width:100%;margin:4px 0 12px;" />
      <p id="kunde-error" class="small" style="color:#D9637E;"></p>
      <button class="btn btn-amber" style="width:100%;" onclick="linkPhone()">Verknüpfen</button>
    `;
    return;
  }

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
      const color = done ? '#7FB77E' : g.fertig > 0 ? '#E8A33D' : '#D9637E';
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
      pickupBanner = `<div class="panel-alt" style="border:1px solid #E8A33D;margin-bottom:12px;">
        <p class="small" style="color:#E8A33D;font-weight:600;">⏱ Bitte jetzt abholen!</p>
        <p class="small">Fertiggestellte Bestellungen müssen innerhalb von 2 Minuten abgeholt werden, sonst geht die Bestellung an den nächsten Kunden.</p>
        <p class="font-mono" id="pickup-countdown" style="font-size:20px;">${fmtDuration(remaining)}</p>
      </div>`;
    } else {
      pickupBanner = `<div class="panel-alt" style="border:1px solid #D9637E;margin-bottom:12px;">
        <p class="small" style="color:#D9637E;font-weight:600;">⏱ Abholzeit abgelaufen</p>
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
                  <div class="card" style="font-size:12px;${item.isMine ? 'border-color:#E8A33D;background:#E8A33D14;' : ''}">
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

  el.innerHTML = `
    <div class="row" style="margin-bottom:12px;">
      <span class="font-mono" style="font-size:20px;font-weight:600;">${order.id}</span>
      <span class="small">${[...new Set(order.items.map((i) => i.machine))].sort((a, b) => a - b).map((m) => 'M' + m).join(' / ')}</span>
    </div>
    ${pickupBanner}
    ${groupRows}
    <div class="row" style="border-top:1px solid var(--border);padding-top:8px;margin:12px 0;">
      <span class="small">Gesamtpreis</span><span class="font-mono" style="font-weight:600;">${euro(orderTotal(order))}</span>
    </div>
    ${
      order.messages.length
        ? order.messages
            .map(
              (m) => `
      <div class="card small" style="margin-bottom:6px;border-color:${m.type === 'completion' ? '#7FB77E' : '#E8A33D'};">
        <strong>SMS:</strong> ${escapeHtml(m.text)}
      </div>`
            )
            .join('')
        : `<p class="small">Sie werden per SMS benachrichtigt, sobald der erste Artikel fertig ist.</p>`
    }
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

init();
