const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_PASSWORD = process.env.ECONEXUS_ADMIN_PASSWORD || 'EcoNexusAdmin123!';
const DATA_FILE = path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

function loadData(){
  if(!fs.existsSync(DATA_FILE)){
    const initial={
      users:{}, sessions:{}, events:[], gallery:[], updates:[],
      settings:{appName:'EcoNexus',latestVersion:'1.0.0',announcement:'Welcome to EcoNexus',maintenance:false}
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial,null,2));
    return initial;
  }
  try{return JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));}
  catch(e){return {users:{},sessions:{},events:[],gallery:[],updates:[],settings:{appName:'EcoNexus',latestVersion:'1.0.0',announcement:'',maintenance:false}};}
}
let db=loadData();
function save(){fs.writeFileSync(DATA_FILE,JSON.stringify(db,null,2));}
function id(){return crypto.randomUUID();}
function token(){return crypto.randomBytes(32).toString('hex');}
function now(){return new Date().toISOString();}
function send(res,status,payload,headers={}){
  const body=typeof payload==='string'?payload:JSON.stringify(payload);
  res.writeHead(status,Object.assign({'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'},headers));
  res.end(body);
}
function notFound(res){send(res,404,{error:'Not found'});}
function parseBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>10*1024*1024) req.destroy();});req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch(e){reject(e);}});req.on('error',reject);});}
function auth(req){const h=req.headers.authorization||'';const t=h.startsWith('Bearer ')?h.slice(7):'';return t&&db.sessions[t]?db.sessions[t]:null;}
function requireAdmin(req){const s=auth(req);return s&&s.admin?s:null;}
function safeUser(u){return {id:u.id,email:u.email,name:u.name||'',createdAt:u.createdAt,lastLogin:u.lastLogin||null,lastSeen:u.lastSeen||null,active:!!u.lastSeen&&(Date.now()-new Date(u.lastSeen).getTime()<90000)};}
function serveStatic(res,pathname){
  const file=pathname==='/'?path.join(PUBLIC_DIR,'index.html'):path.join(PUBLIC_DIR,pathname.replace(/^\//,''));
  if(!file.startsWith(PUBLIC_DIR)) return notFound(res);
  if(!fs.existsSync(file)) return notFound(res);
  const ext=path.extname(file).toLowerCase();
  const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webmanifest':'application/manifest+json'};
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Access-Control-Allow-Origin':'*'});
  fs.createReadStream(file).pipe(res);
}

const server=http.createServer(async(req,res)=>{
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS'});return res.end();}
  const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  const p=url.pathname;
  try{
    if(!p.startsWith('/api/')) return serveStatic(res,p);

    if(p==='/api/health' && req.method==='GET') return send(res,200,{ok:true,app:'EcoNexus',time:now()});

    if(p==='/api/auth/register' && req.method==='POST'){
      const b=await parseBody(req); const email=String(b.email||'').trim().toLowerCase(); const password=String(b.password||'');
      if(!email||password.length<6) return send(res,400,{error:'Email and password are required.'});
      if(db.users[email]) return send(res,409,{error:'Account already exists.'});
      const u={id:id(),email,passwordHash:crypto.createHash('sha256').update(password).digest('hex'),createdAt:now(),lastLogin:now(),lastSeen:now()};
      db.users[email]=u; const t=token(); db.sessions[t]={userId:u.id,email:u.email,createdAt:now(),lastSeen:now()}; save(); return send(res,200,{token:t});
    }
    if(p==='/api/auth/login' && req.method==='POST'){
      const b=await parseBody(req); const email=String(b.email||'').trim().toLowerCase(); const password=String(b.password||''); const u=db.users[email];
      if(!u||u.passwordHash!==crypto.createHash('sha256').update(password).digest('hex')) return send(res,401,{error:'Invalid credentials.'});
      u.lastLogin=now(); u.lastSeen=now(); const t=token(); db.sessions[t]={userId:u.id,email:u.email,createdAt:now(),lastSeen:now()}; save(); return send(res,200,{token:t});
    }
    if(p==='/api/auth/demo' && req.method==='POST'){
      const email='demo@econexus.app';
      if(!db.users[email]) db.users[email]={id:id(),email,name:'Demo User',passwordHash:crypto.createHash('sha256').update('demo123').digest('hex'),createdAt:now(),lastLogin:null,lastSeen:null};
      const u=db.users[email];u.lastLogin=now();u.lastSeen=now();const t=token();db.sessions[t]={userId:u.id,email,createdAt:now(),lastSeen:now()};save();return send(res,200,{token:t});
    }
    if(p==='/api/auth/heartbeat' && req.method==='POST'){
      const s=auth(req); if(!s) return send(res,401,{error:'Not authenticated.'}); s.lastSeen=now(); const u=Object.values(db.users).find(x=>x.id===s.userId); if(u) u.lastSeen=now(); save(); return send(res,200,{ok:true});
    }

    if(p==='/api/admin/login' && req.method==='POST'){
      const b=await parseBody(req); if(String(b.password||'')!==ADMIN_PASSWORD) return send(res,401,{error:'Invalid admin password.'});
      const t=token();db.sessions[t]={admin:true,createdAt:now(),lastSeen:now()};return send(res,200,{token:t});
    }
    if(p.startsWith('/api/admin/') && !requireAdmin(req)) return send(res,401,{error:'Admin authentication required.'});

    if(p==='/api/admin/users' && req.method==='GET'){
      const users=Object.values(db.users).map(safeUser).sort((a,b)=>new Date(b.lastLogin||0)-new Date(a.lastLogin||0));
      const today=new Date().toISOString().slice(0,10);
      const active=users.filter(u=>u.active).length;
      const loggedInToday=users.filter(u=>u.lastLogin&&u.lastLogin.slice(0,10)===today).length;
      const newAccounts=users.filter(u=>u.createdAt&&u.createdAt.slice(0,10)===today).length;
      return send(res,200,{users,stats:{total:users.length,active,loggedInToday,newAccounts}});
    }
    if(p==='/api/admin/users/logout' && req.method==='POST'){
      const b=await parseBody(req); const uid=String(b.userId||'');
      for(const [t,s] of Object.entries(db.sessions)){if(s.userId===uid) delete db.sessions[t];}
      const u=Object.values(db.users).find(x=>x.id===uid);if(u)u.lastSeen=null;save();return send(res,200,{ok:true});
    }

    if(p==='/api/admin/events' && req.method==='GET') return send(res,200,{events:db.events});
    if(p==='/api/admin/events' && req.method==='POST'){const b=await parseBody(req);const e={...b,id:id(),createdAt:now()};db.events.push(e);save();return send(res,200,e);}
    if(p==='/api/admin/events' && req.method==='DELETE'){const b=await parseBody(req);db.events=db.events.filter(x=>x.id!==b.id);save();return send(res,200,{ok:true});}
    if(p==='/api/events' && req.method==='GET') return send(res,200,{events:db.events});

    if(p==='/api/admin/updates' && req.method==='GET') return send(res,200,{updates:db.updates});
    if(p==='/api/admin/updates' && req.method==='POST'){const b=await parseBody(req);const x={...b,id:id(),date:new Date().toISOString().slice(0,10),createdAt:now()};db.updates.unshift(x);save();return send(res,200,x);}
    if(p==='/api/admin/updates' && req.method==='DELETE'){const b=await parseBody(req);db.updates=db.updates.filter(x=>x.id!==b.id);save();return send(res,200,{ok:true});}
    if(p==='/api/updates' && req.method==='GET') return send(res,200,{updates:db.updates});

    if(p==='/api/settings' && req.method==='GET') return send(res,200,db.settings);
    if(p==='/api/admin/settings' && req.method==='PUT'){const b=await parseBody(req);db.settings={...db.settings,...b};save();return send(res,200,db.settings);}

    if(p==='/api/gallery' && req.method==='GET') return send(res,200,{gallery:db.gallery});
    if(p==='/api/admin/gallery' && req.method==='POST'){const b=await parseBody(req);const x={id:id(),title:b.title||'EcoNexus Photo',url:b.data,createdAt:now()};db.gallery.unshift(x);save();return send(res,200,x);}
    if(p==='/api/admin/gallery' && req.method==='DELETE'){const b=await parseBody(req);db.gallery=db.gallery.filter(x=>x.id!==b.id);save();return send(res,200,{ok:true});}

    return notFound(res);
  }catch(e){console.error(e);return send(res,500,{error:'Server error'});}
});
server.listen(PORT,HOST,()=>{console.log(`EcoNexus server running at http://${HOST}:${PORT}`);console.log(`LAN address: http://YOUR-PC-IP:${PORT}`);console.log(`Admin password: ${ADMIN_PASSWORD}`);});
