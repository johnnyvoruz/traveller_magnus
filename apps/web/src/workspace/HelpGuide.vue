<script setup lang="ts">
/**
 * How to publish and share. The headings are the guide's sections. Button names are the
 * ones on the screen, including the account switches (public_games.ts, public_course.ts).
 */
import { COURSE_LABEL } from './public_course.ts';
import { PUBLIC_GAMES_LABEL } from './public_games.ts';
</script>

<template>
  <div class="help-guide">
    <h2 id="help-h" class="help-h">Help</h2>
    <p class="help-lead">How to make records, publish them, and share a package.</p>
    <ol class="ui-steps">
      <li class="ui-step">
        <h3>Start here</h3>
        <p>Open Search and choose a world. Open Campaign, then Records, and select Add a record of another type to make a vessel. That vessel is your ship. Select the date in Campaign and set the campaign date. <a href="/welcome">About Traveller.voyage</a> walks through the map, a campaign, and sharing.</p>
      </li>
      <li class="ui-step">
        <h3>Playing solo</h3>
        <p>You can run the campaign on your own. Open Search and choose a world on the chart. Open Campaign and name it under Name your campaign. Select Add your ship. On the ship, use Trade here, Find passengers and freight, and Markets nearby. Select Set the date for the clock. Open Campaign, then Journal, and select New session or New note. Leave Get the invite link, Players, and View as players until you want them.</p>
      </li>
      <li class="ui-step">
        <h3>Invite your players</h3>
        <p>Open Campaign on the rail, then Party. Select Get the invite link. Select Copy, and send the address. The line under the link says when it stops working. Select Revoke to stop that link. A player opens the address, signs in, and selects Join. The next page is titled Which one is you? Under The characters you play, they tick each character they play. They can tick more than one. Continue stays off until one is ticked. They select Continue, or Not yet to play none. When the party has nobody yet, that page says to select Not yet. On the Players list, Which one lists a tick box for each character in the party. Tick every character that player plays.</p>
      </li>
      <li class="ui-step">
        <h3>What players see</h3>
        <p>Players see a record when you select Players on it. They see the summary, the details, For players, the tags, the kind, when it is, the place, the sheet text, the status, and the images and their captions. A connection shows its role and its notes. They also see the kinds you set, the place and the ships of the party, and the campaign date. A journal note they can read names who wrote it. A mention of a record they cannot see reads "a record".</p>
      </li>
      <li class="ui-step">
        <h3>Make records</h3>
        <p>Open Campaign on the rail, then Records. Select Add to make a person. The button beside it, Add a record of another type, makes a place, a vessel, or another kind of record.</p>
      </li>
      <li class="ui-step">
        <h3>Publish records</h3>
        <p>On Records, select Publish. You can also open the command palette and select Publish records. In the Marketplace, select Publish, then Records. The window is titled Publish records. Select Publish to send the package.</p>
      </li>
      <li class="ui-step">
        <h3>Publish part of your map</h3>
        <p>Turn Build on. Turn on Select hexes, and drag over the hexes you want. Then select Publish selection…. From the Marketplace, select Publish, then Map hexes. Select the hexes, and then select Publish selection.</p>
      </li>
      <li class="ui-step">
        <h3>Share a package</h3>
        <p>Publish opens the package's page. The address of that page is the link. Send the address. Your packages are also listed under My packages.</p>
      </li>
      <li class="ui-step">
        <h3>Import a package</h3>
        <p>Open the package's page and select Import. Sign in if the page asks you to. Choose the campaign. Select Preview, or Place on the map when you place it yourself. Then select Import.</p>
      </li>
      <li class="ui-step">
        <h3>Keys in a list</h3>
        <p>While the records, the journal, or the timeline has the keyboard, Down and Up move between rows. Enter opens a journal entry or a timeline row. L locates a record or a journal entry. Delete removes it. / searches that list. On the timeline, / opens Search. The command palette lists these while that list is open.</p>
      </li>
      <li class="ui-step">
        <h3>Your ship on other people's maps</h3>
        <p>Open Account at the foot of the rail. Turn on {{ PUBLIC_GAMES_LABEL }}. People on the same published chart then see one mark on your party's hex, with your campaign's name. While that is on, turn on {{ COURSE_LABEL }} to show where your ships are going. Your party needs a ship, and a place on the chart.</p>
      </li>
      <li class="ui-step">
        <h3>Dice</h3>
        <p>Select Dice on the rail. 1D, 2D, and 3D each roll that many six-sided dice and add them. Lower DM and Raise DM change the number you add or subtract. They show as − and +, and the number runs from −6 to +6. D3 reads a face of 1 or 2 as 1, 3 or 4 as 2, and 5 or 6 as 3. 2D3 does that for two dice, then adds them. D66 reads the first die as tens and the second as units, from 11 to 66, and it does not use the DM. 3DD: Roll three dice, add them, and multiply by 10. It takes no DM. Boon keeps the best two of three dice. Bane keeps the worst two. The command palette lists Roll dice, Roll D3, Roll 2D3, Roll D66, Roll 3DD, Boon, and Bane. R rolls 2D when nothing else is using that key.</p>
      </li>
      <li class="ui-step">
        <h3>News</h3>
        <p>On a world, select News. You can also open the command palette and select How fast does news travel from here. The days run from that date out to 60 days. Point at a world to read when the news arrives. Where the party is, select How old is the news here. Nothing in the rules sets how long a message waits at a station, so this picture adds no wait.</p>
      </li>
      <li class="ui-step">
        <h3>System Comms</h3>
        <p>In the orbit view, System Comms sits beside Fit. It starts on, and this device remembers when you turn it off. It plays the system on screen, whether or not your ship is there. Open Account at the foot of the rail and select Quiet on this device to hide background traffic on this device only. That switch leaves System Comms as it is.</p>
      </li>
      <li class="ui-step">
        <h3>Bring in a session</h3>
        <p>Ask every player before you record. Ask everyone when the players are in different places. These places require everyone's agreement for a conversation: California, Delaware, Florida, Illinois, Maryland, Massachusetts, Montana, Nevada, New Hampshire, Pennsylvania, and Washington. Michigan is contested. Oregon and Missouri require everyone's agreement for an in-person conversation. Connecticut and Nevada require it for a call. Germany requires it, under section 201 of its criminal code. New South Wales requires it. Canada and United States federal law let one person in the conversation agree. In the United Kingdom and the European Union, a private recording can fall under the household exemption. Uploading that recording to a cloud service may not. This is not legal advice.</p>
        <p>Record on your own phone or computer. Traveller.voyage does not receive the recording or the transcript. Open Campaign and select Copy for your AI. It copies your whole campaign, including referee notes. Give that text only to your own AI. Install the voyage-session-ingest skill from the skill folder, and give the skill to that AI with the copied text and your notes from the session.</p>
        <p>No AI runs here. Proposals come back in one of two ways. Your AI sends them with a token you make under Agent access. Open Account at the foot of the rail, then Agent access, and select Make a token. A token reaches this one campaign only. When Agent access is paused, you cannot make or use a token. Or open Proposals and select Paste your AI's reply. Your AI's reply should end with one json block holding the batch, and the site reads the first one. A batch holds at most 200 proposals. A batch is at most 256 KB. A proposal waits until you accept it, edit it, or drop it.</p>
      </li>
      <li class="ui-step">
        <h3>Relationships</h3>
        <p>Open Campaign, then Relationships. Linked records appear as a web. Point at a record to see where it is. Select one to open it. Select Locate to show that place on the map. To add a link, open a record and use Connections. Select a record type or a link kind to hide it. Select Org chart for the same links as a chart, and Web to come back.</p>
      </li>
      <li class="ui-step">
        <h3>Session</h3>
        <p>Open Campaign, then Session. Select Start a session. The board shows the clock, where the party is, the dice, and a new session entry for your notes. Select +1 hour, +1 day, or +1 week to move the clock forward. Select Back to it to return to the campaign date. Select Move the party to change where you are. Select End the session. If the clock moved, the question is Advance the campaign date? Choose Advance to that date, or keep the campaign date. The session stays in the journal either way. The campaign date changes only when you advance it.</p>
      </li>
      <li class="ui-step">
        <h3>Characters</h3>
        <p>Open Account at the foot of the rail, then Characters. Select New character, type a name, and select Create. Your characters are under Mine. Characters other people share with you are under Shared with me. Open one to fill in its sheet. The book says what each box means. Select Share by link so one person can edit the sheet. Select Copy, and send the address. The line under the link says when it stops working. Select Revoke to stop that link. Select Duplicate to make a copy. Select Make pregens to make several copies at once.</p>
      </li>
      <li class="ui-step">
        <h3>The journal</h3>
        <p>Open Campaign, then Journal. Select New session to write a session. It takes the campaign date and where the party is. Select New note for a note. A note waits until you date it. Select Handout or rumour, then Handout or Rumour. Players select Add a note. The referee can read that note too. Search the journal narrows the list. All, Sessions, Notes, Handouts, and Rumours choose a kind. Select Download the Player Pack to save a copy for your players.</p>
      </li>
      <li class="ui-step">
        <h3>The timeline</h3>
        <p>Open Campaign, then Timeline. It lists dated journal entries, dated records, a ship's legs, and where the party is, by year and day. Today is the campaign date. Select a row to open it. Choose All types, or one record type. Select Only this ship to keep the party's ship. With no campaign date, select Set the campaign date. With nothing dated yet, select Open the Journal.</p>
      </li>
      <li class="ui-step">
        <h3>Build</h3>
        <p>With Build on, select a hex and select Generate a system. The preview is a draft. Select Keep to put it on your map, Roll again for another, or Discard to drop it. Select Design by hand… to place the bodies yourself. Select Add star, then Add world, Add gas giant, Add belt, or Add moon. Select Pick orbit to place the selected body. Select Keep to store that draft. A system marked Chart is the chart's. One marked Yours is one you kept. Select Edit this system to change a charted system. When you keep those changes, it becomes yours, and the chart stays as it was. Select Restore to the chart to put the chart's system back. Open the command palette and select New sector to add a sector. The book says what a generated world means.</p>
      </li>
      <li class="ui-step">
        <h3>Set for the selection</h3>
        <p>Turn Build on. Turn on Select hexes, and select more than one hex. When at least one holds a system, Set for the selection is on the Build pane. The boxes are Allegiance and Region. Type a value and select Set for 3 hexes. The number is how many systems the selection holds. One system reads Set for 1 hex. While it runs, the button counts how many are done. When a selected hex holds no system, the line reads 3 of 5 hexes hold a system. The others are left alone. Those numbers are the hexes that hold a system, and the hexes you selected. When only one selected hex holds a system, the line uses holds, as in 1 of 5 hexes holds a system. When every selected hex holds a system, that line is absent. Each system is saved as you set it. To take it back, set the old value again.</p>
      </li>
      <li class="ui-step">
        <h3>The orbit view</h3>
        <p>On a system, select Explore orbits. You can also double-click the system on the map. Select Time, View, or Layers. Time moves the picture: Back 1 week, Advance 1 week, and Set as campaign date. View chooses Orbits, Row, or Column, and Fit shows the whole system. Layers shows or hides Paths, Moons, Habitable, Jump limit, Day / night, Scan, and Mainworld. Select a ship to open the navigation console. Choose a destination, or select Clear the destination. Select Release the ship and leave plotting to close it. System Comms is its own section. The book says how travel works.</p>
      </li>
      <li class="ui-step">
        <h3>The system page</h3>
        <p>Open Search and choose a world, or select System on the rail. The page shows the surface map, the world profile, and the lists of worlds and moons. Select a world or a moon to read it. Select Explore orbits for the orbit view. News is its own section. The book says what the profile means.</p>
      </li>
      <li class="ui-step">
        <h3>The party</h3>
        <p>Open Campaign, then Party. Select Choose the ship, and Add people. Where are we shows the place. Select Move the party to change it. Where the ship is, the party is. Under Ships, select Add a ship. The first ship is the lead. Select Make lead to change it. Under The party, select Add someone. Choose Aboard, or No ship. Where is everyone lists each person and ship. Select Locate to show one on the map. The invite is in Invite your players.</p>
      </li>
      <li class="ui-step">
        <h3>The crew</h3>
        <p>Open a ship's page. Crew sits under Passengers. Choose a Character, type a Role, and select Add to the crew. The Role starts as Captain when the crew is empty. A character crews one ship at a time. Select Remove to take someone off. Select Permissions. The fold lists one row for each role in use, with The Ledger, Trade, and The locker. Every switch is on until you turn one off. The line under the table is The referee alone: the sheet, Set up the ship, the owners and the payment, Players, the course and the clock. On the Party tab, under Players, the line under a person names their role and ship. A player sees the crew names and roles, and not the switches.</p>
      </li>
      <li class="ui-step">
        <h3>Set up the ship</h3>
        <p>Open a ship's page. Set up the ship sits at the top. Type a number in each box. The boxes are Jump Drive Output, Manoeuvre Drive Output, Fuel Capacity, Cargo Capacity, Staterooms, Low Berths, Mortgage Cost, Maintenance Cost, Life Support Cost, Salary Cost, and Running Cost. Each box says what reads it. The sheet below shows the same numbers. When every box has a number, the card folds to one line. Select Edit to open it again.</p>
      </li>
      <li class="ui-step">
        <h3>Ship's locker</h3>
        <p>On a ship's page, Ship's locker sits after Cargo. The columns are Type, TL, KG, and Notes. The line beside the title says how many kg are in the locker. Select Add to the locker to add a row. Select Move to, then a character, to put one item on that character's Equipment table. On the character's sheet, select To the locker on an Equipment row to bring one item back. One item per press.</p>
      </li>
      <li class="ui-step">
        <h3>Find passengers and freight</h3>
        <p>On a ship's page, choose a destination. Select Roll for passengers, type a number in Take, and select Take passengers to put them aboard. Select Roll for freight, then Take the lot. Select Is there mail?, then Take the mail. Select Fit to the sheet to fill the Take boxes from Staterooms, Low Berths, and the free hold. On a cargo row, select Deliver once the ship has arrived, and Delivered late when it was late. Select Disembark to let passengers off. The book says what the rolls mean.</p>
      </li>
      <li class="ui-step">
        <h3>Trade here</h3>
        <p>On a ship's page, Trade here works when the ship is at a world. Choose Supplier, Black market, or Online. Select Find a supplier or buyer, Find a black market supplier, or Find a supplier online. Select See the goods on offer. Select Roll the price, type Tons, and select Buy. The lot goes into Cargo and onto the Ledger. Under Sell from the hold, select Roll the sale price, then Sell. Select Hire a local broker, or Hire a local broker or fixer, when you want one. Select Trade without a broker to price without them. Log it writes the sale into the journal. The book says what the rolls mean.</p>
      </li>
      <li class="ui-step">
        <h3>Move credits</h3>
        <p>On a ship's page, under Ledger, select Move credits. A player needs The Ledger on. The referee selects Who. A player sees their own name. Choose To the ship or From the ship. Type Amount (Cr). For is optional. The line names the date. One line goes on the ship's Ledger and one on that character's credit register, linked. Select Move the credits. To take it back, move the credits back. A transfer has no Remove this line. When the character has no credit register, the form says: This character has no credit register. Attach a Character to their sheet first.</p>
      </li>
      <li class="ui-step">
        <h3>A player's ship</h3>
        <p>Open your ship's page. When your character crews that ship and Trade or The Ledger is on, the page says: You trade; the referee keeps time. Nothing you do here moves the ship or the clock. When you have more than one character, Acting as chooses who presses. The first character is the default. With Trade on, you can select Add a lot. When the ship is not under way, you can select Disembark and Disembark all. Deliver also needs The Ledger, and the ship is not under way. Find passengers and freight is on the page, and Take passengers also needs The Ledger. With The Ledger on, you can select Add a line and Move credits. With Trade and The Ledger both on, you can select Post the refuel and Post this month's upkeep. With The locker on, you can add a row, edit a row, and select Move to. You cannot select Remove this lot, Remove this line, Roll a passenger, or Board. You cannot type Fuel aboard or set Base fuel. You cannot change the crew, the owners, or the payment. With neither Trade nor The Ledger on, you see Cargo, Ship's locker, Passengers, Fuel, and the Ledger. You can select Show all when a list is long. You still see the crew names and roles.</p>
      </li>
      <li class="ui-step">
        <h3>Markets nearby</h3>
        <p>On a world's page, Markets nearby lists the worlds within 2, 4, or 6 parsecs. On a ship's page, and on Session, the same list is titled Markets. Select 2 pc, 4 pc, or 6 pc. The line says which distance, nearest first. Select a world to open it. Select Locate to mark it on the chart. The book says what the codes mean.</p>
      </li>
      <li class="ui-step">
        <h3>Account</h3>
        <p>Open the account menu at the foot of the rail and select Account and sign-in. Select Create an account and choose a username. Select Sign in to use a passkey you already have. Select I lost my passkey, then enter your username and one recovery code. On the account page, select Add a passkey, Rename, or Remove under Passkeys. Recovery codes shows how many are left. Select Make new codes to replace them. Each code works once, and the page shows the new set only then. Save them before you leave.</p>
      </li>
      <li class="ui-step">
        <h3>The Marketplace</h3>
        <p>Select Marketplace on the rail. Search packages looks through titles, descriptions, and tags. Select Search. The store can show New in the store or Most imported, and Browse by kind. Select Filters to choose Kind, Contents, Edition, Tags, Updated, or Publisher. Select Clear all to remove them. Sort by Recently updated, Most imported, or Title. Select a package to open it. The page shows What's inside, and it can show a Gallery, About, and Versions. Select My packages for yours. Publishing is in Publish records and Publish part of your map. The link is in Share a package. Import is its own section.</p>
      </li>
      <li class="ui-step">
        <h3>What's new</h3>
        <p>Open the account menu at the foot of the rail and select What's new. Each release has two lines. Select The full list for the rest. Select a release's title to open that version, and All versions to return. A version with no entry says that this version is not in What's new.</p>
      </li>
      <li class="ui-step">
        <h3>View as players</h3>
        <p>Open Campaign. Select View as players. You see the campaign as your players see it, and you cannot change anything while you look. The bar says You're seeing what players see. Select Stop viewing as players to come back.</p>
      </li>
      <li class="ui-step">
        <h3>The map</h3>
        <p>On the map, How to use the map sits at the top, right of the date. The card covers moving, zooming, and opening a system, including with Build on. It opens once by itself, then stays closed until you select it again. Search is in Start here.</p>
      </li>
      <li class="ui-step">
        <h3>Directions</h3>
        <p>On the chart, Directions sits at the top, right of the date, beside Save image and How to use the map. The button shows a route mark, and it is named Directions. Press d, or open the command palette and select Directions. Open a system and select Directions, then Directions from here or Directions to here. While Directions is open, that system shows From here and To here. Type a system in From and in To. A name works, or a sector and a hex, as in Regina, or Spinward Marches 1910. The empty box offers Use Regina, with that system's name in place of the example. As you type, the box lists systems. Select one to fill it. Select Swap From and To to exchange the two. Jump lists Jump-1 through Jump-6, and it starts on Jump-2. Fuel starts on Any fuel, and it also lists Starport only and Refined only. Turn on Fuel scoops, Fuel processors, or Allow Red zones when you want them. When the party ship has a jump, the button reads Use Kestrel Dawn's jump (Jump-2), with that ship's name and its jump in place of the example. When both ends are filled, the route is drawn. Select Get directions to draw it again. Directions searches the sectors along the route. When it stops at 16, the panel says: Only the 16 sectors nearest the route were searched. When several systems start with what you typed, the panel asks you to type more of the name. The panel lists one line for each leg, then a total of the jumps, the parsecs, and about how long the jumps take. The book says how travel works. Select Clear to drop the route. The line under the list says: Shown on the chart. Nothing is saved; closing Directions clears the route.</p>
      </li>
      <li class="ui-step">
        <h3>Save image</h3>
        <p>On the chart, select Save image at the top, right of the date. On the system map or the world map, select Save image there. The sheet says PNG, 300 dpi. Choose a paper size: A4, Letter, A3, or Tabloid. On paper is ink on white. Full colour is colour on white. Select Save. Select Cancel to close the sheet without saving.</p>
      </li>
      <li class="ui-step">
        <h3>Paint</h3>
        <p>Open a world's map and select Open map and key. With Build on, select Paint, or press P. The rail lists Terrain, Accents, and Features. Select one, then a hex. Drag to paint a run. Shift-click paints a line from the last hex. Clear hex puts that hex back. Clear map puts every painted hex back. The message that follows has Undo. Select Keep to save the painted map for everyone in this universe. Select Discard to drop what you have not kept. The book says what the terrains mean.</p>
      </li>
    </ol>
  </div>
</template>

<style>
.help-guide {
  min-width: 0;
  color: var(--text-1);
  font: 400 14px/1.5 var(--font-text);
}

.help-h {
  margin: 0;
  color: var(--text-0);
  font: 700 17px/1.3 var(--font-text);
}

.help-lead {
  margin: 6px 0 16px;
}

.help-guide h3 {
  margin: 0 0 4px;
  color: var(--text-0);
  font: 600 15px/1.3 var(--font-text);
}

.help-guide p {
  margin: 0;
}

.help-guide a {
  color: var(--signal);
  text-underline-offset: 3px;
}

.help-guide .ui-step p {
  margin: 0;
}
</style>
