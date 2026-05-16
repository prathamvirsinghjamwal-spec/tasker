// Tasker — task tracker PWA
'use strict';

const STORAGE_KEY = 'tasker.tasks.v1';
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let tasks = loadTasks();
let currentFilter = 'all';
let editingId = null;
let selectedPriority = 'medium';
const firedReminders = new Set();

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveTasks() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
  catch (e) { console.warn('Save failed', e); }
}

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function setGreeting() {
  const h = new Date().getHours();
  const time =
    h < 5  ? 'Good night'   :
    h < 12 ? 'Good morning' :
    h < 17 ? 'Good afternoon' :
    h < 21 ? 'Good evening' :
             'Good night';
  $('#greetingTime').textContent = time;
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  $('#greetingDate').textContent = new Date().toLocaleDateString(undefined, opts);
}

function render() {
  const list = $('#taskList');
  const empty = $('#emptyState');
  list.innerHTML = '';

  const filtered = tasks.filter(t => {
    if (currentFilter === 'pending') return !t.done;
    if (currentFilter === 'done')    return t.done;
    return true;
  });

  filtered.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ta = a.reminder ? new Date(a.reminder).getTime() : Infinity;
    const tb = b.reminder ? new Date(b.reminder).getTime() : Infinity;
    return ta - tb;
  });

  if (filtered.length === 0) {
    empty.classList.add('visible');
  } else {
    empty.classList.remove('visible');
    filtered.forEach((task, idx) => {
      const card = buildCard(task);
      card.style.animationDelay = Math.min(idx * 40, 240) + 'ms';
      list.appendChild(card);
    });
  }

  updateStats();
}

function buildCard(task) {
  const card = document.createElement('article');
  card.className = 'task-card' + (task.done ? ' completed' : '');
  card.dataset.priority = task.priority || 'medium';
  card.dataset.id = task.id;

  const toggle = document.createElement('button');
  toggle.className = 'toggle';
  toggle.setAttribute('aria-label', task.done ? 'Mark as not done' : 'Mark as done');
  toggle.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  toggle.addEventListener('click', (e) => { e.stopPropagation(); toggleDone(task.id); });

  const body = document.createElement('div');
  body.className = 'task-body';

  const title = document.createElement('h3');
  title.className = 'task-title';
  title.textContent = task.title;
  body.appendChild(title);

  if (task.notes) {
    const notes = document.createElement('p');
    notes.className = 'task-notes';
    notes.textContent = task.notes;
    body.appendChild(notes);
  }

  if (task.reminder) {
    const meta = document.createElement('div');
    meta.className = 'task-meta';
    const t = document.createElement('span');
    t.className = 'task-time';
    const d = new Date(task.reminder);
    const overdue = !task.done && d.getTime() < Date.now();
    if (overdue) t.classList.add('overdue');
    t.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ' + formatReminder(d, overdue);
    meta.appendChild(t);
    body.appendChild(meta);
  }

  const del = document.createElement('button');
  del.className = 'task-delete';
  del.setAttribute('aria-label', 'Delete task');
  del.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  del.addEventListener('click', (e) => { e.stopPropagation(); removeTask(task.id, card); });

  body.addEventListener('click', () => openSheet(task.id));

  card.appendChild(toggle);
  card.appendChild(body);
  card.appendChild(del);
  return card;
}

function formatReminder(date, overdue) {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const sameDay = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (overdue) {
    const mins = Math.round(-diff / 60000);
    if (mins < 60) return 'Overdue · ' + mins + 'm';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return 'Overdue · ' + hrs + 'h';
    return 'Overdue · ' + Math.round(hrs / 24) + 'd';
  }
  if (sameDay) return 'Today, ' + time;
  if (isTomorrow) return 'Tomorrow, ' + time;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ', ' + time;
}

function updateStats() {
  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  const pending = total - done;
  $('#statTotal').textContent = total;
  $('#statDone').textContent = done;
  $('#statPending').textContent = pending;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  $('#progressFill').style.width = pct + '%';
  $('#progressText').textContent = pct + '% complete';
  $('#fabBtn').classList.toggle('pulse', total === 0);
}

function toggleDone(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) t.completedAt = Date.now();
  saveTasks();
  if (navigator.vibrate) navigator.vibrate(t.done ? [12] : [8]);
  showSnack(t.done ? 'Task completed' : 'Marked pending');
  render();
}

function removeTask(id, cardEl) {
  if (cardEl) {
    cardEl.classList.add('removing');
    setTimeout(() => commitRemoval(id), 280);
  } else {
    commitRemoval(id);
  }
}

function commitRemoval(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  showSnack('Task deleted');
  render();
}

