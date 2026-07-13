const state = { flavors: [], machines: [], orders: [], cart: {} };
let expandedQueue = null;
let discountActive = false;
let discountAmount = 1;

function euro(n) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function statusMeta(status) {
  if (status === 'offen') return { label: 'Offen', color: '#D9637E' };
  if (status === 'in_bearbeitung') return { label: 'Wird zubereitet', color: '#E8A33D' };
  if (status === 'storniert') return { label: 'Storniert', color: '#6D7278' };
  return { label: 'Fertig', color: '#7FB77E' };
}
function pillHtml(status) {
  const m = statusMeta(status);
  return `<span class="pill" style="background:${m.color}22;color:${m.color};">${m.label}</span>`;
}
function orderTotal(order) {
  const gross = order.items.filter((i) => i.status !== 'storniert').reduce((s, i) => s + i.qty * i.unitPrice, 0);
  return Math.max(0, gross - (Number(order.discount) || 0));
}
function deriveOrderStatus(order) {
  const relevant = order.items.filter((i) => i.status !== 'storniert');
  if (relevant.length === 0) return 'storniert';
  if (relevant.every((i) => i.status === 'fertig')) return 'fertig';
  if (relevant.some((i) => i.status !== 'offen')) return 'in_bearbeitung';
  return 'offen';
}

async function api(path, opts) {
  const res = await fetch(API_BASE + path, Object.assign({ headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()) }, opts));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Fehler');
  return data;
}

async function loadAll() {
  const [flavors, machines, orders] = await Promise.all([api('/api/flavors'), api('/api/machines'), api('/api/orders')]);
  state.flavors = flavors;
  state.machines = machines;
  state.orders = orders;
  render();
}

function render() {
  renderFlavorGrid();
  renderFlavorAdmin();
  renderCart();
  renderMachinePanel();
  renderQueues();
  renderRecentOrders();
  document.getElementById('order-count').textContent = state.orders.length + ' Bestellungen';
}

function renderFlavorGrid() {
  const el = document.getElementById('flavor-grid');
  el.innerHTML = state.flavors
    .map(
      (f) => `
    <button class="flavor-tile" onclick="addToCart('${f.id}')">
      <span class="dot" style="background:${f.color}"></span>
      <div style="margin-top:8px;font-weight:600;">${escapeHtml(f.name)}</div>
      <div class="small font-mono">${euro(f.price)}</div>
      ${
        state.cart[f.id]
          ? `<div class="row" style="margin-top:8px;" onclick="event.stopPropagation()">
        <button class="btn btn-ghost" style="padding:2px 8px;" onclick="decFromCart('${f.id}')">-</button>
        <span class="font-mono">${state.cart[f.id]}</span><span></span>
      </div>`
          : '<div style="height:22px;margin-top:8px;"></div>'
      }
    </button>`
    )
    .join('');
}
function addToCart(id) {
  state.cart[id] = (state.cart[id] || 0) + 1;
  renderFlavorGrid();
  renderCart();
}
function decFromCart(id) {
  const q = (state.cart[id] || 0) - 1;
  if (q <= 0) delete state.cart[id];
  else state.cart[id] = q;
  renderFlavorGrid();
  renderCart();
}

