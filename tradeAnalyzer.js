

// ==================== TECHNICAL INDICATORS ====================

export function calculateEMA(prices, period) {
    const k = 2 / (period + 1);
    let ema = prices[0];
    const out = [ema];
    for (let i = 1; i < prices.length; i++) {
        ema = prices[i] * k + ema * (1 - k);
        out.push(ema);
    }
    return out;
}

export function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return [];

    const gains = [];
    const losses = [];

    for (let i = 1; i < prices.length; i++) {
        const change = prices[i] - prices[i - 1];
        gains.push(Math.max(change, 0));
        losses.push(Math.max(-change, 0));
    }

    const rsiValues = [];
    for (let i = period - 1; i < gains.length; i++) {
        const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
        const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;

        if (avgLoss === 0) {
            rsiValues.push(100);
        } else {
            const rs = avgGain / avgLoss;
            const rsi = 100 - (100 / (1 + rs));
            rsiValues.push(rsi);
        }
    }

    return rsiValues;
}

export function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (prices.length < slowPeriod) return { macd: [], signal: [], histogram: [] };

    const fastEMA = calculateEMA(prices, fastPeriod);
    const slowEMA = calculateEMA(prices, slowPeriod);

    const macdLine = [];
    for (let i = 0; i < Math.min(fastEMA.length, slowEMA.length); i++) {
        macdLine.push(fastEMA[i] - slowEMA[i]);
    }

    const signalLine = calculateEMA(macdLine, signalPeriod);
    const histogram = [];

    for (let i = 0; i < signalLine.length; i++) {
        histogram.push(macdLine[i + (macdLine.length - signalLine.length)] - signalLine[i]);
    }

    return {
        macd: macdLine,
        signal: signalLine,
        histogram: histogram
    };
}

export function calculateAllEMA(prices) {
    return {
        ema10: calculateEMA(prices, 10),
        ema20: calculateEMA(prices, 20),
        ema50: calculateEMA(prices, 50),
        ema100: calculateEMA(prices, 100),
        ema200: calculateEMA(prices, 200)
    };
}

// ==================== ANALYSIS FUNCTIONS ====================

export function analyzeCandles(candles) {
    if (!candles || candles.length < 200) return null;

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const volumes = candles.map(c => c.volume);

    const ema = calculateAllEMA(closes);
    const rsiValues = calculateRSI(closes);
    const macdData = calculateMACD(closes);

    const i = closes.length - 1;

    const e10 = ema.ema10[i];
    const e20 = ema.ema20[i];
    const e50 = ema.ema50[i];
    const e100 = ema.ema100[i];
    const e200 = ema.ema200[i];
    const price = closes[i];
    const prev = closes[i - 1];
    const rsi = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50;

    // MACD values
    const macdValue = macdData.macd.length > 0 ? macdData.macd[macdData.macd.length - 1] : 0;
    const macdSignal = macdData.signal.length > 0 ? macdData.signal[macdData.signal.length - 1] : 0;
    const macdHist = macdData.histogram.length > 0 ? macdData.histogram[macdData.histogram.length - 1] : 0;

    // Trend Analysis
    let emaScore = 0;
    if (e10 > e20) emaScore += 1; else emaScore -= 1;
    if (e20 > e50) emaScore += 1; else emaScore -= 1;
    if (e50 > e100) emaScore += 1; else emaScore -= 1;
    if (e100 > e200) emaScore += 1; else emaScore -= 1;

    let signal = 'SIDEWAY';
    let trend = 'NEUTRAL';
    let strength = 'WEAK';

    if (emaScore >= 3) {
        signal = 'UP';
        trend = 'BULLISH';
        strength = emaScore === 4 ? 'STRONG' : 'MODERATE';
    } else if (emaScore <= -3) {
        signal = 'DOWN';
        trend = 'BEARISH';
        strength = emaScore === -4 ? 'STRONG' : 'MODERATE';
    } else if (emaScore > 0) {
        signal = 'UP';
        trend = 'BULLISH';
        strength = 'WEAK';
    } else if (emaScore < 0) {
        signal = 'DOWN';
        trend = 'BEARISH';
        strength = 'WEAK';
    }

    const change = price - prev;
    const changePct = (change / prev) * 100;

    // Volume analysis
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const volumeRatio = volumes[i] / avgVolume;

    return {
        signal,
        trend,
        strength,
        emaScore,
        ema: { e10, e20, e50, e100, e200 },
        rsi: Number(rsi.toFixed(2)),
        macd: {
            value: Number(macdValue.toFixed(4)),
            signal: Number(macdSignal.toFixed(4)),
            histogram: Number(macdHist.toFixed(4))
        },
        lastPrice: price,
        priceChange: change,
        priceChangePercent: changePct,
        volumeRatio: Number(volumeRatio.toFixed(2)),
        highLow: { high: highs[i], low: lows[i] }
    };
}

