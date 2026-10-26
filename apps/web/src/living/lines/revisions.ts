/** Editorial revisions for the receiver; the imported reference corpus stays intact.
 * Keep IDs stable so revisions respect existing playback history. Space advisories
 * replace surface-only conditions as well as text: vacuum does not exclude radiation
 * or electromagnetic interference. These are ambient fiction, not simulated hazards.
 */
import type { ChatterLineData } from '@voyage/shared';

export const textRevisions: Readonly<Record<string, string>> = {
    'control-024': '{ship}, hold the west approach. An orbital assembly section is being transferred across the corridor. Clearance follows when it is secured.',
    'control-033': 'Your transponder return is clean. The duplicate on the display is a reflection from the hangar shielding.',
    'control-034': 'Negative on the second berth. A cargo sled has locked itself to the deck. Maintenance is negotiating with it.',
    'control-045': '{ship}, hold clear of the pad until the cargo pod is recovered. We will call you when the marker is unobstructed.',
    'control-051': '{ship}, the landing beacon is running its calibration cycle. Hold clear; we will send a verified fix when it finishes.',
    'control-056': '{port} to the pilot circling us: that second landing marker is your own transponder reflected off the storage dome.',
    'control-066': 'The landing-fee terminal is rebooting after a power transient. Keep the arrival receipt; accounts will catch up.',
    'control-068': '{port}, answering. Landing marker is live. Bring your own hull-service equipment; ours fits the relay mast and very little else.',
    'market-020': 'The last haulier charged us for waiting through a beacon recalibration. Next contract, we are agreeing the standby rate first.',
    'market-064': 'Your cargo sled wants a software licence before it will release the load. Show me the manual latch.',
    'market-100': 'No storage dome here. Keep the cargo aboard until your customer confirms a receiving cradle.',
    'market-133': 'Local sale: one hull-mounted cargo arm. Service log included. Check the mounting dimensions before you send a deposit.',
    'market-136': 'Trading a serviced transfer pump and a cargo sled. The sled needs a new power coupling; the pump is ready to fit.',
    'weather-002': 'The crawler has left charged dust across the sensor housings. Cleaning crew is waiting for the array to discharge.',
    'weather-009': 'Surface team reports fine regolith in the rover actuator seals. The dust gets into everything except the sample collector.',
    'weather-016': 'Exterior sampler readings agree with the orbital survey. Keep the respirators on; a clean signal is not clean air.',
    'weather-021': 'Landing array calibration complete. The elevated sensor has stopped reporting the maintenance drone as incoming traffic.',
    'weather-027': 'Habitation intake sensors have flagged a change in the local mix. Scrubber cartridges are being checked against the new spectrum.',
    'weather-040': 'The surface cameras have lost contrast. Lidar returns remain clean; the survey team is comparing both feeds.',
    'weather-045': 'A contamination plume is crossing the service lock sensors. Exterior teams are using the sealed transfer passage.',
    'weather-058': 'Electrostatic grit is collecting around the lower pad contacts. Keep the service covers sealed until the cleaning cycle finishes.',
    'weather-064': 'The gas-processing plant is recalibrating its spectrometers. Visiting crews, use the posted atmosphere analysis until the new one is verified.',
    'weather-070': 'The cargo arm contacts failed their corrosion check. The assembly is isolated until maintenance signs it back into service.',
    'weather-109': 'Orbital hydrology has revised the collection map. The promising return was mineral reflectance. The survey crew would appreciate fewer jokes.',
    'weather-111': 'Surface-fluid survey team requests the latest depth scan before lowering the sampling rig.',
    'weather-112': 'The surface transfer gantry is back online. Load sensors are being checked before the next cargo pod crosses.',
    'weather-113': 'Orbital bathymetry has added a shallow ridge to the coastal chart. Surface crews are checking the landing coordinates against it.',
    'weather-114': 'Surface sampling team, keep the probe tether clear of the intake. The reel controller cannot distinguish a snag from a very interesting reading.',
    'weather-116': '{world} ocean survey relay is sending duplicate timestamps. Keep the raw returns until the clock correction arrives.',
    'weather-117': 'Thermal sensors on the sampling pod are back within tolerance. The ocean team can resume instrument checks.',
    'weather-118': 'The seabed survey drones are uploading their tracks. Leave the receiver on; the detailed map is behind the position fixes.',
    'weather-119': 'The water-processing intake has a new salinity profile. Transfer crews, check the batch tags before connecting the tanks.',
    'weather-120': 'Surface reflections are confusing the optical tracker. The survey crew is comparing lidar and radar before accepting a fix.',
    'weather-121': 'The floating {world} sampling platform is checking its inertial reference. Transfers resume after the motion solution is verified.',
    'weather-122': 'Ocean relay service complete. The pressure housings passed inspection, and the technicians would like their diagnostic drone back.',
    'weather-124': '{world} ocean survey requests transponder checks from the surface teams. One sampling pod is still identifying itself as its parent ship.',
    'weather-125': 'The orbital depth scan and the submerged probe disagree. Keep both datasets; the science team wants to work out why.',
    'weather-127': 'The emergency flotation drill is complete. Recovery drones accounted for, beacon batteries on charge.',
    'ship-047': '{ship} to gas giant watch. Charged-particle readings are above our survey baseline. Sending the trace for comparison.',
};

