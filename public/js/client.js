/* global io */
'use strict';

(() => {
  // Keep in sync with src/constants.js.
  const Status = { WAITING: 'waiting', PLAYING: 'playing', IN_LINE: 'in-line' };
  const Events = { STATE: 'state', MOVE: 'move' };
  const DRAW = 'draw';
  const BOARD_SIZE = 9;
  const NAME_KEY = 'tic-tac-toe:name';
  // Keep in sync with WINNING_LINES in src/game.js.
  const WINNING_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  const CONFETTI_PIECES = 24;

  // sessionStorage is per tab, so each tab is its own player. It can throw in
  // private windows or with storage blocked; the game works without it.
  const storage = {
    get() {
      try { return sessionStorage.getItem(NAME_KEY); } catch { return null; }
    },
    set(value) {
      try { sessionStorage.setItem(NAME_KEY, value); } catch { /* ignore */ }
    },
  };

  // Send the saved name on every (re)connect so the server can give it back.
  const socket = io({ auth: (cb) => cb({ name: storage.get() }) });

  const el = (id) => document.getElementById(id);
  const boardEl = el('board');
  const meEl = el('me');
  const matchupEl = el('matchup');
  const statusEl = el('status');
  const detailEl = el('detail');
  const lineListEl = el('line-list');
  const lineEmptyEl = el('line-empty');
  const spectateOverlayEl = el('spectate-overlay');
  const confettiEl = el('confetti');

  // Each piece gets its own spot, delay and spin through CSS custom properties.
  for (let i = 0; i < CONFETTI_PIECES; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti__piece';
    piece.style.setProperty('--x', `${(i / CONFETTI_PIECES) * 100 + Math.random() * 4}%`);
    piece.style.setProperty('--delay', `${Math.random() * 0.6}s`);
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    piece.style.setProperty('--spin', `${360 + Math.random() * 720}deg`);
    piece.style.setProperty('--hue', `${Math.floor(Math.random() * 360)}`);
    confettiEl.appendChild(piece);
  }

  const cells = Array.from({ length: BOARD_SIZE }, (_, index) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.addEventListener('click', () => socket.emit(Events.MOVE, index));
    boardEl.appendChild(cell);
    return cell;
  });

  function winningCells(board) {
    const line = WINNING_LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]);
    return new Set(line || []);
  }

  /** Sets body.game-won / body.game-lost for a player whose game just ended. */
  function renderOutcome(state) {
    const decided = state.status === Status.PLAYING && state.result && state.result !== DRAW;
    document.body.classList.toggle('game-won', Boolean(decided && state.result === state.mark));
    document.body.classList.toggle('game-lost', Boolean(decided && state.result !== state.mark));
  }

  function resultText(state) {
    if (state.result === DRAW) return "It's a draw!";
    if (state.status === Status.PLAYING) {
      return state.result === state.mark ? 'You win! 🎉' : 'You lose.';
    }
    return `${state.players[state.result]} wins!`;
  }

  function describe(state) {
    switch (state.status) {
      case Status.WAITING:
        return { status: 'Waiting for another player…', detail: '' };
      case Status.IN_LINE:
        return {
          status: state.position === 1 ? "You're next in line" : `You're #${state.position} in line`,
          detail: state.result ? resultText(state) : `Watching: ${state.players[state.turn]}'s turn`,
        };
      case Status.PLAYING: {
        const myTurn = !state.result && state.turn === state.mark;
        return {
          status: state.result ? resultText(state) : myTurn ? 'Your turn' : "Opponent's turn",
          detail: `You are ${state.mark}${state.result ? ' — next game starting soon' : ''}`,
        };
      }
      default:
        return { status: '', detail: '' };
    }
  }

  function renderMatchup(state) {
    matchupEl.replaceChildren();
    if (!state.players) return;
    const player = (mark) => {
      const span = document.createElement('span');
      span.className = 'matchup__player';
      if (!state.result && state.turn === mark) span.classList.add('matchup__player--turn');
      span.textContent = `${state.players[mark]} (${mark})`;
      return span;
    };
    matchupEl.append(player('X'), ' vs ', player('O'));
  }

  function renderLine(state) {
    const items = state.line.map((name) => {
      const li = document.createElement('li');
      li.textContent = name === state.name ? `${name} (you)` : name;
      if (name === state.name) li.className = 'line__you';
      return li;
    });
    lineListEl.replaceChildren(...items);
    lineListEl.hidden = items.length === 0;
    lineEmptyEl.hidden = items.length > 0;
  }

  // --- Analytics: game events for public/js/analytics.js (a no-op when GA is off) ---

  const CENTER = 4;
  const CORNERS = new Set([0, 2, 6, 8]);
  const cellType = (cell) => (cell === CENTER ? 'center' : CORNERS.has(cell) ? 'corner' : 'edge');
  const secondsSince = (time) => Math.round((Date.now() - time) / 1000);
  const track = (name, params) => window.analytics.track(name, params);

  // The game this client is playing in (null when not playing), and when it started
  // waiting for a game (null when not waiting).
  let currentGame = null;
  let queuedSince = null;
  let queuedFrom = null;

  /** Reports a game this client was playing as abandoned, if it hadn't finished. */
  function abandonGame(reason) {
    if (currentGame && !currentGame.ended) {
      track('game_abandon', {
        reason,
        mark: currentGame.mark,
        moves_made: currentGame.movesSeen,
        duration_sec: secondsSince(currentGame.startedAt),
      });
    }
    currentGame = null;
  }

  function trackState(state) {
    const playing = state.status === Status.PLAYING;
    if (currentGame && (!playing || state.gameId !== currentGame.id)) {
      // Our game went away before it finished, while we stayed connected.
      abandonGame('opponent_left');
    }
    if (!playing) {
      if (queuedSince === null) {
        queuedSince = Date.now();
        queuedFrom = state.status === Status.WAITING ? 'waiting' : 'in_line';
      }
      return;
    }

    if (!currentGame) {
      // The winner stays on without waiting, so only report a wait if there was one.
      if (queuedSince !== null) {
        track('match_found', { wait_sec: secondsSince(queuedSince), came_from: queuedFrom });
        queuedSince = null;
      }
      currentGame = { id: state.gameId, mark: state.mark, startedAt: Date.now(), movesSeen: 0, ended: false };
      track('game_start', { mark: state.mark });
    }

    const moves = state.moves || [];
    for (let i = currentGame.movesSeen; i < moves.length; i += 1) {
      const mark = i % 2 === 0 ? 'X' : 'O'; // X always moves first
      if (mark === state.mark) {
        track('move', { cell: moves[i], cell_type: cellType(moves[i]), move_number: i + 1, mark });
      }
    }
    currentGame.movesSeen = moves.length;

    if (state.result && !currentGame.ended) {
      currentGame.ended = true;
      const duration = secondsSince(currentGame.startedAt);
      const opening = moves.length ? cellType(moves[0]) : undefined;
      const outcome = state.result === DRAW ? 'draw' : state.result === state.mark ? 'win' : 'loss';
      track('game_end', {
        outcome, mark: state.mark, total_moves: moves.length, duration_sec: duration, opening_move: opening,
      });
      // One report per game (from X), so game-level counts aren't doubled.
      if (state.mark === 'X') {
        track('game_complete', {
          result: state.result === DRAW ? 'draw' : `${state.result.toLowerCase()}_win`,
          opening_move: opening,
          opening_cell: moves[0],
          total_moves: moves.length,
          duration_sec: duration,
        });
      }
    }
  }

  function render(state) {
    trackState(state);
    storage.set(state.name);
    meEl.textContent = `You are ${state.name}`;

    const board = state.board || Array(BOARD_SIZE).fill(null);
    const canMove = state.status === Status.PLAYING && !state.result && state.turn === state.mark;
    const winners = winningCells(board);
    cells.forEach((cell, index) => {
      const mark = board[index];
      cell.textContent = mark || '';
      cell.className = mark ? `cell cell--${mark}` : 'cell';
      if (winners.has(index)) cell.classList.add('cell--win');
      cell.disabled = !canMove || Boolean(mark);
      cell.setAttribute('aria-label', `Cell ${index + 1}: ${mark || 'empty'}`);
    });
    boardEl.classList.toggle('board--inactive', state.status === Status.WAITING);
    document.body.classList.toggle('my-turn', canMove);
    spectateOverlayEl.hidden = state.status !== Status.IN_LINE;
    renderOutcome(state);

    renderMatchup(state);
    renderLine(state);
    const text = describe(state);
    statusEl.textContent = text.status;
    detailEl.textContent = text.detail;
  }

  socket.on(Events.STATE, render);
  socket.on('disconnect', (reason) => {
    abandonGame(reason === 'io client disconnect' ? 'idle' : 'disconnected');
    queuedSince = null; // a reconnect joins the line afresh
    // 'io client disconnect' means we paused it ourselves (see idle handling below).
    statusEl.textContent = reason === 'io client disconnect'
      ? 'Paused — tab inactive'
      : 'Disconnected — reconnecting…';
    detailEl.textContent = '';
    cells.forEach((cell) => { cell.disabled = true; });
    document.body.classList.remove('my-turn', 'game-won', 'game-lost');
    spectateOverlayEl.hidden = true;
    // The matchup and line go stale while disconnected; the next state event redraws them.
    matchupEl.replaceChildren();
    lineListEl.replaceChildren();
    lineListEl.hidden = true;
    lineEmptyEl.hidden = true;
  });

  // gtag sends with sendBeacon, so this still goes out as the page unloads.
  window.addEventListener('pagehide', () => abandonGame('left'));

  // Release the connection when the tab stays hidden, so an idle tab doesn't
  // hold a seat in line (or keep the server running and billed). Rejoins on return.
  const IDLE_DISCONNECT_MS = 60 * 1000;
  let idleTimer = null;

  document.addEventListener('visibilitychange', () => {
    clearTimeout(idleTimer);
    idleTimer = null;
    if (document.visibilityState === 'hidden') {
      idleTimer = setTimeout(() => socket.disconnect(), IDLE_DISCONNECT_MS);
    } else if (socket.disconnected) {
      statusEl.textContent = 'Reconnecting…';
      socket.connect();
    }
  });
})();
