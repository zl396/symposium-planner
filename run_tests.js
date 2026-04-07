const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8788;
const ROOT = path.resolve(__dirname);
const BASE = `http://localhost:${PORT}/index.html`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const filePath = path.join(ROOT, url === '/' ? 'index.html' : url);
  const ext = path.extname(filePath);
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': types[ext] || 'text/plain' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

let passed = 0, failed = 0;

function log(name, ok, detail) {
  const icon = ok ? '✓' : '✗';
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`  ${icon} [${status}] ${name} — ${detail}`);
  if (ok) passed++; else failed++;
}

async function getState(page) {
  return page.evaluate(() => {
    const stored = (() => { try { return JSON.parse(localStorage.getItem('symposium2026')); } catch { return null; } })();
    return {
      cardCount: document.querySelectorAll('.card').length,
      scheduledCards: document.querySelectorAll('.card.in-schedule').length,
      conflictCards: document.querySelectorAll('.card.has-conflict').length,
      filterTags: document.querySelectorAll('.filter-tag').length,
      badge: document.getElementById('scheduleCount').textContent,
      btnAllActive: document.getElementById('btnAll').classList.contains('active'),
      btnScheduleActive: document.getElementById('btnSchedule').classList.contains('active'),
      filterDate: document.getElementById('filterDate').value,
      filterTime: document.getElementById('filterTime').value,
      filterLocation: document.getElementById('filterLocation').value,
      filterProgram: document.getElementById('filterProgram').value,
      filterAdvisor: document.getElementById('filterAdvisor').value,
      filterKeyword: document.getElementById('filterKeyword').value,
      stored
    };
  });
}

