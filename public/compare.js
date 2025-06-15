// compare.js
const API_BASE = 'https://open.faceit.com/data/v4';
const API_KEY  = import.meta.env.VITE_FACEIT_API_KEY || '';
if (!API_KEY) {
  alert('Define VITE_FACEIT_API_KEY en .env');
  throw new Error('No API key');
}

async function apiFetch(path) {
  const res = await fetch(API_BASE + path, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function fetchPlayerData(nick) {
  const { items } = await apiFetch(
    `/search/players?nickname=${encodeURIComponent(nick)}&limit=1&offset=0`
  );
  if (!items.length) throw new Error(`"${nick}" no encontrado`);
  const id = items[0].player_id;
  const [profile, stats] = await Promise.all([
    apiFetch(`/players/${id}`),
    apiFetch(`/players/${id}/stats/cs2`)
  ]);
  return { profile, lifetime: stats.lifetime };
}

document.getElementById('compareForm').addEventListener('submit', async e => {
  e.preventDefault();
  document.getElementById('compareSection').classList.add('hidden');
  document.querySelector('#compareTable tbody').innerHTML = '';
  document.querySelectorAll('.profile-card').forEach(c => c.innerHTML = '');

  const nickA = document.getElementById('nickA').value.trim();
  const nickB = document.getElementById('nickB').value.trim();

  try {
    const [dataA, dataB] = await Promise.all([
      fetchPlayerData(nickA),
      fetchPlayerData(nickB)
    ]);

    renderCard('cardA', dataA);
    renderCard('cardB', dataB);

    const metricsList = [
      'Win Rate %',
      'Average Headshots %',
      'ADR',
      'Sniper Kill Rate',
      'Sniper Kill Rate per Round',
      'Total Sniper Kills',
      'Total Utility Count',
      'Total Utility Damage',
      'Total Utility Successes',
      'Utility Usage per Round',
      'Utility Damage per Round',
      'Utility Success Rate',
      'Total Flash Count',
      'Total Flash Successes',
      'Enemies Flashed per Round',
      'Flash Success Rate',
      'Total Enemies Flashed',
      '1v1 Win Rate',
      '1v2 Win Rate',
      'Total 1v1 Count',
      'Total 1v1 Wins',
      'Total 1v2 Count',
      'Total 1v2 Wins',
      'Entry Success Rate',
      'Total Entry Count',
      'Total Entry Wins',
      'Current Win Streak',
      'Total Rounds with extended stats',
      'Total Kills with extended stats'
    ];

    let scoreA = 0, scoreB = 0;
    const tbody = document.querySelector('#compareTable tbody');

    metricsList.forEach((key, i) => {
      const valA = parseFloat(dataA.lifetime[key]) || 0;
      const valB = parseFloat(dataB.lifetime[key]) || 0;

      const tr = document.createElement('tr');
      tr.style.animationDelay = `${0.1 + i * 0.05}s`;
      tr.classList.add('fade-in');

      const tdKey = document.createElement('td');
      tdKey.textContent = key;

      const tdA = document.createElement('td');
      tdA.textContent = dataA.lifetime[key] ?? '-';

      const tdB = document.createElement('td');
      tdB.textContent = dataB.lifetime[key] ?? '-';

      if (valA > valB) {
        tdA.classList.add('better');
        tdB.classList.add('worse');
        scoreA++;
      } else if (valB > valA) {
        tdB.classList.add('better');
        tdA.classList.add('worse');
        scoreB++;
      }

      tr.append(tdKey, tdA, tdB);
      tbody.appendChild(tr);
    });

    // mostrar sección y tabla
    document.getElementById('compareSection').classList.remove('hidden');

    // decidir ganador y mostrar modal con imagen
    let winnerProfile;
    let text;
    if (scoreA > scoreB) {
      winnerProfile = dataA.profile;
      text = `${dataA.profile.nickname} gana (${scoreA}–${scoreB})`;
    } else if (scoreB > scoreA) {
      winnerProfile = dataB.profile;
      text = `${dataB.profile.nickname} gana (${scoreB}–${scoreA})`;
    } else {
      // en empate, mostrar ambos avatars
      showWinnerModalTie(dataA.profile, dataB.profile, `Empate (${scoreA}–${scoreB})`);
      return;
    }
    showWinnerModal(text, winnerProfile);

  } catch (err) {
    alert(err.message);
  }
});

function renderCard(containerId, { profile, lifetime }) {
  const c = document.getElementById(containerId);
  const flag = profile.country
    ? `<img class="flag" src="https://flagcdn.com/32x24/${profile.country.toLowerCase()}.png">`
    : '';
  const elo = profile.games.cs2?.faceit_elo ?? '-';
  const matches = lifetime['Matches'] ?? '-';

  c.innerHTML = `
    <img src="${profile.avatar}" alt="Avatar"/>
    <div class="nickname">${profile.nickname}</div>
    <div class="summary">Elo: <strong>${elo}</strong></div>
    <div class="summary">Matches: <strong>${matches}</strong></div>
    ${flag}
  `;
}

function showWinnerModal(text, profile) {
  const modal = document.getElementById('winnerModal');
  const body  = document.getElementById('modalBody');
  const flagImg = profile.country
    ? `<img class="flag" src="https://flagcdn.com/48x36/${profile.country.toLowerCase()}.png">`
    : '';
  body.innerHTML = `
    <span class="crown">👑</span>
    <img src="${profile.avatar}" class="modal-avatar" alt="Avatar de ${profile.nickname}">
    <div class="modal-nick">${profile.nickname}</div>
    ${flagImg}
    <div class="modal-text">${text}</div>
  `;
  modal.classList.remove('hidden');
  modal.classList.add('show');
}

function showWinnerModalTie(profileA, profileB, text) {
  const modal = document.getElementById('winnerModal');
  const body  = document.getElementById('modalBody');
  const flagA = profileA.country
    ? `<img class="flag" src="https://flagcdn.com/48x36/${profileA.country.toLowerCase()}.png">`
    : '';
  const flagB = profileB.country
    ? `<img class="flag" src="https://flagcdn.com/48x36/${profileB.country.toLowerCase()}.png">`
    : '';
  body.innerHTML = `
    <span class="crown">🤝</span>
    <div class="tie-avatars">
      <img src="${profileA.avatar}" class="modal-avatar" alt="${profileA.nickname}">
      <img src="${profileB.avatar}" class="modal-avatar" alt="${profileB.nickname}">
    </div>
    <div class="modal-nick">${text}</div>
  `;
  modal.classList.remove('hidden');
  modal.classList.add('show');
}

document.getElementById('modalClose').onclick = () => {
  const modal = document.getElementById('winnerModal');
  modal.classList.remove('show');
  modal.classList.add('hidden');
};

document.getElementById('winnerModal').addEventListener('click', e => {
  if (e.target.id === 'winnerModal') {
    e.target.classList.remove('show');
    e.target.classList.add('hidden');
  }
});