export const spaceWeatherRevisions: Readonly<Record<string, string>> = {
    'weather-031': '{world} space weather watch. Solar flare monitoring continues; the latest particle readings are in the public telemetry packet.',
    'weather-032': 'The stellar monitor caught a brief flare. Sensor teams are flagging the affected exposures before the next observation run.',
    'weather-034': 'Electromagnetic interference on the survey band. The backup receiver has a cleaner trace; calibration team is comparing the feeds.',
    'weather-035': 'The radiation badge reader is back online. Exterior crews, upload your exposure logs with the equipment return.',
    'weather-036': 'Quiet interval on the particle monitor. The observatory is getting its calibration frames while the background stays steady.',
    'weather-037': '{world} sensor watch. The spike on the wideband receiver was a nearby drive test. The stellar monitor shows no matching event.',
    'weather-038': 'Exterior service drones are returning for charge checks. The last particle burst left a few sensors needing a reset.',
    'weather-039': 'The relay has corrected a timing error after a burst of interference. Navigation packets are being verified before release.',
    'weather-042': 'Dosimeter checks complete. The exterior team is closing its work log, and someone has drawn a smile on the return scanner.',
    'weather-049': '{world} orbital sensor watch. Radiation counters disagree by one calibration step. Use the higher reading while we check the reference.',
    'weather-050': 'The long-exposure camera has picked up particle tracks again. Lovely patterns, says the navigator. Less lovely, says the survey team.',
    'weather-052': 'Solar monitor telemetry restored. The gap was in the relay cache; the instruments kept recording throughout.',
    'weather-053': 'Antenna diagnostics are complete. That hiss was electromagnetic pickup from our own service unit. We have moved it.',
    'weather-054': 'The external sensor covers are open for calibration. Please leave the cleaning drone parked until the exposure sequence finishes.',
    'weather-089': '{world} sensor bulletin. Stellar background readings are steady. The observation team has requested one uninterrupted cup of tea.',
};

/**
 * Lines whose words belong to another voice than the corpus gave them. ship-037 reads "{ship}, port control.
 * Sorry, wrong channel.", so the port's office sends it, not the roster ship (Johnny 2026-10-19 17:01, question 166;
 * answered again as recommended 2026-10-22 20:08). The text and the id stay as they were.
 */
export const voiceRevisions: Readonly<Record<string, ChatterLineData['voice']>> = {
    'ship-037': 'control',
};

export function reviseReceiverLine(line: ChatterLineData): ChatterLineData {
    const voiced = voiceRevisions[line.id];
    const spaceText = spaceWeatherRevisions[line.id];
    if (spaceText) return { ...line, text: spaceText, when: { pop: { min: 1 } }, weight: 0.6 };
    const text = textRevisions[line.id];
    const revised = text ? { ...line, text } : line;
    return voiced ? { ...revised, voice: voiced } : revised;
}
