const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const https = require('https');
const WebSocket = require('ws');

const SUPABASE_URL = 'https://thchukejncozmkjzalks.supabase.co/functions/v1/candle-receiver';
const SESSION_ID = Math.random().toString(36).substring(2, 10);

let win;
let ws;

function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 650,
    resizable: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    icon: path.join(__dirname, 'icon.png'),
    title: 'TradePilot Desktop',
    backgroundColor: '#0f172a'
  });
  win.loadFile('src/index.html');
  win.setMenu(null);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (ws) ws.close(); app.quit(); });

ipcMain.on('start-collection', (e, { symbol, interval }) => {
  startWebSocket(symbol, interval, e.sender);
});

ipcMain.on('stop-collection', () => {
  if (ws) { ws.close(); ws = null; }
});

ipcMain.on('send-candles', async (e, candles) => {
  try {
    const chunkSize = 100;
    let sent = 0;
    for (let i = 0; i < candles.length; i += chunkSize) {
      const chunk = candles.slice(i, i + chunkSize);
      await postData({ sessionId: SESSION_ID, candles: chunk, batch: i / chunkSize });
      sent += chunk.length;
    }
    e.sender.send('send-done', sent);
  } catch (err) {
    e.sender.send('send-error', err.message);
  }
});

function postData(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const url = new URL(SUPABASE_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function startWebSocket(symbol, interval, sender) {
  const session = 'qs_' + Math.random().toString(36).substr(2, 12);
  const chartSession = 'cs_' + Math.random().toString(36).substr(2, 12);
  
  const intervalMap = { '1':'1','5':'5','15':'15','30':'30','60':'60','D':'1D','W':'1W' };
  const tvInterval = intervalMap[interval] || interval;

  ws = new WebSocket('wss://data.tradingview.com/socket.io/websocket', {
    headers: { Origin: 'https://www.tradingview.com' }
  });

  function send(obj) {
    const msg = JSON.stringify(obj);
    ws.send(`~m~${msg.length}~m~${msg}`);
  }

  ws.on('open', () => {
    sender.send('log', '🔗 מחובר ל-TradingView');
    send({ m: 'set_auth_token', p: ['unauthorized_user_token'] });
    setTimeout(() => {
      send({ m: 'chart_create_session', p: [chartSession, ''] });
      const symInfo = JSON.stringify({ symbol, adjustment: 'splits' });
      send({ m: 'resolve_symbol', p: [chartSession, 'sds_sym_1', `=${symInfo}`] });
      send({ m: 'create_series', p: [chartSession, 'sds_1', 's1', 'sds_sym_1', tvInterval, 500] });
    }, 500);
  });

  ws.on('message', (raw) => {
    try {
      const parts = raw.toString().split('~m~');
      for (const part of parts) {
        if (part.startsWith('{')) {
          const data = JSON.parse(part);
          if (data.m === 'timescale_update') {
            const series = data.p?.[1]?.sds_1?.s || [];
            for (const item of series) {
              const v = item.v;
              if (v && v.length >= 5) {
                sender.send('candle', {
                  time: String(Math.floor(v[0])),
                  open: v[1], high: v[2], low: v[3], close: v[4],
                  volume: v[5] || 0
                });
              }
            }
          }
        }
      }
    } catch {}
  });

  ws.on('error', (err) => sender.send('log', `❌ ${err.message}`));
  ws.on('close', () => sender.send('log', '🔌 נותק'));
}
