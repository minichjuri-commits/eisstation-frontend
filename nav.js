async function initNav(activeKey) {
  const nav = document.getElementById('tabs');
  if (!nav) return;
  let machines = [];
  try {
    machines = await fetch(API_BASE + '/api/machines', { headers: authHeader() }).then((r) => r.json());
  } catch (e) {
    machines = [];
  }
  const items = [
    { key: 'kasse', href: '/kasse.html', label: 'Kasse' },
    ...machines.map((m) => ({ key: 'maschine' + m.id, href: '/maschine.html?id=' + m.id, label: m.name })),
    { key: 'statistik', href: '/statistik.html', label: 'Statistik' },
  ];
  nav.innerHTML = items
    .map((i) => `<a href="${i.href}" class="${activeKey === i.key ? 'active' : ''}">${i.label}</a>`)
    .join('');
}
