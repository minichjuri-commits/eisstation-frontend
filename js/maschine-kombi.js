const params = new URLSearchParams(location.search);
const leftId = parseInt(params.get('left') || '1', 10);
const rightId = parseInt(params.get('right') || '2', 10);

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

async function loadColumn(side, machineId) {
  const container = document.getElementById('col-' + side);
  const [machines, queue, flavors] = await Promise.all([
    api('/api/machines'),
    api('/api/machines/' + machineId + '/queue'),
    api('/api/flavors'),
  ]);
  const machine = machines.find((m) => m.id === machineId);
  if (!machine) {
    container.innerHTML = `<p class="small">Maschine ${machineId} nicht gefunden.</p>`;
    return;
  }

  const active = queue.filter((i) => i.status === 'offen' || i.status === 'in_bearbeitung');
  const done = queue.filter((i) => i.status === 'fertig').slice(-4).reverse();
  const moveOptions = machines.filter((m) => m.active || m.id === machineId);

  container.innerHTML = `
    <div class="row" style="margin-bottom:10px;flex-wrap:wrap;">
      <h2 class="font-display" style="font-size:20px;">${escapeHtml(machine.name)}</h2>
      <span class="small font-mono">${active.length} offen</span>
    </div>
    <div class="row" style="gap:8px;margin-bottom:10px;">
      <input id="rename-${side}" placeholder="Name ändern" style="flex:1;" />
      <button class="btn btn-ghost" id="toggle-${side}" style="padding:6px 10px;">${machine.active ? '⏻ Aktiv' : '⏻ Inaktiv'}</button>
    </div>
    ${
      !machine.active
        ? `<div class="panel" style="border-color:${cssVar('--pink')};margin-bottom:12px;font-size:13px;">Deaktiviert - neue Artikel gehen an andere Maschinen.</div>`
        : ''
    }
    <div class="stack" style="margin-bottom:16px;">
      ${
        active.length === 0
          ? '<p class="small">Keine offenen Artikel.</p>'
          : active
              .map((i) => {
                const f = flavors.find((fl) => fl.id === i.flavorId);
                return `
        <div class="panel-alt ticket">
          <div class="row"><span class="font-mono" style="font-weight:600;">${i.orderId}</span>${pillHtml(i.status)}</div>
          ${i.orderItemCount > 1 ? `<p class="small">Teil von ${i.orderItemCount} Artikeln</p>` : ''}
          <div class="row" style="margin:6px 0;justify-content:flex-start;"><span class="dot" style="background:${f ? f.color : '#888'};width:9px;height:9px;"></span>&nbsp;${escapeHtml(f ? f.name : '?')}</div>
          <div class="row small" style="margin-bottom:6px;">
            <span>${elapsed(i.orderCreatedAt)}</span>
            ${i.phone ? '<span>📞</span>' : ''}
          </div>
          <div class="row" style="gap:6px;margin-bottom:6px;">
            <select onchange="reassign('${i.orderId}','${i.itemId}',this.value,'${side}',${machineId})" style="flex:1;font-size:12px;">
              ${moveOptions.map((m) => `<option value="${m.id}" ${m.id === i.machine ? 'selected' : ''}>${escapeHtml(m.name)}${!m.active ? ' (aus)' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="row" style="gap:6px;">
            <button class="btn ${i.status === 'offen' ? 'btn-amber' : 'btn-green'}" style="flex:1;padding:8px;" onclick="advance('${i.orderId}','${i.itemId}','${side}',${machineId})">${i.status === 'offen' ? 'Starten' : 'Fertig'}</button>
            <button class="btn btn-ghost" style="padding:8px;" onclick="cancelItem('${i.orderId}','${i.itemId}','${side}',${machineId})">✕</button>
          </div>
        </div>`;
              })
              .join('')
      }
    </div>
    <h4 class="font-display small" style="color:var(--text-dim);">Zuletzt fertig</h4>
    <div class="stack">
      ${
        done
          .map((i) => {
            const f = flavors.find((fl) => fl.id === i.flavorId);
            return `<div class="row card"><span class="font-mono small">${i.orderId}</span><span class="small">${escapeHtml(f ? f.name : '?')}</span>${pillHtml('fertig')}</div>`;
          })
          .join('') || '<p class="small">Noch nichts fertig.</p>'
      }
    </div>
  `;

  document.getElementById('toggle-' + side).onclick = () => toggleActive(side, machineId, machine.active);
  document.getElementById('rename-' + side).placeholder = machine.name;
  document.getElementById('rename-' + side).onchange = (e) => renameMachine(side, machineId, e.target.value);
}

async function loadAllColumns() {
  // Waehrend gerade in ein Feld getippt oder eine Auswahl offen ist, soll
  // die automatische Aktualisierung nicht dazwischenfunken.
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA')) {
    return;
  }
  await Promise.all([loadColumn('left', leftId), loadColumn('right', rightId)]);
}

async function advance(orderId, itemId, side, machineId) {
  try {
    await api(`/api/orders/${orderId}/items/${itemId}/advance`, { method: 'PATCH' });
    await loadColumn(side, machineId);
  } catch (e) {
    alert(e.message);
  }
}
async function cancelItem(orderId, itemId, side, machineId) {
  try {
    await api(`/api/orders/${orderId}/items/${itemId}/cancel`, { method: 'PATCH' });
    await loadColumn(side, machineId);
  } catch (e) {
    alert(e.message);
  }
}
async function reassign(orderId, itemId, machine, side, machineId) {
  try {
    await api(`/api/orders/${orderId}/items/${itemId}/reassign`, { method: 'PATCH', body: JSON.stringify({ machine }) });
    await loadAllColumns();
  } catch (e) {
    alert(e.message);
  }
}
async function toggleActive(side, machineId, currentlyActive) {
  try {
    await api('/api/machines/' + machineId, { method: 'PATCH', body: JSON.stringify({ active: !currentlyActive }) });
    await loadAllColumns();
  } catch (e) {
    alert(e.message);
  }
}
async function renameMachine(side, machineId, name) {
  if (!name || !name.trim()) return;
  try {
    await api('/api/machines/' + machineId, { method: 'PATCH', body: JSON.stringify({ name }) });
    document.getElementById('rename-' + side).value = '';
    await loadColumn(side, machineId);
  } catch (e) {
    alert(e.message);
  }
}

document.addEventListener('eisstation:themechange', () => loadAllColumns());

requireStaffLogin(() => {
  initNav('kombi-' + leftId + '-' + rightId);
  loadAllColumns();
  setInterval(loadAllColumns, 4000);
});
