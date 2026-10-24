import {Game} from '../lib/game.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const out=process.env.TEST_OUTPUT||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../.test-output');mkdirSync(out,{recursive:true});
const g=new Game(),peer=()=>({send(){},close(){}}),p=[g.connect(peer()),g.connect(peer()),g.connect(peer())];
const {room}=g.handle(p[0],'create',{name:'Ludvig',avatar:0});g.handle(p[1],'join',{code:room,name:'Albin',avatar:2});g.handle(p[2],'join',{code:room,name:'Amanda',avatar:3});const r=g.rooms.get(room);
g.handle(p[0],'settings',{mode:'coop',rounds:1});const fixtures={id:p[0].id,lobby:structuredClone(g.view(r,p[0]))};g.handle(p[0],'start');r.choices=[{answer:'duva',scene:'En duva som rånar en bank',aliases:[],category:'Djur'},{answer:'viking',scene:'En viking som har fastnat i en kontorsstol',aliases:[],category:'Figurer'},{answer:'mormor',scene:'En mormor som försöker åka skateboard',aliases:[],category:'Figurer'}];fixtures.choosing=structuredClone(g.view(r,p[0]));g.handle(p[0],'choose',{index:0});fixtures.drawing=structuredClone(g.view(r,p[0]));fixtures.guesser=structuredClone(g.view(r,p[2]));fixtures.coartist=structuredClone(g.view(r,p[1]));g.handle(p[2],'guess',{text:'duva'});fixtures.reveal=structuredClone(g.view(r,p[0]));r.phase='ended';r.players.get(p[0].id).score=1640;r.players.get(p[1].id).score=1280;r.players.get(p[2].id).score=1820;fixtures.results=structuredClone(g.view(r,p[0]));writeFileSync(path.join(out,'fixtures.json'),JSON.stringify(fixtures));
