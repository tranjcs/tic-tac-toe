# Tic-Tac-Toe (Socket.IO)

A simple real-time tic-tac-toe game for two players, built with Node.js, Express and Socket.IO.

**Play it:** https://ttt.code-brew.app (open it in two tabs, or send the link to a friend).
The Cloud Run URL https://tic-tac-toe-2vsyooeshq-uc.a.run.app also works.

The first visit after a quiet spell can take a few seconds while the server starts up.

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
| `TURN_TIMEOUT_MS` | `15000` | How long a player has to move before forfeiting |
| `IDLE_TIMEOUT_MS` | `1200000` | Disconnect a client that reports no activity for this long (20 min) |
| `GA_MEASUREMENT_ID` | (none) | Google Analytics 4 ID (`G-XXXXXXXXXX`); analytics is off when unset |

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

Each turn has a 15-second limit, shown as a countdown to everyone. A player who runs out of
time loses the game and goes to the back of the line. A player who keeps timing out without
making a move for 15 minutes is disconnected (they can click to rejoin).

The server is authoritative: it validates every move, so clients can't cheat.

## Analytics

The game reports to Google Analytics 4 when `GA_MEASUREMENT_ID` is set. Google Analytics doesn't load
at all (nothing is sent to Google) when:

- `GA_MEASUREMENT_ID` isn't set (local runs, tests);
- the browser sends **Global Privacy Control** or **Do Not Track**;
- the visitor looks like they're in the **EEA, the UK or Switzerland**, judged by the browser's time zone
  (all `Europe/*` zones plus EU islands and overseas regions; an unknown time zone also counts). This
  avoids sending European visitors' data to Google at all. As a backstop, Consent Mode still denies
  analytics cookies in those regions by IP, for visitors whose time zone says otherwise.

So the numbers cover visitors outside Europe who haven't opted out.

