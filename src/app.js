const { ipcRenderer } = require('electron');

let running = false;
let candles = [];

function log(msg) {
  const el = document.getElementById('log');
  el.innerHTML += msg + '\n';
  el.scrollTop = el.scrollHeight;
}

function toggle() {
  if (!running) start(); else stop();
}

function start() {
  const symbol = document.getElementById('symbol').value.trim().toUpperCase();
  const interval = document.getElementById('interval').value.trim();
  if (!symbol) return alert('הכנס סימבול');
  
  running = true;
  candles = [];
  document.getElementById('mainBtn').textContent = '■ עצור';
  document.getElementById('mainBtn').className = 'btn btn-stop';
  document.getElementById('sendBtn').disabled = true;
  document.getElementById('status').innerHTML = `אוסף: ${symbol} <span class="dot"></span>`;
  
  ipcRenderer.send('start-collection', { symbol, interval });
  log(`▶ מתחיל איסוף ${symbol}...`);
}

function stop() {
  running = false;
  document.getElementById('mainBtn').textContent = '▶ התחל איסוף';
  document.getElementById('mainBtn').className = 'btn btn-start';
  document.getElementById('status').textContent = `נאספו ${candles.length} נרות`;
  if (candles.length > 0) document.getElementById('sendBtn').disabled = false;
  ipcRenderer.send('stop-collection');
  log(`■ עצר. סה"כ: ${candles.length} נרות`);
}

function sendData() {
  document.getElementById('status').textContent = 'שולח...';
  document.getElementById('sendBtn').disabled = true;
  ipcRenderer.send('send-candles', candles);
  log(`📤 שולח ${candles.length} נרות...`);
}

ipcRenderer.on('candle', (e, candle) => {
  candles.push(candle);
  document.getElementById('count').textContent = `${candles.length} נרות`;
});

ipcRenderer.on('send-done', (e, count) => {
  document.getElementById('status').textContent = `✅ נשלחו ${count} נרות!`;
  document.getElementById('sendBtn').disabled = false;
  log(`✅ הושלם`);
});

ipcRenderer.on('send-error', (e, err) => {
  document.getElementById('status').textContent = `❌ שגיאה`;
  document.getElementById('sendBtn').disabled = false;
  log(`❌ ${err}`);
});

ipcRenderer.on('log', (e, msg) => log(msg));
