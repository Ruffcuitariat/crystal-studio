/* Crystal Studio. CIF coordinate/symmetry expansion: 3Dmol.js; rendering: Three.js. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  lucide.createIcons();
  const T = THREE;
  const v = (x=0,y=0,z=0) => new T.Vector3(x,y,z);
  const state = { model:null, blocks:[], styles:{}, atoms:[], bonds:[], repeat:[2,2,1], mode:'ball', radius:10, center:v(), dirty:true, atomMeshes:[], lastPointer:null };
  let noticeTimer;
  function notice(message,error=false) {
    $('notice').textContent=message; $('notice').className=error?'error':''; $('notice').hidden=false;
    clearTimeout(noticeTimer); noticeTimer=setTimeout(()=> $('notice').hidden=true,error?8000:3500);
  }
  function warning(messages) {
    $('warnings').replaceChildren(); $('warnings').hidden=!messages.length;
    if(!messages.length)return;
    const close=document.createElement('button');close.textContent='×';close.title='关闭提示';close.onclick=()=> $('warnings').hidden=true;
    $('warnings').append(close,document.createTextNode(messages.join(' ')));
  }
  let renderer;
  try { renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true}); }
  catch(e){notice('无法初始化 3D 视图。请使用启用硬件加速的 Chrome 或 Edge。',true);return;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0,0);
  renderer.outputEncoding=T.sRGBEncoding;
  $('canvasHost').append(renderer.domElement);
  const scene=new T.Scene(), root=new T.Group();scene.add(root);
  scene.add(new T.HemisphereLight(0xffffff,0x677b70,0.78));
  const key=new T.DirectionalLight(0xffffff,0.8);key.position.set(-10,20,25);scene.add(key);
  const fill=new T.DirectionalLight(0xffffff,0.35);fill.position.set(18,3,-15);scene.add(fill);
  let camera=new T.OrthographicCamera(-10,10,10,-10,0.01,10000);
  camera.position.set(16,12,20);camera.up.set(0,0,1);
  let controls;
  function attachControls(){
    if(controls)controls.dispose();
    controls=new T.OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;
    controls.rotateSpeed=.65;controls.zoomSpeed=.85;controls.minDistance=.25;controls.maxDistance=2000;
    controls.minZoom=.03;controls.maxZoom=30;controls.autoRotateSpeed=1.2;
    controls.addEventListener('change',()=>state.dirty=true);
    controls.autoRotate=$('spin').getAttribute('aria-pressed')==='true';
  }
  attachControls();
  let viewHeight=20;
  function resize(){
    const w=$('stage').clientWidth,h=$('stage').clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);const a=w/h;
    if(camera.isOrthographicCamera){camera.left=-viewHeight*a/2;camera.right=viewHeight*a/2;camera.top=viewHeight/2;camera.bottom=-viewHeight/2;}
    else camera.aspect=a;
    camera.updateProjectionMatrix();state.dirty=true;
  }
  new ResizeObserver(resize).observe($('stage'));
  function fit(reset=false,axis='iso'){
    const a=Math.max(.2,$('stage').clientWidth/$('stage').clientHeight);
    const r=state.radius;
    viewHeight=2*r*1.18/Math.min(a,1);camera.zoom=1;
    const dir=reset?direction(axis):camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(state.center);
    const distance=r*1.2/(Math.sin(T.MathUtils.degToRad(35/2))*Math.min(a,1));
    camera.position.copy(state.center).addScaledVector(dir,distance);
    camera.near=.01;camera.far=Math.max(10000,distance+r*10);resize();controls.update();state.dirty=true;
  }
  function direction(axis){
    const basis=state.model?.basis;
    if(basis&&['a','b','c'].includes(axis))return basis['abc'.indexOf(axis)].clone().normalize();
    return v(1.25,-1.65,1.05).normalize();
  }
  function setAxis(axis){
    const d=direction(axis),dist=camera.position.distanceTo(controls.target);
    camera.up.copy(axis==='c'?(state.model?.basis[1]||v(0,1,0)):v(0,0,1));
    camera.position.copy(controls.target).addScaledVector(d,dist);controls.update();state.dirty=true;
    document.querySelectorAll('[data-axis]').forEach(b=>b.classList.toggle('active',b.dataset.axis===axis));
  }
  const gizmo=document.createElement('canvas');gizmo.width=160;gizmo.height=160;$('axisGizmo').append(gizmo);
  function drawGizmo(){
    const ctx=gizmo.getContext('2d');ctx.clearRect(0,0,160,160);
    const axes=state.model?.basis||[v(1),v(0,1),v(0,0,1)];
    const q=camera.quaternion.clone().invert();
    const entries=axes.map((axis,i)=>({p:axis.clone().normalize().applyQuaternion(q),i})).sort((a,b)=>a.p.z-b.p.z);
    for(const {p,i} of entries){const x=76+p.x*45,y=82-p.y*45;ctx.strokeStyle=['#d46b61','#479b7a','#6488bb'][i];ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(76,82);ctx.lineTo(x,y);ctx.stroke();ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.font='20px Segoe UI';ctx.fillText('abc'[i],x+6,y-5);}
    ctx.fillStyle='#7b8c81';ctx.beginPath();ctx.arc(76,82,3,0,Math.PI*2);ctx.fill();
  }
  function animate(){requestAnimationFrame(animate);controls.update();if(state.dirty){renderer.render(scene,camera);drawGizmo();state.dirty=false;}}
  animate();

  // Tokenize CIF values before passing a canonical coordinate block to 3Dmol.
  // Quoted strings, comments and semicolon text fields must remain distinct.
  function tokenize(text){
    const out=[];let i=0,lineStart=true;
    while(i<text.length){
      const c=text[i];
      if(/\s/.test(c)){if(c==='\n'||c==='\r')lineStart=true;i++;continue;}
      if(c==='#'){while(i<text.length&&text[i]!=='\n')i++;continue;}
      if(c===';'&&lineStart){
        i++;const start=i;let end=-1;
        while(i<text.length){if(text[i]===';'&&(text[i-1]==='\n'||text[i-1]==='\r')){end=i;break;}i++;}
        if(end<0)throw Error('CIF 多行文本未闭合。');
        out.push({value:text.slice(start,end).trim(),quoted:true});i++;lineStart=false;continue;
      }
      lineStart=false;
      if(c==='\''||c==='"'){
        const quote=c,start=++i;
        while(i<text.length&&!(text[i]===quote&&(i+1===text.length||/\s/.test(text[i+1]))))i++;
        if(i===text.length)throw Error('CIF 引号未闭合。');
        out.push({value:text.slice(start,i),quoted:true});i++;continue;
      }
      const start=i;while(i<text.length&&!/\s/.test(text[i]))i++;
      out.push({value:text.slice(start,i),quoted:false});
    }
    return out;
  }
  const tag=s=>s.toLowerCase().replaceAll('.','_');
  const reserved=t=>!t.quoted&&(/^(data_|save_|loop_$|stop_$|global_$)/i.test(t.value)||t.value.startsWith('_'));
  function parseBlocks(text){
    const tokens=tokenize(text.replace(/^\uFEFF/,'')),blocks=[];let current=null,i=0;
    while(i<tokens.length){
      const t=tokens[i++];
      if(!t.quoted&&/^data_/i.test(t.value)){current={name:t.value.slice(5),fields:new Map()};blocks.push(current);continue;}
      if(!current)continue;
      if(!t.quoted&&t.value.toLowerCase()==='loop_'){
        const headers=[];while(i<tokens.length&&!tokens[i].quoted&&tokens[i].value.startsWith('_'))headers.push(tag(tokens[i++].value));
        if(!headers.length)throw Error('CIF loop_ 缺少字段。');
        const values=[];while(i<tokens.length&&!reserved(tokens[i]))values.push(tokens[i++].value);
        if(values.length%headers.length)throw Error('CIF 表格的列数与数据不匹配。');
        headers.forEach((h,j)=>current.fields.set(h,values.filter((_,k)=>k%headers.length===j)));
      }else if(!t.quoted&&t.value.startsWith('_')){
        if(i>=tokens.length||reserved(tokens[i]))throw Error('CIF 字段缺少值：'+t.value);
        current.fields.set(tag(t.value),[tokens[i++].value]);
      }
    }
    const atomBlocks=blocks.filter(b=>b.fields.has('_atom_site_fract_x')||b.fields.has('_atom_site_cartn_x'));
    if(!atomBlocks.length)throw Error('未找到原子坐标。请选择包含 atom_site 坐标的 CIF 文件。');
    return atomBlocks;
  }
  function number(s){return Number(String(s).replace(/\(\d+\)/,''));}
  function basisFromCell(cell){
    const [a,b,c,al,be,ga]=cell,[alpha,beta,gamma]=[al,be,ga].map(T.MathUtils.degToRad);
    if(![a,b,c].every(n=>Number.isFinite(n)&&n>0)||![al,be,ga].every(n=>Number.isFinite(n)&&n>0&&n<180))throw Error('晶胞长度或夹角无效。');
    const cx=c*Math.cos(beta),cy=c*(Math.cos(alpha)-Math.cos(beta)*Math.cos(gamma))/Math.sin(gamma),cz2=c*c-cx*cx-cy*cy;
    if(cz2<1e-10)throw Error('晶胞参数不能构成有效的三维晶胞。');
    return [v(a,0,0),v(b*Math.cos(gamma),b*Math.sin(gamma),0),v(cx,cy,Math.sqrt(cz2))];
  }
  function toCartesian(f,basis){return basis[0].clone().multiplyScalar(f.x).addScaledVector(basis[1],f.y).addScaledVector(basis[2],f.z);}
  function modelFromBlock(block){
    const f=block.fields,get=k=>f.get(k)?.[0];
    const fractional=f.has('_atom_site_fract_x');
    const cell=f.has('_cell_length_a')?['a','b','c'].map(x=>number(get('_cell_length_'+x))).concat(['alpha','beta','gamma'].map(x=>number(get('_cell_angle_'+x)||'90'))):null;
    const basis=cell?basisFromCell(cell):null;
    if(fractional&&!basis)throw Error('分数坐标需要完整的晶胞参数。');
    const prefix=fractional?'_atom_site_fract_':'_atom_site_cartn_';
    const xyz=['x','y','z'].map(x=>f.get(prefix+x));
    if(xyz.some(col=>!col)||xyz.some(col=>col.length!==xyz[0].length))throw Error('原子坐标列不完整。');
    const n=xyz[0].length;if(n>12000)throw Error('原子数超过 12,000，请先使用较小的结构文件。');
    const labels=f.get('_atom_site_label')||f.get('_atom_site_label_atom_id')||[];
    const symbols=f.get('_atom_site_type_symbol');const occupancy=f.get('_atom_site_occupancy');
    let partial=false;const rows=[];
    for(let i=0;i<n;i++){
      const occ=occupancy?number(occupancy[i]):1;if(occ===0)continue;if(occ>0&&occ<1)partial=true;
      const source=(symbols?.[i]||labels[i]||'').match(/^[A-Za-z]{1,2}/)?.[0];
      if(!source)throw Error('无法识别第 '+(i+1)+' 行的元素。');
      const elem=source[0].toUpperCase()+source.slice(1).toLowerCase();
      if(!Object.prototype.hasOwnProperty.call($3Dmol.elementColors.Jmol,elem)&&!Object.prototype.hasOwnProperty.call($3Dmol.GLModel.vdwRadii,elem))throw Error('无法识别元素：'+elem);
      const coords=xyz.map(col=>number(col[i]));if(!coords.every(Number.isFinite))throw Error('第 '+(i+1)+' 行包含无效坐标。');
      rows.push([elem,...coords]);
    }
    if(!rows.length)throw Error('文件中没有有效原子。');
    let operations=f.get('_space_group_symop_operation_xyz')||f.get('_symmetry_equiv_pos_as_xyz')||[];
    if(operations.length>384||rows.length*Math.max(1,operations.length)>120000)throw Error('对称展开的规模过大，请使用已展开的 P1 晶胞。');
    if(operations.length&&!basis)operations=[];
    let canonical='data_structure\n';
    if(cell){['length_a','length_b','length_c','angle_alpha','angle_beta','angle_gamma'].forEach((name,i)=>canonical+='_cell_'+name+' '+cell[i]+'\n');}
    if(operations.length)canonical+='loop_\n_symmetry_equiv_pos_as_xyz\n'+operations.map(op=>"'"+op.replaceAll(' ','').toLowerCase()+"'").join('\n')+'\n';
    canonical+='loop_\n_atom_site_label\n_atom_site_type_symbol\n'+['x','y','z'].map(x=>prefix+x).join('\n')+'\n';
    canonical+=rows.map((row,i)=>row[0]+(i+1)+' '+row.join(' ')).join('\n')+'\n';
    const parsed=$3Dmol.Parsers.cif(canonical,{doAssembly:true,duplicateAssemblyAtoms:true,wrapAtoms:true,assignBonds:false});
    if(!parsed[0]?.length)throw Error('CIF 解析未生成原子。');
    const inv=basis?new T.Matrix4().makeBasis(...basis).invert():null;
    const atoms=[],seen=new Set();
    for(const atom of parsed[0]){
      let p=v(atom.x,atom.y,atom.z);if(![p.x,p.y,p.z].every(Number.isFinite))throw Error('对称操作产生了无效坐标。');
      let frac=null;
      if(basis){frac=p.clone().applyMatrix4(inv);['x','y','z'].forEach(k=>{frac[k]=((frac[k]%1)+1)%1;if(frac[k]<1e-5||frac[k]>1-1e-5)frac[k]=0;});p=toCartesian(frac,basis);}
      const key=atom.elem+':'+(frac||p).toArray().map(x=>Math.round(x*1e5)).join(',');
      if(seen.has(key))continue;seen.add(key);atoms.push({elem:atom.elem,p,frac});
    }
    if(atoms.length>12000)throw Error('展开后的原子数超过 12,000。');
    const spacegroup=get('_space_group_name_h-m_alt')||get('_symmetry_space_group_name_h-m')||(basis?'P1':'分子结构');
    const messages=[];
    if(!operations.length&&basis&&!/^P\s*1$/i.test(spacegroup))messages.push('文件未列出对称操作，当前仅显示所提供的原子坐标；请导出带完整对称操作或完整晶胞的 CIF。');
    if(partial)messages.push('结构含部分占位，球体显示占位点，不表示完全占据。');
    const otherRows=new Map();let overlap=false;
    for(const a of atoms){const k=a.p.toArray().map(x=>Math.round(x*1e4)).join(',');if(otherRows.has(k)&&otherRows.get(k)!==a.elem)overlap=true;otherRows.set(k,a.elem);}
    if(overlap)messages.push('结构含重叠的不同元素占位，显示时可能相互遮挡。');
    return {atoms,cell,basis,spacegroup,messages,name:block.name};
  }
  const covalent={H:.31,He:.28,Li:1.28,Be:.96,B:.84,C:.76,N:.71,O:.66,F:.57,Ne:.58,Na:1.66,Mg:1.41,Al:1.21,Si:1.11,P:1.07,S:1.05,Cl:1.02,Ar:1.06,K:2.03,Ca:1.76,Sc:1.7,Ti:1.6,V:1.53,Cr:1.39,Mn:1.39,Fe:1.32,Co:1.26,Ni:1.24,Cu:1.32,Zn:1.22,Ga:1.22,Ge:1.2,As:1.19,Se:1.2,Br:1.2,Kr:1.16,Rb:2.2,Sr:1.95,Y:1.9,Zr:1.75,Nb:1.64,Mo:1.54,Tc:1.47,Ru:1.46,Rh:1.42,Pd:1.39,Ag:1.45,Cd:1.44,In:1.42,Sn:1.39,Sb:1.39,Te:1.38,I:1.39,Xe:1.4,Cs:2.44,Ba:2.15,La:2.07,Ce:2.04,Pr:2.03,Nd:2.01,Pm:1.99,Sm:1.98,Eu:1.98,Gd:1.96,Tb:1.94,Dy:1.92,Ho:1.92,Er:1.89,Tm:1.9,Yb:1.87,Lu:1.87,Hf:1.75,Ta:1.7,W:1.62,Re:1.51,Os:1.44,Ir:1.41,Pt:1.36,Au:1.36,Hg:1.32,Tl:1.45,Pb:1.46,Bi:1.48,Po:1.4,At:1.5,Rn:1.5,Fr:2.6,Ra:2.21,Ac:2.15,Th:2.06,Pa:2,U:1.96,Np:1.9,Pu:1.87};
  const defaults={Bi:'#9e69bb',O:'#e25b54',Cl:'#63ac70',C:'#555f65',H:'#e7e9eb',N:'#5684d6'};
  function defaultStyle(elem){const color=defaults[elem]||'#'+Number($3Dmol.elementColors.Jmol[elem]??0xa4b0ba).toString(16).padStart(6,'0');return {color,radius:elem==='Bi'?.57:elem==='O'?.36:elem==='Cl'?.46:Math.max(.25,Math.min(.65,(covalent[elem]||1.2)*.4)),visible:true};}
  function loadModel(model,name){
    const old={model:state.model,atoms:state.atoms,bonds:state.bonds,styles:state.styles};state.model=model;
    try {
      generateAtoms();state.styles={};for(const a of model.atoms)state.styles[a.elem]??=defaultStyle(a.elem);findBonds();
    } catch(e){Object.assign(state,old);$('cellBadge').textContent=old.model?.cell?state.repeat.join(' × '):'分子';throw e;}
    $('fileName').textContent=name;$('spacegroup').textContent=model.spacegroup;$('atomSummary').textContent=model.atoms.length+' 原子 / '+(model.cell?'晶胞':'分子');
    const counts={};for(const a of model.atoms)counts[a.elem]=(counts[a.elem]||0)+1;
    const gcd=(a,b)=>b?gcd(b,a%b):a,divisor=Object.values(counts).reduce(gcd);
    $('formula').replaceChildren();for(const [el,n] of Object.entries(counts)){$('formula').append(document.createTextNode(el));if(n/divisor>1){const sub=document.createElement('sub');sub.textContent=n/divisor;$('formula').append(sub);}}
    $('latticeValues').replaceChildren();
    ['a','b','c','α','β','γ'].forEach((label,i)=>{const node=document.createElement('div');node.className='lattice-item';const title=document.createElement('span');title.textContent=label;const value=document.createElement('strong');value.textContent=model.cell?model.cell[i].toFixed(i<3?4:2)+(i<3?' Å':'°'):'—';node.append(title,value);$('latticeValues').append(node);});
    for(const id of ['repeatA','repeatB','repeatC','applyCell','showCell','boundaryAtoms'])$(id).disabled=!model.cell;
    renderElements();rebuild();camera.up.set(0,0,1);fit(true);setAxis('iso');warning(model.messages);
  }
  function renderElements(){
    $('elements').replaceChildren();$('legend').replaceChildren();
    const count={};state.model.atoms.forEach(a=>count[a.elem]=(count[a.elem]||0)+1);
    $('elementCount').textContent=Object.keys(state.styles).length;
    for(const [elem,s]of Object.entries(state.styles)){
      const row=document.createElement('div');row.className='element-row';
      const name=document.createElement('label');name.className='element-name';
      const color=document.createElement('input');color.type='color';color.value=s.color;color.title=elem+' 颜色';color.setAttribute('aria-label',color.title);
      const el=document.createElement('span');el.textContent=elem;const ct=document.createElement('small');ct.textContent=count[elem];
      color.addEventListener('input',()=>{s.color=color.value;rebuild();updateLegend();});name.append(color,el,ct);
      const radius=document.createElement('input');radius.type='number';radius.min='.05';radius.max='4';radius.step='.05';radius.value=s.radius;radius.title=elem+' 原子半径（Å）';radius.setAttribute('aria-label',radius.title);
      radius.addEventListener('change',()=>{const n=Number(radius.value);if(!Number.isFinite(n)||n<.05||n>4){radius.value=s.radius;notice('原子半径范围为 0.05–4 Å。',true);return;}s.radius=n;rebuild();});
      const visible=document.createElement('input');visible.type='checkbox';visible.checked=s.visible;visible.title='显示 '+elem;visible.setAttribute('aria-label',visible.title);visible.onchange=()=>{s.visible=visible.checked;rebuild();updateLegend();};
      row.append(name,radius,visible);$('elements').append(row);
    }
    updateLegend();
  }
  function updateLegend(){
    $('legend').replaceChildren();for(const [elem,s]of Object.entries(state.styles)){if(!s.visible)continue;const node=document.createElement('div');node.className='legend-item';const dot=document.createElement('span');dot.className='legend-swatch';dot.style.background=s.color;node.append(dot,document.createTextNode(elem));$('legend').append(node);}
  }
  function generateAtoms(){
    const model=state.model,atoms=[];const repeat=model.basis?state.repeat:[1,1,1];
    const boundary=$('boundaryAtoms').checked;const seen=new Set();
    for(const a of model.atoms){
      if(!model.basis){atoms.push({...a,p:a.p.clone()});continue;}
      const limits=repeat.map((n,i)=>n+(boundary&&Math.abs(a.frac.getComponent(i))<1e-5?1:0));
      for(let x=0;x<limits[0];x++)for(let y=0;y<limits[1];y++)for(let z=0;z<limits[2];z++){
        const frac=a.frac.clone().add(v(x,y,z)),p=toCartesian(frac,model.basis),key=a.elem+':'+frac.toArray().map(c=>Math.round(c*1e5)).join(',');
        if(!seen.has(key)){seen.add(key);atoms.push({elem:a.elem,p,frac});}
        if(atoms.length>12000)throw Error('超晶胞超过 12,000 个原子，请减小 a、b、c 倍数。');
      }
    }
    state.atoms=atoms;$('cellBadge').textContent=model.cell?repeat.join(' × '):'分子';
  }
  // Spatial hashing bounds the bond search to nearby atoms, including replicated cells.
  function findBonds(){
    const atoms=state.atoms,bonds=[],cutoff=$('bondMethod').value==='cutoff',threshold=Number($('bondThreshold').value);
    const radius=a=>covalent[a.elem]||1.6;
    const maxRadius=Math.max(...Object.keys(state.styles).map(el=>covalent[el]||1.6));
    const binSize=cutoff?threshold:2*maxRadius*threshold;const bins=new Map();
    for(let i=0;i<atoms.length;i++){
      const a=atoms[i],cell=a.p.toArray().map(c=>Math.floor(c/binSize));
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
        const neighbors=bins.get([cell[0]+dx,cell[1]+dy,cell[2]+dz].join(','))||[];
        for(const j of neighbors){const b=atoms[j],distSq=a.p.distanceToSquared(b.p),limit=cutoff?threshold:(radius(a)+radius(b))*threshold;
          if(distSq>.04&&distSq<=limit*limit){bonds.push([j,i]);if(bonds.length>100000)throw Error('成键数量过多，请降低成键阈值或减小超晶胞。');}
        }
      }
      const k=cell.join(',');if(!bins.has(k))bins.set(k,[]);bins.get(k).push(i);
    }
    state.bonds=bonds;
  }
  const sphere=new T.SphereGeometry(1,28,20),cylinder=new T.CylinderGeometry(1,1,1,12,1);
  const dummy=new T.Object3D(),up=v(0,1,0);
  let materials=[];
  function atomRadius(elem){
    const s=state.styles[elem],scale=Number($('atomScale').value),relative=s.radius/defaultStyle(elem).radius;
    if(state.mode==='space')return ($3Dmol.GLModel.vdwRadii[elem]||1.8)*relative*scale;
    if(state.mode==='stick')return Number($('bondRadius').value)*relative*scale;
    return s.radius*scale;
  }
  function material(color){const m=new T.MeshPhongMaterial({color,shininess:55,specular:0x4a4a4a});materials.push(m);return m;}
  function instanceSpheres(atoms,elem,radius,color){
    if(!atoms.length)return;const mesh=new T.InstancedMesh(sphere,material(color),atoms.length);
    atoms.forEach((a,i)=>{dummy.position.copy(a.p);dummy.quaternion.identity();dummy.scale.setScalar(radius);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    mesh.userData.atoms=atoms;mesh.userData.elem=elem;mesh.instanceMatrix.needsUpdate=true;root.add(mesh);state.atomMeshes.push(mesh);
  }
  function instanceCylinders(segments,radius,color){
    if(!segments.length)return;const mesh=new T.InstancedMesh(cylinder,material(color),segments.length);
    segments.forEach(([a,b],i)=>{const delta=b.clone().sub(a);dummy.position.copy(a).add(b).multiplyScalar(.5);dummy.quaternion.setFromUnitVectors(up,delta.clone().normalize());dummy.scale.set(radius,delta.length(),radius);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    mesh.instanceMatrix.needsUpdate=true;root.add(mesh);
  }
  function rebuild(){
    for(const m of root.children){if(m.isInstancedMesh)m.dispose?.();}root.clear();materials.forEach(m=>m.dispose());materials=[];state.atomMeshes=[];
    const space=state.mode==='space';
    const br=Number($('bondRadius').value);
    for(const [elem,s]of Object.entries(state.styles)){
      if(!s.visible)continue;
      instanceSpheres(state.atoms.filter(a=>a.elem===elem),elem,atomRadius(elem),s.color);
    }
    let drawnBonds=0;
    if($('showBonds').checked&&!space){
      const segments=new Map(),uniform=$('bondColorMode').value==='uniform';
      function add(color,a,b){if(!segments.has(color))segments.set(color,[]);segments.get(color).push([a,b]);}
      for(const [i,j]of state.bonds){const a=state.atoms[i],b=state.atoms[j],sa=state.styles[a.elem],sb=state.styles[b.elem];if(!sa.visible||!sb.visible)continue;drawnBonds++;
        if(uniform)add($('bondColor').value,a.p,b.p);
        else {const mid=a.p.clone().add(b.p).multiplyScalar(.5);add(sa.color,a.p,mid);add(sb.color,mid,b.p);}
      }
      for(const [color,lines]of segments)instanceCylinders(lines,br,color);
    }
    const bounds=new T.Box3();state.atoms.forEach(a=>bounds.expandByPoint(a.p));
    if(state.model.basis&&$('showCell').checked){
      const edges=[],b=state.model.basis.map((axis,i)=>axis.clone().multiplyScalar(state.repeat[i]));
      for(let i=0;i<8;i++)for(let axis=0;axis<3;axis++)if(!(i&(1<<axis))){
        const corner=(bits)=>b.reduce((p,vec,k)=>p.addScaledVector(vec,(bits>>k)&1),v());
        const p=corner(i),q=corner(i|(1<<axis));edges.push([p,q]);bounds.expandByPoint(p);bounds.expandByPoint(q);
      }
      instanceCylinders(edges,.012,$('background').value==='dark'?'#93a99a':'#a2b4a8');
    }
    bounds.getCenter(state.center);state.radius=Math.max(1,bounds.getSize(v()).length()/2+Math.max(...Object.keys(state.styles).map(atomRadius)));
    const visible=state.atoms.filter(a=>state.styles[a.elem].visible).length;
    $('renderStats').textContent=visible.toLocaleString()+' 个原子 · '+drawnBonds.toLocaleString()+' 条键';state.dirty=true;
  }
  async function importFile(file){
    if(!file)return;if(file.size>20*1024*1024){notice('文件超过 20 MB，请选择较小的 CIF。',true);return;}
    $('import').disabled=true;
    try{
      const blocks=parseBlocks(await file.text()),model=modelFromBlock(blocks[0]);loadModel(model,file.name);state.blocks=blocks;state.fileName=file.name;
      $('dataBlock').replaceChildren();blocks.forEach((b,i)=>{const opt=document.createElement('option');opt.value=i;opt.textContent=b.name||'数据块 '+(i+1);$('dataBlock').append(opt);});$('blockRow').hidden=blocks.length<2;
      notice('已导入 '+file.name);
    }catch(e){console.error(e);notice('导入失败：'+e.message,true);}finally{$('import').disabled=false;}
  }
  $('import').onclick=()=>$('file').click();$('file').onchange=e=>{importFile(e.target.files[0]);e.target.value='';};
  $('dataBlock').onchange=()=>{try{loadModel(modelFromBlock(state.blocks[Number($('dataBlock').value)]),state.fileName);}catch(e){notice(e.message,true);}};
  let dragDepth=0;
  document.addEventListener('dragenter',e=>{if(!e.dataTransfer?.types.includes('Files'))return;e.preventDefault();dragDepth++;$('stage').classList.add('dragging');});
  document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
  document.addEventListener('dragleave',()=>{if(--dragDepth<=0){dragDepth=0;$('stage').classList.remove('dragging');}});
  document.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('stage').classList.remove('dragging');importFile(e.dataTransfer.files[0]);});
  function safeRebond(){const old=state.bonds;try{findBonds();rebuild();}catch(e){state.bonds=old;notice(e.message,true);}}
  function applyCell(){
    const repeats=['repeatA','repeatB','repeatC'].map(id=>Number($(id).value));
    if(!repeats.every(n=>Number.isInteger(n)&&n>=1&&n<=8)){notice('超晶胞倍数须为 1–8 的整数。',true);return;}
    const oldRepeat=state.repeat,oldAtoms=state.atoms,oldBonds=state.bonds;
    try{state.repeat=repeats;generateAtoms();findBonds();rebuild();fit();}
    catch(e){state.repeat=oldRepeat;state.atoms=oldAtoms;state.bonds=oldBonds;$('cellBadge').textContent=oldRepeat.join(' × ');notice(e.message,true);}
  }
  $('applyCell').onclick=applyCell;
  for(const id of ['repeatA','repeatB','repeatC'])$(id).onkeydown=e=>{if(e.key==='Enter')applyCell();};
  $('boundaryAtoms').onchange=()=>{try{generateAtoms();findBonds();rebuild();}catch(e){$('boundaryAtoms').checked=!$('boundaryAtoms').checked;generateAtoms();safeRebond();notice(e.message,true);}};
  for(const id of ['atomScale','bondRadius','bondColor'])$(id).addEventListener('input',()=>{updateOutputs();rebuild();});
  function updateOutputs(){$('atomScaleOut').textContent=Number($('atomScale').value).toFixed(2)+'×';$('bondRadiusOut').textContent=Number($('bondRadius').value).toFixed(2)+' Å';$('bondThresholdOut').textContent=Number($('bondThreshold').value).toFixed(2)+($('bondMethod').value==='cutoff'?' Å':'×');}
  for(const id of ['showCell','showBonds'])$(id).onchange=rebuild;
  $('bondColorMode').onchange=()=>{$('bondColor').disabled=$('bondColorMode').value!=='uniform';rebuild();};
  $('bondThreshold').addEventListener('input',updateOutputs);$('bondThreshold').onchange=safeRebond;
  $('bondMethod').onchange=()=>{const cut=$('bondMethod').value==='cutoff',input=$('bondThreshold');input.min=cut?'.5':'.8';input.max=cut?'6':'1.8';input.step=cut?'.05':'.02';input.value=cut?'3.2':'1.3';$('thresholdLabel').textContent=cut?'最大键长':'半径系数';updateOutputs();safeRebond();};
  $('background').onchange=()=>{$('stage').classList.remove('checker','white','dark');$('stage').classList.add($('background').value);rebuild();};
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;document.querySelectorAll('[data-mode]').forEach(n=>n.classList.toggle('active',n===b));rebuild();});
  document.querySelectorAll('[data-axis]').forEach(b=>b.onclick=()=>setAxis(b.dataset.axis));
  $('fit').onclick=()=>fit();$('resetView').onclick=()=>{fit(true);setAxis('iso');};
  $('zoomIn').onclick=()=>zoom(1.2);$('zoomOut').onclick=()=>zoom(1/1.2);
  function zoom(factor){if(camera.isOrthographicCamera){camera.zoom=Math.max(.03,Math.min(30,camera.zoom*factor));camera.updateProjectionMatrix();}else camera.position.sub(controls.target).multiplyScalar(1/factor).add(controls.target);controls.update();state.dirty=true;}
  $('spin').onclick=()=>{controls.autoRotate=!controls.autoRotate;$('spin').classList.toggle('active',controls.autoRotate);$('spin').setAttribute('aria-pressed',controls.autoRotate);};
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('stage').requestFullscreen();}catch(e){notice('当前浏览器不支持全屏。',true);}};
  $('projection').onchange=()=>{
    const pos=camera.position.clone(),target=controls.target.clone(),oldUp=camera.up.clone();
    const apparentHeight=camera.isOrthographicCamera?viewHeight/camera.zoom:2*camera.position.distanceTo(target)*Math.tan(T.MathUtils.degToRad(35/2))/camera.zoom;
    camera=$('projection').value==='perspective'?new T.PerspectiveCamera(35,1,.01,10000):new T.OrthographicCamera(-10,10,10,-10,.01,10000);
    camera.position.copy(pos);camera.up.copy(oldUp);viewHeight=apparentHeight;
    if(camera.isPerspectiveCamera)camera.position.copy(target).addScaledVector(pos.sub(target).normalize(),apparentHeight/(2*Math.tan(T.MathUtils.degToRad(35/2))));
    attachControls();controls.target.copy(target);resize();controls.update();state.dirty=true;
  };
  $('resetStyle').onclick=()=>{
    state.mode='ball';document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode==='ball'));
    for(const el of Object.keys(state.styles))state.styles[el]=defaultStyle(el);
    $('atomScale').value='1';$('bondRadius').value='.1';$('bondColorMode').value='element';$('bondColor').disabled=true;$('bondColor').value='#8d969c';$('showBonds').checked=true;$('showCell').checked=true;
    $('bondMethod').value='radii';$('bondMethod').onchange();updateOutputs();renderElements();rebuild();notice('已恢复默认外观');
  };
  const raycaster=new T.Raycaster();let pointerDown=null;
  renderer.domElement.addEventListener('pointerdown',e=>{pointerDown=[e.clientX,e.clientY];$('atomTooltip').hidden=true;});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!pointerDown||Math.hypot(e.clientX-pointerDown[0],e.clientY-pointerDown[1])>4)return;
    const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);
    const hit=raycaster.intersectObjects(state.atomMeshes)[0];if(!hit){$('atomTooltip').hidden=true;return;}
    const a=hit.object.userData.atoms[hit.instanceId],tooltip=$('atomTooltip');tooltip.replaceChildren();
    const bold=document.createElement('strong');bold.textContent=a.elem;tooltip.append(bold,document.createElement('br'),document.createTextNode('位置 / Å: '+a.p.toArray().map(n=>n.toFixed(3)).join(', ')));
    if(a.frac)tooltip.append(document.createElement('br'),document.createTextNode('分数坐标: '+a.frac.toArray().map(n=>n.toFixed(3)).join(', ')));
    tooltip.style.left=Math.min(Math.max(8,e.clientX-rect.left+12),rect.width-225)+'px';tooltip.style.top=Math.min(e.clientY-rect.top+12,rect.height-90)+'px';tooltip.hidden=false;
  });
  async function exportPNG(){
    const button=$('export');button.disabled=true;const spinning=controls.autoRotate;controls.autoRotate=false;let output;
    try{
      const width=Number($('exportWidth').value),height=width*3/4;
      const cam=camera.clone(),aspect=width/height,currentAspect=$('stage').clientWidth/$('stage').clientHeight;
      if(cam.isOrthographicCamera){const h=(camera.top-camera.bottom)*Math.max(1,currentAspect/aspect);cam.top=h/2;cam.bottom=-h/2;cam.left=-h*aspect/2;cam.right=h*aspect/2;}
      else{cam.aspect=aspect;if(currentAspect>aspect)cam.fov=T.MathUtils.radToDeg(2*Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov/2))*currentAspect/aspect));}
      cam.updateProjectionMatrix();
      output=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});output.setPixelRatio(1);output.setSize(width,height,false);output.outputEncoding=T.sRGBEncoding;
      const transparent=$('transparent').checked;output.setClearColor($('background').value==='dark'?0x282e2c:0xffffff,transparent?0:1);
      output.render(scene,cam);
      const blob=await new Promise(resolve=>output.domElement.toBlob(resolve,'image/png'));if(!blob)throw Error('图像编码失败。');
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(state.fileName||'BiOCl').replace(/\.[^.]+$/,'')+'_'+width+(transparent?'_transparent':'')+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
      notice('已导出 '+width+' × '+height+(transparent?' 透明 PNG':' PNG'));
    }catch(e){console.error(e);notice('导出失败：'+e.message,true);}finally{output?.dispose();output?.forceContextLoss();button.disabled=false;controls.autoRotate=spinning;state.dirty=true;}
  }
  $('export').onclick=exportPNG;
  const exampleCIF=`data_BiOCl_mp22939
_chemical_name_common 'Bismoclite'
_cell_length_a 3.913872
_cell_length_b 3.913872
_cell_length_c 7.827791
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_symmetry_space_group_name_H-M 'P4/nmm'
loop_
_symmetry_equiv_pos_as_xyz
'x,y,z'
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Bi1 Bi 0 0.5 ${.5+2.638090811656/7.827791}
Bi2 Bi 0.5 0 ${.5-2.638090811656/7.827791}
O1 O 0 0 0
O2 O 0.5 0.5 0
Cl1 Cl 0 0.5 ${.5-1.264008207307/7.827791}
Cl2 Cl 0.5 0 ${.5+1.264008207307/7.827791}
`;
  function loadExample(){
    try{state.blocks=parseBlocks(exampleCIF);state.fileName='mp-22939.cif';$('blockRow').hidden=true;loadModel(modelFromBlock(state.blocks[0]),state.fileName);}catch(e){console.error(e);notice(e.message,true);}
  }
  $('example').onclick=loadExample;resize();loadExample();updateOutputs();
  // Read-only diagnostics for local browser verification.
  window.crystalStudio={get atoms(){return state.atoms.length;},get bonds(){return state.bonds.length;},get cellAtoms(){return state.model?.atoms.length;},get camera(){return camera;},get renderer(){return renderer;},parseBlocks,modelFromBlock,exampleCIF};
})();
