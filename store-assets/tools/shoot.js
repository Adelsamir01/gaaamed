// Screenshot pipeline for ديدوس (Dedos) — drives the production dist/ build
// served at http://localhost:8891 with headless Chromium.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = 'http://localhost:8891';
const OUT = path.join(__dirname, '..', 'screenshots', 'raw');
fs.mkdirSync(OUT, { recursive: true });

const SEED = JSON.stringify({
  onboarded: true,
  profile: { name: 'عادل', avatar: '🦊', handle: 'adel_92', xp: 1250, coins: 840 },
  stats: {
    memory: { played: 12, won: 9, bestScore: 14 },
    trivia: { played: 7, won: 5, bestScore: 8 },
    tictactoe: { played: 20, won: 14 },
    'bank-el7az': { played: 4, won: 2 },
  },
  settings: { sound: false },
  lastDailyClaim: null,
});

const settle = (ms = 700) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('shot:', name);
}

async function newContext(browser, seeded) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 780 },
    deviceScaleFactor: 2.6214,
    locale: 'ar',
    isMobile: true,
    hasTouch: true,
  });
  if (seeded) {
    await context.addInitScript((seed) => {
      localStorage.setItem('gaaamed-state-v1', seed);
    }, SEED);
  }
  return context;
}

(async () => {
  const browser = await chromium.launch();

  // ---- 01: Onboarding (unseeded) ----
  {
    const ctx = await newContext(browser, false);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=ديدوس', { timeout: 10000 });
    await settle(900);
    await shot(page, '01-onboarding');
    // 01b: expanded emoji picker
    try {
      await page.click('button[aria-label="المزيد من الشخصيات"]');
      await settle(600);
      await shot(page, '01b-onboarding-expanded');
    } catch (e) {
      console.log('skip 01b:', e.message);
    }
    await ctx.close();
  }

  // ---- Seeded session: all post-onboarding screens ----
  {
    const ctx = await newContext(browser, true);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror:', e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await settle(1200);

    // 02: Home
    await shot(page, '02-home');

    // 03: Games list (use the tab bar specifically)
    await page.locator('nav button', { hasText: 'الألعاب' }).click();
    await settle(900);
    await shot(page, '03-games');

    // 04: Online lobby (connects to live server ws://localhost:8787)
    try {
      await page.locator('button:has-text("غرف برمز")').click();
      await settle(2500); // allow websocket connect + presence
      await shot(page, '04-online-lobby');
      await page.locator('button:has-text("عودة للألعاب")').click();
      await settle(600);
    } catch (e) {
      console.log('online lobby failed:', e.message);
    }

    // 05: Friends — search to show live results
    await page.locator('nav button', { hasText: 'الأصدقاء' }).click();
    await settle(1000);
    try {
      await page.locator('input').first().fill('ali');
      await settle(1500);
    } catch (e) {
      console.log('friends search issue:', e.message);
    }
    await shot(page, '05-friends');

    // 06: Chats list
    await page.locator('nav button', { hasText: 'الدردشة' }).click();
    await settle(1000);
    await shot(page, '06-chats');
    // 06b: open the "new group" sheet (no submit — no server writes)
    try {
      await page.locator('button:has-text("جروب جديد")').click();
      await settle(800);
      await shot(page, '06b-new-group');
      await page.keyboard.press('Escape');
      await page.locator('button:has-text("إلغاء")').click().catch(() => {});
      await settle(400);
    } catch (e) {
      console.log('new group sheet issue:', e.message);
    }

    // 07: Offline memory game in action
    await page.locator('nav button', { hasText: 'الألعاب' }).click();
    await settle(800);
    await page.click('text=لعبة الذاكرة');
    await settle(800);
    await page.click('text=ابدأ اللعب');
    await settle(1200);
    // flip a few cards to show action
    try {
      const cards = page.locator('button:has-text("؟"), button:has-text("?")');
      const n = await cards.count();
      console.log('memory cards found:', n);
      if (n >= 4) {
        await cards.nth(0).click();
        await settle(350);
        await cards.nth(1).click();
        await settle(800);
        await cards.nth(2).click();
        await settle(350);
        await cards.nth(3).click();
        await settle(800);
      }
    } catch (e) {
      console.log('card flip issue:', e.message);
    }
    await shot(page, '07-memory-game');

    // 08: Profile — exit game first (playing -> lobby -> tabs)
    await page.locator('button:has-text("خروج")').click();
    await settle(600);
    await page.locator('button:has-text("عودة للألعاب")').click();
    await settle(700);
    await page.locator('nav button', { hasText: 'حسابي' }).click();
    await settle(1000);
    await shot(page, '08-profile');

    await ctx.close();
  }

  await browser.close();
  console.log('DONE');
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