// ==================== SHORT-TERM MARKET ANALYSIS ====================

function analyzeRecentBars(candles, period = 15) {
    const recentCandles = candles.slice(-period);
    const closes = recentCandles.map(c => c.close);
    
    let bullishBars = 0;
    let bearishBars = 0;
    let totalVolume = 0;
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    
    recentCandles.forEach((candle, idx) => {
        if (candle.close > candle.open) bullishBars++;
        else if (candle.close < candle.open) bearishBars++;
        
        totalVolume += candle.volume;
        highestHigh = Math.max(highestHigh, candle.high);
        lowestLow = Math.min(lowestLow, candle.low);
    });
    
    const avgClose = closes.reduce((a, b) => a + b, 0) / closes.length;
    const currentPrice = closes[closes.length - 1];
    const pricePosition = ((currentPrice - lowestLow) / (highestHigh - lowestLow)) * 100;
    
    let momentum = 'NEUTRAL';
    const bullishPercent = (bullishBars / period) * 100;
    
    if (bullishPercent >= 70) momentum = 'STRONG_BULLISH';
    else if (bullishPercent >= 60) momentum = 'BULLISH';
    else if (bullishPercent <= 30) momentum = 'STRONG_BEARISH';
    else if (bullishPercent <= 40) momentum = 'BEARISH';
    
    const volatility = ((highestHigh - lowestLow) / avgClose) * 100;
    
    return {
        bullishBars,
        bearishBars,
        bullishPercent: Number(bullishPercent.toFixed(1)),
        momentum,
        pricePosition: Number(pricePosition.toFixed(1)),
        volatility: Number(volatility.toFixed(2)),
        range: { high: highestHigh, low: lowestLow },
        avgVolume: totalVolume / period
    };
}

// ==================== TRADE ADVICE GENERATOR ====================

