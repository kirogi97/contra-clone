// Polished Contra-ish (shape art, parallax, boss, ammo, animations, better collisions)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const message = document.getElementById('message');

const keys = {};
window.addEventListener('keydown', e => {
  if (!e.repeat) keys[e.code] = true;
  if (e.code === 'KeyQ') cycleWeapon();
});
window.addEventListener('keyup', e => keys[e.code] = false);

const WORLD_WIDTH = 4200;
let cameraX = 0;
let gamePaused = false;
let levelComplete = false;

// Player with animation state
const player = {
  x: 80, y: 260,
  w: 30, h: 40,
  prevX: 80, prevY: 260,
  dx: 0, dy: 0,
  speed: 3.4,
  jumpPower: 10,
  onGround: false,
  facing: 1,
  state: 'idle', // idle, run, jump, shoot
  frame: 0,
  frameTimer: 0,
  weaponsOwned: { single: true },
  weaponOrder: ['single','shotgun','machine'],
  weapon: 'single',
  lastShot: 0,
  hp: 3,
  invuln: 0
};

// Ammo config
const AMMO_MAX = { single: Infinity, shotgun: 24, machine: 120 };
const ammo = { single: Infinity, shotgun: 0, machine: 0 };

// Bullets and enemy shots
const bullets = [];

// Floor & platforms
const floorY = 340;
const platforms = [
  {x: 420, y: 280, w: 140, h: 12},
  {x: 920, y: 240, w: 180, h: 12},
  {x: 1600, y: 260, w: 120, h: 12},
  {x: 2200, y: 200, w: 180, h: 12},
  {x: 3000, y: 260, w: 140, h: 12},
];

// Enemies
const enemies = [
  createEnemy(700,300, 640,760),
  createEnemy(1150,300, 1090,1210),
  createEnemy(1900,300, 1840,1960),
  createEnemy(2600,300, 2540,2700),
  createEnemy(3200,300, 3180,3340)
];

// Pickups: weapons and ammo
const pickups = [
  {x: 900, y: 200, type: 'shotgun'},
  {x: 1700, y: 220, type: 'machine'},
  {x: 950, y: 220, type: 'ammo', weapon: 'shotgun', amount: 12},
  {x: 1750, y: 240, type: 'ammo', weapon: 'machine', amount: 50},
  {x: 2800, y: 220, type: 'ammo', weapon: 'machine', amount: 30}
];

// Boss (at level end)
const bossStartX = WORLD_WIDTH - 420;
const boss = {
  x: bossStartX, y: 200, w: 120, h: 120, hp: 30, alive: true, state: 'idle', timer:0, dir: -1, bullets: []
};

// Weapon definitions: fireRate and bullet patterns (use ammo counts)
const WEAPONS = {
  single: { fireRate: 280, bullets: (px,py,dir)=> [{x:px,y:py,dx: dir*8,dy:0, w:6,h:4}] , ammoCost:0 },
  shotgun: { fireRate: 700, bullets: (px,py,dir)=> [
    {x:px,y:py,dx: dir*7,dy:-1.8,w:6,h:4},
    {x:px,y:py,dx: dir*8,dy:0,w:6,h:4},
    {x:px,y:py,dx: dir*7,dy:1.8,w:6,h:4},
  ], ammoCost:3 },
  machine: { fireRate: 80, bullets: (px,py,dir)=> [{x:px,y:py,dx: dir*10,dy:0,w:5,h:3}], ammoCost:1 }
};

