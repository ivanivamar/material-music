(function(){
if(window.__pmRipple)return;window.__pmRipple=1;
var st=document.createElement('style');st.textContent='@keyframes pm-ripple{from{transform:translate(-50%,-50%) scale(0);opacity:.2}to{transform:translate(-50%,-50%) scale(1);opacity:0}}';document.head.appendChild(st);
function shaped(cs){return cs.clipPath!=='none'||parseFloat(cs.borderTopLeftRadius)>0||parseFloat(cs.borderBottomRightRadius)>0;}
function isBox(el,cs){
 if(cs.display==='inline')return false;
 var bg=cs.backgroundColor,hasBg=bg&&bg!=='transparent'&&!/rgba\([^)]*,\s*0\)$/.test(bg);
 if(!(hasBg||cs.backgroundImage!=='none'||cs.boxShadow!=='none'||parseFloat(cs.borderTopWidth)>0||shaped(cs)))return false;
 if(!el.textContent.trim()&&el.querySelector('img,canvas,video'))return false;
 return true;
}
function shapeSrc(el,r){
 var cs=getComputedStyle(el);if(shaped(cs))return el;
 var q=[].slice.call(el.children),depth=0;
 while(q.length&&depth<3){var nx=[];for(var i=0;i<q.length;i++){var c=q[i],cr=c.getBoundingClientRect();
  if(Math.abs(cr.width-r.width)<3&&Math.abs(cr.height-r.height)<3&&shaped(getComputedStyle(c)))return c;nx=nx.concat([].slice.call(c.children));}q=nx;depth++;}
 return el;
}
document.addEventListener('pointerdown',function(e){
 if(e.button>0)return;
 var el=e.target;
 while(el&&el!==document.body){
  if(el.nodeType===1&&!/^(SPAN|I|IMG|SVG|PATH|B|STRONG|EM|INPUT|TEXTAREA)$/i.test(el.tagName)){var cs=getComputedStyle(el);if(cs.cursor==='pointer'&&isBox(el,cs))break;}
  el=el.parentElement;
 }
 if(!el||el===document.body)return;
 var r=el.getBoundingClientRect();
 if(r.width*r.height>150000||r.width<8)return;
 if(getComputedStyle(el).position==='static')el.style.position='relative';
 var src=shapeSrc(el,r),sc=getComputedStyle(src);
 var w=document.createElement('span');
 w.style.cssText='position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1;color:inherit';
 w.style.borderRadius=sc.borderRadius;
 if(sc.clipPath!=='none'){w.style.clipPath=sc.clipPath;if(src!==el&&sc.transform!=='none')w.style.transform=sc.transform;}
 var d=Math.max(Math.hypot(Math.max(e.clientX-r.left,r.right-e.clientX),Math.max(e.clientY-r.top,r.bottom-e.clientY)),20)*2;
 var c=document.createElement('span');
 c.style.cssText='position:absolute;left:'+(e.clientX-r.left)+'px;top:'+(e.clientY-r.top)+'px;width:'+d+'px;height:'+d+'px;border-radius:50%;background:currentColor;opacity:0;animation:pm-ripple 550ms cubic-bezier(0.31,0.94,0.34,1) forwards';
 w.appendChild(c);el.appendChild(w);
 setTimeout(function(){w.remove();},620);
},true);
})();
