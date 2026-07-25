(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOutCubic = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
  const TAU = Math.PI * 2;

  const ui = {
    boot: $('boot'), bootBar: $('bootBar'), bootText: $('bootText'), app: $('app'),
    canvas: $('gameCanvas'), stage: $('stage'),
    phase: $('phaseLabel'), multiplier: $('multiplierLabel'), balance: $('balanceLabel'),
    statusText: $('statusText'), statusPill: document.querySelector('.status-pill'), statusDot: $('statusDot'),
    network: $('networkPill'), intro: $('introCopy'), threat: $('nextThreat'), threatName: $('threatName'),
    nextMultiplier: $('nextMultiplier'), threatProgress: $('threatProgress'),
    survival: $('survivalCard'), survivalKicker: $('survivalKicker'), survivalMultiplier: $('survivalMultiplier'), survivalHint: $('survivalHint'),
    overdrive: $('overdriveCard'), result: $('resultCard'), resultKicker: $('resultKicker'), resultTitle: $('resultTitle'), resultValue: $('resultValue'),
    again: $('againButton'), flash: $('impactFlash'), soundButton: $('soundButton'), soundIcon: $('soundIcon'), fps: $('fpsBadge'),
    history: $('history'), betInput: $('betInput'), betMinus: $('betMinus'), betPlus: $('betPlus'), quickBets: $('quickBets'),
    payout: $('payoutLabel'), action: $('actionButton'), actionFill: $('actionFill'), actionKicker: $('actionKicker'), actionLabel: $('actionLabel'), actionSub: $('actionSub'),
    condition: $('conditionLabel'), conditionMeter: $('conditionMeter'), impacts: $('impactCountLabel'),
    brand: $('brandButton'), settings: $('settingsButton'), fairness: $('fairnessButton'),
    sheetBackdrop: $('sheetBackdrop'), settingsSheet: $('settingsSheet'), infoSheet: $('infoSheet'), fairnessSheet: $('fairnessSheet'),
    soundToggle: $('soundToggle'), hapticToggle: $('hapticToggle'), motionToggle: $('motionToggle'), quality: $('qualitySelect'), fullscreen: $('fullscreenButton'),
    user: $('userLabel'), fairnessMode: $('fairnessMode'), roundId: $('roundId'), roundCommit: $('roundCommit')
  };

  const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
  const formatMoney = (n) => INR.format(Math.max(0, Number.isFinite(n) ? n : 0));

  class TelegramBridge {
    constructor() {
      this.tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      this.haptics = true;
      this.activeRound = false;
      this.platform = this.tg?.platform || 'browser';
    }

    init() {
      if (!this.tg) {
        ui.network.querySelector('span').textContent = 'BROWSER PREVIEW';
        return;
      }
      try {
        this.tg.ready();
        this.tg.expand();
        this.tg.setHeaderColor?.('#07090d');
        this.tg.setBackgroundColor?.('#07090d');
        this.tg.setBottomBarColor?.('#07090d');
        this.updateViewport();
        ['viewportChanged', 'safeAreaChanged', 'contentSafeAreaChanged'].forEach((event) => {
          this.tg.onEvent?.(event, () => this.updateViewport());
        });
        this.tg.onEvent?.('deactivated', () => game?.setAppActive(false));
        this.tg.onEvent?.('activated', () => game?.setAppActive(true));
        const user = this.tg.initDataUnsafe?.user;
        if (user) ui.user.textContent = `@${user.username || user.first_name || 'PLAYER'}`.toUpperCase();
        ui.network.querySelector('span').textContent = `TELEGRAM · ${this.platform.toUpperCase()}`;
      } catch (error) {
        console.warn('Telegram bridge initialization failed', error);
      }
    }

    updateViewport() {
      const h = this.tg?.viewportStableHeight || window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${Math.round(h)}px`);
    }

    setRoundActive(active) {
      this.activeRound = active;
      document.body.classList.toggle('round-active', active);
      if (!this.tg) return;
      try {
        if (active) {
          this.tg.enableClosingConfirmation?.();
          this.tg.disableVerticalSwipes?.();
        } else {
          this.tg.disableClosingConfirmation?.();
          this.tg.enableVerticalSwipes?.();
        }
      } catch {}
    }

    impact(style = 'medium') {
      if (!this.haptics) return;
      try { this.tg?.HapticFeedback?.impactOccurred(style); } catch {}
    }
    notify(type = 'success') {
      if (!this.haptics) return;
      try { this.tg?.HapticFeedback?.notificationOccurred(type); } catch {}
    }
    select() {
      if (!this.haptics) return;
      try { this.tg?.HapticFeedback?.selectionChanged(); } catch {}
    }
    requestFullscreen() {
      try {
        if (this.tg?.requestFullscreen) this.tg.requestFullscreen();
        else document.documentElement.requestFullscreen?.();
      } catch {}
    }
  }

  class ServerClient {
    constructor(telegramBridge) {
      this.telegram = telegramBridge;
      this.connected = false;
      this.token = '';
      this.mode = 'local-demo';
    }

    async request(path, options = {}) {
      const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeout || 4500);
      try {
        const response = await fetch(path, { ...options, headers, signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
        return body;
      } finally { clearTimeout(timeout); }
    }

    async connect() {
      if (!/^https?:$/.test(location.protocol)) return null;
      try {
        const initData = this.telegram.tg?.initData || '';
        const response = await this.request('/api/auth', {
          method: 'POST',
          body: JSON.stringify({ initData })
        });
        this.token = response.token;
        this.mode = response.mode || 'server-demo';
        this.connected = true;
        return response;
      } catch (error) {
        console.info('TAKKAR server unavailable; using local demo engine.', error.message);
        this.connected = false;
        return null;
      }
    }

    startRound(bet) { return this.request('/api/round/start', { method: 'POST', body: JSON.stringify({ bet }) }); }
    impact(roundId) { return this.request(`/api/round/${encodeURIComponent(roundId)}/impact`, { method: 'POST', body: '{}' }); }
    cashout(roundId) { return this.request(`/api/round/${encodeURIComponent(roundId)}/cashout`, { method: 'POST', body: '{}' }); }
    reveal(roundId) { return this.request(`/api/round/${encodeURIComponent(roundId)}/reveal`, { method: 'GET' }); }
  }

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.enabled = true;
      this.chargeOsc = null;
      this.chargeGain = null;
      this.engineOsc = null;
      this.engineOsc2 = null;
      this.engineGain = null;
      this.noiseBuffer = null;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? .62 : 0;
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 6;
      compressor.attack.value = .003;
      compressor.release.value = .18;
      this.master.connect(compressor).connect(this.ctx.destination);
      this.buildNoiseBuffer();
    }

    buildNoiseBuffer() {
      if (!this.ctx) return;
      const length = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = last * .96 + white * .04;
        data[i] = white * .62 + last * .38;
      }
      this.noiseBuffer = buffer;
    }

    setEnabled(value) {
      this.enabled = value;
      this.init();
      if (this.ctx && this.master) this.master.gain.setTargetAtTime(value ? .62 : 0, this.ctx.currentTime, .025);
      if (!value) { this.stopCharge(); this.stopEngine(); }
    }

    tone(freq, duration, type = 'sine', volume = .1, endFreq = null, delay = 0) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freq), t);
      if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
      gain.gain.setValueAtTime(.0001, t);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), t + Math.min(.018, duration * .25));
      gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
      osc.connect(gain).connect(this.master);
      osc.start(t); osc.stop(t + duration + .03);
    }

    noise(duration = .2, volume = .12, filterFreq = 1600, type = 'lowpass', delay = 0) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || !this.noiseBuffer) return;
      const t = this.ctx.currentTime + delay;
      const src = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      src.buffer = this.noiseBuffer;
      filter.type = type;
      filter.frequency.value = filterFreq;
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
      src.connect(filter).connect(gain).connect(this.master);
      src.start(t, Math.random()); src.stop(t + duration + .02);
    }

    startCharge() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || this.chargeOsc) return;
      this.chargeOsc = this.ctx.createOscillator();
      this.chargeGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 420;
      this.chargeOsc.type = 'sawtooth';
      this.chargeOsc.frequency.value = 43;
      this.chargeGain.gain.value = .0001;
      this.chargeOsc.connect(filter).connect(this.chargeGain).connect(this.master);
      this.chargeGain.gain.exponentialRampToValueAtTime(.085, this.ctx.currentTime + .18);
      this.chargeOsc.start();
      this.tone(82, .18, 'square', .06, 56);
    }

    updateCharge(value) {
      if (!this.ctx || !this.chargeOsc) return;
      this.chargeOsc.frequency.setTargetAtTime(43 + value * 180, this.ctx.currentTime, .035);
      this.chargeGain.gain.setTargetAtTime(.055 + value * .11, this.ctx.currentTime, .035);
    }

    stopCharge() {
      if (!this.ctx || !this.chargeOsc) return;
      const osc = this.chargeOsc;
      this.chargeGain.gain.setTargetAtTime(.0001, this.ctx.currentTime, .03);
      setTimeout(() => { try { osc.stop(); } catch {} }, 130);
      this.chargeOsc = null; this.chargeGain = null;
    }

    startEngine() {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx || this.engineOsc) return;
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass'; filter.frequency.value = 740;
      this.engineOsc.type = 'sawtooth'; this.engineOsc2.type = 'square';
      this.engineOsc.frequency.value = 68; this.engineOsc2.frequency.value = 34;
      this.engineGain.gain.value = .0001;
      this.engineOsc.connect(filter); this.engineOsc2.connect(filter); filter.connect(this.engineGain).connect(this.master);
      this.engineGain.gain.exponentialRampToValueAtTime(.046, this.ctx.currentTime + .24);
      this.engineOsc.start(); this.engineOsc2.start();
    }

    updateEngine(speed, overdrive) {
      if (!this.ctx || !this.engineOsc) return;
      const base = 68 + speed * .075 + (overdrive ? 95 : 0);
      this.engineOsc.frequency.setTargetAtTime(base, this.ctx.currentTime, .05);
      this.engineOsc2.frequency.setTargetAtTime(base * .5, this.ctx.currentTime, .05);
      this.engineGain.gain.setTargetAtTime(overdrive ? .075 : .045, this.ctx.currentTime, .06);
    }

    stopEngine() {
      if (!this.ctx || !this.engineOsc) return;
      const a = this.engineOsc, b = this.engineOsc2;
      this.engineGain.gain.setTargetAtTime(.0001, this.ctx.currentTime, .04);
      setTimeout(() => { try { a.stop(); b.stop(); } catch {} }, 180);
      this.engineOsc = null; this.engineOsc2 = null; this.engineGain = null;
    }

    launch() { this.noise(.42, .22, 650, 'lowpass'); this.tone(54, .52, 'sawtooth', .2, 245); this.tone(30, .3, 'sine', .25, 24); }
    clampRelease() { this.tone(250, .06, 'square', .09, 115); this.noise(.09, .08, 1900, 'highpass', .01); }
    impact(severity = 1) { this.tone(56 - severity * 2.5, .34, 'sine', .32, 24); this.noise(.2 + severity * .018, .27, 1050, 'lowpass'); this.noise(.08, .11, 2200, 'highpass'); this.tone(162, .07, 'square', .08, 82); }
    survive() { this.tone(510, .1, 'triangle', .11, 710); this.tone(790, .18, 'sine', .085, 1120, .075); }
    cashout() { [392, 523, 659, 784].forEach((f, i) => this.tone(f, .18, 'sine', .12, f * 1.035, i * .052)); }
    crash() { this.noise(.86, .5, 620, 'lowpass'); this.noise(.28, .25, 2400, 'highpass'); this.tone(71, .92, 'sawtooth', .4, 21); this.tone(215, .3, 'square', .14, 40); }
    overdrive() { this.noise(.38, .2, 1700, 'highpass'); [92,138,184,276].forEach((f,i) => this.tone(f,.48,'sawtooth',.085,f*1.8,i*.055)); }
  }

  class TakkarGame {
    constructor() {
      this.ctx = ui.canvas.getContext('2d', { alpha: false, desynchronized: true });
      this.tg = new TelegramBridge();
      this.server = new ServerClient(this.tg);
      this.audio = new AudioEngine();
      this.phase = 'idle';
      this.balance = 10000;
      this.bet = 100;
      this.multiplier = 1;
      this.charge = 0;
      this.chargeStarted = 0;
      this.launchT = 0;
      this.speed = 0;
      this.targetSpeed = 0;
      this.distance = 0;
      this.wheelAngle = 0;
      this.wheelSpin = 0;
      this.damage = 0;
      this.impactCount = 0;
      this.currentObstacle = null;
      this.obstacleDelay = 0;
      this.freezeUntil = 0;
      this.survivalUntil = 0;
      this.overdrive = false;
      this.overdriveIntroUntil = 0;
      this.overdriveAt = null;
      this.plan = null;
      this.serverRound = false;
      this.pendingServerResult = null;
      this.cashoutPending = false;
      this.roundId = '';
      this.roundSeed = '';
      this.roundCommit = '';
      this.resultUntil = 0;
      this.history = [1.10, 1.28, 0, 2.05, 1.54, 4.11, 0, 2.87, 8.16];
      this.particles = [];
      this.debris = [];
      this.smoke = [];
      this.shake = 0;
      this.flash = 0;
      this.cameraZoom = 1;
      this.cameraTargetZoom = 1;
      this.cameraX = 0;
      this.cameraTargetX = 0;
      this.wheelSquash = 0;
      this.wheelBounce = 0;
      this.appActive = true;
      this.soundEnabled = true;
      this.hapticsEnabled = true;
      this.reducedMotion = false;
      this.qualityChoice = 'auto';
      this.quality = 'high';
      this.dpr = 1;
      this.w = 0; this.h = 0;
      this.roadY = 0; this.wheelX = 0; this.wheelY = 0; this.wheelR = 0;
      this.lastTime = performance.now();
      this.fpsFrames = 0; this.fpsTime = this.lastTime; this.fps = 60;
      this.lastHapticTick = 0;
      this.lastUiSync = 0;
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(ui.stage);
      this.detectQuality();
      this.bindUI();
      this.tg.init();
      this.connectServer();
      this.syncUI(true);
      this.renderHistory();
      this.resize();
      this.boot();
      requestAnimationFrame((t) => this.loop(t));
    }

    async connectServer() {
      const response = await this.server.connect();
      if (!response) {
        ui.network.querySelector('span').textContent = this.tg.tg ? 'LOCAL DEMO FALLBACK' : 'BROWSER DEMO';
        ui.fairnessMode.textContent = 'LOCAL DEMO';
        return;
      }
      this.balance = Number(response.balance) || this.balance;
      ui.network.querySelector('span').textContent = 'AUTHORITATIVE DEMO';
      ui.fairnessMode.textContent = 'SERVER DEMO';
      this.syncUI(true);
    }

    async boot() {
      const stages = [
        [18, 'CALIBRATING WHEEL MASS'], [38, 'PRESSURIZING LAUNCH ENGINE'],
        [61, 'SYNCING IMPACT TRACK'], [83, 'ARMING CASH OUT'], [100, 'READY']
      ];
      for (const [value, text] of stages) {
        ui.bootBar.style.width = `${value}%`; ui.bootText.textContent = text;
        await new Promise((resolve) => setTimeout(resolve, value === 100 ? 180 : 120));
      }
      ui.app.hidden = false;
      requestAnimationFrame(() => {
        ui.boot.classList.add('is-hidden');
        setTimeout(() => ui.boot.remove(), 520);
      });
    }

    detectQuality() {
      const cores = navigator.hardwareConcurrency || 4;
      const memory = navigator.deviceMemory || 4;
      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const lowPower = cores <= 4 || memory <= 3 || (/Android/i.test(navigator.userAgent) && cores <= 6);
      this.quality = lowPower ? 'balanced' : (mobile ? 'high' : 'high');
    }

    applyQuality(choice) {
      this.qualityChoice = choice;
      if (choice !== 'auto') this.quality = choice;
      else this.detectQuality();
      this.resize();
    }

    resize() {
      const rect = ui.stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      this.w = rect.width; this.h = rect.height;
      const maxDpr = this.quality === 'high' ? 1.8 : this.quality === 'balanced' ? 1.35 : 1;
      this.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      ui.canvas.width = Math.max(1, Math.round(this.w * this.dpr));
      ui.canvas.height = Math.max(1, Math.round(this.h * this.dpr));
      ui.canvas.style.width = `${this.w}px`; ui.canvas.style.height = `${this.h}px`;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const desktop = this.w > 700;
      this.roadY = this.h * (desktop ? .73 : .72);
      this.wheelR = clamp(Math.min(this.h * .27, this.w * (desktop ? .13 : .20)), 54, desktop ? 150 : 108);
      this.wheelX = this.w * (desktop ? .42 : .34);
      this.wheelY = this.roadY - this.wheelR * .92;
    }

    bindUI() {
      const beginAction = (event) => {
        event?.preventDefault();
        this.audio.init();
        if (this.phase === 'idle') this.startCharge();
        else if (this.phase === 'running' || this.phase === 'survival' || this.phase === 'overdrive') this.cashOut();
        else if (this.phase === 'result') this.resetRound();
      };
      const endAction = (event) => {
        event?.preventDefault();
        if (this.phase === 'charging') this.releaseLaunch();
      };
      ui.action.addEventListener('pointerdown', (event) => {
        try { ui.action.setPointerCapture(event.pointerId); } catch {}
        beginAction(event);
      });
      ui.action.addEventListener('pointerup', endAction);
      ui.action.addEventListener('pointercancel', endAction);
      ui.action.addEventListener('lostpointercapture', () => { if (this.phase === 'charging') this.releaseLaunch(); });
      ui.action.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('keydown', (event) => {
        if (event.repeat) return;
        if (event.code === 'Space') { event.preventDefault(); beginAction(event); }
        if (event.key.toLowerCase() === 'c') this.cashOut();
      });
      window.addEventListener('keyup', (event) => { if (event.code === 'Space') endAction(event); });
      window.addEventListener('blur', () => { if (this.phase === 'charging') this.releaseLaunch(); });
      document.addEventListener('visibilitychange', () => this.setAppActive(!document.hidden));

      ui.betMinus.addEventListener('click', () => this.setBet(this.bet - this.betStep()));
      ui.betPlus.addEventListener('click', () => this.setBet(this.bet + this.betStep()));
      ui.betInput.addEventListener('input', () => this.setBet(Number(ui.betInput.value), false));
      ui.betInput.addEventListener('change', () => this.setBet(Number(ui.betInput.value)));
      ui.quickBets.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-value]');
        if (button) this.setBet(Number(button.dataset.value));
      });
      ui.again.addEventListener('click', () => this.resetRound());
      ui.soundButton.addEventListener('click', () => this.toggleSound());
      ui.soundToggle.addEventListener('change', () => this.setSound(ui.soundToggle.checked));
      ui.hapticToggle.addEventListener('change', () => { this.hapticsEnabled = ui.hapticToggle.checked; this.tg.haptics = this.hapticsEnabled; });
      ui.motionToggle.addEventListener('change', () => {
        this.reducedMotion = ui.motionToggle.checked;
        document.body.classList.toggle('reduced-motion', this.reducedMotion);
      });
      ui.quality.addEventListener('change', () => this.applyQuality(ui.quality.value));
      ui.fullscreen.addEventListener('click', () => this.tg.requestFullscreen());
      ui.settings.addEventListener('click', () => this.openSheet(ui.settingsSheet));
      ui.brand.addEventListener('click', () => this.openSheet(ui.infoSheet));
      ui.fairness.addEventListener('click', () => this.openSheet(ui.fairnessSheet));
      ui.sheetBackdrop.addEventListener('click', () => this.closeSheets());
      document.querySelectorAll('[data-close-sheet]').forEach((button) => button.addEventListener('click', () => this.closeSheets()));
    }

    openSheet(sheet) {
      this.closeSheets(false);
      ui.sheetBackdrop.hidden = false;
      requestAnimationFrame(() => {
        ui.sheetBackdrop.classList.add('visible');
        sheet.classList.add('open');
        sheet.setAttribute('aria-hidden', 'false');
      });
    }

    closeSheets(hide = true) {
      document.querySelectorAll('.sheet.open').forEach((sheet) => {
        sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true');
      });
      ui.sheetBackdrop.classList.remove('visible');
      if (hide) setTimeout(() => { ui.sheetBackdrop.hidden = true; }, 250);
    }

    toggleSound() { this.setSound(!this.soundEnabled); }
    setSound(value) {
      this.soundEnabled = value;
      ui.soundToggle.checked = value;
      ui.soundIcon.textContent = value ? 'SOUND ON' : 'SOUND OFF';
      this.audio.setEnabled(value);
      this.tg.select();
    }

    setAppActive(active) {
      this.appActive = active;
      if (!active) {
        if (this.phase === 'charging') this.releaseLaunch();
        this.audio.stopCharge();
        this.audio.stopEngine();
      } else if (['running','survival','overdrive'].includes(this.phase)) {
        this.audio.startEngine();
      }
      this.lastTime = performance.now();
    }

    betStep() {
      if (this.bet < 100) return 10;
      if (this.bet < 500) return 50;
      return 100;
    }

    setBet(value, snap = true) {
      if (this.phase !== 'idle') return;
      let next = Number.isFinite(value) ? value : 100;
      if (snap) next = Math.round(next / 10) * 10;
      this.bet = clamp(next, 10, Math.max(10, Math.floor(this.balance)));
      ui.betInput.value = String(Math.round(this.bet));
      this.tg.select();
      this.syncUI();
    }

    async createPlan() {
      if (this.server.connected) {
        try {
          const response = await this.server.startRound(this.bet);
          this.serverRound = true;
          this.roundId = response.roundId;
          this.roundCommit = response.commitment;
          this.balance = Number(response.balance);
          this.plan = { bustAt: null, overdriveAt: null };
          this.overdriveAt = null;
          ui.roundId.textContent = this.roundId;
          ui.roundCommit.textContent = this.roundCommit;
          return;
        } catch (error) {
          console.warn('Server round start failed; round was not launched.', error);
          throw error;
        }
      }

      this.serverRound = false;
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      this.roundSeed = [...bytes].map((v) => v.toString(16).padStart(2, '0')).join('');
      this.roundId = `TK-${Date.now().toString(36).toUpperCase()}-${this.roundSeed.slice(0,6).toUpperCase()}`;
      const roll = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
      const weights = [.215,.18,.145,.115,.09,.07,.052,.04,.032,.025,.02,.016];
      let sum = 0, bustAt = weights.length;
      for (let i = 0; i < weights.length; i++) { sum += weights[i]; if (roll < sum) { bustAt = i + 1; break; } }
      const odRoll = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
      this.overdriveAt = bustAt >= 8 && odRoll < .56 ? (odRoll < .28 ? 6 : 7) : null;
      this.plan = { bustAt, overdriveAt: this.overdriveAt };
      try {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.roundSeed));
        this.roundCommit = [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
      } catch { this.roundCommit = `demo-${this.roundSeed}`; }
      ui.roundId.textContent = this.roundId;
      ui.roundCommit.textContent = this.roundCommit;
    }

    startCharge() {
      if (this.balance < this.bet) { this.bet = Math.max(10, Math.floor(this.balance / 10) * 10); this.syncUI(); return; }
      this.phase = 'charging';
      this.charge = 0;
      this.chargeStarted = performance.now();
      this.audio.startCharge();
      this.tg.impact('soft');
      ui.intro.classList.add('is-hidden');
      this.syncUI(true);
    }

    async releaseLaunch() {
      if (this.phase !== 'charging') return;
      this.audio.stopCharge();
      this.charge = clamp(this.charge, .12, 1);
      try {
        await this.createPlan();
      } catch (error) {
        this.phase = 'idle';
        ui.intro.classList.remove('is-hidden');
        ui.statusText.textContent = error.message === 'INSUFFICIENT_BALANCE' ? 'INSUFFICIENT BALANCE' : 'SERVER UNAVAILABLE';
        this.tg.notify('error');
        this.syncUI(true);
        return;
      }
      if (!this.serverRound) this.balance -= this.bet;
      this.phase = 'launch';
      this.launchT = 0;
      this.targetSpeed = 820 + this.charge * 130;
      this.speed = 0;
      this.distance = 0;
      this.damage = 0;
      this.impactCount = 0;
      this.multiplier = 1;
      this.currentObstacle = null;
      this.obstacleDelay = .75;
      this.overdrive = false;
      this.cameraTargetZoom = 1;
      this.wheelBounce = 0;
      this.audio.clampRelease();
      setTimeout(() => this.audio.launch(), 85);
      this.audio.startEngine();
      this.tg.impact('heavy');
      this.tg.setRoundActive(true);
      ui.survival.classList.remove('visible');
      ui.result.classList.remove('visible');
      ui.overdrive.classList.remove('visible');
      this.syncUI(true);
    }

    spawnObstacle() {
      const types = [
        { name: 'STEEL JOINT', type: 'joint', severity: .75 },
        { name: 'CONCRETE LIP', type: 'curb', severity: .9 },
        { name: 'HINGED BARRIER', type: 'barrier', severity: 1.05 },
        { name: 'HYDRAULIC RAM', type: 'ram', severity: 1.2 },
        { name: 'BROKEN SLAB', type: 'gap', severity: 1.3 }
      ];
      const index = Math.min(types.length - 1, Math.floor(this.impactCount / 2));
      const choice = types[(index + Math.floor(rand(0, Math.min(3, types.length)))) % types.length];
      const gap = this.overdrive ? this.w * 1.05 : this.w * (.78 + Math.min(this.impactCount, 5) * .025);
      this.currentObstacle = {
        ...choice,
        x: this.wheelX + gap,
        y: this.roadY,
        hit: false,
        tilt: 0,
        compression: 0,
        passed: false
      };
      ui.threatName.textContent = choice.name;
      ui.nextMultiplier.textContent = `${this.nextMultiplierValue().toFixed(2)}×`;
      ui.threat.classList.add('visible');
    }

    nextMultiplierValue() {
      const values = [1.10,1.28,1.54,2.05,2.87,4.11,5.73,8.16,12.40,18.70,28.60,45.00];
      return values[Math.min(this.impactCount, values.length - 1)];
    }

    impactObstacle(now) {
      const obstacle = this.currentObstacle;
      if (!obstacle || obstacle.hit) return;
      obstacle.hit = true;
      const impactNumber = this.impactCount + 1;
      const destroyed = this.serverRound ? null : impactNumber === this.plan.bustAt;
      this.shake = this.reducedMotion ? 3 : 12 + obstacle.severity * 6;
      this.flash = 1;
      this.wheelSquash = .22 + obstacle.severity * .08;
      this.wheelBounce = destroyed ? 0 : 1;
      this.speed *= .72;
      this.audio.impact(obstacle.severity + this.damage * .08);
      this.tg.impact(destroyed ? 'heavy' : 'rigid');
      this.triggerFlash();
      this.emitImpactParticles(obstacle.x, this.wheelY + this.wheelR * .35, destroyed ? 2.2 : 1);
      this.phase = 'impactFreeze';
      this.freezeUntil = now + (this.reducedMotion ? 65 : 105);
      this.pendingDestroyed = destroyed;
      this.pendingServerResult = null;
      if (this.serverRound) {
        this.server.impact(this.roundId).then((result) => {
          this.pendingServerResult = result;
          if (Number.isFinite(result.balance)) this.balance = Number(result.balance);
        }).catch((error) => {
          this.pendingServerResult = { status: 'error', error: error.message || 'CONNECTION_LOST' };
        });
      }
      this.syncUI(true);
    }

    resolveImpact(now) {
      if (this.serverRound) {
        const result = this.pendingServerResult;
        if (!result) return;
        if (result.status === 'error') {
          this.abortServerRound(result.error);
          return;
        }
        this.pendingDestroyed = result.status === 'destroyed';
        if (this.pendingDestroyed) {
          this.impactCount = Math.max(this.impactCount, Number(result.impactCount || this.impactCount + 1) - 1);
          this.crashRound(now);
          return;
        }
        this.impactCount = Number(result.impactCount || this.impactCount + 1);
        this.damage = Number(result.damageStage || Math.min(7, this.impactCount));
        this.multiplier = Number(result.multiplier || this.nextMultiplierValueForIndex(this.impactCount - 1));
        if (result.overdrive) this.overdriveAt = this.impactCount;
      } else {
        if (this.pendingDestroyed) {
          this.crashRound(now);
          return;
        }
        this.impactCount += 1;
        this.damage = Math.min(7, this.impactCount);
        this.multiplier = this.nextMultiplierValueForIndex(this.impactCount - 1);
      }
      this.speed = Math.max(this.speed, 520);
      this.phase = 'survival';
      this.survivalUntil = now + (this.overdrive ? 480 : 720);
      this.currentObstacle.passed = true;
      this.currentObstacle.tilt = 0.01;
      this.audio.survive();
      this.tg.notify('success');
      ui.survivalKicker.textContent = 'IMPACT SURVIVED';
      ui.survivalMultiplier.textContent = `${this.multiplier.toFixed(2)}×`;
      ui.survivalHint.textContent = this.damage >= 5 ? 'THE WHEEL IS CRITICAL' : 'TAKE IT — OR TRUST THE WHEEL';
      ui.survival.classList.add('visible');
      if (this.overdriveAt && this.impactCount === this.overdriveAt) this.enterOverdrive(now);
      this.syncUI(true);
    }

    nextMultiplierValueForIndex(index) {
      const values = [1.10,1.28,1.54,2.05,2.87,4.11,5.73,8.16,12.40,18.70,28.60,45.00];
      return values[Math.min(index, values.length - 1)];
    }

    abortServerRound(message = 'CONNECTION LOST') {
      this.phase = 'result';
      this.targetSpeed = 0;
      this.audio.stopEngine();
      this.tg.setRoundActive(false);
      ui.threat.classList.remove('visible');
      ui.survival.classList.remove('visible');
      ui.result.classList.add('is-crash', 'visible');
      ui.resultKicker.textContent = 'ROUND INTERRUPTED';
      ui.resultTitle.textContent = 'CONNECTION LOST';
      ui.resultValue.textContent = message.replaceAll('_', ' ');
      this.tg.notify('error');
      this.syncUI(true);
    }

    enterOverdrive(now) {
      this.overdrive = true;
      this.phase = 'overdrive';
      this.overdriveIntroUntil = now + 1150;
      this.targetSpeed = 1220;
      this.cameraTargetZoom = 1.14;
      this.cameraTargetX = -this.w * .03;
      this.audio.overdrive();
      this.tg.impact('heavy');
      ui.overdrive.classList.add('visible');
      setTimeout(() => ui.overdrive.classList.remove('visible'), 1100);
      this.emitOverdriveBurst();
      this.syncUI(true);
    }

    crashRound(now) {
      this.phase = 'crash';
      this.speed *= .25;
      this.targetSpeed = 0;
      this.damage = 7;
      this.audio.crash();
      this.audio.stopEngine();
      this.tg.notify('error');
      this.tg.setRoundActive(false);
      this.emitCrashDebris();
      this.shake = this.reducedMotion ? 4 : 24;
      this.resultUntil = now + 1250;
      ui.threat.classList.remove('visible');
      ui.survival.classList.remove('visible');
      this.history.unshift(0);
      this.history = this.history.slice(0, 12);
      this.renderHistory();
      this.syncUI(true);
    }

    async cashOut() {
      if (!['running','survival','overdrive'].includes(this.phase) || this.cashoutPending) return;
      this.cashoutPending = true;
      const previousPhase = this.phase;
      if (this.serverRound) {
        this.phase = 'cashoutPending';
        this.syncUI(true);
        try {
          const response = await this.server.cashout(this.roundId);
          const payout = Number(response.payout || 0);
          this.balance = Number(response.balance);
          this.multiplier = Number(response.multiplier || this.multiplier);
          this.finishCashout(payout);
        } catch (error) {
          this.phase = previousPhase;
          ui.statusText.textContent = 'CASH OUT FAILED — RETRY';
          this.tg.notify('error');
          this.syncUI(true);
        } finally { this.cashoutPending = false; }
        return;
      }
      const payout = Math.round(this.bet * this.multiplier);
      this.balance += payout;
      this.finishCashout(payout);
      this.cashoutPending = false;
    }

    finishCashout(payout) {
      this.phase = 'cashed';
      this.targetSpeed = 0;
      this.speed *= .72;
      this.audio.cashout();
      this.audio.stopEngine();
      this.tg.notify('success');
      this.tg.setRoundActive(false);
      ui.threat.classList.remove('visible');
      ui.survival.classList.remove('visible');
      ui.overdrive.classList.remove('visible');
      this.history.unshift(this.multiplier);
      this.history = this.history.slice(0, 12);
      this.renderHistory();
      this.showResult(false, payout);
      this.syncUI(true);
    }

    showResult(crashed, payout = 0) {
      this.phase = 'result';
      ui.result.classList.toggle('is-crash', crashed);
      ui.resultKicker.textContent = crashed ? `DESTROYED AFTER ${this.impactCount} SURVIVAL${this.impactCount === 1 ? '' : 'S'}` : 'ROUND COMPLETE';
      ui.resultTitle.textContent = crashed ? 'WHEEL DESTROYED' : 'CASHED OUT';
      ui.resultValue.textContent = crashed ? `−${formatMoney(this.bet)}` : `+${formatMoney(payout)}`;
      ui.result.classList.add('visible');
      this.syncUI(true);
    }

    resetRound() {
      this.phase = 'idle';
      this.multiplier = 1;
      this.charge = 0;
      this.damage = 0;
      this.impactCount = 0;
      this.speed = 0;
      this.targetSpeed = 0;
      this.currentObstacle = null;
      this.serverRound = false;
      this.pendingServerResult = null;
      this.cashoutPending = false;
      this.overdrive = false;
      this.cameraTargetZoom = 1;
      this.cameraTargetX = 0;
      this.particles.length = 0;
      this.debris.length = 0;
      ui.result.classList.remove('visible');
      ui.survival.classList.remove('visible');
      ui.overdrive.classList.remove('visible');
      ui.threat.classList.remove('visible');
      ui.intro.classList.remove('is-hidden');
      this.tg.setRoundActive(false);
      this.syncUI(true);
    }

    triggerFlash() {
      ui.flash.classList.remove('fire');
      void ui.flash.offsetWidth;
      ui.flash.classList.add('fire');
    }

    emitImpactParticles(x, y, scale = 1) {
      const count = this.reducedMotion ? 12 : this.quality === 'low' ? 22 : this.quality === 'balanced' ? 38 : 58;
      for (let i = 0; i < count * scale; i++) {
        const spark = i < count * .58;
        this.particles.push({
          type: spark ? 'spark' : (Math.random() < .55 ? 'dust' : 'rubber'),
          x: x + rand(-6, 6), y: y + rand(-10, 10),
          vx: rand(-300, 420) * scale, vy: rand(-440, -40) * scale,
          life: rand(.25, spark ? .75 : 1.15), maxLife: 1,
          size: spark ? rand(1, 3.2) : rand(2, 7),
          gravity: spark ? 760 : 340,
          rotation: rand(0, TAU), spin: rand(-10, 10)
        });
      }
    }

    emitOverdriveBurst() {
      const count = this.reducedMotion ? 20 : this.quality === 'low' ? 35 : 75;
      for (let i = 0; i < count; i++) this.particles.push({
        type: 'streak', x: rand(0, this.w), y: rand(this.h * .15, this.roadY),
        vx: rand(-900, -420), vy: rand(-35, 35), life: rand(.3, .75), maxLife: 1,
        size: rand(1, 3), gravity: 0, rotation: 0, spin: 0
      });
    }

    emitCrashDebris() {
      const count = this.reducedMotion ? 12 : this.quality === 'low' ? 22 : 44;
      for (let i = 0; i < count; i++) this.debris.push({
        type: i < count * .35 ? 'metal' : 'rubber',
        x: this.wheelX + rand(-this.wheelR * .3, this.wheelR * .3),
        y: this.wheelY + rand(-this.wheelR * .3, this.wheelR * .3),
        vx: rand(-480, 620), vy: rand(-650, 80),
        life: rand(1.4, 2.6), size: rand(5, 16), rotation: rand(0, TAU), spin: rand(-12, 12)
      });
      this.emitImpactParticles(this.wheelX, this.wheelY, 2.2);
    }

    update(dt, now) {
      if (!this.appActive) return;
      this.cameraZoom = lerp(this.cameraZoom, this.cameraTargetZoom, 1 - Math.pow(.002, dt));
      this.cameraX = lerp(this.cameraX, this.cameraTargetX, 1 - Math.pow(.003, dt));
      this.shake *= Math.pow(.035, dt);
      this.flash *= Math.pow(.01, dt);
      this.wheelSquash *= Math.pow(.008, dt);
      this.wheelBounce *= Math.pow(.02, dt);

      if (this.phase === 'charging') {
        const held = (now - this.chargeStarted) / 1450;
        this.charge = clamp(held, 0, 1);
        this.audio.updateCharge(this.charge);
        if (this.charge >= 1 && now - this.lastHapticTick > 160) {
          this.tg.impact('rigid'); this.lastHapticTick = now;
        } else if (this.charge > .2 && now - this.lastHapticTick > 250 - this.charge * 120) {
          this.tg.impact(this.charge > .72 ? 'medium' : 'light'); this.lastHapticTick = now;
        }
      }

      if (this.phase === 'launch') {
        this.launchT += dt;
        const t = clamp(this.launchT / .72, 0, 1);
        this.speed = lerp(0, this.targetSpeed, easeOutCubic(t));
        if (t >= 1) {
          this.phase = 'running';
          this.spawnObstacle();
          this.syncUI(true);
        }
      }

      const moving = ['launch','running','survival','overdrive','impactFreeze','crash','cashed','result'].includes(this.phase);
      if (moving) {
        const target = ['running','survival','overdrive'].includes(this.phase) ? this.targetSpeed : this.targetSpeed;
        this.speed = lerp(this.speed, target, 1 - Math.pow(.02, dt));
        this.distance += this.speed * dt;
        this.wheelSpin = this.speed / Math.max(35, this.wheelR);
        this.wheelAngle += this.wheelSpin * dt;
        this.audio.updateEngine(this.speed, this.overdrive);
      }

      if (['running','survival','overdrive'].includes(this.phase)) {
        if (!this.currentObstacle) {
          this.obstacleDelay -= dt;
          if (this.obstacleDelay <= 0) this.spawnObstacle();
        }
        if (this.currentObstacle && !this.currentObstacle.hit) {
          this.currentObstacle.x -= this.speed * dt;
          const distance = this.currentObstacle.x - this.wheelX;
          const progress = clamp(1 - distance / Math.max(this.w * .78, 1), 0, 1);
          ui.threatProgress.style.width = `${progress * 100}%`;
          if (distance <= this.wheelR * .58) this.impactObstacle(now);
        }
      }

      if (this.phase === 'impactFreeze' && now >= this.freezeUntil && (!this.serverRound || this.pendingServerResult)) this.resolveImpact(now);

      if (this.phase === 'survival' && now >= this.survivalUntil) {
        ui.survival.classList.remove('visible');
        ui.threat.classList.remove('visible');
        this.phase = this.overdrive ? 'overdrive' : 'running';
        this.currentObstacle = null;
        this.obstacleDelay = this.overdrive ? .72 : .52;
        this.targetSpeed = this.overdrive ? 1220 : 820 + Math.min(this.impactCount, 5) * 55;
        this.syncUI(true);
      }

      if (this.phase === 'overdrive' && now >= this.overdriveIntroUntil && !this.currentObstacle) {
        this.obstacleDelay -= dt;
        if (this.obstacleDelay <= 0) this.spawnObstacle();
      }

      if (this.phase === 'crash' && now >= this.resultUntil) this.showResult(true, 0);
      if (this.phase === 'cashed') this.speed *= Math.pow(.035, dt);

      if (this.currentObstacle?.passed) {
        this.currentObstacle.tilt = Math.min(1.3, this.currentObstacle.tilt + dt * 3.5);
        this.currentObstacle.x -= this.speed * dt * .55;
      }

      this.updateParticles(dt);
      if (now - this.lastUiSync > 80) { this.syncUI(); this.lastUiSync = now; }
    }

    updateParticles(dt) {
      for (const p of this.particles) {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.gravity * dt; p.rotation += p.spin * dt;
        if (p.type === 'dust') p.vx *= Math.pow(.14, dt);
      }
      this.particles = this.particles.filter((p) => p.life > 0);
      for (const d of this.debris) {
        d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 760 * dt; d.rotation += d.spin * dt;
        if (d.y > this.roadY + 30) { d.y = this.roadY + 30; d.vy *= -.32; d.vx *= .74; }
      }
      this.debris = this.debris.filter((d) => d.life > 0);
    }

    syncUI(force = false) {
      const phaseNames = {
        idle: 'READY', charging: 'CHARGING', launch: 'LAUNCH', running: 'RUNNING', impactFreeze: 'IMPACT',
        survival: 'SURVIVED', overdrive: 'OVERDRIVE', crash: 'DESTROYED', cashed: 'CASHED OUT', cashoutPending: 'CASHING OUT', result: 'ROUND COMPLETE'
      };
      ui.phase.textContent = phaseNames[this.phase] || this.phase.toUpperCase();
      ui.multiplier.textContent = `${this.multiplier.toFixed(2)}×`;
      ui.balance.textContent = formatMoney(this.balance);
      ui.payout.textContent = formatMoney(this.bet * this.multiplier);
      ui.betInput.disabled = this.phase !== 'idle';
      ui.betMinus.disabled = this.phase !== 'idle'; ui.betPlus.disabled = this.phase !== 'idle';
      [...ui.quickBets.querySelectorAll('button')].forEach((button) => {
        button.disabled = this.phase !== 'idle';
        button.classList.toggle('active', Number(button.dataset.value) === Math.round(this.bet));
      });
      const conditionNames = ['PRISTINE','SCRATCHED','DUSTED','DEFORMED','UNSTABLE','SPARKING','CRACKED','CRITICAL'];
      ui.condition.textContent = conditionNames[Math.min(this.damage, conditionNames.length - 1)];
      ui.conditionMeter.style.width = `${(this.damage / 7) * 100}%`;
      ui.impacts.textContent = String(this.impactCount);

      ui.statusPill.classList.toggle('danger', this.damage >= 5 || this.phase === 'crash');
      ui.statusPill.classList.toggle('overdrive', this.overdrive && ['running','survival','overdrive'].includes(this.phase));
      if (this.phase === 'idle') ui.statusText.textContent = 'LAUNCH SYSTEM READY';
      else if (this.phase === 'charging') ui.statusText.textContent = `PRESSURE ${Math.round(this.charge * 100)}%`;
      else if (this.phase === 'launch') ui.statusText.textContent = 'WHEEL RELEASED';
      else if (this.phase === 'impactFreeze') ui.statusText.textContent = this.serverRound && !this.pendingServerResult ? 'VERIFYING IMPACT' : 'TAKKAR';
      else if (this.phase === 'cashoutPending') ui.statusText.textContent = 'CONFIRMING CASH OUT';
      else if (this.phase === 'crash' || (this.phase === 'result' && ui.result.classList.contains('is-crash'))) ui.statusText.textContent = 'STRUCTURAL FAILURE';
      else if (this.overdrive) ui.statusText.textContent = 'OVERDRIVE ACTIVE';
      else ui.statusText.textContent = `${this.impactCount} IMPACT${this.impactCount === 1 ? '' : 'S'} SURVIVED`;

      ui.action.classList.remove('is-launch','is-cashout','is-disabled');
      if (this.phase === 'idle') {
        ui.action.classList.add('is-launch'); ui.actionKicker.textContent = 'PRESS & HOLD'; ui.actionLabel.textContent = 'HOLD TO LAUNCH'; ui.actionSub.textContent = 'RELEASE WHEN THE ENGINE PEAKS'; ui.actionFill.style.width = '0%';
      } else if (this.phase === 'charging') {
        ui.action.classList.add('is-launch'); ui.actionKicker.textContent = `PRESSURE ${Math.round(this.charge * 100)}%`; ui.actionLabel.textContent = this.charge >= .95 ? 'RELEASE NOW' : 'BUILDING MOMENTUM'; ui.actionSub.textContent = 'THE MECHANISM IS TIGHTENING'; ui.actionFill.style.width = `${this.charge * 100}%`;
      } else if (['running','survival','overdrive'].includes(this.phase)) {
        ui.action.classList.add('is-cashout'); ui.actionKicker.textContent = this.phase === 'survival' ? 'YOU SURVIVED' : 'AVAILABLE NOW'; ui.actionLabel.textContent = `CASH OUT · ${formatMoney(this.bet * this.multiplier)}`; ui.actionSub.textContent = this.damage >= 5 ? 'THE NEXT IMPACT MAY BE THE LAST' : 'OR TRUST IT FOR ONE MORE TAKKAR'; ui.actionFill.style.width = '100%';
      } else if (this.phase === 'result') {
        ui.action.classList.add('is-launch'); ui.actionKicker.textContent = 'ROUND COMPLETE'; ui.actionLabel.textContent = 'RUN IT AGAIN'; ui.actionSub.textContent = 'ONE MORE TAKKAR'; ui.actionFill.style.width = '0%';
      } else {
        ui.action.classList.add('is-disabled'); ui.actionKicker.textContent = 'LOCKED'; ui.actionLabel.textContent = this.phase === 'cashoutPending' ? 'CONFIRMING CASH OUT' : (this.phase === 'impactFreeze' ? 'IMPACT' : 'WHEEL IN MOTION'); ui.actionSub.textContent = 'WAIT FOR THE RESULT';
      }
    }

    renderHistory() {
      ui.history.innerHTML = '';
      for (const value of this.history) {
        const chip = document.createElement('span');
        chip.textContent = value ? `${value.toFixed(2)}×` : 'BUST';
        if (!value) chip.classList.add('bust');
        else if (value >= 4) chip.classList.add('hot');
        ui.history.appendChild(chip);
      }
    }

    loop(now) {
      const dt = clamp((now - this.lastTime) / 1000, 0, .034);
      this.lastTime = now;
      this.update(dt, now);
      this.draw(now / 1000);
      this.fpsFrames++;
      if (now - this.fpsTime > 1000) {
        this.fps = Math.round(this.fpsFrames * 1000 / (now - this.fpsTime));
        ui.fps.textContent = `${this.fps} FPS`;
        this.fpsFrames = 0; this.fpsTime = now;
        if (this.qualityChoice === 'auto' && this.fps < 42 && this.quality === 'high') { this.quality = 'balanced'; this.resize(); }
      }
      requestAnimationFrame((t) => this.loop(t));
    }

    draw(time) {
      const ctx = this.ctx;
      if (!this.w || !this.h) return;
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const shakeX = this.reducedMotion ? 0 : rand(-this.shake, this.shake);
      const shakeY = this.reducedMotion ? 0 : rand(-this.shake * .55, this.shake * .55);
      ctx.translate(this.w / 2 + shakeX, this.h / 2 + shakeY);
      ctx.scale(this.cameraZoom, this.cameraZoom);
      ctx.translate(-this.w / 2 + this.cameraX, -this.h / 2);
      this.drawBackground(ctx, time);
      this.drawRoad(ctx, time);
      if (this.phase === 'idle' || this.phase === 'charging' || (this.phase === 'launch' && this.launchT < .6)) this.drawLaunchEngine(ctx, time);
      if (this.currentObstacle) this.drawObstacle(ctx, this.currentObstacle);
      this.drawSpeedEffects(ctx, time);
      if (!['crash','result'].includes(this.phase) || this.debris.length === 0) this.drawWheel(ctx, time);
      this.drawParticles(ctx);
      this.drawDebris(ctx);
      this.drawForeground(ctx, time);
      ctx.restore();
    }

    drawBackground(ctx, time) {
      const over = this.overdrive ? 1 : 0;
      const sky = ctx.createLinearGradient(0, 0, 0, this.roadY);
      sky.addColorStop(0, over ? '#140502' : '#070a0e');
      sky.addColorStop(.58, over ? '#301006' : '#11151b');
      sky.addColorStop(1, over ? '#090504' : '#05070a');
      ctx.fillStyle = sky; ctx.fillRect(-100, -100, this.w + 200, this.h + 200);

      const horizonGlow = ctx.createRadialGradient(this.w * .73, this.h * .48, 0, this.w * .73, this.h * .48, this.w * .55);
      horizonGlow.addColorStop(0, this.overdrive ? 'rgba(255,73,0,.22)' : 'rgba(255,94,15,.08)');
      horizonGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = horizonGlow; ctx.fillRect(0, 0, this.w, this.roadY);

      const parallax = (this.distance * .12) % 220;
      ctx.save(); ctx.globalAlpha = .85;
      for (let x = -220 - parallax; x < this.w + 250; x += 220) {
        ctx.fillStyle = '#151a20'; ctx.fillRect(x, this.h * .16, 22, this.roadY - this.h * .16);
        ctx.fillStyle = '#252b32'; ctx.fillRect(x + 3, this.h * .16, 4, this.roadY - this.h * .16);
        ctx.fillStyle = 'rgba(255,104,22,.13)'; ctx.fillRect(x + 9, this.h * .2, 3, this.h * .38);
        ctx.beginPath(); ctx.moveTo(x - 18, this.h * .16); ctx.lineTo(x + 90, 0); ctx.lineWidth = 13; ctx.strokeStyle = '#11161c'; ctx.stroke();
      }
      ctx.restore();

      const pipeOffset = (this.distance * .06) % 330;
      for (let x = -330 - pipeOffset; x < this.w + 330; x += 330) {
        ctx.strokeStyle = '#20262d'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x, this.h * .31); ctx.lineTo(x + 170, this.h * .31); ctx.quadraticCurveTo(x + 200, this.h * .31, x + 200, this.h * .38); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1.5; ctx.stroke();
      }

      const lightOffset = (this.distance * .18) % 175;
      for (let x = -175 - lightOffset; x < this.w + 175; x += 175) {
        ctx.fillStyle = this.overdrive ? 'rgba(255,111,28,.8)' : 'rgba(255,222,181,.65)';
        ctx.shadowColor = this.overdrive ? '#ff4c00' : '#ffc98b'; ctx.shadowBlur = this.quality === 'low' ? 8 : 18;
        ctx.fillRect(x, this.h * .105, 46, 3);
      }
      ctx.shadowBlur = 0;

      const cityOffset = (this.distance * .035) % 160;
      ctx.globalAlpha = .5;
      for (let x = -160 - cityOffset; x < this.w + 160; x += 160) {
        const height = 44 + ((x / 160) % 3 + 3) % 3 * 18;
        ctx.fillStyle = '#0e1217'; ctx.fillRect(x, this.roadY - height, 96, height);
        ctx.fillStyle = 'rgba(255,110,30,.16)';
        for (let yy = this.roadY - height + 12; yy < this.roadY - 10; yy += 18) ctx.fillRect(x + 14, yy, 4, 3);
      }
      ctx.globalAlpha = 1;
    }

    drawRoad(ctx) {
      const y = this.roadY;
      const road = ctx.createLinearGradient(0, y - 20, 0, this.h + 30);
      road.addColorStop(0, '#262a2d'); road.addColorStop(.2, '#111418'); road.addColorStop(1, '#050607');
      ctx.fillStyle = road; ctx.beginPath(); ctx.moveTo(-100, y - 18); ctx.lineTo(this.w + 100, y - 18); ctx.lineTo(this.w + 100, this.h + 100); ctx.lineTo(-100, this.h + 100); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#34393e'; ctx.fillRect(-100, y - 20, this.w + 200, 5);
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(-100, y - 17, this.w + 200, 1);

      const segment = 128;
      const offset = this.distance % segment;
      for (let x = -segment - offset; x < this.w + segment; x += segment) {
        ctx.fillStyle = 'rgba(255,255,255,.025)'; ctx.fillRect(x, y - 14, 2, this.h - y + 40);
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + 40, this.h); ctx.stroke();
        if (((x / segment) | 0) % 3 === 0) {
          ctx.fillStyle = this.overdrive ? 'rgba(255,83,0,.35)' : 'rgba(255,112,28,.17)';
          ctx.fillRect(x + 20, y + 18, 36, 3);
        }
      }
      const stripeOffset = (this.distance * 1.1) % 140;
      ctx.save(); ctx.globalAlpha = this.overdrive ? .8 : .38;
      for (let x = -140 - stripeOffset; x < this.w + 140; x += 140) {
        ctx.fillStyle = this.overdrive ? '#ff5b00' : '#bd5b1e';
        ctx.beginPath(); ctx.moveTo(x, y + 9); ctx.lineTo(x + 50, y + 9); ctx.lineTo(x + 66, y + 16); ctx.lineTo(x + 10, y + 16); ctx.fill();
      }
      ctx.restore();
    }

    drawLaunchEngine(ctx, time) {
      const x = this.wheelX - this.wheelR * 1.65;
      const y = this.wheelY - this.wheelR * .15;
      const r = this.wheelR;
      const charge = this.phase === 'charging' ? this.charge : this.phase === 'launch' ? 1 - clamp(this.launchT / .58, 0, 1) : 0;
      const vibration = this.reducedMotion ? 0 : charge * rand(-2.3, 2.3);
      ctx.save(); ctx.translate(x + vibration, y);

      ctx.fillStyle = '#090b0e'; ctx.strokeStyle = '#31363c'; ctx.lineWidth = 2;
      this.roundRect(ctx, -r * .85, -r * .8, r * 1.28, r * 1.62, r * .13); ctx.fill(); ctx.stroke();
      const panel = ctx.createLinearGradient(-r, 0, r, 0); panel.addColorStop(0, '#0b0d10'); panel.addColorStop(.5, '#24282d'); panel.addColorStop(1, '#0b0d10');
      ctx.fillStyle = panel; this.roundRect(ctx, -r * .7, -r * .64, r * .96, r * 1.28, r * .09); ctx.fill();
      ctx.fillStyle = '#ff5b00'; ctx.globalAlpha = .52 + charge * .48; ctx.fillRect(-r * .69, -r * .48, 4, r * .96); ctx.globalAlpha = 1;

      const flyX = -r * .22, flyY = -r * .1, flyR = r * .43;
      ctx.save(); ctx.translate(flyX, flyY); ctx.rotate(time * (1.2 + charge * 12));
      ctx.fillStyle = '#080a0c'; ctx.strokeStyle = '#464b51'; ctx.lineWidth = r * .08; ctx.beginPath(); ctx.arc(0, 0, flyR, 0, TAU); ctx.fill(); ctx.stroke();
      for (let i = 0; i < 3; i++) { ctx.rotate(TAU / 3); ctx.fillStyle = '#ff5b00'; ctx.fillRect(flyR * .46, -r * .045, flyR * .42, r * .09); }
      ctx.fillStyle = '#596068'; ctx.beginPath(); ctx.arc(0, 0, r * .11, 0, TAU); ctx.fill(); ctx.restore();

      const rollerX = r * .47;
      const drawRoller = (yy, rr, direction) => {
        ctx.save(); ctx.translate(rollerX, yy); ctx.rotate(direction * time * (2 + charge * 18));
        ctx.fillStyle = '#171a1e'; ctx.strokeStyle = '#5a6067'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#ff5b00'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, rr * .78, 0, TAU); ctx.stroke();
        for (let i = 0; i < 6; i++) { ctx.rotate(TAU / 6); ctx.fillStyle = '#2f3439'; ctx.fillRect(rr * .15, -2, rr * .72, 4); }
        ctx.restore();
      };
      drawRoller(r * .53, r * .2, -1); drawRoller(-r * .48, r * .16, 1);

      ctx.strokeStyle = '#40464d'; ctx.lineWidth = r * .1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(r * .05, -r * .75); ctx.lineTo(r * .49, -r * .48); ctx.stroke();
      ctx.strokeStyle = '#ff5b00'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(r * .02, -r * .76); ctx.lineTo(r * .48, -r * .49); ctx.stroke();

      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = charge > i / 4 ? '#ff6b13' : '#2d3237';
        ctx.shadowColor = '#ff5b00'; ctx.shadowBlur = charge > i / 4 ? 10 : 0;
        ctx.fillRect(-r * .58 + i * r * .17, r * .48, r * .1, r * .04);
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    drawObstacle(ctx, o) {
      ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.passed ? o.tilt : 0);
      const r = this.wheelR;
      ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 8;
      if (o.type === 'joint') {
        ctx.fillStyle = '#5b6064'; ctx.fillRect(-r * .13, -r * .18, r * .26, r * .2);
        ctx.fillStyle = '#24282c'; ctx.fillRect(-r * .07, -r * .27, r * .14, r * .09);
        ctx.fillStyle = '#ff6b13'; ctx.fillRect(-r * .13, -r * .18, r * .26, r * .035);
      } else if (o.type === 'curb') {
        const grad = ctx.createLinearGradient(-r*.4, 0, r*.4, 0); grad.addColorStop(0,'#303438'); grad.addColorStop(.5,'#74797c'); grad.addColorStop(1,'#25292d');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(-r*.38,0); ctx.lineTo(-r*.24,-r*.36); ctx.lineTo(r*.26,-r*.36); ctx.lineTo(r*.39,0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff5b00'; ctx.fillRect(-r*.23,-r*.34,r*.48,r*.045);
      } else if (o.type === 'barrier') {
        ctx.fillStyle = '#1b1e22'; this.roundRect(ctx,-r*.18,-r*1.05,r*.36,r*1.08,r*.04); ctx.fill();
        ctx.strokeStyle = '#6c7277'; ctx.lineWidth = 2; ctx.stroke();
        for (let yy=-r*.9; yy<-r*.1; yy+=r*.22) { ctx.fillStyle = yy/r % .44 < -.2 ? '#ff6510' : '#e5e8e9'; ctx.save(); ctx.translate(0,yy); ctx.rotate(-.4); ctx.fillRect(-r*.17,-r*.04,r*.34,r*.08); ctx.restore(); }
        ctx.fillStyle='#555b60'; ctx.beginPath();ctx.arc(0,0,r*.14,0,TAU);ctx.fill();
      } else if (o.type === 'ram') {
        ctx.fillStyle='#121519'; this.roundRect(ctx,-r*.55,-r*1.15,r*1.1,r*.3,r*.08);ctx.fill();
        ctx.fillStyle='#484e53';ctx.fillRect(-r*.12,-r*.86,r*.24,r*.62);
        ctx.fillStyle='#ff5b00';ctx.fillRect(-r*.15,-r*.28,r*.3,r*.06);
        ctx.fillStyle='#777d82';ctx.beginPath();ctx.moveTo(-r*.24,-r*.25);ctx.lineTo(r*.24,-r*.25);ctx.lineTo(r*.34,0);ctx.lineTo(-r*.34,0);ctx.closePath();ctx.fill();
      } else {
        ctx.fillStyle='#020304';ctx.beginPath();ctx.moveTo(-r*.55,-r*.02);ctx.lineTo(-r*.18,-r*.18);ctx.lineTo(r*.25,-r*.12);ctx.lineTo(r*.55,-r*.02);ctx.lineTo(r*.55,r*.16);ctx.lineTo(-r*.55,r*.16);ctx.closePath();ctx.fill();
        ctx.strokeStyle='#ff5b00';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-r*.56,-r*.03);ctx.lineTo(-r*.18,-r*.19);ctx.moveTo(r*.25,-r*.13);ctx.lineTo(r*.56,-r*.03);ctx.stroke();
      }
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.restore();
    }

    drawSpeedEffects(ctx, time) {
      if (this.speed < 420) return;
      const strength = clamp((this.speed - 420) / 850, 0, 1);
      const count = this.reducedMotion ? 4 : this.quality === 'low' ? 7 : 13;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < count; i++) {
        const seed = i * 91.73;
        const y = ((time * (170 + i * 13) + seed) % (this.roadY - this.h * .18)) + this.h * .15;
        const x = ((time * -(680 + i * 19) + seed * 4) % (this.w + 240)) + this.w;
        const length = 35 + strength * (85 + i * 3);
        const grad = ctx.createLinearGradient(x - length, y, x, y);
        grad.addColorStop(0, 'rgba(255,92,0,0)'); grad.addColorStop(1, `rgba(255,${this.overdrive ? 116 : 162},60,${.08 + strength * .2})`);
        ctx.strokeStyle = grad; ctx.lineWidth = this.overdrive ? 1.8 : 1; ctx.beginPath(); ctx.moveTo(x - length, y); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.restore();
    }

    drawWheel(ctx, time) {
      const r = this.wheelR;
      let x = this.wheelX;
      let y = this.wheelY;
      if (this.phase === 'idle' || this.phase === 'charging') {
        x += (this.phase === 'charging' && !this.reducedMotion ? rand(-this.charge * 2.6, this.charge * 2.6) : 0);
        y += this.phase === 'charging' ? Math.sin(time * 24) * this.charge * 1.5 : Math.sin(time * 1.8) * 1.1;
      }
      if (this.phase === 'launch') x = lerp(this.wheelX - r * .18, this.wheelX, easeOutCubic(clamp(this.launchT / .42,0,1)));
      if (this.wheelBounce > .01) y -= Math.sin((1-this.wheelBounce)*Math.PI) * r * .08;
      const wobble = this.damage >= 3 ? Math.sin(this.wheelAngle * .62) * (this.damage - 2) * .008 : 0;
      const squash = this.wheelSquash;
      const sx = 1 + squash * .22, sy = 1 - squash * .26;

      if (this.speed > 650 && !this.reducedMotion) {
        for (let i = 3; i >= 1; i--) {
          ctx.save(); ctx.globalAlpha = .025 * i; ctx.translate(x - i * 13, y); ctx.scale(1 + i*.015, 1); this.drawWheelCore(ctx, r, this.wheelAngle - i*.2, wobble, sx, sy, true); ctx.restore();
        }
      }
      ctx.save(); ctx.translate(x, y); ctx.rotate(wobble); this.drawWheelCore(ctx, r, this.wheelAngle, wobble, sx, sy, false); ctx.restore();

      if (this.damage >= 4 && this.speed > 120 && Math.random() < .48) {
        const count = this.quality === 'low' ? 1 : 2;
        for (let i=0;i<count;i++) this.particles.push({type:'spark',x:x+r*.02+rand(-8,8),y:y+r*.93,vx:rand(-150,30),vy:rand(-110,-15),life:rand(.12,.32),maxLife:1,size:rand(1,2.3),gravity:390,rotation:0,spin:0});
      }
    }

    drawWheelCore(ctx, r, angle, wobble, sx, sy, ghost) {
      ctx.scale(sx, sy);
      if (this.overdrive && !ghost) {
        const glow = ctx.createRadialGradient(0,0,r*.55,0,0,r*1.38); glow.addColorStop(0,'rgba(255,80,0,0)'); glow.addColorStop(.62,'rgba(255,80,0,.12)'); glow.addColorStop(1,'rgba(255,80,0,0)');
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,r*1.38,0,TAU);ctx.fill();
        ctx.shadowColor='#ff4f00';ctx.shadowBlur=this.quality==='low'?16:34;
      }
      const tire = ctx.createRadialGradient(-r*.26,-r*.3,r*.1,0,0,r); tire.addColorStop(0,'#3a3d40'); tire.addColorStop(.45,'#121416'); tire.addColorStop(.76,'#030405'); tire.addColorStop(1,'#17191b');
      ctx.fillStyle=tire;ctx.beginPath();ctx.arc(0,0,r,0,TAU);ctx.fill();
      ctx.shadowBlur=0;

      ctx.save();ctx.rotate(angle);
      const treadCount = this.quality === 'low' ? 14 : 22;
      for(let i=0;i<treadCount;i++){
        ctx.rotate(TAU/treadCount);
        const damagedMissing=this.damage>=6 && (i===3||i===4||i===15);
        if(damagedMissing) continue;
        ctx.fillStyle=i%2?'#26292b':'#1b1d1f';
        this.roundRect(ctx,r*.76,-r*.065,r*.25,r*.13,r*.035);ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.04)';ctx.fillRect(r*.79,-r*.047,r*.16,1.5);
      }
      ctx.restore();

      ctx.fillStyle='#08090a';ctx.beginPath();ctx.arc(0,0,r*.69,0,TAU);ctx.fill();
      const rim=ctx.createRadialGradient(-r*.2,-r*.22,r*.04,0,0,r*.66);rim.addColorStop(0,'#c9cdd0');rim.addColorStop(.2,'#555b61');rim.addColorStop(.46,'#171a1e');rim.addColorStop(.72,'#747a7f');rim.addColorStop(1,'#17191c');
      ctx.fillStyle=rim;ctx.beginPath();ctx.arc(0,0,r*.62,0,TAU);ctx.fill();
      ctx.strokeStyle=this.overdrive?'#ff6b13':'#7b8186';ctx.lineWidth=Math.max(2,r*.028);ctx.beginPath();ctx.arc(0,0,r*.59,0,TAU);ctx.stroke();

      ctx.save();ctx.rotate(angle*1.02);
      ctx.fillStyle='#4d5358';ctx.beginPath();ctx.arc(0,0,r*.42,0,TAU);ctx.fill();
      ctx.fillStyle='#1c2024';ctx.beginPath();ctx.arc(0,0,r*.36,0,TAU);ctx.fill();
      ctx.strokeStyle='#858b90';ctx.lineWidth=Math.max(1.5,r*.018);ctx.globalAlpha=.7;
      for(let i=0;i<18;i++){const a=i*TAU/18;ctx.beginPath();ctx.arc(Math.cos(a)*r*.32,Math.sin(a)*r*.32,r*.018,0,TAU);ctx.stroke();}
      ctx.globalAlpha=1;
      const spokes=8;
      for(let i=0;i<spokes;i++){
        ctx.rotate(TAU/spokes);
        const g=ctx.createLinearGradient(0,-r*.055,r*.52,r*.06);g.addColorStop(0,'#9ca1a5');g.addColorStop(.42,'#34393e');g.addColorStop(1,'#777d82');ctx.fillStyle=g;
        ctx.beginPath();ctx.moveTo(r*.1,-r*.075);ctx.lineTo(r*.51,-r*.11);ctx.lineTo(r*.55,-r*.025);ctx.lineTo(r*.16,r*.065);ctx.closePath();ctx.fill();
        ctx.fillStyle='rgba(255,255,255,.12)';ctx.beginPath();ctx.moveTo(r*.17,-r*.048);ctx.lineTo(r*.48,-r*.075);ctx.lineTo(r*.5,-r*.055);ctx.lineTo(r*.2,-r*.022);ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle='#111418';ctx.beginPath();ctx.arc(0,0,r*.17,0,TAU);ctx.fill();
      const hub=ctx.createRadialGradient(-r*.04,-r*.05,0,0,0,r*.13);hub.addColorStop(0,'#d4d6d7');hub.addColorStop(.4,'#666b70');hub.addColorStop(1,'#1b1e21');ctx.fillStyle=hub;ctx.beginPath();ctx.arc(0,0,r*.12,0,TAU);ctx.fill();
      ctx.strokeStyle='#ff5b00';ctx.lineWidth=Math.max(2,r*.022);ctx.beginPath();ctx.arc(0,0,r*.2,0,TAU);ctx.stroke();

      if(this.damage>0&&!ghost)this.drawDamage(ctx,r,angle);
      if(this.overdrive&&!ghost){ctx.strokeStyle='rgba(255,100,20,.9)';ctx.lineWidth=Math.max(2,r*.025);ctx.shadowColor='#ff4d00';ctx.shadowBlur=18;ctx.beginPath();ctx.arc(0,0,r*.73,0,TAU);ctx.stroke();ctx.shadowBlur=0;}
    }

    drawDamage(ctx,r,angle){
      ctx.save();ctx.rotate(angle*.18);
      const count=Math.min(this.damage+1,7);
      ctx.lineCap='round';
      for(let i=0;i<count;i++){
        const a=-1.1+i*.43;const rr=r*(.55+(i%2)*.12);
        ctx.strokeStyle=this.damage>=5?'rgba(255,96,15,.86)':'rgba(210,216,220,.35)';ctx.lineWidth=Math.max(1,r*.012);
        ctx.beginPath();ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr);ctx.lineTo(Math.cos(a+.13)*rr*.86,Math.sin(a+.13)*rr*.86);ctx.lineTo(Math.cos(a-.05)*rr*.76,Math.sin(a-.05)*rr*.76);ctx.stroke();
      }
      if(this.damage>=4){ctx.fillStyle='rgba(255,76,0,.3)';ctx.beginPath();ctx.arc(r*.46,r*.34,r*.12,0,TAU);ctx.fill();}
      if(this.damage>=6){ctx.fillStyle='#030405';ctx.beginPath();ctx.moveTo(r*.7,-r*.25);ctx.arc(0,0,r*.98,-.34,.18);ctx.closePath();ctx.fill();}
      ctx.restore();
    }

    drawParticles(ctx) {
      ctx.save();
      for(const p of this.particles){
        const alpha=clamp(p.life/(p.maxLife||1),0,1);ctx.globalAlpha=alpha;
        if(p.type==='spark'){
          ctx.strokeStyle='#ffb14a';ctx.shadowColor='#ff5b00';ctx.shadowBlur=8;ctx.lineWidth=p.size;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.018,p.y-p.vy*.018);ctx.stroke();
        }else if(p.type==='streak'){
          ctx.strokeStyle='rgba(255,104,22,.7)';ctx.lineWidth=p.size;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-120,p.y);ctx.stroke();
        }else{
          ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rotation);ctx.fillStyle=p.type==='rubber'?'#121416':'rgba(151,130,110,.35)';
          if(p.type==='dust'){ctx.beginPath();ctx.arc(0,0,p.size*1.8,0,TAU);ctx.fill();}else ctx.fillRect(-p.size/2,-p.size/3,p.size,p.size*.66);ctx.restore();
        }
      }
      ctx.shadowBlur=0;ctx.globalAlpha=1;ctx.restore();
    }

    drawDebris(ctx){
      for(const d of this.debris){ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.rotation);ctx.globalAlpha=clamp(d.life/1.4,0,1);ctx.fillStyle=d.type==='metal'?'#8b9196':'#111315';ctx.strokeStyle=d.type==='metal'?'#ff6b13':'#2c3033';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-d.size,-d.size*.35);ctx.lineTo(d.size*.65,-d.size*.55);ctx.lineTo(d.size,d.size*.32);ctx.lineTo(-d.size*.45,d.size*.7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();}
      ctx.globalAlpha=1;
    }

    drawForeground(ctx,time){
      const offset=(this.distance*.38)%260;
      ctx.globalAlpha=.34;
      for(let x=-260-offset;x<this.w+260;x+=260){ctx.fillStyle='#050607';ctx.fillRect(x,this.roadY+this.h*.11,70,this.h*.18);ctx.fillStyle='rgba(255,91,0,.12)';ctx.fillRect(x+55,this.roadY+this.h*.11,4,this.h*.18);}
      ctx.globalAlpha=1;
      if(this.overdrive){const g=ctx.createLinearGradient(0,0,this.w,0);g.addColorStop(0,'rgba(255,65,0,.12)');g.addColorStop(.5,'rgba(255,65,0,0)');g.addColorStop(1,'rgba(255,65,0,.12)');ctx.fillStyle=g;ctx.fillRect(0,0,this.w,this.h);}
      if(this.phase==='charging'){const v=this.charge;ctx.fillStyle=`rgba(255,76,0,${v*.06})`;ctx.fillRect(0,0,this.w,this.h);}
    }

    roundRect(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  }

  let game;
  window.addEventListener('DOMContentLoaded', () => { game = new TakkarGame(); window.__TAKKAR__ = game; });
})();
