import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const img = (p, size = 'w500') => p ? `https://image.tmdb.org/t/p/${size}${p}` : '';
const now = new Date().toISOString();
const read = async name => JSON.parse(await readFile(resolve(root, `${name}.json`), 'utf8'));
const token = process.env.TMDB_READ_TOKEN;
async function api(path, params = {}) {
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set('language', 'en-US');
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, {headers: {Authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(30000)});
    if ((r.status === 429 || r.status >= 500) && attempt < 3) {
      await new Promise(done => setTimeout(done, Math.min(30000, Number(r.headers.get('retry-after') || 2 ** attempt) * 1000)));
      continue;
    }
    if (!r.ok) throw new Error(`TMDB ${path}: HTTP ${r.status}`);
    return r.json();
  }
}
const unique = xs => [...new Set(xs)];
export function validate(catalog) {
  for (const key of ['movies','series','actors']) {
    const rows = catalog[key][key];
    if (!Array.isArray(rows) || !rows.length) throw new Error(`Empty ${key}`);
    if (new Set(rows.map(x=>x.id)).size !== rows.length) throw new Error(`Duplicate ${key} IDs`);
    for (const x of rows) {
      if (!Number.isInteger(x.id) || x.id <= 0 || !(key === 'actors' ? x.name : x.title)) throw new Error(`Invalid ${key} entry`);
      if (key !== 'actors' && (!Array.isArray(x.genres) || !Array.isArray(x.cast) || typeof x.enabled !== 'boolean')) throw new Error(`Invalid ${key} schema`);
    }
  }
  for (const key of ['movies','series']) {
    const ids = new Set(catalog[key][key].filter(x=>x.enabled).map(x=>x.id));
    for (const id of catalog.trending[key]) if (!ids.has(id)) throw new Error(`Unresolved trending ${key} ID ${id}`);
  }
}
async function main() {
  const catalog = Object.fromEntries(await Promise.all(['movies','series','actors','trending'].map(async k=>[k,await read(k)])));
  if (process.argv.includes('--validate')) { validate(catalog); console.log('Catalog validated'); return; }
  if (!token) throw new Error('Add GitHub Actions secret TMDB_READ_TOKEN before running. No files changed.');
  const maps = Object.fromEntries(['movies','series','actors'].map(k=>[k,new Map(catalog[k][k].map(x=>[x.id,x]))]));
  const lists = {};
  const changedPeople = new Set();
  for (const [kind, key, discovery] of [['movie','movies','movie/now_playing'],['tv','series','tv/on_the_air']]) {
    const trending = await api(`trending/${kind}/week`);
    const fresh = await api(discovery);
    if (!trending.results?.length || !fresh.results?.length) throw new Error(`Missing ${kind} discovery results`);
    const ids = unique([...trending.results,...fresh.results].filter(x=>!x.adult).map(x=>x.id));
    lists[key] = trending.results.filter(x=>!x.adult).map(x=>x.id);
    for (const id of ids) {
      const d = await api(`${kind}/${id}`, {append_to_response:'credits,videos'});
      if (d.adult) { lists[key]=lists[key].filter(x=>x!==id); continue; }
      const old = maps[key].get(id) || {};
      const date = d.release_date || d.first_air_date || '';
      const cast = (d.credits?.cast || []).slice(0,10).map(p=>({id:p.id,name:p.name,character:p.character||'',profile:img(p.profile_path),order:p.order||0}));
      cast.forEach(p=>changedPeople.add(p.id));
      const videos = d.videos?.results || [];
      const trailer = videos.find(v=>v.site==='YouTube' && v.type==='Trailer' && v.official) || videos.find(v=>v.site==='YouTube' && v.type==='Trailer');
      const entry = {...old,id,type:kind==='movie'?'movie':'series',adult:false,title:d.title||d.name,original_title:d.original_title||d.original_name||'',tagline:d.tagline||'',overview:d.overview||'',poster:img(d.poster_path,'w600_and_h900_face'),backdrop:img(d.backdrop_path,'w1280'),year:Number(date.slice(0,4))||0,rating:d.vote_average||0,vote_count:d.vote_count||0,popularity:d.popularity||0,genres:(d.genres||[]).map(g=>g.name),original_language:d.original_language||'',countries:(d.production_countries||[]).map(c=>c.name),studios:(d.production_companies||[]).map(c=>({id:c.id,name:c.name,logo:img(c.logo_path)})),trailer_youtube_key:trailer?.key||'',cast,featured:old.featured??false,enabled:old.enabled??true,tmdb_url:`https://www.themoviedb.org/${kind}/${id}`,imported_at:old.imported_at||now,updated_at:now};
      if (kind==='movie') Object.assign(entry,{release_date:date,runtime:d.runtime||0});
      else {
        const seasons=[];
        for (const s of d.seasons||[]) {
          const full=await api(`tv/${id}/season/${s.season_number}`);
          if (!Array.isArray(full.episodes)) throw new Error(`Missing episodes: ${id}/${s.season_number}`);
          seasons.push({season_number:s.season_number,name:s.name||'',overview:s.overview||'',poster:img(s.poster_path),air_date:s.air_date,episode_count:full.episodes.length,episodes:full.episodes.map(e=>({id:e.id,episode_number:e.episode_number,title:e.name||'',overview:e.overview||'',still:img(e.still_path),runtime:e.runtime||0,air_date:e.air_date,rating:e.vote_average||0}))});
        }
        Object.assign(entry,{first_air_date:date,last_air_date:d.last_air_date,status:d.status,number_of_seasons:d.number_of_seasons,number_of_episodes:d.number_of_episodes,seasons});
      }
      maps[key].set(id,entry);
    }
  }
  for (const id of changedPeople) {
    const p=await api(`person/${id}`);
    const old=maps.actors.get(id)||{};
    const linked=key=>[...maps[key].values()].filter(x=>x.cast?.some(c=>c.id===id)).map(x=>x.id);
    maps.actors.set(id,{...old,id,name:p.name,photo:img(p.profile_path),biography:p.biography||'',birthday:p.birthday,deathday:p.deathday,place_of_birth:p.place_of_birth,known_for_department:p.known_for_department||'',popularity:p.popularity||0,imdb_id:p.imdb_id,also_known_as:p.also_known_as||[],movies:unique([...(old.movies||[]),...linked('movies')]),series:unique([...(old.series||[]),...linked('series')]),tmdb_url:`https://www.themoviedb.org/person/${id}`,imported_at:old.imported_at||now,updated_at:now});
  }
  for (const key of ['movies','series','actors']) catalog[key]={...catalog[key],[key]:[...maps[key].values()],updated_at:now};
  const movies=lists.movies.filter(id=>maps.movies.get(id)?.enabled);
  const series=lists.series.filter(id=>maps.series.get(id)?.enabled);
  const mixed=[];
  for(let i=0;i<Math.max(movies.length,series.length);i++) {
    if(movies[i]) mixed.push({type:'movie',id:movies[i]});
    if(series[i]) mixed.push({type:'series',id:series[i]});
  }
  catalog.trending={...catalog.trending,movies,series,mixed,trending:mixed,updated_at:now};
  validate(catalog);
  // All network requests and validation finish before any catalog file is written.
  for (const key of ['movies','series','actors','trending']) await writeFile(resolve(root,`${key}.json`),JSON.stringify(catalog[key],null,2)+'\n');
  console.log(`Updated ${maps.movies.size} movies, ${maps.series.size} series, ${maps.actors.size} actors`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e=>{console.error(e.message);process.exitCode=1;});
