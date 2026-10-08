import {types,esc,fa,dims,size} from './model.mjs';
export function shape(g,p){
      const label=esc(types[g.type].label+'، '+dims(g)+'، '+size(g,p));
      if(g.type==='tube'){
        const ry=7+9*Math.min(g.diameter/89,1),rx=ry*0.625,x=25,y=68,dx=75*Math.min(p.length/6,1),dy=35*Math.min(p.length/6,1),hole=Math.max(1.5,ry*2*g.thickness/g.diameter);
        return '<svg viewBox="0 0 140 95" role="img" aria-label="'+label+'"><path d="M '+x+' '+(y-ry)+' L '+(x+dx)+' '+(y-dy-ry)+' A '+rx+' '+ry+' 0 0 1 '+(x+dx)+' '+(y-dy+ry)+' L '+x+' '+(y+ry)+' Z" fill="var(--rn-steel-side)"/><ellipse cx="'+(x+dx)+'" cy="'+(y-dy)+'" rx="'+rx+'" ry="'+ry+'" fill="var(--rn-steel)"/><path d="M '+x+' '+(y-ry)+' L '+(x+dx)+' '+(y-dy-ry)+'" stroke="var(--rn-steel-front)" stroke-width="2"/><ellipse cx="'+x+'" cy="'+y+'" rx="'+rx+'" ry="'+ry+'" fill="var(--rn-steel-front)"/><ellipse cx="'+x+'" cy="'+y+'" rx="'+Math.max(3,rx-hole*0.65)+'" ry="'+Math.max(3,ry-hole)+'" fill="var(--rn-hole)"/></svg>';
      }
      if(g.type==='sheet'){
        const scale=Math.min(80/p.length,43/p.width),a=p.length*scale,b=p.width*scale,x=15,y=65,d=Math.min(8,Math.max(3,g.thickness*1.5));
        return '<svg viewBox="0 0 140 95" role="img" aria-label="'+label+'"><path d="M '+x+' '+y+' L '+(x+a)+' '+(y-14)+' L '+(x+a+20)+' '+(y-b-14)+' L '+(x+20)+' '+(y-b)+' Z" fill="var(--rn-steel-front)"/><path d="M '+x+' '+y+' L '+(x+a)+' '+(y-14)+' L '+(x+a)+' '+(y-14+d)+' L '+x+' '+(y+d)+' Z" fill="var(--rn-steel-side)"/><path d="M '+(x+a)+' '+(y-14)+' L '+(x+a+20)+' '+(y-b-14)+' L '+(x+a+20)+' '+(y-b-14+d)+' L '+(x+a)+' '+(y-14+d)+' Z" fill="var(--rn-steel)"/></svg>';
      }
      const scale=24/Math.max(g.width,g.height),w=Math.max(6,g.width*scale),h=Math.max(6,g.height*scale),x=19,y=67,dx=73*Math.min(p.length/6,1),dy=34*Math.min(p.length/6,1),t=Math.min(Math.min(w,h)/2-0.5,Math.max(1.5,g.thickness*scale));
      return '<svg viewBox="0 0 140 95" role="img" aria-label="'+label+'"><path d="M '+x+' '+(y-h)+' L '+(x+dx)+' '+(y-h-dy)+' L '+(x+w+dx)+' '+(y-h-dy)+' L '+(x+w)+' '+(y-h)+' Z" fill="var(--rn-steel-front)"/><path d="M '+(x+w)+' '+(y-h)+' L '+(x+w+dx)+' '+(y-h-dy)+' L '+(x+w+dx)+' '+(y-dy)+' L '+(x+w)+' '+y+' Z" fill="var(--rn-steel-side)"/><rect x="'+x+'" y="'+(y-h)+'" width="'+w+'" height="'+h+'" fill="var(--rn-steel)"/><rect x="'+(x+t)+'" y="'+(y-h+t)+'" width="'+(w-2*t)+'" height="'+(h-2*t)+'" fill="var(--rn-hole)"/></svg>';
    }
