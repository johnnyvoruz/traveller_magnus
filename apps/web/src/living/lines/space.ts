/** Additional ambient space/science chatter. No party condition: these are other
 * crews heard while viewing the system, not transmissions addressed to the player.
 * Asset-specific groups require known facilities or bodies. IDs are permanent.
 */
import { ChatterLine, type ChatterLineData, type ChatterWhenData } from '@voyage/shared';

function group(start: number, when: ChatterWhenData, texts: string[]): ChatterLineData[] {
    return texts.map((text, i) => ChatterLine.parse({
        id: `ship-${start + i}`, category: 'ship', voice: 'crew', text,
        when: { pop: { min: 1 }, ...when },
    }));
}

export const spaceLines: ChatterLineData[] = [
    ...group(354, {}, [
        'Our new navigator just watched the sunrise come up under her boots on the exterior camera. We are saving that recording for her.',
        'The departing ship caught the sunlight all along its radiator fins. For a second it looked like a city turning its lights on.',
        'Our drive plume is washing out the aft camera. Engineering calls it perfectly normal. The passenger lounge calls it spectacular.',
        'Star tracker has its fix. Someone in the lounge asked us to put the constellation lines back on; they were halfway through finding home.',
        'We caught a glint from the other ship before its hull resolved. The children aboard have been waving at that pixel for ten minutes.',
        'External camera feed is available to the passenger cabins. Yes, that bright curve is the actual horizon. No, we have not enhanced the colour.',
        'The night watch recorded the sun coming around our hull. Forward camera got the dawn; aft camera got the engineer trying to clean the lens.',
        'We have matched the observation camera to the ship clock. Anyone making a time-lapse can now watch breakfast disappear at the correct speed.',
    ]),
    ...group(362, {}, [
        'Spectrometer team here. That violet line is real. We have it on two instruments, and the junior researcher has forgotten her tea exists.',
        'The cosmic-ray counter has been patched into the music software again. A surprisingly good rhythm. Please keep it off the duty speakers.',
        'Our sensor ghost turned out to be sunlight off our own probe. The probe has been congratulated on an excellent first discovery.',
        'Stellar observation complete. We caught the flare right through its rise and decay. The lab wants the raw frames before anyone makes a screensaver.',
        'The interferometer finally held phase through the whole observation. Very little to look at, apparently. The science deck sounds like they won a championship.',
        'Probe return received. There is a whole landscape in those last few packets. We are letting the surface team choose which image goes in the lounge.',
        'The grav plate calibration has given us our deck back. Someone filmed a bead of coffee hanging over the cup. It is already the crew message icon.',
        'Our radiation camera caught a particle track branching across the detector. Print requested for the lab wall. Actual exposure logs are filed separately.',
    ]),
    ...group(370, { gasGiants: { min: 1 } }, [
        'Gas giant survey images are coming off the recorder. The cloud bands fill the whole display. We have lost the off-watch crew to the viewing room.',
        'We have lightning in the gas giant night-side frames. Tiny flashes on the image, enormous distances on the scale. Sending the annotated copy.',
        'Our gas giant sampling run is filed. The youngest crew member has named every cloud feature in the camera strip. The science team is keeping one of the names.',
        'The giant is coming into sunlight on the forward feed. You can follow the shadow line right across the cloud tops. Galley service may run a minute late.',
        'Gas giant spectra received. The pale band and the dark band have different signatures. We finally have something to put beside the pretty pictures.',
        'The scoop camera recorded the whole run. Engineering has the flow data; the lounge has requested the version with the sound turned down.',
        'Our probe has sent its first pressure profile from the gas giant. Beautiful data. The hull engineers are admiring it from a very comfortable distance.',
        'Gas giant watch, our radio array recorded the same burst as yours. Keeping the full trace. The navigator says it sounds like someone dragging a chair across the universe.',
    ]),
    ...group(378, { belts: { min: 1 } }, [
        'Survey drone has finished tumbling around the sample rock. The model looks like a potato until you switch on the mineral map. Then everyone gets interested.',
        'The belt sample has tiny metallic crystals along the fracture. Our geologist has been turning it under the lamp for most of the watch.',
        'Prospecting array has separated two returns we thought were one. A pair of rocks travelling together. The crew has immediately given them married names.',
        'The sample carousel is secured. There is dust older than our homeworld in those little compartments, and someone still wants the lids colour-coded.',
        'Our drone put the scale marker beside the boulder. The rock we thought was hand-sized is larger than the launch. Updating the collection plan.',
        'Belt mapping complete for this pass. Every dot has a track now. The apprentice keeps zooming out to see how much space there is between them.',
        'The mineral scan and the assay agree. We are celebrating with the good coffee. Nothing else aboard has changed, but it feels like a better ship.',
        'Sample return drone is latched. It brought back the target fragments and an excellent photograph of its own collection claw.',
    ]),
    ...group(386, { highport: true, starport: ['A', 'B', 'C', 'D'] }, [
        'The highport observation gallery has our departure on its display. Somebody has put a little waving hand beside our transponder label.',
        'Dockside courier drone delivered the birthday cake perfectly level. Our grav deck took it from there. Candles will remain strictly decorative.',
        'Highport traffic is reflected all the way down the docking collar. Our new crew member says it looks like standing inside a necklace.',
        'The hull inspection drones have finished their mosaic. It is the first time I have seen the whole ship without a diagram. She cleans up rather well.',
        'The service arm has unfolded outside the cabin port. Our passenger thought it was another ship arriving. Fair enough; it is almost as long as ours.',
        'Highport night-side camera is on the lounge feed. Docking lights, black sky, and the planet filling the bottom of the frame. Nobody has asked for a film yet.',
        'The courier drones have formed a very neat queue at our lock. The one carrying the flowers appears to have priority over the engine spares.',
        'Pressure bridge connected. The station air smells faintly of the hydroponics deck. Our crew has voted to take the long way to the customs desk.',
    ]),
];
