// Dip-buying bot for cbBTC/USDC on 1-minute bars.
//
// Idea: sharp short-lived sell-offs in BTC tend to snap back within minutes
// to a few hours. The bot waits flat in cash, watches the rolling 30-minute
// high, and buys only after the price has fallen hard from that high AND the
// very last minute already ticked back up (the capitulation is over, buyers
// are stepping in). It then exits on one of three rules: a modest profit
// target, a hard stop, or a maximum holding time so capital is never parked
// in a dead trade. One position at a time, full cash per entry, no leverage,
// no shorts, no randomness, no clock reads: every decision is a pure
// function of the bars seen so far, so two runs agree exactly.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const BPS = 10_000n;

// --- tuned on the published dev window (grid search over the kit data) ---
const LOOKBACK_BARS = 30; // rolling-high window, in minutes
const DROP_BPS = 40n; // buy only after falling this far below the rolling high
const TAKE_PROFIT_BPS = 70n; // sell once up this far from the fill price
const STOP_LOSS_BPS = 150n; // sell once down this far from the fill price
const MAX_HOLD_BARS = 240; // sell after this many bars whatever the price
const COOLDOWN_BARS = 20; // sit out this long after any exit, avoid re-buying a falling knife
const MAX_SLIPPAGE_BPS = 150; // fills must land within this of the last close

// Rolling closes, oldest first, at most LOOKBACK_BARS entries.
const closes: bigint[] = [];
// Fill price of the open position (0n while flat), in price-scale units.
let entryPrice = 0n;
// Bars held since the buy filled.
let holdBars = 0;
// Bars left of the post-exit cooldown (0 while free to buy).
let cooldownBars = 0;

function dropFromHigh(close: bigint): bigint {
  let high = 0n;
  for (const c of closes) if (c > high) high = c;
  if (high === 0n) return 0n;
  return ((close - high) * BPS) / high;
}

function retFromEntry(close: bigint): bigint {
  if (entryPrice === 0n) return 0n;
  return ((close - entryPrice) * BPS) / entryPrice;
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    // Learn what filled on the previous batch before deciding anything.
    for (const fill of batch.fills) {
      if (fill.symbol !== SYMBOL || fill.status !== 'filled') continue;
      if (fill.side === 'buy') {
        entryPrice = BigInt(fill.price);
        holdBars = 0;
      } else {
        // A sell filled: flat again, and start the cooldown.
        entryPrice = 0n;
        holdBars = 0;
        cooldownBars = COOLDOWN_BARS;
      }
    }

    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    if (state.warmingUp) return [];

    const close = BigInt(bar.c);
    const prevClose = closes.length > 0 ? closes[closes.length - 1]! : close;
    closes.push(close);
    if (closes.length > LOOKBACK_BARS) closes.shift();

    const pos = state.positions.get(SYMBOL);
    const qty = pos === undefined ? 0n : pos.qty;

    // --- holding: check the three exits ---
    if (qty > 0n && entryPrice > 0n) {
      holdBars += 1;
      const ret = retFromEntry(close);
      if (ret >= TAKE_PROFIT_BPS || ret <= -STOP_LOSS_BPS || holdBars >= MAX_HOLD_BARS) {
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // --- flat: look for a capitulation dip with a bounce ---
    if (qty === 0n) {
      if (cooldownBars > 0) {
        cooldownBars -= 1;
        return [];
      }
      if (closes.length < LOOKBACK_BARS) return [];
      const drop = dropFromHigh(close);
      const lastMinute = ((close - prevClose) * BPS) / prevClose;
      if (drop <= -DROP_BPS && lastMinute >= 0n && state.cash > 0n) {
        return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
    }
    return [];
  },
});
