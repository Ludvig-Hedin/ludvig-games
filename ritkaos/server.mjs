import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { upgrade } from './lib/websocket.mjs';
import { Game } from './lib/game.mjs';
import { networkKey } from './lib/network.mjs';
import { t } from './lib/i18n.mjs';
import { storeInfo, validSecret } from './lib/store.mjs';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'public');
const port=Number(process.env.PORT)||3000;
const secret=process.env.RITKAOS_UNLOCK_SECRET||'',checkout=process.env.CHECKOUT_URL||'';
const game=new Game({secret});const peers=new Set();
const staticFiles=new Map([['/','index.html'],['/index.html','index.html'],['/app.js','app.js'],['/theme.js','theme.js'],['/style.css','style.css'],['/favicon.svg','favicon.svg']]);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
// A proxy on this machine (for example a tunnel) may forward the visitor's address; only trust it from loopback.
const loopback=a=>/^(127\.|::1$|::ffff:127\.)/.test(a||'');
const clientNetwork=req=>{const remote=req.socket.remoteAddress,forwarded=loopback(remote)&&(req.headers['cf-connecting-ip']||String(req.headers['x-forwarded-for']||'').split(',')[0].trim());return networkKey(forwarded||remote,{lan:true});};
const addresses=()=>Object.values(networkInterfaces()).flat().filter(x=>x.family==='IPv4'&&!x.internal).map(x=>`http://${x.address}:${port}`);
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  let pathname;try{pathname=new URL(req.url,'http://localhost').pathname;}catch{res.writeHead(400).end();return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
  if(pathname==='/api/connection'){
    const localHost=/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host||'');
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    res.end(JSON.stringify({lan:localHost?addresses():[],port,version:'1.0.0'}));return;
  }
  if(pathname==='/api/store'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(storeInfo({secret,checkout})));return;}
  if(pathname==='/api/rooms'){
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    res.end(JSON.stringify({rooms:game.listRooms({network:clientNetwork(req)})}));return;
  }
  if(pathname==='/health'){res.setHeader('Content-Type','application/json');res.end('{"ok":true,"game":"ritkaos"}');return;}
  const file=staticFiles.get(pathname);
  if(!file){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'}).end('Finns inte. Öppna spelets startsida.');return;}
  try{const bytes=await readFile(path.join(root,file));res.setHeader('Content-Type',types[path.extname(file)]);res.setHeader('Cache-Control','no-cache');res.writeHead(200);res.end(req.method==='HEAD'?undefined:bytes);}catch{res.writeHead(500).end('En spelfil saknas. Packa upp hela zip-filen.');}
});
server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/ws'||peers.size>=250){socket.end('HTTP/1.1 503 Service Unavailable\r\n\r\n');return;}
  // Same-origin browser clients only. Non-browser clients remain subject to all game validation.
  if(req.headers.origin){try{if(new URL(req.headers.origin).host!==req.headers.host){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}}catch{socket.destroy();return;}}
  const network=clientNetwork(req);const peer=upgrade(req,socket,head);if(!peer)return;peers.add(peer);let session=null;
  const timeout=setTimeout(()=>{if(!session)peer.close(1008);},10000);timeout.unref();
  peer.on('message',text=>{
    if(text==='ping'){peer.frame(1,'pong');return;} // Same keep-alive the Cloudflare host answers without waking.
    let packet;
    try{
      packet=JSON.parse(text);
      if(!packet||typeof packet.type!=='string'||packet.type.length>40)throw new Error(t(session?.lang,'invalid'));
      if(!session){if(packet.type!=='hello')throw new Error(t(packet.data?.lang,'helloFirst'));session=game.connect(peer,packet.data?.token,{network,lang:packet.data?.lang});clearTimeout(timeout);game.unlock(session,packet.data?.codes).catch(()=>{});return;}
      const result=game.handle(session,packet.type,packet.data),request=packet.request;
      // Code redemption is async (Web Crypto); everything else answers right away.
      const ack=data=>{if(Number.isSafeInteger(request))peer.send({type:'ack',request,ok:true,data});},fail=e=>{if(Number.isSafeInteger(request))peer.send({type:'ack',request,ok:false,error:e.message||t(session?.lang,'generic')});};
      if(result instanceof Promise)result.then(ack,fail);else ack(result);
    }catch(e){
      if(Number.isSafeInteger(packet?.request))peer.send({type:'ack',request:packet.request,ok:false,error:e.message||t(session?.lang,'generic')});
      else if(!session)peer.close(1008);
    }
  });
  peer.on('close',()=>{clearTimeout(timeout);peers.delete(peer);if(session)game.disconnect(session,peer);});
});
const tick=setInterval(()=>game.tick(),250);
const heartbeat=setInterval(()=>{for(const peer of peers)peer.ping();},20000);
server.on('error',e=>{
  console.error(e.code==='EADDRINUSE'?`\nPort ${port} används redan. Spelet kanske redan körs? Öppna http://localhost:${port}\nEller: PORT=3001 npm start`:`Serverfel: ${e.message}`);process.exit(1);
});
server.listen(port,'0.0.0.0',()=>{
  console.log(`\n  ✎  R I T K A O S\n\n  Du:       http://localhost:${port}\n`);
  for(const addr of addresses())console.log(`  Samma wifi: ${addr}`);
  if(!validSecret(secret))console.log('\n  Ritkaos+: koder är avstängda (RITKAOS_UNLOCK_SECRET saknas). Allt gratis fungerar som vanligt.');
  console.log('\n  Skapa ett rum och klicka Bjud in.\n  Behåll detta fönster öppet medan ni spelar.\n  Olika nätverk: se SPELA-IKVALL.md eller kör npm run online.\n  Avsluta: Ctrl+C\n');
});
function shutdown(){clearInterval(tick);clearInterval(heartbeat);for(const p of peers)p.close(1001);server.close(()=>process.exit());setTimeout(()=>process.exit(),1500).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
