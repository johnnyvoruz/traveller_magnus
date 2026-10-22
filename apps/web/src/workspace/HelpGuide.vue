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
        <h3>Invite your players</h3>
        <p>Open Campaign on the rail, then Party. Select Get the invite link. Select Copy, and send the address. The line under the link says when it stops working. Select Revoke to stop that link. A player opens the address, signs in, and selects Join. Then they choose which person they play, or Not yet.</p>
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
        <p>On a world, select News. You can also open the command palette and select How fast does news travel from here. The days run from that date out to 60 days. Hover a world to read when the news arrives. Where the party is, select How old is the news here. Nothing in the rules sets how long a message waits at a station, so this picture adds no wait.</p>
      </li>
      <li class="ui-step">
        <h3>System Comms</h3>
        <p>In the orbit view, System Comms sits beside Fit. It starts on, and this device remembers when you turn it off. It plays the system on screen, whether or not your ship is there. Open Account at the foot of the rail and select Quiet on this device to hide background traffic on this device only. That switch leaves System Comms as it is.</p>
      </li>
      <li class="ui-step">
        <h3>Bring in a session</h3>
        <p>Ask every player before you record. Ask everyone when the players are in different places. These places require everyone's agreement for a conversation: California, Delaware, Florida, Illinois, Maryland, Massachusetts, Montana, Nevada, New Hampshire, Pennsylvania, and Washington. Michigan is contested. Oregon and Missouri require everyone's agreement for an in-person conversation. Connecticut and Nevada require it for a call. Germany requires it, under section 201 of its criminal code. New South Wales requires it. Canada and United States federal law let one person in the conversation agree. In the United Kingdom and the European Union, a private recording can fall under the household exemption. Uploading that recording to a cloud service may not.</p>
        <p>Record on your own phone or computer. Traveller.voyage does not receive the recording or the transcript. Open Campaign and select Copy for your AI. It copies your whole campaign, including referee notes. Give that text only to your own AI. Install the voyage-session-ingest skill from the skill folder, and give the skill to that AI with the copied text and your notes from the session.</p>
        <p>No AI runs here. Proposals come back in one of two ways. Your AI sends them with a token you make under Agent access. Open Account at the foot of the rail, then Agent access, and select Make a token. A token reaches this one campaign only. Or open Proposals and select Paste your AI's reply. A proposal waits until you accept it, edit it, or drop it.</p>
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
