// Central registry for the "?" help popovers (InfoDot).
// Plain data — safe to import from both server and client components.
//
// Each entry:
//   title       short heading
//   window      short pill text shown inline (the data timeframe)
//   windowLong  one-line expansion of the timeframe
//   what        one sentence: what the number/panel represents
//   how         array of calculation steps (strings; may include formulae)
//   benchmarks  array of { label, note, tone } reference thresholds
//   source      where the underlying data comes from
//
// tone ∈ up | down | accent | amber | muted

export const HELP = {
  // ─────────────────────────── Dashboard ───────────────────────────
  "dash.flow_brief": {
    title: "Institutional Flow Brief",
    window: "Cumulative",
    windowLong: "Running net since the start of the selected window (1M / 3M / All).",
    what: "The cumulative tug-of-war between foreign (FII) and domestic (DII) institutions, plus a plain-English read of the session.",
    how: [
      "Each line is the running sum of daily net cash flow (₹ Cr) from the window start.",
      "A rising line = sustained net buying; a falling line = persistent distribution.",
      "The gap between the two lines shows who has been the dominant force over the window.",
      "The brief is auto-generated from the latest session's flows, breadth, sector leadership and accumulation screen.",
    ],
    benchmarks: [
      { label: "FII line rising", note: "foreign money accumulating over the window", tone: "up" },
      { label: "DII line rising", note: "domestic funds absorbing / accumulating", tone: "accent" },
      { label: "both falling", note: "broad institutional de-risking", tone: "down" },
    ],
    source: "NSE provisional cash-market FII/DII report",
  },
  "dash.fii": {
    title: "FII Net",
    window: "1 session",
    windowLong: "A single trading day — the latest NSE session.",
    what: "Net foreign institutional (FII/FPI) cash buy minus sell in the cash market.",
    how: [
      "NSE end-of-day provisional figure: FII gross buy − gross sell (₹ Cr).",
      "Positive = net foreign buying; negative = net foreign selling.",
      "Provisional same-day number; NSDL/custodial reconciled figure follows later.",
    ],
    benchmarks: [
      { label: "> +2,000 Cr", note: "strong foreign buying", tone: "up" },
      { label: "−2,000…+2,000 Cr", note: "balanced day", tone: "muted" },
      { label: "< −2,000 Cr", note: "heavy foreign selling", tone: "down" },
    ],
    source: "NSE provisional cash-market FII/DII report",
  },
  "dash.dii": {
    title: "DII Net",
    window: "1 session",
    windowLong: "A single trading day — the latest NSE session.",
    what: "Net domestic institutional (mutual funds, insurers, banks) cash buy minus sell.",
    how: [
      "NSE end-of-day provisional figure: DII gross buy − gross sell (₹ Cr).",
      "DIIs often absorb FII selling — opposite signs are common and healthy.",
    ],
    benchmarks: [
      { label: "> +2,000 Cr", note: "strong domestic buying", tone: "up" },
      { label: "−2,000…+2,000 Cr", note: "balanced day", tone: "muted" },
      { label: "< −2,000 Cr", note: "domestic selling", tone: "down" },
    ],
    source: "NSE provisional cash-market FII/DII report",
  },
  "dash.breadth": {
    title: "Market Breadth",
    window: "1 session",
    windowLong: "A single trading day — counts every equity traded that session.",
    what: "How many stocks advanced versus declined — the market's internal participation.",
    how: [
      "Advances = stocks with day change > +0.05%; declines = change < −0.05%.",
      "Counted across every EQ/BE series stock on the bhavcopy.",
      "% advancing = advances ÷ (advances + declines).",
    ],
    benchmarks: [
      { label: "> 60% advancing", note: "broad, healthy rally", tone: "up" },
      { label: "40–60%", note: "mixed / rotational", tone: "muted" },
      { label: "< 40%", note: "broad weakness", tone: "down" },
    ],
    source: "NSE EOD delivery bhavcopy",
  },
  "dash.turnover": {
    title: "Total Turnover",
    window: "1 session",
    windowLong: "A single trading day — NOT a cumulative or 30-day figure.",
    what: "Total traded value across all equities for the one latest session.",
    how: [
      "Σ (traded value) over every EQ/BE stock on the latest bhavcopy date.",
      "'2,662 stocks' is how many names traded that day, not a multi-day count.",
    ],
    benchmarks: [
      { label: "> ₹1,00,000 Cr", note: "active, liquid session", tone: "up" },
      { label: "₹60,000–1,00,000 Cr", note: "normal session", tone: "muted" },
      { label: "< ₹60,000 Cr", note: "quiet / holiday-adjacent", tone: "amber" },
    ],
    source: "NSE EOD delivery bhavcopy",
  },
  "dash.vix": {
    title: "India VIX",
    window: "Live / 1 session",
    windowLong: "The current intraday value (or the latest EOD close when the market is shut).",
    what: "The market's expected 30-day volatility — the 'fear gauge'. A higher VIX means traders are pricing in bigger swings ahead.",
    how: [
      "NSE computes it from the order-book of near- and next-month NIFTY index option prices (the Black-Scholes implied volatility, annualised).",
      "It measures expected volatility, not direction — but spikes almost always coincide with sharp sell-offs, which is why it reads as a fear gauge.",
      "Shown inverted on the ticker: a rising VIX is risk-off, so it's coloured red when up and green when down.",
    ],
    benchmarks: [
      { label: "< 13", note: "complacent / calm — low hedging demand", tone: "up" },
      { label: "13–18", note: "normal, range-bound volatility", tone: "accent" },
      { label: "18–25", note: "elevated — nervy, larger swings expected", tone: "amber" },
      { label: "> 25", note: "fear / stress — usually a falling market", tone: "down" },
    ],
    source: "NSE India VIX (allIndices feed)",
  },
  "dash.fiidii_chart": {
    title: "FII / DII Activity",
    window: "Daily history",
    windowLong: "One bar per session, accumulating since the pipeline began running.",
    what: "Day-by-day net institutional cash flow, FII vs DII side by side.",
    how: [
      "Each bar = that session's provisional net (₹ Cr) for FII and DII.",
      "Reveals the tug-of-war: foreign selling frequently met by domestic buying.",
    ],
    source: "NSE provisional cash-market FII/DII report",
  },
  "dash.sector_rotation": {
    title: "Sector Rotation",
    window: "1 session",
    windowLong: "Same-day average — the latest session only.",
    what: "Average price change of the stocks in each sector for the day.",
    how: [
      "Group the session's stocks by sector, take the mean day % change.",
      "Bar length scales with the magnitude of the average move.",
    ],
    benchmarks: [
      { label: "green / positive", note: "money rotating into the sector today", tone: "up" },
      { label: "red / negative", note: "rotating out today", tone: "down" },
    ],
    source: "NSE EOD bhavcopy + sector map",
  },
  "movers.board": {
    title: "Top Gainers & Losers",
    window: "1 session + history",
    windowLong: "Today's moves, plus multi-session streaks and trailing ~1-year reads.",
    what: "The day's biggest movers, plus history-aware streaks and 1-year performance.",
    how: [
      "Today: ranked by session % change.",
      "Streaks: 3+ consecutive same-direction sessions (≥1.5% cumulative over the run).",
      "1-Year: best/worst and up-day consistency over the trailing ~250 sessions.",
    ],
    source: "Computed over the stored daily price history",
  },
  moneyflow: {
    title: "Where Money Is Flowing",
    window: "1 session",
    windowLong: "A single trading day — the latest session.",
    what: "Delivery-backed money flow per stock — real demat demand, signed by price direction.",
    how: [
      "Delivered value = turnover × delivery%  (money that actually changed hands, not intraday churn).",
      "Sign it by the day's move: price up = inflow (accumulation), price down = outflow (distribution).",
      "Net = total inflow − total outflow across liquid names.",
    ],
    benchmarks: [
      { label: "Net positive", note: "net accumulation across the market", tone: "up" },
      { label: "Net negative", note: "net distribution", tone: "down" },
    ],
    source: "Derived from the session's screener (turnover × delivery%)",
  },
  accumulation: {
    title: "Smart-Money Score & Signal",
    window: "1 session vs 20-day base",
    windowLong: "Today's snapshot, with volume/delivery measured against the prior 20 sessions.",
    what: "A 0–100 score blending delivery, surges, momentum, F&O and bulk/block flow.",
    how: [
      "Weighted blend (0–100): delivery% 30% · delivery-surge 20% · volume-surge 15% · momentum 15% · F&O OI 10% · bulk/block 10%.",
      "Surges compare today vs each stock's trailing 20-session average.",
      "Signal is derived from the score and the day's direction.",
    ],
    benchmarks: [
      { label: "Score ≥ 75", note: "Strong Accumulation", tone: "up" },
      { label: "60–75", note: "Accumulation", tone: "up" },
      { label: "30–60", note: "Neutral", tone: "muted" },
      { label: "≤ 30 on a red day", note: "Distribution", tone: "down" },
    ],
    source: "Composite of NSE delivery, F&O OI and bulk/block reports",
  },
  oi_buildup: {
    title: "Open-Interest Buildup",
    window: "1 session",
    windowLong: "Change in F&O open interest vs the previous session.",
    what: "Futures positioning, grouped by how price and open interest moved together.",
    how: [
      "Compare today's price direction with the change in futures open interest:",
      "Long buildup = price ↑, OI ↑ (fresh longs) · Short covering = price ↑, OI ↓ (shorts exiting).",
      "Short buildup = price ↓, OI ↑ (fresh shorts) · Long unwinding = price ↓, OI ↓ (longs exiting).",
    ],
    benchmarks: [
      { label: "Long buildup", note: "most bullish — new money long", tone: "up" },
      { label: "Short covering", note: "bullish, but shorts just exiting", tone: "accent" },
      { label: "Short buildup", note: "bearish — new shorts", tone: "down" },
      { label: "Long unwinding", note: "bearish — longs giving up", tone: "amber" },
    ],
    source: "NSE F&O bhavcopy (price + open interest)",
  },
  deals: {
    title: "Bulk & Block Deals",
    window: "1 session",
    windowLong: "Disclosed deals on the latest reported session.",
    what: "Largest disclosed institutional buy-side bulk and block trades.",
    how: [
      "Bulk deals (≥0.5% of equity) and block trades disclosed to NSE.",
      "Shown buy-side, ranked by deal value (₹ Cr).",
    ],
    source: "NSE bulk & block deals reports",
  },

  // ─────────────────────────── Forecast ───────────────────────────
  "forecast.regime": {
    title: "Market Regime",
    window: "Trailing ~30d / 1y",
    windowLong: "NIFTY momentum over 30 sessions and position within its 52-week range.",
    what: "A risk-on / risk-off read of the broad market backdrop.",
    how: [
      "Blends NIFTY 30-day change, 52-week position and India VIX.",
      "Risk-On = rising index, high range position, low/falling VIX; Risk-Off is the inverse.",
    ],
    benchmarks: [
      { label: "Risk-On", note: "supportive backdrop for longs", tone: "up" },
      { label: "Neutral", note: "no strong directional edge", tone: "muted" },
      { label: "Risk-Off", note: "defensive backdrop", tone: "down" },
    ],
    source: "NIFTY index history + India VIX",
  },
  "forecast.sector_rotation": {
    title: "Sector Rotation (30-day)",
    window: "30d & 1-year",
    windowLong: "Sector index returns over the trailing 30 sessions and 1 year.",
    what: "Which sector indices are leading or lagging over the medium term.",
    how: [
      "Per sector index: % change over the last ~30 sessions and ~365 days.",
      "Compares medium-term (30d) impulse against the 1-year trend.",
    ],
    source: "NSE sectoral index history",
  },
  "forecast.model": {
    title: "Quant Model",
    window: "Cross-sectional + 20d backtest",
    windowLong: "Ranks today's universe; calibration/IC measured on a rolling 20-day-forward backtest.",
    what: "A cross-sectional factor model ranking the universe by composite score.",
    how: [
      "Composite z-score from momentum, trend and flow factors (weights shown on the card).",
      "Mean IC = Spearman correlation of score vs forward 20-day return (≈0 means weak edge — shown honestly).",
      "Top-decile hit rate = % of top-ranked names that beat the universe median over 20 days.",
    ],
    benchmarks: [
      { label: "IC > 0.05", note: "modest positive edge", tone: "up" },
      { label: "IC ≈ 0", note: "no reliable edge", tone: "muted" },
      { label: "Hit rate > 55%", note: "top decile outperforming", tone: "up" },
    ],
    source: "Cross-sectional model over the stored price/flow history",
  },
  "forecast.model_picks": {
    title: "Model Top Picks",
    window: "Today's ranking",
    windowLong: "Highest composite scores in the latest cross-section.",
    what: "Highest composite-score names — strongest combined momentum, trend and flow.",
    how: [
      "Ranked by composite z-score, volatility-adjusted.",
      "Up 5d/20d are calibrated cross-sectional probabilities, not certainties.",
    ],
    source: "Quant model output",
  },
  "forecast.model_pans": {
    title: "Model Bottom Ranks",
    window: "Today's ranking",
    windowLong: "Lowest composite scores in the latest cross-section.",
    what: "Lowest composite-score names — weakest relative setups.",
    how: ["Same model, bottom of the ranking — weak momentum/trend/flow."],
    source: "Quant model output",
  },
  "forecast.uptrends": {
    title: "Emerging Uptrends",
    window: "~3 months",
    windowLong: "Trend fitted over roughly the last 60 sessions of price/delivery/OI.",
    what: "Names with the cleanest upward continuation setups.",
    how: [
      "Trend score from price slope, delivery and OI trend over ~3 months.",
      "Confidence reflects trend cleanliness (R²) and signal agreement — not certainty.",
    ],
    benchmarks: [
      { label: "Confidence ≥ 75%", note: "clean, agreeing signals", tone: "up" },
      { label: "50–75%", note: "developing", tone: "accent" },
      { label: "< 50%", note: "noisy / low conviction", tone: "muted" },
    ],
    source: "Trend-forecast engine over ~60 sessions",
  },
  "forecast.downtrends": {
    title: "Emerging Downtrends",
    window: "~3 months",
    windowLong: "Trend fitted over roughly the last 60 sessions.",
    what: "Weakest names — falling trend, distribution or short buildup.",
    how: ["Same engine, negative trend score — deteriorating price/delivery/OI."],
    source: "Trend-forecast engine over ~60 sessions",
  },

  // ─────────────────────────── Screener ───────────────────────────
  "screener.overview": {
    title: "Screener",
    window: "1 session vs 20-day base",
    windowLong: "Latest session metrics; surges vs the trailing 20 sessions.",
    what: "Every liquid stock ranked by smart-money score, fully sortable.",
    how: [
      "Liquidity floor: turnover ≥ ₹5 Cr for the session.",
      "Score blends delivery 30% · delivery-surge 20% · volume-surge 15% · momentum 15% · F&O 10% · bulk/block 10%.",
      "Click any column to sort, a symbol for its full flow history.",
    ],
    benchmarks: [
      { label: "Score ≥ 75", note: "Strong Accumulation", tone: "up" },
      { label: "Vol surge ≥ 2×", note: "unusual volume vs 20-day avg", tone: "accent" },
      { label: "Delivery > 60%", note: "high conviction (low churn)", tone: "up" },
    ],
    source: "NSE delivery, F&O and deals reports",
  },
  "screener.from_high": {
    title: "From 52-Week High",
    window: "52-week high vs latest close",
    windowLong: "Distance of the latest close below the highest close of the trailing 52 weeks.",
    what: "How far a stock has retraced from its one-year peak — a quick read on drawdown depth.",
    how: [
      "from_high = (close − 52-week high) ÷ 52-week high × 100, so the value is ≤ 0%.",
      "0% means the stock is at a fresh high; −30% means it sits 30% below its peak.",
      "Filter the table to surface names a chosen distance (10/20/30/40/50%) below their high.",
    ],
    benchmarks: [
      { label: "≥ −5%", note: "near the high — momentum/breakout zone", tone: "up" },
      { label: "−5%…−20%", note: "normal pullback", tone: "amber" },
      { label: "≤ −30%", note: "deep drawdown — value or broken trend", tone: "down" },
    ],
    source: "Trailing 52-week closing highs from stored price history",
  },
  "screener.return_bands": {
    title: "Performance Bands",
    window: "1-month & 3-month trailing",
    windowLong: "Trailing return over ~21 sessions (1M) or ~63 sessions (3M).",
    what: "Liquid stocks bucketed by trailing return into magnitude bands — gainers and decliners.",
    how: [
      "Return = (latest close − close N sessions ago) ÷ that past close × 100.",
      "Gainers band into +5/+10/+25/+50/+75/+100%+; decliners into −5/−10/−25/−50/−75%−.",
      "Within each band stocks are ranked by the size of the move; band count shows the full breadth.",
    ],
    benchmarks: [
      { label: "+25% or more", note: "strong momentum leaders", tone: "up" },
      { label: "−5%…−25%", note: "softening trend", tone: "amber" },
      { label: "−50% or worse", note: "severe decline", tone: "down" },
    ],
    source: "Trailing closes from stored ~1-year price history",
  },
  "screener.sector_matrix": {
    title: "Sector Rotation Matrix",
    window: "Today · 1M · 3M, vs market",
    windowLong: "Per-sector averages over the latest session, trailing 1-month and 3-month windows, with phase set by performance relative to the whole liquid universe.",
    what: "Every sector's breadth, momentum, drawdown, smart-money score and institutional flow on one grid, with an RRG-style rotation phase.",
    how: [
      "Each liquid stock is grouped by sector; sectors with fewer than 3 names are dropped as too thin to read.",
      "Per sector: average today %, 1M and 3M return, distance from 52-week high, smart-money score, plus advancing/declining breadth and summed institutional net flow.",
      "Phase compares a sector's 1M and 3M return to the market average — Leading (both strong), Improving (short-term turning up), Weakening (long-term strong but fading), Lagging (both weak).",
      "Heat shading scales each return cell green→red so leaders and laggards pop; click any column header to re-sort.",
    ],
    benchmarks: [
      { label: "Leading", note: "out-performing on both 1M and 3M", tone: "up" },
      { label: "Improving", note: "1M turning up while 3M still soft", tone: "accent" },
      { label: "Lagging", note: "behind market on both horizons", tone: "down" },
    ],
    source: "Cross-sectional aggregation of the liquid screener universe",
  },
  "screener.multibaggers": {
    title: "KNN Multibagger Radar",
    window: "21-session forward · ~1yr training",
    windowLong: "Targets a >10% peak within ~1 trading month; analogs drawn from the full stored history.",
    what: "An analog (k-nearest-neighbour) model surfacing the 3 stocks whose setup most resembles past pre-pop names — explicitly NOT investment advice.",
    how: [
      "Walk every stock's history, snapshot the same momentum + trend + smart-money-flow features, and LABEL a setup a 'hit' if the best close over the next ~21 sessions beat entry by ≥10%.",
      "Standardize features (z-score) so distances are comparable, then for today's stock find its K=50 nearest historical analogs in that feature space.",
      "Probability = distance-weighted share of those analogs that went on to pop. Picks must be liquid with enough analog support.",
      "Honest validation: fit on the older 80% of setups, score the newer 20%, and report base-rate, top-decile precision and lift.",
    ],
    benchmarks: [
      { label: "Lift > 1.5×", note: "model beats the base rate on holdout", tone: "up" },
      { label: "High neighbour agreement", note: "most analogs were hits", tone: "accent" },
      { label: "Analogs shown", note: "every pick lists real historical precedents", tone: "muted" },
    ],
    source: "Pure-Python KNN analog model over the full price / delivery / OI history",
  },
  "screener.mb_prob": {
    title: "Multibagger Probability",
    window: "21-session forward",
    windowLong: "Modelled chance of a >10% peak within ~1 trading month.",
    what: "The KNN analog model's distance-weighted probability that this stock pops >10% within a month — a relative ranking, not a guarantee.",
    how: [
      "Find the stock's 50 nearest historical analogs in standardized feature space.",
      "Probability = distance-weighted fraction of those analogs that beat +10% over the next ~21 sessions.",
      "Compare against the universe base rate; lift > 1 means above-average odds.",
    ],
    benchmarks: [
      { label: "Top of the list", note: "strongest analog support", tone: "up" },
      { label: "Below base rate", note: "no edge over the average stock", tone: "muted" },
    ],
    source: "KNN analog model — not investment advice",
  },
  "screener.signal_mix": {
    title: "Signal Composition",
    window: "1 session",
    windowLong: "The latest session's liquid universe, classified by signal.",
    what: "How the whole screened universe splits across accumulation vs distribution signals.",
    how: [
      "Each stock is bucketed by its smart-money signal (Strong Accumulation → Distribution).",
      "The donut shows each bucket's share of the universe; the center is net breadth = (accumulation − distribution) ÷ total.",
      "Click a slice (or a legend row) to list the stocks in that bucket.",
    ],
    benchmarks: [
      { label: "Net breadth > 0", note: "more accumulation than distribution", tone: "up" },
      { label: "Net breadth < 0", note: "distribution dominates", tone: "down" },
    ],
    source: "Computed from the latest session's screener signals",
  },
  "screener.insights": {
    title: "Screener Insights",
    window: "1 session",
    windowLong: "Cross-sectional charts over the latest session's liquid universe.",
    what: "Visual reads of the whole screened universe — score distribution, delivery-vs-move breadth, signal mix and the multibagger-probability leaders.",
    how: [
      "Score distribution: histogram of every stock's smart-money score.",
      "Breadth scatter: each stock plotted by day % change (x) vs delivery % (y); top-right = rising on real delivery.",
      "Signal mix: share of the universe in each accumulation/distribution bucket.",
      "Probability leaders: the highest KNN multibagger probabilities.",
    ],
    source: "Computed from the latest session's screener rows",
  },

  // ─────────────────────────── Market Pulse ───────────────────────────
  "pulse.breadth": {
    title: "Advances / Declines",
    window: "1 session",
    windowLong: "A single trading day — every traded equity.",
    what: "Market-wide breadth and the day's leading/lagging sectors.",
    how: [
      "Advances = change > +0.05%, declines < −0.05%, else unchanged.",
      "Sector strips show each sector's average day move.",
    ],
    benchmarks: [
      { label: "> 60% advancing", note: "broad strength", tone: "up" },
      { label: "< 40% advancing", note: "broad weakness", tone: "down" },
    ],
    source: "NSE EOD bhavcopy",
  },
  "pulse.active": {
    title: "Most Active Equities",
    window: "1 session",
    windowLong: "A single trading day, ranked by value or volume.",
    what: "The session's heaviest names by traded value or share volume.",
    how: [
      "By Value = traded turnover (₹ Cr); By Volume = shares traded.",
      "Delivery% shows how much was taken to demat vs intraday churn.",
    ],
    source: "NSE EOD bhavcopy",
  },
  "pulse.indices": {
    title: "Index Performances",
    window: "Day / 30d / 1y",
    windowLong: "Day change with 30-session and 1-year context per index.",
    what: "Broad and sectoral NIFTY indices; click a row for the stocks behind the move.",
    how: [
      "Day, 30-day and 1-year % change from index history.",
      "Expanded view: constituent breadth, the lead/drag stocks and a sortable holdings grid.",
    ],
    source: "NSE all-indices snapshot + constituent lists",
  },
  "pulse.band": {
    title: "Price Band Hitters",
    window: "1 session",
    windowLong: "A single trading day.",
    what: "Stocks locked at or pinned within their daily circuit limit.",
    how: [
      "'Locked' = open = high = low = close at the band.",
      "Otherwise pinned within ~the circuit extreme — supply/demand at a limit.",
    ],
    benchmarks: [
      { label: "Upper circuit", note: "demand overwhelming supply", tone: "up" },
      { label: "Lower circuit", note: "supply overwhelming demand", tone: "down" },
    ],
    source: "NSE EOD bhavcopy + price bands",
  },
  "pulse.volume": {
    title: "Volume Gainers",
    window: "vs 20-day average",
    windowLong: "Today's volume relative to each stock's prior 20-session average.",
    what: "Biggest jumps in traded volume versus recent norms — unusual activity.",
    how: [
      "Vol surge = today's volume ÷ trailing 20-session average volume.",
      "Higher multiples flag genuinely unusual participation.",
    ],
    benchmarks: [
      { label: "≥ 3×", note: "highly unusual", tone: "up" },
      { label: "2–3×", note: "notable", tone: "accent" },
      { label: "~1×", note: "normal", tone: "muted" },
    ],
    source: "NSE EOD bhavcopy",
  },
  "pulse.wk52": {
    title: "52-Week Highs / Lows",
    window: "Trailing 52 weeks",
    windowLong: "Position vs the one-year high/low range.",
    what: "Stocks at or within ~1% of their one-year extreme.",
    how: [
      "Compare close vs the trailing 52-week high and low.",
      "'new' = the session printed a fresh 52-week high or low.",
    ],
    benchmarks: [
      { label: "Near 52w high", note: "strength / breakout zone", tone: "up" },
      { label: "Near 52w low", note: "weakness / breakdown zone", tone: "down" },
    ],
    source: "Computed over the trailing 1-year history",
  },
  "pulse.deals": {
    title: "Large Deals",
    window: "1 session",
    windowLong: "Latest reported bulk/block session.",
    what: "Largest disclosed bulk and block trades, both sides.",
    how: ["Disclosed bulk (≥0.5% of equity) and block trades, ranked by value (₹ Cr)."],
    source: "NSE bulk & block deals reports",
  },

  // ─────────────────────────── Flows ───────────────────────────
  "flows.summary": {
    title: "FII / DII Summary",
    window: "1d / 1w / 1m / 1q / 1y",
    windowLong: "Net flow aggregated over each window (windows appear as history fills).",
    what: "Net FII and DII cash flow summed across each timeframe.",
    how: [
      "Sum the daily net FII and DII (₹ Cr) over each window.",
      "Longer windows appear automatically once enough sessions accumulate.",
    ],
    source: "NSE provisional cash-market FII/DII report",
  },
  "flows.netflow": {
    title: "Net Flow & Cumulative Trend",
    window: "Selectable",
    windowLong: "Bars per day/week/month/quarter/year; line = running cumulative.",
    what: "Per-period net flow with a cumulative line showing the persistent trend.",
    how: [
      "Bars = net buy/sell per period. Dashed lines = cumulative (the durable trend).",
      "Green/red = FII, blue/amber = DII.",
    ],
    source: "NSE provisional cash-market FII/DII report",
  },
  "flows.reconciled": {
    title: "NSDL Official — Reconciled",
    window: "Back to 2021",
    windowLong: "Custodial-confirmed monthly/quarterly/yearly figures; FPI reconciled from May 2025.",
    what: "Custodial-confirmed official flows (differ slightly from provisional, but go back years).",
    how: [
      "From NSE's Category-wise Turnover report: FII = NSDL FPI, DII = total DII.",
      "Reconciled DII runs back to 2021; reconciled FPI begins May 2025.",
    ],
    source: "NSE Category-wise Turnover (custodial/NSDL)",
  },
  "flows.destination": {
    title: "Asset-Class Destination",
    window: "Latest NSDL day",
    windowLong: "Most recent NSDL FPI daily trend.",
    what: "Where foreign money went — Equity vs Debt vs Hybrid.",
    how: ["NSDL daily FPI net (₹ Cr) split by asset class."],
    source: "NSDL daily FPI trends",
  },
  "flows.sector_dest": {
    title: "Sector Destination",
    window: "5 sessions",
    windowLong: "Delivered value accumulated over the last 5 sessions.",
    what: "Sectors absorbing the most delivered (real demat) money.",
    how: [
      "Sum delivered value (turnover × delivery%) by sector over 5 sessions.",
      "A proxy, since cash flows aren't published per sector.",
    ],
    source: "NSE delivery bhavcopy + sector map",
  },
  "flows.deriv": {
    title: "FII Derivatives Positioning",
    window: "Monthly",
    windowLong: "FII F&O net and open interest, monthly.",
    what: "FII net buy/sell and open positions across F&O categories.",
    how: [
      "Net (₹ Cr) per category, monthly; index/stock futures net is the classic directional gauge.",
      "OI shows where FII is currently positioned (not just the day's flow).",
    ],
    source: "NSE FII F&O statistics",
  },

  // ─────────────────────────── Intelligence ───────────────────────────
  "intel.regime": {
    title: "Institutional Pressure Index",
    window: "~3-month / monthly",
    windowLong: "Monthly series; headline blends the recent 3-month nets vs their own history.",
    what: "A −100…+100 gauge of net institutional demand vs its own history.",
    how: [
      "Z-score reconciled FII cash, DII and FII index-futures nets against their own history, then blend.",
      "Positive = net institutional demand; negative = de-risking.",
    ],
    benchmarks: [
      { label: "IPI > +30", note: "strong institutional demand", tone: "up" },
      { label: "−30…+30", note: "balanced", tone: "muted" },
      { label: "IPI < −30", note: "institutional de-risking", tone: "down" },
    ],
    source: "Reconciled FII/DII cash + FII F&O history",
  },
  "intel.rotation": {
    title: "Relative Rotation Graph",
    window: "~6 weeks",
    windowLong: "Tails trace ~6 weeks of each sector's travel.",
    what: "Each sector plotted by relative strength vs its momentum.",
    how: [
      "RS-Ratio (x) and RS-Momentum (y) from each sector's share of delivered value.",
      "The 100/100 crossover splits four quadrants; sectors rotate clockwise.",
    ],
    benchmarks: [
      { label: "Leading", note: "strong & strengthening", tone: "up" },
      { label: "Improving", note: "weak but turning up", tone: "accent" },
      { label: "Weakening", note: "strong but fading", tone: "amber" },
      { label: "Lagging", note: "weak & weakening", tone: "down" },
    ],
    source: "Sector delivered-value history",
  },
  "intel.accumulation": {
    title: "Sustained Accumulation",
    window: "~3-6 months",
    windowLong: "Delivery trend tested over the analysis window (recent month vs prior baseline).",
    what: "A multi-factor model ranking genuine, durable delivery accumulation.",
    how: [
      "Per stock: OLS + Theil-Sen + Mann-Kendall delivery-trend tests, robust level z-score, delivered-value surge and flow.",
      "Winsorized, z-scored across the universe, volatility-penalized, ranked to a 0–100 conviction percentile.",
    ],
    benchmarks: [
      { label: "Conviction ≥ 80", note: "strong, significant accumulation", tone: "up" },
      { label: "60–80", note: "building", tone: "accent" },
      { label: "MK p < 0.05", note: "statistically significant trend", tone: "up" },
    ],
    source: "NSE delivery history (statistical toolkit)",
  },
  "intel.conviction": {
    title: "Top Conviction",
    window: "~3-6 months",
    windowLong: "Delivery trend tested over the analysis window (recent month vs prior baseline).",
    what: "The strongest sustained-accumulation names right now, ranked by 0–100 conviction percentile.",
    how: [
      "Same multi-factor model as the table below: significant delivery up-trend (Mann-Kendall), elevated recent level vs baseline, delivered-value surge and positive flow — all volatility-adjusted.",
      "Bars show the top 10 by conviction; green ≥ 80, blue ≥ 60, grey below.",
    ],
    benchmarks: [
      { label: "Conviction ≥ 80", note: "strong, significant accumulation", tone: "up" },
      { label: "60–80", note: "building", tone: "accent" },
    ],
    source: "NSE delivery history (statistical toolkit)",
  },
  "intel.divergence": {
    title: "Delivery–Price Divergence",
    window: "~6 months",
    windowLong: "Spearman correlation + Mann-Kendall trend over the window.",
    what: "Where delivery and price disagree — quiet accumulation or weak rallies.",
    how: [
      "Spearman price·delivery ρ plus significance-gated Mann-Kendall tests.",
      "Quiet accumulation = price flat/down while delivery rises (negative ρ).",
      "Weak rally = price up but delivery significantly thinning.",
    ],
    benchmarks: [
      { label: "Quiet accumulation", note: "demand soaking up supply unnoticed", tone: "up" },
      { label: "Weak rally", note: "rally not backed by delivery", tone: "down" },
    ],
    source: "NSE delivery + price history",
  },

  // ─────────────────────────── IPO ───────────────────────────
  "ipo.upcoming": {
    title: "Open & Upcoming IPOs",
    window: "Live issues",
    windowLong: "Currently open and upcoming subscription windows.",
    what: "Live issues with price band, window and current subscription demand.",
    how: [
      "Subscription = live 'Total' demand multiple reported by NSE.",
      "Oversubscription signals demand but does not predict listing performance.",
    ],
    benchmarks: [
      { label: "≥ 1×", note: "fully subscribed", tone: "up" },
      { label: "< 1×", note: "under-subscribed so far", tone: "amber" },
    ],
    source: "NSE IPO / subscription data",
  },
  "ipo.summary": {
    title: "Recent-Listing Summary",
    window: "Last 12 months",
    windowLong: "Stocks listed within the trailing ~12 months.",
    what: "How the recent-listing cohort has behaved since debut.",
    how: [
      "Return since issue = current close vs IPO issue price.",
      "Above-issue % and median return summarize the whole cohort.",
    ],
    source: "NSE listing data + price history",
  },
  "ipo.leaders": {
    title: "Top Strength Leaders",
    window: "Since listing",
    windowLong: "Behaviour since each stock's debut.",
    what: "Highest cross-sectional IPO-Strength names within the recent cohort.",
    how: ["Ranked by IPO Strength (see the Strength column help)."],
    source: "Recent-listing cohort model",
  },
  "ipo.strength": {
    title: "IPO Strength",
    window: "Since listing",
    windowLong: "Behaviour since debut, percentile-ranked within the recent cohort.",
    what: "A 0–100 percentile of post-listing momentum and accumulation — within the cohort, not market-wide.",
    how: [
      "Blends return since issue, post-listing move, recent 20-day momentum, delivery accumulation and liquidity.",
      "Percentile-ranked within the recent-listing cohort only.",
      "Reflects momentum that has already occurred — not a forecast.",
    ],
    benchmarks: [
      { label: "Strong Momentum", note: "top of the cohort", tone: "up" },
      { label: "Building", note: "improving", tone: "accent" },
      { label: "Soft / Weak", note: "lagging the cohort", tone: "down" },
    ],
    source: "Recent-listing cohort model",
  },

  // ─────────────────────────── Stock page ───────────────────────────
  "stock.quant_model": {
    title: "Quant Model",
    window: "Cross-sectional",
    windowLong: "This stock's standing within the whole universe today.",
    what: "Where this stock sits in the cross-sectional factor model.",
    how: [
      "Composite = z-score vs the universe (relative ranking, not a target).",
      "Up prob 5d/20d are calibrated cross-sectional probabilities.",
      "Momentum / Trend / Flow are the underlying factor scores.",
    ],
    source: "Cross-sectional quant model",
  },
  "stock.trend_forecast": {
    title: "Trend Forecast",
    window: "~3 months",
    windowLong: "Continuation read fitted over roughly the last 60 sessions.",
    what: "A continuation probability from price, delivery and OI trends — not a price target.",
    how: [
      "Trend score from price slope, delivery and OI direction over ~3 months.",
      "Confidence reflects trend cleanliness (R²) and signal agreement.",
    ],
    source: "Trend-forecast engine",
  },
  "stock.price_delivery": {
    title: "Price vs Delivery %",
    window: "Full history",
    windowLong: "Stored daily history; dashed line = 60-day regression trend.",
    what: "Price overlaid on delivery% — rising price on rising delivery = real accumulation.",
    how: [
      "Delivery% = shares taken to demat ÷ shares traded.",
      "Dashed line is the 60-day linear-regression trend of price.",
    ],
    source: "NSE delivery bhavcopy history",
  },
  "stock.oi": {
    title: "Futures Open Interest",
    window: "Full history",
    windowLong: "Daily futures open interest alongside price.",
    what: "Open interest vs price — distinguishes fresh positions from unwinding.",
    how: [
      "OI rising with price = fresh longs; OI falling while price rises = short covering.",
      "OI rising while price falls = fresh shorts.",
    ],
    source: "NSE F&O bhavcopy history",
  },
  "stock.shareholding": {
    title: "Where Money Is Flowing — Ownership",
    window: "Latest quarter (~90 days)",
    windowLong: "Net change between the two most recent quarterly shareholding filings.",
    what: "Who owns this company and how the four ownership groups shifted last quarter — in holding % and an estimated ₹ value.",
    how: [
      "Categories: Promoters, FII / FPI (foreign), DII (domestic institutions), Public (retail & others).",
      "Δpp = change in holding-% vs the prior quarter (percentage points).",
      "Estimated ₹ = Δholding-% × shares outstanding × current price — an estimate, not transacted value.",
      "Green = accumulation (buying), red = distribution (selling).",
    ],
    benchmarks: [
      { label: "Accumulating", note: "holding % rising", tone: "up" },
      { label: "Distributing", note: "holding % falling", tone: "down" },
      { label: "Steady", note: "little change", tone: "muted" },
    ],
    source: "NSE quarterly shareholding-pattern filings (XBRL)",
  },
  "stock.marketcap": {
    title: "Market Capitalisation",
    window: "Current",
    windowLong: "Latest market cap from BSE's scrip master, refreshed each run.",
    what: "Total market value of the company's equity (price × shares), and its size bucket.",
    how: [
      "Full market cap = last price × total shares outstanding (₹ Crore).",
      "Free-float (FF) cap counts only freely-tradable shares — excludes promoter / locked holding. It's what drives index weight.",
      "Size buckets: Mega ≥ ₹50k Cr, Large ≥ ₹20k Cr, Mid ≥ ₹5k Cr, Small ≥ ₹500 Cr, Micro below.",
      "Joined to BSE by ISIN, so a handful of newly-renamed / demerged symbols may be missing.",
    ],
    benchmarks: [
      { label: "Large / Mega", note: "lower risk, deeper liquidity", tone: "up" },
      { label: "Mid", note: "growth + volatility", tone: "muted" },
      { label: "Small / Micro", note: "highest risk & illiquidity", tone: "down" },
    ],
    source: "BSE scrip master (ListofScripData), joined by ISIN",
  },
  "stock.technical": {
    title: "Technical Analysis",
    window: "Selectable (1M–All)",
    windowLong: "Indicators computed from end-of-day prices over the selected range.",
    what: "Close with moving averages, Bollinger Bands, volume and RSI.",
    how: [
      "SMA 20/50 = simple moving averages. Bollinger = 20-period mean ± 2σ.",
      "RSI(14) uses Wilder smoothing — above 70 overbought, below 30 oversold.",
      "Volume bars shaded by the day's direction.",
    ],
    benchmarks: [
      { label: "RSI > 70", note: "overbought", tone: "down" },
      { label: "RSI 30–70", note: "neutral", tone: "muted" },
      { label: "RSI < 30", note: "oversold", tone: "up" },
    ],
    source: "Computed client-side from EOD prices",
  },
  "stock.wk52": {
    title: "52-Week Range",
    window: "Trailing 52 weeks",
    windowLong: "Current price within the one-year high/low band.",
    what: "Where the current price sits between its 52-week low and high.",
    how: [
      "Range position = (close − 52w low) ÷ (52w high − 52w low).",
      "Also shows distance from the high and from the low.",
    ],
    benchmarks: [
      { label: "> 80% of range", note: "near highs — strength", tone: "up" },
      { label: "< 20% of range", note: "near lows — weakness", tone: "down" },
    ],
    source: "Trailing 1-year price history",
  },

  // ── Strategy Lab ──────────────────────────────────────────────────────────
  "strategy.overview": {
    title: "Strategy Lab",
    window: "~1 year of daily history",
    windowLong: "Quant analytics computed over the full stored daily price/delivery history of the liquid universe.",
    what: "A quant workbench: rules-based strategy backtests, classic equity-factor scores, technical signal screens and portfolio risk metrics — all descriptive, none investment advice.",
    how: [
      "Builds an aligned daily-close matrix for the most liquid names and computes returns, volatility and a self-built equal-weight market proxy.",
      "Runs walk-forward monthly-rebalanced backtests, cross-sectional factor z-scores, a market-regime composite, and per-stock risk statistics.",
      "Everything is recomputed each EOD run from the same data the rest of the platform uses — no external signals.",
    ],
    benchmarks: [
      { label: "Backtested", note: "hypothetical, costs/slippage ignored", tone: "muted" },
      { label: "Not advice", note: "descriptive analytics only", tone: "amber" },
    ],
    source: "Daily price / delivery history of the liquid universe",
  },
  "strategy.regime": {
    title: "Market Regime",
    window: "Latest session vs ~1yr context",
    windowLong: "A 0–100 composite combining several breadth and risk gauges as of the latest session.",
    what: "One risk dial for the whole market — high reads risk-on, low reads risk-off — built from breadth, trend participation, volatility, institutional flow and drawdown.",
    how: [
      "Each component (daily advancing breadth, share of stocks above their 50- and 200-DMA, India VIX, FII net flow, market drawdown, average RSI) is mapped to a 0–100 sub-score.",
      "Sub-scores are blended into a single composite; the label (Risk-Off → Neutral → Risk-On) follows the band the score lands in.",
      "Higher is calmer/stronger participation; lower means thin breadth, high volatility or heavy drawdown.",
    ],
    benchmarks: [
      { label: "≥ 65", note: "risk-on — broad strength", tone: "up" },
      { label: "35–65", note: "neutral / mixed", tone: "amber" },
      { label: "< 35", note: "risk-off — defensive", tone: "down" },
    ],
    source: "Cross-sectional breadth + VIX + FII flow over the liquid universe",
  },
  "strategy.backtests": {
    title: "Strategy Backtests",
    window: "Walk-forward, ~21-session rebalance",
    windowLong: "Monthly-rebalanced portfolios simulated across the full stored history versus an equal-weight benchmark.",
    what: "Equity curves and risk stats for three transparent, rules-based portfolios: cross-sectional momentum, low-volatility, and 52-week-high breakout.",
    how: [
      "Every ~21 sessions, rank the universe by the strategy's metric and hold the top quintile, equal-weighted, until the next rebalance.",
      "Compound realised forward returns into an equity curve and compare against an equal-weight benchmark of the same names.",
      "Report final multiple, CAGR, annualised volatility, Sharpe, maximum drawdown and the share of winning rebalance periods.",
    ],
    benchmarks: [
      { label: "Beats benchmark", note: "CAGR above equal-weight", tone: "up" },
      { label: "Sharpe > 1", note: "strong risk-adjusted return", tone: "up" },
      { label: "Hypothetical", note: "ignores costs, slippage, taxes", tone: "amber" },
    ],
    source: "Walk-forward simulation over stored daily closes",
  },
  "strategy.factors": {
    title: "Factor Scores",
    window: "Cross-sectional, ~1yr inputs",
    windowLong: "Each factor is z-scored across the whole liquid universe on the latest session using ~1-year inputs.",
    what: "Four classic equity factors — Momentum, Low-Volatility, Quality and Trend — plus a composite that averages them, so a score reads as standard deviations from the market.",
    how: [
      "Momentum = 12-1 trailing return (6-month return excluding the most recent month); Low-Vol = inverse annualised volatility.",
      "Quality = delivery-to-traded ratio (real demand vs intraday churn); Trend = distance above the 200-DMA scaled by 60-day regression fit.",
      "Each raw factor is standardised (z-score) across the universe; the composite is the equal-weight average of the four z-scores.",
    ],
    benchmarks: [
      { label: "z > +1.5σ", note: "strongly favoured on the factor", tone: "up" },
      { label: "±0.5σ", note: "around the market average", tone: "muted" },
      { label: "z < −0.5σ", note: "factor headwind", tone: "down" },
    ],
    source: "Cross-sectional z-scores over the liquid universe",
  },
  "strategy.signals": {
    title: "Technical Signal Screens",
    window: "Latest session",
    windowLong: "Classic chart patterns scanned across the universe as of the latest close.",
    what: "Today's matches for standard technical setups — moving-average crossovers, MACD, RSI extremes, Bollinger and 52-week breakouts, and volume dry-ups.",
    how: [
      "Compute SMAs/EMAs, RSI, MACD and Bollinger bands per stock from its price history.",
      "Flag golden/death crosses, MACD bullish crosses, RSI oversold/overbought, band and 52-week-high breakouts, and below-average volume.",
      "Each screen lists matching symbols with the close and the relevant detail; counts show how broad the setup is.",
    ],
    benchmarks: [
      { label: "Golden cross", note: "50-DMA crosses above 200-DMA", tone: "up" },
      { label: "RSI < 30", note: "oversold", tone: "accent" },
      { label: "Death cross", note: "50-DMA crosses below 200-DMA", tone: "down" },
    ],
    source: "Technical indicators computed from EOD price history",
  },
  "strategy.risk_map": {
    title: "Risk / Return Map",
    window: "~1 year of daily returns",
    windowLong: "Annualized risk and return for the most liquid names over the stored daily history.",
    what: "A scatter of every liquid stock by annualized volatility (risk) against annualized return (reward), coloured by Sharpe ratio and sized by smart-money score.",
    how: [
      "X axis is annualized volatility (σ × √252); Y axis is annualized return; the dashed line marks the 7% risk-free rate.",
      "Colour encodes the Sharpe ratio — green is strong risk-adjusted return, red is poor; point size scales with the smart-money score.",
      "The up-and-left quadrant (high return, low risk) is favourable; down-and-right is the opposite. 'Trim outliers' clips the view to the 2nd–98th percentile.",
    ],
    benchmarks: [
      { label: "Up & left", note: "high return for low risk — efficient", tone: "up" },
      { label: "Above risk-free", note: "beating the 7% cash benchmark", tone: "accent" },
      { label: "Below zero", note: "underwater over the window", tone: "down" },
    ],
    source: "Daily-return statistics over the stored price history",
  },
  "strategy.risk": {
    title: "Risk Metrics",
    window: "~1 year of daily returns",
    windowLong: "Annualised statistics from daily returns over the stored history for the most liquid names.",
    what: "Per-stock annualised return and volatility, Sharpe and Sortino ratios, beta versus an equal-weight market proxy, and maximum drawdown — with leaderboards.",
    how: [
      "Daily returns → annualised return and volatility (×252 / √252); Sharpe and Sortino use a 7% risk-free rate.",
      "Beta is regressed against a self-built equal-weight market proxy (the index table lacks deep history).",
      "Maximum drawdown is the worst peak-to-trough decline over the window; leaderboards rank best Sharpe, lowest vol, lowest and highest beta.",
    ],
    benchmarks: [
      { label: "Sharpe > 1", note: "strong reward per unit risk", tone: "up" },
      { label: "Beta < 1", note: "defensive vs market", tone: "accent" },
      { label: "Deep drawdown", note: "large historical loss", tone: "down" },
    ],
    source: "Daily-return statistics over the stored price history",
  },
};
