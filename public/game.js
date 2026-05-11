(() => {
  'use strict';

  // ============================================================
  // Config
  // ============================================================
  const W = 800;
  const H = 600;

  const PADDLE = {
    width: 110,
    widthWide: 170,
    height: 14,
    y: H - 50,
    baseSpeed: 9,
    color: '#56ffe1',
  };

  const BALL = {
    radius: 8,
    baseSpeed: 6.2,
    speedSlow: 4.2,
    maxSpeed: 11,
    color: '#ffffff',
  };

  const BRICK = {
    cols: 14,
    rows: 8,
    pad: 12,
    gap: 3,
    topOffset: 70,
    height: 22,
    get width() {
      return (W - this.pad * 2 - (this.cols - 1) * this.gap) / this.cols;
    },
  };

  const BRICK_TYPES = {
    1: { hp: 1, score: 50, colors: ['#56ffe1', '#1ad0b0'] },
    2: { hp: 2, score: 100, colors: ['#ffd23f', '#c08a00'] },
    3: { hp: 3, score: 200, colors: ['#ff5cc3', '#9b1e74'] },
    4: { hp: 4, score: 350, colors: ['#9bff6a', '#3aa12a'] },
    9: { hp: Infinity, score: 0, colors: ['#7a7e9a', '#4a4d65'] },
  };

  // 14 cols × 8 rows. Chars: . empty, 1–4 brick HP, # indestructible
  const LEVELS = [
    [
      '..............',
      '...11111111...',
      '..1222222221..',
      '.122333333221.',
      '.122333333221.',
      '..1222222221..',
      '...11111111...',
      '..............',
    ],
    [
      '11111111111111',
      '1............1',
      '1.2222222222.1',
      '1.2#######2..1',
      '1.2#######2..1',
      '1.2222222222.1',
      '1............1',
      '11111111111111',
    ],
    [
      '..3..3..3..3..',
      '.323.323.323..',
      '..3..3..3..3..',
      '..............',
      '11222222222211',
      '.1224444221...',
      '..1222222211..',
      '...11111111...',
    ],
    [
      '##..........##',
      '#11........11#',
      '.122......221.',
      '..1233333321..',
      '..1244444421..',
      '.1233333333321',
      '#1222222222221',
      '##111111111111',
    ],
    [
      '4444444444444.',
      '433333333333.4',
      '432222222222.3',
      '432###########',
      '432###########',
      '432222222222.3',
      '433333333333.4',
      '4444444444444.',
    ],
    [
      '.1.1.1.1.1.1.1',
      '1.1.1.1.1.1.1.',
      '.2.2.2.2.2.2.2',
      '2.2.2.2.2.2.2.',
      '.3.3.3.3.3.3.3',
      '3.3.3.3.3.3.3.',
      '.4.4.4.4.4.4.4',
      '4.4.4.4.4.4.4.',
    ],
  ];

  const POWERUPS = {
    LIFE:  { color: '#56ffe1', label: '+1', weight: 1 },
    MULTI: { color: '#ffd23f', label: '×3', weight: 2 },
    WIDE:  { color: '#9bff6a', label: '↔',  weight: 2 },
    SLOW:  { color: '#ff7ad9', label: '◐',  weight: 2 },
    LASER: { color: '#ff5252', label: '✦',  weight: 2 },
  };
  const POWERUP_DROP_CHANCE = 0.16;
  const POWERUP_DURATION_MS = 12000;

  // ============================================================
  // Canvas / DOM
  // ============================================================
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });

  const hud = {
    score: document.getElementById('hud-score'),
    high: document.getElementById('hud-high'),
    level: document.getElementById('hud-level'),
    lives: document.getElementById('hud-lives'),
    combo: document.getElementById('hud-combo'),
  };
  const overlay = document.getElementById('overlay');
  const overlayTitleEl = overlay.querySelector('.overlay__title');
  const overlaySubEl = overlay.querySelector('.overlay__sub');
  const btnStart = document.getElementById('btn-start');

  // ============================================================
  // Audio
  // ============================================================
  const Sfx = (() => {
    let ac;
    let muted = false;
    const ensure = () => {
      if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      return ac;
    };
    const beep = (freq, dur = 0.07, type = 'square', vol = 0.06) => {
      if (muted) return;
      try {
        const a = ensure();
        const osc = a.createOscillator();
        const gain = a.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.value = vol;
        gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
        osc.connect(gain).connect(a.destination);
        osc.start();
        osc.stop(a.currentTime + dur);
      } catch (_) {}
    };
    return {
      hit:    () => beep(540 + Math.random() * 80, 0.05),
      paddle: () => beep(260, 0.06, 'triangle'),
      wall:   () => beep(380, 0.04),
      break:  () => beep(720, 0.08, 'sawtooth', 0.05),
      tough:  () => beep(180, 0.09, 'square', 0.05),
      power:  () => { beep(660, 0.07, 'triangle'); setTimeout(() => beep(990, 0.09, 'triangle'), 60); },
      lose:   () => { beep(180, 0.18, 'sawtooth', 0.07); setTimeout(() => beep(110, 0.25, 'sawtooth', 0.07), 120); },
      win:    () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.12, 'triangle', 0.06), i * 90)); },
      laser:  () => beep(1400 - Math.random() * 200, 0.04, 'square', 0.04),
      toggle: () => { muted = !muted; return muted; },
    };
  })();

  // ============================================================
  // Helpers
  // ============================================================
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const HS_KEY = 'neonbreaker:highscore';
  const readHigh = () => parseInt(localStorage.getItem(HS_KEY) || '0', 10) || 0;
  const writeHigh = (v) => { try { localStorage.setItem(HS_KEY, String(v)); } catch (_) {} };

  // ============================================================
  // State
  // ============================================================
  const State = {
    TITLE: 'TITLE',
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    LEVEL_DONE: 'LEVEL_DONE',
    GAME_OVER: 'GAME_OVER',
  };

  const game = {
    state: State.TITLE,
    levelIndex: 0,
    score: 0,
    high: readHigh(),
    lives: 3,
    combo: 1,
    comboTimer: 0,
    paddle: null,
    balls: [],
    bricks: [],
    powerups: [],
    bullets: [],
    particles: [],
    floatingScores: [],
    stars: [],
    keys: new Set(),
    mouseX: null,
    activeEffects: { wide: 0, slow: 0, laser: 0 },
    laserCooldown: 0,
  };

  // ============================================================
  // Entities
  // ============================================================
  function makePaddle() {
    return { x: W / 2 - PADDLE.width / 2, y: PADDLE.y, w: PADDLE.width, h: PADDLE.height };
  }

  function buildLevel(idx) {
    const layout = LEVELS[idx % LEVELS.length];
    const bricks = [];
    for (let r = 0; r < BRICK.rows; r++) {
      const row = layout[r] || '';
      for (let c = 0; c < BRICK.cols; c++) {
        const ch = row[c] || '.';
        if (ch === '.') continue;
        const type = ch === '#' ? 9 : parseInt(ch, 10);
        if (!Number.isFinite(type) || !BRICK_TYPES[type]) continue;
        const tpl = BRICK_TYPES[type];
        const w = BRICK.width;
        bricks.push({
          x: BRICK.pad + c * (w + BRICK.gap),
          y: BRICK.topOffset + r * (BRICK.height + BRICK.gap),
          w, h: BRICK.height,
          type, hp: tpl.hp, maxHp: tpl.hp,
          colors: tpl.colors, score: tpl.score,
          shake: 0,
        });
      }
    }
    return bricks;
  }

  function buildStars(n = 70) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.2, s: Math.random() * 0.4 + 0.05 });
    }
    return out;
  }

  // ============================================================
  // Lifecycle
  // ============================================================
  function newGame() {
    game.levelIndex = 0;
    game.score = 0;
    game.lives = 3;
    game.combo = 1;
    game.comboTimer = 0;
    game.activeEffects = { wide: 0, slow: 0, laser: 0 };
    game.laserCooldown = 0;
    game.paddle = makePaddle();
    game.bricks = buildLevel(game.levelIndex);
    game.powerups = [];
    game.bullets = [];
    game.particles = [];
    game.floatingScores = [];
    game.balls = [];
    game.stars = buildStars();
    resetBall();
    game.state = State.READY;
    updateHud();
    hideOverlay();
  }

  function nextLevel() {
    game.levelIndex++;
    game.combo = 1;
    game.comboTimer = 0;
    game.activeEffects = { wide: 0, slow: 0, laser: 0 };
    game.laserCooldown = 0;
    game.paddle.w = PADDLE.width;
    game.bricks = buildLevel(game.levelIndex);
    game.powerups = [];
    game.bullets = [];
    game.particles = [];
    game.floatingScores = [];
    game.balls = [];
    resetBall();
    game.state = State.READY;
    updateHud();
    hideOverlay();
  }

  function resetBall() {
    game.balls = [{
      x: game.paddle.x + game.paddle.w / 2,
      y: game.paddle.y - BALL.radius - 1,
      r: BALL.radius,
      vx: 0, vy: 0,
      trail: [],
      stuck: true,
    }];
  }

  function launchStuckBalls() {
    game.balls.forEach(b => {
      if (b.stuck) {
        const speed = game.activeEffects.slow > 0 ? BALL.speedSlow : BALL.baseSpeed;
        const angle = rand(-60, 60) * Math.PI / 180;
        b.vx = Math.sin(angle) * speed;
        b.vy = -Math.cos(angle) * speed;
        b.stuck = false;
      }
    });
  }

  function loseLife() {
    game.lives--;
    game.combo = 1;
    Sfx.lose();
    if (game.lives <= 0) {
      game.state = State.GAME_OVER;
      if (game.score > game.high) { game.high = game.score; writeHigh(game.high); }
      showOverlay('GAME OVER', `Wynik: ${game.score} · Rekord: ${game.high}`, 'NOWA GRA');
    } else {
      game.activeEffects = { wide: 0, slow: 0, laser: 0 };
      game.paddle.w = PADDLE.width;
      resetBall();
      game.state = State.READY;
    }
    updateHud();
  }

  // ============================================================
  // Update
  // ============================================================
  function update(dt) {
    // Paddle move
    const speed = PADDLE.baseSpeed;
    if (game.keys.has('ArrowLeft') || game.keys.has('KeyA'))  game.paddle.x -= speed;
    if (game.keys.has('ArrowRight') || game.keys.has('KeyD')) game.paddle.x += speed;
    if (game.mouseX != null) {
      const target = game.mouseX - game.paddle.w / 2;
      game.paddle.x += (target - game.paddle.x) * 0.35;
    }
    game.paddle.x = clamp(game.paddle.x, 0, W - game.paddle.w);

    // Combo decay
    if (game.comboTimer > 0) {
      game.comboTimer -= dt;
      if (game.comboTimer <= 0) { game.combo = 1; updateHud(); }
    }

    // Effects
    if (game.activeEffects.wide > 0) {
      game.activeEffects.wide -= dt * 1000;
      if (game.activeEffects.wide <= 0) {
        game.paddle.w = PADDLE.width;
        game.paddle.x = clamp(game.paddle.x, 0, W - game.paddle.w);
      }
    }
    if (game.activeEffects.slow > 0) {
      game.activeEffects.slow -= dt * 1000;
      if (game.activeEffects.slow <= 0) {
        game.balls.forEach(b => {
          const cur = Math.hypot(b.vx, b.vy);
          if (cur > 0) {
            const k = BALL.baseSpeed / cur;
            b.vx *= k; b.vy *= k;
          }
        });
      }
    }
    if (game.activeEffects.laser > 0) game.activeEffects.laser -= dt * 1000;
    if (game.laserCooldown > 0) game.laserCooldown -= dt * 1000;

    // Laser fire
    if (game.activeEffects.laser > 0 && (game.keys.has('Space') || game.keys.has('KeyF')) && game.laserCooldown <= 0 && game.state === State.PLAYING) {
      const px = game.paddle.x;
      const py = game.paddle.y;
      game.bullets.push({ x: px + 10, y: py, vy: -10 });
      game.bullets.push({ x: px + game.paddle.w - 10, y: py, vy: -10 });
      game.laserCooldown = 220;
      Sfx.laser();
    }

    // Stars parallax
    for (const s of game.stars) {
      s.y += s.s;
      if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    }

    if (game.state !== State.PLAYING && game.state !== State.READY) return;

    // Balls
    for (let i = game.balls.length - 1; i >= 0; i--) {
      const b = game.balls[i];
      if (b.stuck) {
        b.x = game.paddle.x + game.paddle.w / 2;
        b.y = game.paddle.y - b.r - 1;
        continue;
      }
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 12) b.trail.shift();

      b.x += b.vx;
      b.y += b.vy;

      if (b.x - b.r < 0) { b.x = b.r; b.vx = -b.vx; Sfx.wall(); }
      if (b.x + b.r > W) { b.x = W - b.r; b.vx = -b.vx; Sfx.wall(); }
      if (b.y - b.r < 0) { b.y = b.r; b.vy = -b.vy; Sfx.wall(); }

      if (b.y - b.r > H) { game.balls.splice(i, 1); continue; }

      // Paddle
      const p = game.paddle;
      if (b.vy > 0 && b.y + b.r >= p.y && b.y - b.r <= p.y + p.h && b.x >= p.x - b.r && b.x <= p.x + p.w + b.r) {
        const hit = (b.x - (p.x + p.w / 2)) / (p.w / 2);
        const maxBounce = 65 * Math.PI / 180;
        const angle = hit * maxBounce;
        const cur = Math.hypot(b.vx, b.vy);
        const newSpeed = Math.min(BALL.maxSpeed, cur * 1.02);
        b.vx = Math.sin(angle) * newSpeed;
        b.vy = -Math.abs(Math.cos(angle) * newSpeed);
        b.y = p.y - b.r - 0.1;
        Sfx.paddle();
      }

      // Bricks
      for (let j = 0; j < game.bricks.length; j++) {
        const br = game.bricks[j];
        if (br.hp <= 0) continue;
        if (b.x + b.r < br.x || b.x - b.r > br.x + br.w) continue;
        if (b.y + b.r < br.y || b.y - b.r > br.y + br.h) continue;

        const prevX = b.x - b.vx;
        const prevY = b.y - b.vy;
        const wasOutsideX = prevX + b.r <= br.x || prevX - b.r >= br.x + br.w;
        const wasOutsideY = prevY + b.r <= br.y || prevY - b.r >= br.y + br.h;
        if (wasOutsideX && !wasOutsideY)      b.vx = -b.vx;
        else if (wasOutsideY && !wasOutsideX) b.vy = -b.vy;
        else { b.vx = -b.vx; b.vy = -b.vy; }
        br.shake = 6;

        if (br.type === 9) { Sfx.tough(); break; }
        br.hp--;
        if (br.hp <= 0) {
          const earned = Math.round(br.score * game.combo);
          game.score += earned;
          game.combo = Math.min(5, game.combo + 1);
          game.comboTimer = 2.2;
          spawnParticles(br.x + br.w / 2, br.y + br.h / 2, br.colors[0], 14);
          spawnFloatingScore(br.x + br.w / 2, br.y, `+${earned}`);
          maybeDropPowerup(br.x + br.w / 2, br.y + br.h / 2);
          Sfx.break();
          updateHud();
        } else {
          Sfx.hit();
        }
        break;
      }
    }

    // Bullets
    for (let i = game.bullets.length - 1; i >= 0; i--) {
      const bu = game.bullets[i];
      bu.y += bu.vy;
      if (bu.y < -10) { game.bullets.splice(i, 1); continue; }
      for (let j = 0; j < game.bricks.length; j++) {
        const br = game.bricks[j];
        if (br.hp <= 0) continue;
        if (bu.x < br.x || bu.x > br.x + br.w) continue;
        if (bu.y < br.y || bu.y > br.y + br.h) continue;
        br.shake = 5;
        if (br.type === 9) { Sfx.tough(); game.bullets.splice(i, 1); break; }
        br.hp--;
        if (br.hp <= 0) {
          const earned = Math.round(br.score * game.combo);
          game.score += earned;
          spawnParticles(br.x + br.w / 2, br.y + br.h / 2, br.colors[0], 10);
          spawnFloatingScore(br.x + br.w / 2, br.y, `+${earned}`);
          maybeDropPowerup(br.x + br.w / 2, br.y + br.h / 2);
          Sfx.break();
          updateHud();
        } else {
          Sfx.hit();
        }
        game.bullets.splice(i, 1);
        break;
      }
    }

    // Powerups
    for (let i = game.powerups.length - 1; i >= 0; i--) {
      const pu = game.powerups[i];
      pu.y += 2.6;
      pu.spin += 0.05;
      const p = game.paddle;
      if (pu.y + pu.r >= p.y && pu.y - pu.r <= p.y + p.h && pu.x >= p.x && pu.x <= p.x + p.w) {
        applyPowerup(pu.kind);
        game.powerups.splice(i, 1);
        Sfx.power();
        continue;
      }
      if (pu.y > H + 30) game.powerups.splice(i, 1);
    }

    for (const br of game.bricks) if (br.shake > 0) br.shake = Math.max(0, br.shake - 1);

    for (let i = game.particles.length - 1; i >= 0; i--) {
      const pt = game.particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.vy += 0.12;
      pt.life -= dt;
      if (pt.life <= 0) game.particles.splice(i, 1);
    }

    for (let i = game.floatingScores.length - 1; i >= 0; i--) {
      const f = game.floatingScores[i];
      f.y -= 0.6;
      f.life -= dt;
      if (f.life <= 0) game.floatingScores.splice(i, 1);
    }

    if (game.balls.length === 0 && game.state === State.PLAYING) loseLife();

    const remaining = game.bricks.some(br => br.hp > 0 && br.type !== 9);
    if (!remaining && game.state === State.PLAYING) {
      game.state = State.LEVEL_DONE;
      Sfx.win();
      const bonus = 500 + game.lives * 200;
      game.score += bonus;
      updateHud();
      const isLast = game.levelIndex >= LEVELS.length - 1;
      if (isLast) {
        if (game.score > game.high) { game.high = game.score; writeHigh(game.high); }
        showOverlay('WYGRANA!', `Ukończyłeś wszystkie poziomy · Wynik: ${game.score} · Rekord: ${game.high}`, 'ZAGRAJ JESZCZE RAZ');
      } else {
        showOverlay(`POZIOM ${game.levelIndex + 1} ZALICZONY`, `Bonus: +${bonus} · Następny poziom: ${game.levelIndex + 2}`, 'DALEJ');
      }
    }
  }

  function applyPowerup(kind) {
    if (kind === 'LIFE') {
      game.lives++;
    } else if (kind === 'MULTI') {
      const newBalls = [];
      for (const b of game.balls) {
        const baseSpeed = Math.hypot(b.vx, b.vy) || BALL.baseSpeed;
        for (const da of [-22, 22]) {
          const angle = Math.atan2(b.vy, b.vx) + (da * Math.PI / 180);
          newBalls.push({
            x: b.x, y: b.y, r: BALL.radius,
            vx: Math.cos(angle) * baseSpeed, vy: Math.sin(angle) * baseSpeed,
            trail: [], stuck: false,
          });
        }
      }
      game.balls.push(...newBalls);
    } else if (kind === 'WIDE') {
      game.paddle.w = PADDLE.widthWide;
      game.paddle.x = clamp(game.paddle.x, 0, W - game.paddle.w);
      game.activeEffects.wide = POWERUP_DURATION_MS;
    } else if (kind === 'SLOW') {
      game.activeEffects.slow = POWERUP_DURATION_MS;
      game.balls.forEach(b => {
        const cur = Math.hypot(b.vx, b.vy);
        if (cur > 0) {
          const k = BALL.speedSlow / cur;
          b.vx *= k; b.vy *= k;
        }
      });
    } else if (kind === 'LASER') {
      game.activeEffects.laser = POWERUP_DURATION_MS;
    }
    updateHud();
  }

  function maybeDropPowerup(x, y) {
    if (Math.random() > POWERUP_DROP_CHANCE) return;
    const pool = [];
    for (const k of Object.keys(POWERUPS)) {
      for (let i = 0; i < POWERUPS[k].weight; i++) pool.push(k);
    }
    const kind = pool[Math.floor(Math.random() * pool.length)];
    game.powerups.push({
      x, y, r: 12, kind, spin: 0,
      color: POWERUPS[kind].color, label: POWERUPS[kind].label,
    });
  }

  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(1, 5);
      game.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1,
        color,
        size: rand(2, 4),
        life: rand(0.5, 1.1),
      });
    }
  }

  function spawnFloatingScore(x, y, text) {
    game.floatingScores.push({ x, y, text, life: 0.9 });
  }

  // ============================================================
  // Render
  // ============================================================
  function render() {
    ctx.fillStyle = '#06010f';
    ctx.fillRect(0, 0, W, H);

    for (const s of game.stars) {
      ctx.globalAlpha = clamp(s.s * 3, 0.2, 0.9);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    const grad = ctx.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, 'rgba(86,255,225,0)');
    grad.addColorStop(0.5, 'rgba(86,255,225,0.6)');
    grad.addColorStop(1, 'rgba(255,92,195,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 2);

    ctx.fillStyle = 'rgba(86,255,225,0.18)';
    ctx.fillRect(0, 0, 2, H);
    ctx.fillRect(W - 2, 0, 2, H);

    for (const br of game.bricks) {
      if (br.hp <= 0) continue;
      drawBrick(br);
    }

    for (const pu of game.powerups) drawPowerup(pu);

    for (const bu of game.bullets) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ff5252';
      ctx.fillStyle = '#ff5252';
      ctx.fillRect(bu.x - 2, bu.y - 10, 4, 12);
    }
    ctx.shadowBlur = 0;

    for (const b of game.balls) {
      for (let i = 0; i < b.trail.length; i++) {
        const t = b.trail[i];
        ctx.globalAlpha = (i + 1) / b.trail.length * 0.35;
        ctx.fillStyle = '#56ffe1';
        ctx.beginPath();
        ctx.arc(t.x, t.y, b.r * (i / b.trail.length), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    for (const b of game.balls) drawBall(b);

    drawPaddle(game.paddle);

    for (const pt of game.particles) {
      ctx.globalAlpha = clamp(pt.life, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.font = 'bold 14px ui-monospace, Menlo, monospace';
    for (const f of game.floatingScores) {
      ctx.globalAlpha = clamp(f.life, 0, 1);
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#56ffe1';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    drawEffectsBar();

    if (game.state === State.READY) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 16px ui-monospace, Menlo, monospace';
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.shadowBlur = 14;
      ctx.shadowColor = '#56ffe1';
      ctx.fillText('NACIŚNIJ SPACJĘ ABY WYSTRZELIĆ', W / 2, H - 90);
      ctx.shadowBlur = 0;
    }

    if (game.state === State.PAUSED) {
      ctx.fillStyle = 'rgba(6,1,15,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = 'bold 48px ui-monospace, Menlo, monospace';
      ctx.fillStyle = '#56ffe1';
      ctx.shadowBlur = 24;
      ctx.shadowColor = '#56ffe1';
      ctx.fillText('PAUZA', W / 2, H / 2);
      ctx.shadowBlur = 0;
    }
  }

  function drawBrick(br) {
    const sx = (Math.random() - 0.5) * br.shake;
    const sy = (Math.random() - 0.5) * br.shake;
    const x = br.x + sx;
    const y = br.y + sy;
    const damageRatio = br.type === 9 ? 1 : br.hp / br.maxHp;
    const [c1, c2] = br.colors;

    ctx.shadowBlur = 14;
    ctx.shadowColor = c1;
    ctx.fillStyle = mixHex(c2, c1, damageRatio);
    ctx.fillRect(x, y, br.w, br.h);
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x + 2, y + 2, br.w - 4, 4);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 2, y + br.h - 4, br.w - 4, 2);

    if (br.type === 9) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x + br.w / 2 - 1, y + 4, 2, br.h - 8);
      ctx.fillRect(x + 4, y + br.h / 2 - 1, br.w - 8, 2);
    }
  }

  function drawBall(b) {
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#56ffe1';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawPaddle(p) {
    ctx.shadowBlur = 18;
    ctx.shadowColor = game.activeEffects.laser > 0 ? '#ff5252' : '#56ffe1';
    const grad = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
    if (game.activeEffects.laser > 0) {
      grad.addColorStop(0, '#ff7878');
      grad.addColorStop(1, '#ff2222');
    } else {
      grad.addColorStop(0, '#b6ffec');
      grad.addColorStop(1, '#1ad0b0');
    }
    ctx.fillStyle = grad;
    roundRect(p.x, p.y, p.w, p.h, 7);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (game.activeEffects.laser > 0) {
      ctx.fillStyle = '#ffe2e2';
      ctx.fillRect(p.x + 6, p.y - 4, 4, 4);
      ctx.fillRect(p.x + p.w - 10, p.y - 4, 4, 4);
    }
  }

  function drawPowerup(pu) {
    ctx.save();
    ctx.translate(pu.x, pu.y);
    ctx.rotate(pu.spin);
    ctx.shadowBlur = 16;
    ctx.shadowColor = pu.color;
    ctx.fillStyle = pu.color;
    roundRect(-pu.r, -pu.r, pu.r * 2, pu.r * 2, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#06010f';
    ctx.font = 'bold 13px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pu.label, 0, 1);
    ctx.restore();
  }

  function drawEffectsBar() {
    const items = [];
    if (game.activeEffects.wide > 0)  items.push({ c: '#9bff6a', t: 'WIDE',  ms: game.activeEffects.wide });
    if (game.activeEffects.slow > 0)  items.push({ c: '#ff7ad9', t: 'SLOW',  ms: game.activeEffects.slow });
    if (game.activeEffects.laser > 0) items.push({ c: '#ff5252', t: 'LASER', ms: game.activeEffects.laser });
    if (items.length === 0) return;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 11px ui-monospace, Menlo, monospace';
    let x = 12;
    const y = H - 22;
    for (const it of items) {
      const w = 78;
      ctx.fillStyle = 'rgba(255,255,255,.06)';
      roundRect(x, y, w, 16, 5);
      ctx.fill();
      const pct = clamp(it.ms / POWERUP_DURATION_MS, 0, 1);
      ctx.fillStyle = it.c;
      roundRect(x, y, w * pct, 16, 5);
      ctx.fill();
      ctx.fillStyle = '#06010f';
      ctx.fillText(it.t, x + 6, y + 11);
      x += w + 6;
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function mixHex(a, b, t) {
    const pa = hexToRgb(a), pb = hexToRgb(b);
    const r = Math.round(pa.r + (pb.r - pa.r) * t);
    const g = Math.round(pa.g + (pb.g - pa.g) * t);
    const bl = Math.round(pa.b + (pb.b - pa.b) * t);
    return `rgb(${r},${g},${bl})`;
  }
  function hexToRgb(h) {
    const s = h.replace('#', '');
    return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
  }

  // ============================================================
  // HUD / overlay
  // ============================================================
  function updateHud() {
    hud.score.textContent = game.score.toLocaleString('pl-PL');
    hud.high.textContent = Math.max(game.high, game.score).toLocaleString('pl-PL');
    hud.level.textContent = String(game.levelIndex + 1);
    hud.lives.textContent = '♥'.repeat(Math.max(0, game.lives)) || '–';
    hud.combo.textContent = `×${game.combo}`;
  }

  function showOverlay(title, sub, btnLabel = 'START') {
    overlay.classList.remove('is-hidden');
    overlayTitleEl.textContent = title;
    overlaySubEl.textContent = sub;
    btnStart.textContent = btnLabel;
  }
  function hideOverlay() { overlay.classList.add('is-hidden'); }

  // ============================================================
  // Input
  // ============================================================
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    game.keys.add(e.code);

    if (e.code === 'Space') {
      if (game.state === State.READY) {
        launchStuckBalls();
        game.state = State.PLAYING;
      } else if (game.state === State.PLAYING) {
        game.state = State.PAUSED;
      } else if (game.state === State.PAUSED) {
        game.state = State.PLAYING;
      } else if (game.state === State.TITLE || game.state === State.GAME_OVER) {
        newGame();
      } else if (game.state === State.LEVEL_DONE) {
        nextLevel();
      }
    } else if (e.code === 'KeyR') {
      newGame();
    } else if (e.code === 'KeyM') {
      Sfx.toggle();
    }
  });

  window.addEventListener('keyup', (e) => { game.keys.delete(e.code); });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scale = W / rect.width;
    game.mouseX = (e.clientX - rect.left) * scale;
  });
  canvas.addEventListener('mouseleave', () => { game.mouseX = null; });
  canvas.addEventListener('click', () => {
    if (game.state === State.READY) {
      launchStuckBalls();
      game.state = State.PLAYING;
    }
  });

  canvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const scale = W / rect.width;
    game.mouseX = (t.clientX - rect.left) * scale;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const scale = W / rect.width;
    game.mouseX = (t.clientX - rect.left) * scale;
    if (game.state === State.READY) {
      launchStuckBalls();
      game.state = State.PLAYING;
    } else if (game.state === State.TITLE || game.state === State.GAME_OVER) {
      newGame();
    } else if (game.state === State.LEVEL_DONE) {
      nextLevel();
    }
  });

  btnStart.addEventListener('click', () => {
    if (game.state === State.TITLE || game.state === State.GAME_OVER) newGame();
    else if (game.state === State.LEVEL_DONE) nextLevel();
    else hideOverlay();
  });

  // ============================================================
  // Loop
  // ============================================================
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  game.paddle = makePaddle();
  game.stars = buildStars();
  game.bricks = buildLevel(0);
  resetBall();
  updateHud();
  requestAnimationFrame(loop);
})();
