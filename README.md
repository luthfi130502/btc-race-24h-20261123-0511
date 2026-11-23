# Dip-Buying cbBTC Bot — btc-race-24h-20261123-0511

[![make.fun](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/luthfi130502/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/luthfi130502/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

Entry for [Race a BTC trading bot live for 24 hours](https://make.fun/bounty/btc-race-24h-20261123-0511): a bot trading Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute on-chain bars, starting from $1,000 paper money.

## Strategy

Capitulation dip-buying, long only, one position at a time:

- **Buy** when the price has fallen ≥ 40 bps below its rolling 30-minute high **and** the last 1-minute bar already ticked back up (the sell-off is over, buyers are stepping in). Full cash per entry.
- **Sell** on the first of: +70 bps above the fill price (take profit), −150 bps (hard stop), or 240 bars held (time exit).
- **Cooldown** of 20 bars after any exit, so it never re-buys straight into a falling knife.

No leverage, no shorts, no randomness, no clock reads — every decision is a pure function of the bars seen so far, so two runs agree exactly.

## Dev result (grade-local, kit dev window)

- Net PnL: **+26.58 USDC** (return +2.66%)
- 15 trades, win rate 75%, max drawdown 1.57%
- Guardrails met; two executions reproduced byte for byte (deterministic)

## Run

`main.ts` speaks `agent-fun/bars-replay/v1` via the kit SDK shim in `vendor/` (copied byte for byte from the kit). Node 22: `node /bot/main.ts`.
