async function initNav(activeKey) {
  const nav = document.getElementById('tabs');
  if (!nav) return;
  let machines = [];
  try {
    machines = await fetch(API_BASE + '/api/machines', { headers: authHeader() }).then((r) => r.json());
  } catch (e) {
    machines = [];
  }
  const machineItems = machines.map((m) => ({ key: 'maschine' + m.id, href: '/maschine.html?id=' + m.id, label: m.name }));

  // Kombinierte Split-Ansicht fuer je zwei aufeinanderfolgende Maschinen
  // (z.B. fuer ein Tablet zwischen zwei Geraeten) - passt sich automatisch
  // an, wenn Maschinen umbenannt, hinzugefuegt oder entfernt werden.
  const comboItems = [];
  for (let i = 0; i + 1 < machines.length; i += 2) {
    const a = machines[i];
    const b = machines[i + 1];
    comboItems.push({
      key: 'kombi-' + a.id + '-' + b.id,
      href: `/maschine-kombi.html?left=${a.id}&right=${b.id}`,
      label: `${a.name} + ${b.name}`,
    });
  }

  const items = [
    { key: 'kasse', href: '/kasse.html', label: 'Kasse' },
    ...machineItems,
    ...comboItems,
    { key: 'statistik', href: '/statistik.html', label: 'Statistik' },
  ];
  nav.innerHTML = items
    .map((i) => `<a href="${i.href}" class="${activeKey === i.key ? 'active' : ''}">${i.label}</a>`)
    .join('');
}
