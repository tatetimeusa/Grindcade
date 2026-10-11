// Grindcade site: boot line, OS-aware downloads, module screen swap, web shell.
(() => {
  const REL = 'https://github.com/tatetimeusa/Grindcade/releases/latest/download/';
  const DL = { win: REL + 'Grindcade-windows-setup.exe', mac: REL + 'Grindcade-mac-universal.zip' };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- which download fits this visitor ----
  const ua = navigator.userAgent;
  const os = /Mac|iPhone|iPad/.test(ua) ? 'mac' : /Win/.test(ua) ? 'win' : null;
  if (os === 'mac') document.getElementById('dl-mac').classList.add('primary');
  document.querySelectorAll('[data-dl]').forEach((a) => {
    a.href = DL[os || 'win'];
    if (os === 'mac') { a.textContent = '[ DOWNLOAD FOR MAC ]'; a.classList.replace('btn-win', 'btn-mac'); }
  });

  // ---- boot line, typed once ----
  const boot = document.getElementById('boot');
  const line = '> booting grindcade v0.9.0 ... 9 modules, 5 games online';
  if (reduce) boot.textContent = line;
  else {
    let i = 0;
    const tick = () => { boot.textContent = line.slice(0, ++i); if (i < line.length) setTimeout(tick, 28); };
    setTimeout(tick, 300);
  }

  // ---- module cards swap the monitor screen ----
  const shot = document.getElementById('shot');
  const cap = document.getElementById('shot-cap');
  const show = (name, text, scroll) => {
    shot.style.opacity = '0';
    setTimeout(() => {
      shot.src = 'assets/' + name + '.webp';
      shot.alt = 'Grindcade screen: ' + text;
      cap.textContent = text;
      shot.style.opacity = '1';
    }, reduce ? 0 : 160);
    if (scroll) shot.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  };
  const cards = document.querySelectorAll('.card');
  cards.forEach((c) => c.addEventListener('click', () => {
    cards.forEach((x) => x.classList.toggle('on', x === c));
    show(c.dataset.shot, c.dataset.cap, true);
  }));
  // 1-9 jump to a module, like the app (not while typing in the shell)
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 9) cards[n - 1].click();
    if (e.key === '/') { e.preventDefault(); cmd.focus(); cmd.scrollIntoView({ block: 'center' }); }
  });

  // ---- web shell ----
  const out = document.getElementById('out');
  const form = document.getElementById('prompt');
  const cmd = document.getElementById('cmd');
  const history = [];
  let hpos = 0;

  const print = (text, cls) => {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    p.textContent = text;
    out.appendChild(p);
    out.scrollTop = out.scrollHeight;
  };
  const go = (url) => { window.location.href = url; };

  const commands = {
    help: () => print(
      'commands:\n' +
      '  /download        get the build for this computer\n' +
      '  /download win    Windows installer\n' +
      '  /download mac    Mac app (zip)\n' +
      '  /modules         the nine modules\n' +
      '  /arcade          how the arcade works\n' +
      '  /games           the five games\n' +
      '  /garden          the focus garden\n' +
      '  /price           what it costs\n' +
      '  /github          source and releases\n' +
      '  /clear           clear the screen\n' +
      'or press 1-9 anywhere on the page to show a module.'),
    download: (arg) => {
      const pick = arg === 'win' || arg === 'windows' ? 'win' : arg === 'mac' || arg === 'macos' ? 'mac' : os;
      if (!pick) { print('which one? try /download win or /download mac', 'err'); return; }
      print(pick === 'mac'
        ? 'downloading Grindcade-mac-universal.zip ... unzip, drag to Applications, then run: xattr -cr /Applications/Grindcade.app'
        : 'downloading Grindcade-windows-setup.exe ... if Windows warns you, click More info, then Run anyway.', 'ok');
      setTimeout(() => go(DL[pick]), 600);
    },
    modules: () => print('[1] TODO  [2] BOARD  [3] CALENDAR  [4] NOTES  [5] FOCUS\n[6] ARCADE  [7] GOALS  [8] STREAKS  [9] REMINDERS\none list of tasks runs through all of them.'),
    arcade: () => print('finish a focus session, bank break time, spend it in the arcade.\nno break time, no games. arcade locked. earn it.'),
    games: () => print('NIGHT DRIVE  TUNNEL RUN  BRICKS  STACK  SNAKE\neach with its own soundtrack.'),
    play: () => print('arcade locked. earn it.', 'err'),
    snake: () => print('arcade locked. earn it.', 'err'),
    garden: () => print('one level per finished session, 12 per plant. quit early and it loses a level. it never dies.'),
    price: () => print('free: all nine modules, offline, no account.\ngrindcade+: $3.99 a month or $29 a year, coming with 1.0. sync, new games, new themes.\nthe app itself stays free.'),
    github: () => { print('opening github.com/tatetimeusa/Grindcade ...', 'ok'); setTimeout(() => go('https://github.com/tatetimeusa/Grindcade'), 500); },
    clear: () => { out.innerHTML = ''; },
    sudo: () => print('nice try.', 'err'),
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = cmd.value.trim();
    cmd.value = '';
    if (!raw) return;
    history.push(raw); hpos = history.length;
    print(raw, 'echo');
    const [name, arg] = raw.replace(/^\//, '').toLowerCase().split(/\s+/);
    const fn = commands[name];
    if (fn) fn(arg);
    else print(`command not found: ${raw}. try /help`, 'err');
  });
  cmd.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' && hpos > 0) { cmd.value = history[--hpos]; e.preventDefault(); }
    if (e.key === 'ArrowDown') { hpos = Math.min(history.length, hpos + 1); cmd.value = history[hpos] || ''; e.preventDefault(); }
    if (e.key === 'Escape') cmd.blur();
  });
})();
