import {lessons} from './lessons.js?v=20261026b';
export const easy=Object.fromEntries(lessons.map(l=>[l.id,l.easy]));
