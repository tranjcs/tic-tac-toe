# Tic-Tac-Toe (Socket.IO)

A simple real-time tic-tac-toe game for two players, built with Node.js, Express and Socket.IO.

## Run

Requires Node.js 22 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000 in two (or more) browser tabs. Use `npm run dev` to restart automatically on file changes.

### Configuration

| Variable          | Default | Description                                  |
| ----------------- | ------- | -------------------------------------------- |
| `PORT`            | `3000`  | HTTP port                                    |
| `RESULT_DELAY_MS` | `3000`  | How long a finished game's result is shown   |

## How it works

Every visitor is in exactly one state:

- **Waiting**: you're the only one connected and are waiting for an opponent.
- **Playing**: you're one of the two active players (first is X, second is O).
- **In line**: a game is already running; you watch it and see your position in the line.

When a game ends, the result is shown briefly. The winner stays on and the loser goes to
the back of the line (on a draw, both go to the back). If a player disconnects mid-game,
the next person in line steps in right away.

The server is authoritative: it validates every move, so clients can't cheat.

## Project structure

```
src/
  index.js       Entry point: starts the server, handles graceful shutdown
  app.js         Express + Socket.IO wiring
  lobby.js       Player line and match rotation (no networking)
  game.js        Tic-tac-toe rules (pure logic)
  constants.js   Shared enums: marks, statuses, event names
  config.js      Environment-based configuration
public/
  index.html     Game page
  css/style.css  Styles (light and dark mode)
  js/client.js   Browser client
test/
  game.test.js   Game rules unit tests
  lobby.test.js  Line/rotation unit tests (mocked timers)
  app.test.js    End-to-end Socket.IO integration test
```

## Development

```bash
npm test       # run all tests
npm run lint   # run ESLint
```

CI runs lint and tests on Node 22 and 24 for every push and pull request.
