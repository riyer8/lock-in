# Running it

The [README](../README.md) is the short version. This is env vars, the HTTP routes, tests, and the bits of [PRODUCT.md](PRODUCT.md) that the code hasn't caught up to yet.

## Load the extension

1. `chrome://extensions`
2. Developer mode on
3. **Load unpacked**
4. Pick this repo folder (has `manifest.json`)
5. Open a new tab

Everything stays on the machine (`chrome.storage.local`). Copy `src/config/personal.example.js` to `src/config/personal.js` if you want your own arc dates and name. Git ignores that copy.

Works in Chrome, Edge, Brave, Arc, whatever Chromium that will load an unpacked MV3 extension. `npm run setup-coach` drops a native host on macOS for those.

## Coach

Python 3.9+. No pip. Node is only for tests and `npm run setup-coach`.

1. Copy `.env.example` to `.env`
2. Set `OPENAI_DEVELOPER_KEY`
3. `OPENAI_MODEL` is optional (default `gpt-5.6-luna`)
4. Load the unpacked extension first so the helper can find its id
5. `npm run setup-coach` once (`python3 server/setup_coach.py` is the same)
6. Reload LOCK IN
7. New tab → **Coach**

That script writes a tiny native-messaging launcher so Chrome can boot `http://127.0.0.1:8787` after a reboot. Move the folder, run it again.

Or just run it yourself:

```bash
python3 server/server.py
# or: npm start
```

The new tab sends about a week of stuff (blueprint, recent audits, events, today's missions). The key never leaves that process.

If you've been missing a lot, the plan gets smaller. Miss the same behavior three days in a row and Audit asks "was the plan unrealistic?" instead of shaming you about a streak.

### Routes

| Route | What you get |
| --- | --- |
| `POST /api/plan` | Today's 3–5 missions from that week of context |
| `POST /api/coach` | One observation, a pattern, a next action, a proposed change |
| `POST /api/adapt` | Tomorrow's plan, rewritten from that proposal |
| `POST /api/coach/chat` | Keep talking, same bound |
| `GET /health` | Is it up |

### Env

Repo-root `.env` (gitignored). If the variable is already in the process environment, that wins.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `OPENAI_DEVELOPER_KEY` | If you want coach/plan/adapt/chat | — | Missing → `503` `MISSING_API_KEY` |
| `OPENAI_MODEL` | No | `gpt-5.6-luna` | OpenAI Responses API |
| `COACH_HOST` | No | `127.0.0.1` | Keep it loopback. Random websites get `403` |
| `COACH_PORT` | No | `8787` | Extension is hardcoded to `127.0.0.1:8787`. Changing the port here without changing `manifest.json` and `src/newtab/newtab.js` just means the new tab can't find you |
| `LOCK_IN_EXTENSION_ID` | No | sniffed from Chrome prefs | 32-char unpacked id (`a`–`p`). Set this if `setup-coach` can't find LOCK IN |

## It's broken

**Something else grabbed 8787.** `curl -s http://127.0.0.1:8787/health` should say `{"ok": true, "service": "lock-in-coach"}`, and `POST /api/plan` should not 404. If some other node/python thing is sitting there, kill it. Don't just change `COACH_PORT`. The extension still calls 8787.

**No API key.** Coach will complain. Server says `503` / `MISSING_API_KEY`. `.env` has to be in the **repo root**, the name is `OPENAI_DEVELOPER_KEY` (not `OPENAI_API_KEY`), and you have to restart `python3 server/server.py` after you edit it.

**Extension can't see the server.**

1. `curl -s http://127.0.0.1:8787/health` on this machine
2. `chrome://extensions` → LOCK IN loaded, no red errors, **Reload** after setup
3. It is only allowed to hit `http://127.0.0.1:8787/*`. That's on purpose
4. Health works but Coach won't start after reboot → `npm run setup-coach` **after** loading unpacked, then reload. Moving the repo breaks the launcher path

**`setup-coach` can't find the extension.** Load unpacked first. Or paste the id from `chrome://extensions` into `LOCK_IN_EXTENSION_ID`.

**OpenAI comes back empty / 502.** Key, model, or the API had a bad day. The extension never sees the key. If the native helper started the process, look at `server/.generated/coach.log`.

## Tests

```bash
npm test
```

`node --test` then `python3 -m unittest discover -s tests -p 'test_*.py'`. Node 20.6+.

## Built vs still a wish

[PRODUCT.md](PRODUCT.md) is what I'm steering toward. The code isn't all the way there:

- Experiments exist under the hood and show a result on Audit. No Experiments tab yet
- Coach sees ~7 days, not "I learned when you have energy"
- Food is a goal area (`health-food`), not a meal log. Sleep / energy / fitness check-ins are on Audit
- Today currently shows **up to three** saved plan items, even though the planner can do 3–5

How to work in this repo: [AGENTS.md](../AGENTS.md).
