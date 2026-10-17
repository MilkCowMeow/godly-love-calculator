'use strict';
const fs=require('node:fs'),path=require('node:path'),katex=require('katex');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'node_modules/katex/dist');
let count=0;
const source=fs.readFileSync(path.join(root,'src/calculator/mechanics.html'),'utf8');
const html=source.replace(/<script type="math\/tex(; mode=display)?">([\s\S]*?)<\/script>/g,(_,display,tex)=>{
 count++;
 const rendered=katex.renderToString(tex.trim(),{displayMode:!!display,output:'htmlAndMathml',throwOnError:true,strict:'error',trust:false});
 return display?'<div class="rules-math">'+rendered+'</div>':rendered;
}).replace(/\sdata-claim="[^"]+"/g,'');
let css=fs.readFileSync(path.join(dist,'katex.min.css'),'utf8');
css=css.replace(/@font-face\{[^}]*\}/g,rule=>{
 const name=rule.match(/url\(fonts\/([^)]*\.woff2)\)/)?.[1];
 if(!name)throw Error('KaTeX font rule has no WOFF2 source');
 const url='data:font/woff2;base64,'+fs.readFileSync(path.join(dist,'fonts',name)).toString('base64');
 return rule.replace(/src:[^;}]*/, 'src:url('+url+') format("woff2")');
});
const license=fs.readFileSync(path.join(root,'node_modules/katex/LICENSE'),'utf8');
css='/* KaTeX 0.19.0\n'+license.replace(/\*\//g,'* /')+'\n*/\n'+css;
process.stdout.write(JSON.stringify({html,css,count}));