function renderCart() {
  const el = document.getElementById('cart-panel');
  const items = Object.entries(state.cart)
    .map(([flavorId, qty]) => ({ flavorId, qty, flavor: state.flavors.find((f) => f.id === flavorId) }))
    .filter((i) => i.flavor);
  const grossTotal = items.reduce((s, i) => s + i.qty * i.flavor.price, 0);
  const netTotal = Math.max(0, grossTotal - (discountActive ? discountAmount : 0));
  const anyActive = state.machines.some((m) => m.active);
  el.innerHTML = `
    <div class="row"><h3 class="font-display">Aktuelle Bestellung</h3><span class="small font-mono">${items.reduce((s, i) => s + i.qty, 0)} Stk.</span></div>
    ${
      items.length === 0
        ? '<p class="small">Noch keine Sorten ausgewählt.</p>'
        : items
            .map(
              (i) => `
      <div class="row" style="margin:6px 0;">
        <span><span class="dot" style="background:${i.flavor.color};width:10px;height:10px;"></span> ${escapeHtml(i.flavor.name)}</span>
        <span class="row" style="gap:8px;width:auto;">
          <span class="small font-mono">${euro(i.qty * i.flavor.price)}</span>
          <button class="btn btn-ghost" style="padding:2px 8px;" onclick="decFromCart('${i.flavorId}')">-</button>
          <span class="font-mono">${i.qty}</span>
          <button class="btn btn-ghost" style="padding:2px 8px;" onclick="addToCart('${i.flavorId}')">+</button>
        </span>
      </div>`
            )
            .join('')
    }
    <div class="row" style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border);">
      <span class="small">Rabatt</span>
      <span class="row" style="gap:6px;width:auto;">
        <input type="number" min="0" step="0.5" value="${discountAmount}" style="width:70px;" class="font-mono" onchange="setDiscountAmount(this.value)" />
        <button class="btn btn-ghost" style="padding:4px 10px;" onclick="toggleDiscount()">${discountActive ? 'Entfernen' : 'Anwenden'}</button>
      </span>
    </div>
    ${discountActive ? `<div class="row" style="margin-top:4px;"><span class="small">Rabatt aktiv</span><span class="font-mono small" style="color:#7FB77E;">-${euro(discountAmount)}</span></div>` : ''}
    <div class="row" style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px;">
      <span class="small">Gesamtpreis</span><span class="font-mono" style="font-weight:600;">${euro(netTotal)}</span>
    </div>
    <button class="btn ${items.length && anyActive ? 'btn-amber' : ''}" style="width:100%;margin-top:12px;" ${items.length && anyActive ? '' : 'disabled'} onclick="submitOrder()">
      ${anyActive ? 'Bestellung aufgeben →' : 'Keine Maschine aktiv'}
    </button>
  `;
}
function toggleDiscount() {
  discountActive = !discountActive;
  renderCart();
}
function setDiscountAmount(value) {
  const v = parseFloat(value);
  discountAmount = isNaN(v) || v < 0 ? 0 : v;
  renderCart();
}

async function submitOrder() {
  const items = Object.entries(state.cart).map(([flavorId, qty]) => ({ flavorId, qty }));
  if (items.length === 0) return;
  try {
    const discount = discountActive ? discountAmount : 0;
    const data = await api('/api/orders', { method: 'POST', body: JSON.stringify({ items, discount }) });
    state.cart = {};
    discountActive = false;
    discountAmount = 1;
    showQrModal(data.order, data.qrImageUrl, data.qrTargetUrl);
    loadAll();
  } catch (e) {
    alert(e.message);
  }
}
function showQrModal(order, qrImageUrl, qrTargetUrl) {
  document.getElementById('qr-order-id').textContent = order.id;
  document.getElementById('qr-order-total').textContent = euro(orderTotal(order));
  document.getElementById('qr-image').src = API_BASE + qrImageUrl + '?t=' + Date.now();
  document.getElementById('qr-link').href = qrTargetUrl;
  document.getElementById('qr-link').textContent = qrTargetUrl;
  document.getElementById('qr-modal').classList.remove('hidden');
}