function saveTaskFromSheet() {
  const title = $('#taskTitle').value.trim();
  if (!title) {
    showSnack('Please enter a title');
    $('#taskTitle').focus();
    return;
  }
  const notes = $('#taskNotes').value.trim();
  const reminder = $('#taskTime').value || null;

  if (editingId) {
    const t = tasks.find(x => x.id === editingId);
    if (t) {
      t.title = title;
      t.notes = notes;
      t.reminder = reminder;
      t.priority = selectedPriority;
      firedReminders.delete(editingId);
    }
    showSnack('Task updated');
  } else {
    tasks.push({
      id: uid(),
      title: title,
      notes: notes,
      reminder: reminder,
      priority: selectedPriority,
      done: false,
      createdAt: Date.now()
    });
    showSnack('Task added');
    requestNotificationPermissionOnce();
  }

  saveTasks();
  closeSheet();
  render();
}

function openSheet(id) {
  editingId = id || null;
  if (id) {
    const t = tasks.find(x => x.id === id);
    if (!t) return;
    $('#sheetTitle').textContent = 'Edit Task';
    $('#taskTitle').value = t.title;
    $('#taskNotes').value = t.notes || '';
    $('#taskTime').value = t.reminder || '';
    selectedPriority = t.priority || 'medium';
  } else {
    $('#sheetTitle').textContent = 'New Task';
    $('#taskTitle').value = '';
    $('#taskNotes').value = '';
    $('#taskTime').value = '';
    selectedPriority = 'medium';
  }
  $$('.priority-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.priority === selectedPriority);
  });
  $('#scrim').classList.add('visible');
  $('#bottomSheet').classList.add('visible');
  setTimeout(() => $('#taskTitle').focus(), 250);
}

function closeSheet() {
  editingId = null;
  $('#scrim').classList.remove('visible');
  $('#bottomSheet').classList.remove('visible');
}

let snackTimer;
function showSnack(msg) {
  const s = $('#snackbar');
  s.textContent = msg;
  s.classList.add('visible');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => s.classList.remove('visible'), 2200);
}

function requestNotificationPermissionOnce() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (e) {}
  }
}

function checkReminders() {
  const now = Date.now();
  tasks.forEach(t => {
    if (t.done || !t.reminder) return;
    if (firedReminders.has(t.id)) return;
    const due = new Date(t.reminder).getTime();
    if (due <= now && due > now - 60 * 60 * 1000) {
      fireReminder(t);
      firedReminders.add(t.id);
    } else if (due <= now - 60 * 60 * 1000) {
      firedReminders.add(t.id);
    }
  });
}

function fireReminder(task) {
  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  showSnack('⏰ Reminder: ' + task.title);

  if ('Notification' in window && Notification.permission === 'granted') {
    const opts = {
      body: task.notes || 'Time to take care of this task.',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: 'task-' + task.id,
      requireInteraction: false,
      vibrate: [200, 100, 200]
    };
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(task.title, opts).catch(() => {
          try { new Notification(task.title, opts); } catch (e) {}
        });
      });
    } else {
      try { new Notification(task.title, opts); } catch (e) {}
    }
  }
}

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  $('#installBtn').hidden = false;
});

window.addEventListener('appinstalled', () => {
  $('#installBtn').hidden = true;
  showSnack('App installed 🎉');
});

function scheduleMidnightRefresh() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(0, 0, 30, 0);
  setTimeout(() => {
    setGreeting();
    render();
    scheduleMidnightRefresh();
  }, tomorrow.getTime() - now.getTime());
}

function init() {
  setGreeting();
  render();

  $('#fabBtn').addEventListener('click', () => openSheet());
  $('#cancelBtn').addEventListener('click', closeSheet);
  $('#saveBtn').addEventListener('click', saveTaskFromSheet);
  $('#scrim').addEventListener('click', closeSheet);

  $('#installBtn').addEventListener('click', async () => {
    if (!deferredInstall) {
      showSnack('Open browser menu → Install app');
      return;
    }
    deferredInstall.prompt();
    try {
      const choice = await deferredInstall.userChoice;
      if (choice.outcome === 'accepted') {
        showSnack('Installing…');
        $('#installBtn').hidden = true;
      }
    } catch (e) {}
    deferredInstall = null;
  });

  $$('.priority-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      selectedPriority = chip.dataset.priority;
      $$('.priority-chip').forEach(c => c.classList.toggle('active', c === chip));
    });
  });

  $$('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentFilter = chip.dataset.filter;
      $$('.filter-chip').forEach(c => c.classList.toggle('active', c === chip));
      render();
    });
  });

  $('#taskTitle').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveTaskFromSheet(); }
  });

  checkReminders();
  setInterval(checkReminders, 20000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkReminders();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(err => {
        console.warn('SW registration failed:', err);
      });
    });
  }

  scheduleMidnightRefresh();
}

document.addEventListener('DOMContentLoaded', init);
