const statusPill = document.getElementById('status-pill');
const qrSection = document.getElementById('qr-section');
const qrImg = document.getElementById('qr-img');
const groupsList = document.getElementById('groups-list');
const keywordsList = document.getElementById('keywords-list');

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  return res.json();
}

async function refreshStatus() {
  const { status, connectedAs } = await api('/api/status');
  statusPill.className = `pill ${status}`;
  statusPill.textContent =
    status === 'connected' ? `connected (${connectedAs?.split(':')[0] || 'unknown'})` : status;

  if (status === 'qr') {
    qrSection.classList.remove('hidden');
    const { qr } = await api('/api/qr');
    if (qr) qrImg.src = qr;
  } else {
    qrSection.classList.add('hidden');
  }
}

async function refreshGroups() {
  const groups = await api('/api/groups');
  groupsList.innerHTML = '';
  if (groups.length === 0) {
    groupsList.innerHTML = '<p class="hint">No groups seen yet.</p>';
    return;
  }
  for (const g of groups) {
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML = `
      <span>${g.name}</span>
      <input type="checkbox" ${g.enabled ? 'checked' : ''} data-jid="${g.jid}" />
    `;
    el.querySelector('input').addEventListener('change', async (e) => {
      await api(`/api/groups/${encodeURIComponent(g.jid)}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled: e.target.checked }),
      });
    });
    groupsList.appendChild(el);
  }
}

async function refreshKeywords() {
  const keywords = await api('/api/keywords');
  keywordsList.innerHTML = '';
  for (const k of keywords) {
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML = `<span>${k.pattern}</span><button class="remove">remove</button>`;
    el.querySelector('button').addEventListener('click', async () => {
      await api(`/api/keywords/${k.id}`, { method: 'DELETE' });
      refreshKeywords();
    });
    keywordsList.appendChild(el);
  }
}

document.getElementById('add-keyword-btn').addEventListener('click', async () => {
  const input = document.getElementById('keyword-input');
  if (!input.value.trim()) return;
  await api('/api/keywords', { method: 'POST', body: JSON.stringify({ pattern: input.value }) });
  input.value = '';
  refreshKeywords();
});

document.getElementById('save-settings-btn').addEventListener('click', async () => {
  const minTextLength = document.getElementById('min-text-length').value;
  const maxMediaMb = document.getElementById('max-media-mb').value;
  await api('/api/settings', { method: 'POST', body: JSON.stringify({ minTextLength, maxMediaMb }) });
});

async function loadSettings() {
  const s = await api('/api/settings');
  document.getElementById('min-text-length').value = s.minTextLength;
  document.getElementById('max-media-mb').value = s.maxMediaMb;
}

async function tick() {
  await refreshStatus();
  await refreshGroups();
}

loadSettings();
refreshKeywords();
tick();
setInterval(tick, 4000);
