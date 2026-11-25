// Local-only static preview and browser QA report receiver. No dependencies.
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');let result=null;
http.createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname;
  if(pathname==='/qa/result') {
    if(request.method==='POST') {
      let body='';request.on('data',chunk=>{body+=chunk;});request.on('end',()=>{
        result=JSON.parse(body);response.end('OK');console.log(JSON.stringify(result,null,2));
      });
    } else {response.setHeader('Content-Type','application/json');response.end(JSON.stringify(result));}
    return;
  }
  const file=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)||file.includes(path.sep+'.git'+path.sep)){response.writeHead(403).end();return;}
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.jpg':'image/jpeg'};
  fs.readFile(file,(error,data)=>{response.writeHead(error?404:200,{'Content-Type':types[path.extname(file)]||'text/plain','Cache-Control':'no-store'});response.end(error?'Not found':data);});
}).listen(8765,'127.0.0.1',()=>console.log('QA: http://127.0.0.1:8765/scripts/test-browser.html'));
