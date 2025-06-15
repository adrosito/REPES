// ---------------------------------------
// src/main.js
// ---------------------------------------

// --------------------------------------------------
// CONSTANTES Y UTILIDADES
// --------------------------------------------------
const API_BASE = 'https://open.faceit.com/data/v4';
const API_KEY  = import.meta.env.VITE_FACEIT_API_KEY || '';

if (!API_KEY) {
  alert('ERROR: No se ha encontrado la clave VITE_FACEIT_API_KEY en tu .env');
  throw new Error('Falta VITE_FACEIT_API_KEY');
}

async function apiFetch(path) {
  const res = await fetch(API_BASE + path, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`API error ${res.status} en ${path}: ${txt}`);
  }
  return res.json();
}

// Convierte “Recent Results” crudos a secuencia “W” / “L”
function formateaRecentResults(raw) {
  if (!raw) return '-';
  if (Array.isArray(raw)) {
    return raw
      .map(ch => {
        const s = String(ch).trim().toUpperCase();
        return (s === '1' || s === 'W') ? 'W' : 'L';
      })
      .join(' ');
  }
  if (typeof raw === 'string') {
    let str = raw.trim();
    if (str.includes(',')) {
      return str
        .split(',')
        .map(x => {
          const s = x.trim().toUpperCase();
          return (s === '1' || s === 'W') ? 'W' : 'L';
        })
        .join(' ');
    }
    return str
      .split('')
      .map(ch => {
        const s = ch.trim().toUpperCase();
        return (s === '1' || s === 'W') ? 'W' : 'L';
      })
      .join(' ');
  }
  return '-';
}

// --------------------------------------------------
// DETECCIÓN “SMURF”
// --------------------------------------------------
function detectaSmurf(profile, life) {
  const checks = [];

  // Edad de la cuenta < 365 días
  if (profile.created_at) {
    const creado = new Date(profile.created_at);
    const ahora  = new Date();
    const diffMs = ahora - creado;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    checks.push(diffDays < 365);
  } else {
    checks.push(false);
  }

  // Partidas totales < 200
  const totalMatches = Number(life['Matches'] || 0);
  checks.push(totalMatches > 0 && totalMatches < 200);

  // K/D promedio > 1.5
  const avgKD = parseFloat(life['Average K/D Ratio']) || 0;
  checks.push(avgKD > 1.5);

  // Headshots % > 60
  const headPct = parseFloat(life['Average Headshots %']) || 0;
  checks.push(headPct > 60);

  // Win Rate > 75
  const winRate = parseFloat(String(life['Win Rate %']).replace('%','')) || 0;
  checks.push(winRate > 75);

  // Mayor racha de victorias ≥ 8
  const longestStreak = Number(life['Longest Win Streak'] || 0);
  checks.push(longestStreak >= 8);
  checks.push(false);

  // Cuenta cuántas de las 7 condiciones se cumplieron
  const cumplidas = checks.filter(x => x).length;
  // Si cumple 5 o más: se considera “Smurf”
  return cumplidas >= 5;
}

// --------------------------------------------------
// DETECCIÓN “MULTI‐ACCOUNT” VIA /players/{player_id}/bans
// --------------------------------------------------
async function detectaMultiAccountFromBans(playerId) {
  try {
    const bansData = await apiFetch(`/players/${playerId}/bans`);
    console.log('bansData:', bansData);

    if (bansData.items && bansData.items.length) {
      for (const ban of bansData.items) {
        const razon = (ban.reason || '').toLowerCase();
        if (
             razon.includes('multiple account')
          || razon.includes('multi account')
          || razon.includes('multiple accounts')
        ) {
          return 'multimsg';
        }
        if (
             razon.includes('smurf')
          || razon.includes('smurfing')
          || razon.includes('smurf account')
        ) {
          return 'smurfBan';
        }
      }
    }
    return null;
  } catch (err) {
    console.warn('Error al consultar bans:', err);
    return null;
  }
}

// --------------------------------------------------
// REFERENCIAS A ELEMENTOS DEL DOM
// --------------------------------------------------
const form           = document.getElementById('statsForm');
const nickInput      = document.getElementById('nickInput');
const profileSection = document.getElementById('profileSection');
const profileInfo    = document.getElementById('profileInfo');
const mainStats      = document.getElementById('mainStats');
const otherStats     = document.getElementById('otherStats');
const chartsSection  = document.getElementById('chartsSection');
const kdCanvas       = document.getElementById('kdChart');

let kdChart = null;

