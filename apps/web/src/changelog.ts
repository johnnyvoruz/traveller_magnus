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
        version: '1.3.12',
        date: '2026-11-17',
        title: 'The same world',
        story: [
            'In the orbit view the globe is the same map as the world, and a background ship can be kept as a vessel only you can see.',
            'System Comms starts on. Directions lists each stop of a route, and Party lists every ship and who is aboard.',
        ],
        items: [
            'Open a system and select Explore orbits. The globe is that world\'s map, including any edits you kept, at every size. Worlds of one kind vary a little in cloud, ground, and the colour of a gas giant. Background ships hold in rings around a world. Select a contact to see what it is. A referee can select Promote to a ship. That adds it to the records as a vessel only the referee can see, and it stops being scenery. Players see a contact\'s kind, not its name. Turn off Traffic in Layers to hide contacts.',
            'System Comms sits beside Fit and starts on. This device remembers when you turn it off. Select Minimize in its upper right corner to put it away for this visit. It shrinks into the System Comms button, and it opens again the next time you load the app. A campaign that has never set its switches shows background traffic.',
            'Open Directions. When both ends are filled, the panel shows the jumps, the parsecs, and about how long the jumps take, then the start and one stop for each jump. Select a stop\'s name to open that system. The chart moves to show the whole route. Select Show the route to see it again. When the party ship has a jump, Jump starts on it. Select the button under Jump to use that ship\'s jump again after you change it. Select Swap to exchange From and To.',
            'Open Campaign, then Party. The list shows each ship, the people aboard it, and anyone ashore, with a count of ships and people. Select Locate to show one on the map. Select Manage to change the party in place: Ship, Person, Make lead, and which ship a person is aboard. Select Done when you finish.',
            'On a world\'s surface map, Save image offers Texture. Texture saves the bare map at its exact size, with nothing around it, to wrap a sphere. On paper and Full colour stay as they are.',
            'A panel\'s name, its width switch, and its corner buttons sit on one row. The place, when there is one, sits under the name.',
        ],
    },
    {
        version: '1.3.11',
        date: '2026-11-12',
        title: 'From here',
        picture: '/changes/1.3.11.png',
        story: [
            'Open a system and select Directions, then Directions from here or Directions to here. When both ends are filled, the route draws itself and stays while you open other systems.',
            'Directions, Save image, and How to use the map sit at the top, right of the date. Markets nearby names its trade codes, and on a ship you can board a passenger and pay the ship.',
        ],
        items: [
            'Open a system and select Directions, then Directions from here or Directions to here. While Directions is open, that system shows From here and To here. Type in From or To, and the box lists systems. Select one to fill it. The empty box offers Use Regina, with that system\'s name in place of the example. When both ends are filled, the route is drawn, and it stays while you open other systems. The route can reach a sector that is not on the chart yet. When the search stops at 16, the panel says: Only the 16 sectors nearest the route were searched. Select Get directions to draw it again. On a phone, with a system open, Directions shows the ends and the total. Select Show all of Directions for the rest. Select Clear to drop the route.',
            'Directions, Save image, and How to use the map sit at the top, right of the date, in that order. On a phone they stay with the date, and each one is tall enough to tap. On the system map or the world map, select Save image there.',
            'Open Markets nearby. A row names the world, then Starport, Trade number, and Pop. A trade code shows its name, such as Agricultural or Garden. A code with no name shows the code. An owner reads Owned by Answerin (0431), with that world\'s name and hex. The distance and Locate sit level with the name.',
            'On a ship\'s page, with Trade and The Ledger on, select Board beside a passenger, then Board, post the fare. The fare posts to the Ledger as income. Under Payment, select Pay now. The payment posts as an expense, and the next due day moves on. Set a payment, Change, and the owners stay with the referee.',
            'Open Campaign. A record shows in the list as soon as it is saved, and a deleted record leaves as soon as it is deleted.',
            'Help says Directions, Save image, and How to use the map sit at the top, right of the date. It names Directions from here, Directions to here, From here, and To here.',
        ],
    },
    {
        version: '1.3.10',
        date: '2026-11-10',
        title: 'Directions',
        picture: '/changes/1.3.10.png',
        story: [
            'Select Directions in the chart\'s corner, or press d. Type From and To, choose Jump-1 through Jump-6 and a fuel, then select Get directions to draw the route and list each leg.',
            'On a ship\'s page you trade when Trade or The Ledger is on, you can play more than one character, and you move credits between the ship and a character. Set for the selection sets Allegiance or Region on the systems you selected.',
        ],
        items: [
            'Directions sits in the chart\'s corner beside Save image and How to use the map. Press d, or open the command palette and select Directions. Type a system in From and in To. A name works, or a sector and a hex. Select a system on the chart, then select Use selected. Select Swap From and To to exchange the two. Jump lists Jump-1 through Jump-6, and it starts on Jump-2. Fuel lists Any fuel, Starport only, and Refined only. Turn on Fuel scoops, Fuel processors, or Allow Red zones when you want them. When the party ship has a jump, the button reads Use Kestrel Dawn\'s jump (Jump-2), with that ship\'s name and its jump. Select Get directions. The chart draws the route. The panel lists one line for each leg, then the jumps, the parsecs, and about how long the jumps take. It searches only the sectors loaded on the chart. Select Clear to drop the route. Nothing is saved, and closing Directions clears the route.',
            'Open your ship\'s page. When your character crews that ship and Trade or The Ledger is on, the page says: You trade; the referee keeps time. Nothing you do here moves the ship or the clock. The switches are Trade, The Ledger, and The locker, on the Crew list under Permissions. With Trade on, you can select Add a lot. With The Ledger on, you can select Add a line and Move credits. With The locker on, you can add a row and select Move to. You cannot select Remove this lot, Remove this line, or Board, and you cannot change the crew, the owners, or the payment.',
            'A player can play more than one character. After Join, the page is titled Which one is you? Under The characters you play, tick each character, then select Continue. Continue stays off until one is ticked. Select Not yet to play none. On the Players list, Which one is a tick box for each character in the party. When you have more than one character, Acting as on the ship\'s page chooses who presses.',
            'On a ship\'s page, under Ledger, select Move credits. A player needs The Ledger on. Choose To the ship or From the ship. Type Amount (Cr). Select Move the credits. One line goes on the ship\'s Ledger and one on that character\'s credit register, linked. To take it back, move the credits back.',
            'Turn Build on. Turn on Select hexes, and select more than one hex. Set for the selection is on the Build pane. The boxes are Allegiance and Region. Type a value and select Set for 3 hexes. The number is how many systems the selection holds. One system reads Set for 1 hex. To take it back, set the old value again.',
            'Smaller: on a phone, Directions starts past the rail and ends above the world sheet, and the list scrolls inside the panel. Acting as is tall enough to tap. Help has Directions, Set for the selection, Move credits, and A player\'s ship. Invite your players covers Which one for several characters.',
        ],
    },
    {
        version: '1.3.9',
        date: '2026-11-03',
        title: 'The World card',
        picture: '/changes/1.3.9.png',
        story: [
            'Edit this system opens on World: System Name, then Starport, Size, Atmosphere, Hydrographics, Population, Government, Law Level, and Tech Level, with the text\'s words under each cell and the UWP string under the row.',
            'From the digits sits under Trade Codes (Space Separated), beside Use these. Messages show at the field they concern, and Ship\'s locker moves one item at a time.',
        ],
        items: [
            'World, at the top of Edit this system: System Name, then Starport, Size, Atmosphere, Hydrographics, Population, Government, Law Level, and Tech Level. Starport, Size, and Atmosphere are lists. Each option shows the code and the text\'s words for it, and the words under every cell are the text\'s own. The UWP string under the row changes as the cells change, and the chart fields follow.',
            'Under Trade Codes (Space Separated), the line says From the digits, and Use these puts those codes in the box in place of what it holds. Nothing is written until you select Use these.',
            'Messages for the mainworld show at the box, the switch, or the cell they concern. Keep is never refused by one of these messages.',
            'Ship\'s locker sits after Cargo on a ship\'s page. The columns are Type, TL, KG, and Notes, and the line beside the title says how many kg are in the locker. Select Move to, then a character, to put one item on that character\'s Equipment table. On the sheet, select To the locker to bring one back. One item per press.',
            'Help has The crew. A crew role with no Permissions row may act on the server as on the page.',
            'Smaller: What\'s new shows the 1.3.8 entry with its picture. Account fits a phone.',
        ],
    },
    {
        version: '1.3.8',
        date: '2026-11-02',
        title: 'The crew',
        picture: '/changes/1.3.8.png',
        story: [
            'On a ship\'s page, Crew sits under Passengers: choose a character, type a Role, select Add to the crew, and open Permissions for The Ledger, Trade, and The locker.',
            'Under the latest jump leg, select Take the fuel, print the party ship with Download the Player Pack, and choose On paper in Save image for symbols only.',
        ],
        items: [
            'Crew, under Passengers on a ship\'s page: choose a Character, type a Role, and select Add to the crew. The Role starts as Captain when the crew is empty. Select Remove to take someone off. A character crews one ship at a time, and adding them to a second ship moves them. On the Party tab, under Players, the line under a person names their role and ship. Players see the crew on the ship\'s page.',
            'Select Permissions on the Crew list. The fold lists one row for each role in use, with The Ledger, Trade, and The locker. Every switch is on until you turn one off. The line under the table is The referee alone: the sheet, Set up the ship, the owners and the payment, Players, the course and the clock.',
            'Under the latest jump leg on Track, the line says Jump fuel and the tons the rules give for the ship\'s Size. Select Take the fuel. Nothing comes off the tanks until you select it, and the press posts once. The orbit view\'s estimate reads Size too.',
            'Select Download the Player Pack. It prints the party ship\'s Cargo, Passengers, Fuel, Ledger, and Sheet as lines. Playing solo is on Start here, under Name your campaign, and in Help.',
            'Save image: select On paper. The world map draws a symbol in every cell, ocean and shallows included, with no coast line and no wash.',
            'Smaller: a world edited from the chart keeps its edited digits on the map, the trade screens, and a published package; a short passenger list no longer says No passengers; the Records chips, the Players section, and the Party tab fit a phone.',
        ],
    },
    {
        version: '1.3.7',
        date: '2026-11-02',
        title: 'Jump from the ship\'s page',
        story: [
            'A docked ship jumps to the destination its trade screen chose, with both legs shown before the press.',
            'Players see the party ship, the mortgage is said plainly, and four screens fit a phone.',
        ],
        items: [
            'Jump to the destination: under a docked ship\'s Track, the flight to the jump limit at the sheet\'s thrust and the jump with its rolled hours, shown before the press and written as the two legs the orbit view draws. With no thrust on the sheet the line says which box to fill.',
            'Players see the party ship: Cargo, Passengers, Fuel, the Ledger and the sheet, read-only, on a ship marked Players.',
            'Payment is the mortgage: with a Payment set, the month\'s upkeep leaves Mortgage Cost out and says so in its place, and the Payment form says what it is. Deliver asks Delivered on time or Delivered late, on time chosen first.',
            'Security: the policy report route takes only reports, up to 8 KB, at a shared rate, and logs one line for each.',
            'On a phone: the credits register, Save image, Trade here with the Board form and the paint rail keep every control at 44 px and every word whole.',
            'Smaller: a cargo row no longer starts with a stray separator; Help\'s Bring in a session and the skill state the same limits; What\'s new shows pictures for 1.3.5 and 1.3.6.',
        ],
    },
    {
        version: '1.3.6',
        date: '2026-11-01',
        title: 'Set up the ship',
        picture: '/changes/1.3.6.png',
        story: [
            'A ship\'s page opens on Set up the ship, with the boxes the trade screens read. Start here asks you to name the campaign.',
            'Every page carries security headers, and a journal note made of brackets no longer stalls the browser.',
        ],
        items: [
            'Security: every page and answer carries headers that stop a browser guessing a file\'s type, limit the address other sites see, and keep the app out of another site\'s frame. A journal note made only of brackets no longer stalls the browser that opens it.',
            'Set up the ship sits at the top of a ship\'s page. It holds the eleven sheet boxes the trade screens read, from Jump Drive Output to Running Cost. Each box has a line that says what reads it. When every box has a number, the card folds to one line, with Edit.',
            'Name your campaign is the first step on Start here. The box starts with the campaign\'s name. On the Party tab, under Players, the line says Your campaign is still called My map, with Rename beside it, until you change the name.',
            'A refused save says why. The record, the journal entry, and the Party tab show Not saved: Too many requests. On the record and the journal entry, your text stays, and the save is tried again.',
            'Help adds nine sections: Build, the orbit view, the system page, the party, Account, the Marketplace, What\'s new, View as players, and the map.',
            'Smaller: the Player Pack prints a character\'s or a ship\'s sheet as lines, not code. Pasting the campaign\'s own copy into Proposals says to paste your AI\'s reply instead.',
        ],
    },
    {
        version: '1.3.5',
        date: '2026-10-31',
        title: 'Passengers, freight and mail',
        picture: '/changes/1.3.5.png',
        story: [
            'A ship\'s page finds passengers, freight, and mail for a destination within its jump. Each roll is shown, and each fare is posted.',
            'The public ship card keeps private notes private. The clock moves with the trade, and Save image prints on white.',
        ],
        items: [
            'The public ship card no longer shows a referee-only passage, or a mention of a hidden record, from a public journal entry. The Player Pack leaves them out of names and notes too. A ship or campaign name that contains a dollar sign stays plain text on a link preview. An invisible character on a referee-only line no longer lets that passage through to players.',
            'Find passengers and freight, on a ship\'s page: choose a destination within the ship\'s jump. Select Roll for passengers, type a number in Take, and select Take passengers to put them aboard and post the fares. Select Roll for freight, then Take the lot. Select Is there mail?, then Take the mail. Select Deliver on a cargo row to post the pay once the ship has arrived, and Delivered late when it was late. Select Disembark to let passengers off. Fit to the sheet fills the Take boxes from the staterooms, the low berths, and the hold. Each roll shows its dice and its modifiers in the book\'s own words.',
            'Save image: Full colour prints on white, in the chart\'s own colours, on the chart, the system map, and the world map. On paper, the world map is a print with the tile symbols, readable in black and white.',
            'The clock sits beside the trade. A rolled wait and a leg still under way each get a days box, filled with the roll or the days to arrival, and yours to change. The button advances the campaign date. The Board form opens on the ship\'s next jump, read from its track. The ship sheet has Staterooms and Low Berths. A passenger roll with nobody aboard holding Steward takes the untrained penalty.',
            'The ship\'s money: the Ledger and the Passengers list fold at ten lines. A payment\'s next due day fills itself from Every. The upkeep says when it was last posted. The empty Ledger says where the starting funds go. The trade log note is placed at the world.',
            'Smaller: the invite link shows how many times it has been used after a reload. The orbit view loads lighter, and the chart\'s warm load asks for less. A course from a docked ship shows its distance and its hours. A pasted batch over 200 proposals or 256 KB says so. Journal replies and the dice sheet fit a phone. The trade log and the records read a little more clearly.',
        ],
    },
    {
        version: '1.3.4',
        date: '2026-10-29',
        title: 'A cleaner Records tab',
        story: [
            'The Records tab leads with your records: one row for search and Add, and one row for the kinds your campaign has.',
            'The invite link survives a reload. A reply from the referee says Referee, and a system address shows its chart sooner.',
        ],
        items: [
            'The Records tab on the Campaign panel keeps the search box, Add, and one row of chips for the kinds your campaign has, with their counts. The campaign date is on the Party tab, and Publish records is in the panel\'s menu. When the panel is narrow, the chips stay on one line and scroll.',
            'The Players section shows a live invite link after a reload, with Copy, Revoke, and the date it works until.',
            'A reply from the referee says Referee over it, with the referee\'s handle when the account has one. A players note says who wrote it, to the referee too, and a reply you just wrote shows your name at once.',
            'A system address shows its chart sooner. The world map, the print image, and the markets load after the chart appears.',
            'Smaller: when the Campaign panel is narrow, Timeline, Relationships, and Session are in the panel\'s menu. The here chip names the system as soon as the chart knows its name.',
        ],
    },
    {
        version: '1.3.3',
        date: '2026-10-28',
        title: 'Paint your own world maps',
        story: [
            'Paint, on the large world map with Build on, colours any hex so a world can match the map in your books, and everyone in the campaign sees it.',
            'Start a session turns the Campaign panel into a live board for the table. Players and the referee reply under journal entries, and every skill has a die beside it.',
        ],
        items: [
            'Paint, on the large world map with Build on, colours the hex under the pointer with one of the 19 terrains, the 3 accents, or the features. Drag to paint a run, Shift-click to paint a straight line, Clear hex or Clear map to take paint back. Keep saves the map for the campaign, and players see it on the world map and in the orbit view. The UWP never changes.',
            'Reply under a journal entry. Players and the referee write replies, one level under a reply, and the entry shows its count. The referee can delete any reply, and a player can delete their own. Deleting an entry takes its replies with it.',
            'A die beside every characteristic and skill on a character sheet rolls 2D with the number typed in its DM box and names the box on the card. Roll again repeats the last roll, and the last eight rolls sit under the picks.',
            'Finances on a character sheet is a credits register. In Simple, you type Cash on Hand, and each change is kept as a line. In Detailed, Cash on Hand is the balance, and each change is its own line, dated by the campaign day. A line added without access to the register waits until the player accepts it.',
            'Start a session, on the Campaign panel, opens a live board for the referee: the clock large with +1 hour, +1 day, and +1 week, the party and who is aboard each ship, the dice, the current world\'s records and the markets nearby, and the session entry open for typing. The clock moves the day you are looking at, not the campaign date. When the clock has moved, End the session asks once whether to advance the campaign date to the clock.',
            'Smaller: Save image is on the system map and on the world map, at 300 dpi, as on the chart. An invite link or a public ship shows as a card in Discord, with the ship\'s class when its sheet names one. A sector address, signed out, lists its subsectors, and a subsector address lists its worlds. Reduced motion in your system settings stops every animation. The account menu has a checklist for a new campaign. On a slow phone, the chart shows up as soon as it did in 1.3.0.',
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
