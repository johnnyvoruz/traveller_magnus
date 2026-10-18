/** Authored routine traffic. Conditions are editorial filters, not RPG rules.
 * Polity codes match chart metadata, never names, UWP or assumed crew species.
 * Keep each group and its explicit IDs stable for persisted listening history.
 */
import { ChatterLine, type ChatterLineData, type ChatterWhenData } from '@voyage/shared';

function group(start: number, when: ChatterWhenData, texts: string[]): ChatterLineData[] {
    return texts.map((text, i) => ChatterLine.parse({
        id: `ship-${start + i}`, category: 'ship', voice: 'crew', text,
        when: { pop: { min: 1 }, party: ['inSystem', 'docked'], ...when },
    }));
}

export const flavorLines: ChatterLineData[] = [
    ...group(200, { allegiance: ['Im'] }, [
        'The Imperial registry has our new owner and our old paint scheme. Yes, the green one. Still green under the patches.',
        'Imperial mail sacks counted and seals checked. Personal parcels are in the other locker. Please leave those with the names facing out.',
        'Our registry copy is on its way over. The Imperial seal is legible; the coffee stain is entirely ours.',
        'That freight docket uses Imperial dates. The galley roster uses local days. This explains the second breakfast, but does not excuse it.',
    ]),
    ...group(204, { allegiance: ['As'] }, [
        'The clan name goes in the consignee field. My name goes under delivery contact. Yes, both are needed on this copy too.',
        'Our translator has rendered the berth charge as a gift. Please send the original figures before anyone accepts anything.',
        'Please leave the clan seal visible when you wrap that pallet. We spent most of the last unloading looking for it.',
        'The greeting was received with thanks. Our cargo representative will handle the weights. You can use the short form of my name on the radio.',
    ]),
    ...group(208, { law: { max: 2 } }, [
        'Payment on the tally we both signed. I like you well enough, but I am not counting those crates a third time.',
        'Anyone taking the next cargo run down? We have two empty containers to return. They nest if you lean on the bent one.',
        'Put your own mark on the loaned coupling. Half the ships here have the same one and everyone remembers lending theirs.',
        'We settled the handling charge between crews. Send the receipt anyway; our accountant is less relaxed about these things.',
    ]),
    ...group(212, { law: { min: 9 }, starport: ['A', 'B', 'C', 'D'] }, [
        'Manifest resubmitted. Same cargo, same mass, correct signature box this time.',
        'Crew identities confirmed. The relief engineer is on the second page. There is always a second page.',
        'We have the inspection acknowledgment. Please confirm you have our acknowledgment of it, then I can close this screen.',
        'Seal numbers read back correctly. The last digit is eight; that label has spent a week against a coolant pipe.',
    ]),
    ...group(216, { atm: { max: 1 } }, [
        'Outside work is finished. Counting tools before we cycle back in. The little socket is clipped to my left glove.',
        'Fresh seals are in the clean locker. Do not put the old ones back in their wrappers; someone did that last shift.',
        'Surface crew, your spare suit pack is aboard. We marked the charged one with tape as well as the indicator.',
        'The surface dust is on the outer bags. Leave those outside the pressure door and pass the clean cases through.',
    ]),
    ...group(220, { atm: { in: [2, 3, 4, 7, 9] } }, [
        'Surface filters are bagged separately from the cabin stock. Read the labels; they fit the same housing.',
        'We have replacement mask straps in the tool case. The filters arrived yesterday, the straps took the scenic route.',
        'Ground party back aboard. Used breathing gear is tagged for service. Please do not clear the tags to tidy the locker.',
        'Surface kit checked. Spare cartridges are with the driver, not under the overnight bags this time.',
    ]),
    ...group(224, { hydro: { max: 1 } }, [
        'Wash water is back in the recovery tank. Whoever fitted the new strainer, the galley sends its thanks.',
        'Our water containers are for return, not disposal. The scuffed blue ones. They were scuffed when we bought them.',
        'Surface delivery includes the replacement pump seals. Small packet, large amount of paperwork.',
        'We can take the empty water tanks on the return leg. Drain them properly; the last lot sloshed all the way up.',
    ]),
    ...group(228, { hydro: { min: 9 }, atm: { in: [5, 6, 8] } }, [
        'The boat crew has our freight tally. Waterproof copy this time. Last trip they returned something resembling soup.',
        'Surface pickup is packed in sealed cases. Please keep the flotation collars with them; those are on the return inventory.',
        'Salt on the surface gear again. We will rinse it before stowing. Yes, including the cargo sled contacts.',
        'Our surface contact is aboard the tender. Listen for the engine noise; the handset picks up everything except his first word.',
    ]),
    ...group(232, { size: { max: 2 } }, [
        'Tie the empty cases down too. Light cargo is still cargo when someone opens the wrong hatch.',
        'Surface crew requests smaller bundles. They weigh very little here, but they still do not fit through the door.',
        'That cargo pod needs a tether, not another person leaning on it. We brought two spares.',
        'Ground handling complete. We are bringing back all the straps, including the one that took the long way round.',
    ]),
    ...group(236, { pop: { min: 9 }, starport: ['A', 'B'] }, [
        'Our cargo slot is confirmed. Crew change is on a different booking. Please stop putting our engineer on the pallet list.',
        'Third shift has the unloading tally. Second shift has our thermos. We would appreciate both coming back.',
        'Passenger bags counted. One of the identical grey cases is ours. It has the identical grey repair tape on it.',
        'We have been assigned a later service slot. Enough time for a meal, apparently. We are testing that claim.',
    ]),
    ...group(240, { pop: { min: 1, max: 3 }, starport: ['D', 'E'] }, [
        'The ground contact is also driving the loader. Give them a moment to park before calling again.',
        'We brought the spare bearing down. Whoever meets us, bring the old one; the part number was hard to read.',
        'Last delivery is for the same family as the first. We could have saved a trip if anyone had mentioned that.',
        'Surface crew has gone for a meal. Leave the tally on our channel; someone will read it when the kettle is done.',
    ]),
    ...group(244, { tl: { max: 5 } }, [
        'We have a paper copy for the surface consignee. The carbon sheet is still in it; mind your sleeves.',
        'Their workshop can make the bracket from a drawing. Send dimensions, not a model file.',
        'Ground delivery counted by hand. It agrees with the ship tally. That surprised our tally more than it surprised theirs.',
        'Bring the printed parts list down with you. The annotated one. Those pencil notes are the useful bit.',
    ]),
    ...group(248, { tl: { min: 12 } }, [
        'Cargo tags synchronized. The system has helpfully identified our lunch as an unmanifested consumable.',
        'Workshop accepted the scan. They still want the worn part back. Apparently the scan does not tell them who forced it.',
        'The maintenance assistant has signed off the repair. Our engineer is making it explain the last line.',
        'Berth service downloaded our connector profile. We are sending a photograph as well. The profile predates the adapter.',
    ]),
    ...group(252, { tradeCodes: ['Ag'] }, [
        'Produce is aboard and the empty trays are stacked for return. Nobody sit on them; they charge us for the corners.',
        'Please send the harvest lot numbers with the weights. Our buyer knows the difference even if the scanner does not.',
        'The last pallet is seed stock, separate consignee. Keep the grower labels facing out.',
        'Cold boxes are running on ship power now. You can have your cable back. Good cable, that.',
    ]),
    ...group(256, { tradeCodes: ['In'] }, [
        'Machine castings secured. The packing timber is coming back with us; it has almost as much paperwork as the castings.',
        'Factory tally agrees with ours. The extra crate is the lifting jig. We would like to keep that until unloading.',
        'Replacement tooling loaded. Please tell the receiving shift that the grease is meant to be there.',
        'Our work clothes are bagged by the lock. The metal dust stays out of the cabins this trip.',
    ]),
    ...group(260, { highport: true, starport: ['A', 'B', 'C', 'D'] }, [
        'Highport laundry has sent our coveralls to the lighter. If the lighter calls, we are the crew in the borrowed shirts.',
        'Docking collar inspection signed off. The service tech left a lamp behind; we have it by the inner hatch.',
        'The lighter has our surface freight. We kept the kettle, since that caused some confusion last time.',
        'Highport stores, we received the replacement bunk catches. The night watch would like to thank you personally.',
    ]),
    ...group(264, { belts: { min: 1 } }, [
        'Our belt-work sample cases are sealed. Keep the assay slips with the cases; the rocks all look much the same to me.',
        'Belt survey gear stowed. The antenna folds if you release the second catch. There is a second catch.',
        'The empty ore containers have been swept. Check the corners before you mark them clean.',
        'Our belt-work gloves are in the repair bag. Worth patching; they finally fit.',
    ]),
    ...group(268, { gasGiants: { min: 1 } }, [
        'Skimming gear service logged. The replacement mesh is in the long case, not the one everyone keeps opening.',
        'Fuel sampling complete aboard. Labels on the bottles, please. Writing the results on your glove is not a record.',
        'We are stowing the scoop inspection kit. Whoever borrowed the mirror, it has its own padded slot.',
        'Fuel processor filters changed. The old set is bagged for disposal, not for somebody to decide they look usable.',
    ]),
    // Public naval traffic: routine service and crew life, never tactical traffic.
    ...group(272, { bases: ['N'], starport: ['A', 'B', 'C', 'D'] }, [
        'Naval liberty launch checking in. All passengers aboard, including the two who went back for flowers.',
        'Naval liaison, our visitors have finished the ship tour. The engineering students would like another hour in the machinery spaces.',
        'Supply tender here. Fresh fruit received in good order. Please pass our thanks to the growers.',
        'Naval training launch requesting the next available practice slot. Instructor aboard; the cadets will make their own calls.',
        'Public liaison, the ship band can bring its own sound equipment. We will need transport for the drums.',
        'Naval stores, the library exchange is ready for collection. The wardroom has added a box of books for the next crew.',
        'Liberty launch to the duty desk. The shore team won their match. We have the team, the kit, and a rather large cup.',
        'Naval tender acknowledging the civilian traffic advisory. We will arrange our departure with control. Thank you for the heads-up.',
    ]),
    ...group(280, { bases: ['S'], starport: ['A', 'B', 'C', 'D'] }, [
        'Scout crew to the base desk. Survey copies are ready for handover. We included the photographs this time; some of them are rather good.',
        'Scout stores, the field kit worked beautifully. We have a few notes for whoever designed the folding sample rack.',
        'Scout launch checking in with two returning surveyors. They have been discussing the same rock since breakfast.',
        'Base library, our scout crew would like the updated field catalogue before departure. The illustrated edition, if you have it.',
        'Scout crew here. We can bring the school packet down with our supplies. The students sent us questions on our last visit.',
        'Our survey crew has a full set of sky images for the base archive. The navigator has asked for a print for her cabin.',
        'Scout stores, the borrowed instruments are calibrated and packed. We left the settings sheet with the cases for the next crew.',
        'Scout crew to the duty desk. Our relief has arrived. We are handing over the survey notes over lunch.',
    ]),
    // Visiting research crews do not imply a local university or research base.
    ...group(288, { starport: ['A', 'B', 'C', 'D'] }, [
        'Research launch reporting the sample transfer complete. The lab team is already arguing over who gets the first instrument slot.',
        'Laboratory ship requesting a copy of the public traffic log for our observation timestamps. The instruments use ship time.',
        'Our lab has finished the calibration run. Beautiful clean readings. We are keeping this set as the reference.',
        'Research crew to the delivery launch. The cases marked LIVE CULTURES stay upright. Someone will meet you at the lock.',
        'Science team here. The open lecture recording is ready to copy. We included the questions from the school group.',
        'Laboratory ship to the service crew. Your vibration measurements solved it. We can finally use the long exposures.',
        'Our research students have their first usable dataset. If you hear cheering in the background, that is why.',
        'Research launch checking in. Instruments secured, sample count agreed, and everyone has remembered their personal bags.',
    ]),
    ...group(296, { starport: ['A', 'B', 'C', 'D'] }, [
        'Merchant crew to the loading team. That is the last crate. A clean tally and time for lunch; good work, everyone.',
        'Our buyer has accepted the samples. Keep one of the blue labels for the order; that is the batch they want.',
        'Freight handover complete. Same crew next visit? Good. We will bring the containers packed the way you suggested.',
        'The new apprentice just balanced our cargo tally on the first attempt. We are letting him make this call.',
        'Merchant launch returning with the signed receipts. And the recipe, before anyone asks. The cook wrote it out for us.',
        'Our regular consignee remembered the captain\'s birthday. Please handle the small cake box as carefully as the instruments.',
        'The outward hold is booked. We have room for the returnable packing if you can have it ready with the last load.',
        'Delivery crew, the samples you sent are on our galley table. The tasting has become a fairly serious meeting.',
    ]),
    ...group(304, { xboat: true }, [
        'Cannot wait for the next X-boat mail delivery. I am three episodes behind on my favorite show, and the engineer keeps almost telling me what happens.',
        'If the next X-boat brings the tournament recordings, save us a copy. No scores over the common channel, please.',
        'My daughter said she was sending her graduation pictures in the next mail packet. I have cleared a whole wall of the cabin.',
        'We have a new music list ready for the next X-boat mail handover. Everyone aboard got one choice. Even engineering.',
        'Our correspondence game is waiting on the next X-boat packet. The captain has spent a week deciding what their last move meant.',
        'I hope the next X-boat brings the rest of that cooking series. We have made everything in the first batch twice.',
        'Personal mail replies are ready for the next dispatch. There is a birthday recording in ours; please keep the attachment with the letter.',
        'When the next X-boat mail is distributed, could you check for the theatre recordings? The whole mess has been following that company.',
    ]),
    ...group(312, { pop: { min: 4 }, starport: ['A', 'B', 'C', 'D'] }, [
        'Anyone know a good place to hear live music after shift? We have an evening ashore and a drummer with very strong opinions.',
        'Our passenger has just seen {world} through the forward camera. First trip off her homeworld. We are giving her a minute.',
        'Crew launch, we have one extra bag for the return trip. The navigator found a musical instrument she has always wanted.',
        'We are meeting the other crew for a meal after handover. Same table as last visit, if it is free.',
        'Our galley seedlings have put out new leaves. Whoever gave us the cuttings last visit, they made it.',
        'Shore party aboard. We have the family photographs and enough local sweets to share with the next watch.',
        'The new crew member is making dinner tonight. We have been asked to arrive hungry and keep an open mind.',
        'We picked up a recording of the local choir. The sound check is still attached, and honestly that is half the charm.',
    ]),
    ...group(320, { pop: { min: 1, max: 3 }, starport: ['D', 'E'] }, [
        'We brought the school supplies with the regular freight. The box of coloured pens is on top; they asked us to check.',
        'Ground crew, we have room for your outgoing family recordings. Put them with the mail copies before we close the bags.',
        'The seed trays you gave us have sprouted. We will send a picture down with the delivery tally.',
        'We can bring the repaired projector down with the first load. We tested it aboard. That is a good film you left in it.',
        'Our cook remembered the bread from our last visit. We have been asked to bring back twice as much.',
        'The ground party has invited our off-watch crew to dinner. We will send someone down early to help set up.',
        'We have your recorded lessons aboard. The tutor included answers to the questions from last month.',
        'Someone on the ground painted us a welcome sign. We can read it on the landing camera. Tell them we like the ship in the corner.',
    ]),
    ...group(328, { allegiance: ['As'] }, [
        'Our clan delegation has brought recordings for the host family. Please keep the personal cases apart from the trade samples.',
        'The translator has the names for the welcome meal now. We would like to practise them before coming down.',
        'Our cargo representative has finished the agreement. She would like to thank your team over a meal before we leave.',
        'The family recording came through with the delivered mail. Three generations trying to fit in front of one camera. We have watched it twice.',
        'Our hosts sent a performance recording aboard. We are requesting a translation of the programme so we can follow the story.',
        'The visiting clan party has asked for a copy of the group photograph. Please send the one where everyone has finished arranging themselves.',
        'The galley has the guest preferences now. Two menus, one table. We are looking forward to it.',
        'Our crew has learned the proper closing greeting. We would like to try it without the translator at the farewell.',
    ]),
];
