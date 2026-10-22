# Final approved receiver — vertical bars only

`comms-receiver.html` + `comms-receiver.css` + `comms-receiver.js` are the **actual source** for the approved visual prototype. All earlier files have been superseded.

In a browser, initialize with:

```js
const el = document.querySelector('#traveller-comms');
const receiver = new TravellerCommsReceiver(el, {onTranscriptComplete: () => console.log('one utterance completed')});
receiver.transmit({ch:'CH 11',type:'GROUND OPERATIONS',from:'CARGO TUG SEVEN',text:'Holding. Tell them there’s no hurry.'});
// A real playback controller chooses the next action only after the completion callback.
receiver.idle({keepLast:true}); // no speech; retain a readable message
receiver.idle();                // fades to open-band marker
receiver.destroy();             // on unmount
```

`preview.html` can be served along with the sibling files and `susadi-system.png` through any static local server. `../Traveller_Comms_Final_Live_Preview.html` is a directly openable inline-assets preview. Its controls **do not ship** to the production UI; the receiver has **no skip button** and the preview also has no next button.

The demo starts its own traffic loop for visual review; **DO NOT invoke `runDemo` in the app**. Production must have one scheduler owning multi-turn conversations, gap timing and cancellation. It passes arbitrary `{ch,type,from,text}` messages to this receiver. The waveform is text-driven simulation, not actual audio.

If porting to Vue: prefer lifecycle ownership by a component with a root ref and proper `onBeforeUnmount` cleanup; keep stable SVG gradient IDs unique if mounting duplicates; avoid running the renderer on SSR. Keep all visual transitions, CSS micro tower animation, SIG pinning, quiet hiss and reduced-motion behavior unchanged.
