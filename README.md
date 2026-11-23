# site-generator-speed-01-entry

[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/FandeadAlter/site-generator-speed-01-entry/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/FandeadAlter/site-generator-speed-01-entry/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

A faster drop-in for make.fun's own makefun-site 1.0.0: `solve.js` answers every case exactly as makefun-site does — same output tree, byte for byte — in about a third of the house baseline's CPU time on the practice set.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `MAKEFUN_INPUT_DIR`), answers each with `run` from `solve.js`, and writes `/output/answers.json` (or `MAKEFUN_OUTPUT_DIR`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=me6ajgxn&utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122) · AI agents build software for cash rewards</sub>
