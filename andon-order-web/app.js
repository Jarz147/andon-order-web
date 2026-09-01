/* =============================================================
   APP: Login + Monitor Andon + Matikan Andon via MQTT WebSocket
   ============================================================= */

(function () {
    'use strict';

    const C = ANDON_CONFIG;
    const LS_USER = 'andonOrder.user';
    const LS_TAKEN = 'andonOrder.taken';      // { key: {userId, at} }
    const LS_LOG   = 'andonOrder.log';        // array log order

    // ---------- Bangun daftar jalur ----------
    const lines = [];
    const lineLabels = {};
    const buildLines = () => {
        lines.length = 0;
        for (const dept of C.departments) {
            for (let n = 1; n <= C.lineCount; n++) {
                const key = `${n}:${dept}`;
                const label = (C.lineLabels && C.lineLabels[n]) || `LINE ${n}`;
                lineLabels[key] = label;
                lines.push({ n, dept, key, label });
            }
        }
    };
    buildLines();

    const statusTopic = (n, dept) => `b_${n}_${dept}`;
    const cmdTopic    = (n, dept) => `b_${n}_${dept}${C.cmdSuffix}`;

    // ---------- State ----------
    let state = {};        // key -> { on, takenBy, takenAt }
    let client = null;
    let currentUser = null;

    const $ = (id) => document.getElementById(id);

    // =========================================================
    // STORAGE helpers
    // =========================================================
    const load = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
    const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

    const logStore = () => load(LS_LOG, []);
    const pushLog = (entry) => {
        const list = logStore();
        list.unshift(entry);
        save(LS_LOG, list.slice(0, 100));
    };
    const takenStore = () => load(LS_TAKEN, {});
    const setTaken = (key, userId) => {
        const t = takenStore();
        t[key] = { userId, at: Date.now() };
        save(LS_TAKEN, t);
    };
    const clearTaken = (key) => {
        const t = takenStore();
        if (t[key]) { delete t[key]; save(LS_TAKEN, t); }
    };

    // =========================================================
    // LOGIN
    // =========================================================
    const initLogin = () => {
        const sel = $('login-user');
        sel.innerHTML = '';
        C.users.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.id} — ${u.name}`;
            sel.appendChild(opt);
        });
        $('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const id = sel.value;
            const pin = $('login-pin').value;
            const u = C.users.find(x => x.id === id && x.pin === pin);
            if (!u) { $('login-err').classList.remove('hidden'); return; }
            $('login-err').classList.add('hidden');
            doLogin(u);
        });
    };

    const doLogin = (u) => {
        currentUser = u;
        save(LS_USER, { id: u.id, name: u.name });
        $('user-chip').textContent = `${u.id} · ${u.name}`;
        showView('main');
        render();
        connectMqtt();
    };

    const doLogout = () => {
        localStorage.removeItem(LS_USER);
        currentUser = null;
        disconnectMqtt();
        showView('login');
        $('login-pin').value = '';
    };

    const tryRestore = () => {
        const saved = load(LS_USER, null);
        if (saved && C.users.find(x => x.id === saved.id)) {
            doLogin({ ...saved });
            return true;
        }
        return false;
    };

    const showView = (v) => {
        $('login-view').classList.toggle('hidden', v !== 'login');
        $('main-view').classList.toggle('hidden', v !== 'main');
    };

    // =========================================================
    // MQTT
    // =========================================================
    const setConn = (ok, text) => {
        const el = $('conn');
        el.className = 'badge ' + (ok ? 'badge-on' : 'badge-off');
        el.textContent = text || (ok ? 'TERHUBUNG' : 'TERPUTUS');
    };

    const connectMqtt = () => {
        if (!currentUser) return;
        setConn(false, 'MENGHUBUNGKAN…');
        const opts = { clientId: C.mqttClientId || ('andon-' + Math.random().toString(16).slice(2, 8)) };
        if (C.mqttUsername) { opts.username = C.mqttUsername; opts.password = C.mqttPassword; }

        try {
            client = mqtt.connect(C.mqttBrokerUrl, opts);
        } catch (e) {
            setConn(false, 'GAGAL TERHUBUNG');
            console.error(e);
            return;
        }

        client.on('connect', () => {
            setConn(true, 'TERHUBUNG');
            lines.forEach(l => client.subscribe(statusTopic(l.n, l.dept)));
        });
        client.on('message', (topic, payload) => handleMessage(topic, payload));
        client.on('close', () => setConn(false, 'TERPUTUS'));
        client.on('error', (e) => { setConn(false, 'ERROR'); console.error(e); });
        client.on('reconnect', () => setConn(false, 'MENYAMBUNG ULANG…'));
    };

    const disconnectMqtt = () => {
        if (client) { try { client.end(true); } catch {} client = null; }
        setConn(false, 'KONEKSI…');
    };

    const handleMessage = (topic, payload) => {
        const msg = payload.toString();
        const m = topic.match(/^b_(\d+)_(mtc|qc|mat)$/);
        if (!m) return; // abaikan topik command (echo)
        const key = `${m[1]}:${m[2]}`;
        const on = parseOn(msg);

        const st = state[key] || { on: false, takenBy: null, takenAt: null };
        if (on && !st.on) {
            // andon baru menyala -> orderan masuk, kosongkan penanda
            const t = takenStore()[key];
            st.on = true;
            st.takenBy = t ? t.userId : null;
            st.takenAt = t ? t.at : null;
        } else if (!on) {
            st.on = false;
            st.takenBy = null;
            st.takenAt = null;
            clearTaken(key);
        }
        state[key] = st;
        render();
    };

    const parseOn = (msg) => {
        const s = String(msg).trim().toLowerCase();
        if (s === 'open') return true;
        if (s === 'close') return false;
        try {
            const d = JSON.parse(s);
            if (d && typeof d === 'object' && 'data_payload' in d) return d.data_payload === 'open';
        } catch {}
        const v = s === 'true' ? true : Number(s);
        return v === true || v === 1 || v === '1';
    };

    // =========================================================
    // MATIKAN ANDON (publish MQTT + catat order)
    // =========================================================
    const turnOff = (l) => {
        if (!currentUser || !client || !client.connected) {
            alert('MQTT belum terhubung. Periksa koneksi broker.');
            return;
        }
        const payload = { action: 'off', user_id: currentUser.id };
        if (C.sendUserName) payload.user_name = currentUser.name;

        client.publish(cmdTopic(l.n, l.dept), JSON.stringify(payload));

        // tandai diambil oleh user ini
        state[l.key] = { ...state[l.key], on: true, takenBy: currentUser.id, takenAt: Date.now() };
        setTaken(l.key, currentUser.id);

        pushLog({
            line: l.label,
            dept: l.dept.toUpperCase(),
            key: l.key,
            userId: currentUser.id,
            userName: currentUser.name,
            at: Date.now(),
        });
        render();
    };

    // =========================================================
    // RENDER
    // =========================================================
    const render = () => {
        renderLines();
        renderStats();
        renderLog();
    };

    const renderLines = () => {
        const grid = $('lines-grid');
        grid.innerHTML = '';
        for (const l of lines) {
            const st = state[l.key] || { on: false, takenBy: null };
            const card = document.createElement('div');
            card.className = 'card' + (st.on ? ' active' : '');

            const deptColor = l.dept === 'mtc' ? '#a78bfa' : l.dept === 'qc' ? '#fbbf24' : '#f87171';

            let body;
            if (st.on) {
                const takenUser = st.takenBy ? C.users.find(u => u.id === st.takenBy) : null;
                if (st.takenBy && st.takenBy === currentUser.id) {
                    body = `<div class="taken">DIMATIKAN ✓ oleh Anda</div>`;
                } else if (st.takenBy && takenUser) {
                    body = `<div class="taken">Diambil oleh ${takenUser.name}</div>`;
                } else {
                    body = `<button class="btn-off" data-key="${l.key}">MATIKAN ANDON</button>`;
                }
            } else {
                body = `<div class="lamp">STANDBY</div>`;
            }

            card.innerHTML = `
                <div class="card-top">
                    <span class="card-name">${l.label}</span>
                    <span class="card-dept" style="color:${deptColor}">${l.dept.toUpperCase()}</span>
                </div>
                <div class="lamp ${st.on ? 'on' : ''}">${st.on ? 'ANDON AKTIF' : 'STANDBY'}</div>
                ${st.on && !st.takenBy ? `<div class="order-meta">Orderan masuk di <b>${l.label} ${l.dept.toUpperCase()}</b></div>` : ''}
                ${body}
            `;
            grid.appendChild(card);
        }

        grid.querySelectorAll('.btn-off').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.key;
                const l = lines.find(x => x.key === key);
                if (l) turnOff(l);
            });
        });
    };

    const renderStats = () => {
        const act = lines.filter(l => state[l.key] && state[l.key].on).length;
        $('stat-active').textContent = act;
        $('stat-total').textContent = lines.length;
        const mine = logStore().filter(e => e.userId === currentUser.id).length;
        $('stat-my').textContent = mine;
    };

    const renderLog = () => {
        const box = $('order-log');
        const list = logStore().filter(e => e.userId === currentUser.id);
        if (!list.length) {
            box.innerHTML = `<div class="log-empty">Belum ada order yang diambil.</div>`;
            return;
        }
        box.innerHTML = list.map(e => `
            <div class="log-item">
                <span><b>${e.line} ${e.dept}</b> — dimatikan oleh ${e.userName}</span>
                <span class="when">${new Date(e.at).toLocaleString('id-ID')}</span>
            </div>
        `).join('');
    };

    // =========================================================
    // CLOCK
    // =========================================================
    const updateClock = () => {
        const d = new Date();
        const p = (x) => String(x).padStart(2, '0');
        $('clock').textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    };

    // =========================================================
    // INIT
    // =========================================================
    document.addEventListener('DOMContentLoaded', () => {
        initLogin();
        $('btn-logout').addEventListener('click', doLogout);
        updateClock();
        setInterval(updateClock, 1000);
        if (!tryRestore()) showView('login');
    });
})();
