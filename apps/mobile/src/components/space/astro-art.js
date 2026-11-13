/* eslint-disable */
// Astronauta 2D do protótipo do cliente (universo-folks.html), copiado sem alterar o desenho.
// Gera o SVG em texto para o SvgXml do react-native-svg. As poses e peças que no protótipo
// eram feitas por CSS (braço levantado, efeitos escondidos) viram atributos em astroSvg().
let UID = 0;
function hex(c){c=c.replace('#','');return[parseInt(c.slice(0,2),16),parseInt(c.slice(2,4),16),parseInt(c.slice(4,6),16)]}
function shade(c,p){const[r,g,b]=hex(c),f=v=>Math.max(0,Math.min(255,Math.round(p<0?v*(1+p):v+(255-v)*p)));return'#'+[f(r),f(g),f(b)].map(v=>v.toString(16).padStart(2,'0')).join('')}
const LOOK0={suit:'branco',accent:'laranja',visor:'noite',head:'antena',back:'mochila'};
const LOOKS={
 suit:[['branco','Branco',1,'#f4f6fb'],['cinza','Cinza-lua',2,'#c9cde0'],['grafite','Grafite',3,'#4a4f6a'],['azul','Azul-noite',4,'#3550a8'],['lilas','Lilás',5,'#b9a2ff'],['vinho','Vinho',6,'#7a2d48']],
 accent:[['laranja','Laranja',1,'#ff9600'],['ambar','Âmbar',2,'#ffc83d'],['ciano','Ciano',3,'#2fc6e0'],['rosa','Rosa',4,'#ff5fa2'],['verde','Verde',5,'#45d483'],['roxo','Roxo',6,'#9b7bff']],
 visor:[['noite','Noite',1,'#232b66'],['dourada','Dourada',2,'#ffb020'],['azul','Azul',3,'#2f7bff'],['espelho','Espelho',5,'#b8c2dc'],['galaxia','Galáxia',7,'#7b4dff']],
 head:[['nada','Nenhum',1],['antena','Antena',1],['fones','Fones',3],['festa','Chapéu de festa',4],['estrela','Estrela',8]],
 back:[['mochila','Mochila',1],['violao','Violão',3],['jetpack','Jetpack',4],['capa','Capa',5]]};
