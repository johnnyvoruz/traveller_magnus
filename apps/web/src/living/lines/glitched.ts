/** Thirty authored transcription glitches, not random corruption of other lines.
 * Common-band chatter only: no obscured clearances, emergency instructions or hooks.
 * Visible Unicode and bracketed audio cues survive the normal text-only renderer.
 * Ambient and infrequent; history still uses one stable ID per complete message.
 */
import { ChatterLine, type ChatterLineData, type ChatterWhenData } from '@voyage/shared';

function group(start: number, when: ChatterWhenData, texts: string[]): ChatterLineData[] {
    return texts.map((text, i) => ChatterLine.parse({
        id: `ship-${start + i}`, category: 'ship', voice: 'crew', text, weight: 0.35,
        when: { pop: { min: 1 }, ...when },
    }));
}

export const glitchedLines: ChatterLineData[] = [
    ...group(530, {}, [
        '…galley to— [static] —yes, actual coffee. C-off-ee. Not coolant. Your receiver is making this sound much worse.',
        'Can you hear m-m-me now? [carrier flutter] Good. I said the blue mug. The BLUE m▯g. Never mind, I will come and get it.',
        '[two voices overlapping] …your turn to cook— / —spectrometer results— / …please tell me those are separate conversations.',
        'The menu says fresh fr—fr—[crackle]—uit. Fruit. The steward insists the missing syllable is not a disclaimer.',
        'Dinner is at nineteen— [brief tone] —nineteen— [repeat fragment] …the galley clock has apparently joined the conversation.',
    ]),
    ...group(535, {}, [
        'Lab to common. We have a beautiful sp▯ctral l— [hiss] —line. The discovery is clearer than this microphone, fortunately.',
        'The sample is iridesc— [packet lost] —changes colour when you turn it. Sending pictures. Pictures will be easier.',
        'Our sensor array has detected— [loud crackle] —its own power supply. Again. Please do not put that in the expedition highlights.',
        '…stellar image copied, copied, cop— [echo fades] The image is fine. It is the congratulations that keep repeating.',
        '[thin whistle] …that sound is receiver feedback. The experiment has not learned to sing. We checked.',
    ]),
    ...group(540, {}, [
        'Personal recording received. She said yes to the— [carrier drops] —visit. The family visit. Stop congratulating me on the wrong thing.',
        '…birthday greeting for En—En—Ensign [garbled]. We have the cake. Please let us recover the name before we start singing.',
        '[music bleed] …your latest song is in our lounge playlist. The crew knows the chorus. The receiver only knows krrr-shhh.',
        'I said the portrait looks very dignif— [static] —dignified. Whatever the transcript printed, please delete that version.',
        'Your daughter\'s recording arrived with the mail. First words were [audio clipped]. We have a clean copy; this relay is just showing off.',
    ]),
    ...group(545, {}, [
        'The cabin plant has gr—gr— [buzz] —grown. Nothing has escaped. I am trying to report a leaf.',
        'Our ship pet is asleep on the transmi— [muffled thump] …that would explain the intermittent purring.',
        '…found your missing s▯ck behind the grav couch. Sock. Singular. We are not claiming to have solved the entire mystery.',
        '[carrier opens] …and then the captain wore the— [carrier closes] [carrier opens] …anyway, the photographs are private.',
        'Crew recreation report: the champion is— [three voices, unintelligible] …the result remains under enthusiastic discussion.',
    ]),
    ...group(550, { belts: { min: 1 } }, [
        'Belt crew to common. Our rock looks like a— [static] —potato. The geologist has requested we stop using that as its sample name.',
        'Assay came back p▯siti— [dropout] —positive. We are getting the good coffee out. Repeat, the GOOD coffee. That part matters.',
        '[echo] …sample has crystals, crystals— [click] One set of crystals. The receiver is making our find sound twice as impressive.',
        'The prospecting drone sent a picture of its own cl— [crackle] —claw. We are entering it in the crew portrait competition.',
        '…belt survey team reporting a successful l— [clipped] —lunch. Successful LAUNCH? No. Lunch. Everything else is in the work log.',
    ]),
    ...group(555, { xboat: true }, [
        'The X-boat packet has episode sev— [signal lost] —no, do not read the summary aloud. We are still watching six.',
        'Mail desk, we received the wedding vid— [musical burst] —video. Apparently the vows share a frequency with someone\'s exercise class.',
        '[carrier flutter] …new game rules in the mail. The disputed paragraph reads ▯▯▯. Our captain calls that a favourable interpretation.',
        'The family album copied perf—perfe— [crackle] —perfectly. The relatives look exactly like themselves. This microphone is the problem.',
        '…outgoing birthday message ends with love from all of u— [static] —us. Please keep the words and lose the electrical accompaniment.',
    ]),
];
