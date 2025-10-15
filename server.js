// server.js
import WebSocket from 'ws';
import { Server } from 'socket.io';
import http from 'http';
import { generateTradeAdvice } from './tradeAnalyzer.js';


const PORT = 8000;

// Tạo HTTP server + socket.io
const server = http.createServer();
const io = new Server(server, {
    cors: { origin: '*' },
});

server.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
});

// Quản lý các kết nối WebSocket theo symbol
const binanceConnections = new Map(); // key: "symbol@interval", value: { ws, clients: Set, reconnectTimer }
let clientCount = 0;

// Cache nến cho mỗi symbol@interval (tối đa 400 nến)
const candleCache = new Map(); // key: "symbol@interval", value: candle[]

// Lấy danh sách tất cả trading pairs từ Binance
async function fetchTradingPairs() {
    try {
        const response = await fetch('https://api.binance.com/api/v3/exchangeInfo');
        const data = await response.json();

        // Lọc ra các symbol đang TRADING và có thể trade được
        const tradingPairs = data.symbols
            .filter(symbol =>
                symbol.status === 'TRADING' &&
                symbol.permissions.includes('SPOT')
            )
            .map(symbol => ({
                symbol: symbol.symbol,
                baseAsset: symbol.baseAsset,
                quoteAsset: symbol.quoteAsset,
                price: null, // Sẽ được cập nhật sau
                priceChangePercent: null
            }))
            .sort((a, b) => a.symbol.localeCompare(b.symbol));

        console.log(`📋 Fetched ${tradingPairs.length} trading pairs from Binance`);
        return tradingPairs;
    } catch (error) {
        console.error('❌ Error fetching trading pairs:', error);
        return [];
    }
}

// Lấy giá hiện tại của tất cả coins
async function fetch24hrTicker() {
    try {
        const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
        const data = await response.json();

        const tickerMap = new Map();
        data.forEach(ticker => {
            tickerMap.set(ticker.symbol, {
                price: parseFloat(ticker.lastPrice),
                priceChangePercent: parseFloat(ticker.priceChangePercent),
                volume: parseFloat(ticker.volume),
                count: parseInt(ticker.count)
            });
        });

        console.log(`💰 Fetched 24hr ticker for ${data.length} symbols`);
        return tickerMap;
    } catch (error) {
        console.error('❌ Error fetching 24hr ticker:', error);
        return new Map();
    }
}

// Lấy danh sách coin phổ biến với giá và thống kê
async function getPopularCoins() {
    try {
        // Lấy trading pairs và ticker cùng lúc
        const [tradingPairs, tickerMap] = await Promise.all([
            fetchTradingPairs(),
            fetch24hrTicker()
        ]);

        // Ghép data và lọc ra các coin phổ biến
        const coinsWithData = tradingPairs
            .map(pair => {
                const ticker = tickerMap.get(pair.symbol);
                return {
                    ...pair,
                    price: ticker?.price || null,
                    priceChangePercent: ticker?.priceChangePercent || null,
                    volume: ticker?.volume || null,
                    count: ticker?.count || null
                };
            })
            .filter(coin => coin.price !== null) // Chỉ lấy coin có giá
            .sort((a, b) => (b.volume || 0) - (a.volume || 0)); // Sắp xếp theo volume

        // Lọc ra các coin phổ biến (USDT pairs + top volume)
        const usdtPairs = coinsWithData.filter(coin => coin.quoteAsset === 'USDT').slice(0, 100);
        const btcPairs = coinsWithData.filter(coin => coin.quoteAsset === 'BTC').slice(0, 50);
        const ethPairs = coinsWithData.filter(coin => coin.quoteAsset === 'ETH').slice(0, 30);

        return {
            usdt: usdtPairs,
            btc: btcPairs,
            eth: ethPairs,
            all: coinsWithData,
            totalCount: coinsWithData.length,
            lastUpdated: Date.now()
        };
    } catch (error) {
        console.error('❌ Error getting popular coins:', error);
        return { usdt: [], btc: [], eth: [], all: [], totalCount: 0, lastUpdated: Date.now() };
    }
}

// Cache cho danh sách coins (refresh mỗi 5 phút)
let coinsCache = null;
let coinsCacheExpiry = 0;

async function getCachedCoins() {
    const now = Date.now();
    if (!coinsCache || now > coinsCacheExpiry) {
        console.log('🔄 Refreshing coins cache...');
        coinsCache = await getPopularCoins();
        coinsCacheExpiry = now + (5 * 60 * 1000); // Cache 5 phút
    }
    return coinsCache;
}