// --------------------------------------------------
// EVENTO: CUANDO SE ENVÍA EL FORMULARIO
// --------------------------------------------------
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    // --- Ocultar secciones antes de recargar datos ---
    profileSection.classList.add('hidden');
    chartsSection.classList.add('hidden');

    const nick = nickInput.value.trim();
    if (!nick) throw new Error('Introduce un nickname FACEIT.');

    // 1) Buscar jugador por nickname
    console.log('Buscando jugador FACEIT con nickname:', nick);
    const searchData = await apiFetch(
      `/search/players?nickname=${encodeURIComponent(nick)}&limit=1&offset=0`
    );
    console.log('searchData:', searchData);

    if (!searchData.items.length) throw new Error('Jugador no encontrado.');
    const player = searchData.items[0];
    console.log('player:', player);

    // 2) Hacer fetch en paralelo:
    //    - Perfil completo
    //    - Estadísticas lifetime CS2
    //    - Historial últimos 50 matches CS2
    console.log('Obteniendo profile + stats lifetime + history...');
    const [ profile, statsData, historyData ] = await Promise.all([
      apiFetch(`/players/${player.player_id}`),
      apiFetch(`/players/${player.player_id}/stats/cs2`),
      apiFetch(`/players/${player.player_id}/history?game=cs2&limit=50&offset=0`)
    ]);
    console.log('profile:', profile);
    console.log('statsData.lifetime:', statsData.lifetime);
    console.log('statsData.segments:', statsData.segments);
    console.log('historyData.items:', historyData.items);

    // 3) Consultar bans para detectar “multicuenta” o “smurf ban”
    const banType = await detectaMultiAccountFromBans(player.player_id);
    console.log('banType:', banType);

    // 4) Renderizar perfil y stats
    renderProfile(profile, statsData.lifetime, banType);
    renderStats(statsData.lifetime);
    profileSection.classList.remove('hidden');

    // 5) Renderizar gráfico K/D promedio por mapa
    renderKdChart(statsData.segments || []);
    chartsSection.classList.remove('hidden');

  } catch (err) {
    alert(err.message);
    console.error(err);
  }
});

// --------------------------------------------------
// FUNCIONES DE RENDERIZADO
// --------------------------------------------------

function renderProfile(profile, life, banType) {
  console.log('Entrando en renderProfile()', profile, life, banType);

  const country = profile.country || '';
  const flagUrl = country
    ? `https://flagcdn.com/32x24/${country.toLowerCase()}.png`
    : '';

  // 1) Tomar Elo CS2 de profile.games.cs2.faceit_elo
  let eloActual = '-';
  if (profile.games && profile.games.cs2 && profile.games.cs2.faceit_elo != null) {
    eloActual = profile.games.cs2.faceit_elo;
  }

  // 2) Lógica “manual” de Smurf
  const isManualSmurf = detectaSmurf(profile, life);
  console.log('isManualSmurf:', isManualSmurf);

  // 3) Construir HTML para tipo de cuenta
  let accountTypeHtml = '';
  if (banType === 'multimsg') {
    accountTypeHtml = `<div class="account-type multimsg">Usuario con Múltiples Cuentas</div>`;
  } else if (banType === 'smurfBan') {
    accountTypeHtml = `<div class="account-type smurf">Cuenta Smurf</div>`;
  } else if (isManualSmurf) {
    accountTypeHtml = `<div class="account-type smurf">Cuenta Smurf</div>`;
  } else if (profile.memberships?.find(m => m.type === 'steam')) {
    accountTypeHtml = `<div class="account-type">Cuenta Premium</div>`;
  } else {
    accountTypeHtml = `<div class="account-type">Cuenta Normal</div>`;
  }

  // 4) Enlace de steam: si tiene steam_id_64
  let perfilLinkHtml = '';
  if (profile.steam_id_64) {
    perfilLinkHtml = `
      <div class="profile-link">
        <a href="https://steamcommunity.com/profiles/${profile.steam_id_64}" target="_blank">
          Ver perfil en Steam
        </a>
      </div>
    `;
  } else {
    perfilLinkHtml = `
      <div class="profile-link">
        <a href="${profile.faceit_url}" target="_blank">
          Ver perfil en FACEIT
        </a>
      </div>
    `;
  }

  profileInfo.innerHTML = `
    <div class="profile-avatar">
      <img src="${profile.avatar}" alt="" />
    </div>
    <div class="profile-data">
      <div class="nickname">${profile.nickname}</div>
      <div class="elo">Elo CS2: <strong>${eloActual}</strong></div>
      ${accountTypeHtml}
      ${perfilLinkHtml}
      ${ flagUrl ? `<div><img class="flag" src="${flagUrl}" alt=""></div>` : '' }
    </div>
  `;
}

