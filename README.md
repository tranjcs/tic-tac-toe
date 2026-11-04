# Tic-Tac-Toe (Socket.IO)

A simple real-time tic-tac-toe game for two players, built with Node.js, Express and Socket.IO.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000 in two (or more) browser tabs. Set `PORT` to use a different port.

## How it works

Every visitor is in exactly one state:

- **Waiting** – you're the only one connected; waiting for an opponent.
- **Playing** – you're one of the two active players (first player is X, second is O).
- **In line** – a game is already running; you watch it and see your position in the line.

When a game ends, the result is shown for 3 seconds. The winner stays on and the loser
goes to the back of the line (on a draw, both go to the back). If a player disconnects
mid-game, the next person in line steps in right away.

The server is authoritative: it validates turns and moves, so clients can't cheat.

## Test

```bash
npm test
```