const CATS=[['suit','Traje'],['accent','Detalhes'],['visor','Viseira'],['head','Cabeça'],['back','Costas']];
const lv=(c,id)=>(LOOKS[c].find(x=>x[0]===id)||LOOKS[c][0]);
function astro(mood='idle',cls='',th,look){const L={...LOOK0,...(look||{})},id='a'+(UID++);if(th){if(th.head)L.head=th.head;if(th.back)L.back=th.back}const pose=th&&th.prop?th.pose:'';
  const su=lv('suit',L.suit)[3],sd=shade(su,-.22),ac2=lv('accent',L.accent)[3],ad=shade(ac2,-.25),vi=lv('visor',L.visor)[3],gal=L.visor==='galaxia',dark=hex(su).reduce((a,b)=>a+b)<330;
  const back={mochila:`<rect x="42" y="92" width="76" height="46" rx="16" fill="${sd}"/><rect x="46" y="98" width="68" height="8" rx="4" fill="${ac2}"/>`,
   jetpack:`<rect x="34" y="94" width="18" height="44" rx="9" fill="#c9cce0"/><rect x="108" y="94" width="18" height="44" rx="9" fill="#c9cce0"/><rect x="34" y="102" width="18" height="6" fill="${ac2}"/><rect x="108" y="102" width="18" height="6" fill="${ac2}"/>
     <path class="a-flame" d="M36 138 Q43 162 50 138Z" fill="#ffc83d"/><path class="a-flame" d="M110 138 Q117 162 124 138Z" fill="#ffc83d"/><path class="a-flame" d="M39 138 Q43 151 47 138Z" fill="#ff5a2a"/><path class="a-flame" d="M113 138 Q117 151 121 138Z" fill="#ff5a2a"/>`,
   capa:`<path d="M52 96 Q28 140 34 172 Q80 182 126 172 Q132 140 108 96Z" fill="${ac2}"/><path d="M60 110 Q50 140 52 170 M100 110 Q110 140 108 170" stroke="${ad}" stroke-width="3" fill="none" opacity=".6"/>`,
   violao:`<g transform="rotate(-38 80 110)"><rect x="76" y="14" width="9" height="78" rx="3" fill="#6b3b1a"/><rect x="73" y="4" width="15" height="16" rx="4" fill="#4a2810"/><ellipse cx="80.5" cy="134" rx="25" ry="22" fill="#e08a3a"/><ellipse cx="80.5" cy="110" rx="18" ry="16" fill="#e08a3a"/><circle cx="80.5" cy="122" r="6" fill="#4a2810"/></g>`}[L.back]||'';
  const head={antena:`<path d="M104 24 Q110 14 116 4" stroke="#9aa0c0" stroke-width="4" stroke-linecap="round" fill="none"/><circle cx="117" cy="3" r="7" fill="${ac2}"/><circle cx="115" cy="1" r="2.5" fill="#fff" opacity=".7"/>`,
   fones:`<path d="M30 58 A50 50 0 0 1 130 58" fill="none" stroke="#2e2c4c" stroke-width="8" stroke-linecap="round"/><rect x="22" y="46" width="20" height="30" rx="10" fill="${ac2}"/><rect x="118" y="46" width="20" height="30" rx="10" fill="${ac2}"/><rect x="26" y="52" width="6" height="18" rx="3" fill="#fff" opacity=".4"/>`,
   festa:`<path d="M66 18 L80 -24 L94 18Z" fill="${ac2}"/><path d="M70 6 L90 6 M73 -4 L87 -4 M76 -14 L84 -14" stroke="#fff" stroke-width="3" opacity=".7"/><circle cx="80" cy="-26" r="6" fill="#ffc83d"/>`,
   estrela:`<g class="a-star"><path d="M80 -30 l6 12 13 2 -9.5 9 2.5 13 -12-6.5 -12 6.5 2.5-13 -9.5-9 13-2z" fill="#ffc83d" stroke="#e0a800" stroke-width="2"/></g>`,
   moicano:`<path d="M58 22 L60 -4 L68 14 L72 -14 L78 10 L82 -18 L88 10 L92 -12 L96 14 L102 -2 L104 22 Q80 6 58 22Z" fill="#ff3d8b" stroke="#c4126a" stroke-width="2" stroke-linejoin="round"/><path d="M66 12 L70 -6 M80 6 L82 -10 M92 8 L94 -4" stroke="#ff9cc6" stroke-width="2.5" stroke-linecap="round"/>`,
   capelo:`<rect x="60" y="4" width="40" height="14" rx="3" fill="#22204a"/><path d="M80 -10 L120 2 L80 14 L40 2Z" fill="#2e2b5e" stroke="#15133a" stroke-width="2"/><path d="M80 2 Q104 4 112 6 L114 28" stroke="#ffc83d" stroke-width="2.5" fill="none"/><circle cx="114" cy="31" r="4" fill="#ffc83d"/>`,
   obra:`<path d="M36 38 Q36 2 80 2 Q124 2 124 38Z" fill="#ffc83d"/><path d="M74 3 Q80 1 86 3 L86 36 L74 36Z" fill="#ffe08a"/><rect x="28" y="33" width="104" height="9" rx="4.5" fill="#e0a800"/>`,
   cartola:`<rect x="58" y="-34" width="44" height="46" rx="5" fill="#22204a"/><rect x="58" y="-2" width="44" height="9" fill="${ac2}"/><ellipse cx="80" cy="13" rx="38" ry="7" fill="#15133a"/>`,
   headset:`<path d="M30 58 A50 50 0 0 1 130 58" fill="none" stroke="#2e2c4c" stroke-width="7" stroke-linecap="round"/><rect x="22" y="46" width="20" height="30" rx="10" fill="${ac2}"/><rect x="118" y="46" width="20" height="30" rx="10" fill="${ac2}"/><path d="M128 72 Q126 94 106 94" stroke="#2e2c4c" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="104" cy="94" r="5" fill="#2e2c4c"/>`,
   flor:`<g transform="translate(110 14)">${[0,72,144,216,288].map(a=>`<ellipse cx="0" cy="-9" rx="6" ry="9" transform="rotate(${a})" fill="#fff"/>`).join('')}<circle r="6" fill="#ffc83d"/></g>`,
   coroa:`<path d="M60 16 L58 -8 L70 4 L80 -14 L90 4 L102 -8 L100 16Z" fill="#ffc83d" stroke="#e0a000" stroke-width="2" stroke-linejoin="round"/><circle cx="80" cy="6" r="3.5" fill="#ff5c6c"/><circle cx="68" cy="9" r="2.5" fill="#3d8bff"/><circle cx="92" cy="9" r="2.5" fill="#45d483"/>`}[L.head]||'';
  const ears=(L.head==='fones'||L.head==='headset')?'':`<rect x="27" y="50" width="14" height="26" rx="7" fill="${ac2}"/><rect x="119" y="50" width="14" height="26" rx="7" fill="${ac2}"/>`;
  const arm=(side)=>{const L2=side==='L',x0=L2?51:109,x1=L2?39:121;return `<g class="a-arm${side}"><path d="M${x0} 106 L${x1+(L2?1:-1)} 129" stroke="${su}" stroke-width="15" stroke-linecap="round" fill="none"/><path d="M${x0+(L2?-3:3)} 109 L${x1+(L2?-2:2)} 126" stroke="${sd}" stroke-width="3.5" stroke-linecap="round" fill="none" opacity=".5"/><circle cx="${x1}" cy="134" r="9.5" fill="${ac2}"/><circle cx="${x1+(L2?-3:3)}" cy="131" r="2.8" fill="#fff" opacity=".4"/>${L2?'':`<rect class="a-thumb" x="124" y="128.5" width="17" height="11" rx="5.5" fill="${ac2}" stroke="${ad}" stroke-width="1.5"/>`}</g>`};
  return `<svg class="astro ${cls}" data-mood="${mood}" data-back="${L.back}"${pose?` data-pose="${pose}"`:''} data-act="poke" viewBox="0 -34 160 222" role="img" aria-label="Astronauta da Folks"><defs>
   <linearGradient id="${id}v" x1="0" y1="0" x2="1" y2="1">${gal?'<stop offset="0" stop-color="#7b4dff"/><stop offset=".5" stop-color="#ff5fa2"/><stop offset="1" stop-color="#2fc6e0"/>':`<stop offset="0" stop-color="${shade(vi,.3)}"/><stop offset="1" stop-color="${shade(vi,-.4)}"/>`}</linearGradient>
   <clipPath id="${id}c"><rect x="48" y="38" width="64" height="44" rx="22"/></clipPath></defs>
   <ellipse cx="80" cy="184" rx="34" ry="5.5" fill="rgba(0,0,0,.3)"/>
   <g class="a-all"><g class="a-turn">${back}
    <rect x="58" y="136" width="18" height="28" rx="9" fill="${su}"/><rect x="84" y="136" width="18" height="28" rx="9" fill="${su}"/>
    <rect x="52" y="156" width="28" height="20" rx="10" fill="${ac2}"/><rect x="80" y="156" width="28" height="20" rx="10" fill="${ac2}"/><rect x="52" y="170" width="28" height="6" rx="3" fill="${ad}"/><rect x="80" y="170" width="28" height="6" rx="3" fill="${ad}"/>
    <rect x="46" y="94" width="68" height="54" rx="25" fill="${su}"/><path d="M46 122 Q46 148 80 148 Q114 148 114 122 Q100 140 80 140 Q60 140 46 122Z" fill="${sd}"/>
    <rect x="47" y="126" width="66" height="8" rx="4" fill="${ac2}"/>
    <rect x="65" y="103" width="30" height="17" rx="6" fill="${dark?'#1c1f3a':'#fff'}" stroke="${sd}" stroke-width="2.5"/><circle cx="72" cy="111.5" r="3" fill="#ff5c6c"/><circle cx="80" cy="111.5" r="3" fill="#ffc83d"/><circle cx="88" cy="111.5" r="3" fill="#3d8bff"/>
    <rect x="56" y="92" width="48" height="11" rx="5.5" fill="${ac2}"/>
    <g class="a-head">${ears}
     <circle cx="80" cy="56" r="46" fill="${su}"/><path d="M36 66 A46 46 0 0 0 124 66 A48 40 0 0 1 36 66Z" fill="${sd}"/>
     <ellipse cx="56" cy="24" rx="12" ry="6.5" transform="rotate(-30 56 24)" fill="#fff" opacity="${dark?.35:.85}"/>
     <g class="a-visor"><rect x="43" y="33" width="74" height="54" rx="27" fill="${ac2}"/><rect x="48" y="38" width="64" height="44" rx="22" fill="url(#${id}v)"/>
      <g clip-path="url(#${id}c)"><rect class="a-shine" x="40" y="20" width="12" height="80" transform="skewX(-20)" fill="#fff" opacity=".35"/></g>
      <path d="M58 50 Q66 43 78 43" stroke="#fff" stroke-width="5.5" stroke-linecap="round" fill="none" opacity=".9"/><circle cx="99" cy="70" r="4" fill="#fff" opacity=".75"/><circle cx="91" cy="74" r="2" fill="#fff" opacity=".6"/>
      <path d="M52 66 Q80 75 108 66" stroke="#ffc83d" stroke-width="3" fill="none" opacity="${gal?0:.45}"/></g>
     <g class="a-acc">${head}</g></g>
    ${th&&th.chest?TIE:''}${pose?propSVG(th.prop,ac2,ad):''}${arm('L')}${arm('R')}</g>
    <g class="a-fx">
     <g class="a-spark"><path d="M14 40 l3 7 7 3 -7 3 -3 7 -3-7 -7-3 7-3z" fill="#ffc83d"/><path d="M144 30 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5-6 -6-2.5 6-2.5z" fill="#fff"/><path d="M140 110 l2 5 5 2 -5 2 -2 5 -2-5 -5-2 5-2z" fill="#2fc6e0"/><path d="M20 120 l2 5 5 2 -5 2 -2 5 -2-5 -5-2 5-2z" fill="#ff5fa2"/></g>
     <g class="a-dots"><circle cx="128" cy="6" r="4" fill="#fff"/><circle cx="140" cy="-6" r="5" fill="#fff"/><circle cx="154" cy="-20" r="6.5" fill="#fff"/></g>
     <g class="a-drop"><path d="M128 22 Q134 32 128 36 Q122 32 128 22Z" fill="#8fd0ff"/></g>
     <g class="a-notes"><path d="M132 30v-14l10-3v12" fill="none" stroke="#ffc83d" stroke-width="2.5"/><path d="M14 40v-12l9-3v10" fill="none" stroke="#2fc6e0" stroke-width="2.5"/></g>
    </g></g></svg>`}