function renderStats(life) {
  const mainKeys = [
    ['Matches',             'Matches'],
    ['Win Rate %',          'Win Rate %'],
    ['Longest Win Streak',  'Longest Win Streak'],
    ['Recent Results',      'Recent Results'],
    ['Average K/D Ratio',   'Average K/D Ratio'],
    ['Average Headshots %', 'Headshots %']
  ];

  mainStats.innerHTML = mainKeys.map(([key, label]) => {
    let raw = life[key];
    let value = raw != null ? raw : '-';

    if (key === 'Recent Results' && raw != null) {
      value = formateaRecentResults(raw);
    }
    return `
      <div class="card">
        <div class="value">${value}</div>
        <div class="label">${label}</div>
      </div>
    `;
  }).join('');

  function getTotalHeadshotsNumber() {
    if (life['Total Headshots'] != null) {
      return life['Total Headshots'];
    }
    if (life['Total Headshots %'] != null) {
      return life['Total Headshots %'];
    }
    return '-';
  }

  const otherKeys = [
    ['Total Headshots',                'Total Headshots'],
    ['Total Damage',                   'Total Damage'],
    ['ADR',                            'ADR'],
    ['Sniper Kill Rate',               'Sniper Kill Rate'],
    ['Sniper Kill Rate per Round',     'Sniper Kill Rate/Round'],
    ['Total Sniper Kills',             'Total Sniper Kills'],
    ['Total Utility Count',            'Total Utility Count'],
    ['Total Utility Damage',           'Total Utility Damage'],
    ['Total Utility Successes',        'Total Utility Successes'],
    ['Utility Usage per Round',        'Utility Usage/Round'],
    ['Utility Damage per Round',       'Utility Damage/Round'],
    ['Utility Success Rate',           'Utility Success Rate'],
    ['Total Flash Count',              'Total Flash Count'],
    ['Total Flash Successes',          'Total Flash Successes'],
    ['Enemies Flashed per Round',      'Enemies Flashed/Round'],
    ['Flash Success Rate',             'Flash Success Rate'],
    ['Total Enemies Flashed',          'Total Enemies Flashed'],
    ['1v1 Win Rate',                   '1v1 Win Rate'],
    ['1v2 Win Rate',                   '1v2 Win Rate'],
    ['Total 1v1 Count',                'Total 1v1 Count'],
    ['Total 1v1 Wins',                 'Total 1v1 Wins'],
    ['Total 1v2 Count',                'Total 1v2 Count'],
    ['Total 1v2 Wins',                 'Total 1v2 Wins'],
    ['Entry Success Rate',             'Entry Success Rate'],
    ['Total Entry Count',              'Total Entry Count'],
    ['Total Entry Wins',               'Total Entry Wins'],
    ['Current Win Streak',             'Current Win Streak'],
    ['Total Rounds with extended stats','Total Rounds ext. stats'],
    ['Total Kills with extended stats','Total Kills ext. stats']
  ];

  otherStats.innerHTML = otherKeys.map(([key, label]) => {
    let value = '-';
    if (key === 'Total Headshots') {
      value = getTotalHeadshotsNumber();
    } else {
      value = life[key] != null ? life[key] : '-';
    }
    return `
      <div class="card">
        <div class="value">${value}</div>
        <div class="label">${label}</div>
      </div>
    `;
  }).join('');
}

// --------------------------------------------------
// FUNCIONES PARA DIBUJAR EL CHART DE K/D
// --------------------------------------------------
function renderKdChart(segments) {
  console.log('Entrando en renderKdChart()', segments);

  const maps = (segments || [])
    .filter(s => s.type === 'Map')
    .map(m => ({
      name: m.label,
      kd: parseFloat(m.stats['Average K/D Ratio']) || 0
    }));

  if (!maps.length) {
    if (kdChart) {
      kdChart.destroy();
      kdChart = null;
    }
    return;
  }

  const labelsKd = maps.map(m => m.name);
  const dataKd   = maps.map(m => m.kd);
  const ctx2 = kdCanvas.getContext('2d');
  if (kdChart) kdChart.destroy();
  kdChart = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels: labelsKd,
      datasets: [{
        label: 'Avg K/D',
        data: dataKd,
        backgroundColor: '#ff6600'
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}
