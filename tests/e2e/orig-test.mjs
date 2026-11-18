import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8080/';
const CHROME_PATH = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const shot = name => process.env.SHOT_DIR ? process.env.SHOT_DIR + '/' + name : undefined;
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--ignore-certificate-errors']
});
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => document.querySelectorAll('#linelist .lrow').length > 300, { timeout: 30000 });
const lineRows = await page.$$eval('#linelist .lrow', els => els.length);
await page.click('#linelist .lrow');
await page.waitForFunction(() => document.querySelector('#detailPage').classList.contains('active') && document.querySelectorAll('#stations .st').length > 5, { timeout: 30000 });
const detail = await page.evaluate(() => ({
  title: document.querySelector('#dtitle').textContent,
  dirs: document.querySelectorAll('#dirs .dir').length,
  stations: document.querySelectorAll('#stations .st').length,
  buses: document.querySelector('#buses').textContent.trim().slice(0, 80),
  ref: document.querySelector('#refTime').textContent
}));
await page.click('#stations .st:nth-child(6)');
await new Promise(r => setTimeout(r, 2500));
const afterSelect = await page.evaluate(() => ({
  mine: document.querySelectorAll('#stations .st.mine').length,
  buses: document.querySelector('#buses').textContent.trim().slice(0, 120)
}));
const ttBtn = await page.$('#ttBtn');
let timetable = null;
if (ttBtn) {
  await ttBtn.click();
  await new Promise(r => setTimeout(r, 2500));
  timetable = await page.evaluate(() => ({
    open: document.querySelector('#ttMask').classList.contains('on'),
    text: document.querySelector('#ttBody').textContent.trim().slice(0, 120)
  }));
  await page.click('#ttClose');
}
await page.click('#backBtn');
await page.waitForFunction(() => document.querySelector('#homePage').classList.contains('active'));
await page.type('#q', '105A');
await new Promise(r => setTimeout(r, 800));
const search = await page.evaluate(() => ({
  title: document.querySelector('#allTitle').textContent,
  rows: document.querySelectorAll('#linelist .lrow').length
}));
await page.click('#fsUp');
const zoom = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--font-zoom').trim());
await page.screenshot({ path: shot('original-home.png'), fullPage: false });
console.log(JSON.stringify({ lineRows, detail, afterSelect, timetable, search, zoom, errors }, null, 2));
await browser.close();
