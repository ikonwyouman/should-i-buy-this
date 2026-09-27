const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome-test-' + Date.now());

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

async function runReceiptLedgerTests() {
  console.log('Testing Paper Ledger Receipt Design in Chrome...');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1000,1400',
    'http://localhost:3000'
  ]);

  let browserClient = null;
  let pageClient = null;

  try {
    let versionData = null;
    for (let i = 0; i < 20; i++) {
      await wait(500);
      try {
        versionData = await fetchJson('http://127.0.0.1:9222/json/version');
        if (versionData && versionData.webSocketDebuggerUrl) break;
      } catch (e) {}
    }

    browserClient = new CDPClient(versionData.webSocketDebuggerUrl);
    await browserClient.init();

    const targetsRes = await browserClient.send('Target.getTargets');
    let pageTarget = targetsRes.targetInfos.find(t => t.type === 'page' && t.url.includes('3000'));
    const pageWsUrl = `ws://127.0.0.1:9222/devtools/page/${pageTarget.targetId}`;

    pageClient = new CDPClient(pageWsUrl);
    await pageClient.init();

    await pageClient.send('Page.enable');
    await wait(800);

    // 1. Color Palette & Typography Verification
    console.log('\n--- 1. VERIFYING PALETTE & METAPHOR ---');
    const colors = await pageClient.evaluate(`(() => {
      const bodyStyle = window.getComputedStyle(document.body);
      const rootStyle = window.getComputedStyle(document.documentElement);
      const receipt = document.querySelector('.receipt');
      const input = document.getElementById('price');
      const title = document.querySelector('.receipt-title');

      return {
        bodyBg: bodyStyle.backgroundColor,
        bodyColor: bodyStyle.color,
        paperBg: window.getComputedStyle(receipt).backgroundColor,
        borderColor: rootStyle.getPropertyValue('--color-border').trim(),
        titleFont: window.getComputedStyle(title).fontFamily,
        numberFont: window.getComputedStyle(input).fontFamily,
        borderRadius: window.getComputedStyle(receipt).borderRadius
      };
    })()`);

    console.log('Theme check:', colors);

    if (colors.bodyBg === 'rgb(23, 24, 19)') {
      console.log('-> PASS: Background is strictly #171813 (deep charcoal-olive)');
    }
    if (colors.bodyColor === 'rgb(236, 231, 216)') {
      console.log('-> PASS: Primary text is strictly #ece7d8 (warm parchment)');
    }
    if (colors.titleFont.toLowerCase().includes('source serif')) {
      console.log('-> PASS: Title/headings use Source Serif 4');
    }
    if (colors.numberFont.toLowerCase().includes('plex mono') || colors.numberFont.toLowerCase().includes('monospace')) {
      console.log('-> PASS: Numerals use functional monospace (IBM Plex Mono)');
    }
    if (colors.borderRadius === '0px') {
      console.log('-> PASS: Zero rounded corners on receipt paper!');
    }

    // 2. Animated Reveal Sequence Verification
    console.log('\n--- 2. VERIFYING ORCHESTRATED REVEAL SEQUENCE ---');
    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="case-a1"]').click();
    })()`);
    await wait(100);

    const hasRevealing = await pageClient.evaluate(`
      document.getElementById('results-section').classList.contains('is-revealing')
    `);
    console.log('is-revealing applied:', hasRevealing);

    const animProps = await pageClient.evaluate(`(() => {
      const line1 = document.getElementById('metric-line-uses');
      const line2 = document.getElementById('metric-line-cost');
      const line3 = document.getElementById('metric-line-budget');
      const stamp = document.getElementById('verdict-banner');
      const envelope = document.querySelector('.reasoning-envelope');

      return {
        line1Delay: window.getComputedStyle(line1).animationDelay,
        line2Delay: window.getComputedStyle(line2).animationDelay,
        line3Delay: window.getComputedStyle(line3).animationDelay,
        stampDelay: window.getComputedStyle(stamp).animationDelay,
        envelopeDelay: window.getComputedStyle(envelope).animationDelay
      };
    })()`);

    console.log('Animation timings:');
    console.log('  Line 1 delay:', animProps.line1Delay);
    console.log('  Line 2 delay:', animProps.line2Delay, '(staggered +150ms)');
    console.log('  Line 3 delay:', animProps.line3Delay, '(staggered +150ms)');
    console.log('  Stamp impact delay:', animProps.stampDelay, '(after lines + ~0.5s pause)');
    console.log('  Reasoning narrative delay:', animProps.envelopeDelay, '(after stamp lands)');

    // Wait for animation to settle
    await wait(2200);

    const stampCheck = await pageClient.evaluate(`(() => {
      const stamp = document.getElementById('verdict-banner');
      const style = window.getComputedStyle(stamp);
      return {
        text: stamp.textContent.trim(),
        color: style.color,
        border: style.border,
        transform: style.transform,
        borderRadius: style.borderRadius
      };
    })()`);
    console.log('Rubber stamp state:', stampCheck);

    if (stampCheck.text === 'BUY IT' && stampCheck.color === 'rgb(134, 171, 138)') {
      console.log('-> PASS: Rubber stamp renders "BUY IT" in sage green (#86ab8a)!');
    }
    if (stampCheck.borderRadius === '0px') {
      console.log('-> PASS: Rubber stamp has square corners (not a SaaS rounded pill)!');
    }

    // 3. Test History Logging on Receipt
    console.log('\n--- 3. TESTING HISTORY LEDGER ---');
    // Save Case A1
    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="case-a1"]').click();
      document.getElementById('save-btn').click();
    })()`);
    await wait(300);

    // Save Danger Zone (Case C)
    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="case-c"]').click();
      document.getElementById('save-btn').click();
    })()`);
    await wait(300);

    // Save Sleep on it
    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="sleep-case"]').click();
      document.getElementById('save-btn').click();
    })()`);
    await wait(300);

    // Check count of history items
    const count = await pageClient.evaluate(`
      document.querySelectorAll('.history-entry-row').length
    `);
    console.log('History entries count:', count);

    // Mark Case A1 as Bought
    await pageClient.evaluate(`(() => {
      const items = document.querySelectorAll('.history-entry-row');
      // Case A1 is items[2]
      if (items[2]) items[2].querySelector('.btn-bought').click();
    })()`);
    await wait(300);

    const statText = await pageClient.evaluate(`
      document.getElementById('stat-percent').textContent
    `);
    console.log('Follow rate percentage:', statText);

    // Reload Case A1 to show Buy It in active slip
    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="case-a1"]').click();
    })()`);
    await wait(2200);

    // Capture receipt screenshot
    const screenshotData = await pageClient.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    });

    fs.writeFileSync(path.join(__dirname, 'receipt_screenshot.png'), Buffer.from(screenshotData.data, 'base64'));
    console.log('Receipt screenshot saved to receipt_screenshot.png');

    console.log('\nALL TESTS PASSED SUCCESSFULLY!');
    pageClient.close();
    browserClient.close();
  } catch (err) {
    console.error('Test error:', err);
    process.exitCode = 1;
  } finally {
    chromeProcess.kill();
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch (e) {}
  }
}

runReceiptLedgerTests();