// Utility
function createEnemy(x,y,leftBound,rightBound){
  return { x, y, w:30, h:36, alive:true, dir: -1, speed:1.2, leftBound, rightBound, hp: 2, stun:0 };
}
function rectColl(a,b){
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

// Weapon cycling
function cycleWeapon(){
  const owned = Object.keys(player.weaponsOwned);
  if (owned.length <= 1) return;
  let idx = player.weaponOrder.indexOf(player.weapon);
  for (let i=1;i<player.weaponOrder.length;i++){
    const cand = player.weaponOrder[(idx + i) % player.weaponOrder.length];
    if (player.weaponsOwned[cand]) { player.weapon = cand; break; }
  }
}

// Shooting logic with ammo consumption
function tryShoot(){
  const now = performance.now();
  const w = WEAPONS[player.weapon];
  if (!w) return;
  if (now - player.lastShot < w.fireRate) return;
  // check ammo
  if (AMMO_MAX[player.weapon] !== Infinity && ammo[player.weapon] < (w.ammoCost || 0)) return;
  player.lastShot = now;
  const dir = player.facing;
  const px = player.x + (dir === 1 ? player.w : -8);
  const py = player.y + player.h/2 - 4;
  const newBullets = w.bullets(px, py, dir);
  for (const b of newBullets){
    bullets.push({ x: b.x, y: b.y, dx: b.dx, dy: b.dy, w: b.w||6, h: b.h||4, from:'player' });
  }
  if (w.ammoCost) ammo[player.weapon] = Math.max(0, ammo[player.weapon] - w.ammoCost);
  // small recoil animation
  player.frameTimer = 0;
  player.state = 'shoot';
}

// Enemy damage helper
function damageEntity(ent, dmg, knockX=0, knockY=0){
  if (ent.hp === undefined) return;
  ent.hp -= dmg;
  ent.stun = 12;
  ent.x += knockX;
  ent.y += knockY;
  if (ent.hp <= 0) ent.alive = false;
}

// Boss behavior
function updateBoss(){
  if (!boss.alive) return;
  const px = player.x;
  boss.timer++;
  // simple basic behavior by distance
  if (boss.timer % 90 === 0){
    // fire a spread
    for (let i=-2;i<=2;i++){
      const dx = (i*0.6) - (boss.x > player.x ? 1.5 : -1.5);
      const speed = 3 + Math.abs(i);
      boss.bullets.push({ x: boss.x + (boss.w/2), y: boss.y + 70, dx: -2.2 + i*0.7, dy: i*0.6, w:8, h:6 });
    }
  }
  // move left-right slowly
  boss.x += boss.dir * 1.2;
  if (boss.x < bossStartX - 120) boss.dir = 1;
  if (boss.x > bossStartX + 40) boss.dir = -1;
  // bullets
  for (let i = boss.bullets.length-1; i>=0; i--){
    const b = boss.bullets[i];
    b.x += b.dx;
    b.y += b.dy;
    b.dy += 0.06;
    if (b.x < -50 || b.x > WORLD_WIDTH + 50 || b.y > canvas.height + 50) boss.bullets.splice(i,1);
    // hit player
    if (rectColl(b, player) && player.invuln <= 0){
      player.hp -= 1;
      player.invuln = 80;
      player.x = Math.max(20, player.x - 80);
      boss.bullets.splice(i,1);
    }
  }
}

// Update loop
function update(){
  if (gamePaused) return;
  // store prev
  player.prevX = player.x; player.prevY = player.y;

  // movement input
  if (keys['ArrowLeft']) { player.dx = -player.speed; player.facing = -1; }
  else if (keys['ArrowRight']) { player.dx = player.speed; player.facing = 1; }
  else player.dx = 0;

  // jumping
  if (keys['ArrowUp'] && player.onGround) { player.dy = -player.jumpPower; player.onGround = false; }

  // shoot
  if (keys['Space']) tryShoot();

  // physics
  player.dy += 0.45;
  player.x += player.dx;
  player.y += player.dy;

  // horizontal world bounds
  if (player.x < 0) player.x = 0;
  if (player.x + player.w > WORLD_WIDTH) player.x = WORLD_WIDTH - player.w;

  // platform collisions - improved: check previous bottom to detect landing only when coming from above
  player.onGround = false;
  // floor
  if (player.y + player.h >= floorY) {
    player.y = floorY - player.h;
    player.dy = 0;
    player.onGround = true;
  }
  // platforms
  for (const p of platforms){
    // only check when horizontally overlapping
    if (player.x + player.w > p.x && player.x < p.x + p.w){
      // previous bottom was above platform and current bottom intersects -> landed
      if (player.prevY + player.h <= p.y && player.y + player.h >= p.y){
        player.y = p.y - player.h;
        player.dy = 0;
        player.onGround = true;
      }
    }
  }

  // camera: keep player visible with margins
  const leftLimit = canvas.width * 0.36;
  const rightLimit = canvas.width * 0.64;
  if (player.x - cameraX > rightLimit) cameraX = Math.min(player.x - rightLimit, WORLD_WIDTH - canvas.width);
  if (player.x - cameraX < leftLimit) cameraX = Math.max(player.x - leftLimit, 0);

  // bullets update
  for (let i = bullets.length-1; i>=0; i--){
    const b = bullets[i];
    b.x += b.dx; b.y += b.dy;
    b.dy += 0.1;
    if (b.x < -50 || b.x > WORLD_WIDTH + 50 || b.y > canvas.height + 50) bullets.splice(i,1);
    else {
      // collide with enemies
      if (b.from === 'player'){
        for (const e of enemies){
          if (!e.alive) continue;
          if (rectColl(b, e)){
            damageEntity(e, 1, Math.sign(b.dx)*6, -6);
            bullets.splice(i,1);
            break;
          }
        }
        // collide with boss
        if (boss.alive && rectColl(b, boss)){
          boss.hp -= 1;
          bullets.splice(i,1);
          if (boss.hp <= 0) { boss.alive = false; levelComplete = true; showMessage('MISSION COMPLETE'); }
        }
      }
    }
  }

  // enemy updates
  for (const e of enemies){
    if (!e.alive) continue;
    if (e.stun > 0) e.stun--;
    else {
      e.x += e.dir * e.speed;
      if (e.x < e.leftBound) e.dir = 1;
      if (e.x > e.rightBound) e.dir = -1;
    }
    // simple enemy AI: shoot occasionally
    if (Math.random() < 0.0025 && e.alive){
      // enemy shoot towards player
      const dir = (player.x < e.x) ? -1 : 1;
      const ebx = e.x + (dir === 1 ? e.w : -6);
      const eby = e.y + 12;
      bullets.push({ x: ebx, y: eby, dx: dir*3.8, dy: -1.2, w:6, h:4, from:'enemy' });
    }
    // collision with player
    if (rectColl(e, player) && player.invuln <= 0){
      // knockback + damage
      player.hp -= 1;
      player.invuln = 80;
      player.x = Math.max(20, player.x - 80);
    }
  }

  // pickups
  for (let i = pickups.length-1; i>=0; i--){
    const p = pickups[i];
    const pickRect = {x:p.x, y:p.y, w:22, h:22};
    const playerRect = {x:player.x, y:player.y, w:player.w, h:player.h};
    if (rectColl(pickRect, playerRect)){
      if (p.type === 'shotgun' || p.type === 'machine'){
        player.weaponsOwned[p.type] = true;
        player.weapon = p.type;
        // grant some initial ammo
        ammo[p.type] = Math.min(AMMO_MAX[p.type], ammo[p.type] + (p.amount || 18));
      } else if (p.type === 'ammo'){
        ammo[p.weapon] = Math.min(AMMO_MAX[p.weapon], ammo[p.weapon] + (p.amount || 20));
      }
      pickups.splice(i,1);
    }
  }

  // enemy and boss bullets hitting player
  // enemy bullets are stored in bullets[] with from:'enemy' or boss.bullets
  for (let i = bullets.length-1; i>=0; i--){
    const b = bullets[i];
    if ((b.from === 'enemy') && rectColl(b, player) && player.invuln <= 0){
      player.hp -= 1;
      player.invuln = 80;
      player.x = Math.max(20, player.x - 80);
      bullets.splice(i,1);
    }
  }

  // boss update when player reaches boss area
  if (player.x + player.w >= bossStartX - 40 && boss.alive) {
    updateBoss();
  } else {
    // still have boss bullets in global bullets? boss stores its own bullets; we handle them in draw/updateBoss
  }

  // invulnerability ticks
  if (player.invuln > 0) player.invuln--;

  // animation state selection
  if (!player.onGround) player.state = 'jump';
  else if (player.dx !== 0) player.state = 'run';
  else player.state = 'idle';
  if (keys['Space']) player.state = 'shoot';

  // frame timer
  player.frameTimer++;
  if (player.frameTimer > 8) { player.frame = (player.frame + 1) % 4; player.frameTimer = 0; }

  // boss death check: if not alive and not yet flagged
  if (!boss.alive && !levelComplete) { levelComplete = true; showMessage('MISSION COMPLETE'); }

  draw();
  if (!levelComplete) requestAnimationFrame(update);
}

function showMessage(txt){
  message.textContent = txt;
  setTimeout(()=> message.textContent = '', 2500);
}

// draw background with creative art (parallax)
function drawBackground(){
  // clear sky gradient
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0, '#7fc8ff');
  g.addColorStop(1, '#7cc7c0');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // distant mountains layer
  ctx.save();
  ctx.translate(-cameraX*0.15,0);
  ctx.fillStyle = '#2b4b63';
  drawMountains( -200, 150, 1.2, 6 );
  ctx.restore();

  // mid trees
  ctx.save();
  ctx.translate(-cameraX*0.4,0);
  drawTrees(50, 220, 16);
  ctx.restore();

  // clouds
  ctx.save();
  ctx.translate(-cameraX*0.08,0);
  drawClouds();
  ctx.restore();

  // near bushes
  ctx.save();
  ctx.translate(-cameraX*0.7,0);
  drawBushes(0, 300, 18);
  ctx.restore();
}

