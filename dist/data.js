import {catalog} from './content.js?v=20261027c';
import {resourceSources} from './resource-sources.js?v=20261027c';
export const {meta,categories,categoryTargets,readingWeek,studyPhases,studyHours,courseColors,calendar}=catalog.config;
export const sources=[...catalog.config.sources,...resourceSources.filter(s=>!catalog.config.sources.some(existing=>existing.id===s.id))];
export const {courses,terms,schedules}=catalog;