// Fetch lịch sử giá từ Binance REST API
async function fetchHistoricalData(symbol, interval) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=400`;
        const response = await fetch(url);
        const data = await response.json();

        const historicalCandles = data.map(kline => ({
            symbol: symbol.toUpperCase(),
            interval: interval,
            openTime: kline[0],
            closeTime: kline[6],
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5]),
            isFinal: true, // Lịch sử đã đóng
        }));

        console.log(`📊 Fetched ${historicalCandles.length} historical candles for ${symbol.toUpperCase()}@${interval}`);
        return historicalCandles;
    } catch (error) {
        console.error(`❌ Error fetching historical data for ${symbol}@${interval}:`, error);
        return [];
    }
}

function connectToBinance(symbol, interval) {
    const streamKey = `${symbol}@kline_${interval}`;

    // Kiểm tra xem đã có kết nối cho stream này chưa
    if (binanceConnections.has(streamKey)) {
        const connection = binanceConnections.get(streamKey);
        if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
            return connection; // Đã kết nối rồi
        }
    }

    const binanceWsUrl = `wss://stream.binance.com:9443/ws/${streamKey}`;
    const ws = new WebSocket(binanceWsUrl);

    const connection = {
        ws: ws,
        clients: new Set(),
        reconnectTimer: null
    };

    ws.on('open', () => {
        console.log(`🔗 Connected to Binance stream for ${symbol.toUpperCase()}@${interval}`);
        if (connection.reconnectTimer) {
            clearTimeout(connection.reconnectTimer);
            connection.reconnectTimer = null;
        }
    });

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            if (data.e !== 'kline') return;

            const k = data.k; // thông tin kline
            const candle = {
                symbol: symbol.toUpperCase(),
                interval: interval,
                openTime: k.t,
                closeTime: k.T,
                open: parseFloat(k.o),
                high: parseFloat(k.h),
                low: parseFloat(k.l),
                close: parseFloat(k.c),
                volume: parseFloat(k.v),
                isFinal: k.x, // true = nến đã đóng
            };

            connection.clients.forEach(clientSocket => {
                if (clientSocket.connected) {
                    clientSocket.emit('kline', candle);
                }
            });

            if (candle.isFinal) {
                console.log(
                    `🕒 ${symbol.toUpperCase()}@${interval} Candle closed: O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close} V:${candle.volume}`
                );
            }
        } catch (err) {
            console.error('Error parsing message', err);
        }
    });

    ws.on('close', () => {
        console.log(`❌ Binance socket closed for ${symbol.toUpperCase()}@${interval}`);

        // Chỉ reconnect nếu còn có client subscribe stream này
        if (connection.clients.size > 0 && !connection.reconnectTimer) {
            console.log(`🔄 Attempting to reconnect ${symbol.toUpperCase()}@${interval} in 5 seconds...`);
            connection.reconnectTimer = setTimeout(() => {
                connection.reconnectTimer = null;
                const newConnection = connectToBinance(symbol, interval);
                // Chuyển clients sang connection mới
                connection.clients.forEach(client => {
                    newConnection.clients.add(client);
                });
                binanceConnections.set(streamKey, newConnection);
            }, 5000);
        } else if (connection.clients.size === 0) {
            // Xóa connection nếu không còn client nào
            binanceConnections.delete(streamKey);
        }
    });

    ws.on('error', (err) => {
        console.error(`WebSocket error for ${symbol.toUpperCase()}@${interval}:`, err);
    });

    binanceConnections.set(streamKey, connection);
    return connection;
}

// Ngắt kết nối Binance cho một stream cụ thể
function disconnectFromBinance(symbol, interval) {
    const streamKey = `${symbol}@kline_${interval}`;
    const connection = binanceConnections.get(streamKey);

    if (connection) {
        if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
            connection.ws.close();
            console.log(`🔌 Disconnected from Binance ${symbol.toUpperCase()}@${interval}`);
        }
        if (connection.reconnectTimer) {
            clearTimeout(connection.reconnectTimer);
        }
        binanceConnections.delete(streamKey);
    }
}

// Cập nhật cache nến (giữ tối đa 400 nến)
function updateCandleCache(streamKey, newCandle) {
    if (!candleCache.has(streamKey)) {
        candleCache.set(streamKey, []);
    }

    const candles = candleCache.get(streamKey);

    // Thêm nến mới
    candles.push(newCandle);

    if (candles.length > 400) {
        candles.shift();
    }

    console.log(`📊 Cache updated for ${streamKey}: ${candles.length} candles`);
}

// Khởi tạo cache với lịch sử nến
async function initializeCandleCache(symbol, interval) {
    const streamKey = `${symbol}@kline_${interval}`;

    if (!candleCache.has(streamKey)) {
        console.log(`🔄 Initializing cache for ${streamKey}...`);

        // Lấy lịch sử 400 nến từ Binance
        const historicalData = await fetchHistoricalData(symbol, interval);
        candleCache.set(streamKey, historicalData);

        console.log(`✅ Cache initialized for ${streamKey}: ${historicalData.length} candles`);
    }
}

function removeClientFromAllStreams(clientSocket) {
    binanceConnections.forEach((connection, streamKey) => {
        connection.clients.delete(clientSocket);

        if (connection.clients.size === 0) {
            const [symbol, intervalPart] = streamKey.split('@kline_');
            disconnectFromBinance(symbol, intervalPart);

            // Xóa cache khi không còn ai subscribe
            candleCache.delete(streamKey);
            console.log(`🗑️ Cache cleared for ${streamKey}`);
        }
    });
}

