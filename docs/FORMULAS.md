# Strategy & Financial Formulas (Phase 2)

## Underlying Assumptions
- **Pricing Model**: Black-Scholes European pricing model is used without dividend yield.
- **Time to Expiry**: Calculated in years as `days / 365.0`. Minimum 1 day to prevent div-by-zero.
- **Risk-Free Rate**: Specified in `config.php` (e.g. 0.23). Pending verification with current active market rate.
- **Contract Size**: Hardcoded to 1000 shares per contract via config.

## Fees & Margin
- **Fees**: Calculated based on per-share basis. The `config.php` separates option rates and underlying asset rates. Options use `opt_buy` + `opt_sell` (Roundtrip assumption). Underlying uses `etf_*` or `stk_*` based on identifying the underlying type.
- **Margin**: Uses `A` (e.g. 20%), `B` (e.g. 10%) rules + an `extra_per_share` cost. `margin = max(A*S - OTM, B*K) + extra`.

## Executable Price Mode (`?price=exec`)
In 'exec' mode, the required side of the order book is used:
- Buying a leg pays the `Ask` price.
- Selling a leg receives the `Bid` price.
In 'last' mode, both buy and sell legs use `lastP`.

## Strategies
### Bull Call Spread (BCS)
- **Net Debit ($nd)** = P1 - P2
- **Max Profit** = (K2 - K1) - nd - fee
- **Max Loss** = nd + fee
- **Breakeven** = K1 + nd + fee

### Bear Put Spread (BPS)
- **Net Debit ($nd)** = P2 - P1
- **Max Profit** = (K2 - K1) - nd - fee
- **Max Loss** = nd + fee
- **Breakeven** = K2 - nd - fee

### Covered Call (CC)
- **Max Profit** = K + Call_premium - S_underlying - fee
- **Breakeven** = S_underlying - Call_premium + fee
- **Net Cost** = S_underlying - Call_premium

### Collar
- **Max Profit** = Kc - S + net_premium - fee
- **Max Loss** = Kp - S + net_premium - fee
- **Breakeven** = S - net_premium + fee

### Long Call Condor
- **Net Cost** = P1 - P2 - P3 + P4
- **Max Profit** = (K2 - K1) - netCost - fee
- **Max Loss** = netCost + fee
- **Breakevens** = K1 + netCost + fee (Lower), K4 - netCost - fee (Upper)

## Metrics
- **WIV (Weighted Implied Volatility)**: Aggregated via volume-weighted average of valid ITM/OTM option IVs.
- **Scanner Scores**: Comprised of Liquidity, Execution (using exitQuality approximation), Safety, and Profit potential based on maxLoss capital. Weights configurable via `config.php`.
