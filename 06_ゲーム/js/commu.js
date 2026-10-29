/* =========================================================
   コミュ（ADVパート）再生エンジン (commu.js)
   台本（js/data/episodes.js）を一行ずつ再生する。
   ※ゲーム側の数値や分岐条件の判定はまだ持たない（選択肢の locked は表示だけ）
   ========================================================= */

const STAGE_POSITIONS = ['left', 'center', 'right'];
const CONFIG_STORAGE_KEY = 'ntd_commu_config';

const commu = {
  isActive: false,
  episode: null,
  script: [],
  baseLength: 0, // 台本そのものの行数（選択肢で差し込んだ行は数えない）
  currentIndex: 0,
  isAuto: false,
  isTyping: false,
  isUiHidden: false,
  typeTimer: null, // requestAnimationFrame ID
  autoTimer: null,
  fxTimer: null,
  fastSkipTimer: null,
  introTimer: null,
  startGate: null, // 幕開けが明けるまで最初の文字送りを待たせる Promise
  introResolve: null,
  backlog: [],
  stage: {}, // pos -> { id, expression }
  currentBg: null,
  currentTime: '',
  currentPlace: '',
  onComplete: null,
  onChoice: null, // 選択肢を選んだときにゲーム側へ知らせる（あとで繋ぐ）
  config: { textSpeed: 28, autoWait: 1.0 }, // textSpeed: 1文字あたりのms（0で瞬間表示）

  /* =========================================================
     開始・終了
     ========================================================= */
  start(episode, onComplete = null) {
    if (!episode || !episode.script || episode.script.length === 0) return;

    this.stopTyping();
    this.stopFastSkip();
    clearTimeout(this.autoTimer);
    clearTimeout(this.fxTimer);

    this.isActive = true;
    this.episode = episode;
    // 台本のディープコピー（選択肢の差し込みで元データを書き換えない）。_base は時間線上の位置
    this.script = JSON.parse(JSON.stringify(episode.script)).map((s, i) => ({ ...s, _base: i }));
    this.baseLength = this.script.length;
    this.currentIndex = 0;
    this.backlog = [];
    this.stage = {};
    this.currentBg = null;
    this.currentTime = episode.time || '';
    this.currentPlace = episode.place || '';
    this.onComplete = onComplete;
    this.onCompleteOriginal = onComplete;
    this.isAuto = false;
    this.isUiHidden = false;

    const modal = document.getElementById('commuAdvModal');
    if (!modal) return;
    modal.classList.remove('commu-ui-hidden', 'fx-freeze', 'fx-stretch', 'fx-rewind', 'is-closed');
    this.hide('commuEnd');
    this.hide('commuConfirm');
    this.hide('commuConfig');

    this.setText('commuEpisodeKicker', episode.kicker || 'EPISODE');
    this.setText('commuEpisodeTitle', episode.title || '');
    this.updateAutoButtonUI();
    this.buildTimeline();
    this.renderStage(null);
    this.setBackground(episode.bg);
    this.updateChrono();
    this.setText('commuDialogueText', '');
    this.hide('commuNamePlate');

    this.showIntro();
    this.showStep(0);
  },

  /* もう一度最初から */
  replay() {
    if (this.episode) this.start(this.episode, this.onCompleteOriginal || null);
  },

  close() {
    if (!this.isActive) return;
    this.isActive = false;
    this.stopTyping();
    this.stopFastSkip();
    this.closeBacklog();
    this.closeConfirm();
    clearTimeout(this.autoTimer);
    this.dismissIntro();

    const modal = document.getElementById('commuAdvModal');
    if (modal) modal.classList.add('is-closed');
    this.hide('commuChoicesBox');
    this.show('commuEnd');

    if (this.onComplete) {
      const cb = this.onComplete;
      this.onComplete = null;
      try {
        cb();
      } catch (err) {
        console.error('Error in commu.onComplete:', err);
      }
    }
  },

  /* =========================================================
     幕開け（エピソードの扉）
     ========================================================= */
  showIntro() {
    const ep = this.episode;
    this.setText('commuIntroKicker', ep.kicker || '');
    this.setText('commuIntroTitle', ep.title || '');
    this.setText('commuIntroTime', [ep.place, ep.time].filter(Boolean).join('　'));
    this.show('commuIntro');
    this.startGate = new Promise(resolve => { this.introResolve = resolve; });
    this.introTimer = setTimeout(() => this.dismissIntro(), 2400);
  },

  dismissIntro() {
    clearTimeout(this.introTimer);
    const intro = document.getElementById('commuIntro');
    if (intro && !intro.classList.contains('hidden')) {
      intro.classList.add('is-leaving');
      setTimeout(() => {
        intro.classList.add('hidden');
        intro.classList.remove('is-leaving');
      }, 500);
    }
    if (this.introResolve) {
      this.introResolve();
      this.introResolve = null;
    }
  },

  isIntroVisible() {
    const intro = document.getElementById('commuIntro');
    return intro && !intro.classList.contains('hidden') && !intro.classList.contains('is-leaving');
  },

  /* =========================================================
     一行の表示
     ========================================================= */
  showStep(index) {
    if (index >= this.script.length) {
      this.close();
      return;
    }
    this.currentIndex = index;
    const step = this.script[index];

    if (step.bg) this.setBackground(step.bg);
    if (step.time != null) this.currentTime = step.time;
    if (step.place != null) this.currentPlace = step.place;
    this.updateChrono();
    this.updateTimeline(step._base);

    this.renderStage(step);
    this.updateNamePlate(step);
    this.handleEffect(step.effect);

    const speaker = this.getSpeakerInfo(step);
    this.backlog.push({
      name: speaker ? speaker.name : '',
      color: speaker ? speaker.color : '',
      time: this.currentTime,
      text: step.text
    });

    this.typeText(step.text, () => {
      if (step.choices && step.choices.length > 0) {
        this.renderChoices(step.choices);
      } else if (this.isAuto) {
        this.scheduleAuto(step.text);
      }
    });
  },

  /* 話者の表示情報（地の文で名前の指定もなければ null） */
  getSpeakerInfo(step) {
    if (step.speaker === 'none' || !step.speaker) {
      return step.name ? { name: step.name, tag: '', color: '' } : null;
    }
    const c = (typeof CHARACTERS !== 'undefined' && CHARACTERS[step.speaker]) || {};
    return {
      name: step.name || c.name || step.speaker,
      tag: step.name ? '' : (c.tag || ''), // 名前を伏せている行では時間観の札も伏せる
      color: c.color || ''
    };
  },

  updateNamePlate(step) {
    const plate = document.getElementById('commuNamePlate');
    const modal = document.getElementById('commuAdvModal');
    if (!plate) return;
    const info = this.getSpeakerInfo(step);
    if (!info) {
      plate.classList.add('hidden');
      if (modal) modal.style.removeProperty('--speaker');
      return;
    }
    this.setText('commuPlateName', info.name);
    this.setText('commuPlateTag', info.tag);
    plate.classList.toggle('has-tag', Boolean(info.tag));
    plate.classList.toggle('is-player', step.speaker === 'player');
    if (info.color) {
      plate.style.setProperty('--plate-color', info.color);
      if (modal) modal.style.setProperty('--speaker', info.color);
    } else {
      plate.style.removeProperty('--plate-color');
      if (modal) modal.style.removeProperty('--speaker');
    }
    plate.classList.remove('hidden');
  },

  /* =========================================================
     立ち絵
     ========================================================= */
  renderStage(step) {
    if (step) {
      // 退場
      const exits = step.exit === 'all' ? Object.values(this.stage).map(e => e.id) : (step.exit || []);
      exits.forEach(id => {
        STAGE_POSITIONS.forEach(pos => {
          if (this.stage[pos] && this.stage[pos].id === id) delete this.stage[pos];
        });
      });
      // 登場（すでにいる人物は、前の表情を引き継いで指定の位置へ移る）
      (step.enter || []).forEach(e => {
        const pos = STAGE_POSITIONS.includes(e.pos) ? e.pos : 'center';
        let prevExpr = null;
        STAGE_POSITIONS.forEach(p => {
          if (this.stage[p] && this.stage[p].id === e.id) {
            prevExpr = this.stage[p].expression;
            delete this.stage[p];
          }
        });
        this.stage[pos] = { id: e.id, expression: e.expression || prevExpr || 'normal' };
      });
      // 話者の表情
      if (step.expression) {
        STAGE_POSITIONS.forEach(p => {
          if (this.stage[p] && this.stage[p].id === step.speaker) this.stage[p].expression = step.expression;
        });
      }
    }

    const speakerOnStage = step && Object.values(this.stage).some(e => e.id === step.speaker);
    document.querySelectorAll('#commuStage .stage-slot').forEach(slot => {
      const entry = this.stage[slot.dataset.pos];
      this.renderFigure(slot, entry);
      slot.classList.toggle('is-speaking', Boolean(entry && speakerOnStage && entry.id === step.speaker));
      slot.classList.toggle('is-dim', Boolean(entry && speakerOnStage && entry.id !== step.speaker));
    });
  },

  renderFigure(slot, entry) {
    if (!entry) {
      slot.classList.remove('is-on');
      slot.dataset.id = '';
      return;
    }

    if (slot.dataset.id !== entry.id) {
      const c = (typeof CHARACTERS !== 'undefined' && CHARACTERS[entry.id]) || {};
      slot.dataset.id = entry.id;
      slot.dataset.expr = '';
      slot.style.setProperty('--chara', c.color || '#9aa4b8');
      slot.innerHTML = `
        <div class="figure">
          <img class="figure-img" alt="${c.name || entry.id}" draggable="false">
          <div class="figure-placeholder">
            <svg class="ph-silhouette" viewBox="0 0 200 520" aria-hidden="true">
              <path d="M100 30c30 0 52 24 52 56s-22 60-52 60-52-28-52-60 22-56 52-56zM34 210c10-34 36-52 66-52s56 18 66 52l22 300H12z" />
            </svg>
            <span class="ph-name">${c.name || entry.id}</span>
            <span class="ph-file"></span>
          </div>
        </div>`;
      slot.classList.remove('is-on');
      // 早送りで同じフレーム内に退場していたら出さない
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (slot.dataset.id === entry.id) slot.classList.add('is-on');
      }));
    }

    if (slot.dataset.expr !== entry.expression) {
      slot.dataset.expr = entry.expression;
      this.setFigureImage(slot, entry.id, entry.expression);
    }
  },

  /* 表情の画像 → なければ normal → それもなければ仮の影 */
  setFigureImage(slot, id, expr) {
    const figure = slot.querySelector('.figure');
    const img = slot.querySelector('.figure-img');
    const file = slot.querySelector('.ph-file');
    if (!figure || !img) return;
    const wanted = getCharacterImage(id, expr);
    const fallback = getCharacterImage(id, 'normal');

    img.onload = () => {
      figure.classList.add('is-loaded');
      figure.classList.remove('is-missing');
    };
    img.onerror = () => {
      if (img.dataset.src !== fallback) {
        img.dataset.src = fallback;
        img.src = fallback;
        return;
      }
      figure.classList.remove('is-loaded');
      figure.classList.add('is-missing');
    };
    if (file) file.textContent = `${wanted}（未配置）`;
    img.dataset.src = wanted;
    img.src = wanted;
  },

  /* =========================================================
     背景（assets/bg/<id>.webp。画像がなければ地の色だけがid由来の色味で変わる）
     ========================================================= */
  setBackground(bg) {
    if (!bg || bg === this.currentBg) return;
    this.currentBg = bg;
    const a = document.getElementById('commuBgA');
    const b = document.getElementById('commuBgB');
    const modal = document.getElementById('commuAdvModal');
    if (!a || !b) return;
    const next = a.classList.contains('is-front') ? b : a;
    const prev = next === a ? b : a;
    next.style.backgroundImage = `url("assets/bg/${bg}.webp")`;
    next.classList.add('is-front');
    prev.classList.remove('is-front');

    let hash = 0;
    for (const ch of bg) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
    if (modal) modal.style.setProperty('--bg-hue', `${hash}deg`);
  },

  /* =========================================================
     上部の時刻表示とエピソードの時間線
     ========================================================= */
  updateChrono() {
    this.setText('commuTime', this.currentTime || '--:--:--');
    this.setText('commuPlace', this.currentPlace || '—');
  },

  buildTimeline() {
    const ticks = document.getElementById('commuTimelineTicks');
    if (!ticks) return;
    ticks.innerHTML = '';
    const n = this.baseLength;
    this.script.forEach((s, i) => {
      const t = document.createElement('span');
      t.className = 'timeline-tick' + (s.choices ? ' is-branch' : '');
      t.style.left = `${n > 1 ? (i / (n - 1)) * 100 : 0}%`;
      ticks.appendChild(t);
    });
  },

  updateTimeline(base) {
    const n = this.baseLength;
    const ratio = n > 1 ? base / (n - 1) : 1;
    const fill = document.getElementById('commuTimelineFill');
    const now = document.getElementById('commuTimelineNow');
    const hand = document.getElementById('commuDialHand');
    if (fill) fill.style.width = `${ratio * 100}%`;
    if (now) now.style.left = `${ratio * 100}%`;
    if (hand) hand.setAttribute('transform', `rotate(${ratio * 360} 20 20)`);
    document.querySelectorAll('#commuTimelineTicks .timeline-tick').forEach((t, i) => {
      t.classList.toggle('is-past', i <= base);
    });
  },

  /* =========================================================
     文字送り
     ========================================================= */
  stopTyping() {
    if (this.typeTimer) cancelAnimationFrame(this.typeTimer);
    this.typeTimer = null;
    this.setTypingState(false);
  },

  setTypingState(on) {
    this.isTyping = on;
    const win = document.getElementById('commuDialogueWindow');
    if (win) win.classList.toggle('is-typing', on);
  },

  getTypeSpeed() {
    const step = this.script[this.currentIndex];
    const base = Number(this.config.textSpeed) || 0;
    // 伸縮の演出中は、文字の流れを遅くする
    if (step && step.effect === 'stretch') return Math.max(base, 20) * 3;
    return base;
  },

  typeText(fullText, onComplete) {
    const textEl = document.getElementById('commuDialogueText');
    this.hide('commuChoicesBox');
    this.hide('commuNextCaret');
    if (!textEl) return;

    this.stopTyping();
    clearTimeout(this.autoTimer);

    // 幕開けの最中は文字送りを始めず、幕が明けてから同じ行を打ち直す
    if (this.startGate) {
      const gate = this.startGate;
      const stepIndex = this.currentIndex;
      this.startGate = null;
      textEl.textContent = '';
      gate.then(() => {
        if (this.isActive && this.currentIndex === stepIndex) this.typeText(fullText, onComplete);
      });
      return;
    }

    const speed = this.getTypeSpeed();
    if (speed <= 0) {
      textEl.textContent = fullText;
      this.show('commuNextCaret');
      if (onComplete) onComplete();
      return;
    }

    this.setTypingState(true);
    this.typeDone = onComplete;
    const textNode = document.createTextNode('');
    textEl.replaceChildren(textNode);

    let startTime = null;
    let shown = 0;
    const tick = (now) => {
      if (startTime === null) startTime = now;
      const target = Math.min(fullText.length, Math.floor((now - startTime) / speed) + 1);
      if (target !== shown) {
        shown = target;
        textNode.data = fullText.substring(0, shown);
      }
      if (shown >= fullText.length) {
        this.typeTimer = null;
        this.setTypingState(false);
        this.typeDone = null;
        this.show('commuNextCaret');
        if (onComplete) onComplete();
        return;
      }
      this.typeTimer = requestAnimationFrame(tick);
    };
    this.typeTimer = requestAnimationFrame(tick);
  },

  /* 文字送り中なら全文を出す（出したら true） */
  fastForwardText() {
    if (!this.isTyping) return false;
    const done = this.typeDone;
    this.stopTyping();
    this.typeDone = null;
    const step = this.script[this.currentIndex];
    this.setText('commuDialogueText', step ? step.text : '');
    this.show('commuNextCaret');
    if (done) done();
    return true;
  },

  scheduleAuto(text) {
    clearTimeout(this.autoTimer);
    const wait = Math.max(1400, (text || '').length * 60) * (Number(this.config.autoWait) || 1);
    this.autoTimer = setTimeout(() => this.next(), wait);
  },

  /* =========================================================
     選択肢
     ========================================================= */
  renderChoices(choices) {
    const container = document.getElementById('commuChoicesContainer');
    if (!container) return;
    this.hide('commuNextCaret');
    container.innerHTML = '';

    // 選べる言葉を先に、鍵のかかった言葉はうしろへまとめる
    const ordered = [...choices.filter(c => !c.locked), ...choices.filter(c => c.locked)];
    ordered.forEach((c, idx) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn' + (c.locked ? ' is-locked' : '');
      btn.style.animationDelay = `${idx * 0.06}s`;
      const num = String(idx + 1).padStart(2, '0');
      if (c.locked) {
        btn.disabled = true;
        btn.innerHTML = `
          <span class="choice-branch"></span>
          <span class="choice-num">--</span>
          <span class="choice-body">
            <span class="choice-text">……</span>
            <span class="choice-lock">${c.lockLabel || '条件を満たすと選べる言葉'}</span>
          </span>`;
      } else {
        btn.innerHTML = `
          <span class="choice-branch"></span>
          <span class="choice-num">${num}</span>
          <span class="choice-body"><span class="choice-text">${c.text}</span></span>`;
        btn.onclick = (e) => {
          e.stopPropagation();
          this.handleChoiceSelect(c);
        };
      }
      container.appendChild(btn);
    });
    this.show('commuChoicesBox');
  },

  handleChoiceSelect(choice) {
    if (choice.locked) return;
    this.hide('commuChoicesBox');
    this.stopTyping();

    const player = (typeof CHARACTERS !== 'undefined' && CHARACTERS.player) || {};
    this.backlog.push({ kind: 'choice', name: player.name || '主人公', color: player.color || '', time: this.currentTime, text: choice.text });
    if (typeof this.onChoice === 'function') this.onChoice(choice, this.script[this.currentIndex]);

    // 返答と、選択肢固有の続き（next）を次の行として差し込む
    const current = this.script[this.currentIndex];
    const inserted = [];
    if (choice.response) {
      const responder = choice.responseSpeaker || (current.speaker && current.speaker !== 'player' ? current.speaker : 'none');
      inserted.push({ speaker: responder, expression: choice.responseExpression, text: choice.response });
    }
    if (Array.isArray(choice.next)) inserted.push(...JSON.parse(JSON.stringify(choice.next)));
    inserted.forEach(s => { s._base = current._base; });
    this.script.splice(this.currentIndex + 1, 0, ...inserted);

    this.showStep(this.currentIndex + 1);
  },

  isChoiceOpen() {
    const box = document.getElementById('commuChoicesBox');
    return box && !box.classList.contains('hidden');
  },

  /* =========================================================
     演出
     ========================================================= */
  handleEffect(effect) {
    const modal = document.getElementById('commuAdvModal');
    const flash = document.getElementById('commuFlashLayer');
    const badge = document.getElementById('commuFxBadge');
    if (!modal) return;

    // 停止・伸縮はその行のあいだだけ
    modal.classList.remove('fx-freeze', 'fx-stretch');
    if (badge) badge.classList.remove('is-on');
    if (!effect) return;

    const showBadge = (label) => {
      if (!badge) return;
      badge.textContent = label;
      badge.classList.remove('is-on');
      void badge.offsetWidth;
      badge.classList.add('is-on');
    };
    const pulse = (cls) => {
      if (!flash) return;
      flash.className = 'commu-flash';
      void flash.offsetWidth;
      flash.classList.add(cls);
    };

    if (effect === 'flash') {
      pulse('is-flash');
    } else if (effect === 'fade') {
      pulse('is-fade');
    } else if (effect === 'rewind') {
      clearTimeout(this.fxTimer);
      modal.classList.remove('fx-rewind');
      void modal.offsetWidth;
      modal.classList.add('fx-rewind');
      showBadge('◀◀  REWIND');
      this.fxTimer = setTimeout(() => {
        modal.classList.remove('fx-rewind');
        if (badge) badge.classList.remove('is-on');
      }, 1100);
    } else if (effect === 'freeze') {
      modal.classList.add('fx-freeze');
      showBadge('❚❚  STOP');
    } else if (effect === 'stretch') {
      modal.classList.add('fx-stretch');
      showBadge('〜  DILATION');
    }
  },

  /* =========================================================
     操作
     ========================================================= */
  next() {
    if (!this.isActive) return;
    this.closeConfig();

    if (this.isIntroVisible()) {
      this.dismissIntro();
      return;
    }
    if (this.isUiHidden) {
      this.toggleHideUI();
      return;
    }
    if (this.fastForwardText()) return;
    if (this.isChoiceOpen()) return;

    this.showStep(this.currentIndex + 1);
  },

  toggleHideUI() {
    this.isUiHidden = !this.isUiHidden;
    const modal = document.getElementById('commuAdvModal');
    if (modal) modal.classList.toggle('commu-ui-hidden', this.isUiHidden);
  },

  toggleAuto() {
    this.isAuto = !this.isAuto;
    this.updateAutoButtonUI();
    clearTimeout(this.autoTimer);
    if (this.isAuto && !this.isTyping && !this.isChoiceOpen()) {
      const step = this.script[this.currentIndex];
      this.scheduleAuto(step ? step.text : '');
    }
  },

  updateAutoButtonUI() {
    const btn = document.getElementById('commuAutoBtn');
    if (!btn) return;
    btn.classList.toggle('active', this.isAuto);
    btn.textContent = this.isAuto ? 'AUTO ●' : 'AUTO';
  },

  /* Ctrl長押しで早送り（選択肢で止まる） */
  startFastSkip() {
    if (!this.isActive || this.fastSkipTimer) return;
    this.fastSkipTimer = setInterval(() => {
      if (!this.isActive || this.isChoiceOpen()) {
        this.stopFastSkip();
        return;
      }
      this.next();
    }, 80);
  },

  stopFastSkip() {
    if (this.fastSkipTimer) clearInterval(this.fastSkipTimer);
    this.fastSkipTimer = null;
  },

  askSkip() {
    this.stopFastSkip();
    this.show('commuConfirm');
  },

  closeConfirm() {
    this.hide('commuConfirm');
  },

  skip() {
    this.closeConfirm();
    this.close();
  },

  /* =========================================================
     会話の記録（バックログ）
     ========================================================= */
  openBacklog() {
    const modal = document.getElementById('commuBacklogModal');
    const list = document.getElementById('commuBacklogList');
    if (!modal || !list) return;
    this.stopFastSkip();

    list.innerHTML = '';
    let lastTime = null;
    this.backlog.forEach(item => {
      const row = document.createElement('div');
      row.className = 'log-row' + (item.kind === 'choice' ? ' is-choice' : '') + (item.name ? '' : ' is-narration');
      if (item.color) row.style.setProperty('--log-color', item.color);
      // 時刻は変わった行にだけ出す
      const time = item.time !== lastTime ? (item.time || '') : '';
      lastTime = item.time;
      row.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-node"></span>
        <div class="log-body">
          ${item.name ? `<span class="log-name">${item.kind === 'choice' ? '▸ 選んだ言葉 ─ ' : ''}${item.name}</span>` : ''}
          <p class="log-text"></p>
        </div>`;
      row.querySelector('.log-text').textContent = item.text;
      list.appendChild(row);
    });

    modal.classList.remove('hidden');
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  },

  closeBacklog() {
    this.hide('commuBacklogModal');
  },

  isBacklogOpen() {
    const modal = document.getElementById('commuBacklogModal');
    return modal && !modal.classList.contains('hidden');
  },

  /* =========================================================
     設定（文字速度・オート待ち。ブラウザに保存）
     ========================================================= */
  loadConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || 'null');
      if (saved) this.config = { ...this.config, ...saved };
    } catch (e) {
      // 保存できない環境では既定値のまま
    }
    this.syncConfigUI();
  },

  setConfig(key, value) {
    this.config[key] = Number(value);
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(this.config));
    } catch (e) {
      // 保存できない環境では、このページを開いているあいだだけ有効
    }
    this.syncConfigUI();
  },

  syncConfigUI() {
    const speed = document.getElementById('commuCfgSpeed');
    const auto = document.getElementById('commuCfgAuto');
    if (speed) speed.value = this.config.textSpeed;
    if (auto) auto.value = this.config.autoWait;
    this.setText('commuCfgSpeedVal', Number(this.config.textSpeed) === 0 ? '瞬間' : `${this.config.textSpeed}ms`);
    this.setText('commuCfgAutoVal', `×${Number(this.config.autoWait).toFixed(1)}`);
  },

  toggleConfig() {
    const el = document.getElementById('commuConfig');
    if (el) el.classList.toggle('hidden');
  },

  closeConfig() {
    this.hide('commuConfig');
  },

  /* =========================================================
     小さな道具
     ========================================================= */
  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  },
  show(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  },
  hide(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }
};

/* ノベルADV用のキー操作（Enter/Space: 送り・H: UI非表示・L: 会話ログ・A: オート・Ctrl長押し: 早送り・Esc: 閉じる） */
window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
  const key = e.key.toLowerCase();

  if (commu.isBacklogOpen()) {
    if (key === 'escape' || key === 'l') {
      e.preventDefault();
      commu.closeBacklog();
    }
    return;
  }
  if (key === 'escape') {
    commu.closeConfirm();
    commu.closeConfig();
    return;
  }
  if (!commu.isActive) return;

  if (e.key === 'Control') {
    commu.startFastSkip();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

  if (key === 'enter' || key === ' ') {
    // ボタンにフォーカスがあるときは、そのボタンの操作を優先する
    if (document.activeElement?.tagName === 'BUTTON') return;
    e.preventDefault();
    commu.next();
  } else if (key === 'h') {
    commu.toggleHideUI();
  } else if (key === 'l') {
    commu.openBacklog();
  } else if (key === 'a') {
    commu.toggleAuto();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'Control') commu.stopFastSkip();
});
window.addEventListener('blur', () => commu.stopFastSkip());

window.addEventListener('DOMContentLoaded', () => {
  commu.loadConfig();
  const modal = document.getElementById('commuAdvModal');
  if (!modal) return;
  // 右クリック：UIの表示／非表示
  modal.addEventListener('contextmenu', (e) => {
    if (!commu.isActive) return;
    e.preventDefault();
    commu.toggleHideUI();
  });
  // ホイール上：会話の記録を開く
  modal.addEventListener('wheel', (e) => {
    if (commu.isActive && e.deltaY < 0 && !commu.isBacklogOpen()) commu.openBacklog();
  }, { passive: true });
});
