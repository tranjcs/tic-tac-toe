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

Each visitor gets a name like **Player 3**. Everyone sees the current matchup
("Player 1 (X) vs Player 2 (O)") and the list of players waiting in line, in order.
A name is kept per browser tab, so a tab that reconnects (for example after being idle) gets the same name back.

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
scripts/
  deploy-cloudrun.sh        Build and deploy to Cloud Run
  setup-github-deploy.sh    One-time setup for the GitHub "Deploy to dev" button
public/
  index.html     Game page
  css/style.css  Styles (light and dark mode)
  js/client.js   Browser client
test/
  game.test.js   Game rules unit tests
  lobby.test.js  Line/rotation unit tests (mocked timers)
  app.test.js    End-to-end Socket.IO integration test
```

## Deploy to Google Cloud Run

Prerequisites: a Google Cloud project with billing enabled, and the
[gcloud CLI](https://cloud.google.com/sdk/docs/install) installed and logged in (`gcloud auth login`).

```bash
PROJECT_ID=your-project-id ./scripts/deploy-cloudrun.sh
```

Set `REGION` to deploy somewhere other than `us-central1`. The script enables the needed APIs,
creates an Artifact Registry repository, builds the image with Cloud Build (no local Docker needed),
deploys it, and prints the public URL.

Why the settings are what they are:

- `--max-instances 1`: players and the line live in memory, so there must be exactly one server.
  Two instances would split players into separate, invisible lobbies.
- `--cpu 1`: Cloud Run forces one connection per instance below 1 vCPU, which would break the game.
- `--timeout 3600`: Cloud Run closes any connection after at most 60 minutes. The client
  reconnects automatically, but the player rejoins at the back of the line.
- `--min-instances 0`: the server shuts down when nobody is connected, so it costs nothing while idle.
  The first visit after idle takes a few seconds longer.

### Cost

Cloud Run bills for the whole time a WebSocket is open. Roughly 50 connected hours a month are free,
then it's about $0.09 per hour (us-central1 list prices; check the
[pricing page](https://cloud.google.com/run/pricing)). To keep this near $0, the client disconnects
when its tab has been hidden for 60 seconds and reconnects when it's visible again. A player who hides the tab
mid-game for that long forfeits. Worst case, a connection held open all month costs about $60.

Set a budget alert as a safety net: in the Google Cloud console, go to **Billing → Budgets & alerts**
and create a budget of a few dollars with email alerts.

### Deploy to dev from GitHub (one click)

The **Deploy to dev** workflow (Actions → Deploy to dev → **Run workflow**) runs the tests on the
branch you pick, builds the image, and deploys it to Cloud Run. It only runs when you press the button.

GitHub logs in to Google Cloud with [Workload Identity Federation](https://github.com/google-github-actions/auth#preferred-direct-workload-identity-federation),
so no key is stored anywhere. Google only accepts logins from this repository's `dev` environment.
Project settings live in that GitHub environment, not in the code.

One-time setup:

1. Create the deploy account and identity provider (safe to rerun):

   ```bash
   PROJECT_ID=your-project-id ./scripts/setup-github-deploy.sh
   ```

   It grants the deploy account only `run.developer`, write access to the `tic-tac-toe` image
   repository, and permission to deploy as the service's runtime account.

2. In GitHub, go to **Settings → Environments → New environment**, name it `dev`, and add the four
   variables the script prints: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`.
   Optionally, restrict which branches can deploy, or require your approval for each deploy.

3. Go to **Actions → Deploy to dev → Run workflow**.

### Run with Docker locally

```bash
docker build -t tic-tac-toe .
docker run --rm -p 8080:8080 tic-tac-toe
```

Then open http://localhost:8080.

## Development

```bash
npm test       # run all tests
npm run lint   # run ESLint
```

CI runs lint and tests on Node 22 and 24 for every push and pull request.

### Branches and pull requests

`main` is the stable branch and is protected: nothing is pushed to it directly.

1. Create a branch from `main` for each change, for example `feature/rematch-button` or
   `fix/reconnect-name`. (Claude Code sessions use `claude/...` branches.)
2. Push the branch and open a pull request into `main`.
3. Merge once CI passes (`test (22)` and `test (24)`).
4. Delete the branch after merging.

To try a branch on the dev server before merging, run **Deploy to dev** and pick that branch.
