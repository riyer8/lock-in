# Running it

The [README](../README.md) is the short version. This is load steps, tests, and the bits of [PRODUCT.md](PRODUCT.md) that the code hasn't caught up to yet.

## Load the extension

1. `chrome://extensions`
2. Developer mode on
3. **Load unpacked**
4. Pick this repo folder (has `manifest.json`)
5. Open a new tab

Everything stays on the machine (`chrome.storage.local`). Copy `src/config/personal.example.js` to `src/config/personal.js` if you want your own arc dates and name. Git ignores that copy.

Works in Chrome, Edge, Brave, Arc, whatever Chromium that will load an unpacked MV3 extension.

The gear in the nav resets the Winter Arc from today (day 1 of however many days remain through the end date) and drops archived and reached goals. It confirms twice inside LOCK IN.

If you've been missing a lot, the plan gets smaller. Miss the same behavior three days in a row and Audit asks "was the plan unrealistic?" instead of shaming you about a streak. **Try this** on Audit rewrites tomorrow locally. There is no Coach tab and no OpenAI call.

## Tests

```bash
npm test
```

`node --test`. Node 20.6+.

## Built vs still a wish

[PRODUCT.md](PRODUCT.md) is what I'm steering toward. The code isn't all the way there:

- Experiments exist under the hood and show a result on Audit. No Experiments tab yet
- Food is a goal area (`health-food`), not a meal log. Sleep / energy / fitness check-ins are on Audit
- Today currently shows **up to three** saved plan items, even though the planner can do 3–5

How to work in this repo: [AGENTS.md](../AGENTS.md).
