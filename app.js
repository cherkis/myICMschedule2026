// myICM 2026 — personal schedule app for ICM 2026 (Philadelphia, Jul 22–30).
// All user data lives in localStorage on this device and never leaves it.
// Times are always shown in Philadelphia time (America/New_York).

const STORAGE_KEYS = {
    SELECTED: 'myicm_selected',
    MANUAL: 'myicm_manual'
};

const TZ = 'America/New_York';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });           // 2026-07-24
const timeFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const tabFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', day: 'numeric' });
const longDayFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' });

const state = {
    data: null,          // {updated, categories, sessions}
    days: [],            // sorted unique 'YYYY-MM-DD' keys with sessions
    tab: 'all',          // 'all' or a day key
    category: 'all',     // 'all' or a category id
    calMonth: null,      // Date (first of displayed month)
    dayKey: null,        // day open in day view
    detailFrom: 'schedule',
    editingManualId: null
};

// ---------- helpers ----------

function dayKeyOf(iso) { return dayFmt.format(new Date(iso)); }
function timeOf(iso) { return timeFmt.format(new Date(iso)); }
// Minutes since midnight (Philadelphia) for sorting; manual events store 'HH:MM'.
function minutesOfIso(iso) {
    const [h, m] = clockFmt.format(new Date(iso)).split(':').map(Number);
    return h * 60 + m;
}
function minutesOfHHMM(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}
function timeOfHHMM(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}
function noonDate(key) { return new Date(key + 'T12:00:00-04:00'); }

function getStore(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch { return {}; }
}
function saveStore(key, obj) { localStorage.setItem(key, JSON.stringify(obj)); }
function getSelected() { return getStore(STORAGE_KEYS.SELECTED); }
function saveSelected(sel) { saveStore(STORAGE_KEYS.SELECTED, sel); }
function getManual() { return getStore(STORAGE_KEYS.MANUAL); }
function saveManual(man) { saveStore(STORAGE_KEYS.MANUAL, man); }

function speakerNames(sess) {
    return (sess.speakers || []).map(s => s.name).join(', ');
}
function categoryName(sess) {
    return (state.data && state.data.categories[sess.cat]) || '';
}

// ---------- data loading ----------

async function loadData() {
    let resp;
    try {
        resp = await fetch('data/sessions.json', { cache: 'no-cache' });
        if (!resp.ok) throw new Error(resp.status);
    } catch {
        try { resp = await fetch('data/sessions.json', { cache: 'force-cache' }); }
        catch { resp = null; }
    }
    if (resp && resp.ok) {
        state.data = await resp.json();
        state.days = [...new Set(state.data.sessions.map(s => dayKeyOf(s.start)))].sort();
    }
    renderTabs();
    renderCategoryFilter();
    renderSchedule();
    renderSnapshotNotes();
}

function renderSnapshotNotes() {
    const note = document.getElementById('snapshot-note');
    const helpNote = document.getElementById('help-snapshot-note');
    if (!state.data) { note.textContent = ''; helpNote.textContent = ''; return; }
    const d = new Date(state.data.updated).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    note.innerHTML = `Schedule snapshot from ${d} — always verify against the current schedule at ` +
        `<a href="https://www.icm2026.org" target="_blank" rel="noreferrer">icm2026.org</a>.`;
    helpNote.textContent = `Schedule data in this app was last updated on ${d}.`;
}

// ---------- schedule (catalog) view ----------

function renderTabs() {
    const wrap = document.getElementById('date-tabs');
    wrap.innerHTML = '';
    if (!state.data) return;
    const mkTab = (key, label) => {
        const b = document.createElement('button');
        b.className = 'date-tab' + (state.tab === key ? ' active' : '');
        b.textContent = label;
        b.addEventListener('click', () => { state.tab = key; renderTabs(); renderSchedule(); });
        wrap.appendChild(b);
    };
    mkTab('all', 'All dates');
    state.days.forEach(k => mkTab(k, tabFmt.format(noonDate(k))));
}

function renderCategoryFilter() {
    const sel = document.getElementById('category-filter');
    while (sel.options.length > 1) sel.remove(1);
    if (!state.data) return;
    Object.entries(state.data.categories)
        .filter(([, name]) => name)
        .sort((a, b) => a[1].localeCompare(b[1]))
        .forEach(([id, name]) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = name;
            sel.appendChild(opt);
        });
    sel.value = state.category;
}

