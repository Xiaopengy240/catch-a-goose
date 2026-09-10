/* Instanced WebGL food rendering. The physics and match state stay in game.js. */
(function(root){
  'use strict';
  const T=THREE,M=GooseModels;
  function studio(renderer,scene){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#999d9a';ctx.fillRect(0,0,512,256);
    const gradient=ctx.createLinearGradient(0,0,0,256);gradient.addColorStop(0,'#e2e8ea');gradient.addColorStop(.5,'#adb1ac');gradient.addColorStop(1,'#737971');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,512,256);ctx.fillStyle='#fffaf0';ctx.fillRect(60,35,75,112);ctx.fillStyle='#e3efff';ctx.fillRect(315,25,100,125);
    const tex=new T.CanvasTexture(canvas);tex.mapping=T.EquirectangularReflectionMapping;tex.colorSpace=T.SRGBColorSpace;
    const pmrem=new T.PMREMGenerator(renderer);const target=pmrem.fromEquirectangular(tex);
    scene.environment=target.texture;scene.environmentIntensity=.6;tex.dispose();pmrem.dispose();
    scene.add(new T.HemisphereLight('#fff9ee','#777c65',1.3));
    const key=new T.DirectionalLight('#fff5e4',2.9);key.position.set(-160,240,450);scene.add(key);
    const fill=new T.DirectionalLight('#dcecff',.8);fill.position.set(230,-130,250);scene.add(fill);
    return {key,target};
  }
  class WebGLBoard{
    constructor(canvas,options={}){
      const context=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'low-power'});
      if(!context) throw new Error('WebGL2 unavailable');
      this.renderer=new T.WebGLRenderer({canvas,context,antialias:true,alpha:false,powerPreference:'low-power'});
      this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.08;
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;
      this.scene=new T.Scene();this.scene.background=new T.Color('#edece3');
      this.camera=new T.OrthographicCamera(-280,280,225,-225,1,1600);this.camera.position.set(0,0,900);
      this.camera.updateMatrixWorld(true);
      const {key}=studio(this.renderer,this.scene);
      key.castShadow=true;key.shadow.mapSize.set(1024,1024);
      Object.assign(key.shadow.camera,{left:-330,right:330,top:300,bottom:-300,near:100,far:1000});
      key.shadow.bias=-.0008;key.shadow.normalBias=.8;key.shadow.radius=2;
      this.batches=new Map();this.pickables=[];this.matrix=new T.Object3D();this.ray=new T.Raycaster();this.point=new T.Vector2();
      this.positions=new Map();this.lastTheme='';this.highlighted=null;
      const floor=new T.Mesh(new T.PlaneGeometry(620,510),new T.MeshStandardMaterial({color:'#f5eee0',map:M.texture('wood'),roughness:.88}));
      floor.position.z=-42;floor.receiveShadow=true;this.scene.add(floor);this.floor=floor;
      const plate=new T.Mesh(new T.LatheGeometry([
        [0,-8],[145,-8],[173,-5],[195,7],[213,18],[221,19],[225,16],[224,11],[208,0],[174,-15],[0,-18]
      ].reverse().map(p=>new T.Vector2(...p)),96),new T.MeshStandardMaterial({color:'#f8f8f1',roughness:.22,metalness:.025}));
      plate.rotation.x=Math.PI/2;plate.scale.z=.80;plate.position.set(0,5,-11);plate.castShadow=true;plate.receiveShadow=true;this.scene.add(plate);
      this.rims=[];
      for(const radius of [219,209]){
        const rim=new T.Mesh(new T.TorusGeometry(radius,radius===219?2.5:1,8,96),new T.MeshStandardMaterial({color:'#467954',roughness:.3}));
        rim.scale.y=.8;rim.position.set(0,5,radius===219?9:7);this.scene.add(rim);this.rims.push(rim);
      }
      const clothCanvas=document.createElement('canvas');clothCanvas.width=clothCanvas.height=128;
      const cc=clothCanvas.getContext('2d');cc.fillStyle='#e5eeeb';cc.fillRect(0,0,128,128);
      for(let y=0;y<8;y++)for(let x=0;x<8;x++){cc.fillStyle=(x+y)%2?'#acc8d2':'#e5eeeb';cc.fillRect(x*16,y*16,16,16);}
      const clothTex=new T.CanvasTexture(clothCanvas);clothTex.colorSpace=T.SRGBColorSpace;
      this.cloth=new T.Mesh(new T.PlaneGeometry(135,110),new T.MeshStandardMaterial({map:clothTex,roughness:.95}));
      this.cloth.position.set(-234,184,-39);this.cloth.rotation.z=.20;this.cloth.receiveShadow=true;this.scene.add(this.cloth);
      const fork=new T.Group(),silver=M.mat('#c7ced0','plain',.25,.85);
      const handle=new T.Mesh(new T.BoxGeometry(9,66,3),silver);handle.position.y=-19;fork.add(handle);
      const shoulder=new T.Mesh(new T.SphereGeometry(1,16,10),silver);shoulder.scale.set(12,13,2);shoulder.position.y=19;fork.add(shoulder);
      for(let i=0;i<4;i++){const prong=new T.Mesh(new T.BoxGeometry(2,26,2),silver);prong.position.set((i-1.5)*6.6,35,0);fork.add(prong);}
      fork.position.set(231,150,-25);fork.rotation.z=.60;fork.traverse(x=>{if(x.isMesh)x.castShadow=true;});this.scene.add(fork);
      const ringCanvas=document.createElement('canvas');ringCanvas.width=ringCanvas.height=64;
      const rc=ringCanvas.getContext('2d');rc.strokeStyle='#f6dd71';rc.lineWidth=5;rc.beginPath();rc.arc(32,32,27,0,Math.PI*2);rc.stroke();
      this.hintMaterial=new T.MeshBasicMaterial({map:new T.CanvasTexture(ringCanvas),transparent:true,depthTest:false,depthWrite:false});
      this.hints=new T.InstancedMesh(new T.PlaneGeometry(77,77),this.hintMaterial,108);this.hints.count=0;this.hints.renderOrder=20;this.hints.frustumCulled=false;this.scene.add(this.hints);
      this.mode='webgl';this.resize(canvas);
    }
    resize(canvas){
      const width=Math.max(280,Math.min(560,Math.round(canvas.getBoundingClientRect().width||560)));
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));this.renderer.setSize(width,Math.round(width*450/560),false);
      this.renderer.shadowMap.needsUpdate=true;
    }
    setTheme(theme){
      if(theme===this.lastTheme)return;
      this.lastTheme=theme;const spec=GooseCore.THEMES[theme];
      this.rims.forEach(r=>r.material.color.set(spec.color));
      this.floor.material.color.set({lightmeal:'#f5f1e5',coast:'#dee8e8',picnic:'#f3e7e1',bakery:'#efddc4'}[theme]||'#f5eee0');
      this.renderer.shadowMap.needsUpdate=true;
    }
    sync(bodies,theme){
      this.setTheme(theme);
      const byType=new Map();this.positions.clear();
      for(const b of bodies){const type=b.plugin.type;if(!byType.has(type))byType.set(type,[]);byType.get(type).push(b);}
      for(const [type,batch] of this.batches)if(!byType.has(type)){batch.meshes.forEach(m=>m.count=0);batch.ids=[];}
      this.pickables=[];
      for(const [type,items] of byType){
        let batch=this.batches.get(type);
        if(!batch){
          const meshes=M.model(type).map(spec=>{
            const mesh=new T.InstancedMesh(spec.geometry,spec.material,108);mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
            mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
            mesh.boundingSphere=new T.Sphere(new T.Vector3(0,0,30),450);
            mesh.userData.type=type;this.scene.add(mesh);return mesh;
          });
          batch={meshes,ids:[]};this.batches.set(type,batch);
        }
        batch.ids=items.map(b=>b.plugin.itemId);
        items.forEach((b,i)=>{
          const z=b.plugin.layer===5?108:13+b.plugin.layer*10+b.position.y*.002;
          this.matrix.position.set(b.position.x-280,225-b.position.y,z);
          this.matrix.rotation.set(.08+Math.sin(b.plugin.itemId*2.1)*.16,Math.cos(b.plugin.itemId*1.7)*.18,-b.angle);
          this.matrix.scale.setScalar(1.04);this.matrix.updateMatrix();
          batch.meshes.forEach(mesh=>mesh.setMatrixAt(i,this.matrix.matrix));
          this.positions.set(b.plugin.itemId,{x:b.position.x,y:b.position.y,type});
        });
        batch.meshes.forEach(mesh=>{mesh.count=items.length;mesh.instanceMatrix.needsUpdate=true;this.pickables.push(mesh);});
      }
      this.scene.updateMatrixWorld(true);this.renderer.shadowMap.needsUpdate=true;
    }
    mark(type,hovered){
      let i=0;
      for(const [id,p] of this.positions)if(p.type===type||id===hovered){
        this.matrix.position.set(p.x-280,225-p.y,120);this.matrix.rotation.set(0,0,0);this.matrix.scale.setScalar(1);this.matrix.updateMatrix();
        this.hints.setMatrixAt(i++,this.matrix.matrix);
      }
      this.hints.count=i;this.hints.instanceMatrix.needsUpdate=true;
    }
    pick(x,y){
      this.point.set(x/560*2-1,1-y/450*2);this.ray.setFromCamera(this.point,this.camera);
      const hits=this.ray.intersectObjects(this.pickables,false);
      if(!hits.length)return null;
      const hit=hits[0];return this.batches.get(hit.object.userData.type)?.ids[hit.instanceId]??null;
    }
    render(){this.renderer.render(this.scene,this.camera);}
    metrics(){return {mode:this.mode,drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles};}
  }
  class LightBoard{
    constructor(canvas,images){
      this.canvas=canvas;this.ctx=canvas.getContext('2d');this.images=images;this.items=[];this.mode='light';this.bg=document.createElement('canvas');this.bg.width=560;this.bg.height=450;this.lastTheme='';
      this.resize(canvas);
    }
    resize(canvas){const scale=Math.min(window.devicePixelRatio||1,1.5);canvas.width=560*scale;canvas.height=450*scale;this.scale=scale;}
    setTheme(theme){
      if(this.lastTheme===theme)return;this.lastTheme=theme;
      const c=this.bg.getContext('2d');c.fillStyle='#e3d2b7';c.fillRect(0,0,560,450);
      c.globalAlpha=.55;c.drawImage(M.texture('wood').image,0,0,560,450);c.globalAlpha=1;
      c.fillStyle='#0002';c.beginPath();c.ellipse(284,234,223,179,0,0,7);c.fill();
      c.fillStyle='#fafaf4';c.beginPath();c.ellipse(280,220,224,178,0,0,7);c.fill();
      c.strokeStyle=GooseCore.THEMES[theme].color;c.lineWidth=3;
      for(const r of [216,206]){c.beginPath();c.ellipse(280,220,r,r*.8,0,0,7);c.stroke();}
    }
    sync(bodies,theme){this.items=[...bodies].sort((a,b)=>a.plugin.layer-b.plugin.layer||a.position.y-b.position.y);this.setTheme(theme);}
    mark(type,hovered){this.highlighted=type;this.hovered=hovered;}
    pick(x,y){for(let i=this.items.length-1;i>=0;i--){const b=this.items[i];if(Math.hypot(x-b.position.x,y-b.position.y)<31)return b.plugin.itemId;}return null;}
    render(){
      const c=this.ctx;c.setTransform(this.scale,0,0,this.scale,0,0);c.drawImage(this.bg,0,0);
      for(const b of this.items){
        c.save();c.translate(b.position.x,b.position.y);c.rotate(b.angle);
        const img=this.images[b.plugin.type];
        if(img?.complete&&img.naturalWidth)c.drawImage(img,-40,-40,80,80);
        if(b.plugin.type===this.highlighted||b.plugin.itemId===this.hovered){c.strokeStyle='#e6ca55';c.lineWidth=2;c.beginPath();c.arc(0,0,35,0,7);c.stroke();}
        c.restore();
      }
    }
    metrics(){return {mode:'light',drawCalls:1,triangles:0};}
  }
  function create(canvas,images,light=false){
    if(!light){
      try{return new WebGLBoard(canvas);}
      catch(error){
        const fresh=canvas.cloneNode();canvas.replaceWith(fresh);canvas=fresh;
      }
    }
    const board=new LightBoard(canvas,images);board.canvas=canvas;return board;
  }
  let previewRenderer,previewScene,previewCamera,previewObject;
  function preview(type,size=180){
    if(!previewRenderer){
      previewRenderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});
      previewRenderer.setSize(size,size);previewRenderer.outputColorSpace=T.SRGBColorSpace;
      previewRenderer.toneMapping=T.ACESFilmicToneMapping;previewRenderer.toneMappingExposure=1.08;
      previewScene=new T.Scene();studio(previewRenderer,previewScene);
      previewCamera=new T.OrthographicCamera(-44,44,44,-44,1,500);previewCamera.position.set(0,0,200);
    }
    if(previewObject)previewScene.remove(previewObject);
    previewObject=M.object(type);previewObject.rotation.set(-.18,.22,-.12);previewScene.add(previewObject);
    previewRenderer.render(previewScene,previewCamera);
    return previewRenderer.domElement.toDataURL('image/png');
  }
  root.GooseRenderer={create,preview};
})(globalThis);
