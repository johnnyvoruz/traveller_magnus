/**
 * Browser copy of packages/engines/src/core/ship_names.js. The lists and
 * shipNameFor must agree. Shared imports nothing but what seed.ts already is.
 */
import { mulberry32 } from './seed.ts';

export const SHIP_ADJECTIVES = [
    'Far', 'Blue', 'Quiet', 'Pale', 'Silver', 'Dusty', 'Amber', 'Long', 'Swift', 'Keen',
    'Bold', 'Grey', 'Bright', 'Dim', 'Cold', 'Warm', 'High', 'Low', 'Still', 'Wild',
    'Lone', 'True', 'Soft', 'Hard', 'Deep', 'Wide', 'Slim', 'Proud', 'Calm', 'Sharp',
    'Clear', 'Dark', 'Fair', 'Fine', 'Gentle', 'Hidden', 'Idle', 'Kind', 'Last', 'Lost',
    'Near', 'Noble', 'Outer', 'Plain', 'Quick', 'Rare', 'Red', 'Silent', 'Steady', 'Stern',
    'Tall', 'Thin', 'Vast', 'Wandering', 'West', 'White', 'Young', 'Old', 'Golden', 'Copper',
] as const;

export const SHIP_NOUNS = [
    'Margin', 'Runner', 'Hope', 'Road', 'Light', 'Wind', 'Harbour', 'Haven', 'Drift', 'Trail',
    'Wake', 'Promise', 'Venture', 'Courier', 'Lantern', 'Anchor', 'Beacon', 'Compass', 'Horizon', 'Passage',
    'Voyager', 'Drifter', 'Pilgrim', 'Ranger', 'Seeker', 'Finder', 'Keeper', 'Wanderer', 'Gleam', 'Spark',
    'Ember', 'Cinder', 'Frost', 'Cedar', 'Willow', 'Aspen', 'Heron', 'Falcon', 'Kestrel', 'Martin',
    'Plover', 'Osprey', 'Lark', 'Wren', 'Finch', 'Robin', 'Dove', 'Crane', 'Eagle', 'Tern',
    'Gull', 'Petrel', 'Albatross', 'Condor', 'Raven', 'Crow', 'Jay', 'Magpie', 'Starling', 'Swallow',
] as const;

export function shipNameFor(seed: number): string {
    const roll = mulberry32(seed >>> 0);
    const adjective = SHIP_ADJECTIVES[Math.floor(roll() * SHIP_ADJECTIVES.length)];
    const noun = SHIP_NOUNS[Math.floor(roll() * SHIP_NOUNS.length)];
    return adjective + ' ' + noun;
}
