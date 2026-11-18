import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8080/';
const CHROME_PATH = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const shot = name => process.env.SHOT_DIR ? process.env.SHOT_DIR + '/' + name : undefined;
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox', '--ignore-certificate-errors'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => document.querySelectorAll('#linelist .lrow').length > 300);

async function pick(kw, sel) {
  await page.click(sel);
  await page.click('[data-picktab="search"]');
  await page.type('#pickerStationQ', kw);
  await page.waitForFunction(k => [...document.querySelectorAll('#pickerList [data-station]')].some(el => el.getAttribute('data-station') === k), { timeout: 10000 }, kw);
  await page.evaluate(k => [...document.querySelectorAll('#pickerList [data-station]')].find(el => el.getAttribute('data-station') === k).click(), kw);
  await page.waitForFunction(() => !document.querySelector('#stationMask').classList.contains('on'));
}
await page.click('#entryRoute');
await pick('高新技术区', '#routeFromSel');
await pick('悦江南', '#routeToSel');
await page.waitForFunction(() => document.querySelectorAll('.plan-tab').length > 0 || document.querySelector('#routeContent .pick-empty'), { timeout: 30000 });
const out = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.plan-tab')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
  summary: (document.querySelector('.plan-sum') || {}).textContent?.replace(/\s+/g, ' ').trim(),
  timeline: (document.querySelector('.timeline') || {}).textContent?.replace(/\s+/g, ' ').trim().slice(0, 500),
  empty: (document.querySelector('#routeContent > .pick-empty') || {}).textContent?.replace(/\s+/g, ' ').trim()
}));
out.errors = errors;
console.log(JSON.stringify(out, null, 2));
await browser.close();