// --- Sorten & Preise verwalten (inkl. der 4 Standard-Sorten) ---
document.getElementById('toggle-admin').addEventListener('click', () => {
  document.getElementById('flavor-admin').classList.toggle('hidden');
});
function renderFlavorAdmin() {
  const el = document.getElementById('flavor-admin');
  el.innerHTML = `
    <div class="stack">
      ${state.flavors
        .map(
          (f) => `
        <div class="row" style="gap:8px;">
          <input type="color" value="${f.color}" style="width:32px;height:32px;padding:0;border:none;background:none;flex-shrink:0;cursor:pointer;" onchange="updateFlavor('${f.id}', {color:this.value})" />
          <input value="${escapeHtml(f.name)}" style="flex:1;" onchange="updateFlavor('${f.id}', {name:this.value})" />
          <input type="number" min="0" step="0.5" value="${f.price}" style="width:80px;" class="font-mono" onchange="updateFlavor('${f.id}', {price:this.value})" />
          <span class="small">€</span>
          <button class="btn btn-ghost" style="padding:4px 8px;color:#D9637E;" onclick="deleteFlavor('${f.id}','${escapeHtml(f.name).replace(/'/g, '')}')" title="Sorte entfernen">🗑</button>
        </div>`
        )
        .join('')}
    </div>
    <div style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px;">
      <div class="row" style="gap:8px;">
        <input type="color" id="new-flavor-color" value="#E8A33D" style="width:32px;height:32px;padding:0;border:none;background:none;flex-shrink:0;cursor:pointer;" />
        <input id="new-flavor-name" placeholder="Sortenname" style="flex:1;" />
        <input id="new-flavor-price" type="number" min="0" step="0.5" value="10" style="width:80px;" class="font-mono" />
        <button class="btn btn-amber" onclick="addFlavor()">+ Sorte</button>
      </div>
    </div>
  `;
}
async function deleteFlavor(id, name) {
  if (!confirm(`Sorte "${name}" wirklich entfernen? Bereits aufgenommene Bestellungen bleiben davon unberührt.`)) return;
  try {
    await api('/api/flavors/' + id, { method: 'DELETE' });
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}
async function updateFlavor(id, patch) {
  try {
    await api('/api/flavors/' + id, { method: 'PATCH', body: JSON.stringify(patch) });
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}
async function addFlavor() {
  const name = document.getElementById('new-flavor-name').value.trim();
  const price = document.getElementById('new-flavor-price').value;
  const color = document.getElementById('new-flavor-color').value;
  if (!name) return;
  try {
    await api('/api/flavors', { method: 'POST', body: JSON.stringify({ name, price, color }) });
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}

// --- Maschinen: hinzufügen, umbenennen, an/aus ---
function renderMachinePanel() {
  const el = document.getElementById('machine-overview');
  el.innerHTML = `
    <h4 class="font-display small" style="color:var(--text-dim);">Maschinen</h4>
    <div class="stack">
      ${state.machines
        .map(
          (m) => `
        <div class="row" style="gap:8px;">
          <input value="${escapeHtml(m.name)}" style="flex:1;" onchange="renameMachine(${m.id}, this.value)" />
          ${!m.active ? '<span class="pill" style="background:#D9637E22;color:#D9637E;">aus</span>' : ''}
          <span class="small font-mono">${m.openCount} offen</span>
          <button class="btn btn-ghost" style="padding:4px 8px;" onclick="toggleMachine(${m.id}, ${!m.active})">${m.active ? '⏻ Aus' : '⏻ An'}</button>
          <button class="btn btn-ghost" style="padding:4px 8px;color:#D9637E;" onclick="deleteMachine(${m.id},'${escapeHtml(m.name).replace(/'/g, '')}')" title="Maschine entfernen">🗑</button>
        </div>`
        )
        .join('')}
    </div>
    <button class="btn btn-ghost" style="margin-top:10px;width:100%;" onclick="addMachine()">+ Maschine hinzufügen</button>
    <p class="small" style="margin-top:8px;">Jedes einzelne Stück wird der aktiven Maschine mit der geringsten Auslastung zugewiesen.</p>
  `;
}
async function deleteMachine(id, name) {
  if (!confirm(`Maschine "${name}" wirklich entfernen? Offene Artikel werden vorher auf andere Maschinen verteilt.`)) return;
  try {
    await api('/api/machines/' + id, { method: 'DELETE' });
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}
async function toggleMachine(id, active) {
  try {
    await api('/api/machines/' + id, { method: 'PATCH', body: JSON.stringify({ active }) });
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}
async function renameMachine(id, name) {
  try {
    await api('/api/machines/' + id, { method: 'PATCH', body: JSON.stringify({ name }) });
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}
async function addMachine() {
  try {
    await api('/api/machines', { method: 'POST', body: JSON.stringify({}) });
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}

// --- Warteschlangen einsehen & verschieben ---
async function renderQueues() {
  const el = document.getElementById('queue-overview');
  const queues = await Promise.all(
    state.machines.map((m) => api('/api/machines/' + m.id + '/queue').then((q) => ({ machine: m, queue: q.filter((i) => i.status !== 'fertig') })))
  );
  el.innerHTML = `
    <h4 class="font-display small" style="color:var(--text-dim);">Warteschlangen einsehen &amp; verschieben</h4>
    ${queues
      .map(
        ({ machine, queue }) => `
      <div>
        <button class="btn btn-ghost" style="width:100%;justify-content:space-between;display:flex;" onclick="toggleQueue(${machine.id})">
          <span>${escapeHtml(machine.name)}</span><span class="small font-mono">${queue.length} Artikel</span>
        </button>
        <div class="stack ${expandedQueue === machine.id ? '' : 'hidden'}" style="margin:6px 0 12px;">
          ${queue.length === 0 ? '<p class="small">Keine offenen Artikel.</p>' : queue.map((i) => renderQueueRow(i)).join('')}
        </div>
      </div>`
      )
      .join('')}
  `;
}
function toggleQueue(id) {
  expandedQueue = expandedQueue === id ? null : id;
  renderQueues();
}
function renderQueueRow(i) {
  const f = state.flavors.find((fl) => fl.id === i.flavorId);
  const options = state.machines.filter((m) => m.active || m.id === i.machine);
  return `
    <div class="row card" style="font-size:12px;">
      <span><span class="dot" style="background:${f ? f.color : '#888'};width:8px;height:8px;"></span> <span class="font-mono">${i.orderId}</span> ${escapeHtml(f ? f.name : '?')}</span>
      <span class="row" style="gap:6px;width:auto;">
        ${pillHtml(i.status)}
        <select onchange="reassignItem('${i.orderId}','${i.itemId}',this.value)">
          ${options.map((m) => `<option value="${m.id}" ${m.id === i.machine ? 'selected' : ''}>${escapeHtml(m.name)}${!m.active ? ' (aus)' : ''}</option>`).join('')}
        </select>
      </span>
    </div>`;
}
async function reassignItem(orderId, itemId, machine) {
  try {
    await api(`/api/orders/${orderId}/items/${itemId}/reassign`, { method: 'PATCH', body: JSON.stringify({ machine }) });
    await loadAll();
  } catch (e) {
    alert(e.message);
  }
}

// --- Letzte Bestellungen (anklickbar) ---
function renderRecentOrders() {
  const el = document.getElementById('recent-orders');
  const recent = state.orders.slice(0, 8);
  el.innerHTML = recent.length
    ? recent
        .map((o) => {
          const status = deriveOrderStatus(o);
          const groups = {};
          o.items.forEach((i) => {
            if (!groups[i.flavorId]) groups[i.flavorId] = { qty: 0, flavor: state.flavors.find((f) => f.id === i.flavorId) };
            groups[i.flavorId].qty += i.qty;
          });
          const summary = Object.values(groups).map((g) => `${g.qty}x ${g.flavor ? g.flavor.name : '?'}`).join(', ');
          return `
        <div class="row card" style="cursor:pointer;" onclick="openOrderDetail('${o.id}')">
          <span><span class="font-mono">${o.id}</span> <span class="small">${escapeHtml(summary)}</span></span>
          <span class="row" style="gap:8px;width:auto;">
            <span class="small font-mono">${euro(orderTotal(o))}</span>
            ${o.phone ? '📞' : ''}
            ${pillHtml(status)}
          </span>
        </div>`;
        })
        .join('')
    : '<p class="small">Noch keine Bestellungen.</p>';
}

async function openOrderDetail(id) {
  const order = await api('/api/orders/' + id);
  renderDetail(order);
  document.getElementById('detail-modal').classList.remove('hidden');
}
function renderDetail(order) {
  const status = deriveOrderStatus(order);
  document.getElementById('detail-body').innerHTML = `
    <div class="row"><span class="font-mono" style="font-size:20px;font-weight:600;">${order.id}</span>${pillHtml(status)}</div>
    <img src="${API_BASE}/api/public/orders/${order.id}/qrcode.png?t=${Date.now()}" width="140" height="140" style="background:#fff;border-radius:6px;display:block;margin:12px auto;" />
    <div class="stack" style="margin:12px 0;">
      ${order.items
        .map((i) => {
          const f = state.flavors.find((fl) => fl.id === i.flavorId);
          return `<div class="row card" style="font-size:13px;">
          <span><span class="dot" style="background:${f ? f.color : '#888'};width:8px;height:8px;"></span> ${escapeHtml(f ? f.name : '?')} (M${i.machine})</span>
          <span class="row" style="gap:6px;width:auto;">
            ${pillHtml(i.status)}
            ${i.status === 'offen' || i.status === 'in_bearbeitung' ? `<button class="btn btn-ghost" style="padding:2px 6px;" onclick="cancelItem('${order.id}','${i.itemId}')">Stornieren</button>` : ''}
          </span>
        </div>`;
        })
        .join('')}
    </div>
    <div class="row" style="gap:8px;margin:4px 0 10px;">
      <span class="small" style="flex:1;">Rabatt</span>
      <input id="detail-discount" type="number" min="0" step="0.5" value="${order.discount || 0}" style="width:80px;" class="font-mono" />
      <button class="btn btn-ghost" style="padding:4px 10px;" onclick="saveDetailDiscount('${order.id}')">Übernehmen</button>
    </div>
    <div class="row" style="margin-bottom:10px;"><span class="small">Gesamtpreis</span><span class="font-mono" style="font-weight:600;">${euro(orderTotal(order))}</span></div>
    <label class="small">Telefonnummer</label>
    <div class="row" style="gap:8px;margin:4px 0 12px;">
      <input id="detail-phone" value="${order.phone || ''}" placeholder="+49 151 23456789" style="flex:1;" />
      <button class="btn btn-amber" onclick="saveDetailPhone('${order.id}')">Speichern</button>
    </div>
    ${
      order.messages.length
        ? `<div class="stack">${order.messages.map((m) => `<div class="card small">${escapeHtml(m.text)}${m.simulated ? ' <span style="color:var(--text-dim)">(simuliert - keine Twilio-Zugangsdaten)</span>' : ''}</div>`).join('')}</div>`
        : '<p class="small">Noch keine SMS versendet.</p>'
    }
    <div class="row" style="gap:8px;margin-top:14px;">
      <button class="btn btn-ghost" style="flex:1;" onclick="document.getElementById('detail-modal').classList.add('hidden')">Schließen</button>
      <button class="btn btn-ghost" style="flex:1;color:#D9637E;" onclick="cancelOrder('${order.id}')">Bestellung stornieren</button>
    </div>
  `;
}
async function saveDetailDiscount(id) {
  const discount = document.getElementById('detail-discount').value;
  try {
    await api(`/api/orders/${id}/discount`, { method: 'POST', body: JSON.stringify({ discount }) });
    await loadAll();
    openOrderDetail(id);
  } catch (e) {
    alert(e.message);
  }
}
async function saveDetailPhone(id) {
  const phone = document.getElementById('detail-phone').value.trim();
  if (!phone) return;
  try {
    await api(`/api/orders/${id}/phone`, { method: 'POST', body: JSON.stringify({ phone }) });
    await loadAll();
    openOrderDetail(id);
  } catch (e) {
    alert(e.message);
  }
}
async function cancelItem(orderId, itemId) {
  try {
    await api(`/api/orders/${orderId}/items/${itemId}/cancel`, { method: 'PATCH' });
    await loadAll();
    openOrderDetail(orderId);
  } catch (e) {
    alert(e.message);
  }
}
async function cancelOrder(id) {
  if (!confirm('Gesamte Bestellung wirklich stornieren?')) return;
  try {
    await api(`/api/orders/${id}/cancel`, { method: 'PATCH' });
    await loadAll();
    document.getElementById('detail-modal').classList.add('hidden');
  } catch (e) {
    alert(e.message);
  }
}

requireStaffLogin(() => {
  initNav('kasse');
  loadAll();
  setInterval(loadAll, 6000);
});