// mountain helper
function drawMountains(startX, baseY, scale, count){
  for (let i=0;i<count;i++){
    const mx = startX + i*240;
    ctx.beginPath();
    ctx.moveTo(mx, baseY+60);
    ctx.lineTo(mx+120*scale, baseY - 40*scale);
    ctx.lineTo(mx+240*scale, baseY+60);
    ctx.closePath();
    ctx.fill();
    // lighter ridge
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(mx+80, baseY-30*scale, 40*scale, 8);
    ctx.fillStyle = '#2b4b63';
  }
}

// trees helper
function drawTrees(startX, baseY, count){
  for (let i=0;i<count;i++){
    const tx = startX + i*140;
    ctx.fillStyle = '#13311a';
    ctx.fillRect(tx, baseY+8, 10, 40);
    // crowns
    ctx.fillStyle = '#1f7a3a';
    ctx.beginPath();
    ctx.ellipse(tx+5, baseY+2, 28, 22, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#1a6b33';
    ctx.beginPath();
    ctx.ellipse(tx-6, baseY-6, 16, 12, 0, 0, Math.PI*2);
    ctx.fill();
  }
}

// clouds
function drawClouds(){
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  for (let i=0;i<6;i++){
    const x = (i*220 % 900) + 40;
    const y = 50 + (i%2)*12;
    ctx.beginPath();
    ctx.ellipse(x, y, 46, 18, 0, 0, Math.PI*2);
    ctx.ellipse(x+30, y+6, 34, 12, 0, 0, Math.PI*2);
    ctx.fill();
  }
}

// bushes
function drawBushes(startX, baseY, count){
  for (let i=0;i<count;i++){
    const bx = startX + i*120;
    ctx.fillStyle = '#226644';
    ctx.beginPath();
    ctx.ellipse(bx, baseY+12, 48, 20, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#1a4f3f';
    ctx.beginPath();
    ctx.ellipse(bx+28, baseY+8, 28, 14, 0, 0, Math.PI*2);
    ctx.fill();
  }
}

// draw ground and objects
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawBackground();

  // ground
  ctx.fillStyle = '#6b4b2b';
  ctx.fillRect(-cameraX, floorY, WORLD_WIDTH, canvas.height - floorY);
  // add texture stripes
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let x=0; x < WORLD_WIDTH; x += 40) {
    ctx.fillRect(x - cameraX, floorY + 6, 20, 2);
  }

  // platforms
  ctx.fillStyle = '#8b5a2b';
  for (const p of platforms){
    ctx.fillRect(p.x - cameraX, p.y, p.w, p.h);
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(p.x - cameraX, p.y, Math.min(40,p.w), 3);
    ctx.fillStyle = '#8b5a2b';
  }

  // pickups
  for (const p of pickups){
    const px = p.x - cameraX;
    if (px < -50 || px > canvas.width + 50) continue;
    if (p.type === 'ammo'){
      ctx.fillStyle = '#ffecb3';
      ctx.fillRect(px, p.y, 20, 16);
      ctx.fillStyle = '#000';
      ctx.fillText('AM', px+3, p.y+12);
    } else {
      ctx.fillStyle = (p.type === 'shotgun') ? '#d08bff' : '#ffd18a';
      ctx.fillRect(px, p.y, 22, 22);
      ctx.fillStyle = '#000';
      ctx.fillText(p.type[0].toUpperCase(), px+6, p.y+16);
    }
  }

  // enemies
  for (const e of enemies){
    if (!e.alive) continue;
    const ex = e.x - cameraX;
    // body
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(ex, e.y, e.w, e.h);
    // face/eye
    ctx.fillStyle = '#072';
    ctx.fillRect(ex + 8, e.y + 8, 6, 6);
  }

  // boss (draw when near)
  if (player.x + player.w >= bossStartX - 120 && boss.alive){
    // body & panels
    const bx = boss.x - cameraX;
    ctx.fillStyle = '#4a3b7a';
    ctx.fillRect(bx, boss.y, boss.w, boss.h);
    // face
    ctx.fillStyle = '#ffdd57';
    ctx.fillRect(bx + 26, boss.y + 16, 68, 34);
    // HP bar
    ctx.fillStyle = '#222';
    ctx.fillRect(200, 24, 380, 16);
    ctx.fillStyle = '#d34';
    ctx.fillRect(200, 24, 380 * Math.max(0, boss.hp/30), 16);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(200, 24, 380, 16);
    // boss bullets
    for (const b of boss.bullets){
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(b.x - cameraX, b.y, b.w, b.h);
    }
  }

  // player (animated shapes)
  const px = player.x - cameraX;
  // invuln flicker
  if (player.invuln > 0 && Math.floor(player.invuln / 6) % 2 === 0) ctx.globalAlpha = 0.4;
  // body
  ctx.fillStyle = '#e74c3c';
  // running animation slide
  let bob = 0;
  if (player.state === 'run') bob = Math.sin(player.frame/2)*3;
  ctx.fillRect(px, player.y + bob, player.w, player.h);
  // head
  ctx.fillStyle = '#ffd7c2';
  ctx.fillRect(px+6, player.y - 8 + bob, 18, 12);
  // gun (simple rectangle that moves slightly when shooting)
  ctx.fillStyle = '#333';
  const gunOffsetY = (player.state === 'shoot') ? -4 : 0;
  if (player.facing === 1) ctx.fillRect(px + player.w - 2, player.y + 12 + gunOffsetY + bob, 18, 6);
  else ctx.fillRect(px - 14, player.y + 12 + gunOffsetY + bob, 18, 6);

  ctx.globalAlpha = 1;

  // bullets: player & enemy
  for (const b of bullets){
    ctx.fillStyle = (b.from === 'player') ? '#ffeb3b' : '#ff6666';
    ctx.fillRect(b.x - cameraX, b.y, b.w, b.h);
  }

  // HUD: weapon, ammo, hp, progress
  ctx.fillStyle = '#000';
  ctx.fillRect(10, 10, 200, 60);
  hud.innerHTML = `
    <span class="label">Weapon:</span> <span class="status">${player.weapon.toUpperCase()}</span>
    &nbsp; <span class="label">Ammo:</span> 
    <span class="ammo">${ ammo.single === Infinity ? '∞' : ammo.single }</span> /
    <span class="ammo">${ ammo.shotgun }</span> /
    <span class="ammo">${ ammo.machine }</span>
    &nbsp; <span class="label">HP:</span> ${player.hp}
    &nbsp; <span class="label">Pos:</span> ${Math.round(player.x)}
  `;

  // progress bar bottom
  ctx.fillStyle = '#333';
  ctx.fillRect(10, canvas.height - 18, 780, 8);
  const progress = (player.x / (WORLD_WIDTH - player.w));
  ctx.fillStyle = '#1abc9c';
  ctx.fillRect(10, canvas.height - 18, 780 * progress, 8);

  // mission complete overlay
  if (levelComplete){
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#ffd';
    ctx.font = '36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MISSION COMPLETE', canvas.width/2, canvas.height/2 - 10);
    ctx.font = '16px monospace';
    ctx.fillText('Refresh to play again', canvas.width/2, canvas.height/2 + 24);
  }
}

// init ammo / starting state
ammo.single = Infinity; ammo.shotgun = 0; ammo.machine = 0;

// start
update();

// touch/click to fire quick
canvas.addEventListener('mousedown', e => { keys['Space'] = true; });
canvas.addEventListener('mouseup', e => { keys['Space'] = false; });

// simple instruction: show pickup messages when collected (optional)
// show message on pickups via overriding their push/pop: handled via showMessage when collected
// but we can attach a watcher to pickups array to show in the pickup loop above.

// small helpful note printed in console
console.log('Contra-ish: drop files in a folder and open index.html. Controls: ← → ↑ Space Q.');

