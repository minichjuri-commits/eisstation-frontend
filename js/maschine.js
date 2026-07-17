const machineId = parseInt(new URLSearchParams(location.search).get('id') || '1', 10);

function euro(n) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function statusMeta(status) {
  if (status === 'offen') return { label: 'Offen', color: cssVar('--pink') };
  if (status === 'in_bearbeitung') return { label: 'Wird zubereitet', color: cssVar('--amber') };
  if (status === 'storniert') return { label: 'Storniert', color: cssVar('--gray') };
  return { label: 'Fertig', color: cssVar('--green') };
}
function pillHtml(status) {
  const m = statusMeta(status);
  return `<span class="pill" style="background:${m.color}22;color:${m.color}">${m.label}</span>`;
}
function elapsed(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  return mins < 1 ? 'gerade eben' : `vor ${mins} Min.`;
}

async function api(path, opts) {
  const res = await fetch(API_BASE + path, Object.assign({ headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()) }, opts));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Fehler');
  return data;
}

async function load() {
  const [machines, queue, flavors] = await Promise.all([
    api('/api/machines'),
    api('/api/machines/' + machineId + '/queue'),
    api('/api/flavors'),
  ]);
  const machine = machines.find((m) => m.id === machineId);

  document.getElementById('active-count').textContent = queue.filter((i) => i.status === 'offen' || i.status === 'in_bearbeitung').length + ' offen';
  document.getElementById('machine-title').textContent = machine ? machine.name : 'Maschine ' + machineId;
  document.getElementById('rename-input').placeholder = machine ? machine.name : '';
  document.getElementById('rename-input').onchange = (e) => renameMachine(e.target.value);
  document.getElementById('toggle-machine').textContent = machine && machine.active ? '⏻ Aktiv' : '⏻ Inaktiv';
  document.getElementById('toggle-machine').onclick = () => toggleActive(machine && machine.active);
  document.getElementById('inactive-banner').innerHTML =
    machine && !machine.active
      ? `<div class="panel" style="border-color:${cssVar('--pink')};margin-bottom:16px;">Diese Maschine ist deaktiviert. Neue Artikel werden anderen Maschinen zugewiesen. Bereits laufende Artikel bitte noch fertigstellen.</div>`
      : '';

  const active = queue.filter((i) => i.status === 'offen' || i.status === 'in_bearbeitung');
  const grid = document.getElementById('items-grid');
  grid.innerHTML = active.length === 0
    ? '<p class="small">Keine offenen Artikel für diese Maschine.</p>'
    : active
        .map((i) => {
          const f = flavors.find((fl) => fl.id === i.flavorId);
          const opts = machines.filter((m) => m.active || m.id === i.machine);
          return `
      <div class="panel-alt ticket">
        <div class="row"><span class="font-mono" style="font-size:18px;font-weight:600;">${i.orderId}</span>${pillHtml(i.status)}</div>
        ${i.orderItemCount > 1 ? `<p class="small">Teil von ${i.orderItemCount} Artikeln dieser Bestellung</p>` : ''}
        <div class="row" style="margin:8px 0;justify-content:flex-start;"><span class="dot" style="background:${f ? f.color : '#888'};width:10px;height:10px;"></span>&nbsp;${escapeHtml(f ? f.name : '?')}</div>
        <div class="row small" style="margin-bottom:8px;">
          <span>${elapsed(i.orderCreatedAt)}</span>
          ${i.phone ? '<span>📞 verknüpft</span>' : ''}
        </div>
        <div class="row" style="gap:6px;margin-bottom:8px;">
          <span class="small">Verschieben:</span>
          <select onchange="reassign('${i.orderId}','${i.itemId}',this.value)" style="flex:1;">
            ${opts.map((m) => `<option value="${m.id}" ${m.id === i.machine ? 'selected' : ''}>${escapeHtml(m.name)}${!m.active ? ' (aus)' : ''}</option>`).join('')}
          </select>
        </div>
        <div class="row" style="gap:8px;">
          <button class="btn ${i.status === 'offen' ? 'btn-amber' : 'btn-green'}" style="flex:1;" onclick="advance('${i.orderId}','${i.itemId}')">${i.status === 'offen' ? 'Bearbeitung starten' : 'Als fertig markieren'}</button>
          <button class="btn btn-ghost" title="Einen Schritt zurück" onclick="revert('${i.orderId}','${i.itemId}')">↺</button>
          <button class="btn btn-ghost" onclick="cancelItem('${i.orderId}','${i.itemId}')">Stornieren</button>
        </div>
      </div>`;
        })
        .join('');

  const done = queue.filter((i) => i.status === 'fertig').slice(-4).reverse();
  document.getElementById('done-list').innerHTML =
    done
      .map((i) => {
        const f = flavors.find((fl) => fl.id === i.flavorId);
        return `<div class="row card"><span class="font-mono">${i.orderId}</span> <span class="small">${escapeHtml(f ? f.name : '?')}</span>${pillHtml('fertig')}<button class="btn btn-ghost" style="padding:2px 8px;" title="Zurück auf 'wird zubereitet'" onclick="revert('${i.orderId}','${i.itemId}')">↺</button></div>`;
      })
      .join('') || '<p class="small">Noch nichts fertiggestellt.</p>';
}

async function advance(orderId, itemId) {
  try {
    await api(`/api/orders/${orderId}/items/${itemId}/advance`, { method: 'PATCH' });
    await load();
  } catch (e) {
    alert(e.message);
  }
}
async function revert(orderId, itemId) {
  try {
    await api(`/api/orders/${orderId}/items/${itemId}/revert`, { method: 'PATCH' });
    await load();
  } catch (e) {
    alert(e.message);
  }
}
async function cancelItem(orderId, itemId) {
  try {
    await api(`/api/orders/${orderId}/items/${itemId}/cancel`, { method: 'PATCH' });
    await load();
  } catch (e) {
    alert(e.message);
  }
}
async function reassign(orderId, itemId, machine) {
  try {
    await api(`/api/orders/${orderId}/items/${itemId}/reassign`, { method: 'PATCH', body: JSON.stringify({ machine }) });
    await load();
  } catch (e) {
    alert(e.message);
  }
}
async function toggleActive(currentlyActive) {
  try {
    await api('/api/machines/' + machineId, { method: 'PATCH', body: JSON.stringify({ active: !currentlyActive }) });
    await load();
  } catch (e) {
    alert(e.message);
  }
}
async function renameMachine(name) {
  if (!name || !name.trim()) return;
  try {
    await api('/api/machines/' + machineId, { method: 'PATCH', body: JSON.stringify({ name }) });
    document.getElementById('rename-input').value = '';
    await load();
  } catch (e) {
    alert(e.message);
  }
}

document.addEventListener('eisstation:themechange', () => load());

requireStaffLogin(() => {
  initNav('maschine' + machineId);
  load();
  setInterval(load, 4000);
});
