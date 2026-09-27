const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(__dirname, '.chrome-test-profile');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.callbacks.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result.value;
  }

  close() {
    this.ws.close();
  }
}

async function capturePopulated() {
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1200,1400',
    'http://localhost:3000'
  ]);

  try {
    let versionData = null;
    for (let i = 0; i < 20; i++) {
      await wait(500);
      try {
        versionData = await fetchJson('http://127.0.0.1:9222/json/version');
        if (versionData && versionData.webSocketDebuggerUrl) break;
      } catch (e) {}
    }

    const browserClient = new CDPClient(versionData.webSocketDebuggerUrl);
    await browserClient.init();

    const targetsRes = await browserClient.send('Target.getTargets');
    let pageTarget = targetsRes.targetInfos.find(t => t.type === 'page' && t.url.includes('3000'));
    const pageWsUrl = `ws://127.0.0.1:9222/devtools/page/${pageTarget.targetId}`;

    const pageClient = new CDPClient(pageWsUrl);
    await pageClient.init();

    await pageClient.send('Page.enable');
    await wait(800);

    // Save Preset A1 ($15, 14% budget -> Buy it)
    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="case-a1"]').click();
      document.getElementById('save-btn').click();
    })()`);
    await wait(300);

    // Save Gadget (Milk Frother -> Sleep on it)
    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="gadget"]').click();
      document.getElementById('save-btn').click();
    })()`);
    await wait(300);

    // Save Case C (Drafting pens -> Danger zone Skip it)
    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="case-c"]').click();
      document.getElementById('save-btn').click();
    })()`);
    await wait(300);

    // Mark outcomes:
    // Mark Case A1 (Buy it) as Actually bought it
    // Mark Case C (Skip it) as Actually skipped it
    // Mark Gadget (Sleep on it) as Actually skipped it
    await pageClient.evaluate(`(() => {
      const items = document.querySelectorAll('.history-item');
      // items[0] is Case C (Skip it)
      items[0].querySelector('.btn-skipped').click();
      // items[1] is Gadget (Sleep on it)
      items[1].querySelector('.btn-skipped').click();
      // items[2] is Case A1 (Buy it)
      items[2].querySelector('.btn-bought').click();
    })()`);
    await wait(400);

    // Set active form to Case A1 so live preview displays "Buy it"
    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="case-a1"]').click();
    })()`);
    await wait(400);

    const screenshotData = await pageClient.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    });

    fs.writeFileSync(path.join(__dirname, 'populated_screenshot.png'), Buffer.from(screenshotData.data, 'base64'));
    console.log('Populated screenshot saved to populated_screenshot.png');

    pageClient.close();
    browserClient.close();
  } finally {
    chromeProcess.kill();
  }
}

capturePopulated();