function renderSchedule() {
    const list = document.getElementById('schedule-list');
    list.innerHTML = '';
    if (!state.data) {
        list.innerHTML = '<p class="empty-note">Could not load the schedule. Check your connection and reload.</p>';
        return;
    }
    const selected = getSelected();
    const sessions = state.data.sessions.filter(s =>
        (state.tab === 'all' || dayKeyOf(s.start) === state.tab) &&
        (state.category === 'all' || s.cat === state.category));
    let lastDay = null;
    sessions.forEach(sess => {
        if (state.tab === 'all') {
            const day = dayKeyOf(sess.start);
            if (day !== lastDay) {
                lastDay = day;
                const h = document.createElement('div');
                h.className = 'day-header';
                h.textContent = longDayFmt.format(new Date(sess.start));
                list.appendChild(h);
            }
        }
        list.appendChild(sessionRow(sess, selected));
    });
    if (!sessions.length) list.innerHTML = '<p class="empty-note">No events match this day and category.</p>';
}

function sessionRow(sess, selected) {
    const row = document.createElement('div');
    row.className = 'session-row';

    const time = document.createElement('div');
    time.className = 'session-time';
    time.textContent = timeOf(sess.start);

    const main = document.createElement('div');
    main.className = 'session-main';
    const title = document.createElement('div');
    title.className = 'session-title';
    title.textContent = sess.title;
    const meta = document.createElement('div');
    meta.className = 'session-meta';
    meta.textContent = [speakerNames(sess), sess.room].filter(Boolean).join(' · ');
    main.appendChild(title);
    if (meta.textContent) main.appendChild(meta);

    const btn = document.createElement('button');
    btn.className = 'select-button' + (selected[sess.id] ? ' selected' : '');
    btn.textContent = selected[sess.id] ? '✓' : '+';
    btn.title = selected[sess.id] ? 'Remove from my calendar' : 'Add to my calendar';
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSelect(sess);
        const sel = getSelected();
        btn.classList.toggle('selected', !!sel[sess.id]);
        btn.textContent = sel[sess.id] ? '✓' : '+';
        btn.title = sel[sess.id] ? 'Remove from my calendar' : 'Add to my calendar';
    });

    row.appendChild(time);
    row.appendChild(main);
    row.appendChild(btn);
    row.addEventListener('click', () => showDetail(sess, 'schedule'));
    return row;
}

function toggleSelect(sess) {
    const sel = getSelected();
    if (sel[sess.id]) {
        delete sel[sess.id];
    } else {
        // Full copy so selected events stay available offline / if the
        // schedule snapshot changes.
        sel[sess.id] = { ...sess, highlighted: false, selectedAt: new Date().toISOString() };
    }
    saveSelected(sel);
}

function toggleHighlightSelected(id) {
    const sel = getSelected();
    if (sel[id]) {
        sel[id].highlighted = !sel[id].highlighted;
        saveSelected(sel);
    }
}

// ---------- detail view ----------

function showDetail(sess, from) {
    state.detailFrom = from;
    const c = document.getElementById('detail-content');
    c.innerHTML = '';

    const cat = categoryName(sess);
    if (cat) {
        const tag = document.createElement('span');
        tag.className = 'category-tag';
        tag.textContent = cat;
        c.appendChild(tag);
    }

    const h = document.createElement('h2');
    h.textContent = sess.title;
    c.appendChild(h);

    const when = document.createElement('p');
    when.className = 'detail-info';
    when.textContent = `${longDayFmt.format(new Date(sess.start))} · ${timeOf(sess.start)} – ${timeOf(sess.end)} (Philadelphia)`;
    c.appendChild(when);

    if (sess.room) {
        const room = document.createElement('p');
        room.className = 'detail-info';
        room.textContent = `Room: ${sess.room}`;
        c.appendChild(room);
    }

    if (sess.speakers && sess.speakers.length) {
        const wrap = document.createElement('div');
        wrap.className = 'detail-speakers';
        sess.speakers.forEach(sp => {
            const p = document.createElement('p');
            p.className = 'detail-speaker';
            p.textContent = sp.name;
            if (sp.aff) {
                const aff = document.createElement('span');
                aff.className = 'aff';
                aff.textContent = ` — ${sp.aff}`;
                p.appendChild(aff);
            }
            wrap.appendChild(p);
        });
        c.appendChild(wrap);
    }

    const actions = document.createElement('div');
    actions.className = 'detail-actions';
    const selectBtn = document.createElement('button');
    const starBtn = document.createElement('button');
    const renderButtons = () => {
        const entry = getSelected()[sess.id];
        selectBtn.className = 'action-button' + (entry ? '' : ' primary');
        selectBtn.textContent = entry ? 'Remove from my calendar' : 'Add to my calendar';
        starBtn.hidden = !entry;
        starBtn.className = 'action-button' + (entry && entry.highlighted ? ' highlighted' : '');
        starBtn.textContent = entry && entry.highlighted ? '★ Highlighted' : '☆ Highlight';
    };
    selectBtn.addEventListener('click', () => { toggleSelect(sess); renderButtons(); });
    starBtn.addEventListener('click', () => { toggleHighlightSelected(sess.id); renderButtons(); });
    renderButtons();
    actions.appendChild(selectBtn);
    actions.appendChild(starBtn);
    c.appendChild(actions);

    if (sess.abstract) {
        const abs = document.createElement('div');
        abs.className = 'detail-abstract';
        abs.textContent = sess.abstract;
        c.appendChild(abs);
    }

    showView('detail');
}