export function generateTradeAdvice(candles) {
    const analysis = analyzeCandles(candles);
    if (!analysis) return { text: '⚠️ Insufficient data (minimum 200 candles required)' };

    const { trend, signal, strength, ema, rsi, macd, lastPrice, volumeRatio } = analysis;
    const lastCandle = candles[candles.length - 1];
    const recentAnalysis = analyzeRecentBars(candles, 15);

    let atrSum = 0;
    for (let i = candles.length - 20; i < candles.length; i++) {
        atrSum += candles[i].high - candles[i].low;
    }
    const atr = atrSum / 20;

    let tpMultiplier = 2.0;
    let slMultiplier = 1.0;

    if (strength === 'STRONG') {
        tpMultiplier = 2.5;
        slMultiplier = 1.0;
    } else if (strength === 'WEAK') {
        tpMultiplier = 1.5;
        slMultiplier = 1.2;
    }

    const longEntryAggressive = lastPrice;
    const longEntryConservative = Math.min(ema.e20, lastPrice * 0.995);
    
    const longTP1 = longEntryAggressive + (atr * tpMultiplier * 0.6);
    const longTP2 = longEntryAggressive + (atr * tpMultiplier);
    const longSL = longEntryAggressive - (atr * slMultiplier);
    const longRR = Number((tpMultiplier / slMultiplier).toFixed(2));

    const shortEntryAggressive = lastPrice;
    const shortEntryConservative = Math.max(ema.e20, lastPrice * 1.005);
    
    const shortTP1 = shortEntryAggressive - (atr * tpMultiplier * 0.6);
    const shortTP2 = shortEntryAggressive - (atr * tpMultiplier);
    const shortSL = shortEntryAggressive + (atr * slMultiplier);
    const shortRR = Number((tpMultiplier / slMultiplier).toFixed(2));

    let adviceText = '';
    let recommendation = '';

    let rsiSignal = '🟡 Neutral';
    if (rsi > 70) rsiSignal = '🔴 Overbought';
    else if (rsi < 30) rsiSignal = '🟢 Oversold';

    let macdSignal = '➡️ Neutral';
    if (macd.histogram > 0 && macd.value > macd.signal) {
        macdSignal = '🟢 Bullish';
    } else if (macd.histogram < 0 && macd.value < macd.signal) {
        macdSignal = '🔴 Bearish';
    }

    let volumeSignal = volumeRatio > 1.5 ? '📊 High Volume' : volumeRatio < 0.7 ? '📉 Low Volume' : '📊 Normal Volume';

    if (trend === 'BULLISH') {
        const confidence = strength === 'STRONG' ? '85%' : strength === 'MODERATE' ? '70%' : '55%';
        const emoji = strength === 'STRONG' ? '🚀' : '📈';

        recommendation = rsi < 70 ? '✅ LONG Position Recommended' : '⚠️ Wait for RSI < 70';

        adviceText = `
## ${emoji} TREND: BULLISH (${strength})
**Confidence:** ${confidence} | **Volume:** ${volumeSignal}

### 📊 Technical Analysis
**Price:** $${lastPrice.toFixed(2)}
**RSI(14):** ${rsi.toFixed(2)} ${rsiSignal}
**MACD:** ${macdSignal}
**EMA:** ${ema.e10.toFixed(2)} > ${ema.e20.toFixed(2)} > ${ema.e50.toFixed(2)}

### 📈 Recent 15-Bar Analysis
**Bullish Bars:** ${recentAnalysis.bullishBars}/15 (${recentAnalysis.bullishPercent}%)
**Momentum:** ${recentAnalysis.momentum}
**Price Position:** ${recentAnalysis.pricePosition.toFixed(1)}% of 15-bar range
**Range:** $${recentAnalysis.range.low.toFixed(2)} - $${recentAnalysis.range.high.toFixed(2)}
**Volatility:** ${recentAnalysis.volatility.toFixed(2)}%

### 💰 LONG SETUP
${recommendation}

**🎯 AGGRESSIVE Entry:** $${longEntryAggressive.toFixed(2)}
  - TP1: $${longTP1.toFixed(2)} (+${((longTP1 - longEntryAggressive) / longEntryAggressive * 100).toFixed(2)}%)
  - TP2: $${longTP2.toFixed(2)} (+${((longTP2 - longEntryAggressive) / longEntryAggressive * 100).toFixed(2)}%)
  - SL: $${longSL.toFixed(2)} (-${((longEntryAggressive - longSL) / longEntryAggressive * 100).toFixed(2)}%)
  - R:R = ${longRR}:1

**🎯 CONSERVATIVE Entry:** $${longEntryConservative.toFixed(2)} (Wait for pullback to EMA20)
  - TP1: $${(longEntryConservative + (atr * tpMultiplier * 0.6)).toFixed(2)}
  - TP2: $${(longEntryConservative + (atr * tpMultiplier)).toFixed(2)}
  - SL: $${(longEntryConservative - (atr * slMultiplier)).toFixed(2)}

### 📍 Key Levels
Support: EMA20=$${ema.e20.toFixed(2)}, EMA50=$${ema.e50.toFixed(2)}
Resistance: 15-bar High=$${recentAnalysis.range.high.toFixed(2)}
`;
    } else if (trend === 'BEARISH') {
        const confidence = strength === 'STRONG' ? '85%' : strength === 'MODERATE' ? '70%' : '55%';
        const emoji = strength === 'STRONG' ? '📉' : '🔻';

        recommendation = rsi > 30 ? '✅ SHORT Position Recommended' : '⚠️ Wait for RSI > 30';

        adviceText = `
## ${emoji} TREND: BEARISH (${strength})
**Confidence:** ${confidence} | **Volume:** ${volumeSignal}

### 📊 Technical Analysis
**Price:** $${lastPrice.toFixed(2)}
**RSI(14):** ${rsi.toFixed(2)} ${rsiSignal}
**MACD:** ${macdSignal}
**EMA:** ${ema.e10.toFixed(2)} < ${ema.e20.toFixed(2)} < ${ema.e50.toFixed(2)}

### 📉 Recent 15-Bar Analysis
**Bearish Bars:** ${recentAnalysis.bearishBars}/15 (${(100 - recentAnalysis.bullishPercent).toFixed(1)}%)
**Momentum:** ${recentAnalysis.momentum}
**Price Position:** ${recentAnalysis.pricePosition.toFixed(1)}% of 15-bar range
**Range:** $${recentAnalysis.range.low.toFixed(2)} - $${recentAnalysis.range.high.toFixed(2)}
**Volatility:** ${recentAnalysis.volatility.toFixed(2)}%

### 💰 SHORT SETUP
${recommendation}

**🎯 AGGRESSIVE Entry:** $${shortEntryAggressive.toFixed(2)}
  - TP1: $${shortTP1.toFixed(2)} (+${((shortEntryAggressive - shortTP1) / shortEntryAggressive * 100).toFixed(2)}%)
  - TP2: $${shortTP2.toFixed(2)} (+${((shortEntryAggressive - shortTP2) / shortEntryAggressive * 100).toFixed(2)}%)
  - SL: $${shortSL.toFixed(2)} (-${((shortSL - shortEntryAggressive) / shortEntryAggressive * 100).toFixed(2)}%)
  - R:R = ${shortRR}:1

**🎯 CONSERVATIVE Entry:** $${shortEntryConservative.toFixed(2)} (Wait for pullback to EMA20)
  - TP1: $${(shortEntryConservative - (atr * tpMultiplier * 0.6)).toFixed(2)}
  - TP2: $${(shortEntryConservative - (atr * tpMultiplier)).toFixed(2)}
  - SL: $${(shortEntryConservative + (atr * slMultiplier)).toFixed(2)}

### 📍 Key Levels
Resistance: EMA20=$${ema.e20.toFixed(2)}, EMA50=$${ema.e50.toFixed(2)}
Support: 15-bar Low=$${recentAnalysis.range.low.toFixed(2)}
`;
    } else {
        adviceText = `
## ↔️ TREND: SIDEWAYS (NEUTRAL)
**Price:** $${lastPrice.toFixed(2)}

### 📊 Technical Analysis
**RSI(14):** ${rsi.toFixed(2)} ${rsiSignal}
**MACD:** ${macdSignal}
**Volume:** ${volumeSignal}

### 📊 Recent 15-Bar Analysis
**Bullish/Bearish:** ${recentAnalysis.bullishBars}/${recentAnalysis.bearishBars}
**Momentum:** ${recentAnalysis.momentum}
**Price Position:** ${recentAnalysis.pricePosition.toFixed(1)}% of range
**Range:** $${recentAnalysis.range.low.toFixed(2)} - $${recentAnalysis.range.high.toFixed(2)}
**Volatility:** ${recentAnalysis.volatility.toFixed(2)}%

### ⚠️ NO CLEAR DIRECTION - WAIT FOR BREAKOUT

**📈 LONG Signal:** Price breaks above EMA50 ($${ema.e50.toFixed(2)}) + Volume > 1.5x
**📉 SHORT Signal:** Price breaks below EMA50 ($${ema.e50.toFixed(2)}) + Volume > 1.5x

### � Key Levels
EMA50: $${ema.e50.toFixed(2)}
EMA100: $${ema.e100.toFixed(2)}
EMA200: $${ema.e200.toFixed(2)}
`;
    }

    return {
        symbol: lastCandle.symbol || 'UNKNOWN',
        interval: lastCandle.interval || 'UNKNOWN',
        trend,
        signal,
        strength,
        confidence: strength === 'STRONG' ? 85 : strength === 'MODERATE' ? 70 : 55,
        price: lastPrice,
        indicators: {
            ema,
            rsi,
            macd,
            volumeRatio
        },
        recentBars: recentAnalysis,
        long: {
            aggressive: {
                entry: Number(longEntryAggressive.toFixed(2)),
                tp1: Number(longTP1.toFixed(2)),
                tp2: Number(longTP2.toFixed(2)),
                sl: Number(longSL.toFixed(2)),
                rr: longRR,
                profitPercent1: Number(((longTP1 - longEntryAggressive) / longEntryAggressive * 100).toFixed(2)),
                profitPercent2: Number(((longTP2 - longEntryAggressive) / longEntryAggressive * 100).toFixed(2)),
                lossPercent: Number(((longEntryAggressive - longSL) / longEntryAggressive * 100).toFixed(2))
            },
            conservative: {
                entry: Number(longEntryConservative.toFixed(2)),
                tp1: Number((longEntryConservative + (atr * tpMultiplier * 0.6)).toFixed(2)),
                tp2: Number((longEntryConservative + (atr * tpMultiplier)).toFixed(2)),
                sl: Number((longEntryConservative - (atr * slMultiplier)).toFixed(2)),
                rr: longRR
            }
        },
        short: {
            aggressive: {
                entry: Number(shortEntryAggressive.toFixed(2)),
                tp1: Number(shortTP1.toFixed(2)),
                tp2: Number(shortTP2.toFixed(2)),
                sl: Number(shortSL.toFixed(2)),
                rr: shortRR,
                profitPercent1: Number(((shortEntryAggressive - shortTP1) / shortEntryAggressive * 100).toFixed(2)),
                profitPercent2: Number(((shortEntryAggressive - shortTP2) / shortEntryAggressive * 100).toFixed(2)),
                lossPercent: Number(((shortSL - shortEntryAggressive) / shortEntryAggressive * 100).toFixed(2))
            },
            conservative: {
                entry: Number(shortEntryConservative.toFixed(2)),
                tp1: Number((shortEntryConservative - (atr * tpMultiplier * 0.6)).toFixed(2)),
                tp2: Number((shortEntryConservative - (atr * tpMultiplier)).toFixed(2)),
                sl: Number((shortEntryConservative + (atr * slMultiplier)).toFixed(2)),
                rr: shortRR
            }
        },
        text: adviceText.trim(),
        timestamp: Date.now()
    };
}

