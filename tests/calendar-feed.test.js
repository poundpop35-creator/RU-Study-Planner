import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {courses} from '../dist/data.js';
import {scheduleICS} from '../dist/calendar-core.js';
import {calendarFeedPath,calendarSubscriptionURL} from '../dist/calendar-feed.js';

test('every subscription feed matches the full-term export and selected filters',async()=>{
 for(const type of ['all','lecture','exam'])for(const course of ['',...courses.filter(c=>c.enrolled).map(c=>c.id)]){
  const filters={type,course},url=new URL('../dist/'+calendarFeedPath(filters),import.meta.url);
  assert.equal(await readFile(url,'utf8'),scheduleICS(filters),'Regenerate feeds with node scripts/generate-calendar-feeds.mjs');
 }
});
test('subscription links retain site subpaths without exporting account tokens or credentials',()=>{
 assert.equal(calendarSubscriptionURL({},'https://example.test/app/calendar-view.js?v=123#space=private'),'webcal://example.test/app/calendars/2-2569/all.ics');
 assert.equal(calendarSubscriptionURL({type:'exam',course:'POL2104'},'https://user:secret@example.test/calendar-view.js'),'webcal://example.test/calendars/2-2569/exam-POL2104.ics');
 assert.throws(()=>calendarFeedPath({course:'../private'}));
 assert.throws(()=>calendarFeedPath({type:'private'}));
 assert.equal(calendarSubscriptionURL({},'file:///tmp/calendar-view.js'),'');
});
