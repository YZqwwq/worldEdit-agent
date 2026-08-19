<template>
  <div class="document-diff-card">
    <header class="diff-summary">
      <span v-if="title" class="diff-title">{{ title }}</span>
      <span class="added">+{{ diff.addedLines }}</span>
      <span class="removed">-{{ diff.removedLines }}</span>
      <span v-if="diff.truncated" class="truncated">部分 Diff</span>
    </header>
    <div class="diff-body">
      <section
        v-for="(hunk, hunkIndex) in diff.hunks"
        :key="hunk.anchorHash || hunkIndex"
        class="diff-hunk"
      >
        <button
          type="button"
          class="hunk-header"
          title="在文档中定位这处修改"
          @click="$emit('locate', hunk)"
        >
          <span>{{ hunk.headingPath?.length ? hunk.headingPath.join(' / ') : '文档内容' }}</span>
          <span class="locate-hint">定位 ↗</span>
        </button>
        <div
          v-for="(line, lineIndex) in hunk.lines"
          :key="`${hunkIndex}-${lineIndex}`"
          class="diff-line"
          :class="line.kind"
        >
          <span class="line-marker">{{
            line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '
          }}</span>
          <span class="line-text">{{ line.text }}</span>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type {
  WorldDocumentContentDiff,
  WorldDocumentDiffHunk
} from '@share/cache/worldbuilding/worldDocumentHistory'

defineProps<{ diff: WorldDocumentContentDiff; title?: string }>()
defineEmits<{ (event: 'locate', hunk: WorldDocumentDiffHunk): void }>()
</script>

<style scoped>
.document-diff-card {
  overflow: hidden;
  border: 1px solid #e4e7eb;
  border-radius: 6px;
  background: #fbfcfd;
}

.diff-summary {
  min-height: 27px;
  padding: 5px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #e4e7eb;
  font-size: 10px;
  font-weight: 700;
}

.diff-title {
  margin-right: auto;
  color: #414854;
}
.added {
  color: #16834b;
}
.removed {
  color: #c24141;
}
.truncated {
  color: #7a8190;
  font-weight: 500;
}

.diff-body {
  max-height: 300px;
  overflow: auto;
  color: #414854;
  font:
    10px/1.55 ui-monospace,
    SFMono-Regular,
    Menlo,
    Consolas,
    monospace;
}

.diff-hunk + .diff-hunk {
  border-top: 1px solid #e4e7eb;
}
.hunk-header {
  width: 100%;
  padding: 3px 8px;
  display: flex;
  justify-content: space-between;
  border: 0;
  color: #596b91;
  background: #eef3fb;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.hunk-header:hover {
  background: #e3ebf8;
}
.locate-hint {
  margin-left: 12px;
  color: #667797;
  white-space: nowrap;
}

.diff-line {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.diff-line.added {
  background: #eaf8ef;
  color: #147a45;
}
.diff-line.removed {
  background: #fff0f0;
  color: #b83b3b;
}
.line-marker {
  text-align: center;
  user-select: none;
}
.line-text {
  padding-right: 8px;
}
</style>
