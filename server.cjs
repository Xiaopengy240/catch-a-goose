'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.png':'image/png','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
const argPort=Number(process.env.PORT||process.argv[2]||4173);
const host=process.env.HOST||'127.0.0.1';
function serve(port) {
  const server=http.createServer((req,res)=>{
    let pathname;
    try { pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname); }
    catch {res.writeHead(400);res.end('Bad request');return;}
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    const rel=path.relative(root,file);
    if(rel.startsWith('..')||path.isAbsolute(rel)||rel.split(path.sep).some(x=>x.startsWith('.'))||!types[path.extname(file)]) {
      res.writeHead(403);res.end('Forbidden');return;
    }
    fs.readFile(file,(err,data)=>{
      if(err) {res.writeHead(404);res.end('Not found');return;}
      res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
      res.end(data);
    });
  });
  server.on('error',error=>{
    if(error.code==='EADDRINUSE'&&port<argPort+20) serve(port+1);
    else {console.error(error.message);process.exitCode=1;}
  });
  server.listen(port,host,()=>console.log(`Goose game running at http://${host}:${port}`));
}
serve(argPort);