// ---------- calendar view ----------

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('cal-title');
    grid.innerHTML = '';
    const y = state.calMonth.getFullYear();
    const m = state.calMonth.getMonth();
    title.textContent = state.calMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const daysWithEvents = new Set(Object.values(getSelected()).map(s => dayKeyOf(s.start)));
    Object.values(getManual()).forEach(ev => daysWithEvents.add(ev.date));
    const todayKey = dayFmt.format(new Date());

    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (let i = 0; i < firstDow; i++) {
        const cell = document.createElement('div');
        cell.className = 'day-cell empty';
        grid.appendChild(cell);
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const cell = document.createElement('button');
        cell.className = 'day-cell'
            + (key === todayKey ? ' today' : '')
            + (daysWithEvents.has(key) ? ' has-events' : '');
        cell.textContent = d;
        cell.addEventListener('click', () => openDay(key));
        grid.appendChild(cell);
    }
}

function changeMonth(delta) {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + delta, 1);
    renderCalendar();
}

function goToToday() {
    const now = new Date();
    state.calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    renderCalendar();
}

// ---------- day view ----------

function dayEntries(key) {
    const icm = Object.values(getSelected())
        .filter(s => dayKeyOf(s.start) === key)
        .map(s => ({ kind: 'icm', min: minutesOfIso(s.start), time: timeOf(s.start), data: s }));
    const manual = Object.values(getManual())
        .filter(ev => ev.date === key)
        .map(ev => ({ kind: 'manual', min: minutesOfHHMM(ev.time), time: timeOfHHMM(ev.time), data: ev }));
    return [...icm, ...manual].sort((a, b) => a.min - b.min || a.data.title.localeCompare(b.data.title));
}

function openDay(key) {
    state.dayKey = key;
    hideManualForm();
    document.getElementById('day-title').textContent = longDayFmt.format(noonDate(key));
    renderDayList();
    showView('day');
}

function renderDayList() {
    const list = document.getElementById('day-list');
    list.innerHTML = '';
    const entries = dayEntries(state.dayKey);
    if (!entries.length) {
        list.innerHTML = '<p class="empty-note">No events for this day yet.<br>' +
            'Pick talks in the Schedule tab or add your own below.</p>';
        return;
    }
    entries.forEach(entry => {
        const ev = entry.data;
        const row = document.createElement('div');
        row.className = 'day-row' + (ev.highlighted ? ' highlighted' : '');

        const time = document.createElement('div');
        time.className = 'day-row-time';
        time.textContent = entry.time;

        const main = document.createElement('div');
        main.className = 'day-row-main';
        const t = document.createElement('div');
        t.className = 'day-row-title';
        t.textContent = ev.title;
        main.appendChild(t);
        const metaText = entry.kind === 'icm'
            ? [ev.room, speakerNames(ev)].filter(Boolean).join(' · ')
            : 'my event';
        if (metaText) {
            const meta = document.createElement('div');
            meta.className = 'day-row-meta';
            meta.textContent = metaText;
            main.appendChild(meta);
        }

        const star = document.createElement('button');
        star.className = 'star-button' + (ev.highlighted ? ' on' : '');
        star.textContent = ev.highlighted ? '★' : '☆';
        star.title = ev.highlighted ? 'Remove highlight' : 'Highlight this event';
        star.addEventListener('click', (e) => {
            e.stopPropagation();
            if (entry.kind === 'icm') toggleHighlightSelected(ev.id);
            else {
                const man = getManual();
                if (man[ev.id]) { man[ev.id].highlighted = !man[ev.id].highlighted; saveManual(man); }
            }
            renderDayList();
        });

        row.appendChild(time);
        row.appendChild(main);
        row.appendChild(star);
        row.addEventListener('click', () => {
            if (entry.kind === 'icm') showDetail(ev, 'day');
            else showManualForm(ev);
        });
        list.appendChild(row);
    });
}

