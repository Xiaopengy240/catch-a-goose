'use strict';
const fs=require('node:fs');
const path=require('node:path');
let html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>`<style>${fs.readFileSync(path.join(__dirname,'style.css'),'utf8')}</style>`);
const scripts=[];
html=html.replace(/<script defer src="([^"]+)"><\/script>/g,(_,src)=>{
  const script=fs.readFileSync(path.join(__dirname,src),'utf8').replace(/<\/script/gi,'<\\/script');
  scripts.push(`<script>\n${script}\n</script>`);
  return '';
});
// Keep UMD libraries in global scope and initialize only after the body exists.
html=html.replace('</body>',()=>scripts.join('\n')+'\n</body>');
const favicon=fs.readFileSync(path.join(__dirname,'assets/favicon.svg'),'utf8');
html=html.replace('href="assets/favicon.svg"',()=>`href="data:image/svg+xml,${encodeURIComponent(favicon)}"`);
const licenses=['LICENSE','vendor/matter-LICENSE.txt','vendor/lucide-LICENSE.txt']
  .map(file=>`${file}\n${fs.readFileSync(path.join(__dirname,file),'utf8')}`).join('\n\n');
html+=`\n<!-- Bundled license notices\n${licenses.replace(/--/g,'- -')}\n-->\n`;
const out=path.resolve(process.argv[2]||path.join(__dirname,'..','抓个大鹅.html'));
fs.writeFileSync(out,html);
console.log(`Standalone game: ${out} (${Math.round(Buffer.byteLength(html)/1024)} KB)`);
