/**
 * What a player or a referee sees in each app version, newest first.
 * The orchestrator bumps APP_VERSION at the push. 1.3.1 is written ahead of that bump.
 * Words name the screen, not the work: no lane, file, or internal name.
 * `story` is the two lines on `/changes/<version>`. `picture` is set when that release's picture ships.
 */
export type Release = {
    version: string;
    /** YYYY-MM-DD */
    date: string;
    title: string;
    story: readonly [string, string];
    /** Absent until the release picture ships with a push. */
    picture?: string;
    items: readonly string[];
};

export const CHANGELOG: readonly Release[] = [
    {
        version: '1.3.3',
        date: '2026-10-28',
        title: 'Paint your own world maps',
        story: [
            'Paint, on the large world map in Build, colours any hex so a world can match the map in your books, and everyone in the campaign sees it.',
            'Start a session turns the Campaign panel into a live board for the table, players and the referee reply under journal entries, and every skill has a die beside it.',
        ],
        items: [
            'Paint, on the large world map with Build on, colours the hex under the pointer with one of the 19 terrains, 3 accents, or the features. Drag to paint a run, Shift-click to paint a straight line, Clear hex or Clear map to take paint back. Keep saves the map for the campaign, and players see it on the world map and in the orbit view. The UWP never changes.',
            'Reply under a journal entry. Players and the referee write replies, one level under a reply, and the entry shows its count. The referee can delete any reply, a player their own. Deleting an entry takes its replies with it.',
            'A die beside every characteristic and skill on a character sheet rolls 2D with the number typed in its DM box and names the box on the card. Roll again repeats the last roll, and the last eight rolls sit under the picks.',
            'Finances on a character sheet is a credits register: Simple keeps a balance, Detailed keeps a line per change, dated by the campaign day. Only the campaign\'s referee posts to a player\'s register.',
            'Start a session, on the Campaign panel, opens a live board for the referee: the clock large with +1 hour, +1 day, and +1 week, the party and who is aboard each ship, the dice, the current world\'s records and the markets nearby, and the session entry open for typing. The clock moves what you look at, not the campaign date. End the session asks once whether to advance the campaign date to the clock.',
            'Smaller: Save image is on the system map and on the world map, at 300 dpi, as on the chart. An invite link or a public ship unfurls as a card in Discord, with the ship\'s class when its sheet names one. A sector or subsector address, signed out, lists its places. Reduced motion in your system settings stops every animation. The account menu has a checklist for a new campaign. The chart\'s first paint on a slow phone is back to where 1.3.0 was.',
        ],
    },
    {
        version: '1.3.2',
        date: '2026-10-27',
        title: 'Save the chart as a print image',
        story: [
            'Save image makes a 300 dpi picture of what\'s on screen, the subsector, or the sector, on paper or in full colour.',
            'A published package now leaves out what players cannot see, and an orbit address opens at once.',
        ],
        picture: '/changes/1.3.2.png',
        items: [
            'Save image, at the bottom right of the chart and on the right-click menu, saves a PNG at 300 dpi on A4, Letter, A3, or Tabloid. Choose What\'s on screen, the subsector, or the sector, and On paper or Full colour. The file is named for the place, the paper, and the resolution.',
            'A published package sends a referee-only record\'s name, kind, and tags. Its text, player notes, and sheet stay with you, and referee-only passages are left out of every record. The publish form says what goes out and what stays.',
            'An orbit address opens at once on the chart version you last used, then switches if a newer one is released.',
            'The Simple or Detailed choice on a character\'s credits is kept.',
        ],
    },
    {
        version: '1.3.1',
        date: '2026-10-27',
        title: 'Sessions and trade',
        story: [
            'You can copy your campaign for your own AI, paste the reply, and accept, edit, or drop each proposal.',
            'Trade here finds a supplier where the ship is, buys and sells, and writes the lot to Cargo and the Ledger.',
        ],
        picture: '/changes/1.3.1.png',
        items: [
            'Copy for your AI copies your whole campaign, referee notes included. Paste your AI\'s reply into Proposals. Each proposal waits until you accept it, edit it, or drop it. A passage you mark for the referee is shaded for you and left out of what players read.',
            'Trade here, on a vessel at its current world, finds a supplier and buys and sells. The lot is in Cargo and on the Ledger. Hire a local broker when you want one. Tick Log it to write the sale into the journal.',
            'Players can no longer read a referee-only passage written with old line breaks; only a campaign\'s referee can post to a character\'s register.',
            'Drag the time scrub to look at another day. The map shows where the party is on that day, and Back to the campaign date returns you. The world panel names the season. Dice adds 3DD: roll three dice, add them, and multiply by 10. It takes no DM.',
            'Hover a world to read its card: the name, the hex, the UWP and codes, the bases, the zone, and the records under Here. In Build, Publish selection publishes the hexes you selected. A world and a record each have Publish. A referee-only record warns you that publishing sends the whole record, including its referee-only text, its player notes, and its sheet.',
            'Look around an example campaign walks through a crew, a ship, and a journal. Quiet on this device hides background traffic only. System Comms still plays the system on screen.',
        ],
    },
    {
        version: '1.3.0',
        date: '2026-10-18',
        title: 'Players',
        story: [
            'Players can join your campaign with an invite link, see what you choose to show them, and write their own notes in the journal.',
            'Dice are on the rail on every screen, ships carry cargo, a ledger and owners, the timeline fills itself from ship tracks, and systems have local radio.',
        ],
        picture: '/changes/1.3.0.png',
        items: [
            'Players join your campaign with an invite link. They see each record\'s For players text, the party, the timeline and the journal, and they write their own notes. View as players shows you what they see.',
            'Roll dice is on the rail on every screen: 1D, 2D, 3D, D3, 2D3 and D66, Boon or Bane, and a DM.',
            'A vessel has cargo, a ledger, fuel and costs, who holds its shares, and the ship\'s payment with when it is due. Roll a passenger draws one for the ship.',
            'The timeline fills itself from each ship\'s track. On a world, News shows how fast news travels by X-boat.',
            'The orbit view plays local radio from the system on screen, one transmission at a time. System Comms, beside Fit, turns it off on this device. City lights stay on the surface and glow brighter.',
            'The map stays sharp while you drag it, and lights up what you can select. The world panel is shorter, and Help and empty screens say what to do next.',
        ],
    },
    {
        version: '1.2.6',
        date: '2026-10-17',
        title: 'Record packages',
        story: [
            'A package made of records shows how many records it holds.',
            'The import panel matches the rest of the store, and a package page looks right the first time you open it.',
        ],
        items: [
            'A package made of records shows how many records it holds.',
            'The import panel matches the rest of the store.',
            'A package page looks right the first time you open it.',
        ],
    },
    {
        version: '1.2.5',
        date: '2026-10-17',
        title: 'Packages of records',
        story: [
            'You can publish a package that holds records and no map, and its page does not ask you to place it on the map.',
            'The featured row is shown once, and the route of your own ship is drawn in cyan.',
        ],
        items: [
            'You can publish a package that holds records and no map.',
            'Its page does not ask you to place it on the map.',
            'The featured row is shown once.',
            'Your own ship\'s route is drawn in cyan.',
        ],
    },
    {
        version: '1.2.4',
        date: '2026-10-16',
        title: 'Filters and courses',
        story: [
            'The marketplace has filters in a column on the left, and Back returns you to your place in the store.',
            'A ship route is a solid line with the course ahead marked, and a public ship card uses the same lime as its track.',
        ],
        items: [
            'The marketplace has filters in a column on the left.',
            'A ship\'s route is a solid line, with the course ahead marked.',
            'You choose whether your ship\'s course ahead is shown.',
            'A public ship\'s card uses the same lime as its track.',
            'Back returns you to your place in the store.',
        ],
    },
    {
        version: '1.2.3',
        date: '2026-10-15',
        title: 'Scrolling and surface detail',
        story: [
            'The store scrolls on every screen, and you can zoom much further into a world surface map while it stays sharp.',
            'The UWP tiles no longer use a dotted underline.',
        ],
        items: [
            'The store scrolls on every screen.',
            'You can zoom much further into a world\'s surface map, and it stays sharp.',
            'The UWP tiles no longer use a dotted underline.',
        ],
    },
    {
        version: '1.2.2',
        date: '2026-10-15',
        title: 'Storefront and ship traffic',
        story: [
            'Public ships show as lime tracks at every zoom, out to the whole sector, and the marketplace is a storefront with a featured row and a page for every package.',
            'You add a cover by choosing a file, by dropping one, or by pasting, and when you zoom out the map shows the published chart.',
        ],
        items: [
            'Public ships show as lime tracks at every zoom, out to the whole sector.',
            'The marketplace is a storefront, with a featured row and a page for every package.',
            'You add a cover by choosing a file, by dropping one, or by pasting.',
            'When you zoom out, the map shows the published chart.',
        ],
    },
    {
        version: '1.2.1',
        date: '2026-10-14',
        title: 'Several ships',
        story: [
            'A party can have more than one ship. Each public ship shows on the map with who is aboard, and you can mark a journal entry as public.',
            'A visitor who is signed out can see public ships, and a published package keeps its layout and the links between its records.',
        ],
        items: [
            'A party can have more than one ship.',
            'Each public ship shows on the map, with who is aboard.',
            'You can mark a journal entry as public.',
            'A visitor who is signed out can see public ships.',
            'A published package keeps its layout and the links between its records.',
        ],
    },
    {
        version: '1.2.0',
        date: '2026-10-14',
        title: 'The marketplace',
        story: [
            'You can share systems, a subsector, or a sector as a package, and you can browse the catalogue signed in or signed out.',
            'You can bring a package into a campaign, update an import, remove it, or report a listing, and the version number is on the sign-in card and the account page.',
        ],
        items: [
            'You can share systems, a subsector, or a sector as a package.',
            'You can browse the catalogue signed in or signed out.',
            'You can bring a package into a campaign, in its charted place or anywhere on the map.',
            'You can update an import, remove it, or report a listing.',
            'The version number is on the sign-in card and the account page.',
            'The date stays readable at every window size.',
        ],
    },
    {
        version: '1.1.15',
        date: '2026-10-14',
        title: 'Removing an import',
        story: [
            'Removing an import deletes what it brought in.',
            'A campaign keeps one import of each package.',
        ],
        items: [
            'Removing an import deletes what it brought in.',
            'A campaign keeps one import of each package.',
        ],
    },
    {
        version: '1.1.14',
        date: '2026-10-14',
        title: 'Placing a package',
        story: [
            'You can drop a package anywhere on the map, and it keeps its shape.',
            'An imported record names the package it came from, and you can undo placing an import.',
        ],
        items: [
            'You can drop a package anywhere on the map, and it keeps its shape.',
            'An imported record names the package it came from.',
            'You can undo placing an import.',
        ],
    },
    {
        version: '1.1.13',
        date: '2026-10-14',
        title: 'Browsing packages',
        story: [
            'You can browse packages, import one in its original place, and report a listing.',
            'The character sheet puts the six characteristics on one row and each skill on its own line, and on a phone a panel opens from the bottom while Back steps up one level.',
        ],
        items: [
            'You can browse packages and import one in its original place.',
            'You can report a listing.',
            'The character sheet puts the six characteristics on one row, and each skill on its own line.',
            'On a phone, a panel opens from the bottom, and Back steps up one level.',
        ],
    },
    {
        version: '1.1.12',
        date: '2026-10-13',
        title: 'Water, ice, and public games',
        story: [
            'Water and ice on a world follow its survey, and you can show your ship hex to other people on the same map.',
            'A first visit opens on the Spinward Marches with Regina in view, and character sheets are available.',
        ],
        items: [
            'A world\'s water and ice follow its survey.',
            'You can show your ship\'s hex to other people on the same map.',
            'A first visit opens on the Spinward Marches, with Regina in view.',
            'A generate request stays inside one sector.',
            'Character sheets are available.',
        ],
    },
    {
        version: '1.1.11',
        date: '2026-10-12',
        title: 'Passkeys',
        story: [
            'You sign in with a username and a passkey, and signing out ends the session.',
            'You can download a Player Pack for your players, and importing a campaign keeps the journal.',
        ],
        items: [
            'You sign in with a username and a passkey.',
            'Signing out ends the session.',
            'You can download a Player Pack for your players.',
            'Importing a campaign keeps the journal.',
        ],
    },
    {
        version: '1.1.10',
        date: '2026-10-12',
        title: 'Journal images',
        story: [
            'You can add images to a journal entry, and ice-cap edges look broken rather than perfectly round.',
            'Systems you generated stay on the map when you zoom out, and the map tells you when the chart cannot be loaded.',
        ],
        items: [
            'You can add images to a journal entry.',
            'Ice-cap edges look broken rather than perfectly round.',
            'Systems you generated stay on the map when you zoom out.',
            'The map tells you when the chart cannot be loaded.',
        ],
    },
    {
        version: '1.1.9',
        date: '2026-10-12',
        title: 'Your day\'s allowance',
        story: [
            'Generate shows how many systems you can still make today, and systems you generated show as dots when you zoom out.',
            'City lights sit under the clouds on the orbit view, and generating a large area finishes sooner.',
        ],
        items: [
            'Generate shows how many systems you can still make today.',
            'Systems you generated show as dots when you zoom out.',
            'City lights sit under the clouds on the orbit view.',
            'Generating a large area finishes sooner.',
        ],
    },
    {
        version: '1.1.8',
        date: '2026-10-12',
        title: 'How full a region is',
        story: [
            'You can generate up to 100 systems a day, and generating more than one hex asks how full the area should be.',
            'Right-click keeps the hexes you selected. A world tipped on its side shows its ice on the orbit picture, and a world with no seas says so.',
        ],
        items: [
            'You can generate up to 100 systems a day.',
            'Generating more than one hex asks how full the area should be.',
            'Right-click keeps the hexes you selected.',
            'A world tipped on its side shows its ice on the orbit picture.',
            'A world with no seas says so.',
        ],
    },
    {
        version: '1.1.7',
        date: '2026-10-11',
        title: 'The large surface map',
        story: [
            'The surface map opens large and centred, and you can zoom and pan.',
            'The full legend is readable, night is darker with a faint terminator, and the sun mark is shown.',
        ],
        items: [
            'The surface map opens large, centred, and you can zoom and pan.',
            'The full legend is readable.',
            'Night is darker, with a faint terminator, and the sun mark is shown.',
        ],
    },
    {
        version: '1.1.6',
        date: '2026-10-11',
        title: 'Generate and the timeline',
        story: [
            'Keep saves a system you just generated, and Generate lets you choose how densely to fill the hexes.',
            'A record can have a date and an optional end date, and a running job shows its progress beside Generate and in a notice.',
        ],
        items: [
            'Keep saves a system you just generated.',
            'Generate lets you choose how densely to fill the hexes.',
            'A record can have a date, and an optional end date.',
            'A running job shows its progress beside Generate and in a notice.',
        ],
    },
    {
        version: '1.1.5',
        date: '2026-10-11',
        title: 'Surface map and jobs',
        story: [
            'The surface map opens large, with a key, and the hex grid stays on, while day and night falls across the map as soft light and dark.',
            'Undo tells you what it changed, and job progress stays with you when you open another page.',
        ],
        items: [
            'The surface map opens large, with a key, and the hex grid stays on.',
            'Day and night falls across the map as soft light and dark.',
            'Undo tells you what it changed.',
            'A job\'s progress stays with you when you open another page.',
        ],
    },
    {
        version: '1.1.4',
        date: '2026-10-11',
        title: 'Your own map',
        story: [
            'Ice caps have a ragged edge, and undo leaves a later edit in place.',
            'The Build strip says this map is your copy of the published chart, and signed out, Campaign and Build stay visible until you sign in.',
        ],
        items: [
            'Ice caps have a ragged edge.',
            'Undo leaves a later edit in place.',
            'The Build strip says this map is your copy of the published chart.',
            'Signed out, Campaign and Build stay visible until you sign in.',
        ],
    },
    {
        version: '1.1.3',
        date: '2026-10-11',
        title: 'Clearer generating',
        story: [
            'Day and night no longer covers the rest of a world page, and the app tells you when planet discs cannot be drawn.',
            'Generating shows that it is still working, and you can publish a single system and choose who can see each record.',
        ],
        items: [
            'Day and night no longer covers the rest of a world\'s page.',
            'The app tells you when planet discs cannot be drawn.',
            'Generating shows that it is still working.',
            'A note says that what you generate is your own map.',
            'You can publish a single system.',
            'You choose who can see each record.',
        ],
    },
    {
        version: '1.1.2',
        date: '2026-10-11',
        title: 'Publishing and designing by hand',
        story: [
            'You can publish from a map you own, and the way back on a campaign page sits at the top.',
            'The first image on a record is its avatar, and you can roll a profile, pick an orbit, and place a belt around a world while you design a system by hand.',
        ],
        items: [
            'You can publish from a map you own.',
            'The way back on a campaign page sits at the top.',
            'A record\'s first image is its avatar.',
            'You can roll a profile and pick an orbit while you design a system by hand.',
            'You can place a belt around a world.',
        ],
    },
    {
        version: '1.1.1',
        date: '2026-10-11',
        title: 'Build a sector',
        story: [
            'You can generate a sector in one step and undo it.',
            'You can design the orbits of a system by hand, and you can roll a profile for one world.',
        ],
        items: [
            'You can generate a sector in one step and undo it.',
            'You can design a system\'s orbits by hand.',
            'You can roll a profile for one world.',
        ],
    },
];
