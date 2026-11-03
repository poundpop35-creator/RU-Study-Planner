import {mkdir,writeFile} from 'node:fs/promises';
import {courses} from '../dist/data.js';
import {scheduleICS} from '../dist/calendar-core.js';
import {calendarFeedPath} from '../dist/calendar-feed.js';

const root=new URL('../dist/',import.meta.url);
await mkdir(new URL('calendars/2-2569/',root),{recursive:true});
for(const type of ['all','lecture','exam'])for(const course of ['',...courses.filter(c=>c.enrolled).map(c=>c.id)]){
 const filters={type,course};
 await writeFile(new URL(calendarFeedPath(filters),root),scheduleICS(filters));
}
