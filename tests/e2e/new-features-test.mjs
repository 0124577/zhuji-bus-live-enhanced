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

const entries = await page.$$eval('.entry-card', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
const result = { entries, errors };

async function pickStation(buttonSel, keyword) {
  await page.click(buttonSel);
  await page.waitForFunction(() => document.querySelector('#stationMask').classList.contains('on'));
  await page.click('[data-picktab="search"]');
  await page.type('#pickerStationQ', keyword);
  await page.waitForFunction(() => document.querySelectorAll('#pickerList [data-station]').length > 0, { timeout: 10000 });
  const count = await page.$$eval('#pickerList [data-station]', els => els.length);
  const name = await page.$eval('#pickerList [data-station]', el => el.getAttribute('data-station'));
  await page.click('#pickerList [data-station]');
  await page.waitForFunction(() => !document.querySelector('#stationMask').classList.contains('on'));
  return { count, name };
}

// 功能1：站点实时到站
await page.click('#entryArrival');
await page.waitForFunction(() => document.querySelector('#arrivalPage').classList.contains('active'));
result.arrivalPick = await pickStation('#arrivalSel', '火车站');
await page.waitForFunction(() => document.querySelector('#arrivalContent').textContent.indexOf('正在查询') === -1, { timeout: 60000 });
result.arrival = await page.evaluate(() => ({
  station: document.querySelector('#arrivalStationName').textContent,
  summary: document.querySelector('#arrivalSummary').textContent.replace(/\s+/g, ' ').trim(),
  lines: document.querySelectorAll('#arrivalContent .aline').length,
  cards: document.querySelectorAll('#arrivalContent .bcard').length,
  first: (document.querySelector('#arrivalContent .aline') || {}).textContent?.replace(/\s+/g, ' ').trim().slice(0, 240) || ''
}));
await page.screenshot({ path: shot('arrival.png') });

// 边界：搜索无结果
await page.click('#arrivalSel');
await page.click('[data-picktab="search"]');
await page.type('#pickerStationQ', '绝对不存在的站点XYZ');
await new Promise(r => setTimeout(r, 400));
result.noResult = await page.$eval('#pickerList', el => el.textContent.replace(/\s+/g, ' ').trim().slice(0, 120));
await page.click('#pickerClose');

// 功能2：路线规划
await page.click('#arrivalBack');
await page.click('#entryRoute');
await page.waitForFunction(() => document.querySelector('#routePage').classList.contains('active'));
result.routeFrom = await pickStation('#routeFromSel', '客运中心');
result.routeTo = await pickStation('#routeToSel', '火车站');
await page.waitForFunction(() => document.querySelectorAll('#routeContent .plan-tab').length > 0 || document.querySelector('#routeContent .pick-empty'), { timeout: 20000 });
result.route = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('.plan-tab')].map(e => e.textContent.replace(/\s+/g, ' ').trim()),
  summary: (document.querySelector('.plan-sum') || {}).textContent?.replace(/\s+/g, ' ').trim().slice(0, 200) || '',
  timeline: (document.querySelector('.timeline') || {}).textContent?.replace(/\s+/g, ' ').trim().slice(0, 300) || '',
  empty: (document.querySelector('#routeContent .pick-empty') || {}).textContent?.replace(/\s+/g, ' ').trim().slice(0, 150) || ''
}));
if (await page.$('.plan-tab:nth-child(2)')) {
  await page.click('.plan-tab:nth-child(2)');
  result.route.tab2 = await page.$eval('.plan-sum', el => el.textContent.replace(/\s+/g, ' ').trim().slice(0, 120));
}
await page.screenshot({ path: shot('route.png') });

// 线路树展开选择
await page.click('#routeFromSel');
await page.waitForFunction(() => document.querySelectorAll('#pickerList [data-line-toggle]').length > 100);
await page.type('#pickerLineQ', '1路');
await new Promise(r => setTimeout(r, 300));
result.treeLines = await page.$$eval('#pickerList [data-line-toggle]', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()).slice(0, 5));
await page.click('#pickerList [data-line-toggle]');
await new Promise(r => setTimeout(r, 200));
result.treeStops = await page.$$eval('#pickerList [data-stop]', els => els.length);
await page.click('#pickerClose');

result.errors = errors;
console.log(JSON.stringify(result, null, 2));
await browser.close();
