// View as players in the Campaign panel's head (streams/D.md DU36): the switch sits in the tabs row at Half
// and Full, before Timeline, with the words at Full and the eye alone at Half; the bar stays above the tabs
// at Column and where no head is shown, and the banner while viewing is the same bar as before.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'web', 'src');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('View as players in the head (DU36)', () => {
    test('the bar has three places: the bar, the banner alone, and the head button', () => {
        const bar = read('workspace/players/ViewAsBar.vue');
        assert.match(bar, /withDefaults\(defineProps<\{ place\?: 'bar' \| 'banner' \| 'head'; words\?: boolean \}>\(\), \{ place: 'bar', words: true \}\)/);
        assert.match(bar, /<template v-if="props\.place === 'head'">\s+<button\s+v-if="campaign\.role === 'owner' && campaign\.status === 'ready' && !viewAs\.on"\s+type="button"\s+class="camp-timeline viewas-head"/, 'the head button takes the Timeline look; nothing of it while viewing');
        assert.match(bar, /\.viewas-head \{\s+gap: 7px;\s+min-height: calc\(1\.3em \+ 16px\);/, 'the eye alone keeps the height of the row');
        assert.match(bar, /:aria-label="props\.words \? undefined : VIEW_AS_LABEL"/, 'the eye alone still has its name');
        assert.match(bar, /<Icon name="eye" :size="13" \/><span v-if="props\.words">\{\{ VIEW_AS_LABEL \}\}<\/span>/);
        assert.match(bar, /<p v-else-if="viewAs\.on" class="viewas-bar" role="status" data-view-as-on>/, 'the banner as before, in the bar and the banner places');
        assert.match(bar, /v-else-if="props\.place === 'bar' && campaign\.role === 'owner' && campaign\.status === 'ready'"/, 'the bar place keeps the old button');
        assert.match(bar, /const VIEW_AS_LABEL = 'View as players';/);
        assert.match(bar, /const VIEW_AS_TITLE = "See the campaign as your players see it\. You can't change anything while you look\.";/);
        assert.equal((bar.match(/data-view-as\b(?!-)/g) || []).length, 2, 'both buttons carry data-view-as');
    });

    test('the panel puts the switch in the head at Half and Full, before Timeline; the bar stays at Column and without a head', () => {
        const panel = read('workspace/CampaignPanel.vue');
        assert.match(panel, /const headShown = computed\(\(\) => status\.value === 'ready' && \(\(!props\.recordId && !props\.entryId\) \|\| span\.value === 'full'\)\);/, 'the old inline rule, named');
        assert.match(panel, /const viewAsInHead = computed\(\(\) => headShown\.value && span\.value !== 'column'\);/);
        assert.match(panel, /<div v-if="headShown" class="camp-head">/);
        assert.match(panel, /<\/div>\s+<ViewAsBar v-if="viewAsInHead && !example\.on" place="head" :words="span === 'full'" \/>\s+<button v-if="!headFolded" type="button" class="camp-timeline" :aria-pressed="onTimeline/, 'after the tabs, before Timeline; words at Full only');
        assert.match(panel, /<ViewAsBar v-if="status === 'ready' && !example\.on" :place="viewAsInHead \? 'banner' : 'bar'" \/>/, 'above the tabs: the banner alone when the head holds the switch');
    });
});
