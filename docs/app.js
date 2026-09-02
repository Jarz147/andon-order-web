/* =============================================================
   APP: Login (Supabase) + Monitor Andon (Realtime) + Matikan Andon
   Browser TIDAK terhubung MQTT langsung.
   - Status andon dibaca dari tabel andon_status via Supabase Realtime
   - Perintah "Matikan Andon" lewat Edge Function andon-publish
     -> tunnel -> Node-RED -> MQTT (user_id dikirim di payload)
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

    let state = {};         // key -> { on, takenBy }
    let currentUser = null; // { id, email, name, role }
    let channel = null;

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
        subscribeStatus();
    };

    const doLogout = async () => {
        await supabase.auth.signOut();
        if (channel) { try { supabase.removeChannel(channel); } catch {} channel = null; }
        currentUser = null;
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
    // STATUS via Supabase Realtime
    // =========================================================
    const applyStatus = (row) => {
        if (!row || !row.key) return;
        state[row.key] = { ...(state[row.key] || {}), on: !!row.is_on, line: row.line, dept: row.dept };
        render();
    };

    const loadStatus = async () => {
        const { data } = await supabase.from('andon_status').select('*');
        (data || []).forEach(applyStatus);
    };

    const subscribeStatus = () => {
        loadStatus();
        channel = supabase
            .channel('andon-status-realtime')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'andon_status' },
                (payload) => {
                    if (payload.new) applyStatus(payload.new);
                })
            .subscribe();
    };

    // =========================================================
    // MATIKAN ANDON (via Edge Function andon-publish)
    // =========================================================
    const turnOff = async (l) => {
        if (!currentUser) return;
        const { data, error } = await supabase.functions.invoke(C.fnPublish, {
            body: { no: l.n, dept: l.dept },
        });
        if (error) {
            alert('Gagal mengirim perintah: ' + (error.message || ''));
            return;
        }
        // optimis: tandai diambil & mati, Realtime akan menyesuaikan
        state[l.key] = { ...state[l.key], on: false, takenBy: currentUser.id };
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
                body = `<button class="btn-off" data-key="${l.key}">MATIKAN ANDON</button>`;
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
