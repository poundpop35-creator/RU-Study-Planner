import {catalog} from './content.js?v=20261026b';
import {resourceSources} from './resource-sources.js?v=20261026b';
export const {meta,categories,categoryTargets,readingWeek,studyPhases,studyHours,courseColors,calendar}=catalog.config;
export const sources=[...catalog.config.sources,...resourceSources.filter(s=>!catalog.config.sources.some(existing=>existing.id===s.id))];
export const {courses,terms,schedules}=catalog;
