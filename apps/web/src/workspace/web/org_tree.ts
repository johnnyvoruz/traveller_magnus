/**
 * The org chart (UX backlog U40; streams/D.md DU40): the campaign's organizations as a tree. An
 * organization that is a `member` of another sits under it; the people who command it (`commands`,
 * the schema's nearest to "leads") head it; its other members are listed in it. Pure.
 *
 * A tree has one parent: an organization that is a member of two is placed under the first by the
 * link's order, then its id, and the other is named as "Also in". A loop of memberships is cut where
 * it would close, so every organization is drawn once.
 */
import type { CampaignLink, CampaignRecord } from '@voyage/shared';

export type OrgPerson = { id: string; name: string; type: string; role: string };
export type OrgNode = {
    id: string;
    name: string;
    leaders: OrgPerson[];
    members: OrgPerson[];
    /** Other organizations it is also a member of, past the one it is drawn under. */
    alsoIn: { id: string; name: string }[];
    children: OrgNode[];
};

const byOrder = (a: CampaignLink, b: CampaignLink): number => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byName = <T extends { name: string }>(a: T, b: T): number => a.name.localeCompare(b.name);

export function orgForest(records: Readonly<Record<string, CampaignRecord>>, links: Readonly<Record<string, CampaignLink>>): OrgNode[] {
    const live = (id: string): CampaignRecord | null => {
        const record = records[id];
        return record && !record.deleted ? record : null;
    };
    const orgs = Object.values(records).filter((record) => !record.deleted && record.type === 'organization');
    const isOrg = new Set(orgs.map((org) => org.id));
    const rows = Object.values(links).filter((link) => !link.deleted && live(link.from) && live(link.to)).sort(byOrder);

    // Each organization's parents, in link order.
    const parents = new Map<string, string[]>();
    for (const link of rows) {
        if (link.kind !== 'member' || !isOrg.has(link.from) || !isOrg.has(link.to) || link.from === link.to) continue;
        const list = parents.get(link.from) ?? [];
        if (!list.includes(link.to)) list.push(link.to);
        parents.set(link.from, list);
    }
    // The first parent that does not lead back to the organization itself.
    const chosen = new Map<string, string>();
    const leadsBack = (start: string, parent: string): boolean => {
        const seen = new Set<string>([start]);
        let at: string | undefined = parent;
        while (at !== undefined) {
            if (seen.has(at)) return true;
            seen.add(at);
            at = chosen.get(at);
        }
        return false;
    };
    for (const org of [...orgs].sort((a, b) => (a.id < b.id ? -1 : 1))) {
        for (const parent of parents.get(org.id) ?? []) {
            if (leadsBack(org.id, parent)) continue;
            chosen.set(org.id, parent);
            break;
        }
    }

    const person = (link: CampaignLink): OrgPerson => {
        const record = live(link.from) as CampaignRecord;
        return { id: record.id, name: record.name, type: record.type, role: link.role.trim() };
    };
    const nodes = new Map<string, OrgNode>();
    for (const org of orgs) {
        const leaders: OrgPerson[] = [];
        const members: OrgPerson[] = [];
        for (const link of rows) {
            if (link.to !== org.id || isOrg.has(link.from)) continue;
            if (link.kind === 'commands' && !leaders.some((item) => item.id === link.from)) leaders.push(person(link));
        }
        for (const link of rows) {
            if (link.to !== org.id || isOrg.has(link.from) || link.kind !== 'member') continue;
            if (leaders.some((item) => item.id === link.from) || members.some((item) => item.id === link.from)) continue;
            members.push(person(link));
        }
        const alsoIn = (parents.get(org.id) ?? []).filter((id) => id !== chosen.get(org.id)).map((id) => ({ id, name: (live(id) as CampaignRecord).name }));
        nodes.set(org.id, { id: org.id, name: org.name, leaders, members: members.sort(byName), alsoIn, children: [] });
    }
    const roots: OrgNode[] = [];
    for (const org of orgs) {
        const node = nodes.get(org.id) as OrgNode;
        const parent = chosen.get(org.id);
        if (parent) (nodes.get(parent) as OrgNode).children.push(node);
        else roots.push(node);
    }
    for (const node of nodes.values()) node.children.sort(byName);
    return roots.sort(byName);
}
