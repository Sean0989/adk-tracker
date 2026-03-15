// ── ADK 46 Sync — GitHub Gist backend ────────────────────────────────────────
// Each page calls: syncInit({ getState, setState })
//   getState() → { winter, summer, mode }
//   setState(data) → load that data and re-render (should also call saveState locally)

const _SYNC_CFG_KEY = 'adk46_sync_v1';

let _pat = '', _gistId = '', _lastSync = null;
let _callbacks = null;
let _syncing = false; // prevent push-during-pull loops

// ── Init ─────────────────────────────────────────────────────────────────────

function syncInit(callbacks) {
  _callbacks = callbacks;
  try {
    const cfg = JSON.parse(localStorage.getItem(_SYNC_CFG_KEY) || 'null');
    if (cfg) { _pat = cfg.pat || ''; _gistId = cfg.gist || ''; _lastSync = cfg.lastSync || null; }
  } catch(e) {}
  _injectModal();
  _updateBtn();
  if (_pat && _gistId) {
    syncPull();
  }
}

function _saveCfg() {
  localStorage.setItem(_SYNC_CFG_KEY, JSON.stringify({ pat: _pat, gist: _gistId, lastSync: _lastSync }));
}

// ── API calls ────────────────────────────────────────────────────────────────

async function syncPush() {
  if (_syncing || !_pat || !_gistId || !_callbacks) return;
  try {
    const r = await fetch(`https://api.github.com/gists/${_gistId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `token ${_pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: { 'adk46_data.json': { content: JSON.stringify(_callbacks.getState()) } }
      })
    });
    if (r.ok) { _lastSync = new Date().toISOString(); _saveCfg(); _updateBtn(); }
  } catch(e) {}
}

async function syncPull() {
  if (!_pat || !_gistId || !_callbacks) return false;
  try {
    const r = await fetch(`https://api.github.com/gists/${_gistId}`, {
      headers: { 'Authorization': `token ${_pat}` }
    });
    if (!r.ok) return false;
    const data = await r.json();
    const content = data.files?.['adk46_data.json']?.content;
    if (!content) return false;
    _syncing = true;
    _callbacks.setState(JSON.parse(content));
    _syncing = false;
    _lastSync = new Date().toISOString();
    _saveCfg();
    _updateBtn();
    return true;
  } catch(e) { _syncing = false; return false; }
}