// Xử lý kết nối client
io.on('connection', (socket) => {
    clientCount++;
    console.log(`👤 Client connected (${clientCount} total clients)`);

    socket.on('subscribe', async (data) => {
        const { symbol = 'btcusdt', interval = '1m' } = data;

        console.log(`📈 Client ${socket.id} subscribing to ${symbol.toUpperCase()}@${interval}`);

        try {
            await initializeCandleCache(symbol, interval);

            const connection = connectToBinance(symbol, interval);

            connection.clients.add(socket);

            const cachedCandles = candleCache.get(`${symbol}@kline_${interval}`) || [];
            socket.emit('historical', {
                symbol: symbol.toUpperCase(),
                interval: interval,
                data: cachedCandles
            });
            socket.emit('subscribed', {
                symbol: symbol.toUpperCase(),
                interval: interval,
                cacheSize: cachedCandles.length
            });

        } catch (error) {
            console.error(`Error subscribing ${socket.id} to ${symbol}@${interval}:`, error);
            socket.emit('error', { message: 'Failed to subscribe', symbol, interval });
        }
    });

    // Xử lý khi client unsubscribe
    socket.on('unsubscribe', (data) => {
        const { symbol, interval } = data;

        if (symbol && interval) {
            const streamKey = `${symbol}@kline_${interval}`;
            const connection = binanceConnections.get(streamKey);

            if (connection) {
                connection.clients.delete(socket);
                console.log(`📉 Client ${socket.id} unsubscribed from ${symbol.toUpperCase()}@${interval}`);

                // Nếu không còn client nào cho stream này, ngắt kết nối
                if (connection.clients.size === 0) {
                    disconnectFromBinance(symbol, interval);
                }
            }
        }
    });

    // Xử lý request danh sách coins
    socket.on('getCoinList', async (filter) => {
        try {
            console.log(`📋 Client ${socket.id} requesting coin list`);

            const coins = await getCachedCoins();

            // Lọc theo yêu cầu
            let result = coins;
            if (filter) {
                const { quoteAsset, search, limit } = filter;

                if (quoteAsset) {
                    result = {
                        ...coins,
                        filtered: coins[quoteAsset.toLowerCase()] || []
                    };
                } else if (search) {
                    const searchTerm = search.toUpperCase();
                    result = {
                        ...coins,
                        filtered: coins.all.filter(coin =>
                            coin.symbol.includes(searchTerm) ||
                            coin.baseAsset.includes(searchTerm)
                        ).slice(0, limit || 50)
                    };
                } else {
                    result = {
                        ...coins,
                        filtered: coins.all.slice(0, limit || 100)
                    };
                }
            }

            socket.emit('coinList', result);

        } catch (error) {
            console.error(`Error getting coin list for ${socket.id}:`, error);
            socket.emit('error', { message: 'Failed to get coin list' });
        }
    });

    // Xử lý search coins
    socket.on('searchCoins', async (searchTerm) => {
        try {
            console.log(`🔍 Client ${socket.id} searching for: ${searchTerm}`);

            const coins = await getCachedCoins();
            const search = searchTerm.toUpperCase();

            const results = coins.all.filter(coin =>
                coin.symbol.includes(search) ||
                coin.baseAsset.includes(search) ||
                coin.quoteAsset.includes(search)
            ).slice(0, 20); // Giới hạn 20 kết quả

            socket.emit('searchResults', {
                searchTerm: searchTerm,
                results: results,
                count: results.length
            });

        } catch (error) {
            console.error(`Error searching coins for ${socket.id}:`, error);
            socket.emit('error', { message: 'Search failed' });
        }
    });

    socket.on('analytics', (data) => {
        try {
            const { symbol, interval } = data;
            const streamKey = `${symbol.toLowerCase()}@kline_${interval}`;

            console.log(`📊 Client ${socket.id} requesting trade analytics for ${symbol}@${interval}`);

            const cachedCandles = candleCache.get(streamKey);

            if (!cachedCandles || cachedCandles.length < 200) {
                socket.emit('analyticsError', {
                    message: 'Insufficient data for trade analytics',
                    symbol,
                    interval,
                    currentSize: cachedCandles?.length || 0,
                    required: 200
                });
                return;
            }
            const tradeAdvice = generateTradeAdvice(cachedCandles);
            if (tradeAdvice) {
                socket.emit('analyticsResult', {
                    symbol: symbol.toUpperCase(),
                    interval: interval,
                    timestamp: Date.now(),
                    dataSize: cachedCandles.length,
                    advice: tradeAdvice,
                    isManual: true
                });

                console.log(`✅ Trade analytics completed for ${symbol}@${interval}: ${tradeAdvice.trend} - ${tradeAdvice.signal}`);
            } else {
                socket.emit('analyticsError', {
                    message: 'Failed to generate trade advice',
                    symbol,
                    interval
                });
            }

        } catch (error) {
            console.error(`Error in analytics for ${socket.id}:`, error);
            socket.emit('analyticsError', { message: 'Analytics request failed' });
        }
    });
    socket.on('disconnect', () => {
        clientCount--;
        console.log(`👤 Client ${socket.id} disconnected (${clientCount} total clients)`);

        // Xóa client khỏi tất cả các stream
        removeClientFromAllStreams(socket);
    });
});
