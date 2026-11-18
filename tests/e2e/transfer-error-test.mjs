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
await page.setViewport({ width: 420, height: 860 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForFunction(() => document.querySelectorAll('#linelist .lrow').length > 300);

async function pick(keyword, sel) {
  await page.click(sel);
  await page.click('[data-picktab="search"]');
  await page.type('#pickerStationQ', keyword);
  await page.waitForFunction(() => document.querySelectorAll('#pickerList [data-station]').length > 0, { timeout: 10000 });
  const exact = await page.evaluateHandle(kw => {
    return [...document.querySelectorAll('#pickerList [data-station]')].find(el => el.getAttribute('data-station') === kw);
  }, keyword);
  const el = exact.asElement();
  if (el) await el.click(); else await page.click('#pickerList [data-station]');
  await page.waitForFunction(() => !document.querySelector('#stationMask').classList.contains('on'));
}

const result = {};
await page.click('#entryRoute');
await pick('西施殿公交首末站', '#routeFromSel');
await pick('徐里（竹蓬）', '#routeToSel');
await page.waitForFunction(() => document.querySelectorAll('.plan-tab').length > 0 || document.querySelector('#routeContent .pick-empty'), { timeout: 20000 });
result.transfer = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.plan-tab')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
  summary: (document.querySelector('.plan-sum') || {}).textContent?.replace(/\s+/g, ' ').trim().slice(0, 200) || '',
  timeline: (document.querySelector('.timeline') || {}).textContent?.replace(/\s+/g, ' ').trim().slice(0, 400) || '',
  empty: (document.querySelector('.pick-empty') || {}).textContent?.replace(/\s+/g, ' ').trim() || ''
}));
await page.screenshot({ path: shot('transfer.png') });

// 网络异常：拦截实时接口后重新查询站点到站
await page.click('#routeBack');
await page.setRequestInterception(true);
page.on('request', req => {
  if (req.url().includes('/bus/vehicle/dynamic/')) req.abort('failed');
  else req.continue();
});
await page.click('#entryArrival');
await pick('火车站', '#arrivalSel');
await page.waitForFunction(() => document.querySelector('#arrivalContent').textContent.includes('没查出来'), { timeout: 30000 });
result.networkError = await page.$eval('#arrivalContent', el => el.textContent.replace(/\s+/g, ' ').trim().slice(0, 180));
result.errors = errors;
console.log(JSON.stringify(result, null, 2));
await browser.close();
