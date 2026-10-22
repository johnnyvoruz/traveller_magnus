/**
 * Traveller Comms Receiver FINAL - bar waveform, calm chrome, independent tower broadcast + Beowulf.
 * Production API:
 *   const receiver = new TravellerCommsReceiver(element);
 *   receiver.transmit({ ch:'CH 03', type:'LOCAL APPROACH', from:'...', text:'...' });
 *   receiver.idle();
 *   receiver.destroy();
 * Feed it one transmission per scheduler tick; do not duplicate scheduling here.
 * The standalone preview starts its own demonstration only when explicitly called.
 */
(() => {
  const SAMPLES = [
    {ch:'CH 03',type:'LOCAL TRAFFIC',from:'SUSADI PORT CONTROL',text:'Free Trader Kestrel, this is Susadi Port Control. Maintain current vector. Cleared for approach, pad three.'},
    {ch:'CH 03',type:'LOCAL TRAFFIC',from:'FREE TRADER KESTREL',text:'Susadi control, Kestrel. Holding vector. Pad three confirmed.'},
    {ch:'CH 11',type:'GROUND OPERATIONS',from:'DOCKSIDE DISPATCH',text:'Cargo tug seven, hold short. We still have people in the loading cage.'},
    {ch:'CH 11',type:'GROUND OPERATIONS',from:'CARGO TUG SEVEN',text:'Holding. Tell them there’s no hurry. I only get paid by the hour.'},
    {ch:'CH 09',type:'LOCAL SECURITY',from:'PORT CONSTABLE SIX',text:'Control, can you confirm that lighter at berth nineteen has filed a crew list?'},
    {ch:'CH 09',type:'LOCAL SECURITY',from:'SUSADI CONTROL',text:'Constable six, negative. We’re chasing it now.'}
  ];

  // Traveller's original Free Trader Beowulf distress call: retained verbatim
  // in short, ordered fragments so the compact ticker never becomes a chat log.
  // This is a RECORDED ARCHIVE, not a fresh incident or adventure hook.
  const BEOWULF_QUOTE = 'This is Free Trader Beowulf, calling anyone.... Mayday, Mayday... we are under attack. main drive is gone.... turret number one not responding... Mayday... losing cabin pressure fast. calling anyone... please help.... This is Free Trader Beowulf... Mayday...';
  const BEOWULF_SEGMENTS = [
    'This is Free Trader Beowulf, calling anyone.... Mayday, Mayday... we are under attack.',
    'main drive is gone.... turret number one not responding...',
    'Mayday... losing cabin pressure fast. calling anyone... please help....',
    'This is Free Trader Beowulf... Mayday...'
  ];
  const BEOWULF_TRANSMISSIONS = BEOWULF_SEGMENTS.map((text) => Object.freeze({
    ch:'CH --',type:'ARCHIVE RELAY',from:'FREE TRADER BEOWULF',
    status:'PLAYBACK',band:'RECORDED SIGNAL',text
  }));
  // Rare deterministic discovery, NOT a random pool line. The application must
  // persist 'alreadyPlayed' across visits and reserve all four segments together.
  function shouldQueueBeowulf({campaignKey,hexKey,party,starport,alreadyPlayed=false}={}) {
    if(alreadyPlayed || !campaignKey || !hexKey) return false;
    if(party!=='inSystem' && party!=='docked') return false;
    if(!['A','B','C','D','E'].includes(String(starport||'').toUpperCase())) return false;
    return hashText(`${campaignKey}|${hexKey}|beowulf-legacy`) % 2048 === 0;
  }
  if(BEOWULF_SEGMENTS.join(' ')!==BEOWULF_QUOTE) throw Error('Beowulf original wording altered');
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const gauss = (x,m,s) => Math.exp(-.5*((x-m)/s)**2);
  const smoothstep = (a,b,v) => { const x=clamp((v-a)/(b-a),0,1); return x*x*(3-2*x); };
  // Smooth signed value noise: irregular like speech, continuous across frames.
  // Unlike per-frame random numbers, this cannot jitter or snap.
  const smoothNoise = (x) => {
    const n=Math.floor(x), f=x-n, v=f*f*(3-2*f);
    const h=(i)=>{let k=Math.imul(i^0x51ed270b,0x27d4eb2d);k=Math.imul(k^(k>>>15),0x85ebca6b);return ((k^(k>>>13))>>>0)/2147483647-1;};
    return h(n)*(1-v)+h(n+1)*v;
  };
  // Repeatable pseudo-random syllable envelopes. No real audio and no per-frame Math.random().
  const hashText = str => {
    let h=2166136261;
    for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),16777619);}
    return h>>>0;
  };
  const seededRandom = seed => () => {
    seed=(seed+0x6d2b79f5)|0;
    let t=Math.imul(seed^(seed>>>15),1|seed);
    t^=t+Math.imul(t^(t>>>7),61|t);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
  class TravellerCommsReceiver {
    constructor(node, options={}) {
      if (!node) throw new Error('A receiver root element is required');
      this.root=node;this.options=options;
      this.channel=node.querySelector('[data-trx-channel]');
      this.kind=node.querySelector('[data-trx-kind]');
      this.source=node.querySelector('[data-trx-source]');
      this.speaker=node.querySelector('[data-trx-speaker]');
      this.words=node.querySelector('[data-trx-words]');
      this.copy=node.querySelector('[data-trx-copy]');
      this.accessible=node.querySelector('[data-trx-a11y]');
      this.status=node.querySelector('[data-trx-status]');
      this.band=node.querySelector('[data-trx-band]');
      this.clock=node.querySelector('[data-trx-clock]');
      this.trace=node.querySelector('[data-trx-trace]');
      this.ghost=node.querySelector('[data-trx-ghost]');
      this.fill=node.querySelector('[data-trx-fill]');
      this.playhead=node.querySelector('[data-trx-playhead]');
      this.halo=node.querySelector('[data-trx-headhalo]');
      this.ticks=node.querySelector('[data-trx-ticks]');
      // Persistent signal envelope and scanner state survive mode changes.
      this.mode='idle';
      this.envelope=0;               // 0 = quiet carrier, 1 = live transmission
      this.speechActive=false;       // independent of receiving/idle UI mode
      this.activeWord=null;          // simulated vocal envelope for the current word
      this.utteranceCount=0;
      // Final approved rendering style is vertical bars only; no waveform toggle.
      this.root.dataset.waveform='bars';
      this.signalSeed=hashText('local-comms-noise');
      this.scanX=100;                // never reset on transmit/idle
      this.scanVelocity=17;          // pixels / second
      this.lastFrame=0;
      this.lastPaint=0;
      this.anim=null;this.dead=false;this.clockStart=performance.now();
      this.wordTimers=[];this.endTimers=[];this.playbackId=0;
      this.labelTimers=new Map();
      this.uiTransition=0;
      this.reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.populateTicks();
      this.boundFrame = (now) => this.frame(now);
      this.setMode('idle');
      this.frame(performance.now());
      this.clockInterval=window.setInterval(()=>this.tickClock(),1000);
    }
    populateTicks() {
      if(!this.ticks) return;
      const bits=[];
      for(let x=0;x<=700;x+=7){
        const prominent=x%35===0;
        bits.push(`M${x} ${prominent?6:13}V${prominent?37:30}`);
      }
      this.ticks.setAttribute('d',bits.join(' '));
    }
    tickClock() {
      if(this.dead)return;
      const total=Math.floor((performance.now()-this.clockStart)/1000);
      const hh=String(Math.floor(total/3600)).padStart(2,'0');
      const mm=String(Math.floor(total/60)%60).padStart(2,'0');
      const ss=String(total%60).padStart(2,'0');
      this.clock.textContent=`${hh}:${mm}:${ss}`;
    }
    setMode(mode, labels={}) {
      this.mode=mode;
      this.root.dataset.mode=mode;
      this.fadeLabel(this.status,labels.status ?? (mode==='receiving'?'RECEIVING':'MONITORING'));
      this.fadeLabel(this.band,labels.band ?? (mode==='receiving'?'CARRIER LOCK':'OPEN BAND'));
    }
    frame(now) {
      if(this.dead) return;
      if(this.reduced){
        // One accessible static state for motion-sensitive users.
        if(!this.lastPaint){
          this.lastPaint=now;
          this.draw(0);
        }
      } else if(!document.hidden){
        // Keep simulation time separate from wall time: no huge jumps after tab return.
        const dt=this.lastFrame ? clamp((now-this.lastFrame)/1000,0,.05) : 1/60;
        this.lastFrame=now;
        // Only the currently revealed word excites the radio. Pauses naturally dip.
        // The envelope keeps its previous value across word and mode boundaries.
        const target=this.speechLevel(now);
        const timeConstant=target>this.envelope?.043:.235;
        this.envelope += (target-this.envelope)*(1-Math.exp(-dt/timeConstant));
        // The scanner is a quiet, constant-speed instrument: no speech-linked surge.
        const desiredSpeed=28;
        this.scanVelocity += (desiredSpeed-this.scanVelocity)*(1-Math.exp(-dt/.75));
        // Continuous position: no mode-specific t * speed computation.
        this.scanX=(this.scanX+this.scanVelocity*dt)%700;
        // Paint at up to 60fps; CSS compositing handles the rest.
        if(now-this.lastPaint>=15){
          this.lastPaint=now;
          this.draw(now);
        }
      } else {
        // Do not accumulate offscreen time. Resume at the current scan position.
        this.lastFrame=now;
      }
      this.anim=requestAnimationFrame(this.boundFrame);
    }
    // Organic spoken-word energy; a word is several uneven overlapping syllable peaks.
    // It becomes zero in genuine inter-word or punctuation pauses, and after the last word.
    speechLevel(now){
      const word=this.activeWord;
      if(!this.speechActive || !word)return 0;
      const u=(now-word.start)/word.duration;
      if(u<0 || u>=1)return 0;
      let power=0;
      for(const peak of word.peaks){
        power+=peak.gain*gauss(u,peak.center,peak.width);
      }
      const edge=smoothstep(0,.065,u)*(1-smoothstep(.84,1,u));
      // A soft voiced flutter, never a fresh random value each frame.
      const fine=.91+.06*Math.sin(now*.038+word.seed)+.04*Math.sin(now*.071+word.seed*.37);
      return clamp(power*edge*fine,0,1);
    }
    // Smooth 2D value noise: each x-position has its own changing energy. It is
    // temporally coherent, so there is NO frame-to-frame randomness or twitch.
    // Shader-inspired procedural visuals, not a claim to reconstruct actual speech.
    noise2(x,y){
      const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi;
      const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
      const hash=(a,b)=>{
        let h=Math.imul(a^this.signalSeed,0x85ebca6b)^Math.imul(b+0x9e3779b9,0xc2b2ae35);
        h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);
        return ((h^(h>>>16))>>>0)/4294967295;
      };
      const a=hash(xi,yi)*(1-sx)+hash(xi+1,yi)*sx;
      const b=hash(xi,yi+1)*(1-sx)+hash(xi+1,yi+1)*sx;
      return a*(1-sy)+b*sy;
    }
    // Three correlated spatial scales give the billowing, irregular envelopes seen
    // in a voice visualizer. The current word sets ENERGY, never a special shape.
    field(x,time){
      const t=time*.001;
      return .51*this.noise2(x*.013+13.8,t*.79)+
             .31*this.noise2(x*.039-6.4,t*1.47)+
             .18*this.noise2(x*.124+24.2,t*2.53);
    }
    // Always render the vertical-bar waveform (approved final visual style).
    // Message text controls energy only: bars retain spatially coherent motion.
    draw(now){
      const width=700,center=21.5;
      const energy=this.reduced?0:this.envelope;
      const t=now;
      const strokes=[];
      for(let x=2;x<width-2;x+=4.6){
        const broad=this.field(x,t);
        const moving=this.noise2(x*.078+42.2,t*.0019);
        const swell=Math.pow(clamp((broad-.22)/.55,0,1),1.25);
        const texture=.65+.35*moving;
        const taper=.23+.77*smoothstep(0,38,x)*(1-smoothstep(662,700,x));
        const floor=.26+.23*this.noise2(x*.044,t*.00043);
        const height=floor+energy*(1.5+18.8*swell*texture)*taper;
        strokes.push(`M${x.toFixed(1)} ${(center-height).toFixed(2)}V${(center+height).toFixed(2)}`);
      }
      this.trace?.setAttribute('d',strokes.join(''));
      this.ghost?.setAttribute('d','');
      this.fill?.setAttribute('d','');
      if(this.trace){this.trace.style.strokeWidth='2.5';this.trace.style.opacity='.93';}
      // The scanner stays decoupled from the sound: continuous, subdued, faded
      // at both ends so its wrap is visually invisible.
      const pos=this.scanX;
      const edgeFade=smoothstep(0,44,pos)*(1-smoothstep(656,700,pos));
      if(this.playhead){
        this.playhead.setAttribute('x1',pos.toFixed(2));
        this.playhead.setAttribute('x2',pos.toFixed(2));
        this.playhead.style.strokeOpacity=(.23*edgeFade).toFixed(3);
      }
      if(this.halo){
        this.halo.setAttribute('x',(pos-9).toFixed(2));
        this.halo.style.opacity=(.09*edgeFade).toFixed(3);
      }
    }
    // Crossfade a label's text, never its surrounding instrument frame.
    fadeLabel(node, text) {
      if (!node) return;
      const previous=this.labelTimers.get(node);
      if (previous) clearTimeout(previous);
      const requested=String(text);
      if(node.textContent===requested){
        node.style.opacity='1';
        this.labelTimers.delete(node);
        return;
      }
      if(this.reduced){node.textContent=requested;node.style.opacity='1';return;}
      node.style.opacity='0';
      const timer=window.setTimeout(()=>{
        if(this.dead)return;
        node.textContent=requested;
        requestAnimationFrame(()=>{node.style.opacity='1'});
        this.labelTimers.delete(node);
      },245);
      this.labelTimers.set(node,timer);
    }
    clearTimers() {
      this.wordTimers.forEach(clearTimeout);
      this.endTimers.forEach(clearTimeout);
      this.wordTimers=[];this.endTimers=[];this.playbackId++;
      this.speechActive=false;this.activeWord=null;
      this.root.dataset.speaking='false';
      this.uiTransition++;
    }
    later(fn,ms,group='word') {
      const t=setTimeout(fn,ms);
      (group==='word'?this.wordTimers:this.endTimers).push(t);
      return t;
    }
    // Transition the entire text field through invisibility before changing its content.
    // No DOM clearing, changing callsigns, or repositioning is visible to the user.
    swapCopy(render, current) {
      const copy=this.copy;
      if(!copy)return;
      if(this.reduced){render();copy.style.opacity='1';return;}
      copy.style.opacity='0';
      copy.style.transform='translateY(2px)';
      copy.style.filter='blur(1.2px)';
      this.later(()=>{
        if(current!==this.playbackId)return;
        render();
        requestAnimationFrame(()=>{
          if(current!==this.playbackId)return;
          copy.style.opacity='1';
          copy.style.transform='translateY(0)';
          copy.style.filter='blur(0)';
        });
      },440,'end');
    }
    transmit(msg) {
      if(this.dead)return;
      this.clearTimers();
      const current=this.playbackId;
      // The envelope and scanner are never reset. A new transmission simply
      // raises the signal over the existing noise floor.
      this.setMode('receiving',{status:msg.status,band:msg.band});
      const source=String(msg.from??'UNIDENTIFIED');
      const body=String(msg.text??'');
      if (!body.trim()) { this.idle(); return; }
      // Different takes have different inflections, while all motion stays continuous.
      const rand=seededRandom(hashText(`${source}|${body}`)^(++this.utteranceCount*0x9e3779b9));
      this.fadeLabel(this.channel,String(msg.ch??'CH --'));
      this.fadeLabel(this.kind,String(msg.type??'LOCAL TRAFFIC'));
      this.fadeLabel(this.source,source);
      this.channel.title=String(msg.ch??'CH --');
      this.kind.title=String(msg.type??'LOCAL TRAFFIC');
      this.source.title=source;
      const done=()=>{
        if(current!==this.playbackId)return;
        this.accessible.textContent=`${source}: ${body}`;
        this.options.onTranscriptComplete?.();
      };
      this.swapCopy(()=>{
        if(current!==this.playbackId)return;
        this.speaker.textContent=source;
        this.accessible.textContent='';
        this.words.replaceChildren();
        if(this.reduced){this.words.textContent=body;done();return;}
        const caret=document.createElement('span');
        caret.className='trx-caret';caret.setAttribute('aria-hidden','true');
        this.words.append(caret);
        const tokens=body.trim().split(/\s+/).filter(Boolean);
        let idx=0;
        const reveal=()=>{
          if(current!==this.playbackId)return;
          if(idx>=tokens.length){
            // Final word remains visible; only the carrier energy starts falling.
            this.speechActive=false;this.activeWord=null;
            this.root.dataset.speaking='false';
            caret.remove();done();return;
          }
          const token=tokens[idx++];
          const word=document.createElement('span');word.className='trx-word';word.textContent=token+(idx<tokens.length?' ':'');
          this.words.insertBefore(word,caret);

          // Word length and syllables shape timing. No robotic fixed-word cadence.
          // Unicode letters and numbers: supports generated alien-English names,
          // accented place names, and numeric flight clearances without special cases.
          const letters=token.replace(/[^\p{L}\p{N}]/gu,'');
          const vowels=(letters.match(/[aeiouy]+/gi)||[]).length;
          const syllables=clamp(vowels||1,1,4);
          const emphasis=letters.length>=7 ? 1.08 : 1;
          const duration=clamp(135+letters.length*13+(rand()-.5)*54,160,415);
          const peaks=[];
          for(let n=0;n<syllables;n++){
            peaks.push({
              center:clamp((n+.52+(rand()-.5)*.30)/syllables,.13,.86),
              width:clamp(.24/syllables+(rand()-.5)*.09,.085,.27),
              gain:emphasis*(.62+rand()*.55)
            });
          }
          this.activeWord={start:performance.now(),duration,peaks,seed:rand()*12,letters:letters.toLowerCase()};
          this.speechActive=true;this.root.dataset.speaking='true';
          // The trace is driven by the word timeline, not bands changing in unison.
          const pause=/\.{3,}[\u201d\"']?$/.test(token)?720+rand()*320:
            /[.!?][\u201d\"']?$/.test(token)?400+rand()*220:
            /[,;:][\u201d\"']?$/.test(token)?165+rand()*165:25+rand()*65;
          // Start the next word only after this word would have been spoken.
          // For the final word, wait for its visual reveal (230ms), then release.
          const delay=idx===tokens.length?Math.max(255,duration):duration+pause;
          this.later(reveal,delay);
        };
        this.later(reveal,200);
      },current);
    }
    idle(opts={}) {
      if(this.dead)return;
      const keepLast=!!opts.keepLast;
      this.clearTimers();
      this.setMode('idle');
      // Retain the last transmission through the slower signal release.
      if(!keepLast){
        const current=this.playbackId;
        this.fadeLabel(this.source,'—');
        this.swapCopy(()=>{
          if(current!==this.playbackId)return;
          this.speaker.textContent='OPEN BAND';
          this.accessible.textContent='';
          this.words.replaceChildren();
          const label=document.createElement('span');
          label.className='trx-idle-label';
          label.textContent='Awaiting transmission';
          this.words.append(label);
        },current);
      }
    }
    destroy() {
      this.dead=true;
      this.clearTimers();
      this.labelTimers.forEach(clearTimeout);
      this.labelTimers.clear();
      clearInterval(this.clockInterval);
      cancelAnimationFrame(this.anim);
    }
  }
  function runDemo(root,opts={}){
    const receiver=new TravellerCommsReceiver(root);
    let index=0,timers=[],generation=0;
    const schedule=(fn,ms)=>{timers.push(setTimeout(fn,ms))};
    function clear(){timers.forEach(clearTimeout);timers=[]}
    function playBeowulf(){
      clear();const take=++generation;
      let section=0;
      function transmitSection(){
        if(take!==generation)return;
        receiver.options.onTranscriptComplete=()=>{
          if(take!==generation)return;
          if(section+1<BEOWULF_TRANSMISSIONS.length){
            schedule(()=>{section++;transmitSection()},1450);
          }else{
            schedule(()=>receiver.idle({keepLast:true}),1900);
            schedule(()=>receiver.idle(),5900);
            schedule(()=>{index=(index+1)%SAMPLES.length;play()},10000);
          }
        };
        receiver.transmit(BEOWULF_TRANSMISSIONS[section]);
      }
      transmitSection();
    }
    function play(){
      clear();const take=++generation, item=SAMPLES[index];
      // Timing is completion-driven: the demo never quiets an unfinished sentence.
      receiver.options.onTranscriptComplete=()=>{
        if(take!==generation)return;
        schedule(()=>receiver.idle({keepLast:true}),1150);
        schedule(()=>receiver.idle(),3250);
        schedule(()=>{index=(index+1)%SAMPLES.length;play()},6850);
      };
      receiver.transmit(item);
    }
    if(opts.still){
      receiver.transmit(SAMPLES[3]);receiver.clearTimers();
      receiver.words.textContent=SAMPLES[3].text;
      receiver.accessible.textContent=SAMPLES[3].text;
    } else if(opts.idle){receiver.idle()}
    else schedule(play,650);
    function custom(msg){
      clear(); const take=++generation;
      receiver.options.onTranscriptComplete=()=>{
        if(take!==generation)return;
        schedule(()=>receiver.idle({keepLast:true}),1200);
        schedule(()=>receiver.idle(),3800);
      };
      receiver.transmit(msg);
    }
    return {receiver,playBeowulf,custom,quiet:()=>{clear();generation++;receiver.idle()},play,stop:()=>{clear();receiver.destroy()}};
  }
  window.TravellerCommsReceiver=TravellerCommsReceiver;
  window.TravellerCommsDemo={runDemo,samples:SAMPLES};
  window.TravellerCommsEasterEgg=Object.freeze({id:"beowulf-original",quote:BEOWULF_QUOTE,transmissions:BEOWULF_TRANSMISSIONS,shouldQueue:shouldQueueBeowulf});
})();
