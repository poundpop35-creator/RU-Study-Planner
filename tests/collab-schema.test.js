import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../database/ru_collab_notes.sql',import.meta.url),'utf8');
test('shared note writes use member-based authorization and default-deny non-members',()=>{
 assert.match(sql,/coalesce\(ru_private\.ru_collab_role\(p_note_id\),''\) not in \('owner','editor'\)/);
 assert.match(sql,/coalesce\(ru_private\.ru_collab_role\(p_note_id\),''\)<>'owner'/);
 assert.match(sql,/coalesce\(p_snapshot->>'id',''\)<>p_note_id::text/);
 assert.match(sql,/revoke all on function public\.ru_collab_save\(uuid,bigint,jsonb\) from public,anon/);
 assert.match(sql,/grant execute on function public\.ru_collab_save\(uuid,bigint,jsonb\) to authenticated/);
});
test('collaboration uses private bucket and private Realtime revision messages',()=>{
 assert.match(sql,/values \('ru-collab-assets','ru-collab-assets',false,/);
 assert.match(sql,/realtime\.topic\(\) ~ '\^ru-collab:/);
 assert.match(sql,/extension in \('broadcast','presence'\)/);
 assert.match(sql,/alter table public\.ru_collab_notes enable row level security/);
 assert.match(sql,/alter table public\.ru_collab_members enable row level security/);
});
