/* =============================================================
   APP: Login (Supabase) + Monitor Andon + Matikan Andon (MQTT WS)
   ============================================================= */

(function () {
    'use strict';

    const C = ANDON_CONFIG;
    const supabase = window.supabase.createClient(C.supabaseUrl, C.supabaseAnonKey);

    // ---------- Bangun daftar jalur ----------
    const lines = [];
    const lineLabels = {};
    for (const dept of C.departments) {
        for (let n = 1; n <= C.lineCount; n++) {
            const key = `${n}:${dept}`;
            lineLabels[key] = (C.lineLabels && C.lineLabels[n]) || `LINE ${n}`;
            lines.push({ n, dept, key, label: lineLabels[key] });
        }
    }

    const statusTopic = (n, dept) => `b_${n}_${dept}`;
    const cmdTopic    = (n, dept) => `b_${n}_${dept}${C.cmdSuffix}`;

    // ---------- State ----------
    let state = {};        // key -> { on, takenBy, takenAt }
    let client = null;     // mqtt
    let currentUser = null; // { id, email, name, role }

    const $ = (id) => document.getElementById(id);

    // =========================================================
    // AUTH (Supabase)
    // =========================================================
    let isRegisterMode = false;

    const setAuthMode = (reg) => {
        isRegisterMode = reg;
        $('auth-submit').textContent = reg ? 'Daftar' : 'Masuk';
        $('auth-toggle').textContent = reg ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar';
        $('auth-err').classList.add('hidden');
    };

    const loadProfile = async (user) => {
        const { data } = await supabase
            .from('profiles')
            .select('id, name, role')
            .eq('id', user.id)
            .maybeSingle();
        if (data) return { id: user.id, email: user.email, name: data.name, role: data.role };
        // buat profil default bila belum ada
        const name = (user.email || 'user').split('@')[0];
        await supabase.from('profiles').insert({ id: user.id, name, role: C.defaultRole });
        return { id: user.id, email: user.email, name, role: C.defaultRole };
    };

    const doLogin = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = await loadProfile(data.user);
        enterApp();
    };

    const doRegister = async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user && data.user.identities && data.user.identities.length === 0) {
            throw new Error('Pendaftaran perlu konfirmasi email. Cek inbox Anda.');
        }
        await doLogin(email, password);
    };

    const submitAuth = async () => {
        const email = $('a-email').value.trim();
        const pass = $('a-pass').value;
        $('auth-err').classList.add('hidden');
        try {
            if (isRegisterMode) await doRegister(email, pass);
            else await doLogin(email, pass);
        } catch (e) {
            $('auth-err').textContent = e.message || 'Gagal masuk.';
            $('auth-err').classList.remove('hidden');
        }
    };

    const enterApp = () => {
        $('user-chip').textContent = currentUser.name;
        $('user-role').textContent = (currentUser.role || '').toUpperCase();
        showView('main');
        render();
        renderLog();
        connectMqtt();
    };

    const doLogout = async () => {
        await supabase.auth.signOut();
        currentUser = null;
        disconnectMqtt();
        showView('login');
        $('a-pass').value = '';
        setAuthMode(false);
    };

    const tryRestore = async () => {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return false;
        currentUser = await loadProfile(data.user);
        enterApp();
        return true;
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
        const opts = { clientId: 'andon-' + Math.random().toString(16).slice(2, 8) };
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
        if (!m) return;
        const key = `${m[1]}:${m[2]}`;
        const st = state[key] || { on: false, takenBy: null, takenAt: null };
        const on = parseOn(msg);
        if (on && !st.on) {
            st.on = true;
            st.takenBy = null;
            st.takenAt = null;
        } else if (!on) {
            st.on = false;
            st.takenBy = null;
            st.takenAt = null;
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
    // MATIKAN ANDON (publish MQTT + catat order di Supabase)
    // =========================================================
    const turnOff = async (l) => {
        if (!currentUser || !client || !client.connected) {
            alert('MQTT belum terhubung. Periksa koneksi broker.');
            return;
        }
        const payload = { action: 'off', user_id: currentUser.id, user_email: currentUser.email };
        if (C.sendUserName) payload.user_name = currentUser.name;

        client.publish(cmdTopic(l.n, l.dept), JSON.stringify(payload));

        state[l.key] = { ...state[l.key], on: true, takenBy: currentUser.id, takenAt: Date.now() };

        await supabase.from('andon_orders').insert({
            user_id: currentUser.id,
            user_email: currentUser.email,
            user_name: currentUser.name,
            line: l.label,
            dept: l.dept.toUpperCase(),
        });

        render();
        renderLog();
    };

    // =========================================================
    // ORDER LOG (Supabase)
    // =========================================================
    const renderLog = async () => {
        const box = $('order-log');
        const { data, error } = await supabase
            .from('andon_orders')
            .select('id, line, dept, user_name, created_at')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) { box.innerHTML = `<div class="log-empty">Gagal memuat riwayat.</div>`; return; }
        if (!data.length) { box.innerHTML = `<div class="log-empty">Belum ada order yang diambil.</div>`; return; }
        box.innerHTML = data.map(e => `
            <div class="log-item">
                <span><b>${e.line} ${e.dept}</b> — dimatikan oleh ${e.user_name}</span>
                <span class="when">${new Date(e.created_at).toLocaleString('id-ID')}</span>
            </div>
        `).join('');
    };

    // =========================================================
    // RENDER
    // =========================================================
    const render = () => {
        renderLines();
        renderStats();
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
                if (st.takenBy && st.takenBy === currentUser.id) {
                    body = `<div class="taken">DIMATIKAN ✓ oleh Anda</div>`;
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
                ${st.on ? `<div class="order-meta">Orderan masuk di <b>${l.label} ${l.dept.toUpperCase()}</b></div>` : ''}
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
        $('auth-form').addEventListener('submit', (e) => { e.preventDefault(); submitAuth(); });
        $('auth-toggle').addEventListener('click', () => setAuthMode(!isRegisterMode));
        $('btn-logout').addEventListener('click', doLogout);
        updateClock();
        setInterval(updateClock, 1000);
        tryRestore().then(restored => {
            if (!restored) showView('login');
        });
    });
})();
