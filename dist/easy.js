import {lessons} from './lessons.js?v=20261027b';
export const easy=Object.fromEntries(lessons.map(l=>[l.id,l.easy]));
