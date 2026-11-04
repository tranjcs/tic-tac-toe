/* global io */
'use strict';

(() => {
  // Keep in sync with src/constants.js.
  const Status = { WAITING: 'waiting', PLAYING: 'playing', IN_LINE: 'in-line' };
  const Events = { STATE: 'state', MOVE: 'move' };
  const DRAW = 'draw';
  const BOARD_SIZE = 9;
  const NAME_KEY = 'tic-tac-toe:name';

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

  const cells = Array.from({ length: BOARD_SIZE }, (_, index) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.addEventListener('click', () => socket.emit(Events.MOVE, index));
    boardEl.appendChild(cell);
    return cell;
  });

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

  function render(state) {
    storage.set(state.name);
    meEl.textContent = `You are ${state.name}`;

    const board = state.board || Array(BOARD_SIZE).fill(null);
    const canMove = state.status === Status.PLAYING && !state.result && state.turn === state.mark;
    cells.forEach((cell, index) => {
      const mark = board[index];
      cell.textContent = mark || '';
      cell.className = mark ? `cell cell--${mark}` : 'cell';
      cell.disabled = !canMove || Boolean(mark);
      cell.setAttribute('aria-label', `Cell ${index + 1}: ${mark || 'empty'}`);
    });
    boardEl.classList.toggle('board--inactive', state.status === Status.WAITING);

    renderMatchup(state);
    renderLine(state);
    const text = describe(state);
    statusEl.textContent = text.status;
    detailEl.textContent = text.detail;
  }

  socket.on(Events.STATE, render);
  socket.on('disconnect', (reason) => {
    // 'io client disconnect' means we paused it ourselves (see idle handling below).
    statusEl.textContent = reason === 'io client disconnect'
      ? 'Paused — tab inactive'
      : 'Disconnected — reconnecting…';
    detailEl.textContent = '';
    cells.forEach((cell) => { cell.disabled = true; });
    // The matchup and line go stale while disconnected; the next state event redraws them.
    matchupEl.replaceChildren();
    lineListEl.replaceChildren();
    lineListEl.hidden = true;
    lineEmptyEl.hidden = true;
  });

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
