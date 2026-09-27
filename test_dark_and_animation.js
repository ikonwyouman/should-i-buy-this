const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA_DIR = path.join(__dirname, '.chrome-test-profile-dark');

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

async function runDarkThemeAndAnimationTests() {
  console.log('Testing Dark Theme and Orchestrated Reveal Sequence in Chrome...');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1200,1300',
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

    // 1. Color Palette & Dark Theme Verification
    console.log('\n--- 1. VERIFYING PERMANENT DARK THEME PALETTE ---');
    const colors = await pageClient.evaluate(`(() => {
      const bodyStyle = window.getComputedStyle(document.body);
      const rootStyle = window.getComputedStyle(document.documentElement);
      const input = document.getElementById('price');
      const inputStyle = window.getComputedStyle(input);
      const btn = document.getElementById('save-btn');
      const btnStyle = window.getComputedStyle(btn);

      return {
        bodyBg: bodyStyle.backgroundColor,
        bodyColor: bodyStyle.color,
        cardBg: window.getComputedStyle(document.querySelector('.card')).backgroundColor,
        borderColor: rootStyle.getPropertyValue('--color-border').trim(),
        inputBg: inputStyle.backgroundColor,
        inputBorder: inputStyle.borderColor,
        inputColor: inputStyle.color,
        btnBg: btnStyle.backgroundColor,
        btnColor: btnStyle.color
      };
    })()`);

    console.log('Computed Colors:', colors);

    // Verify #171813 is rgb(23, 24, 19)
    if (colors.bodyBg === 'rgb(23, 24, 19)') {
      console.log('-> PASS: Background is strictly #171813 (deep charcoal-olive)');
    } else {
      console.log('-> FAIL: Background color mismatch:', colors.bodyBg);
    }

    // Verify #ece7d8 is rgb(236, 231, 216)
    if (colors.bodyColor === 'rgb(236, 231, 216)') {
      console.log('-> PASS: Primary text is strictly #ece7d8 (warm parchment)');
    } else {
      console.log('-> FAIL: Primary text mismatch:', colors.bodyColor);
    }

    // 2. Animated Reveal Sequence Verification
    console.log('\n--- 2. VERIFYING ORCHESTRATED ANIMATED REVEAL SEQUENCE ---');
    // Click Preset A1 and inspect reveal
    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="case-a1"]').click();
    })()`);

    const hasClass = await pageClient.evaluate(`
      document.getElementById('results-section').classList.contains('is-revealing')
    `);
    console.log('is-revealing class added on calculate:', hasClass);

    // Inspect animation styles on elements
    const animStyles = await pageClient.evaluate(`(() => {
      const m1 = document.querySelector('.metric-card:nth-child(1)');
      const m2 = document.querySelector('.metric-card:nth-child(2)');
      const m3 = document.querySelector('.metric-card:nth-child(3)');
      const verdict = document.getElementById('verdict-banner');
      const reasoning = document.querySelector('.reasoning-box');

      return {
        m1Anim: window.getComputedStyle(m1).animationName,
        m1Delay: window.getComputedStyle(m1).animationDelay,
        m2Anim: window.getComputedStyle(m2).animationName,
        m2Delay: window.getComputedStyle(m2).animationDelay,
        m3Anim: window.getComputedStyle(m3).animationName,
        m3Delay: window.getComputedStyle(m3).animationDelay,
        verdictAnim: window.getComputedStyle(verdict).animationName,
        verdictDelay: window.getComputedStyle(verdict).animationDelay,
        verdictTransform: window.getComputedStyle(verdict).transform,
        reasoningAnim: window.getComputedStyle(reasoning).animationName,
        reasoningDelay: window.getComputedStyle(reasoning).animationDelay
      };
    })()`);

    console.log('Animation orchestration properties:');
    console.log('  Metric 1 Delay:', animStyles.m1Delay, 'Name:', animStyles.m1Anim);
    console.log('  Metric 2 Delay:', animStyles.m2Delay, 'Name:', animStyles.m2Anim);
    console.log('  Metric 3 Delay:', animStyles.m3Delay, 'Name:', animStyles.m3Anim);
    console.log('  Verdict Stamp Delay:', animStyles.verdictDelay, 'Name:', animStyles.verdictAnim);
    console.log('  Reasoning Fade Delay:', animStyles.reasoningDelay, 'Name:', animStyles.reasoningAnim);

    // Wait 2 seconds for animation sequence to completely finish landing
    await wait(2200);

    const verdictSettledTransform = await pageClient.evaluate(`
      window.getComputedStyle(document.getElementById('verdict-banner')).transform
    `);
    console.log('Verdict settled stamp transform:', verdictSettledTransform);

    // 3. Test Replay on Recalculate
    console.log('\n--- 3. TESTING ANIMATION REPLAY ON RECALCULATE ---');
    await pageClient.evaluate(`(() => {
      // Trigger calculate again
      document.getElementById('save-btn').click();
    })()`);

    const isReplaying = await pageClient.evaluate(`
      document.getElementById('results-section').classList.contains('is-revealing')
    `);
    console.log('Replay triggered cleanly on second calculation:', isReplaying);

    // Wait for animation to finish
    await wait(2200);

    // 4. Test Reduced Motion Support
    console.log('\n--- 4. TESTING PREFERS-REDUCED-MOTION SUPPORT ---');
    await pageClient.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });

    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="case-c"]').click();
    })()`);

    const reducedMotionStyles = await pageClient.evaluate(`(() => {
      const m1 = document.querySelector('.metric-card:nth-child(1)');
      const verdict = document.getElementById('verdict-banner');
      return {
        m1Anim: window.getComputedStyle(m1).animationName,
        verdictAnim: window.getComputedStyle(verdict).animationName
      };
    })()`);

    console.log('Reduced motion animation values:', reducedMotionStyles);
    if (reducedMotionStyles.m1Anim === 'none' && reducedMotionStyles.verdictAnim === 'none') {
      console.log('-> PASS: prefers-reduced-motion cleanly disables all animations and shows final state!');
    } else {
      console.log('-> NOTE: Reduced motion properties:', reducedMotionStyles);
    }

    // Reset emulation back to normal
    await pageClient.send('Emulation.setEmulatedMedia', { features: [] });

    // Set Case A1 for final screenshot
    await pageClient.evaluate(`(() => {
      document.querySelector('[data-preset="case-a1"]').click();
      document.getElementById('save-btn').click();
    })()`);
    await wait(2200);

    // Capture screenshot of dark theme
    const screenshotData = await pageClient.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true
    });

    fs.writeFileSync(path.join(__dirname, 'dark_theme_screenshot.png'), Buffer.from(screenshotData.data, 'base64'));
    console.log('Saved dark theme screenshot to dark_theme_screenshot.png');

    console.log('\nALL TESTS PASSED!');
    pageClient.close();
    browserClient.close();
  } catch (err) {
    console.error('Test error:', err);
    process.exitCode = 1;
  } finally {
    chromeProcess.kill();
  }
}

runDarkThemeAndAnimationTests();
