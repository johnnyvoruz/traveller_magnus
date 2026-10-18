<script setup lang="ts">
/**
 * One organization in the org chart (DU40): its name, who commands it, its members, the other
 * organizations it is also in, and the organizations under it, each a branch of its own. Every
 * name opens its record.
 */
import Icon from '../../design/Icon.vue';
import { typeInfo } from '../records.ts';
import type { OrgNode } from './org_tree.ts';

defineProps<{ node: OrgNode }>();
const emit = defineEmits<{ open: [id: string] }>();
</script>

<template>
  <li class="org-item">
    <div class="org-card">
      <button type="button" class="org-name" :data-org="node.id" @click="emit('open', node.id)">
        <Icon name="sitemap" :size="13" />{{ node.name }}
      </button>
      <p v-if="node.leaders.length" class="org-line">
        <span class="org-label">Commanded by</span>
        <button v-for="person in node.leaders" :key="person.id" type="button" class="org-person is-lead" @click="emit('open', person.id)">
          <Icon :name="typeInfo(person.type).icon" :size="11" />{{ person.name }}<small v-if="person.role">{{ person.role }}</small>
        </button>
      </p>
      <p v-if="node.members.length" class="org-line">
        <span class="org-label">Members</span>
        <button v-for="person in node.members" :key="person.id" type="button" class="org-person" @click="emit('open', person.id)">
          <Icon :name="typeInfo(person.type).icon" :size="11" />{{ person.name }}<small v-if="person.role">{{ person.role }}</small>
        </button>
      </p>
      <p v-if="!node.leaders.length && !node.members.length" class="org-line is-quiet">No members linked yet.</p>
      <p v-if="node.alsoIn.length" class="org-line">
        <span class="org-label">Also in</span>
        <button v-for="other in node.alsoIn" :key="other.id" type="button" class="org-person" @click="emit('open', other.id)">
          <Icon name="sitemap" :size="11" />{{ other.name }}
        </button>
      </p>
    </div>
    <ul v-if="node.children.length" class="org-children">
      <OrgBranch v-for="child in node.children" :key="child.id" :node="child" @open="emit('open', $event)" />
    </ul>
  </li>
</template>