async function _createGist(pat) {
  const r = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: { 'Authorization': `token ${pat}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: 'ADK 46 Tracker — sync data',
      public: false,
      files: { 'adk46_data.json': { content: JSON.stringify(_callbacks.getState()) } }
    })
  });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || `HTTP ${r.status}`); }
  return (await r.json()).id;
}

async function _verifyGist(pat, gistId) {
  const r = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { 'Authorization': `token ${pat}` }
  });
  if (!r.ok) throw new Error('Sync code not found or token invalid.');
  const data = await r.json();
  const content = data.files?.['adk46_data.json']?.content;
  if (!content) throw new Error('Sync slot found but contains no tracker data.');
  return JSON.parse(content);
}

// ── Modal actions (called from inline onclick) ────────────────────────────────

async function _syncCreate() {
  const pat = document.getElementById('_syncPATInput').value.trim();
  if (!pat) return _syncShowErr('Enter your GitHub token first.');
  _syncSetBtn('_syncCreateBtn', 'Creating…');
  try {
    const id = await _createGist(pat);
    _pat = pat; _gistId = id; _lastSync = new Date().toISOString();
    _saveCfg();
    _renderModal();
    _updateBtn();
  } catch(e) { _syncShowErr('GitHub error: ' + e.message); _syncSetBtn('_syncCreateBtn', 'Create New Sync'); }
}

async function _syncLink() {
  const pat  = document.getElementById('_syncPATInput').value.trim();
  const code = document.getElementById('_syncCodeInput').value.trim();
  if (!pat)  return _syncShowErr('Enter your GitHub token first.');
  if (!code) return _syncShowErr('Enter the sync code from your other device.');
  _syncSetBtn('_syncLinkBtn', 'Linking…');
  try {
    const remoteState = await _verifyGist(pat, code);
    _pat = pat; _gistId = code;
    _syncing = true;
    _callbacks.setState(remoteState);
    _syncing = false;
    _lastSync = new Date().toISOString();
    _saveCfg();
    _renderModal();
    _updateBtn();
  } catch(e) { _syncShowErr(e.message); _syncSetBtn('_syncLinkBtn', 'Link Existing Code'); }
}

async function _syncNow() {
  _syncSetBtn('_syncNowBtn', 'Syncing…');
  const ok = await syncPull();
  if (ok) await syncPush();
  _renderModal();
}

function _syncDisconnect() {
  if (!confirm('Disconnect sync? Your local data will be kept.')) return;
  _pat = ''; _gistId = ''; _lastSync = null;
  localStorage.removeItem(_SYNC_CFG_KEY);
  _renderModal();
  _updateBtn();
}

async function _syncCopyCode() {
  await navigator.clipboard.writeText(_gistId);
  const btn = document.getElementById('_syncCopyBtn');
  if (btn) { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1800); }
}

function openSyncModal()  { _renderModal(); document.getElementById('_syncModal').classList.add('open'); }
function closeSyncModal() { document.getElementById('_syncModal').classList.remove('open'); }

// ── Modal rendering ──────────────────────────────────────────────────────────

function _renderModal() {
  const body = document.getElementById('_syncModalBody');
  if (_pat && _gistId) {
    const ago = _lastSync ? _timeSince(_lastSync) : 'never';
    body.innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:5px;letter-spacing:.05em">SYNC CODE — paste this on your other device</div>
        <div style="display:flex;gap:8px;align-items:center">
          <code style="flex:1;background:var(--bg);padding:7px 10px;border-radius:5px;font-size:0.78rem;color:var(--snow);word-break:break-all;border:1px solid var(--card-border);user-select:all">${_gistId}</code>
          <button id="_syncCopyBtn" class="btn btn-ghost" style="flex-shrink:0" onclick="_syncCopyCode()">Copy</button>
        </div>
      </div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:18px">Last synced: <b style="color:var(--text)">${ago}</b></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="_syncNowBtn" class="btn btn-confirm" onclick="_syncNow()">Sync Now</button>
        <button class="btn btn-ghost" onclick="closeSyncModal()">Close</button>
        <button class="btn btn-danger" onclick="_syncDisconnect()">Disconnect</button>
      </div>`;
  } else {
    body.innerHTML = `
      <div style="margin-bottom:12px">
        <label style="font-size:0.7rem;color:var(--text-muted);display:block;margin-bottom:5px;letter-spacing:.05em">GITHUB PERSONAL ACCESS TOKEN</label>
        <input id="_syncPATInput" type="password" placeholder="ghp_xxxxxxxxxxxx"
          style="width:100%;padding:8px 10px;background:var(--input-bg,#070d18);border:1px solid var(--card-border);border-radius:6px;color:var(--text);font-size:0.85rem;outline:none">
        <div style="font-size:0.67rem;color:var(--text-muted);margin-top:5px;line-height:1.5">
          GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) →
          New token → check <b style="color:var(--text)">gist</b> only
        </div>
      </div>
      <div id="_syncErr" style="display:none;color:#f0b429;font-size:0.72rem;margin-bottom:10px;padding:6px 9px;background:rgba(240,180,41,0.08);border:1px solid rgba(240,180,41,0.25);border-radius:5px"></div>
      <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <button id="_syncCreateBtn" class="btn btn-confirm" onclick="_syncCreate()">Create New Sync</button>
      </div>
      <div style="border-top:1px solid var(--card-border);padding-top:14px">
        <label style="font-size:0.7rem;color:var(--text-muted);display:block;margin-bottom:5px;letter-spacing:.05em">ALREADY HAVE A SYNC CODE?</label>
        <input id="_syncCodeInput" type="text" placeholder="Paste sync code from other device"
          style="width:100%;padding:8px 10px;background:var(--input-bg,#070d18);border:1px solid var(--card-border);border-radius:6px;color:var(--text);font-size:0.85rem;outline:none;margin-bottom:8px">
        <button id="_syncLinkBtn" class="btn btn-ghost" onclick="_syncLink()">Link Existing Code</button>
      </div>`;
  }
}

function _syncShowErr(msg) {
  const el = document.getElementById('_syncErr');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function _syncSetBtn(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ── Header button status dot ──────────────────────────────────────────────────

function _updateBtn() {
  const btn = document.getElementById('_syncHeaderBtn');
  if (!btn) return;
  btn.textContent = (_pat && _gistId) ? '⟳ Synced' : '⟳ Sync';
}

// ── Inject HTML ───────────────────────────────────────────────────────────────

function _injectModal() {
  const el = document.createElement('div');
  el.innerHTML = `
    <div class="modal-overlay" id="_syncModal" onclick="if(event.target===this)closeSyncModal()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:400;align-items:center;justify-content:center">
      <div class="modal" style="width:400px;max-width:94vw;background:var(--card-bg);border:1px solid var(--card-border);border-radius:12px;padding:22px 24px">
        <h3 style="font-size:1rem;color:var(--snow);margin-bottom:3px">Cross-Device Sync</h3>
        <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:16px">Stores your data in a private GitHub Gist</div>
        <div id="_syncModalBody"></div>
      </div>
    </div>`;
  document.body.appendChild(el.firstElementChild);
  // Override display for open class
  const style = document.createElement('style');
  style.textContent = `#_syncModal.open { display: flex !important; }`;
  document.head.appendChild(style);
}

// ── Utilities ────────────────────────────────────────────────────────────────

function _timeSince(iso) {
  const s = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (s < 60)  return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h/24)}d ago`;
}