async function openPage(context) {
  const page = await context.newPage();
  page.on('pageerror', err => console.error('  [page error]', err.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.card,.empty');
  return page;
}

async function run() {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();

  try {
    // ========================================
    // TEST 1: Fresh load
    // ========================================
    console.log('\n1. Fresh Load');
    {
      const ctx = await browser.newContext();
      const page = await openPage(ctx);
      const s = await getState(page);

      log('Schedule is empty', s.badge === '0', `Badge: ${s.badge}`);
      log('All 127 sessions rendered', s.cardCount === 127, `Cards: ${s.cardCount}`);
      log('All Sessions view active', s.btnAllActive && !s.btnScheduleActive,
        `All: ${s.btnAllActive}, Schedule: ${s.btnScheduleActive}`);
      log('No filter tags', s.filterTags === 0, `Tags: ${s.filterTags}`);
      await ctx.close();
    }

    // ========================================
    // TEST 2: Add sessions and reload
    // ========================================
    console.log('\n2. Add Sessions & Reload');
    {
      const ctx = await browser.newContext();
      const page = await openPage(ctx);

      // Click "Add" on first 3 cards
      await page.locator('.card-actions .btn-add').nth(0).click();
      await page.waitForTimeout(50);
      await page.locator('.card-actions .btn-add').nth(0).click();
      await page.waitForTimeout(50);
      await page.locator('.card-actions .btn-add').nth(0).click();
      await page.waitForTimeout(50);

      let s = await getState(page);
      log('3 sessions added', s.badge === '3', `Badge: ${s.badge}`);
      log('State saved to localStorage', s.stored !== null && s.stored.schedule.length === 3,
        `Stored: ${JSON.stringify(s.stored?.schedule)}`);
      log('3 cards highlighted', s.scheduledCards === 3, `In-schedule: ${s.scheduledCards}`);

      // Reload
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.card');
      s = await getState(page);

      log('Schedule survives reload', s.badge === '3', `Badge after reload: ${s.badge}`);
      log('Cards highlighted after reload', s.scheduledCards === 3, `In-schedule: ${s.scheduledCards}`);
      await ctx.close();
    }

    // ========================================
    // TEST 3: Filter state persistence
    // ========================================
    console.log('\n3. Filter Persistence');
    {
      const ctx = await browser.newContext();
      const page = await openPage(ctx);

      await page.selectOption('#filterDate', '2026-04-09');
      await page.waitForTimeout(100);
      let s = await getState(page);
      const filteredCount = s.cardCount;
      log('Date filter reduces results', filteredCount < 127, `Cards: ${filteredCount}`);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.card,.empty');
      s = await getState(page);

      log('Date filter survives reload', s.filterDate === '2026-04-09', `filterDate: ${s.filterDate}`);
      log('Same count after reload', s.cardCount === filteredCount, `Cards: ${s.cardCount}`);
      log('Filter tag rendered', s.filterTags >= 1, `Tags: ${s.filterTags}`);

      // Add location filter
      await page.selectOption('#filterLocation', 'Field Auditorium, Grainger Hall');
      await page.waitForTimeout(100);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.card,.empty');
      s = await getState(page);

      log('Multiple filters survive reload',
        s.filterDate === '2026-04-09' && s.filterLocation === 'Field Auditorium, Grainger Hall',
        `Date: ${s.filterDate}, Loc: ${s.filterLocation}`);
      log('Two filter tags shown', s.filterTags === 2, `Tags: ${s.filterTags}`);
      await ctx.close();
    }

    // ========================================
    // TEST 4: Keyword search persistence
    // ========================================
    console.log('\n4. Keyword Persistence');
    {
      const ctx = await browser.newContext();
      const page = await openPage(ctx);

      await page.fill('#filterKeyword', 'energy');
      await page.waitForTimeout(300);
      let s = await getState(page);
      const kwCount = s.cardCount;
      log('Keyword filters results', kwCount < 127 && kwCount > 0, `Cards: ${kwCount}`);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.card,.empty');
      s = await getState(page);

      log('Keyword survives reload', s.filterKeyword === 'energy', `Keyword: "${s.filterKeyword}"`);
      log('Same results after reload', s.cardCount === kwCount, `Cards: ${s.cardCount}`);
      await ctx.close();
    }

    // ========================================
    // TEST 5: View toggle persistence
    // ========================================
    console.log('\n5. View Toggle Persistence');
    {
      const ctx = await browser.newContext();
      const page = await openPage(ctx);

      await page.locator('.card-actions .btn-add').first().click();
      await page.waitForTimeout(50);
      await page.click('#btnSchedule');
      await page.waitForTimeout(100);
      let s = await getState(page);

      log('Schedule view shows 1 session', s.cardCount === 1, `Cards: ${s.cardCount}`);
      log('Schedule button active', s.btnScheduleActive, `Active: ${s.btnScheduleActive}`);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.card,.empty');
      s = await getState(page);

      log('Schedule view survives reload', s.btnScheduleActive, `Active: ${s.btnScheduleActive}`);
      log('Still shows 1 session', s.cardCount === 1, `Cards: ${s.cardCount}`);
      await ctx.close();
    }

    // ========================================
    // TEST 6: Remove session persists
    // ========================================
    console.log('\n6. Remove Session');
    {
      const ctx = await browser.newContext();
      const page = await openPage(ctx);

      // Add then remove
      await page.locator('.card-actions .btn-add').first().click();
      await page.waitForTimeout(50);
      let s = await getState(page);
      log('Session added', s.badge === '1', `Badge: ${s.badge}`);

      await page.locator('.card-actions .btn-remove').first().click();
      await page.waitForTimeout(50);
      s = await getState(page);
      log('Session removed', s.badge === '0', `Badge: ${s.badge}`);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.card');
      s = await getState(page);

      log('Removal persists after reload', s.badge === '0', `Badge: ${s.badge}`);
      await ctx.close();
    }

    // ========================================
    // TEST 7: Conflict detection with persistence
    // ========================================
    console.log('\n7. Conflict Detection');
    {
      const ctx = await browser.newContext();
      const page = await openPage(ctx);

      // Filter to 9:05 AM on Apr 9 — multiple rooms have sessions
      await page.selectOption('#filterDate', '2026-04-09');
      await page.selectOption('#filterTime', '9:05 AM');
      await page.waitForTimeout(100);

      // Add all visible sessions
      let addCount = await page.locator('.card-actions .btn-add').count();
      for (let i = 0; i < addCount; i++) {
        await page.locator('.card-actions .btn-add').first().click();
        await page.waitForTimeout(50);
      }

      let s = await getState(page);
      log('Conflicts detected', s.conflictCards > 0, `Conflict cards: ${s.conflictCards}`);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.card');
      s = await getState(page);

      log('Conflicts persist after reload', s.conflictCards > 0, `Conflict cards: ${s.conflictCards}`);

      const warnCount = await page.locator('.conflict-warn').count();
      log('Conflict warnings displayed', warnCount > 0, `Warnings: ${warnCount}`);
      await ctx.close();
    }

    // ========================================
    // TEST 8: Clear all filters
    // ========================================
    console.log('\n8. Clear Filters');
    {
      const ctx = await browser.newContext();
      const page = await openPage(ctx);

      await page.selectOption('#filterDate', '2026-04-10');
      await page.selectOption('#filterProgram', 'DEL');
      await page.waitForTimeout(100);

      await page.click('#btnClearFilters');
      await page.waitForTimeout(100);
      let s = await getState(page);

      log('Filters cleared', s.filterDate === '' && s.filterProgram === '',
        `Date: "${s.filterDate}", Program: "${s.filterProgram}"`);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.card');
      s = await getState(page);

      log('Cleared state persists', s.filterDate === '' && s.filterProgram === '',
        `Date: "${s.filterDate}", Program: "${s.filterProgram}"`);
      log('All sessions shown', s.cardCount === 127, `Cards: ${s.cardCount}`);
      await ctx.close();
    }

    // ========================================
    // TEST 9: Stress test — all sessions
    // ========================================
    console.log('\n9. Stress Test');
    {
      const ctx = await browser.newContext();
      const page = await openPage(ctx);

      // Click all Add buttons
      let addCount = await page.locator('.card-actions .btn-add').count();
      // Use JS to speed this up
      await page.evaluate(() => {
        document.querySelectorAll('.card-actions .btn-add').forEach(btn => btn.click());
      });
      await page.waitForTimeout(200);

      let s = await getState(page);
      log('All sessions scheduled', s.badge === '127', `Badge: ${s.badge}`);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.card');
      s = await getState(page);

      log('Full schedule survives reload', s.badge === '127', `Badge: ${s.badge}`);

      const storageSize = await page.evaluate(() => (localStorage.getItem('symposium2026') || '').length);
      log('localStorage size reasonable', storageSize < 5000, `Size: ${storageSize} bytes`);
      await ctx.close();
    }

    // ========================================
    // TEST 10: Corrupted localStorage recovery
    // ========================================
    console.log('\n10. Corruption Recovery');
    {
      const ctx = await browser.newContext();
      // Set corrupted data before loading
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => localStorage.setItem('symposium2026', 'INVALID{{{{'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.card');

      const s = await getState(page);
      log('Handles corrupted data gracefully', s.cardCount === 127, `Cards: ${s.cardCount}`);
      log('Schedule empty on corruption', s.badge === '0', `Badge: ${s.badge}`);
      log('Defaults to All view', s.btnAllActive, `All active: ${s.btnAllActive}`);
      await ctx.close();
    }

    // ========================================
    // TEST 11: Scroll position restoration
    // ========================================
    console.log('\n11. Scroll Position');
    {
      const ctx = await browser.newContext();
      const page = await openPage(ctx);

      await page.evaluate(() => window.scrollTo(0, 1500));
      await page.waitForTimeout(100);
      // Trigger save by adding a session
      await page.locator('.card-actions .btn-add').first().click();
      await page.waitForTimeout(100);

      const savedScroll = await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('symposium2026'));
        return s?.scrollY || 0;
      });
      log('Scroll position saved', savedScroll > 0, `Saved scrollY: ${savedScroll}`);

      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.card');
      await page.waitForTimeout(500);

      const restoredScroll = await page.evaluate(() => window.scrollY);
      log('Scroll position restored', restoredScroll > 0, `Restored scrollY: ${restoredScroll}`);
      await ctx.close();
    }

    // ========================================
    // TEST 12: Export CSV with persisted schedule
    // ========================================
    console.log('\n12. Export CSV');
    {
      const ctx = await browser.newContext();
      const page = await openPage(ctx);

      await page.locator('.card-actions .btn-add').nth(0).click();
      await page.waitForTimeout(50);
      await page.locator('.card-actions .btn-add').nth(0).click();
      await page.waitForTimeout(50);

      await page.click('#btnSchedule');
      await page.waitForTimeout(100);

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#btnExportCsv')
      ]);

      log('CSV download triggered', download !== null, `File: ${download.suggestedFilename()}`);
      log('Filename has my_schedule', download.suggestedFilename().includes('my_schedule'),
        `File: ${download.suggestedFilename()}`);

      const dlPath = await download.path();
      const csv = fs.readFileSync(dlPath, 'utf-8');
      const lines = csv.trim().split('\n');
      log('CSV has header + 2 rows', lines.length === 3, `Lines: ${lines.length}`);
      await ctx.close();
    }

    // ========================================
    // TEST 13: Export ICS (Outlook Calendar)
    // ========================================
    console.log('\n13. Export ICS (Outlook Calendar)');
    {
      const ctx = await browser.newContext();
      const page = await openPage(ctx);

      // Add 2 sessions
      await page.locator('.card-actions .btn-add').nth(0).click();
      await page.waitForTimeout(50);
      await page.locator('.card-actions .btn-add').nth(0).click();
      await page.waitForTimeout(50);

      await page.click('#btnSchedule');
      await page.waitForTimeout(100);

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#btnExportIcs')
      ]);

      log('ICS download triggered', download !== null, `File: ${download.suggestedFilename()}`);
      log('Filename is .ics', download.suggestedFilename().endsWith('.ics'),
        `File: ${download.suggestedFilename()}`);
      log('Filename has my_schedule', download.suggestedFilename().includes('my_schedule'),
        `File: ${download.suggestedFilename()}`);

      const dlPath = await download.path();
      const ics = fs.readFileSync(dlPath, 'utf-8');

      log('ICS starts with VCALENDAR', ics.startsWith('BEGIN:VCALENDAR'),
        `Starts with: ${ics.substring(0, 30)}`);
      log('ICS ends with VCALENDAR', ics.trim().endsWith('END:VCALENDAR'),
        `Ends correctly`);

      const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
      log('ICS contains 2 events', eventCount === 2, `Events: ${eventCount}`);

      log('ICS has DTSTART with timezone', ics.includes('DTSTART;TZID=America/New_York:'),
        `Has DTSTART`);
      log('ICS has DTEND with timezone', ics.includes('DTEND;TZID=America/New_York:'),
        `Has DTEND`);
      log('ICS has SUMMARY', ics.includes('SUMMARY:'), `Has SUMMARY`);
      log('ICS has LOCATION', ics.includes('LOCATION:'), `Has LOCATION`);
      log('ICS has DESCRIPTION with presenters', ics.includes('Presenters:'),
        `Has presenter info`);
      log('ICS has unique UIDs', ics.includes('UID:symposium2026-'), `Has UIDs`);

      // Verify timezone info
      log('ICS declares timezone', ics.includes('X-WR-TIMEZONE:America/New_York'),
        `Has timezone`);

      await ctx.close();
    }

    // ========================================
    // TEST 14: ICS export from filtered All view
    // ========================================
    console.log('\n14. ICS Export with Filters');
    {
      const ctx = await browser.newContext();
      const page = await openPage(ctx);

      // Filter to a specific date
      await page.selectOption('#filterDate', '2026-04-07');
      await page.waitForTimeout(100);

      const cardCount = await page.locator('.card').count();

      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('#btnExportIcs')
      ]);

      const dlPath = await download.path();
      const ics = fs.readFileSync(dlPath, 'utf-8');
      const eventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;

      log('ICS exports filtered results', eventCount === cardCount,
        `Events: ${eventCount}, Cards: ${cardCount}`);
      log('All events on correct date', !ics.includes('20260408T') && !ics.includes('20260409T'),
        `Only Apr 7 events`);

      await ctx.close();
    }

  } catch (err) {
    console.error('\n[ERROR]', err.message);
    failed++;
  }

  // ========== SUMMARY ==========
  console.log('\n' + '='.repeat(50));
  const total = passed + failed;
  if (failed === 0) {
    console.log(`✓ ALL ${total} TESTS PASSED`);
  } else {
    console.log(`✗ ${failed}/${total} TESTS FAILED, ${passed} passed`);
  }

  await browser.close();
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error(err);
  server.close();
  process.exit(1);
});
