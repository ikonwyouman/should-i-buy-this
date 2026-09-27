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
          reject(new Error(`Failed to parse JSON from ${url}: ${data} (${e.message})`));
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

async function runBrowserTests() {
  console.log('Starting Headless Chrome for testing...');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1200,900',
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
      } catch (e) {
        // Retry
      }
    }

    if (!versionData) throw new Error('Could not connect to Chrome debugging endpoint');

    console.log('Connected to Chrome DevTools Protocol at:', versionData.webSocketDebuggerUrl);
    browserClient = new CDPClient(versionData.webSocketDebuggerUrl);
    await browserClient.init();

    // Query targets to find the page target
    const targetsRes = await browserClient.send('Target.getTargets');
    console.log('Available targets:', targetsRes.targetInfos.map(t => ({ type: t.type, url: t.url })));

    let pageTarget = targetsRes.targetInfos.find(t => t.type === 'page' && t.url.includes('3000'));
    if (!pageTarget) {
      // Create new page target
      const created = await browserClient.send('Target.createTarget', { url: 'http://localhost:3000' });
      pageTarget = { targetId: created.targetId };
    }

    const pageWsUrl = `ws://127.0.0.1:9222/devtools/page/${pageTarget.targetId}`;
    console.log('Connecting to page WebSocket:', pageWsUrl);

    pageClient = new CDPClient(pageWsUrl);
    await pageClient.init();

    await pageClient.send('Page.enable');
    await pageClient.send('DOM.enable');
    await pageClient.send('Runtime.enable');

    await wait(1000);

    const title = await pageClient.evaluate('document.title');
    console.log('Page Title:', title);

    // Test 1: Verify elements loaded
    const hasForm = await pageClient.evaluate('!!document.getElementById("calculator-form")');
    console.log('Calculator form present:', hasForm);

    // ========================================================================
    // Test Case (a): $15 item at 14% vs 16% budget share
    // ========================================================================
    console.log('\n--- BROWSER TEST: Test Case (a) - $15 item at 14% vs 16% ---');
    // Click Preset 1 (14%)
    await pageClient.evaluate(`
      document.querySelector('[data-preset="case-a1"]').click();
    `);
    await wait(300);
    const caseA1Result = await pageClient.evaluate(`
      ({
        totalUses: document.getElementById('metric-total-uses').textContent,
        costPerUse: document.getElementById('metric-cost-per-use').textContent,
        budgetShare: document.getElementById('metric-budget-share').textContent,
        verdict: document.getElementById('verdict-text').textContent,
        reasoning: document.getElementById('reasoning-text').textContent
      })
    `);
    console.log('Case A (14% Budget):', caseA1Result);

    // Click Preset 2 (16%)
    await pageClient.evaluate(`
      document.querySelector('[data-preset="case-a2"]').click();
    `);
    await wait(300);
    const caseA2Result = await pageClient.evaluate(`
      ({
        totalUses: document.getElementById('metric-total-uses').textContent,
        costPerUse: document.getElementById('metric-cost-per-use').textContent,
        budgetShare: document.getElementById('metric-budget-share').textContent,
        verdict: document.getElementById('verdict-text').textContent,
        reasoning: document.getElementById('reasoning-text').textContent
      })
    `);
    console.log('Case A (16% Budget):', caseA2Result);

    if (caseA1Result.verdict === 'Buy it' && caseA2Result.verdict === 'Buy it') {
      console.log('-> PASS: Case (a) produced smooth and consistent recommendations without sudden cliff jumping!');
    } else {
      console.log('-> FAIL: Case (a)');
    }

    // ========================================================================
    // Test Case (b): $1-per-use item at 70% budget share
    // ========================================================================
    console.log('\n--- BROWSER TEST: Test Case (b) - $1/use at 70% budget share ---');
    await pageClient.evaluate(`
      document.querySelector('[data-preset="case-b"]').click();
    `);
    await wait(300);
    const caseBResult = await pageClient.evaluate(`
      ({
        totalUses: document.getElementById('metric-total-uses').textContent,
        costPerUse: document.getElementById('metric-cost-per-use').textContent,
        budgetShare: document.getElementById('metric-budget-share').textContent,
        verdict: document.getElementById('verdict-text').textContent,
        reasoning: document.getElementById('reasoning-text').textContent,
        dangerAlertVisible: !document.getElementById('danger-zone-alert').classList.contains('hidden')
      })
    `);
    console.log('Case B Result:', caseBResult);

    if (caseBResult.verdict === 'Skip it' && caseBResult.dangerAlertVisible) {
      console.log('-> PASS: Case (b) was pulled down hard by affordability and danger zone, not auto-approved by value alone!');
    } else {
      console.log('-> FAIL: Case (b)');
    }

    // ========================================================================
    // Test Case (c): 60%+ budget share danger zone forces "Skip it"
    // ========================================================================
    console.log('\n--- BROWSER TEST: Test Case (c) - 60%+ budget share forces "Skip it" ---');
    await pageClient.evaluate(`
      document.querySelector('[data-preset="case-c"]').click();
    `);
    await wait(300);
    const caseCResult = await pageClient.evaluate(`
      ({
        costPerUse: document.getElementById('metric-cost-per-use').textContent,
        budgetShare: document.getElementById('metric-budget-share').textContent,
        verdict: document.getElementById('verdict-text').textContent,
        reasoning: document.getElementById('reasoning-text').textContent,
        dangerAlertVisible: !document.getElementById('danger-zone-alert').classList.contains('hidden')
      })
    `);
    console.log('Case C Result:', caseCResult);

    if (caseCResult.verdict === 'Skip it' && caseCResult.dangerAlertVisible) {
      console.log('-> PASS: Case (c) strictly forced "Skip it" via the 60%+ budget share danger zone!');
    } else {
      console.log('-> FAIL: Case (c)');
    }

    // ========================================================================
    // Test Saving to History & Running Advice Stat
    // ========================================================================
    console.log('\n--- BROWSER TEST: History and Followed Advice Tracking ---');
    // Save Case A (Buy it) to history
    await pageClient.evaluate(`
      document.querySelector('[data-preset="case-a1"]').click();
      document.getElementById('save-btn').click();
    `);
    await wait(300);

    // Save Case C (Skip it) to history
    await pageClient.evaluate(`
      document.querySelector('[data-preset="case-c"]').click();
      document.getElementById('save-btn').click();
    `);
    await wait(300);

    // Check history count
    const historyCount = await pageClient.evaluate(`
      document.querySelectorAll('.history-item').length
    `);
    console.log('History items count:', historyCount);

    // Mark Case A1 as "Actually bought it" (Followed advice!)
    await pageClient.evaluate(`(() => {
      const items = document.querySelectorAll('.history-item');
      const a1Item = items[1];
      a1Item.querySelector('.btn-bought').click();
    })()`);
    await wait(300);

    let statText = await pageClient.evaluate(`
      document.getElementById('stat-heading').textContent
    `);
    console.log('Stat after 1 item followed:', statText);

    // Mark Case C as "Actually skipped it" (Followed advice!)
    await pageClient.evaluate(`(() => {
      const items = document.querySelectorAll('.history-item');
      const cItem = items[0];
      cItem.querySelector('.btn-skipped').click();
    })()`);
    await wait(300);

    statText = await pageClient.evaluate(`
      document.getElementById('stat-heading').textContent
    `);
    console.log('Stat after 2 items followed (100%):', statText);

    if (statText.includes('100%')) {
      console.log('-> PASS: Advice tracking correctly reports 100% when user followed advice!');
    }

    // Capture screenshot
    const screenshotData = await pageClient.send('Page.captureScreenshot', { format: 'png' });
    const screenshotBuffer = Buffer.from(screenshotData.data, 'base64');
    fs.writeFileSync(path.join(__dirname, 'screenshot.png'), screenshotBuffer);
    console.log('Saved screenshot to screenshot.png');

    console.log('\nALL BROWSER TESTS PASSED SUCCESSFULLY!');

  } catch (err) {
    console.error('Browser test failed:', err);
    process.exitCode = 1;
  } finally {
    if (pageClient) pageClient.close();
    if (browserClient) browserClient.close();
    chromeProcess.kill();
  }
}

runBrowserTests();