const TIE=`<path d="M76 101 L84 101 L82.5 107 L77.5 107Z" fill="#2a5bd8"/><path d="M77.5 107 L82.5 107 L86 126 L80 132 L74 126Z" fill="#3d7bff"/><path d="M78 112 L84 118 M76 120 L85 126" stroke="#9cc2ff" stroke-width="1.5"/>`;
function propSVG(p,ac2,ad){return ({
 guitarra:`<g transform="translate(58 140) rotate(-35)"><rect x="14" y="-3.5" width="80" height="7" rx="2" fill="#4a2c16"/><path d="M20 -2.5 L92 -2.5 M20 0 L92 0 M20 2.5 L92 2.5" stroke="#e8dcc8" stroke-width=".7"/><path d="M90 -7 L108 -9 Q112 0 108 9 L90 7Z" fill="#22204a"/><circle cx="96" cy="-5" r="1.6" fill="#ddd"/><circle cx="102" cy="-6" r="1.6" fill="#ddd"/><circle cx="96" cy="5" r="1.6" fill="#ddd"/><circle cx="102" cy="6" r="1.6" fill="#ddd"/>
   <path d="M-20 -14 Q-6 -24 8 -13 Q20 -18 24 -6 Q27 6 14 11 Q6 24 -12 21 Q-32 16 -28 1 Q-29 -9 -20 -14Z" fill="#ff3d6e" stroke="#c4123e" stroke-width="2"/><path d="M-14 -6 Q-2 -12 10 -4 L8 8 Q-6 14 -16 6Z" fill="#fff" opacity=".9"/><rect x="-4" y="-7" width="5" height="14" rx="1.5" fill="#22204a"/><rect x="6" y="-6" width="4" height="12" rx="1.5" fill="#22204a"/><circle cx="-14" cy="12" r="2.5" fill="#ffc83d"/></g>`,
 lapis:`<g transform="translate(138 114) rotate(14)"><rect x="-6" y="-50" width="12" height="80" fill="#ffc83d"/><rect x="-2" y="-50" width="4" height="80" fill="#ffe08a"/><rect x="-6" y="-58" width="12" height="9" rx="3" fill="#ff8fb0"/><rect x="-6" y="-50" width="12" height="4" fill="#c9cde0"/><path d="M-6 30 L0 46 L6 30Z" fill="#f2d3a8"/><path d="M-2.2 40 L0 46 L2.2 40Z" fill="#2e2c4c"/></g>`,
 chave:`<g transform="translate(138 114) rotate(-25)"><rect x="-4.5" y="-8" width="9" height="46" rx="4" fill="#c9cde0"/><path d="M0 -36a13 13 0 1 0 0.1 0Z" fill="#c9cde0"/><rect x="-5" y="-50" width="10" height="16" fill="#0b0d26" opacity="0"/><path d="M-5 -49 L5 -49 L5 -33 L-5 -33Z" fill="#14163a"/><rect x="-2" y="0" width="4" height="30" rx="2" fill="#9aa0c0"/></g>`,
 saco:`<g transform="translate(138 116)"><path d="M-4 0 L4 0 L6 6 Q22 12 20 30 Q18 42 0 42 Q-18 42 -20 30 Q-22 12 -6 6Z" fill="#2fc27a" stroke="#1b8a52" stroke-width="2"/><path d="M-7 4 L7 4" stroke="#ffc83d" stroke-width="3" stroke-linecap="round"/><text x="0" y="33" text-anchor="middle" font-size="20" font-weight="800" font-family="Plus Jakarta Sans,system-ui,sans-serif" fill="#fff">$</text></g>`,
 placa:`<rect x="118" y="-6" width="5" height="130" rx="2" fill="#8a5a2b"/><path d="M98 -32 H156 a8 8 0 0 1 8 8 V2 a8 8 0 0 1 -8 8 H126 l-8 8 v-8 H98 a8 8 0 0 1 -8 -8 V-24 a8 8 0 0 1 8 -8Z" fill="#fff" stroke="#d6d2ee" stroke-width="2"/><path d="M114 -12 l8 8 l16 -16" stroke="#45d483" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
 mic:`<g transform="translate(136 88) rotate(-35)"><rect x="-5" y="-2" width="10" height="30" rx="4" fill="#22204a"/><rect x="-6" y="-4" width="12" height="5" rx="2" fill="${ac2}"/><circle cx="0" cy="-14" r="12" fill="#3a3d5c" stroke="#22204a" stroke-width="2"/><path d="M-8 -19 H8 M-10 -14 H10 M-8 -9 H8 M-4 -24 V-4 M4 -24 V-4" stroke="#8a90b0" stroke-width="1.3"/><ellipse cx="-4" cy="-19" rx="3" ry="2" fill="#fff" opacity=".5"/></g><g class="a-waves"><path d="M112 42 Q106 52 112 62" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/><path d="M104 36 Q94 52 104 68" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/></g>`,
 bandeira:`<rect x="118" y="-44" width="5" height="170" rx="2" fill="#c9cde0"/><circle cx="120.5" cy="-46" r="5" fill="#ffc83d"/><path class="a-flagc" d="M123 -40 Q140 -46 160 -38 L160 -10 Q140 -18 123 -12Z" fill="${ac2}" stroke="${ad}" stroke-width="2"/><path d="M141 -32 l2.5 5 5.5.6 -4 3.6 1.2 5.4 -5.2-2.8 -5.2 2.8 1.2-5.4 -4-3.6 5.5-.6z" fill="#fff"/>`,
 balao:`<g class="a-balloon"><path d="M138 114 Q130 80 150 48" stroke="#fff" stroke-width="1.5" fill="none" opacity=".8"/><path d="M150 50 C130 36 128 14 140 8 C146 5 150 10 150 14 C150 10 154 5 160 8 C172 14 170 36 150 50Z" fill="#ff5f8f" stroke="#d6336a" stroke-width="2"/><ellipse cx="141" cy="18" rx="3" ry="5" fill="#fff" opacity=".7" transform="rotate(-20 141 18)"/></g>`,
 maleta:`<path d="M114 140 V134 a4 4 0 0 1 4 -4 H128 a4 4 0 0 1 4 4 V140" stroke="#5a3a1a" stroke-width="3.5" fill="none"/><rect x="102" y="139" width="42" height="30" rx="5" fill="#8a5a2b" stroke="#5a3a1a" stroke-width="2"/><rect x="102" y="150" width="42" height="4" fill="#5a3a1a"/><rect x="119" y="147" width="8" height="9" rx="2" fill="#ffc83d"/>`,
 ampulheta:`<g transform="translate(140 112)"><rect x="-16" y="-26" width="32" height="6" rx="3" fill="#8a5a2b"/><rect x="-16" y="22" width="32" height="6" rx="3" fill="#8a5a2b"/><path d="M-12 -20 C-12 -6 -3 -4 -3 1 C-3 6 -12 8 -12 22 H12 C12 8 3 6 3 1 C3 -4 12 -6 12 -20Z" fill="#dff8f5" opacity=".9" stroke="#a8f4ec" stroke-width="1.5"/><path d="M-8 -14 H8 C6 -8 2 -6 0 -2 C-2 -6 -6 -8 -8 -14Z" fill="#ffc83d"/><path d="M-9 20 C-7 12 -2 10 0 6 C2 10 7 12 9 20Z" fill="#ffc83d"/></g>`}[p]||'')}

const POSE_ARM_R = { guitar: -100, mic: -100, side: -45, up: -130, down: 0 };

/**
 * @param {{ mood?: 'idle'|'wave'|'celebrate', look?: { head?: string, pose?: string, prop?: string, back?: string, chest?: boolean }, suit?: object }} [o]
 * @returns {string}
 */
export function astroSvg(o = {}) {
  const mood = o.mood || 'idle';
  const th = o.look && (o.look.prop || o.look.head || o.look.back) ? o.look : undefined;
  let s = astro(mood, '', th, o.suit);
  const pose = th && th.prop ? th.pose : '';
  // peças que o CSS do protótipo escondia
  s = s.replace(/class="a-thumb"/g, 'class="a-thumb" display="none"').replace(/class="a-flame"/g, 'class="a-flame" display="none"');
  for (const k of ['a-dots', 'a-drop', 'a-notes']) s = s.replace(`<g class="${k}">`, `<g class="${k}" display="none">`);
  if (mood !== 'celebrate') s = s.replace('<g class="a-spark">', '<g class="a-spark" display="none">');
  // braços: pose do tema (segurando o objeto) ou o humor
  let armR = pose ? POSE_ARM_R[pose] ?? 0 : mood === 'wave' ? -100 : mood === 'celebrate' ? -95 : 0;
  let armL = !pose && mood === 'celebrate' ? 95 : 0;
  if (armR) s = s.replace('<g class="a-armR">', `<g class="a-armR" transform="rotate(${armR} 109 106)">`);
  if (armL) s = s.replace('<g class="a-armL">', `<g class="a-armL" transform="rotate(${armL} 51 106)">`);
  // atributos só do protótipo web (data-*, role, aria-label, class) não servem ao react-native-svg
  s = s.replace(/\s(?:data-[a-z-]+|role|aria-label)="[^"]*"/g, '').replace(/\sclass="[^"]*"/g, '');
  return s;
}
