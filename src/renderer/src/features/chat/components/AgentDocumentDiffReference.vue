<template>
  <section class="agent-document-diff">
    <button type="button" class="diff-reference-toggle" @click="toggleExpanded">
      <span class="diff-reference-copy">
        <strong>{{ reference.title }}</strong>
        <small>{{ reference.summary || '文档内容已修改' }}</small>
      </span>
      <span class="diff-reference-stats">
        <span class="added">+{{ reference.addedLines }}</span>
        <span class="removed">-{{ reference.removedLines }}</span>
        <span aria-hidden="true">{{ expanded ? '⌃' : '⌄' }}</span>
      </span>
    </button>

    <div v-if="expanded" class="diff-reference-detail">
      <p v-if="loading">正在读取修改...</p>
      <p v-else-if="error" class="diff-reference-error">{{ error }}</p>
      <WorldDocumentDiffCard
        v-else-if="resolved"
        :diff="resolved.diff"
        :locatable="locatable"
        @locate="$emit('locate', { reference, hunk: $event })"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { WorldDocumentDiffHunk, WorldDocumentDiffReferencePayload } from '@share/cache/worldbuilding/worldDocumentHistory'
import type { ChatMessageDocumentDiffReference } from '@share/cache/render/aiagent/chatMessage'
import WorldDocumentDiffCard from '../../../components/WorldDocumentDiffCard.vue'

const props = withDefaults(
  defineProps<{ reference: ChatMessageDocumentDiffReference; locatable?: boolean }>(),
  { locatable: false }
)

defineEmits<{
  (event: 'locate', payload: {
    reference: ChatMessageDocumentDiffReference
    hunk: WorldDocumentDiffHunk
  }): void
}>()

const expanded = ref(false)
const loading = ref(false)
const error = ref('')
const resolved = ref<WorldDocumentDiffReferencePayload | null>(null)

const toggleExpanded = async (): Promise<void> => {
  expanded.value = !expanded.value
  if (!expanded.value || resolved.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    resolved.value = await window.api.getWorldDocumentDiffByRef(props.reference.diffRef)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '无法读取这次修改'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.agent-document-diff {
  margin-top: 10px;
  border-top: 1px solid #e2e8f0;
}
.diff-reference-toggle {
  width: 100%;
  min-height: 44px;
  padding: 8px 0 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 0;
  color: #334155;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.diff-reference-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.diff-reference-copy strong,
.diff-reference-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.diff-reference-copy strong {
  font-size: 13px;
}
.diff-reference-copy small {
  color: #64748b;
  font-size: 11px;
}
.diff-reference-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  white-space: nowrap;
}
.added { color: #16834b; }
.removed { color: #c24141; }
.diff-reference-detail { padding-top: 8px; }
.diff-reference-detail > p { margin: 0; color: #64748b; font-size: 12px; }
.diff-reference-error { color: #b83b3b !important; }
</style>
