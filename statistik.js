function euro(n) { return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' }); }
async function api(path) {
  const r = await fetch(API_BASE + path, { headers: authHeader() });
  return r.json();
}

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

  const yearSelect = document.getElementById('f-year');
  if (!yearSelect.dataset.filled) {
    yearSelect.innerHTML = data.availableYears.map((y) => `<option value="${y}">${y}</option>`).join('');
    yearSelect.value = year || new Date().getFullYear();
    yearSelect.dataset.filled = '1';
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
document.getElementById('f-year').addEventListener('change', load);
document.getElementById('f-month').addEventListener('change', load);
document.getElementById('f-day').addEventListener('change', load);

requireStaffLogin(() => {
  initNav('statistik');
  load();
});