// ---------- manual events ----------

function showManualForm(ev) {
    state.editingManualId = ev ? ev.id : null;
    document.getElementById('manual-form-title').textContent = ev ? 'Edit event' : 'Add event';
    document.getElementById('manual-time').value = ev ? ev.time : '12:00';
    document.getElementById('manual-title').value = ev ? ev.title : '';
    document.getElementById('manual-delete').hidden = !ev;
    document.getElementById('manual-form').hidden = false;
    document.getElementById('add-manual').hidden = true;
    document.getElementById('manual-title').focus();
}

function hideManualForm() {
    document.getElementById('manual-form').hidden = true;
    document.getElementById('add-manual').hidden = false;
    state.editingManualId = null;
}

function saveManualForm(e) {
    e.preventDefault();
    const time = document.getElementById('manual-time').value;
    const title = document.getElementById('manual-title').value.trim();
    if (!time || !title || !state.dayKey) return;
    const man = getManual();
    if (state.editingManualId && man[state.editingManualId]) {
        man[state.editingManualId].time = time;
        man[state.editingManualId].title = title;
    } else {
        const id = 'man_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        man[id] = { id, date: state.dayKey, time, title, highlighted: false, createdAt: new Date().toISOString() };
    }
    saveManual(man);
    hideManualForm();
    renderDayList();
}

function deleteManualEvent() {
    const man = getManual();
    if (state.editingManualId && man[state.editingManualId]) {
        delete man[state.editingManualId];
        saveManual(man);
    }
    hideManualForm();
    renderDayList();
}

// ---------- view switching ----------

function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`${name}-view`).classList.add('active');
    const scheduleActive = name === 'schedule' || (name === 'detail' && state.detailFrom === 'schedule');
    const calendarActive = ['calendar', 'day'].includes(name) || (name === 'detail' && state.detailFrom === 'day');
    document.getElementById('nav-schedule').classList.toggle('active', scheduleActive);
    document.getElementById('nav-calendar').classList.toggle('active', calendarActive);
    document.getElementById('nav-help').classList.toggle('active', name === 'help');
    if (name === 'schedule') renderSchedule();
    if (name === 'calendar') renderCalendar();
    window.scrollTo(0, 0);
}

// ---------- init ----------

function initCalMonth() {
    // Open on the current month if we're near/at the congress, else July 2026.
    const now = new Date();
    state.calMonth = (now.getFullYear() === 2026 && [6, 7].includes(now.getMonth()))
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : new Date(2026, 6, 1);
}

document.getElementById('nav-schedule').addEventListener('click', () => showView('schedule'));
document.getElementById('nav-calendar').addEventListener('click', () => showView('calendar'));
document.getElementById('nav-help').addEventListener('click', () => showView('help'));
document.getElementById('cal-prev').addEventListener('click', () => changeMonth(-1));
document.getElementById('cal-next').addEventListener('click', () => changeMonth(1));
document.getElementById('cal-today').addEventListener('click', goToToday);
document.getElementById('day-back').addEventListener('click', () => showView('calendar'));
document.getElementById('detail-back').addEventListener('click', () => {
    if (state.detailFrom === 'day' && state.dayKey) openDay(state.dayKey);
    else showView('schedule');
});
document.getElementById('category-filter').addEventListener('change', (e) => {
    state.category = e.target.value;
    renderSchedule();
});
document.getElementById('add-manual').addEventListener('click', () => showManualForm(null));
document.getElementById('manual-form').addEventListener('submit', saveManualForm);
document.getElementById('manual-cancel').addEventListener('click', hideManualForm);
document.getElementById('manual-delete').addEventListener('click', deleteManualEvent);

initCalMonth();
loadData();
