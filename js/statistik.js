function euro(n) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// CSV-Export: Semikolon als Trennzeichen (Excel in deutscher Spracheinstellung
// erwartet das, da das Komma dort als Dezimaltrennzeichen dient) und ein
// BOM am Anfang, damit Umlaute in Excel korrekt als UTF-8 erkannt werden.
function toCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell == null ? '' : cell);
          return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(';')
    )
    .join('\r\n');
}
function downloadCsv(filename, csvContent) {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
}
function statusMeta(status) {
  if (status === 'offen') return { label: 'Offen', color: cssVar('--pink') };
  if (status === 'in_bearbeitung') return { label: 'Wird zubereitet', color: cssVar('--amber') };
  if (status === 'storniert') return { label: 'Storniert', color: cssVar('--gray') };
  return { label: 'Fertig', color: cssVar('--green') };
}
function pillHtml(status) {
  const m = statusMeta(status);
  return `<span class="pill" style="background:${m.color}22;color:${m.color};">${m.label}</span>`;
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

async function api(path) {
  const r = await fetch(API_BASE + path, { headers: authHeader() });
  return r.json();
}

function showSubtab(which) {
  document.getElementById('subtab-stats').classList.toggle('hidden', which !== 'stats');
  document.getElementById('subtab-orders').classList.toggle('hidden', which !== 'orders');
  document.getElementById('subtab-btn-stats').style.background = which === 'stats' ? 'var(--amber)' : '';
  document.getElementById('subtab-btn-stats').style.color = which === 'stats' ? '#1B1D21' : '';
  document.getElementById('subtab-btn-orders').style.background = which === 'orders' ? 'var(--amber)' : '';
  document.getElementById('subtab-btn-orders').style.color = which === 'orders' ? '#1B1D21' : '';
  if (which === 'orders') loadOrders();
}

let lastStatsData = null;

async function load() {
  const year = document.getElementById('f-year').value;
  const month = document.getElementById('f-month').value;
  const day = document.getElementById('f-day').value;
  const params = new URLSearchParams();
  if (day) params.set('day', day);
  else {
    if (year) params.set('year', year);
    if (month) params.set('month', month);
  }
  const data = await api('/api/stats?' + params.toString());
  lastStatsData = data;

  const yearSelect = document.getElementById('f-year');
  if (!yearSelect.dataset.filled) {
    yearSelect.innerHTML = data.availableYears.map((y) => `<option value="${y}">${y}</option>`).join('');
    yearSelect.value = year || new Date().getFullYear();
    yearSelect.dataset.filled = '1';
  }
  const orderYearSelect = document.getElementById('o-year');
  if (!orderYearSelect.dataset.filled) {
    orderYearSelect.innerHTML = data.availableYears.map((y) => `<option value="${y}">${y}</option>`).join('');
    orderYearSelect.value = new Date().getFullYear();
    orderYearSelect.dataset.filled = '1';
  }

  document.getElementById('stat-period').textContent = 'Zeitraum: ' + data.label;
  document.getElementById('stat-total-revenue').textContent = euro(data.totalRevenue);
  document.getElementById('stat-total-units').textContent = data.totalUnits + ' verkaufte Stück';

  const table = document.getElementById('stat-table');
  table.innerHTML = `
    <tr style="text-align:left;border-bottom:1px solid var(--border);">
      <th style="padding:6px;">Sorte</th><th style="padding:6px;">Stück</th><th style="padding:6px;">Erlös</th>
    </tr>
    ${
      data.byFlavor.length
        ? data.byFlavor
            .map(
              (g) => `
      <tr style="border-bottom:1px solid var(--border);">
        <td style="padding:6px;"><span class="dot" style="background:${g.color};width:10px;height:10px;display:inline-block;margin-right:6px;"></span>${g.name}</td>
        <td style="padding:6px;" class="font-mono">${g.flavorId === '__discount__' ? '–' : g.units}</td>
        <td style="padding:6px;" class="font-mono">${euro(g.revenue)}</td>
      </tr>`
            )
            .join('')
        : '<tr><td style="padding:6px;" colspan="3" class="small">Keine Verkäufe in diesem Zeitraum.</td></tr>'
    }
  `;
}
function clearDay() {
  document.getElementById('f-day').value = '';
  load();
}
function exportStatsCsv() {
  if (!lastStatsData) return;
  const rows = [['Sorte', 'Stück', 'Erlös (EUR)']];
  lastStatsData.byFlavor.forEach((g) => {
    rows.push([g.name, g.flavorId === '__discount__' ? '' : g.units, g.revenue.toFixed(2).replace('.', ',')]);
  });
  rows.push([]);
  rows.push(['Gesamt Stück', lastStatsData.totalUnits, '']);
  rows.push(['Gesamterlös (EUR)', '', lastStatsData.totalRevenue.toFixed(2).replace('.', ',')]);
  downloadCsv(`eisstation-statistik-${lastStatsData.label}.csv`, toCsv(rows));
}

// Zeitgrenzen im Browser berechnen (nicht im Backend), damit die tatsaechliche
// Zeitzone des Standorts zaehlt statt der des Render-Servers - identisches
// Prinzip wie bei "Heutige Bestellungen" in der Kasse.
function computeBounds(year, month, day) {
  if (day) {
    const d = new Date(day + 'T00:00:00');
    return { start: d.getTime(), end: d.getTime() + 24 * 60 * 60 * 1000 };
  }
  const y = parseInt(year, 10) || new Date().getFullYear();
  if (month) {
    const m = parseInt(month, 10) - 1;
    return { start: new Date(y, m, 1).getTime(), end: new Date(y, m + 1, 1).getTime() };
  }
  return { start: new Date(y, 0, 1).getTime(), end: new Date(y + 1, 0, 1).getTime() };
}

let lastFetchedOrders = [];
let lastFetchedFlavors = [];

async function loadOrders() {
  const year = document.getElementById('o-year').value;
  const month = document.getElementById('o-month').value;
  const day = document.getElementById('o-day').value;
  const { start, end } = computeBounds(year, month, day);

  try {
    const [flavors, orders] = await Promise.all([
      api('/api/flavors'),
      api(`/api/orders?since=${start}&until=${end}`),
    ]);
    lastFetchedFlavors = flavors;
    lastFetchedOrders = orders;
  } catch (e) {
    document.getElementById('orders-list').innerHTML = '<p class="small">Fehler beim Laden.</p>';
    return;
  }
  renderOrdersList();
}

function orderSummary(o, flavors) {
  const groups = {};
  o.items.forEach((i) => {
    if (!groups[i.flavorId]) groups[i.flavorId] = { qty: 0, flavor: flavors.find((f) => f.id === i.flavorId) };
    groups[i.flavorId].qty += i.qty;
  });
  return Object.values(groups).map((g) => `${g.qty}x ${g.flavor ? g.flavor.name : '?'}`).join(', ');
}

// Filtert die bereits geladene (nach Zeitraum eingeschraenkte) Liste im
// Browser nach Bestellnummer oder Telefonnummer - kein erneuter Serveraufruf
// noetig, da schon alles fuer den gewaehlten Zeitraum vorliegt.
function renderOrdersList() {
  const search = document.getElementById('o-search').value.trim().toLowerCase();
  const orders = search
    ? lastFetchedOrders.filter((o) => o.id.toLowerCase().includes(search) || (o.phone && o.phone.toLowerCase().includes(search)))
    : lastFetchedOrders;

  const el = document.getElementById('orders-list');
  el.innerHTML = orders.length
    ? orders
        .map((o) => {
          const status = deriveOrderStatus(o);
          const summary = orderSummary(o, lastFetchedFlavors);
          return `
        <div class="row card">
          <span>
            <span class="font-mono">${o.id}</span>
            <span class="small font-mono" style="color:var(--text-dim);">${fmtDateTime(o.createdAt)}</span>
            <span class="small">${escapeHtml(summary)}</span>
          </span>
          <span class="row" style="gap:8px;width:auto;">
            <span class="small font-mono">${euro(orderTotal(o))}</span>
            ${o.phone ? '📞' : ''}
            ${pillHtml(status)}
          </span>
        </div>`;
        })
        .join('')
    : `<p class="small">${search ? 'Keine Treffer für diese Suche.' : 'Keine Bestellungen in diesem Zeitraum.'}</p>`;
}

function exportOrdersCsv() {
  const search = document.getElementById('o-search').value.trim().toLowerCase();
  const orders = search
    ? lastFetchedOrders.filter((o) => o.id.toLowerCase().includes(search) || (o.phone && o.phone.toLowerCase().includes(search)))
    : lastFetchedOrders;

  const rows = [['Bestellnummer', 'Datum/Uhrzeit', 'Artikel', 'Gesamtpreis (EUR)', 'Telefonnummer', 'Status']];
  orders.forEach((o) => {
    rows.push([
      o.id,
      fmtDateTime(o.createdAt),
      orderSummary(o, lastFetchedFlavors),
      orderTotal(o).toFixed(2).replace('.', ','),
      o.phone || '',
      statusMeta(deriveOrderStatus(o)).label,
    ]);
  });
  downloadCsv('eisstation-bestellungen.csv', toCsv(rows));
}
function clearOrderDay() {
  document.getElementById('o-day').value = '';
  loadOrders();
}

document.getElementById('f-year').addEventListener('change', load);
document.getElementById('f-month').addEventListener('change', load);
document.getElementById('f-day').addEventListener('change', load);
document.getElementById('o-year').addEventListener('change', loadOrders);
document.getElementById('o-month').addEventListener('change', loadOrders);
document.getElementById('o-day').addEventListener('change', loadOrders);
document.getElementById('o-search').addEventListener('input', renderOrdersList);

document.addEventListener('eisstation:themechange', () => {
  load();
  if (!document.getElementById('subtab-orders').classList.contains('hidden')) loadOrders();
});

requireStaffLogin(() => {
  initNav('statistik');
  showSubtab('stats');
  load();
});
