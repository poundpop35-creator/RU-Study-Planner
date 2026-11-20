// Pinned, local browser assets: the app does not depend on a runtime CDN.
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir(new URL('../dist/vendor/',import.meta.url),{recursive:true});
for(const [source,target] of [
 ['@supabase/supabase-js/dist/umd/supabase.js','supabase-2.117.3.js'],['@supabase/supabase-js/LICENSE','SUPABASE-LICENSE.txt']
])await copyFile(new URL('../node_modules/'+source,import.meta.url),new URL('../dist/vendor/'+target,import.meta.url));
