

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

export function generateTradeAdvice(candles) {
    const analysis = analyzeCandles(candles);
    if (!analysis) return { text: 'Không đủ dữ liệu để phân tích.' };

    const { trend, signal, ema, lastPrice } = analysis;
    const lastCandle = candles[candles.length - 1];
    const volatility = lastCandle.high - lastCandle.low;
    const tpMultiplier = 1.5;
    const slMultiplier = 1.0;

    const longEntry = lastPrice;
    const shortEntry = lastPrice;

    const longTP = longEntry + volatility * tpMultiplier;
    const longSL = longEntry - volatility * slMultiplier;
    const shortTP = shortEntry - volatility * tpMultiplier;
    const shortSL = shortEntry + volatility * slMultiplier;

    const rr = Number((tpMultiplier / slMultiplier).toFixed(2));
    let adviceText = '';
    if (trend === 'BULLISH') {
        adviceText =
            `Xu hướng hiện tại: TĂNG (Bullish)\n` +
            `Có thể cân nhắc **LONG** quanh vùng ${longEntry.toFixed(2)}.\n` +
            `Take Profit (TP): ${longTP.toFixed(2)}\n` +
            `Stop Loss (SL): ${longSL.toFixed(2)}\n` +
            `Tỷ lệ R:R ~ ${rr}:1.\n` +
            `EMA hiện tại: 10=${ema.e10.toFixed(2)}, 20=${ema.e20.toFixed(2)}, 50=${ema.e50.toFixed(2)}.\n` +
            `→ Ưu tiên MUA khi giá hồi về gần EMA20/EMA50.`;
    } else if (trend === 'BEARISH') {
        adviceText =
            `Xu hướng hiện tại: GIẢM (Bearish)\n` +
            `Có thể cân nhắc **SHORT** quanh vùng ${shortEntry.toFixed(2)}.\n` +
            `Take Profit (TP): ${shortTP.toFixed(2)}\n` +
            `Stop Loss (SL): ${shortSL.toFixed(2)}\n` +
            `Tỷ lệ R:R ~ ${rr}:1.\n` +
            `EMA hiện tại: 10=${ema.e10.toFixed(2)}, 20=${ema.e20.toFixed(2)}, 50=${ema.e50.toFixed(2)}.\n` +
            `→ Ưu tiên BÁN khi giá hồi lên vùng EMA20/EMA50.`;
    } else {
        adviceText =
            `Xu hướng hiện tại: SIDEWAY (đi ngang)\n` +
            `Không khuyến nghị mở vị thế mới, nên chờ phá vỡ EMA50 hoặc EMA100 để xác định hướng rõ ràng hơn.\n` +
            `Giá hiện tại: ${lastPrice.toFixed(2)}.`;
    }

    return {
        symbol: lastCandle.symbol || 'UNKNOWN',
        interval: lastCandle.interval || 'UNKNOWN',
        trend,
        signal,
        price: lastPrice,
        ema,
        long: { entry: longEntry, tp: longTP, sl: longSL },
        short: { entry: shortEntry, tp: shortTP, sl: shortSL },
        text: adviceText,
        timestamp: Date.now()
    };
}

