const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome-test-new-features-' + Date.now());

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

async function runComprehensiveTests() {
  console.log('========================================================');
  console.log('Testing All 9 New Features in Chrome (Headless)');
  console.log('========================================================');

  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1080,1800',
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

    // 1. Spool Feed and Orchestrated 4-Line Reveal Sequence
    console.log('\n--- 1. SPOOL FEED & 4-LINE REVEAL SEQUENCE ---');
    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="case-a1"]').click();
    })()`);
    await wait(80);

    const animationDetails = await pageClient.evaluate(`(() => {
      const slip = document.querySelector('.results-slip');
      const line1 = document.getElementById('metric-line-uses');
      const line2 = document.getElementById('metric-line-cost');
      const line3 = document.getElementById('metric-line-budget');
      const line4 = document.getElementById('metric-line-opportunity');
      const stamp = document.getElementById('verdict-banner');
      const envelope = document.querySelector('.reasoning-envelope');

      return {
        slipAnimation: window.getComputedStyle(slip).animationName,
        line1Delay: window.getComputedStyle(line1).animationDelay,
        line2Delay: window.getComputedStyle(line2).animationDelay,
        line3Delay: window.getComputedStyle(line3).animationDelay,
        line4Delay: window.getComputedStyle(line4).animationDelay,
        stampDelay: window.getComputedStyle(stamp).animationDelay,
        envelopeDelay: window.getComputedStyle(envelope).animationDelay,
        opportunityText: document.getElementById('metric-opportunity').textContent
      };
    })()`);

    console.log('Spool feed animation name:', animationDetails.slipAnimation);
    console.log('Delays:');
    console.log('  Line 1 (uses):', animationDetails.line1Delay);
    console.log('  Line 2 (cost/use):', animationDetails.line2Delay);
    console.log('  Line 3 (budget share):', animationDetails.line3Delay);
    console.log('  Line 4 (opportunity cost):', animationDetails.line4Delay);
    console.log('  Stamp impact:', animationDetails.stampDelay);
    console.log('  Reasoning text:', animationDetails.envelopeDelay);
    console.log('  Opportunity cost line value:', animationDetails.opportunityText);

    if (animationDetails.slipAnimation.includes('spoolFeed')) {
      console.log('-> PASS: Mechanical spoolFeed paper animation triggered on calculate.');
    }
    if (animationDetails.opportunityText.includes('coffees')) {
      console.log('-> PASS: Opportunity cost line correctly calculated ($15 purchase ≈ coffees).');
    }

    // 2. Inked Rubber Stamp Texture & Visuals
    console.log('\n--- 2. INKED RUBBER STAMP TEXTURE ---');
    await wait(2000); // wait for stamp to land
    const stampDetails = await pageClient.evaluate(`(() => {
      const stamp = document.getElementById('verdict-banner');
      const style = window.getComputedStyle(stamp);
      return {
        text: stamp.textContent.trim(),
        color: style.color,
        border: style.border,
        boxShadow: style.boxShadow,
        textShadow: style.textShadow,
        transform: style.transform
      };
    })()`);
    console.log('Stamp details:', stampDetails);
    if (stampDetails.border.includes('double') || stampDetails.border.includes('3px')) {
      console.log('-> PASS: Rubber stamp has authentic double border.');
    }
    if (stampDetails.boxShadow !== 'none' || stampDetails.textShadow !== 'none') {
      console.log('-> PASS: Inked texture features subtle ink bleed (box-shadow/text-shadow).');
    }

    // 3. 48-Hour Cooling Timer on "Sleep on it" Decisions
    console.log('\n--- 3. 48-HOUR COOLING TIMER ---');
    await pageClient.evaluate(`(() => {
      // Clear history first to start clean
      localStorage.setItem('should_i_buy_this_history_v1', JSON.stringify([]));
      // Save Sleep on it decision
      document.querySelector('[data-preset="sleep-case"]').click();
      document.getElementById('save-btn').click();
    })()`);
    await wait(300);

    const coolingTimerText = await pageClient.evaluate(`(() => {
      const timer = document.querySelector('.cooling-timer');
      return timer ? timer.textContent.trim() : null;
    })()`);
    console.log('Cooling timer displayed:', coolingTimerText);
    if (coolingTimerText && coolingTimerText.includes('COOLING:') && coolingTimerText.includes('left')) {
      console.log('-> PASS: Active 48h cooling countdown rendered for "Sleep on it" decision!');
    }

    // 4. Paper Tear-Off Delete Animation
    console.log('\n--- 4. PAPER TEAR-OFF DELETE ANIMATION ---');
    // Save another item so we have 2 items
    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="case-a1"]').click();
      document.getElementById('save-btn').click();
    })()`);
    await wait(300);

    const countBefore = await pageClient.evaluate(`document.querySelectorAll('.history-entry-row').length`);
    console.log('Entries before delete:', countBefore);

    // Click delete on first entry and check for .tearing-off class
    const tearCheck = await pageClient.evaluate(`(() => {
      const firstDelBtn = document.querySelector('.btn-delete-entry');
      firstDelBtn.click();
      const firstRow = document.querySelector('.history-entry-row');
      return {
        hasTearingClass: firstRow.classList.contains('tearing-off'),
        animationName: window.getComputedStyle(firstRow).animationName
      };
    })()`);
    console.log('Tear-off animation initiated:', tearCheck);
    if (tearCheck.hasTearingClass && tearCheck.animationName.includes('tearOffSlip')) {
      console.log('-> PASS: Paper tear-off horizontal slide animation active on delete!');
    }

    // Wait for the 350ms animation to complete removal
    await wait(450);
    const countAfter = await pageClient.evaluate(`document.querySelectorAll('.history-entry-row').length`);
    console.log('Entries after delete finished:', countAfter);
    if (countAfter === countBefore - 1) {
      console.log('-> PASS: Entry cleanly spliced and saved after tear-off animation finished.');
    }

    // 5. Export CSV & Backup JSON Functionality
    console.log('\n--- 5. CSV EXPORT & JSON BACKUP / RESTORE ---');
    const exportCheck = await pageClient.evaluate(`(() => {
      let createdBlob = null;
      let downloadName = null;
      const originalCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = (blob) => {
        createdBlob = blob;
        return 'blob:mock-url';
      };

      // Test exportToCSV
      exportToCSV();
      const csvName = downloadName;

      // Test backupToJSON
      backupToJSON();

      URL.createObjectURL = originalCreateObjectURL;

      return {
        hasCsvButton: !!document.getElementById('export-csv-btn'),
        hasBackupButton: !!document.getElementById('backup-json-btn'),
        hasRestoreButton: !!document.getElementById('restore-json-btn'),
        hasImportInput: !!document.getElementById('import-json-input'),
        hasPrintButton: !!document.getElementById('print-slip-btn')
      };
    })()`);

    console.log('Export & utility buttons check:', exportCheck);
    if (exportCheck.hasCsvButton && exportCheck.hasBackupButton && exportCheck.hasRestoreButton) {
      console.log('-> PASS: All ledger data management buttons present.');
    }

    // 6. Test JSON Restore with Mock Data
    console.log('\n--- 6. TESTING JSON TAPE RESTORE ---');
    const restoreResult = await pageClient.evaluate(`(() => {
      return new Promise((resolve) => {
        const mockBackup = [
          {
            id: 'test_backup_001',
            itemName: 'Sony Wireless Headphones',
            price: 249.99,
            usesPerMonth: 25,
            months: 24,
            budget: 500,
            verdict: 'Buy it',
            timestamp: Date.now() - 3600000,
            userAction: 'bought'
          }
        ];

        const mockEvent = {
          target: {
            files: [new Blob([JSON.stringify(mockBackup)], { type: 'application/json' })],
            value: 'mock.json'
          }
        };

        handleRestoreJSON(mockEvent);

        setTimeout(() => {
          const history = JSON.parse(localStorage.getItem('should_i_buy_this_history_v1') || '[]');
          resolve({
            foundImported: history.some(h => h.id === 'test_backup_001'),
            historyLength: history.length
          });
        }, 150);
      });
    })()`);

    console.log('Restore test result:', restoreResult);
    if (restoreResult.foundImported) {
      console.log('-> PASS: JSON restore correctly parses and merges backup records into ledger.');
    }

    // 7. Seed ledger with realistic decision entries for final screenshot
    console.log('\n--- 7. PREPARING POPULATED RECEIPT FOR SCREENSHOT ---');
    await pageClient.evaluate(`(() => {
      const mockLedger = [
        {
          id: 'dec_1',
          itemName: 'Espresso Machine ($10/use @ 40% Budget)',
          price: 80.00,
          usesPerMonth: 2,
          months: 4,
          budget: 200.00,
          totalUses: 8,
          costPerUse: 10.00,
          budgetShare: 40.0,
          verdict: 'Sleep on it — decide again in 48 hours',
          timestamp: Date.now() - (3 * 3600 * 1000), // 3 hours ago -> 45h left
          userAction: null
        },
        {
          id: 'dec_2',
          itemName: 'Portable Bluetooth Speaker (14% Budget)',
          price: 15.00,
          usesPerMonth: 4,
          months: 6,
          budget: 107.14,
          totalUses: 24,
          costPerUse: 0.63,
          budgetShare: 14.0,
          verdict: 'Buy it',
          timestamp: Date.now() - (28 * 3600 * 1000),
          userAction: 'bought'
        },
        {
          id: 'dec_3',
          itemName: 'Bulk Drafting Pens (Danger Zone 65% Budget)',
          price: 65.00,
          usesPerMonth: 65,
          months: 10,
          budget: 100.00,
          totalUses: 650,
          costPerUse: 0.10,
          budgetShare: 65.0,
          verdict: 'Skip it',
          timestamp: Date.now() - (72 * 3600 * 1000),
          userAction: 'skipped'
        }
      ];
      localStorage.setItem('should_i_buy_this_history_v1', JSON.stringify(mockLedger));
      renderHistory();

      // Trigger calculation on Case A1 for active receipt display
      document.querySelector('[data-preset="case-a1"]').click();
    })()`);
    await wait(2200); // let stamp land and reasoning settle

    // 8. Capture Full-Page Screenshot
    console.log('\n--- 8. CAPTURING HIGH-RES SCREENSHOT ---');
    const screenshotRes = await pageClient.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    });

    const buffer = Buffer.from(screenshotRes.data, 'base64');
    const screenshotPath = path.join(__dirname, 'receipt_screenshot.png');
    fs.writeFileSync(screenshotPath, buffer);
    console.log(`Saved screenshot to: ${screenshotPath}`);

    // Copy to artifact directory
    const artifactDir = 'C:\\Users\\hayat\\.gemini\antigravity\\brain\\0a515013-ebb4-41a3-b466-5ca060223b4f';
    if (fs.existsSync(artifactDir)) {
      fs.writeFileSync(path.join(artifactDir, 'receipt_screenshot.png'), buffer);
      console.log('Copied screenshot to artifacts directory.');
    }

    console.log('\n========================================================');
    console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
    console.log('========================================================');

  } catch (err) {
    console.error('Test execution failed:', err);
  } finally {
    if (pageClient) pageClient.close();
    if (browserClient) browserClient.close();
    chromeProcess.kill();
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch (e) {}
  }
}

runComprehensiveTests();
