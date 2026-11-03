import {courses} from './data.js?v=20261027c';

export function calendarFeedPath({type='all',course=''}={}){
 if(!['all','lecture','exam'].includes(type)||course&&!courses.some(c=>c.enrolled&&c.id===course))throw new Error('Unknown calendar filter');
 return `./calendars/2-2569/${type}${course?'-'+course:''}.ics`;
}
// Resolve from the module, never from a personal-space URL or its capability hash.
export function calendarSubscriptionURL(filters={},base=import.meta.url){
 const url=new URL(calendarFeedPath(filters),base);
 if(!['https:','http:'].includes(url.protocol))return '';
 url.username='';url.password='';url.search='';url.hash='';
 return 'webcal://'+url.host+url.pathname;
}
