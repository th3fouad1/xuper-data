import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validate} from './update-catalog.mjs';
const fixture=()=>({movies:{movies:[{id:1,title:'Movie',enabled:true,genres:[],cast:[]}]},series:{series:[{id:2,title:'Series',enabled:true,genres:[],cast:[]}]},actors:{actors:[{id:3,name:'Actor'}]},trending:{movies:[1],series:[2]}});
test('valid catalog is accepted',()=>assert.doesNotThrow(()=>validate(fixture())));
test('dangling trending IDs are rejected',()=>{const c=fixture();c.trending.movies=[9];assert.throws(()=>validate(c),/Unresolved/);});
test('duplicate IDs are rejected',()=>{const c=fixture();c.movies.movies.push(c.movies.movies[0]);assert.throws(()=>validate(c),/Duplicate/);});
test('disabled content is excluded from trending',()=>{const c=fixture();c.movies.movies[0].enabled=false;assert.throws(()=>validate(c),/Unresolved/);});
test('empty replacement is rejected',()=>{const c=fixture();c.series.series=[];assert.throws(()=>validate(c),/Empty/);});
