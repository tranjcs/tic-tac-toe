/* global io */
'use strict';

(() => {
  // Keep in sync with src/constants.js.
  const Status = { WAITING: 'waiting', PLAYING: 'playing', IN_LINE: 'in-line' };
  const Events = { STATE: 'state', MOVE: 'move' };
  const DRAW = 'draw';
  const BOARD_SIZE = 9;

  const socket = io();
  const boardEl = document.getElementById('board');
  const statusEl = document.getElementById('status');
  const detailEl = document.getElementById('detail');

  const cells = Array.from({ length: BOARD_SIZE }, (_, index) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.addEventListener('click', () => socket.emit(Events.MOVE, index));
    boardEl.appendChild(cell);
    return cell;
  });

  function resultText(result, myMark) {
    if (result === DRAW) return "It's a draw!";
    if (!myMark) return `${result} wins!`;
    return result === myMark ? 'You win! 🎉' : 'You lose.';
  }

  function describe(state) {
    switch (state.status) {
      case Status.WAITING:
        return { status: 'Waiting for another player…', detail: '' };
      case Status.IN_LINE:
        return {
          status: state.position === 1 ? "You're next in line" : `You're #${state.position} in line`,
          detail: state.result ? resultText(state.result, null) : `Watching: ${state.turn}'s turn`,
        };
      case Status.PLAYING: {
        const myTurn = !state.result && state.turn === state.mark;
        return {
          status: state.result ? resultText(state.result, state.mark) : myTurn ? 'Your turn' : "Opponent's turn",
          detail: `You are ${state.mark}${state.result ? ' — next game starting soon' : ''}`,
        };
      }
      default:
        return { status: '', detail: '' };
    }
  }

  function render(state) {
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

    const text = describe(state);
    statusEl.textContent = text.status;
    detailEl.textContent = text.detail;
  }

  socket.on(Events.STATE, render);
  socket.on('disconnect', () => {
    statusEl.textContent = 'Disconnected — reconnecting…';
    detailEl.textContent = '';
    cells.forEach((cell) => { cell.disabled = true; });
  });
})();