**Collected automatically by GA4:** page views, sessions, device category, operating system, browser,
screen resolution, language, country/region (approximate, from the IP address, which GA4 doesn't store),
and the referring site. Turn off **Admin → Data collection and modification → Data collection →
Granular location and device data collection** so GA doesn't record the city either; the privacy page
says country and region only. That setting can also drop some device detail (such as device model).

**Game events** (sent by each player's browser; spectators send none):

| Event           | When                                           | Parameters |
| --------------- | ---------------------------------------------- | ---------- |
| `match_found`   | A waiting player gets into a game              | `wait_sec`, `came_from` (`waiting` / `in_line`) |
| `game_start`    | A game starts for this player                  | `mark` |
| `move`          | This player makes a move                       | `cell_type` (`center` / `corner` / `edge`), `mark` |
| `game_end`      | A game this player was in finishes             | `outcome` (`win` / `loss` / `draw`), `mark`, `total_moves`, `duration_sec`, `opening_move`, `timed_out` (a player ran out of time) |
| `game_complete` | Once per finished game (sent by the X player)  | `result` (`x_win` / `o_win` / `draw`), `opening_move`, `total_moves`, `duration_sec`, `timed_out`, `moves` (the whole game, see below) |
| `game_abandon`  | A game ends without a result                   | `reason` (`opponent_left` / `left` / `hidden` / `idle` / `kicked` / `disconnected`), `mark`, `moves_made`, `duration_sec` |

Use `game_complete` for per-game numbers (it's sent once per game) and `game_end` / `game_start`
for per-player and per-device numbers. An abandoned game is usually reported twice: by the
player who left (`left`, `hidden`, `idle`, `kicked` or `disconnected`) and by the one who stayed (`opponent_left`).

### Setup

1. In [Google Analytics](https://analytics.google.com), create a GA4 property and a **Web** data stream
   for `https://ttt.code-brew.app`. Copy its Measurement ID (`G-…`). Use this ID, not a Google Tag
   Manager container ID (`GTM-…`); the game loads Google Analytics directly and ignores any other format.
2. Set it on the service: run the deploy script with `GA_MEASUREMENT_ID=G-…`, or for the GitHub
   workflow add `GA_MEASUREMENT_ID` to the `dev` environment as an **environment secret** or an
   **environment variable** (if both exist, the secret is used). A secret only hides the ID in the
   Actions logs: it's public anyway, since every visitor's browser receives it.
   The service keeps the value across later deploys.
3. In GA, **Admin → Custom definitions**, register these event-scoped **custom dimensions**:
   `outcome`, `result`, `opening_move`, `cell_type`, `reason`, `came_from`, `mark`, `timed_out`,
   and these **custom metrics**: `duration_sec` (unit: seconds), `wait_sec` (seconds), `total_moves`, `moves_made`.
   Data is only broken down by a parameter from the moment it's registered.

### Answering common questions

Build these in **Explore** (free-form reports). Device category, browser, OS and so on are standard dimensions.

| Question | How |
| -------- | --- |
| How many games were played today? | `game_complete` event count, date = today |
| What percentage of games end in a draw? | `game_complete` count with `result` = `draw` ÷ all `game_complete` |
| Wins / losses / draws | `game_end` count by `outcome` (or `game_complete` by `result` per game) |
| Which opening move is most popular? | `game_complete` count by `opening_move` |
| Which moves do players make? | `move` count by `cell_type` |
| Average game duration | Average `duration_sec` on `game_complete` |
| Average matchmaking wait | Average `wait_sec` on `match_found` |
| Abandonment | `game_abandon` count by `reason`, with `moves_made` ("left after 3 moves") |
| Game completion rate by device | `game_end` count ÷ `game_start` count, by device category |
| Average games per session by device | `game_end` count ÷ sessions, by device category |
| Most common game lines, best replies, missed wins | Query `moves` on `game_complete` in BigQuery (see below) |

### Raw data (BigQuery)

`moves` on `game_complete` records the whole game as cell numbers in play order, X first,
for example `4,0,3,1,5`. Cells are numbered 0-8, row by row from the top left:

```
0 | 1 | 2
3 | 4 | 5
6 | 7 | 8
```

With so many different values, GA's own reports lump `moves` into "(other)", so analyze it with the free
BigQuery export instead: **Admin → Product links → BigQuery links → Link**, pick your Google Cloud
project, and choose a daily export. GA then copies every raw event (with all its parameters) into
BigQuery from that day on, where you can rebuild every game and ask any question with SQL. The export
isn't backfilled, so turn it on early. Storage for a game this size fits in BigQuery's free tier.

### Consent

Visitors who appear to be in the EEA, the UK or Switzerland, or who send Global Privacy Control or
Do Not Track, don't load Google Analytics at all, so there's no consent banner. Elsewhere GA sets its
analytics cookies. Advertising storage and personalization are denied everywhere, and Google Consent Mode
keeps analytics cookies off for European visitors whose time zone doesn't give them away.

The privacy notice at `/privacy.html` (linked from the game page) describes this. Update it if you
change what's collected.

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
  map-domain.sh             Point a custom domain (ttt.code-brew.app) at the service
public/
  index.html     Game page
  privacy.html   Privacy notice (what's collected, Google Analytics, cookies)
  css/style.css  Styles (light and dark mode)
  js/client.js   Browser client (also reports game events to analytics)
  js/analytics.js  Google Analytics loader (off unless GA_MEASUREMENT_ID is set)
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
when its tab has been hidden for 60 seconds and reconnects when it's visible again. It also disconnects
a visible tab after 15 minutes with no mouse, touch or keyboard activity, and the server disconnects a
player who has timed out on every turn for 15 minutes, so a tab left open on an unattended screen
doesn't keep the server running. As a backstop, the server also disconnects any client that hasn't reported
activity for 20 minutes, which covers old versions of the page still open in someone's browser. Worst case, a connection held open all month costs about $60.

Each deploy stores a new image in Artifact Registry. The deploy and setup scripts apply a cleanup
policy (`scripts/artifact-cleanup-policy.json`) that keeps the 5 newest images and deletes older
ones after 7 days.

Set a budget alert as a safety net: in the Google Cloud console, go to **Billing → Budgets & alerts**
and create a budget of a few dollars with email alerts.

### Deploy to dev from GitHub (one click)

The **Deploy to dev** workflow (Actions → Deploy to dev → **Run workflow**) runs the tests on the
branch you pick, builds the image, and deploys it to Cloud Run. It only runs when you press the button.

GitHub logs in to Google Cloud with [Workload Identity Federation](https://github.com/google-github-actions/auth#preferred-direct-workload-identity-federation),
so no key is stored anywhere. Google only accepts logins from this repository's `dev` environment.
Project settings are stored as **secrets** in that GitHub environment, not in the code. The repo
is public, so its Actions logs are too; GitHub masks secret values as `***` in them.

One-time setup:

1. Create the deploy account and identity provider (safe to rerun):

   ```bash
   PROJECT_ID=your-project-id ./scripts/setup-github-deploy.sh
   ```

   It grants the deploy account only `run.developer`, write access to the `tic-tac-toe` image
   repository, and permission to deploy as the service's runtime account.

2. In GitHub, go to **Settings → Environments → New environment**, name it `dev`, and add the four
   **environment secrets** the script prints: `GCP_PROJECT_ID`, `GCP_REGION`, `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`.
   Optionally, restrict which branches can deploy, or require your approval for each deploy.

3. Go to **Actions → Deploy to dev → Run workflow**.

### Custom domain (ttt.code-brew.app)

The game is served at `ttt.code-brew.app` through a
[Cloud Run domain mapping](https://cloud.google.com/run/docs/mapping-custom-domains), which is free
and comes with a Google-managed HTTPS certificate. (A load balancer would also work but costs about
$18 a month.) The mapping stays in place across deploys; this is a one-time setup.

1. Verify that you own `code-brew.app` (once per Google account; it covers every subdomain):

   ```bash
   gcloud domains verify code-brew.app
   ```

   This opens Google Search Console. Add the `TXT` record it shows at your DNS provider and click **Verify**.

2. Create the mapping. The script prints the DNS record to add:

   ```bash
   PROJECT_ID=your-project-id ./scripts/map-domain.sh
   ```

3. At your DNS provider, add the record it prints, which is normally:

   | Name  | Type    | Value                   |
   | ----- | ------- | ----------------------- |
   | `ttt` | `CNAME` | `ghs.googlehosted.com.` |

   If you use Cloudflare, set the record to **DNS only** (grey cloud), or Google can't issue the certificate.
   If the domain has `CAA` records, they must allow `pki.goog` and `letsencrypt.org`.

4. Wait for the certificate. Rerun the script to see its status; it's ready when every condition is `True`.
   This usually takes 15 to 60 minutes, sometimes a few hours. `.app` domains only work over HTTPS,
   so the site won't load at all until the certificate is issued.

To use a different domain, set `DOMAIN=play.example.com` when running the script.

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

CI runs lint and tests on Node 22 and 24 for every pull request and every push to `main`.

### Branches and pull requests

`main` is the stable branch and is protected: nothing is pushed to it directly, and every change
goes through a pull request that must pass the `ci-ok` check.

1. Create a branch from `main` for each change, named `<type>/<short-description>` (see below).
2. Push the branch and open a pull request into `main`.
3. Merge once CI passes (the `ci-ok` check is green).
4. Delete the branch after merging.

To try a branch on the dev server before merging, run **Deploy to dev** and pick that branch.

#### Branch names

Use `<type>/<short-description>`: lowercase, words separated by hyphens, a few words at most.

| Type       | Use for                                   | Example                    |
| ---------- | ----------------------------------------- | -------------------------- |
| `feature`  | New behavior players or users can see     | `feature/rematch-button`   |
| `fix`      | Bug fixes                                 | `fix/reconnect-name`       |
| `docs`     | README and other documentation only       | `docs/branch-naming`       |
| `test`     | Adding or changing tests only             | `test/lobby-disconnects`   |
| `refactor` | Code changes that don't change behavior   | `refactor/split-lobby`     |
| `ci`       | GitHub Actions and deploy scripts         | `ci/skip-duplicate-runs`   |
| `chore`    | Dependency updates and other upkeep       | `chore/update-socket-io`   |

Claude Code sessions name their own branches `claude/<generated-name>`; that's the one exception.
