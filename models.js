/* Original low-poly food models with procedural surface detail and shared geometry. */
(function(root){
  'use strict';
  const T=THREE, cache=new Map(), materials=new Map(), textures=new Map();
  const seedRandom=seed=>{let n=seed;return()=>{n=(n*1664525+1013904223)>>>0;return n/4294967296;};};
  function texture(kind){
    if(textures.has(kind)) return textures.get(kind);
    const c=document.createElement('canvas');c.width=c.height=256;
    const x=c.getContext('2d'),r=seedRandom(1381+kind.length*79);
    x.fillStyle='#fff';x.fillRect(0,0,256,256);
    const image=x.getImageData(0,0,256,256);
    for(let p=0;p<image.data.length;p+=4){
      const v=kind==='bread'?194+r()*61:kind==='rough'?202+r()*53:230+r()*25;
      image.data[p]=image.data[p+1]=image.data[p+2]=v;
    }
    x.putImageData(image,0,0);
    if(kind==='skin'||kind==='rough'||kind==='bread'){
      for(let i=0;i<1300;i++){
        x.fillStyle=`rgba(60,42,21,${r()*(kind==='bread'?.28:.16)})`;
        x.beginPath();x.ellipse(r()*256,r()*256,.3+r()*1.1,.3+r()*.7,r()*6,0,Math.PI*2);x.fill();
      }
    }
    if(kind==='bread'||kind==='croissant'){
      for(let i=0;i<13;i++){x.fillStyle=`rgba(125,65,20,${.05+r()*.18})`;x.beginPath();x.ellipse(r()*256,r()*256,9+r()*35,6+r()*20,0,0,7);x.fill();}
    }
    if(kind==='croissant'){
      for(let i=0;i<10;i++){
        const center=i*28;x.fillStyle='rgba(93,37,8,.16)';x.beginPath();x.moveTo(center-4,0);x.lineTo(center+5,0);x.lineTo(center-3,256);x.lineTo(center-11,256);x.fill();
        x.strokeStyle='rgba(255,229,170,.27)';x.lineWidth=1.5;x.beginPath();x.moveTo(center+6,0);x.lineTo(center-2,256);x.stroke();
      }
    }
    if(kind==='apple'||kind==='tomato'){
      for(let i=0;i<100;i++){
        x.fillStyle=`rgba(109,58,22,${r()*.16})`;x.beginPath();x.ellipse(r()*256,r()*256,2+r()*12,5+r()*40,0,0,7);x.fill();
      }
    }
    if(kind==='leaf'){
      x.strokeStyle='#bbcbb1';x.lineWidth=3;
      for(let y=0;y<256;y+=24){x.beginPath();x.moveTo(128,y);x.lineTo(0,y-38);x.moveTo(128,y);x.lineTo(256,y-38);x.stroke();}
      x.lineWidth=5;x.beginPath();x.moveTo(128,0);x.lineTo(128,256);x.stroke();
    }
    if(kind==='salmon'){
      x.fillStyle='#f47956';x.fillRect(0,0,256,256);x.strokeStyle='#ffe0b5';x.lineWidth=9;
      for(let y=-256;y<512;y+=37){x.beginPath();x.moveTo(0,y);x.bezierCurveTo(70,y+40,170,y+140,256,y+160);x.stroke();}
    }
    if(kind==='wood'){
      x.fillStyle='#dfc5a0';x.fillRect(0,0,256,256);
      for(let i=0;i<200;i++){
        const y=r()*256;x.strokeStyle=`rgba(${r()>.4?'114,81,42':'255,244,216'},${.025+r()*.09})`;x.lineWidth=.2+r()*1.4;
        x.beginPath();x.moveTo(0,y);x.bezierCurveTo(80,y-8-r()*6,180,y+15+r()*8,256,y+3);x.stroke();
      }
      for(let i=0;i<3;i++){x.fillStyle='rgba(75,43,19,.05)';x.fillRect(0,i*86,256,1);}
    }
    const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;
    textures.set(kind,tex);return tex;
  }
  function mat(color,kind='skin',roughness=.48,metalness=0){
    const key=[color,kind,roughness,metalness].join('|');
    if(!materials.has(key)) materials.set(key,new T.MeshStandardMaterial({
      color,roughness,metalness,map:kind==='plain'?null:texture(kind),
      bumpMap:kind==='plain'||kind==='salmon'?null:texture(kind),
      bumpScale:kind==='bread'?.23:kind==='rough'?.17:.065
    }));
    return materials.get(key);
  }
  const palette={
    white:()=>mat('#faf7e7','skin',.52),green:()=>mat('#356d19','leaf',.6),
    darkgreen:()=>mat('#234d0d','rough',.58),orange:()=>mat('#e57d21','skin',.52),
    stem:()=>mat('#5a4720','rough',.9),cream:()=>mat('#f3d99c','bread',.85),
    crust:()=>mat('#b7681f','bread',.73),bread:()=>mat('#e3ab54','bread',.74)
  };
  function builder(){
    const parts=[];
    function add(g,m,pos=[0,0,0],scale=[1,1,1],rot=[0,0,0]){
      const matrix=new T.Matrix4().compose(new T.Vector3(...pos),new T.Quaternion().setFromEuler(new T.Euler(...rot)),new T.Vector3(...scale));
      const geometry=g.clone().applyMatrix4(matrix);g.dispose();parts.push({geometry,material:m});return geometry;
    }
    const ball=(pos,scale,m,detail=20)=>add(new T.SphereGeometry(1,detail,detail<=12?7:14),m,pos,scale);
    const box=(pos,scale,m,rot=[0,0,0])=>add(new T.BoxGeometry(...scale,1,1,1),m,pos,[1,1,1],rot);
    const tube=(points,radius,m,segments=24)=>add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),segments,radius,8,false),m);
    const cylinder=(pos,r1,r2,height,m,rot=[Math.PI/2,0,0],segments=24)=>add(new T.CylinderGeometry(r1,r2,height,segments),m,pos,[1,1,1],rot);
    const leaf=(pos,scale,rot=0)=>ball(pos,scale,palette.green(),12).applyMatrix4(new T.Matrix4().makeTranslation(0,0,0));
    function finish(){
      const buckets=new Map();
      for(const p of parts){if(!buckets.has(p.material)) buckets.set(p.material,[]);buckets.get(p.material).push(p.geometry);}
      return [...buckets].map(([material,geos])=>{
        const geometry=T.mergeGeometries(geos,false);
        geometry.computeBoundingSphere();geos.forEach(g=>g.dispose());
        return {geometry,material};
      });
    }
    return {add,ball,box,tube,cylinder,leaf,finish};
  }
  function model(type){
    if(cache.has(type)) return cache.get(type);
    const b=builder(),{ball,box,tube,cylinder,add}=b;
    const green=palette.green(),white=palette.white(),stem=palette.stem();
    const r=seedRandom([...type].reduce((sum,c)=>sum+c.charCodeAt(0),731));
    const fruit=(color,s=[23,25,22],pos=[0,0,0],rough=.35,kind='skin')=>ball(pos,s,mat(color,kind,rough),28);
    const topStem=(y=24)=>tube([[0,y-4,4],[-1,y+4,5],[3,y+9,4]],1.8,stem,10);
    const leaf=(x,y,z,size=1,angle=0)=>add(new T.SphereGeometry(1,14,8),green,[x,y,z],[5*size,13*size,.8],[.2,0,angle]);
    const speckle=(n,radius,z,m)=>{for(let i=0;i<n;i++){const a=r()*6.28,d=Math.sqrt(r())*radius;ball([Math.cos(a)*d,Math.sin(a)*d,z],[.6+r()*.7,.45,.4],m,6);}};
    const baked=palette.bread(),crust=palette.crust();
    if(type.startsWith('goose')){
      const index=Number(type.split('-')[1]||0);
      ball([-6,-5,1],[21,25,15],white,24);
      ball([-10,-7,13],[11,20,5],mat('#e9e6d7','skin',.7),20);
      tube([[8,-8,3],[17,3,8],[15,19,11],[15,31,14]],6.1,white);
      ball([15,32,14],[9,10,8],white);
      add(new T.ConeGeometry(5.2,15,14),mat('#e79a2e','skin',.45),[27,31,15],[1,1,.52],[0,0,-Math.PI/2]);
      ball([18.5,34,21],[1.5,1.8,1.1],mat('#161911','plain',.14),10);
      ball([18.8,34.6,22],[.4,.4,.3],white,6);
      for(const x of [-15,2]){tube([[x,-21,-5],[x,-30,-3]],1.7,mat('#cf872b'),8);ball([x+2,-31,-2],[5,2.3,1.4],mat('#df982d'),10);}
      const scarf=mat(['#598472','#b96065','#4b879f','#c2963e','#8c669c','#55a3a2'][index],'plain',.77);
      add(new T.TorusGeometry(6.5,1.9,8,20),scarf,[15,18,11],[1,1,1],[Math.PI/2,0,0]);
      box([20,10,15],[3.8,13,1.5],scarf,[0,0,.22]);
      const scale=.76;const spec=b.finish();spec.forEach(p=>p.geometry.scale(scale,scale,scale));cache.set(type,spec);return spec;
    }else if(['tomato','apple','pepper','pumpkin'].includes(type)){
      const color={tomato:'#d52c1b',apple:'#b92214',pepper:'#cd2414',pumpkin:'#d97715'}[type];
      if(type==='pepper'||type==='pumpkin'){
        const n=type==='pepper'?4:9;
        for(let i=0;i<n;i++){const a=i/n*6.28;ball([Math.cos(a)*9,Math.sin(a)*8,0],[type==='pepper'?14:12,24,19],mat(color,'skin',type==='pepper'?.22:.49));}
      }else fruit(color,[25,23,21],[0,0,0],.38,type);
      topStem(23);
      if(type==='tomato')for(let i=0;i<5;i++)leaf(Math.sin(i*1.26)*7,20+Math.cos(i*1.26)*6,17,.62,i*1.26);
      if(type==='apple')leaf(10,25,9,.65,-.8);
    }else if(['pear','avocado'].includes(type)){
      if(type==='pear'){
        fruit('#c6b938',[22,23,19],[0,-5,0],.46);fruit('#cbbb3f',[12,20,11],[0,14,0],.46);topStem(31);
        leaf(9,29,4,.7,-.6);
      }else{
        ball([0,-2,0],[22,30,12],mat('#315725','rough',.92),26);
        ball([0,-2,5],[20,28,9],mat('#a6bd45','skin',.66),26);
        ball([0,-3,11],[17,24,2],mat('#d4d46b','skin',.62),26);
        ball([0,-9,13],[11,12,7],mat('#815126','rough',.75),20);
      }
    }else if(['orange','lemon','peach','potato'].includes(type)){
      const colors={orange:'#ed9120',lemon:'#edc635',peach:'#eca66c',potato:'#b99559'};
      const s=type==='lemon'?[19,28,18]:type==='potato'?[20,29,18]:[24,24,21];
      fruit(colors[type],s,[0,0,0],type==='peach'?.8:.6);
      if(type==='peach')tube([[0,23,3],[1,13,20],[1,-10,21],[0,-23,2]],.7,mat('#cc7b5c','skin',.8));
      if(type==='potato')for(let i=0;i<9;i++){const x=(r()-.5)*29,y=(r()-.5)*40;ball([x,y,Math.sqrt(Math.max(20,300-x*x*.4-y*y*.2))],[1.5,1,.7],mat('#775f39','rough'),8);}
      else topStem(21);
    }else if(type==='banana'){
      tube([[-25,12,0],[-16,-2,0],[-2,-8,0],[13,-3,1],[23,12,3]],7.3,mat('#ecca37','skin',.59));
      tube([[-24,12,0],[-19,0,5],[-3,-3,7],[14,2,6],[23,13,4]],.65,mat('#d3a32d','rough'),20);
      tube([[-25,12,0],[-27,19,0]],2.8,stem,6);tube([[23,12,3],[25,15,3]],2,stem,6);
    }else if(type==='corn'){
      const yellow=mat('#edbc38','skin',.38);
      for(let y=0;y<9;y++)for(let a=0;a<9;a++){
        const t=a/9*6.28,rad=9.5*(1-Math.abs(y-4)/16);
        ball([Math.cos(t)*rad,(y-4)*5.3,Math.sin(t)*rad],[3.5,3.5,3.5],yellow,8);
      }
      leaf(-11,-7,0,1.55,-.3);leaf(11,-8,0,1.4,.3);
      tube([[0,-21,0],[0,-31,0]],3,stem,8);
    }else if(type==='carrot'||type==='radish'){
      const carrot=type==='carrot';
      const points=[new T.Vector2(.5,-30),new T.Vector2(5,-19),new T.Vector2(10,2),new T.Vector2(13,16),new T.Vector2(9,21),new T.Vector2(0,23)];
      add(new T.LatheGeometry(points,24),carrot?mat('#d97822','rough',.7):white);
      for(let i=0;i<5;i++)leaf((i-2)*3,27+(i%2)*3,0,.7,(i-2)*-.23);
      if(carrot)for(let i=0;i<5;i++)tube([[-5+i%2,-15+i*6,7+i*.6],[4,-14+i*6,8+i*.6]],.45,mat('#ab5724','rough'),6);
    }else if(type==='egg'){
      const g=new T.SphereGeometry(1,28,20);
      const positions=g.attributes.position;
      for(let i=0;i<positions.count;i++){const y=positions.getY(i),factor=1-y*.13;positions.setXYZ(i,positions.getX(i)*19*factor,y*27,positions.getZ(i)*19*factor);}
      g.computeVertexNormals();add(g,mat('#eedbc0','rough',.73));
    }else if(type==='mushroom'){
      cylinder([0,-12,0],7,10,32,mat('#e1d3b6','rough',.9),[0,0,0]);
      ball([0,9,0],[26,15,22],mat('#d8c6a7','rough',.88),28);
      ball([0,5,2],[23,3,20],mat('#a99679','rough',.94),24);
      ball([0,11,0],[26,13,22],mat('#e1d4bb','rough',.88),28);
    }else if(type==='eggplant'||type==='cucumber'){
      const eggplant=type==='eggplant';
      ball([0,-5,0],eggplant?[17,29,15]:[10,32,10],mat(eggplant?'#4d205e':'#326c24','rough',eggplant?.2:.44),24);
      topStem(27);
      for(let i=0;i<4;i++)leaf((i-1.5)*3,19,7,.65,(i-1.5)*.7);
      if(!eggplant)for(let y=-22;y<26;y+=7)for(let x=-5;x<=5;x+=5)ball([x,y,9],[.8,.8,.5],mat('#8cac3f','rough'),6);
    }else if(type==='broccoli'){
      tube([[0,-29,0],[0,-5,0],[15,7,0]],5.8,mat('#9ca858','rough'),16);
      tube([[0,-4,0],[-15,10,0]],4,mat('#9ca858','rough'),12);
      const m=mat('#3c7224','rough',.94);
      for(let i=0;i<35;i++){const a=r()*6.28,d=Math.sqrt(r())*20;ball([Math.cos(a)*d,11+Math.sin(a)*d*.75,r()*12],[5+r()*3,5+r()*3,5+r()*3],m,8);}
    }else if(type==='strawberry'){
      const g=new T.SphereGeometry(1,24,18),p=g.attributes.position;
      for(let i=0;i<p.count;i++){const y=p.getY(i),s=.7+y*.25;p.setXYZ(i,p.getX(i)*28*s,y*27,p.getZ(i)*24*s);}
      g.computeVertexNormals();add(g,mat('#c72b21','skin',.36));
      for(let i=0;i<35;i++){const y=-18+r()*36,a=r()*6.28,s=(.7+y/27*.25)*Math.sqrt(1-(y/28)**2);ball([Math.cos(a)*28*s,y,Math.sin(a)*24*s],[.7,1.3,.6],mat('#e6c075','skin',.45),6);}
      for(let i=0;i<5;i++)leaf(Math.sin(i*1.26)*5,22,Math.cos(i*1.26)*5,.65,i*1.26);
    }else if(type==='kiwi'){
      cylinder([0,0,0],25,25,10,mat('#9b7340','rough',.94));
      cylinder([0,0,5.5],23.5,23.5,1,mat('#87ad36','skin',.54));
      cylinder([0,0,6.3],8,8,1,mat('#e3df9d','skin',.61));
      for(let i=0;i<30;i++){
        const a=i/30*6.28,rad=12+(i%2)*4;
        ball([Math.cos(a)*rad,Math.sin(a)*rad,7],[.65,1.3,.5],mat('#262713','plain',.5),6);
        tube([[Math.cos(a)*8,Math.sin(a)*8,7],[Math.cos(a)*21,Math.sin(a)*21,7]],.28,mat('#bed368','skin'),4);
      }
    }else if(type==='watermelon'){
      const shape=new T.Shape();shape.moveTo(-29,0);shape.lineTo(0,32);shape.lineTo(29,0);shape.quadraticCurveTo(0,-15,-29,0);
      add(new T.ExtrudeGeometry(shape,{depth:12,bevelEnabled:true,bevelSize:1,bevelThickness:1,bevelSegments:1,steps:1}),mat('#27732d','rough',.65),[0,-12,-6]);
      const flesh=new T.Shape();flesh.moveTo(-24,2);flesh.lineTo(0,28);flesh.lineTo(24,2);flesh.quadraticCurveTo(0,-9,-24,2);
      add(new T.ExtrudeGeometry(flesh,{depth:1,bevelEnabled:false}),mat('#e3574c','skin',.51),[0,-12,7]);
      for(const [x,y] of [[0,8],[-9,-2],[10,-2],[-16,-10],[15,-10]])ball([x,y,9],[1,2,.7],mat('#392e1c','plain'),8);
    }else if(type==='grape'){
      for(let row=0;row<4;row++)for(let j=0;j<4-row;j++)fruit(['#644071','#574168','#705379'][(j+row)%3],[9,10,9],[(j-(3-row)/2)*13,18-row*13,(j%2)*4],.28);
      topStem(30);leaf(9,27,4,.8,-.7);
    }else if(type==='croissant'){
      const positions=[],uv=[],indices=[],rings=64,sides=12;
      for(let i=0;i<=rings;i++){
        const t=i/rings*2-1,base=2+12*Math.pow(1-t*t,.72),rad=base*(1+.085*Math.cos(t*Math.PI*9));
        const center=new T.Vector3(t*31,7-22*t*t,0),tangent=new T.Vector3(31,-44*t,0).normalize(),side=new T.Vector3(-tangent.y,tangent.x,0);
        for(let j=0;j<=sides;j++){
          const a=j/sides*Math.PI*2,p=center.clone().addScaledVector(side,Math.cos(a)*rad);
          p.z=Math.sin(a)*rad*.85;positions.push(p.x,p.y,p.z);uv.push(i/rings,j/sides);
          if(i<rings&&j<sides){const k=i*(sides+1)+j;indices.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1);}
        }
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
      add(g,mat('#b86f25','croissant',.67));
    }else if(['bread','baguette','toast'].includes(type)){
      if(type==='bread'||type==='baguette'){
        const elongated=type==='baguette';
        ball([0,0,0],elongated?[12,35,12]:[24,27,18],crust,28);
        for(let i=-2;i<=2;i++){
          const y=i*(elongated?11:8);
          tube([[-8,y-3,elongated?9:15],[1,y+2,elongated?12:18],[9,y+6,elongated?8:14]],.9,mat('#d4ac68','bread',.85),12);
        }
      }else{
        box([0,-4,0],[40,40,11],crust);
        ball([0,15,0],[25,15,6],crust,20);
        box([0,-4,6],[34,33,1.2],palette.cream());
        ball([0,13,6],[20,12,1],palette.cream(),20);
      }
    }else if(type==='donut'){
      add(new T.TorusGeometry(18,8,12,36),baked);
      add(new T.TorusGeometry(18,7.7,10,36,Math.PI*2),mat('#c57483','skin',.31),[0,0,4.7],[1,1,.52]);
      for(let i=0;i<35;i++){const a=r()*6.28,d=15+r()*6;box([Math.cos(a)*d,Math.sin(a)*d,8.8],[.7,3,.65],mat(['#e9c958','#e8e2ce','#708f7c','#844637'][i%4],'plain',.5),[0,0,r()*6]);}
    }else if(type==='pretzel'){
      tube([[-13,-20,0],[-26,-2,0],[-21,18,0],[-9,18,0],[13,-15,2],[25,0,0],[22,18,0],[10,18,0],[-13,-16,4],[13,-20,4]],5.5,crust,50);
      for(let i=0;i<24;i++){const a=r()*6.28;box([Math.cos(a)*19,Math.sin(a)*19,5],[1,1.5,1],white,[0,0,r()*3]);}
    }else if(type==='cookie'){
      cylinder([0,0,0],25,24,8,baked);
      speckle(25,21,5,mat('#493021','rough',.67));
      for(let i=0;i<11;i++){const a=r()*6.28,d=r()*19;box([Math.cos(a)*d,Math.sin(a)*d,5],[3+r()*2,3,2],mat('#513527','rough',.66),[0,0,r()*6]);}
    }else if(type==='waffle'||type==='chocolate'){
      const chocolate=type==='chocolate',m=chocolate?mat('#603826','skin',.4):baked;
      box([0,0,0],[39,48,6],m);
      for(let y=0;y<5;y++)for(let x=0;x<4;x++)box([(x-1.5)*9.4,(y-2)*9.4,4],[chocolate?8:6.3,chocolate?8:6.3,chocolate?4:1],chocolate?mat('#76462d','skin',.33):crust);
      if(!chocolate){
        for(let i=0;i<5;i++)box([(i-2)*9.4,0,6],[2,48,2],baked);
        for(let i=0;i<6;i++)box([0,(i-2.5)*9.4,6],[39,2,2],baked);
      }
    }else if(type==='cupcake'){
      cylinder([0,-7,0],20,14,26,mat('#b8896f','rough',.85),[0,0,0],24);
      ball([0,10,0],[23,12,19],baked,24);
      for(let i=0;i<6;i++){const rr=15-i*2.3;add(new T.TorusGeometry(Math.max(2,rr),4.5,8,22),mat('#f3dcc0','skin',.56),[0,14+i*3.5,0],[1,1,1],[Math.PI/2,0,0]);}
      ball([0,34,0],[4,4,4],mat('#b52025','skin',.25),12);
    }else if(type==='sandwich'){
      const shape=new T.Shape();shape.moveTo(-26,-22);shape.lineTo(26,-22);shape.lineTo(-26,27);shape.closePath();
      const layer=(z,depth,m)=>add(new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:1,bevelThickness:.6,bevelSegments:1}),m,[8,0,z]);
      layer(-10,4,palette.cream());layer(-4,2,mat('#498535','leaf',.75));layer(0,3,mat('#bb3422','skin',.48));layer(5,4,palette.cream());
      tube([[-19,-22,11],[33,-22,11],[-19,27,11],[-19,-22,11]],1.3,crust,10);
    }else if(type==='sushi'){
      cylinder([0,0,0],24,24,22,mat('#303b22','rough',.9),[Math.PI/2,0,0],28);
      cylinder([0,0,11.4],21,21,1.4,white);
      for(let i=0;i<55;i++){const a=r()*6.28,d=9+r()*12;ball([Math.cos(a)*d,Math.sin(a)*d,12.8],[1.1,1.9,.8],white,6);}
      box([-6,0,13],[10,15,2],mat('#e5793f','salmon',.49));box([6,0,13],[9,13,2],mat('#7d9e3a','leaf',.52));box([0,-9,13],[9,5,2],mat('#f1c365','skin',.6));
    }else if(type==='salmon'){
      add(new T.BoxGeometry(33,49,13,3,3,1),mat('#fff','salmon',.44),[0,0,0],[1,1,1],[.03,.08,-.15]);
      box([0,0,-7],[33,49,1],mat('#aab0a5','rough',.5,.35),[0,0,-.15]);
    }else if(type==='sausage'){
      tube([[-15,22,0],[-5,16,0],[4,3,0],[7,-12,0],[4,-25,0]],9,mat('#a84e2b','skin',.44),24);
      for(let i=0;i<3;i++)tube([[-3,i*10-7,7],[8,i*10-1,9]],1,mat('#783f27','rough'),8);
    }else if(type==='milk'||type==='juice'){
      const juice=type==='juice';
      box([0,-4,0],[29,41,23],mat(juice?'#d89936':'#f1eee0','plain',.6));
      const roof=new T.CylinderGeometry(0,20,13,4,1,false);
      add(roof,mat(juice?'#e3b14e':'#e4e0ce','plain',.58),[0,23,0],[1,1,.8],[0,Math.PI/4,0]);
      box([0,-3,12],[25,16,1],mat(juice?'#557a33':'#7297aa','plain',.54));
      cylinder([8,24,8],4,4,3,mat('#f2ede0','plain',.45),[Math.PI/2,0,0],12);
      if(juice)fruit('#eab53c',[7,7,1],[0,-3,13],.6);
      else {box([-4,-3,13],[2,9,.5],white);box([4,-3,13],[2,9,.5],white);box([0,-3,13],[8,2,.5],white);}
    }else if(type==='shrimp'){
      for(let i=0;i<9;i++){
        const a=.2+i*.37,s=1-i*.068;
        add(new T.SphereGeometry(1,14,10),mat(i%2?'#e2a183':'#cf7551','skin',.52),[Math.cos(a)*17,Math.sin(a)*20-4,0],[7*s,8*s,7*s],[0,0,a]);
      }
      ball([-16,-12,0],[10,6,1.7],mat('#c96844','rough',.65));
      tube([[17,3,1],[25,11,0],[28,28,0]],.5,mat('#ab6748','rough'),14);
    }else if(type==='scallop'||type==='mussel'){
      const scallop=type==='scallop';
      ball([0,0,0],scallop?[25,27,5]:[16,32,7],mat(scallop?'#c8ac85':'#354942','rough',.38,.1),26);
      ball([0,0,4],scallop?[22,24,2]:[13,29,3],mat(scallop?'#eee5cb':'#b5b6a0','skin',.5),24);
      if(scallop)for(let i=0;i<13;i++){const a=i/12*Math.PI; tube([[0,-19,5],[Math.cos(a)*18,Math.sin(a)*18-2,6],[Math.cos(a)*24,Math.sin(a)*24,5]],.65,mat('#b99d7f','rough'),12);}
      ball([0,-1,9],scallop?[12,13,6]:[8,16,6],mat(scallop?'#f0ddbd':'#d49b44','skin',.5),20);
    }else if(type==='riceball'){
      const shape=new T.Shape();shape.moveTo(-24,-22);shape.quadraticCurveTo(-29,-20,-24,-10);shape.lineTo(-5,25);shape.quadraticCurveTo(0,32,6,23);shape.lineTo(26,-11);shape.quadraticCurveTo(31,-22,22,-22);shape.closePath();
      add(new T.ExtrudeGeometry(shape,{depth:17,bevelEnabled:true,bevelSize:3,bevelThickness:3,bevelSegments:3}),white,[0,0,-8]);
      box([0,-10,12],[20,22,1],mat('#2c3524','rough',.92));
    }else throw new Error(`Unknown model: ${type}`);
    const spec=b.finish();cache.set(type,spec);return spec;
  }
  function object(type){
    const group=new T.Group();
    for(const p of model(type)){const mesh=new T.Mesh(p.geometry,p.material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
    return group;
  }
  root.GooseModels={model,object,texture,mat};
})(globalThis);
