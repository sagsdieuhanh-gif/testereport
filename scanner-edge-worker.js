/* E-REPORT/SAGS · CAMSCANER live edge worker · V1.19 */
'use strict';

let gray = null;
let bin = null;
let seen = null;
let queue = null;
const hist = new Uint32Array(256);

function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function dist(a,b){ return Math.hypot(a.x-b.x,a.y-b.y); }
function quadArea(p){
  let a=0;
  for(let i=0;i<4;i++){
    const q=p[(i+1)%4];
    a+=p[i].x*q.y-q.x*p[i].y;
  }
  return Math.abs(a)/2;
}
function ensureBuffers(n){
  if(!gray || gray.length!==n){
    gray=new Uint8Array(n);
    bin=new Uint8Array(n);
    seen=new Uint8Array(n);
    queue=new Int32Array(n);
  }else{
    seen.fill(0);
  }
  hist.fill(0);
}
function otsuThreshold(total){
  let sum=0;
  for(let i=0;i<256;i++)sum+=i*hist[i];
  let sumB=0,wB=0,maxVar=-1,thr=160;
  for(let t=0;t<256;t++){
    wB+=hist[t];
    if(!wB)continue;
    const wF=total-wB;
    if(!wF)break;
    sumB+=t*hist[t];
    const mB=sumB/wB,mF=(sum-sumB)/wF;
    const variance=wB*wF*(mB-mF)*(mB-mF);
    if(variance>maxVar){maxVar=variance;thr=t;}
  }
  return thr;
}

function detect(rgba,w,h){
  const n=w*h;
  ensureBuffers(n);
  for(let j=0,i=0;j<n;j++,i+=4){
    const y=(77*rgba[i]+150*rgba[i+1]+29*rgba[i+2])>>8;
    gray[j]=y;
    hist[y]++;
  }
  const otsu=otsuThreshold(n);
  const thr=clamp(otsu+6,112,218);
  for(let i=0;i<n;i++)bin[i]=gray[i]>=thr?1:0;

  let best=null;
  const cx=w/2,cy=h/2;
  const minComponent=n*.025;
  for(let y=1;y<h-1;y++){
    let idx=y*w+1;
    for(let x=1;x<w-1;x++,idx++){
      if(!bin[idx]||seen[idx])continue;
      let qh=0,qt=0;
      queue[qt++]=idx;seen[idx]=1;
      let count=0,sumX=0,sumY=0,touch=0;
      let tlV=Infinity,trV=-Infinity,brV=-Infinity,blV=Infinity;
      let tlX=0,tlY=0,trX=0,trY=0,brX=0,brY=0,blX=0,blY=0;
      while(qh<qt){
        const p=queue[qh++],yy=(p/w)|0,xx=p-yy*w;
        count++;sumX+=xx;sumY+=yy;
        if(xx<=2||yy<=2||xx>=w-3||yy>=h-3)touch++;
        const sp=xx+yy,sm=xx-yy;
        if(sp<tlV){tlV=sp;tlX=xx;tlY=yy;}
        if(sp>brV){brV=sp;brX=xx;brY=yy;}
        if(sm>trV){trV=sm;trX=xx;trY=yy;}
        if(sm<blV){blV=sm;blX=xx;blY=yy;}
        let z=p-1;if(z>0&&bin[z]&&!seen[z]){seen[z]=1;queue[qt++]=z;}
        z=p+1;if(z<n&&bin[z]&&!seen[z]){seen[z]=1;queue[qt++]=z;}
        z=p-w;if(z>0&&bin[z]&&!seen[z]){seen[z]=1;queue[qt++]=z;}
        z=p+w;if(z<n&&bin[z]&&!seen[z]){seen[z]=1;queue[qt++]=z;}
      }
      if(count<minComponent)continue;
      const mx=sumX/count,my=sumY/count;
      const centerDist=Math.hypot((mx-cx)/w,(my-cy)/h);
      const touchRatio=touch/Math.max(1,count),areaRatio=count/n;
      let score=count*(1.25-clamp(centerDist,0,.7));
      if(touchRatio>.04)score*=.45;
      if(areaRatio>.92)score*=.25;
      if(!best||score>best.score){
        best={score,count,touchRatio,areaRatio,corners:[
          {x:tlX,y:tlY},{x:trX,y:trY},{x:brX,y:brY},{x:blX,y:blY}
        ]};
      }
    }
  }
  if(!best)return {found:false,confidence:0};
  const p=best.corners;
  const area=quadArea(p)/n;
  const lens=[dist(p[0],p[1]),dist(p[1],p[2]),dist(p[2],p[3]),dist(p[3],p[0])];
  const valid=area>.12&&area<.98&&Math.min(...lens)>Math.min(w,h)*.18;
  if(!valid)return {found:false,confidence:.2};
  const confidence=clamp(.42+area*.45-best.touchRatio*1.8,.25,.92);
  return {found:confidence>=.43,confidence,corners:p};
}

self.onmessage=(event)=>{
  const m=event.data||{};
  if(m.type!=='detect'||!m.buffer||!m.width||!m.height)return;
  const started=performance.now();
  try{
    const rgba=new Uint8ClampedArray(m.buffer);
    const r=detect(rgba,m.width,m.height);
    let corners=null;
    if(r.found&&r.corners){
      const sx=m.sourceW/m.width,sy=m.sourceH/m.height;
      corners=r.corners.map(p=>({x:p.x*sx,y:p.y*sy}));
    }
    self.postMessage({
      type:'result',seq:m.seq,generation:m.generation,
      found:!!r.found,confidence:Number(r.confidence||0),corners,
      sourceW:m.sourceW,sourceH:m.sourceH,processMs:performance.now()-started
    });
  }catch(error){
    self.postMessage({type:'result',seq:m.seq,generation:m.generation,found:false,confidence:0,error:String(error&&error.message||error),sourceW:m.sourceW,sourceH:m.sourceH,processMs:performance.now()-started});
  }
};
