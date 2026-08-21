<template>
  <!-- 世界实体文档工作台 -->
  <div
    class="worldbuilding-white-theme narrative-editor-page"
    :class="{
      'resizing-sidebar': resizingNarrativeSidebar,
      'resizing-ai-panel': resizingNarrativeAiPanel
    }"
    :style="narrativeSidebarStyle"
  >
    <aside class="narrative-sidebar">
      <header class="sidebar-home">
        <button
          type="button"
          class="sidebar-home-link"
          aria-label="返回世界实例"
          title="返回世界实例"
          @click="navigateToEntityHome"
        >
          <span class="sidebar-icon back-icon" aria-hidden="true">‹</span>
        </button>
        <span class="sidebar-world-name" :title="worldDetail?.name">{{
          worldDetail?.name || '世界文档库'
        }}</span>
        <button type="button" class="sidebar-menu-btn" aria-label="更多">...</button>
      </header>

      <section class="catalog-panel">
        <div class="catalog-scope">
          <input
            v-model="documentSearchQuery"
            class="catalog-search"
            type="search"
            placeholder="查找文档"
            aria-label="查找文档"
          />
        </div>

        <header class="catalog-head">
          <div class="catalog-title">
            <span class="sidebar-icon" aria-hidden="true">☷</span>
            <span>目录</span>
          </div>
          <div class="catalog-actions">
            <button
              type="button"
              aria-label="新建根文档"
              title="新建根文档"
              :disabled="!canCreateNarrativeDocument"
              @click="createNarrativeDocument()"
            >
              +
            </button>
            <button type="button" aria-label="目录设置">☰</button>
          </div>
        </header>

        <div v-if="narrativeDocumentsLoading" class="catalog-empty">
          正在读取文档
        </div>
        <div v-else-if="narrativeTreeRows.length === 0" class="catalog-empty">
          暂无文档，点击上方 + 新建
        </div>
        <div v-else class="catalog-tree">
          <div
            v-for="row in narrativeTreeRows"
            :key="row.id"
            class="catalog-tree-row"
            :class="{
              active: row.id === activeDocumentId,
              dragging: row.id === draggingDocumentId,
              'drop-before': dropTarget?.documentId === row.id && dropTarget.position === 'before',
              'drop-after': dropTarget?.documentId === row.id && dropTarget.position === 'after',
              'drop-inside': dropTarget?.documentId === row.id && dropTarget.position === 'inside'
            }"
            :style="{ '--tree-depth': row.depth }"
            draggable="true"
            @dragstart="handleNarrativeDragStart(row.id, $event)"
            @dragover.prevent="handleNarrativeDragOver(row.id, $event)"
            @dragleave="handleNarrativeDragLeave(row.id)"
            @drop.prevent="handleNarrativeDrop"
            @dragend="clearNarrativeDragState"
          >
            <button
              type="button"
              class="catalog-tree-item"
              @click="selectNarrativeDocument(row.id)"
            >
              <span class="catalog-tree-caret" aria-hidden="true">{{
                row.children.length ? '⌄' : ''
              }}</span>
              <span class="catalog-tree-title">{{ row.title }}</span>
            </button>
            <button
              type="button"
              class="catalog-row-action"
              aria-label="新建子文件"
              title="新建子文件"
              @click.stop="createNarrativeDocument(row.id)"
            >
              +
            </button>
            <button
              type="button"
              class="catalog-row-action danger"
              aria-label="删除文件"
              title="删除文件"
              @click.stop="openNarrativeDeleteConfirm(row.id)"
            >
              ×
            </button>
          </div>
        </div>
      </section>
    </aside>

    <div
      class="narrative-sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整目录宽度"
      title="调整目录宽度"
      @mousedown="startNarrativeSidebarResize"
    />

    <section class="narrative-main">
      <div class="format-toolbar" role="toolbar" aria-label="文本编辑工具栏">
        <div class="toolbar-group toolbar-group-primary">
          <button
            type="button"
            class="toolbar-add-btn"
            aria-label="新增文件"
            @click="createNarrativeDocument()"
          >
            +
          </button>
        </div>

        <div v-for="(group, groupIndex) in toolbarGroups" :key="groupIndex" class="toolbar-group">
          <button
            v-for="item in group"
            :key="item.label"
            type="button"
            class="toolbar-tool"
            :aria-label="item.title"
            :title="item.title"
          >
            {{ item.label }}
          </button>
        </div>

        <div class="toolbar-group toolbar-status-group">
          <span class="editor-counts">{{ characterEditorStats.characters }} 字</span>
          <span
            class="autosave-hint"
            :class="{
              saving: savingNarrative,
              error: narrativeSaveState === 'error' || externalDocumentConflict
            }"
          >
            {{ narrativeSaveHint }}
          </span>
          <button
            type="button"
            class="toolbar-tool ai-panel-toggle"
            :class="{ active: showNarrativeAiPanel }"
            :aria-pressed="showNarrativeAiPanel"
            aria-label="打开 AI 对话侧边栏"
            title="AI 对话"
            @click="toggleNarrativeAiPanel"
          >
            AI
          </button>
          <button
            type="button"
            class="toolbar-tool history-panel-toggle"
            :class="{ active: showNarrativeHistoryPanel }"
            :aria-pressed="showNarrativeHistoryPanel"
            aria-label="打开文档版本"
            title="版本"
            @click="toggleNarrativeHistoryPanel"
          >
            版本
          </button>
        </div>
      </div>

      <main
        v-if="activeDocument"
        class="editor-workspace"
        :class="{ 'ai-panel-open': showNarrativeAiPanel || showNarrativeHistoryPanel }"
      >
        <WorldRichTextAppearancePanel
          v-if="showAppearancePanel"
          v-model="characterEditorAppearance"
          class="appearance-popover"
        />

        <section class="document-canvas">
          <div class="document-scroll-region">
            <div class="document-content-column">
              <input
                v-model="activeDocumentTitle"
                class="document-heading-input"
                type="text"
                aria-label="文件标题"
                placeholder="新建文件"
                @focus="handleNarrativeTitleFocus"
                @blur="handleNarrativeTitleBlur"
              />
            </div>

            <WorldRichTextEditor
              v-if="activeDocument"
              :key="activeDocumentId"
              ref="narrativeEditorRef"
              v-model="characterDescriptionInput"
              class="narrative-editor"
              :placeholder="documentPlaceholder"
              :appearance="characterEditorAppearance"
              :show-toolbar-meta="false"
              :show-toolbar="false"
              theme="light"
              @stats-change="characterEditorStats = $event"
            />
          </div>
        </section>

        <div
          v-if="showNarrativeAiPanel || showNarrativeHistoryPanel"
          class="narrative-ai-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整 AI 对话宽度"
          title="调整 AI 对话宽度"
          @mousedown="startNarrativeAiPanelResize"
        />

        <aside v-if="showNarrativeAiPanel" class="narrative-ai-panel">
          <CompactAIChatPanel
            @close="showNarrativeAiPanel = false"
            @document-diff-locate="handleAgentDocumentDiffLocate"
          />
        </aside>

        <aside v-else-if="showNarrativeHistoryPanel" class="narrative-history-panel">
          <header class="history-panel-head">
            <div>
              <strong>版本</strong>
              <small>{{ activeDocumentBranch?.name || '整个世界文档库' }}</small>
            </div>
            <button type="button" aria-label="关闭版本" @click="showNarrativeHistoryPanel = false">
              ×
            </button>
          </header>

          <section v-if="versionStatus" class="history-status-bar">
            <select
              :value="versionStatus.branches.find((branch) => branch.active)?.id"
              aria-label="当前设定方案"
              @change="switchDocumentBranch(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="branch in versionStatus.branches" :key="branch.id" :value="branch.id">
                {{ branch.name }}
              </option>
            </select>
            <span>HEAD #{{ versionStatus.head?.sequence ?? 0 }}</span>
            <span v-if="versionStatus.pending.documentCount">
              {{ versionStatus.pending.documentCount }} 份文档待创建版本
            </span>
            <span :class="versionStatus.integrity.ok ? 'healthy' : 'unhealthy'">
              {{ versionStatus.integrity.ok ? '历史完整' : '历史需检查' }}
            </span>
          </section>

          <section class="history-create-version">
            <input
              v-model="versionSummaryDraft"
              type="text"
              maxlength="120"
              placeholder="版本说明（可选）"
              @keydown.enter="createNarrativeVersion"
            />
            <button
              type="button"
              :disabled="creatingNarrativeVersion || !hasPendingHumanVersionChanges"
              @click="createNarrativeVersion"
            >
              {{ creatingNarrativeVersion ? '创建中' : '创建版本' }}
            </button>
          </section>

          <details class="history-management">
            <summary>版本管理</summary>
            <div class="history-tools">
              <input v-model="activeBranchDraftName" maxlength="60" placeholder="当前方案名称" />
              <button
                type="button"
                :disabled="!canRenameActiveBranch"
                @click="renameActiveDocumentBranch"
              >
                重命名
              </button>
              <input v-model="branchDraftName" maxlength="60" placeholder="新方案名称" />
              <button
                type="button"
                :disabled="!branchDraftName.trim()"
                @click="createDocumentBranch"
              >
                新建方案
              </button>
              <select v-model="mergeSourceBranchId" aria-label="待合并方案">
                <option value="">选择待合并方案</option>
                <option
                  v-for="branch in versionStatus?.branches.filter((item) => !item.active) ?? []"
                  :key="branch.id"
                  :value="branch.id"
                >
                  {{ branch.name }}
                </option>
              </select>
              <button type="button" :disabled="!mergeSourceBranchId" @click="previewDocumentMerge">
                合并方案
              </button>
              <button
                type="button"
                :disabled="!mergeSourceBranchId"
                @click="showBranchDeleteConfirm = true"
              >
                删除方案
              </button>
              <select v-model="comparisonBaseCommitId" aria-label="比较基准版本">
                <option value="">选择比较基准</option>
                <option
                  v-for="commit in documentHistory.commits"
                  :key="commit.id"
                  :value="commit.id"
                >
                  #{{ commit.sequence }} {{ commit.summary }}
                </option>
              </select>
              <button
                type="button"
                :disabled="
                  !comparisonBaseCommitId || comparisonBaseCommitId === selectedHistoryCommitId
                "
                @click="compareSelectedHistory"
              >
                比较
              </button>
              <input v-model="checkpointDraftName" maxlength="80" placeholder="检查点名称" />
              <button
                type="button"
                :disabled="!checkpointDraftName.trim()"
                @click="createCheckpointForSelected"
              >
                保存检查点
              </button>
              <button type="button" title="导出完整版本历史" @click="exportDocumentHistory">
                导出版本
              </button>
              <button type="button" title="校验并导入版本包" @click="importDocumentHistory">
                导入版本
              </button>
              <button
                type="button"
                title="检查并清理不可达版本对象"
                @click="previewDocumentHistoryCleanup"
              >
                清理对象
              </button>
            </div>
          </details>

          <section v-if="mergePreview" class="history-merge-preview">
            <header>
              <strong>合并「{{ mergePreview.sourceBranch.name }}」</strong>
              <span>{{ mergePreview.autoMergedDocumentIds.length }} 项可自动合并</span>
            </header>
            <article v-for="conflict in mergePreview.conflicts" :key="conflict.documentId">
              <strong>{{ conflict.title }}</strong>
              <small>{{
                conflict.reason === 'delete_modify' ? '删除与修改冲突' : '双方都修改了此文档'
              }}</small>
              <div>
                <label
                  ><input
                    v-model="mergeResolutions[conflict.documentId]"
                    type="radio"
                    :name="`merge-${conflict.documentId}`"
                    value="current"
                  />保留当前方案</label
                >
                <label
                  ><input
                    v-model="mergeResolutions[conflict.documentId]"
                    type="radio"
                    :name="`merge-${conflict.documentId}`"
                    value="incoming"
                  />采用来源方案</label
                >
              </div>
            </article>
            <footer>
              <button type="button" @click="mergePreview = null">取消</button>
              <button type="button" :disabled="!canApplyMerge" @click="applyDocumentMerge">
                确认合并
              </button>
            </footer>
          </section>

          <div v-if="documentCheckpoints.length" class="history-checkpoints">
            <button
              v-for="checkpoint in documentCheckpoints"
              :key="checkpoint.id"
              type="button"
              @click="selectHistoryCommit(checkpoint.commitId)"
            >
              <span>{{ checkpoint.name }}</span>
              <small @click.stop="removeCheckpoint(checkpoint.id)">×</small>
            </button>
          </div>

          <div v-if="historyLoading" class="history-panel-state">正在读取历史...</div>
          <div v-else-if="historyError" class="history-panel-state error">{{ historyError }}</div>
          <div v-else-if="documentHistory.commits.length === 0" class="history-panel-state">
            尚无正式版本
          </div>
          <div v-else class="history-panel-body">
            <section class="version-tree-section">
              <header class="history-tree-head">
                <strong>版本树</strong>
                <label>
                  <input v-model="historyCurrentDocumentOnly" type="checkbox" /> 当前文档
                </label>
              </header>
              <input
                v-model="historySearchQuery"
                class="history-tree-search"
                type="search"
                placeholder="搜索版本"
              />
              <nav class="history-commit-list" aria-label="版本树">
                <button
                  v-for="(commit, commitIndex) in filteredHistoryCommits"
                  :key="commit.id"
                  type="button"
                  class="history-commit-item"
                  :class="{ active: selectedHistoryCommitId === commit.id }"
                  @click="selectHistoryCommit(commit.id)"
                >
                  <span class="history-graph-lane" aria-hidden="true">
                    <i :class="{ merge: !!commit.mergeParentCommitId }" />
                    <b v-if="commitIndex < filteredHistoryCommits.length - 1" />
                  </span>
                  <span class="history-commit-copy">
                    <span class="history-commit-title">{{
                      commit.isBaseline
                        ? '初始文档库'
                        : commit.summary || `版本 #${commit.sequence}`
                    }}</span>
                    <span class="history-commit-meta">
                      #{{ commit.sequence }} ·
                      {{ commit.isBaseline ? '初始版本' : historyOriginLabel(commit.origin) }} ·
                      {{ formatHistoryTime(commit.createdAt) }}
                    </span>
                  </span>
                  <span class="history-commit-badges">
                    <span
                      v-if="commit.id === documentHistory.headCommitId"
                      class="history-head-badge"
                      >HEAD</span
                    >
                    <span v-if="commit.mergeParentCommitId" class="history-merge-badge">合并</span>
                    <span class="history-commit-count">{{ commit.changeCount }}</span>
                  </span>
                  <span v-if="checkpointNamesByCommit[commit.id]" class="history-checkpoint-badge">
                    {{ checkpointNamesByCommit[commit.id] }}
                  </span>
                </button>
              </nav>
            </section>

            <section class="history-detail file-tree-section">
              <div v-if="historyDetailLoading" class="history-panel-state">正在生成 Diff...</div>
              <template v-else-if="selectedHistoryDetail">
                <header class="history-detail-head">
                  <div>
                    <strong>文件树</strong>
                    <small>{{
                      historyComparison
                        ? `${historyComparison.changes.length} 项差异`
                        : selectedHistoryDetail.commit.summary
                    }}</small>
                  </div>
                  <div class="history-detail-actions">
                    <button
                      v-if="historyComparison"
                      type="button"
                      @click="historyComparison = null"
                    >
                      退出比较
                    </button>
                    <button
                      v-if="!historyComparison"
                      type="button"
                      :disabled="restoringHistory || !selectedHistoryDetail.commit.parentCommitId"
                      title="反向应用这个版本的变化，并创建新版本"
                      @click="requestHistoryCommitAction('revert')"
                    >
                      撤销此版
                    </button>
                    <button
                      v-if="!historyComparison"
                      type="button"
                      :disabled="
                        restoringHistory ||
                        selectedHistoryDetail.commit.id === documentHistory.headCommitId
                      "
                      title="把这个版本的变化应用到当前方案，并创建新版本"
                      @click="requestHistoryCommitAction('cherry_pick')"
                    >
                      摘取此版
                    </button>
                    <button
                      type="button"
                      class="history-restore-btn"
                      :disabled="
                        restoringHistory ||
                        selectedHistoryDetail.commit.id === documentHistory.headCommitId
                      "
                      @click="showHistoryRestoreConfirm = true"
                    >
                      {{
                        selectedHistoryDetail.commit.id === documentHistory.headCommitId
                          ? '当前版本'
                          : selectedHistoryDocumentIds.length
                            ? `恢复所选 (${selectedHistoryDocumentIds.length})`
                            : '恢复全部'
                      }}
                    </button>
                  </div>
                </header>

                <div
                  v-if="historyFileTreeGroups.length"
                  class="history-file-tree"
                  role="tree"
                  aria-label="文件树"
                >
                  <section
                    v-for="group in historyFileTreeGroups"
                    :key="group.key"
                    class="history-file-group"
                  >
                    <header>
                      <strong>{{ group.label }}</strong>
                      <small>{{ group.typeLabel }}</small>
                    </header>
                    <button
                      v-for="item in group.items"
                      :key="item.documentId"
                      type="button"
                      class="history-file-item"
                      :class="{
                        active: selectedHistoryFileId === item.documentId,
                        deleted: item.change?.operation === 'delete'
                      }"
                      :style="{ '--history-file-depth': item.depth }"
                      role="treeitem"
                      @click="selectedHistoryFileId = item.documentId"
                    >
                      <input
                        v-if="!historyComparison"
                        v-model="selectedHistoryDocumentIds"
                        type="checkbox"
                        :value="item.documentId"
                        :aria-label="`选择 ${item.title}`"
                        @click.stop
                      />
                      <span class="history-file-branch" aria-hidden="true">{{
                        item.depth ? '└' : '·'
                      }}</span>
                      <span class="history-file-title">{{ item.title }}</span>
                      <span
                        v-if="item.change"
                        class="history-operation"
                        :class="item.change.operation"
                      >
                        {{ historyOperationLabel(item.change.operation) }}
                      </span>
                    </button>
                  </section>
                </div>
                <div v-else class="history-panel-state">这个版本没有匹配的文件变化</div>

                <article v-if="selectedHistoryFileState" class="history-change history-file-detail">
                  <header>
                    <strong>{{ selectedHistoryFileState.title || '未命名文档' }}</strong>
                    <span
                      v-if="selectedHistoryFileChange"
                      class="history-operation"
                      :class="selectedHistoryFileChange.operation"
                    >
                      {{ historyOperationLabel(selectedHistoryFileChange?.operation ?? 'update') }}
                    </span>
                  </header>
                  <p v-if="describeHistoryMetadataChange(selectedHistoryFileChange)">
                    {{ describeHistoryMetadataChange(selectedHistoryFileChange) }}
                  </p>
                  <WorldDocumentDiffCard
                    v-if="selectedHistoryFileChange?.contentDiff"
                    class="history-diff"
                    :diff="selectedHistoryFileChange.contentDiff"
                    @locate="handleHistoryDiffLocate"
                  />
                  <p v-else-if="!selectedHistoryFileChange">
                    此文档包含在该版本中，本次提交未修改它。
                  </p>
                  <p v-else>本次提交只调整了文档信息或目录位置，正文没有变化。</p>
                </article>
              </template>
            </section>
          </div>
        </aside>

        <aside v-else class="outline-panel">
          <h2>大纲</h2>
          <div v-if="outlineItems.length === 0" class="outline-empty">暂无标题</div>
          <button
            v-for="item in outlineItems"
            :key="`${item.level}-${item.text}`"
            type="button"
            class="outline-item"
            :class="`level-${item.level}`"
          >
            {{ item.text }}
          </button>
        </aside>
      </main>

      <main v-else-if="missingRouteDocument" class="editor-empty-state">
        <strong>无法打开这份文档</strong>
        <span>链接中的文档不存在或来自旧版实体入口，请从左侧文档树重新选择。</span>
      </main>

      <main v-else-if="canCreateNarrativeDocument" class="editor-empty-state">
        <strong>{{ currentDocumentOwnerLabel }}</strong>
        <span>这个世界还没有文档</span>
        <button type="button" @click="createNarrativeDocument()">新建文档</button>
      </main>

      <main v-else class="editor-loading">正在读取世界文档</main>
    </section>

    <ConfirmDialog
      v-model="showNarrativeDeleteConfirm"
      title="确认删除文件？"
      :message="narrativeDeleteConfirmMessage"
      confirm-text="删除"
      loading-text="正在删除..."
      danger
      icon="danger"
      :loading="deletingNarrativeDocument"
      @confirm="confirmDeleteNarrativeDocument"
      @cancel="cancelNarrativeDeleteConfirm"
    />
    <ConfirmDialog
      v-model="showHistoryRestoreConfirm"
      :title="selectedHistoryDocumentIds.length ? '恢复所选文档？' : '恢复整个文档库？'"
      :message="historyRestoreConfirmMessage"
      confirm-text="创建恢复版本"
      loading-text="正在恢复..."
      icon="warning"
      size="lg"
      :loading="restoringHistory"
      @confirm="confirmHistoryRestore"
    />
    <ConfirmDialog
      v-model="showHistoryCommitActionConfirm"
      :title="historyCommitAction === 'revert' ? '撤销这个版本？' : '摘取这个版本？'"
      :message="historyCommitActionMessage"
      :confirm-text="historyCommitAction === 'revert' ? '创建撤销版本' : '创建摘取版本'"
      loading-text="正在应用..."
      icon="warning"
      size="lg"
      :loading="restoringHistory"
      @confirm="confirmHistoryCommitAction"
    />
    <ConfirmDialog
      v-model="showBranchDeleteConfirm"
      title="删除这个设定方案？"
      message="只会移除方案入口，不会立即删除其历史对象；其他方案和检查点仍然保留。"
      confirm-text="删除方案"
      loading-text="正在删除..."
      danger
      icon="danger"
      :loading="branchOperationLoading"
      @confirm="confirmDeleteDocumentBranch"
    />
    <ConfirmDialog
      v-model="showHistoryCleanupConfirm"
      title="清理无引用的版本对象？"
      :message="historyCleanupMessage"
      confirm-text="开始清理"
      loading-text="正在清理..."
      icon="warning"
      :loading="historyCleanupLoading"
      @confirm="confirmDocumentHistoryCleanup"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { WorldPayload } from '@share/cache/worldbuilding/worldbuilding'
import {
  type WorldEntityDocumentChangeEvent,
  type WorldEntityDocumentPayload
} from '@share/cache/worldbuilding/worldEntityDocument'
import type {
  WorldDocumentMergePreviewPayload,
  WorldDocumentCheckpointPayload,
  WorldDocumentCommitComparisonPayload,
  WorldDocumentCommitChangePayload,
  WorldDocumentCommitDetailPayload,
  WorldDocumentCommitHistoryPayload,
  WorldDocumentHistoryOperation,
  WorldDocumentHistoryOrigin,
  WorldDocumentHistoryNodeState,
  WorldDocumentDiffHunk,
  WorldDocumentVersionStatusPayload
} from '@share/cache/worldbuilding/worldDocumentHistory'
import { worldbuildingClientService } from '../services/worldbuildingClientService'
import { agentWorkspaceContextService } from '../services/agentWorkspaceContextService'
import { SerialSaveCoordinator } from '../services/serialSaveCoordinator'
import { useKeyboardShortcut } from '../utils/useKeyboardShortcut'
import { useAppTitleBar } from '../composables/useAppTitleBar'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import WorldDocumentDiffCard from '../components/WorldDocumentDiffCard.vue'
import CompactAIChatPanel from '../features/chat/components/CompactAIChatPanel.vue'
import type { ChatMessageDocumentDiffReference } from '@share/cache/render/aiagent/chatMessage'
import WorldRichTextAppearancePanel from '../features/worldbuilding/editor/components/WorldRichTextAppearancePanel.vue'
import WorldRichTextEditor from '../features/worldbuilding/editor/components/WorldRichTextEditor.vue'
import {
  DEFAULT_WORLD_RICH_TEXT_APPEARANCE,
  normalizeWorldRichTextAppearance,
  type WorldRichTextAppearance
} from '../features/worldbuilding/editor/model/editorAppearance'
import '../styles/worldbuildingWhiteTheme.css'

const route = useRoute()
const router = useRouter()

type NarrativeTreeNode = WorldEntityDocumentPayload & {
  children: NarrativeTreeNode[]
  depth: number
}

type NarrativeDropPosition = 'before' | 'after' | 'inside'
type NarrativeSaveSnapshot = {
  signature: string
  documentId: string
  expectedRevision: number
  title: string
  contentHtml: string
  historySessionId: string
}

const NARRATIVE_SIDEBAR_WIDTH_RATIO_STORAGE_KEY =
  'worldedit.worldEntityDocuments.sidebarWidthRatio.v1'
const NARRATIVE_AI_PANEL_WIDTH_STORAGE_KEY = 'worldedit.worldEntityDocuments.aiPanelWidth.v1'
const DEFAULT_NARRATIVE_SIDEBAR_WIDTH_RATIO = 0.185
const MIN_NARRATIVE_SIDEBAR_WIDTH_RATIO = 0.1
const MAX_NARRATIVE_SIDEBAR_WIDTH_RATIO = 0.2
const DEFAULT_NARRATIVE_AI_PANEL_WIDTH = 420
const MIN_NARRATIVE_AI_PANEL_WIDTH = 240
const MAX_NARRATIVE_AI_PANEL_WIDTH = 640

const worldDetail = ref<WorldPayload | null>(null)
const narrativeDocuments = ref<WorldEntityDocumentPayload[]>([])
const activeDocumentId = ref('')
const activeDocumentTitle = ref('新建文件')
const characterDescriptionInput = ref('')
const narrativeEditorRef = ref<{
  locateDiff: (location: WorldDocumentDiffHunk) => boolean
} | null>(null)
const characterEditorAppearance = ref<WorldRichTextAppearance>(DEFAULT_WORLD_RICH_TEXT_APPEARANCE)
const characterEditorStats = ref({ words: 0, characters: 0 })
const showAppearancePanel = ref(false)
const savingNarrative = ref(false)
const narrativeSaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const externalDocumentConflict = ref(false)
const narrativeDocumentsLoading = ref(false)
const documentWorkspaceLoaded = ref(false)
const documentSearchQuery = ref('')
const narrativeTitleFocused = ref(false)
const showNarrativeDeleteConfirm = ref(false)
const deletingNarrativeDocument = ref(false)
const pendingDeleteDocumentId = ref('')
const draggingDocumentId = ref('')
const dropTarget = ref<{ documentId: string; position: NarrativeDropPosition } | null>(null)
const narrativeSidebarWidth = ref(356)
const resizingNarrativeSidebar = ref(false)
const showNarrativeAiPanel = ref(false)
const showNarrativeHistoryPanel = ref(false)
const narrativeAiPanelWidth = ref(DEFAULT_NARRATIVE_AI_PANEL_WIDTH)
const resizingNarrativeAiPanel = ref(false)
const historyLoading = ref(false)
const historyDetailLoading = ref(false)
const historyError = ref('')
const documentHistory = ref<WorldDocumentCommitHistoryPayload>({ commits: [] })
const selectedHistoryCommitId = ref('')
const selectedHistoryDetail = ref<WorldDocumentCommitDetailPayload | null>(null)
const showHistoryRestoreConfirm = ref(false)
const showHistoryCommitActionConfirm = ref(false)
const historyCommitAction = ref<'revert' | 'cherry_pick' | null>(null)
const restoringHistory = ref(false)
const versionStatus = ref<WorldDocumentVersionStatusPayload | null>(null)
const documentCheckpoints = ref<WorldDocumentCheckpointPayload[]>([])
const historySearchQuery = ref('')
const historyCurrentDocumentOnly = ref(false)
const selectedHistoryDocumentIds = ref<string[]>([])
const selectedHistoryFileId = ref('')
const comparisonBaseCommitId = ref('')
const historyComparison = ref<WorldDocumentCommitComparisonPayload | null>(null)
const versionSummaryDraft = ref('')
const creatingNarrativeVersion = ref(false)
const narrativeVersionDirty = ref(false)
const checkpointDraftName = ref('')
const branchDraftName = ref('')
const activeBranchDraftName = ref('')
const showBranchDeleteConfirm = ref(false)
const branchOperationLoading = ref(false)
const showHistoryCleanupConfirm = ref(false)
const historyCleanupLoading = ref(false)
const historyCleanupPreview = ref({ removedTreeCount: 0, removedContentVersionCount: 0 })
const mergeSourceBranchId = ref('')
const mergePreview = ref<WorldDocumentMergePreviewPayload | null>(null)
const mergeResolutions = ref<Record<string, 'current' | 'incoming'>>({})
const canApplyMerge = computed(
  () =>
    !!mergePreview.value &&
    mergePreview.value.conflicts.every((conflict) => !!mergeResolutions.value[conflict.documentId])
)
const activeDocumentBranch = computed(
  () => versionStatus.value?.branches.find((branch) => branch.active) ?? null
)
const hasPendingHumanVersionChanges = computed(
  () =>
    narrativeVersionDirty.value ||
    Boolean(versionStatus.value?.pending.origins.includes('human'))
)
const canRenameActiveBranch = computed(() => {
  const name = activeBranchDraftName.value.trim()
  return !!activeDocumentBranch.value && !!name && name !== activeDocumentBranch.value.name
})
const historyCleanupMessage = computed(() =>
  historyCleanupPreview.value.removedTreeCount +
    historyCleanupPreview.value.removedContentVersionCount ===
  0
    ? '没有发现可清理的版本对象。'
    : `将删除 ${historyCleanupPreview.value.removedTreeCount} 个无引用目录对象和 ${historyCleanupPreview.value.removedContentVersionCount} 个无引用内容版本。所有可从提交、方案或检查点访问的历史都会保留。`
)

const checkpointNamesByCommit = computed<Record<string, string>>(() =>
  Object.fromEntries(
    documentCheckpoints.value.map((checkpoint) => [checkpoint.commitId, checkpoint.name])
  )
)
const filteredHistoryCommits = computed(() => {
  const query = historySearchQuery.value.trim().toLocaleLowerCase()
  return documentHistory.value.commits.filter((commit) => {
    if (
      historyCurrentDocumentOnly.value &&
      activeDocumentId.value &&
      !commit.isBaseline &&
      !commit.documentIds.includes(activeDocumentId.value)
    )
      return false
    return (
      !query ||
      `${commit.summary} ${commit.sequence} ${checkpointNamesByCommit.value[commit.id] ?? ''}`
        .toLocaleLowerCase()
        .includes(query)
    )
  })
})
const displayedHistoryChanges = computed(
  () => historyComparison.value?.changes ?? selectedHistoryDetail.value?.changes ?? []
)
const selectedHistoryFileChange = computed(
  () =>
    displayedHistoryChanges.value.find(
      (change) => change.documentId === selectedHistoryFileId.value
    ) ?? null
)
const historyFileTreeStates = computed(() => {
  const states = new Map(
    (selectedHistoryDetail.value?.documents ?? []).map((state) => [state.documentId, state])
  )
  for (const change of displayedHistoryChanges.value) {
    const state = change.after ?? change.before
    if (state && !states.has(state.documentId)) states.set(state.documentId, state)
  }
  return [...states.values()]
})
const selectedHistoryFileState = computed(
  () =>
    historyFileTreeStates.value.find((state) => state.documentId === selectedHistoryFileId.value) ??
    null
)

watch(
  historyFileTreeStates,
  (states) => {
    if (!states.some((state) => state.documentId === selectedHistoryFileId.value)) {
      selectedHistoryFileId.value = states[0]?.documentId ?? ''
    }
  },
  { immediate: true }
)

let syncingFromDetail = false
let narrativeAutosaveTimer: ReturnType<typeof setTimeout> | null = null
let lastSavedNarrativeSignature = ''
let removeDocumentChangeListener: (() => void) | null = null
const narrativeSaveCoordinator = new SerialSaveCoordinator<NarrativeSaveSnapshot>()

const narrativeHistorySessionStorageKey = (): string =>
  `world-document-working-session:${String(route.params.worldId || '').trim()}`

const createNarrativeHistorySessionId = (): string => {
  const sessionId = crypto.randomUUID()
  localStorage.setItem(narrativeHistorySessionStorageKey(), sessionId)
  return sessionId
}

const loadNarrativeHistorySessionId = (): string => {
  const stored = localStorage.getItem(narrativeHistorySessionStorageKey())?.trim()
  return stored || createNarrativeHistorySessionId()
}

const narrativeHistorySessionId = ref(loadNarrativeHistorySessionId())

const reconcileNarrativeHistorySession = async (): Promise<void> => {
  if (!worldId.value) return
  const resolution =
    await worldbuildingClientService.resolveWorldEntityDocumentHistorySession({
      worldId: worldId.value,
      preferredSessionId: narrativeHistorySessionId.value
    })
  narrativeHistorySessionId.value = resolution.sessionId
  localStorage.setItem(narrativeHistorySessionStorageKey(), resolution.sessionId)
}

const worldId = computed(() => String(route.params.worldId || ''))
const routeDocumentId = computed(() => String(route.params.documentId || ''))
const titleBarWorldName = computed(() => worldDetail.value?.name?.trim() || '世界文档库')
const titleBarEntityContext = computed(() => '文档')
const narrativeSidebarStyle = computed(() => ({
  '--narrative-sidebar-width': `${narrativeSidebarWidth.value}px`,
  '--narrative-outline-width': `${MIN_NARRATIVE_AI_PANEL_WIDTH}px`,
  '--narrative-ai-panel-width': `${narrativeAiPanelWidth.value}px`
}))

type HistoryFileTreeItem = {
  documentId: string
  state: WorldDocumentHistoryNodeState
  change: WorldDocumentCommitChangePayload | null
  title: string
  sortKey: string
  parentDocumentId: string | null
  depth: number
}

type HistoryFileTreeGroup = {
  key: string
  label: string
  typeLabel: string
  order: number
  items: HistoryFileTreeItem[]
}

const historyFileTreeGroups = computed<HistoryFileTreeGroup[]>(() => {
  const changesByDocumentId = new Map(
    displayedHistoryChanges.value.map((change) => [change.documentId, change])
  )
  const group: HistoryFileTreeGroup = {
    key: 'world-documents',
    label: '全部文档',
    typeLabel: '世界',
    order: 0,
    items: []
  }

  for (const state of historyFileTreeStates.value) {
    group.items.push({
      documentId: state.documentId,
      state,
      change: changesByDocumentId.get(state.documentId) ?? null,
      title: state.title || '未命名文档',
      sortKey: state.sortKey,
      parentDocumentId: state.parentDocumentId,
      depth: 0
    })
  }

  const sortItems = (a: HistoryFileTreeItem, b: HistoryFileTreeItem): number =>
    a.sortKey.localeCompare(b.sortKey) || a.title.localeCompare(b.title, 'zh-CN')

  {
    const itemsById = new Map(group.items.map((item) => [item.documentId, item]))
    const childrenByParent = new Map<string, HistoryFileTreeItem[]>()
    const roots: HistoryFileTreeItem[] = []

    for (const item of group.items) {
      if (item.parentDocumentId && itemsById.has(item.parentDocumentId)) {
        const children = childrenByParent.get(item.parentDocumentId) ?? []
        children.push(item)
        childrenByParent.set(item.parentDocumentId, children)
      } else {
        roots.push(item)
      }
    }

    const ordered: HistoryFileTreeItem[] = []
    const visited = new Set<string>()
    const append = (item: HistoryFileTreeItem, depth: number): void => {
      if (visited.has(item.documentId)) return
      visited.add(item.documentId)
      ordered.push({ ...item, depth })
      for (const child of (childrenByParent.get(item.documentId) ?? []).sort(sortItems)) {
        append(child, depth + 1)
      }
    }
    for (const root of roots.sort(sortItems)) append(root, 0)
    for (const item of group.items.sort(sortItems)) append(item, 0)
    group.items = ordered
  }

  return group.items.length ? [group] : []
})
const documentPlaceholder = computed(() => '写下世界、人物、地点、势力或其他设定。')
const activeDocument = computed(
  () => narrativeDocuments.value.find((document) => document.id === activeDocumentId.value) ?? null
)
watch(
  [worldDetail, activeDocument],
  ([world, document]) => {
    agentWorkspaceContextService.update({
      pageKind: 'document',
      routeName: 'WorldEntityDocumentEditor',
      world: worldId.value
        ? {
            id: worldId.value,
            name: world?.name
          }
        : undefined,
      entity: undefined,
      document: document
        ? {
            id: document.id,
            title: document.title,
            parentDocumentId: document.parentDocumentId,
            revision: document.revision
          }
        : undefined
    })
  },
  { immediate: true }
)

const canCreateNarrativeDocument = computed(() => Boolean(worldId.value))
const currentDocumentOwnerLabel = computed(() => worldDetail.value?.name || '世界文档')
const narrativeTree = computed<NarrativeTreeNode[]>(() => {
  const byParent = new Map<string, WorldEntityDocumentPayload[]>()

  for (const document of narrativeDocuments.value) {
    const parentKey = document.parentDocumentId || ''
    byParent.set(parentKey, [...(byParent.get(parentKey) ?? []), document])
  }

  for (const documents of byParent.values()) {
    documents.sort((a, b) => {
      const sortCompare = a.sortKey.localeCompare(b.sortKey)
      if (sortCompare !== 0) return sortCompare
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    })
  }

  const buildNodes = (parentDocumentId: string, depth: number): NarrativeTreeNode[] =>
    (byParent.get(parentDocumentId) ?? []).map((document) => ({
      ...document,
      depth,
      children: buildNodes(document.id, depth + 1)
    }))

  return buildNodes('', 0)
})
const narrativeTreeRows = computed<NarrativeTreeNode[]>(() => {
  const rows: NarrativeTreeNode[] = []
  const query = documentSearchQuery.value.trim().toLocaleLowerCase()
  const matchesQuery = (node: NarrativeTreeNode): boolean =>
    !query ||
    node.title.toLocaleLowerCase().includes(query) ||
    node.children.some(matchesQuery)
  const appendRows = (nodes: NarrativeTreeNode[]): void => {
    for (const node of nodes) {
      if (!matchesQuery(node)) continue
      rows.push(node)
      appendRows(node.children)
    }
  }
  appendRows(narrativeTree.value)
  return rows
})
const narrativeDocumentById = computed(
  () => new Map(narrativeDocuments.value.map((document) => [document.id, document]))
)
const missingRouteDocument = computed(
  () =>
    documentWorkspaceLoaded.value &&
    Boolean(routeDocumentId.value) &&
    !narrativeDocumentById.value.has(routeDocumentId.value)
)
const outlineItems = computed(() => {
  const items: Array<{ level: number; text: string }> = []
  const title = activeDocumentTitle.value.trim()
  if (title) {
    items.push({ level: 1, text: title })
  }

  if (typeof DOMParser === 'undefined') return items
  const html = characterDescriptionInput.value.trim()
  if (!html) return items

  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('h1, h2, h3').forEach((heading) => {
    const text = heading.textContent?.trim()
    if (!text) return
    const level = Number(heading.tagName.slice(1))
    items.push({ level, text })
  })

  return items
})

const toolbarGroups = [
  [
    { label: '↶', title: '撤销' },
    { label: '↷', title: '重做' },
    { label: '刷', title: '格式刷' },
    { label: '擦', title: '清除格式' }
  ],
  [
    { label: '正文⌄', title: '段落样式' },
    { label: '15px⌄', title: '字号' }
  ],
  [
    { label: 'B', title: '加粗' },
    { label: 'I', title: '斜体' },
    { label: 'S', title: '删除线' },
    { label: 'U', title: '下划线' },
    { label: 'T⌄', title: '文字样式' }
  ],
  [
    { label: 'A⌄', title: '文字颜色' },
    { label: '⌁⌄', title: '高亮' }
  ],
  [
    { label: '≡⌄', title: '对齐' },
    { label: '•☰', title: '无序列表' },
    { label: '1☰', title: '有序列表' },
    { label: '▾☰', title: '缩进' }
  ],
  [
    { label: '☑', title: '待办' },
    { label: '🔗', title: '链接' },
    { label: '❝', title: '引用' },
    { label: '─', title: '分割线' }
  ]
] as const

const canSaveNarrative = computed(() => Boolean(activeDocument.value))

const pendingDeleteDocument = computed(() =>
  pendingDeleteDocumentId.value ? getNarrativeDocument(pendingDeleteDocumentId.value) : null
)

const pendingDeleteDescendantIds = computed(() =>
  pendingDeleteDocumentId.value ? getNarrativeDescendantIds(pendingDeleteDocumentId.value) : []
)

const narrativeDeleteConfirmMessage = computed(() => {
  const document = pendingDeleteDocument.value
  if (!document) return '确认删除该文件吗？'
  const descendantCount = pendingDeleteDescendantIds.value.length
  return descendantCount > 0
    ? `删除「${document.title}」以及它的 ${descendantCount} 个子文件？`
    : `删除「${document.title}」？`
})

const narrativeSaveHint = computed(() => {
  if (externalDocumentConflict.value) return '检测到外部更新'
  if (narrativeSaveState.value === 'saving') return '自动保存中...'
  if (narrativeSaveState.value === 'saved') return '已自动保存'
  if (narrativeSaveState.value === 'error') return '自动保存失败'
  return '自动保存'
})

const getNarrativeSidebarBounds = (): { min: number; max: number } => {
  const viewportWidth = typeof window === 'undefined' ? 1920 : window.innerWidth
  return {
    min: Math.round(viewportWidth * MIN_NARRATIVE_SIDEBAR_WIDTH_RATIO),
    max: Math.round(viewportWidth * MAX_NARRATIVE_SIDEBAR_WIDTH_RATIO)
  }
}

const clampNarrativeSidebarWidth = (width: number): number => {
  const bounds = getNarrativeSidebarBounds()
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(width)))
}

const clampNarrativeSidebarRatio = (ratio: number): number =>
  Math.min(MAX_NARRATIVE_SIDEBAR_WIDTH_RATIO, Math.max(MIN_NARRATIVE_SIDEBAR_WIDTH_RATIO, ratio))

const getNarrativeViewportWidth = (): number =>
  typeof window === 'undefined' ? 1920 : Math.max(1, window.innerWidth)

const clampNarrativeAiPanelWidth = (width: number): number => {
  const viewportWidth = getNarrativeViewportWidth()
  const maxWidth = Math.min(MAX_NARRATIVE_AI_PANEL_WIDTH, Math.round(viewportWidth * 0.46))
  return Math.min(maxWidth, Math.max(MIN_NARRATIVE_AI_PANEL_WIDTH, Math.round(width)))
}

const loadNarrativeSidebarWidth = (): void => {
  if (typeof window === 'undefined') {
    narrativeSidebarWidth.value = clampNarrativeSidebarWidth(
      getNarrativeViewportWidth() * DEFAULT_NARRATIVE_SIDEBAR_WIDTH_RATIO
    )
    return
  }

  const storedRatio = Number(window.localStorage.getItem(NARRATIVE_SIDEBAR_WIDTH_RATIO_STORAGE_KEY))
  const ratio = Number.isFinite(storedRatio)
    ? clampNarrativeSidebarRatio(storedRatio)
    : DEFAULT_NARRATIVE_SIDEBAR_WIDTH_RATIO
  narrativeSidebarWidth.value = clampNarrativeSidebarWidth(getNarrativeViewportWidth() * ratio)
}

const loadNarrativeAiPanelWidth = (): void => {
  if (typeof window === 'undefined') {
    narrativeAiPanelWidth.value = DEFAULT_NARRATIVE_AI_PANEL_WIDTH
    return
  }
  const stored = Number(window.localStorage.getItem(NARRATIVE_AI_PANEL_WIDTH_STORAGE_KEY))
  narrativeAiPanelWidth.value = clampNarrativeAiPanelWidth(
    Number.isFinite(stored) ? stored : DEFAULT_NARRATIVE_AI_PANEL_WIDTH
  )
}

const persistNarrativeAiPanelWidth = (): void => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    NARRATIVE_AI_PANEL_WIDTH_STORAGE_KEY,
    String(clampNarrativeAiPanelWidth(narrativeAiPanelWidth.value))
  )
}

const persistNarrativeSidebarWidth = (): void => {
  if (typeof window === 'undefined') return
  const ratio = clampNarrativeSidebarRatio(
    narrativeSidebarWidth.value / getNarrativeViewportWidth()
  )
  window.localStorage.setItem(NARRATIVE_SIDEBAR_WIDTH_RATIO_STORAGE_KEY, ratio.toFixed(4))
}

const syncNarrativeSidebarWidthBounds = (): void => {
  narrativeSidebarWidth.value = clampNarrativeSidebarWidth(narrativeSidebarWidth.value)
  persistNarrativeSidebarWidth()
  narrativeAiPanelWidth.value = clampNarrativeAiPanelWidth(narrativeAiPanelWidth.value)
  persistNarrativeAiPanelWidth()
}

const handleNarrativeSidebarResizeMove = (event: MouseEvent): void => {
  if (!resizingNarrativeSidebar.value) return
  narrativeSidebarWidth.value = clampNarrativeSidebarWidth(event.clientX)
}

const stopNarrativeSidebarResize = (): void => {
  if (!resizingNarrativeSidebar.value) return
  resizingNarrativeSidebar.value = false
  persistNarrativeSidebarWidth()
  document.body.classList.remove('narrative-sidebar-resizing')
  window.removeEventListener('mousemove', handleNarrativeSidebarResizeMove)
  window.removeEventListener('mouseup', stopNarrativeSidebarResize)
}

const startNarrativeSidebarResize = (event: MouseEvent): void => {
  event.preventDefault()
  resizingNarrativeSidebar.value = true
  document.body.classList.add('narrative-sidebar-resizing')
  window.addEventListener('mousemove', handleNarrativeSidebarResizeMove)
  window.addEventListener('mouseup', stopNarrativeSidebarResize)
}

const handleNarrativeAiPanelResizeMove = (event: MouseEvent): void => {
  if (!resizingNarrativeAiPanel.value) return
  narrativeAiPanelWidth.value = clampNarrativeAiPanelWidth(
    getNarrativeViewportWidth() - event.clientX
  )
}

const stopNarrativeAiPanelResize = (): void => {
  if (!resizingNarrativeAiPanel.value) return
  resizingNarrativeAiPanel.value = false
  persistNarrativeAiPanelWidth()
  document.body.classList.remove('narrative-ai-panel-resizing')
  window.removeEventListener('mousemove', handleNarrativeAiPanelResizeMove)
  window.removeEventListener('mouseup', stopNarrativeAiPanelResize)
}

const startNarrativeAiPanelResize = (event: MouseEvent): void => {
  event.preventDefault()
  resizingNarrativeAiPanel.value = true
  document.body.classList.add('narrative-ai-panel-resizing')
  window.addEventListener('mousemove', handleNarrativeAiPanelResizeMove)
  window.addEventListener('mouseup', stopNarrativeAiPanelResize)
}

const toggleNarrativeAiPanel = (): void => {
  showNarrativeAiPanel.value = !showNarrativeAiPanel.value
  if (showNarrativeAiPanel.value) showNarrativeHistoryPanel.value = false
}

const historyOriginLabel = (origin: WorldDocumentHistoryOrigin): string => {
  if (origin === 'agent') return 'Agent'
  if (origin === 'human') return '手动编辑'
  return '系统'
}

const historyOperationLabel = (operation: WorldDocumentHistoryOperation): string => {
  if (operation === 'create') return '新增'
  if (operation === 'delete') return '删除'
  if (operation === 'move') return '移动'
  if (operation === 'mixed') return '组合修改'
  return '修改'
}

const formatHistoryTime = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

const describeHistoryMetadataChange = (change: WorldDocumentCommitChangePayload | null): string => {
  if (!change) return ''
  if (!change.before && change.after) return `加入到「${change.after.title}」所在目录。`
  if (change.before && !change.after) return `从文档树删除「${change.before.title}」。`
  if (!change.before || !change.after) return ''
  const descriptions: string[] = []
  if (change.before.title !== change.after.title) {
    descriptions.push(`重命名：${change.before.title} → ${change.after.title}`)
  }
  if (change.before.parentDocumentId !== change.after.parentDocumentId) {
    descriptions.push('文档位置发生变化')
  } else if (change.before.sortKey !== change.after.sortKey) {
    descriptions.push('文档顺序发生变化')
  }
  return descriptions.join('；')
}

const selectHistoryCommit = async (commitId: string): Promise<void> => {
  selectedHistoryCommitId.value = commitId
  selectedHistoryDetail.value = null
  selectedHistoryDocumentIds.value = []
  historyComparison.value = null
  historyDetailLoading.value = true
  try {
    selectedHistoryDetail.value =
      await worldbuildingClientService.getWorldDocumentCommitDetail(commitId)
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '读取版本详情失败'
  } finally {
    historyDetailLoading.value = false
  }
}

const refreshNarrativeVersionStatus = async (): Promise<WorldDocumentVersionStatusPayload> => {
  const status = await worldbuildingClientService.getWorldDocumentVersionStatus(worldId.value)
  versionStatus.value = status
  narrativeVersionDirty.value = status.pending.origins.includes('human')
  return status
}

const markNarrativeVersionChanged = (): void => {
  narrativeVersionDirty.value = true
  if (showNarrativeHistoryPanel.value) {
    void refreshNarrativeVersionStatus().catch(() => undefined)
  }
}

const loadNarrativeHistory = async (preferredCommitId?: string): Promise<void> => {
  if (!worldId.value) return
  historyLoading.value = true
  historyError.value = ''
  try {
    await worldbuildingClientService.initializeWorldDocumentHistory(worldId.value)
    const [history, status, checkpoints] = await Promise.all([
      worldbuildingClientService.listWorldDocumentCommitHistory(worldId.value, 100),
      worldbuildingClientService.getWorldDocumentVersionStatus(worldId.value),
      worldbuildingClientService.listWorldDocumentCheckpoints(worldId.value)
    ])
    documentHistory.value = history
    versionStatus.value = status
    narrativeVersionDirty.value = status.pending.origins.includes('human')
    activeBranchDraftName.value = status.branches.find((branch) => branch.active)?.name ?? ''
    documentCheckpoints.value = checkpoints
    const targetId =
      (preferredCommitId && history.commits.some((commit) => commit.id === preferredCommitId)
        ? preferredCommitId
        : history.commits[0]?.id) ?? ''
    if (targetId) await selectHistoryCommit(targetId)
    else {
      selectedHistoryCommitId.value = ''
      selectedHistoryDetail.value = null
    }
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '读取版本历史失败'
  } finally {
    historyLoading.value = false
  }
}

const createNarrativeVersion = async (): Promise<void> => {
  if (creatingNarrativeVersion.value) return
  creatingNarrativeVersion.value = true
  historyError.value = ''
  try {
    clearNarrativeAutosave()
    await saveNarrative(true, { fallbackBlankTitle: true })
    const status = await refreshNarrativeVersionStatus()
    if (!status.pending.origins.includes('human')) return
    await worldbuildingClientService.commitWorldEntityDocumentHistorySession({
      sessionId: narrativeHistorySessionId.value,
      summary: versionSummaryDraft.value.trim() || undefined
    })
    narrativeHistorySessionId.value = createNarrativeHistorySessionId()
    narrativeVersionDirty.value = false
    versionSummaryDraft.value = ''
    await loadNarrativeHistory()
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '创建版本失败'
  } finally {
    creatingNarrativeVersion.value = false
  }
}

const ensureNarrativeWorkingTreeClean = async (): Promise<boolean> => {
  clearNarrativeAutosave()
  await saveNarrative(true, { fallbackBlankTitle: true })
  const status = await refreshNarrativeVersionStatus()
  if (status.pending.documentCount === 0) return true
  historyError.value = `当前有 ${status.pending.documentCount} 份文档尚未创建版本，请先创建版本再继续。`
  return false
}

const toggleNarrativeHistoryPanel = async (): Promise<void> => {
  showNarrativeHistoryPanel.value = !showNarrativeHistoryPanel.value
  if (!showNarrativeHistoryPanel.value) return
  showNarrativeAiPanel.value = false
  clearNarrativeAutosave()
  await saveNarrative(true, { fallbackBlankTitle: true })
  await loadNarrativeHistory()
}

const historyRestoreConfirmMessage = computed(() => {
  const commit = selectedHistoryDetail.value?.commit
  if (!commit) return '系统会创建一个新的恢复版本，不会删除现有历史。'
  if (selectedHistoryDocumentIds.value.length) {
    return `将版本 #${commit.sequence} 中选中的 ${selectedHistoryDocumentIds.value.length} 份文档恢复到当前工作区。选择目录时会一并恢复其子文档。系统会创建一个新版本，现有历史不会被删除。`
  }
  return `将整个世界文档库恢复到版本 #${commit.sequence}。这可能同时恢复、移动或删除多份文档。系统会创建一个新的恢复版本，现有历史不会被删除。`
})

const historyCommitActionMessage = computed(() => {
  const commit = selectedHistoryDetail.value?.commit
  if (!commit || !historyCommitAction.value) return ''
  return historyCommitAction.value === 'revert'
    ? `系统会反向应用版本 #${commit.sequence} 涉及的文档变化，并在当前方案上创建一个新版本。原版本及后续历史都会保留。`
    : `系统会把版本 #${commit.sequence} 涉及的文档状态应用到当前方案，并创建一个新版本。若当前内容已变化，请先通过版本比较确认差异。`
})

const requestHistoryCommitAction = (mode: 'revert' | 'cherry_pick'): void => {
  historyCommitAction.value = mode
  showHistoryCommitActionConfirm.value = true
}

const createCheckpointForSelected = async (): Promise<void> => {
  const commitId = selectedHistoryCommitId.value
  const name = checkpointDraftName.value.trim()
  if (!commitId || !name) return
  try {
    await worldbuildingClientService.saveWorldDocumentCheckpoint({
      worldId: worldId.value,
      commitId,
      name
    })
    checkpointDraftName.value = ''
    documentCheckpoints.value = await worldbuildingClientService.listWorldDocumentCheckpoints(
      worldId.value
    )
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '保存检查点失败'
  }
}

const removeCheckpoint = async (checkpointId: string): Promise<void> => {
  try {
    await worldbuildingClientService.deleteWorldDocumentCheckpoint(checkpointId)
    documentCheckpoints.value = documentCheckpoints.value.filter((item) => item.id !== checkpointId)
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '删除检查点失败'
  }
}

const switchDocumentBranch = async (branchId: string): Promise<void> => {
  if (!branchId || versionStatus.value?.branches.find((branch) => branch.id === branchId)?.active)
    return
  historyError.value = ''
  try {
    if (!(await ensureNarrativeWorkingTreeClean())) return
    await worldbuildingClientService.switchWorldDocumentBranch(branchId)
    await reloadNarrativeDocumentsAfterRestore()
    await loadNarrativeHistory()
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '切换设定方案失败'
    await loadNarrativeHistory().catch(() => undefined)
  }
}

const createDocumentBranch = async (): Promise<void> => {
  const name = branchDraftName.value.trim()
  if (!name) return
  historyError.value = ''
  try {
    if (!(await ensureNarrativeWorkingTreeClean())) return
    const branch = await worldbuildingClientService.createWorldDocumentBranch({
      worldId: worldId.value,
      name,
      fromCommitId: selectedHistoryCommitId.value || undefined
    })
    branchDraftName.value = ''
    await switchDocumentBranch(branch.id)
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '创建设定方案失败'
  }
}

const renameActiveDocumentBranch = async (): Promise<void> => {
  const branch = activeDocumentBranch.value
  const name = activeBranchDraftName.value.trim()
  if (!branch || !name || name === branch.name) return
  branchOperationLoading.value = true
  historyError.value = ''
  try {
    await worldbuildingClientService.renameWorldDocumentBranch({ branchId: branch.id, name })
    await loadNarrativeHistory(selectedHistoryCommitId.value)
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '重命名设定方案失败'
  } finally {
    branchOperationLoading.value = false
  }
}

const confirmDeleteDocumentBranch = async (): Promise<void> => {
  const branchId = mergeSourceBranchId.value
  if (!branchId || branchOperationLoading.value) return
  branchOperationLoading.value = true
  historyError.value = ''
  try {
    await worldbuildingClientService.deleteWorldDocumentBranch(branchId)
    mergeSourceBranchId.value = ''
    mergePreview.value = null
    showBranchDeleteConfirm.value = false
    await loadNarrativeHistory(selectedHistoryCommitId.value)
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '删除设定方案失败'
  } finally {
    branchOperationLoading.value = false
  }
}

const previewDocumentMerge = async (): Promise<void> => {
  if (!mergeSourceBranchId.value) return
  historyError.value = ''
  try {
    if (!(await ensureNarrativeWorkingTreeClean())) return
    mergePreview.value = await worldbuildingClientService.previewWorldDocumentMerge({
      sourceBranchId: mergeSourceBranchId.value
    })
    mergeResolutions.value = {}
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '生成合并预览失败'
  }
}

const applyDocumentMerge = async (): Promise<void> => {
  if (!mergePreview.value || !canApplyMerge.value) return
  historyError.value = ''
  try {
    const commit = await worldbuildingClientService.applyWorldDocumentMerge({
      sourceBranchId: mergePreview.value.sourceBranch.id,
      expectedCurrentHeadCommitId: mergePreview.value.currentCommitId,
      resolutions: { ...mergeResolutions.value }
    })
    mergePreview.value = null
    mergeSourceBranchId.value = ''
    await reloadNarrativeDocumentsAfterRestore()
    await loadNarrativeHistory(commit.id)
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '合并方案失败'
  }
}

const exportDocumentHistory = async (): Promise<void> => {
  try {
    await worldbuildingClientService.exportWorldDocumentHistory(worldId.value)
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '导出版本历史失败'
  }
}

const importDocumentHistory = async (): Promise<void> => {
  historyError.value = ''
  try {
    if (!(await ensureNarrativeWorkingTreeClean())) return
    const result = await worldbuildingClientService.importWorldDocumentHistory(worldId.value)
    if (!result.imported) return
    await reloadNarrativeDocumentsAfterRestore()
    await loadNarrativeHistory()
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '导入版本历史失败'
  }
}

const previewDocumentHistoryCleanup = async (): Promise<void> => {
  historyCleanupLoading.value = true
  historyError.value = ''
  try {
    historyCleanupPreview.value = await worldbuildingClientService.pruneWorldDocumentHistory(true)
    showHistoryCleanupConfirm.value = true
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '检查版本对象失败'
  } finally {
    historyCleanupLoading.value = false
  }
}

const confirmDocumentHistoryCleanup = async (): Promise<void> => {
  if (historyCleanupLoading.value) return
  if (
    historyCleanupPreview.value.removedTreeCount +
      historyCleanupPreview.value.removedContentVersionCount ===
    0
  ) {
    showHistoryCleanupConfirm.value = false
    return
  }
  historyCleanupLoading.value = true
  historyError.value = ''
  try {
    await worldbuildingClientService.pruneWorldDocumentHistory(false)
    showHistoryCleanupConfirm.value = false
    await loadNarrativeHistory(selectedHistoryCommitId.value)
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '清理版本对象失败'
  } finally {
    historyCleanupLoading.value = false
  }
}

const compareSelectedHistory = async (): Promise<void> => {
  if (!comparisonBaseCommitId.value || !selectedHistoryCommitId.value) return
  historyDetailLoading.value = true
  historyError.value = ''
  try {
    historyComparison.value = await worldbuildingClientService.compareWorldDocumentCommits({
      baseCommitId: comparisonBaseCommitId.value,
      targetCommitId: selectedHistoryCommitId.value,
      documentIds:
        historyCurrentDocumentOnly.value && activeDocumentId.value
          ? [activeDocumentId.value]
          : undefined
    })
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '比较版本失败'
  } finally {
    historyDetailLoading.value = false
  }
}

const reloadNarrativeDocumentsAfterRestore = async (): Promise<void> => {
  if (!worldId.value) return
  const previousDocumentId = activeDocumentId.value
  const documents = await worldbuildingClientService.listWorldEntityDocuments(worldId.value)
  narrativeDocuments.value = documents
  syncNarrativeFromDocument(
    documents.find((document) => document.id === previousDocumentId) ?? documents[0] ?? null
  )
}

const confirmHistoryRestore = async (): Promise<void> => {
  const targetCommitId = selectedHistoryDetail.value?.commit.id
  if (!targetCommitId || restoringHistory.value) return
  restoringHistory.value = true
  historyError.value = ''
  try {
    if (!(await ensureNarrativeWorkingTreeClean())) return
    const freshHistory = await worldbuildingClientService.listWorldDocumentCommitHistory(
      worldId.value,
      1
    )
    if (!freshHistory.headCommitId) throw new Error('当前文档历史缺少可恢复的 HEAD。')
    const result = await worldbuildingClientService.restoreWorldDocumentCommit({
      targetCommitId,
      expectedHeadCommitId: freshHistory.headCommitId,
      documentIds: selectedHistoryDocumentIds.value.length
        ? [...selectedHistoryDocumentIds.value]
        : undefined
    })
    showHistoryRestoreConfirm.value = false
    await reloadNarrativeDocumentsAfterRestore()
    await loadNarrativeHistory(result.commit.id)
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '恢复文档历史失败'
  } finally {
    restoringHistory.value = false
  }
}

const confirmHistoryCommitAction = async (): Promise<void> => {
  const commitId = selectedHistoryDetail.value?.commit.id
  const mode = historyCommitAction.value
  if (!commitId || !mode || restoringHistory.value) return
  restoringHistory.value = true
  historyError.value = ''
  try {
    if (!(await ensureNarrativeWorkingTreeClean())) return
    const freshHistory = await worldbuildingClientService.listWorldDocumentCommitHistory(
      worldId.value,
      1
    )
    if (!freshHistory.headCommitId) throw new Error('当前文档历史缺少 HEAD。')
    const result = await worldbuildingClientService.applyWorldDocumentCommit({
      commitId,
      expectedHeadCommitId: freshHistory.headCommitId,
      mode
    })
    showHistoryCommitActionConfirm.value = false
    historyCommitAction.value = null
    await reloadNarrativeDocumentsAfterRestore()
    await loadNarrativeHistory(result.commit.id)
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '应用历史版本失败'
  } finally {
    restoringHistory.value = false
  }
}

useAppTitleBar(
  computed(() => ({
    title: titleBarWorldName.value,
    subtitle: titleBarEntityContext.value,
    meta: narrativeSaveHint.value
  }))
)

const narrativeAutosaveSignature = computed(() =>
  JSON.stringify({
    worldId: activeDocument.value?.worldId || worldId.value,
    documentId: activeDocumentId.value,
    title: activeDocumentTitle.value,
    description: characterDescriptionInput.value,
    editorAppearance: normalizeWorldRichTextAppearance(characterEditorAppearance.value)
  })
)

const normalizeNarrativeTitleForCommit = (): void => {
  activeDocumentTitle.value = activeDocumentTitle.value.trim() || '新建文件'
}

const handleNarrativeTitleFocus = (): void => {
  narrativeTitleFocused.value = true
}

const handleNarrativeTitleBlur = (): void => {
  narrativeTitleFocused.value = false
  normalizeNarrativeTitleForCommit()
  void saveNarrative(true, { fallbackBlankTitle: true })
}

const syncNarrativeFromDocument = (document: WorldEntityDocumentPayload | null): void => {
  activeDocumentId.value = document?.id ?? ''
  activeDocumentTitle.value = document?.title || '新建文件'
  characterDescriptionInput.value = document?.contentHtml || ''
  lastSavedNarrativeSignature = narrativeAutosaveSignature.value
  narrativeSaveState.value = 'saved'
  externalDocumentConflict.value = false
}

const replaceNarrativeDocument = (nextDocument: WorldEntityDocumentPayload): void => {
  narrativeDocuments.value = [
    ...narrativeDocuments.value.filter((document) => document.id !== nextDocument.id),
    nextDocument
  ]
}

const createSortKeyForIndex = (index: number): string => String(index + 1).padStart(6, '0')

const getNarrativeDocument = (documentId: string): WorldEntityDocumentPayload | null =>
  narrativeDocumentById.value.get(documentId) ?? null

const getNarrativeChildren = (parentDocumentId: string | null): WorldEntityDocumentPayload[] =>
  narrativeDocuments.value
    .filter((document) => (document.parentDocumentId || null) === parentDocumentId)
    .sort((a, b) => {
      const sortCompare = a.sortKey.localeCompare(b.sortKey)
      if (sortCompare !== 0) return sortCompare
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    })

const getNarrativeDescendantIds = (documentId: string): string[] => {
  const descendants: string[] = []
  const queue = [documentId]

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) continue
    const childIds = getNarrativeChildren(currentId).map((document) => document.id)
    descendants.push(...childIds)
    queue.push(...childIds)
  }

  return descendants
}

const canMoveNarrativeDocumentToParent = (
  documentId: string,
  parentDocumentId: string | null
): boolean => {
  if (!documentId) return false
  if (!parentDocumentId) return true
  if (parentDocumentId === documentId) return false
  return !getNarrativeDescendantIds(documentId).includes(parentDocumentId)
}

const applyNarrativeDocumentUpdates = (updates: WorldEntityDocumentPayload[]): void => {
  if (updates.length === 0) return
  const updateMap = new Map(updates.map((document) => [document.id, document]))
  narrativeDocuments.value = narrativeDocuments.value.map(
    (document) => updateMap.get(document.id) ?? document
  )
}

const moveDocumentsIntoOrderedSiblings = async (
  parentDocumentId: string | null,
  orderedSiblingIds: string[]
): Promise<void> => {
  const uniqueSiblingIds = [...new Set(orderedSiblingIds)]
  const updates = await Promise.all(
    uniqueSiblingIds.map((documentId, index) =>
      worldbuildingClientService.moveWorldEntityDocument({
        documentId,
        expectedRevision: narrativeDocumentById.value.get(documentId)?.revision ?? 1,
        parentDocumentId,
        sortKey: createSortKeyForIndex(index),
        historySessionId: narrativeHistorySessionId.value
      })
    )
  )
  applyNarrativeDocumentUpdates(updates)
  markNarrativeVersionChanged()
}

const placeNarrativeDocument = async (
  documentId: string,
  parentDocumentId: string | null,
  siblingIds: string[]
): Promise<void> => {
  if (!canMoveNarrativeDocumentToParent(documentId, parentDocumentId)) return
  await saveNarrative(true, { fallbackBlankTitle: true })
  await moveDocumentsIntoOrderedSiblings(parentDocumentId, siblingIds)
}

const clearNarrativeDragState = (): void => {
  draggingDocumentId.value = ''
  dropTarget.value = null
}

const handleNarrativeDragStart = (documentId: string, event: DragEvent): void => {
  draggingDocumentId.value = documentId
  dropTarget.value = null
  event.dataTransfer?.setData('text/plain', documentId)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

const getNarrativeDropPosition = (event: DragEvent): NarrativeDropPosition => {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return 'inside'
  const rect = target.getBoundingClientRect()
  const offsetY = event.clientY - rect.top
  if (offsetY < rect.height * 0.25) return 'before'
  if (offsetY > rect.height * 0.75) return 'after'
  return 'inside'
}

const handleNarrativeDragOver = (documentId: string, event: DragEvent): void => {
  const draggedId = draggingDocumentId.value || event.dataTransfer?.getData('text/plain') || ''
  if (!draggedId || draggedId === documentId) {
    dropTarget.value = null
    return
  }

  const position = getNarrativeDropPosition(event)
  const targetDocument = getNarrativeDocument(documentId)
  if (!targetDocument) return
  const parentDocumentId =
    position === 'inside' ? targetDocument.id : targetDocument.parentDocumentId || null
  if (!canMoveNarrativeDocumentToParent(draggedId, parentDocumentId)) {
    dropTarget.value = null
    return
  }

  dropTarget.value = { documentId, position }
}

const handleNarrativeDragLeave = (documentId: string): void => {
  if (dropTarget.value?.documentId === documentId) {
    dropTarget.value = null
  }
}

const handleNarrativeDrop = async (): Promise<void> => {
  const draggedId = draggingDocumentId.value
  const target = dropTarget.value
  if (!draggedId || !target || draggedId === target.documentId) {
    clearNarrativeDragState()
    return
  }

  const targetDocument = getNarrativeDocument(target.documentId)
  if (!targetDocument) {
    clearNarrativeDragState()
    return
  }

  if (target.position === 'inside') {
    const children = getNarrativeChildren(targetDocument.id)
      .map((document) => document.id)
      .filter((id) => id !== draggedId)
    await placeNarrativeDocument(draggedId, targetDocument.id, [...children, draggedId])
  } else {
    const parentDocumentId = targetDocument.parentDocumentId || null
    const siblingIds = getNarrativeChildren(parentDocumentId)
      .map((document) => document.id)
      .filter((id) => id !== draggedId)
    const targetIndex = siblingIds.indexOf(targetDocument.id)
    const insertIndex = target.position === 'before' ? targetIndex : targetIndex + 1
    siblingIds.splice(Math.max(0, insertIndex), 0, draggedId)
    await placeNarrativeDocument(draggedId, parentDocumentId, siblingIds)
  }

  clearNarrativeDragState()
}

const loadDocumentWorkspace = async (): Promise<void> => {
  if (!worldId.value) return
  syncingFromDetail = true
  narrativeDocumentsLoading.value = true
  documentWorkspaceLoaded.value = false
  try {
    const [worlds, documents] = await Promise.all([
      worldbuildingClientService.listWorlds(),
      worldbuildingClientService.listWorldEntityDocuments(worldId.value)
    ])
    worldDetail.value = worlds.find((world) => world.id === worldId.value) ?? null
    narrativeDocuments.value = documents
    const requested = documents.find((document) => document.id === routeDocumentId.value)
    syncNarrativeFromDocument(
      requested ?? (routeDocumentId.value ? null : (documents[0] ?? null))
    )
  } finally {
    narrativeDocumentsLoading.value = false
    documentWorkspaceLoaded.value = true
    syncingFromDetail = false
  }
}

const navigateToEntityHome = async (): Promise<void> => {
  clearNarrativeAutosave()
  await saveNarrative(true, { fallbackBlankTitle: true }).catch(() => undefined)
  await router.push({ name: 'WorldEditor', params: { worldId: worldId.value } })
}

const selectNarrativeDocument = async (documentId: string): Promise<void> => {
  if (documentId === activeDocumentId.value) return
  clearNarrativeAutosave()
  await saveNarrative(true, { fallbackBlankTitle: true })
  const nextDocument =
    narrativeDocuments.value.find((document) => document.id === documentId) ?? null
  syncNarrativeFromDocument(nextDocument)
  await router.replace({
    name: 'WorldEntityDocumentEditor',
    params: { worldId: worldId.value, documentId }
  })
}

const handleHistoryDiffLocate = async (hunk: WorldDocumentDiffHunk): Promise<void> => {
  const target = selectedHistoryFileState.value
  if (!target) return
  historyError.value = ''
  try {
    if (!narrativeDocumentById.value.has(target.documentId)) {
      throw new Error('目标文档已不在当前工作区，可先恢复该版本再查看。')
    }
    await selectNarrativeDocument(target.documentId)
    await nextTick()
    await nextTick()
    if (!narrativeEditorRef.value?.locateDiff(hunk)) {
      throw new Error('文档已继续修改，原修改位置已无法准确定。')
    }
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '无法定位该处修改'
  }
}

const handleAgentDocumentDiffLocate = async (payload: {
  reference: ChatMessageDocumentDiffReference
  hunk: WorldDocumentDiffHunk
}): Promise<void> => {
  try {
    const target = await worldbuildingClientService.getWorldEntityDocument(
      payload.reference.documentId
    )
    if (!target) throw new Error('目标文档已不存在，可在版本面板中查看或恢复。')
    if (target.worldId !== worldId.value || !narrativeDocumentById.value.has(target.id)) {
      throw new Error('目标文档不在当前工作区。')
    }
    await selectNarrativeDocument(target.id)
    await nextTick()
    await nextTick()
    if (!narrativeEditorRef.value?.locateDiff(payload.hunk)) {
      throw new Error('文档已继续修改，原修改位置已无法准确定。')
    }
  } catch (error) {
    console.warn('Failed to locate Agent document Diff:', error)
  }
}

const createNarrativeDocument = async (parentDocumentId: string | null = null): Promise<void> => {
  if (!worldId.value) return
  clearNarrativeAutosave()
  await saveNarrative(true, { fallbackBlankTitle: true })
  const created = await worldbuildingClientService.createWorldEntityDocument({
    worldId: worldId.value,
    parentDocumentId,
    title: '新建文件',
    contentHtml: '',
    historySessionId: narrativeHistorySessionId.value
  })
  replaceNarrativeDocument(created)
  syncNarrativeFromDocument(created)
  await router.replace({
    name: 'WorldEntityDocumentEditor',
    params: { worldId: worldId.value, documentId: created.id }
  })
  markNarrativeVersionChanged()
}

const openNarrativeDeleteConfirm = (documentId: string): void => {
  if (deletingNarrativeDocument.value) return
  const document = getNarrativeDocument(documentId)
  if (!document) return
  pendingDeleteDocumentId.value = documentId
  showNarrativeDeleteConfirm.value = true
}

const cancelNarrativeDeleteConfirm = (): void => {
  if (deletingNarrativeDocument.value) return
  pendingDeleteDocumentId.value = ''
}

const confirmDeleteNarrativeDocument = async (): Promise<void> => {
  const documentId = pendingDeleteDocumentId.value
  if (!documentId || deletingNarrativeDocument.value) return

  const document = getNarrativeDocument(documentId)
  if (!document) {
    showNarrativeDeleteConfirm.value = false
    pendingDeleteDocumentId.value = ''
    return
  }
  const descendantIds = pendingDeleteDescendantIds.value
  const recursive = descendantIds.length > 0

  deletingNarrativeDocument.value = true
  clearNarrativeAutosave()
  try {
    await saveNarrative(true, { fallbackBlankTitle: true })
    await worldbuildingClientService.deleteWorldEntityDocument({
      documentId,
      recursive,
      historySessionId: narrativeHistorySessionId.value
    })
    markNarrativeVersionChanged()

    const deletedIds = new Set([documentId, ...descendantIds])
    const remainingDocuments = narrativeDocuments.value.filter((item) => !deletedIds.has(item.id))
    narrativeDocuments.value = remainingDocuments
    showNarrativeDeleteConfirm.value = false
    pendingDeleteDocumentId.value = ''

    if (!deletedIds.has(activeDocumentId.value)) return

    const nextDocument = remainingDocuments[0] ?? null
    if (nextDocument) {
      syncNarrativeFromDocument(nextDocument)
      await router.replace({
        name: 'WorldEntityDocumentEditor',
        params: { worldId: worldId.value, documentId: nextDocument.id }
      })
      return
    }

    syncNarrativeFromDocument(null)
    await router.replace({
      name: 'WorldEntityDocumentEditor',
      params: { worldId: worldId.value }
    })
  } finally {
    deletingNarrativeDocument.value = false
  }
}

const saveNarrative = async (
  force = false,
  options: { fallbackBlankTitle?: boolean } = {}
): Promise<void> => {
  if (!canSaveNarrative.value || !activeDocument.value) return

  if (options.fallbackBlankTitle || !narrativeTitleFocused.value) {
    normalizeNarrativeTitleForCommit()
  }

  try {
    await narrativeSaveCoordinator.request({
      mode: force ? 'flush' : 'once',
      readSnapshot: () => {
        const document = activeDocument.value
        if (!canSaveNarrative.value || !document) return null
        return {
          signature: narrativeAutosaveSignature.value,
          documentId: document.id,
          expectedRevision: document.revision,
          title: activeDocumentTitle.value.trim(),
          contentHtml: characterDescriptionInput.value,
          historySessionId: narrativeHistorySessionId.value
        }
      },
      isSaved: (snapshot) => snapshot.signature === lastSavedNarrativeSignature,
      persist: async (snapshot) => {
        savingNarrative.value = true
        narrativeSaveState.value = 'saving'
        try {
          const updated = await worldbuildingClientService.updateWorldEntityDocument({
            documentId: snapshot.documentId,
            expectedRevision: snapshot.expectedRevision,
            ...(snapshot.title ? { title: snapshot.title } : {}),
            contentHtml: snapshot.contentHtml,
            contentFormat: 'html',
            historySessionId: snapshot.historySessionId
          })
          replaceNarrativeDocument(updated)
          lastSavedNarrativeSignature = snapshot.signature
          markNarrativeVersionChanged()
          narrativeSaveState.value = 'saved'
        } finally {
          savingNarrative.value = false
        }
      }
    })
  } catch (error) {
    narrativeSaveState.value = 'error'
    if (error instanceof Error && error.message.toLocaleLowerCase().includes('revision conflict')) {
      externalDocumentConflict.value = true
      clearNarrativeAutosave()
    }
    throw error
  }
}

const clearNarrativeAutosave = (): void => {
  if (narrativeAutosaveTimer) {
    clearTimeout(narrativeAutosaveTimer)
    narrativeAutosaveTimer = null
  }
}

const scheduleNarrativeAutosave = (delay = 3000): void => {
  if (syncingFromDetail || externalDocumentConflict.value || !activeDocument.value) return
  clearNarrativeAutosave()
  if (narrativeTitleFocused.value) return
  if (!canSaveNarrative.value || narrativeAutosaveSignature.value === lastSavedNarrativeSignature)
    return
  narrativeSaveState.value = 'idle'
  narrativeAutosaveTimer = setTimeout(() => {
    narrativeAutosaveTimer = null
    void saveNarrative()
  }, delay)
}

const belongsToActiveWorld = (document: WorldEntityDocumentPayload): boolean =>
  document.worldId === worldId.value

const hasUnsavedNarrativeChanges = (): boolean =>
  savingNarrative.value || narrativeAutosaveSignature.value !== lastSavedNarrativeSignature

const handleExternalDocumentChange = async (
  change: WorldEntityDocumentChangeEvent
): Promise<void> => {
  if (change.changeType === 'deleted') {
    const deletedIds = new Set(change.deletedDocumentIds ?? [change.documentId])
    const affectsCurrentOwner = narrativeDocuments.value.some((document) =>
      deletedIds.has(document.id)
    )
    if (!affectsCurrentOwner) return
    if (deletedIds.has(activeDocumentId.value) && hasUnsavedNarrativeChanges()) {
      externalDocumentConflict.value = true
      clearNarrativeAutosave()
      return
    }
    narrativeDocuments.value = narrativeDocuments.value.filter(
      (document) => !deletedIds.has(document.id)
    )
    if (deletedIds.has(activeDocumentId.value)) {
      syncNarrativeFromDocument(narrativeDocuments.value[0] ?? null)
    }
    return
  }

  const document = await worldbuildingClientService.getWorldEntityDocument(change.documentId)
  if (!document || !belongsToActiveWorld(document)) return
  if (document.id === activeDocumentId.value) {
    if (hasUnsavedNarrativeChanges()) {
      externalDocumentConflict.value = true
      clearNarrativeAutosave()
      return
    }
    replaceNarrativeDocument(document)
    syncNarrativeFromDocument(document)
    return
  }
  replaceNarrativeDocument(document)
}

onMounted(async () => {
  loadNarrativeSidebarWidth()
  loadNarrativeAiPanelWidth()
  window.addEventListener('resize', syncNarrativeSidebarWidthBounds)
  removeDocumentChangeListener = window.api.onWorldEntityDocumentChanged((change) => {
    void handleExternalDocumentChange(change)
  })
  await reconcileNarrativeHistorySession()
  await loadDocumentWorkspace()
})

watch(narrativeAutosaveSignature, () => {
  scheduleNarrativeAutosave()
})

onBeforeUnmount(() => {
  clearNarrativeAutosave()
  stopNarrativeSidebarResize()
  stopNarrativeAiPanelResize()
  window.removeEventListener('resize', syncNarrativeSidebarWidthBounds)
  removeDocumentChangeListener?.()
  removeDocumentChangeListener = null
})

useKeyboardShortcut(
  {
    key: 's',
    ctrlOrMeta: true,
    preventDefault: true,
    enabled: () => canSaveNarrative.value
  },
  async () => {
    clearNarrativeAutosave()
    await saveNarrative(true, { fallbackBlankTitle: !narrativeTitleFocused.value })
  }
)
</script>

<style scoped>
.narrative-editor-page {
  --narrative-sidebar-width: 356px;
  --narrative-sidebar-resizer-width: 6px;
  --narrative-editor-left: 48px;
  --narrative-outline-width: 240px;
  --narrative-ai-panel-width: 420px;
  --narrative-ai-resizer-width: 6px;

  width: 100vw;
  height: 100%;
  display: grid;
  grid-template-columns:
    var(--narrative-sidebar-width) var(--narrative-sidebar-resizer-width)
    minmax(0, 1fr);
  overflow: hidden;
  background: var(--wb-narrative-bg);
  color: var(--wb-narrative-text);
}

.narrative-editor-page.resizing-sidebar,
.narrative-editor-page.resizing-ai-panel,
:global(body.narrative-sidebar-resizing),
:global(body.narrative-ai-panel-resizing) {
  cursor: col-resize;
  user-select: none;
}

.narrative-sidebar {
  min-width: 0;
  background: var(--wb-narrative-sidebar-bg);
  display: flex;
  flex-direction: column;
}

.narrative-sidebar-resizer {
  position: relative;
  min-width: var(--narrative-sidebar-resizer-width);
  height: 100%;
  border-left: 1px solid var(--wb-narrative-border);
  background: var(--wb-narrative-sidebar-bg);
  cursor: col-resize;
  z-index: 4;
}

.narrative-sidebar-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: transparent;
}

.narrative-sidebar-resizer:hover::before,
.narrative-editor-page.resizing-sidebar .narrative-sidebar-resizer::before {
  background: var(--wb-narrative-accent);
}

.sidebar-home,
.catalog-head,
.format-toolbar {
  flex-shrink: 0;
}

.sidebar-home {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--wb-narrative-border);
}

.sidebar-home-link,
.catalog-tree-item {
  color: inherit;
  text-decoration: none;
}

.sidebar-home-link {
  width: 42px;
  min-width: 42px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  font-size: 24px;
  color: var(--wb-narrative-text-muted);
  cursor: pointer;
}

.sidebar-home-link:hover {
  background: var(--wb-narrative-hover);
  color: var(--wb-narrative-text);
}

.sidebar-icon {
  width: 18px;
  display: inline-flex;
  justify-content: center;
  color: var(--wb-narrative-text-muted);
}

.back-icon {
  width: auto;
  font-size: 30px;
  line-height: 1;
}

.sidebar-menu-btn,
.catalog-actions button,
.toolbar-tool,
.toolbar-add-btn {
  border: 0;
  background: transparent;
  color: var(--wb-narrative-text-muted);
  font: inherit;
  cursor: pointer;
}

.sidebar-menu-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  line-height: 1;
}

.sidebar-menu-btn:hover,
.catalog-actions button:hover,
.toolbar-tool:hover {
  background: var(--wb-narrative-hover);
  color: var(--wb-narrative-text);
}

.sidebar-world-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--wb-narrative-text-muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-panel {
  min-height: 0;
  padding: 0 4px;
  overflow: auto;
}

.catalog-scope {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  padding: 8px 6px 6px;
  border-bottom: 1px solid var(--wb-narrative-border);
}

.catalog-type-select {
  position: relative;
  min-width: 0;
}

.catalog-type-select select,
.catalog-search {
  width: 100%;
  height: 32px;
  box-sizing: border-box;
  border: 1px solid var(--wb-narrative-border);
  border-radius: 6px;
  outline: 0;
  background: var(--wb-narrative-toolbar-bg);
  color: var(--wb-narrative-text);
  font: inherit;
  font-size: 13px;
}

.catalog-type-select select {
  padding: 0 30px 0 10px;
  appearance: none;
  cursor: pointer;
}

.catalog-search {
  padding: 0 10px;
}

.catalog-search::placeholder {
  color: var(--wb-narrative-text-faint);
}

.catalog-type-select select:focus,
.catalog-search:focus {
  border-color: var(--wb-narrative-accent);
}

.catalog-select-caret {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  color: var(--wb-narrative-text-muted);
  pointer-events: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.catalog-head {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 7px;
  color: var(--wb-narrative-text-muted);
}

.catalog-title,
.catalog-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.catalog-title {
  min-width: 0;
  font-size: 15px;
}

.catalog-actions button {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 12px;
}

.catalog-actions button:disabled {
  opacity: 0.35;
  cursor: default;
}

.catalog-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.entity-catalog-tree {
  gap: 1px;
}

.catalog-entity-row {
  min-width: 0;
  height: 36px;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 26px;
  align-items: center;
  border-radius: 7px;
}

.catalog-entity-row:hover {
  background: var(--wb-narrative-hover);
}

.catalog-entity-row.active {
  background: var(--wb-narrative-active);
}

.catalog-entity-toggle,
.catalog-entity-name,
.catalog-entity-add {
  border: 0;
  background: transparent;
  color: var(--wb-narrative-text);
  font: inherit;
  cursor: pointer;
}

.catalog-entity-toggle {
  height: 30px;
  padding: 0;
  color: var(--wb-narrative-text-muted);
  font-size: 18px;
}

.catalog-entity-name {
  min-width: 0;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 4px;
  text-align: left;
}

.catalog-entity-name span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-entity-name small {
  flex-shrink: 0;
  color: var(--wb-narrative-text-faint);
  font-size: 11px;
}

.catalog-entity-add {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--wb-narrative-text-muted);
  opacity: 0;
}

.catalog-entity-row:hover .catalog-entity-add {
  opacity: 1;
}

.catalog-entity-add:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--wb-narrative-text);
}

.catalog-entity-empty {
  padding-left: 34px;
}

.catalog-tree-row {
  min-width: 0;
  height: 34px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(2, 24px);
  align-items: center;
  padding-left: calc(var(--tree-depth, 0) * 24px);
  border-radius: 7px;
  position: relative;
  opacity: 1;
}

.catalog-tree-row.active {
  background: var(--wb-narrative-active);
}

.catalog-tree-row:hover {
  background: var(--wb-narrative-hover);
}

.catalog-tree-row.dragging {
  opacity: 0.42;
}

.catalog-tree-row.drop-before::before,
.catalog-tree-row.drop-after::after {
  content: '';
  position: absolute;
  left: calc(var(--tree-depth, 0) * 24px + 8px);
  right: 8px;
  height: 2px;
  border-radius: 999px;
  background: var(--wb-narrative-accent);
}

.catalog-tree-row.drop-before::before {
  top: -2px;
}

.catalog-tree-row.drop-after::after {
  bottom: -2px;
}

.catalog-tree-row.drop-inside {
  outline: 1px solid var(--wb-narrative-accent);
  outline-offset: -1px;
}

.catalog-tree-item {
  min-width: 0;
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--wb-narrative-text);
  font: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

.catalog-tree-caret {
  width: 14px;
  flex-shrink: 0;
  color: var(--wb-narrative-text-muted);
}

.catalog-tree-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-row-action {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--wb-narrative-text-muted);
  cursor: pointer;
  opacity: 0;
  font-size: 13px;
}

.catalog-row-action:disabled {
  opacity: 0;
  cursor: not-allowed;
}

.catalog-tree-row:hover .catalog-row-action:not(:disabled) {
  opacity: 1;
}

.catalog-row-action:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--wb-narrative-text);
}

.catalog-row-action.danger:hover {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
}

.catalog-empty {
  padding: 10px 12px;
  color: var(--wb-narrative-text-muted);
  font-size: 13px;
}

.narrative-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--wb-narrative-surface-bg);
}

.format-toolbar {
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  border-bottom: 1px solid var(--wb-narrative-border);
  background: var(--wb-narrative-toolbar-bg);
  overflow-x: auto;
  overflow-y: hidden;
}

.toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 7px;
  border-left: 1px solid var(--wb-narrative-border);
}

.toolbar-group-primary {
  border-left: 0;
  padding-left: 0;
}

.toolbar-status-group {
  margin-left: auto;
  flex-shrink: 0;
}

.toolbar-tool,
.toolbar-add-btn {
  height: 28px;
  min-width: 26px;
  padding: 0 6px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  white-space: nowrap;
  font-size: 13px;
}

.toolbar-add-btn {
  width: 18px;
  min-width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 999px;
  background: var(--wb-narrative-accent);
  color: #ffffff;
  font-weight: 800;
}

.toolbar-tool.active {
  color: #315cff;
}

.ai-panel-toggle {
  min-width: 30px;
  margin-left: 2px;
  border: 1px solid transparent;
  font-weight: 800;
}

.ai-panel-toggle.active {
  border-color: rgba(49, 92, 255, 0.22);
  background: rgba(49, 92, 255, 0.09);
  color: #315cff;
}

.history-panel-toggle {
  min-width: 42px;
  margin-left: 2px;
  border: 1px solid transparent;
  font-weight: 700;
}

.history-panel-toggle.active {
  border-color: rgba(49, 92, 255, 0.22);
  background: rgba(49, 92, 255, 0.09);
  color: #315cff;
}

.editor-counts,
.autosave-hint {
  color: var(--wb-narrative-text-faint);
  font-size: 12px;
  white-space: nowrap;
}

.autosave-hint.saving {
  color: #b7791f;
}

.autosave-hint.error {
  color: #c24141;
}

.editor-workspace {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--narrative-outline-width);
  overflow: hidden;
}

.editor-workspace.ai-panel-open {
  grid-template-columns:
    minmax(360px, 1fr)
    var(--narrative-ai-resizer-width)
    var(--narrative-ai-panel-width);
}

.document-canvas {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #ffffff;
}

.document-scroll-region {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.document-scroll-region::-webkit-scrollbar {
  display: none;
}

.document-content-column {
  width: calc(100% - var(--narrative-editor-left) - var(--narrative-editor-left));
  margin: 58px 0 0 var(--narrative-editor-left);
  color: var(--wb-narrative-text);
}

.document-heading-input {
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--wb-narrative-text);
  font-size: 34px;
  line-height: 1.25;
  font-weight: 800;
  font-family: inherit;
  letter-spacing: 0;
}

.document-heading-input::placeholder {
  color: var(--wb-narrative-text-faint);
}

.narrative-editor {
  position: relative;
  height: auto;
  min-height: calc(100% - 147px);
  margin-top: 46px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.outline-panel {
  min-width: 0;
  border-left: 0;
  background: #ffffff;
  padding: 62px 10px 0 0;
}

.narrative-ai-resizer {
  position: relative;
  min-width: var(--narrative-ai-resizer-width);
  height: 100%;
  border-left: 1px solid var(--wb-narrative-border);
  border-right: 1px solid var(--wb-narrative-border);
  background: #ffffff;
  cursor: col-resize;
  z-index: 5;
}

.narrative-ai-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: transparent;
}

.narrative-ai-resizer:hover::before,
.narrative-editor-page.resizing-ai-panel .narrative-ai-resizer::before {
  background: var(--wb-narrative-accent);
}

.narrative-ai-panel {
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: #ffffff;
}

.narrative-history-panel {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f8f9fb;
}

.history-panel-head,
.history-detail-head,
.history-change > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.history-panel-head {
  min-height: 56px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--wb-narrative-border);
  background: #ffffff;
}

.history-panel-head > div,
.history-detail-head > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-panel-head strong,
.history-detail-head strong {
  color: var(--wb-narrative-text);
  font-size: 14px;
}

.history-panel-head small,
.history-detail-head small {
  overflow: hidden;
  color: var(--wb-narrative-text-faint);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-panel-head button {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--wb-narrative-text-muted);
  font-size: 18px;
}

.history-panel-head button:hover {
  background: #eef1f5;
}

.history-panel-state {
  padding: 24px 16px;
  color: var(--wb-narrative-text-faint);
  font-size: 12px;
  text-align: center;
}

.history-panel-state.error {
  color: #c24141;
}

.history-status-bar {
  min-height: 32px;
  padding: 6px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--wb-narrative-border);
  background: #ffffff;
  color: var(--wb-narrative-text-muted);
  font-size: 10px;
  white-space: nowrap;
}

.history-status-bar select {
  min-width: 0;
  max-width: 128px;
  height: 26px;
  border: 0;
  background: transparent;
  color: var(--wb-narrative-text);
  font-size: 11px;
  font-weight: 700;
}

.history-status-bar .healthy {
  color: #16834b;
}
.history-status-bar .unhealthy {
  color: #c24141;
}

.history-create-version {
  min-height: 42px;
  padding: 7px 10px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  border-bottom: 1px solid var(--wb-narrative-border);
  background: #ffffff;
}

.history-create-version input {
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--wb-narrative-border);
  background: #fbfcfd;
  color: var(--wb-narrative-text);
  font-size: 11px;
}

.history-create-version button {
  height: 28px;
  padding: 0 10px;
  border: 1px solid #315cff;
  background: #315cff;
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
}

.history-create-version button:disabled {
  border-color: #d9dde5;
  background: #f3f4f6;
  color: #9aa1ac;
  cursor: default;
}

.history-management {
  border-bottom: 1px solid var(--wb-narrative-border);
  background: #ffffff;
}

.history-management > summary {
  min-height: 30px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  color: var(--wb-narrative-text-muted);
  cursor: pointer;
  font-size: 11px;
  list-style: none;
}

.history-management > summary::-webkit-details-marker {
  display: none;
}
.history-management > summary::before {
  content: '›';
  margin-right: 7px;
}
.history-management[open] > summary::before {
  transform: rotate(90deg);
}
.history-management > summary:hover {
  background: #f6f7f9;
  color: var(--wb-narrative-text);
}

.history-tools {
  padding: 4px 10px 10px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  background: #ffffff;
}

.history-tools input[type='search'],
.history-tools input[type='text'],
.history-tools input:not([type]),
.history-tools select {
  min-width: 0;
  height: 28px;
  padding: 0 7px;
  border: 1px solid var(--wb-narrative-border);
  background: #ffffff;
  color: var(--wb-narrative-text);
  font-size: 11px;
}

.history-tools label,
.history-tools button {
  min-height: 28px;
  padding: 0 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--wb-narrative-border);
  background: #ffffff;
  color: var(--wb-narrative-text-muted);
  font-size: 10px;
}

.history-checkpoints {
  padding: 6px 10px;
  display: flex;
  gap: 5px;
  overflow-x: auto;
  border-bottom: 1px solid var(--wb-narrative-border);
  background: #ffffff;
}

.history-checkpoints button,
.history-checkpoint-badge {
  padding: 3px 6px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #cdd6ff;
  background: #f5f7ff;
  color: #315cff;
  font-size: 10px;
  white-space: nowrap;
}

.history-checkpoints small {
  font-size: 14px;
}

.history-merge-preview {
  padding: 10px;
  border-bottom: 1px solid var(--wb-narrative-border);
  background: #fffdf5;
  font-size: 11px;
}

.history-merge-preview > header,
.history-merge-preview > footer,
.history-merge-preview article > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.history-merge-preview article {
  margin-top: 8px;
  padding: 8px;
  display: grid;
  gap: 5px;
  border: 1px solid #eadfb8;
  background: #ffffff;
}

.history-merge-preview article small {
  color: var(--wb-narrative-text-faint);
}
.history-merge-preview label {
  display: flex;
  align-items: center;
  gap: 3px;
}
.history-merge-preview > footer {
  margin-top: 8px;
  justify-content: flex-end;
}
.history-merge-preview button {
  padding: 5px 8px;
  border: 1px solid var(--wb-narrative-border);
  background: #ffffff;
}

.history-panel-body {
  min-height: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.version-tree-section {
  min-height: 178px;
  flex: 0 1 42%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-bottom: 1px solid var(--wb-narrative-border);
  background: #ffffff;
}

.history-tree-head {
  min-height: 34px;
  padding: 7px 12px 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.history-tree-head strong {
  color: var(--wb-narrative-text);
  font-size: 12px;
}

.history-tree-head label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--wb-narrative-text-faint);
  font-size: 10px;
}

.history-tree-search {
  height: 28px;
  margin: 0 10px 6px;
  padding: 0 8px;
  border: 1px solid var(--wb-narrative-border);
  background: #fbfcfd;
  color: var(--wb-narrative-text);
  font-size: 11px;
}

.history-commit-list {
  min-height: 0;
  flex: 1;
  padding: 2px 5px 6px;
  overflow-y: auto;
  background: #ffffff;
}

.history-commit-item {
  width: 100%;
  min-height: 44px;
  padding: 5px 7px 5px 3px;
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 5px;
  border: 0;
  border-radius: 3px;
  background: transparent;
  text-align: left;
}

.history-commit-item:hover,
.history-commit-item.active {
  background: #f1f4ff;
}

.history-commit-item.active {
  box-shadow: inset 2px 0 #315cff;
}

.history-graph-lane {
  position: relative;
  grid-row: 1 / 3;
  align-self: stretch;
  display: flex;
  justify-content: center;
}

.history-graph-lane i {
  position: relative;
  width: 9px;
  height: 9px;
  margin-top: 7px;
  border: 2px solid #315cff;
  border-radius: 50%;
  background: #ffffff;
  z-index: 2;
}

.history-graph-lane i.merge {
  border-color: #8b5cf6;
  box-shadow:
    5px 4px 0 -2px #ffffff,
    5px 4px 0 0 #8b5cf6;
}

.history-graph-lane b {
  position: absolute;
  top: 16px;
  bottom: -6px;
  left: 50%;
  width: 1px;
  background: #c8ced8;
}

.history-commit-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.history-commit-badges {
  display: flex;
  align-items: center;
  gap: 3px;
}

.history-commit-title {
  overflow: hidden;
  color: var(--wb-narrative-text);
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-commit-meta,
.history-commit-count {
  color: var(--wb-narrative-text-faint);
  font-size: 10px;
}

.history-head-badge,
.history-merge-badge {
  padding: 1px 4px;
  border: 1px solid #cdd6ff;
  color: #315cff;
  font-size: 8px;
  font-weight: 800;
}

.history-merge-badge {
  border-color: #ddd1ff;
  color: #7950c9;
}

.history-commit-item > .history-checkpoint-badge {
  grid-column: 2 / 4;
  width: max-content;
  margin-top: 2px;
}

.history-detail {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.file-tree-section {
  background: #f8f9fb;
}

.history-detail-head {
  margin-bottom: 8px;
  align-items: flex-start;
}

.history-detail-actions {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
}

.history-detail-actions > button:not(.history-restore-btn) {
  padding: 6px 8px;
  border: 1px solid var(--wb-narrative-border);
  background: #ffffff;
  color: var(--wb-narrative-text-muted);
  font-size: 10px;
}

.history-restore-btn {
  flex-shrink: 0;
  padding: 6px 9px;
  border: 1px solid #cdd6ff;
  border-radius: 6px;
  background: #ffffff;
  color: #315cff;
  font-size: 11px;
  font-weight: 700;
}

.history-restore-btn:disabled {
  border-color: #e1e4e8;
  color: #a1a7b0;
  cursor: default;
}

.history-change {
  margin-bottom: 10px;
  padding: 10px;
  border: 1px solid var(--wb-narrative-border);
  border-radius: 8px;
  background: #ffffff;
}

.history-file-tree {
  margin-bottom: 10px;
  border: 1px solid var(--wb-narrative-border);
  background: #ffffff;
}

.history-file-group + .history-file-group {
  border-top: 1px solid var(--wb-narrative-border);
}

.history-file-group > header {
  min-height: 32px;
  padding: 6px 9px;
  display: flex;
  align-items: center;
  gap: 7px;
  background: #f6f7f9;
}

.history-file-group > header strong {
  min-width: 0;
  overflow: hidden;
  color: var(--wb-narrative-text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-file-group > header small {
  color: var(--wb-narrative-text-faint);
  font-size: 9px;
}

.history-file-item {
  width: 100%;
  min-height: 31px;
  padding: 4px 8px 4px calc(8px + var(--history-file-depth) * 14px);
  display: flex;
  align-items: center;
  gap: 5px;
  border-top: 1px solid #f1f2f4;
  text-align: left;
}

.history-file-item:hover,
.history-file-item.active {
  background: #eef2ff;
}

.history-file-item.active {
  box-shadow: inset 2px 0 #315cff;
}

.history-file-item.deleted .history-file-title {
  color: #9c5555;
  text-decoration: line-through;
}

.history-file-branch {
  flex-shrink: 0;
  color: #a6adb7;
  font-size: 10px;
}

.history-file-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--wb-narrative-text);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-file-detail {
  margin-bottom: 0;
}

.history-change > header {
  justify-content: flex-start;
}

.history-change > header strong {
  overflow: hidden;
  color: var(--wb-narrative-text);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-change > p {
  margin: 7px 0 0;
  color: var(--wb-narrative-text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.history-operation {
  flex-shrink: 0;
  padding: 2px 5px;
  border-radius: 4px;
  background: #eef1f5;
  color: #5d6673;
  font-size: 10px;
  font-weight: 700;
}

.history-operation.create {
  background: #e8f8ef;
  color: #16834b;
}

.history-operation.delete {
  background: #fff0f0;
  color: #c24141;
}

.history-operation.move {
  background: #eef1ff;
  color: #315cff;
}

.history-diff {
  margin-top: 9px;
}

.outline-panel h2 {
  margin: 0;
  color: var(--wb-narrative-text);
  font-size: 15px;
  font-weight: 800;
}

.outline-empty {
  margin-top: 18px;
  color: var(--wb-narrative-text-faint);
  font-size: 12px;
}

.outline-item {
  display: block;
  width: 100%;
  min-height: 28px;
  margin-top: 8px;
  border: 0;
  background: transparent;
  color: var(--wb-narrative-text-muted);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.outline-item.level-2 {
  padding-left: 10px;
}

.outline-item.level-3 {
  padding-left: 20px;
  font-size: 12px;
}

.appearance-popover {
  position: absolute;
  top: 12px;
  right: 18px;
  z-index: 20;
}

.editor-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wb-narrative-text-muted);
}

.editor-empty-state {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--wb-narrative-text-muted);
}

.editor-empty-state strong {
  color: var(--wb-narrative-text);
  font-size: 18px;
}

.editor-empty-state button {
  height: 32px;
  margin-top: 6px;
  padding: 0 14px;
  border: 1px solid var(--wb-narrative-border);
  border-radius: 6px;
  background: var(--wb-narrative-toolbar-bg);
  color: var(--wb-narrative-text);
  font: inherit;
  cursor: pointer;
}

.editor-empty-state button:hover {
  border-color: var(--wb-narrative-accent);
}

.narrative-editor :deep(.editor-frame) {
  height: auto;
  min-height: inherit;
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.narrative-editor :deep(.editor-content) {
  height: auto;
  min-height: inherit;
}

.narrative-editor :deep(.editor-content .tiptap) {
  height: auto;
  min-height: inherit;
  overflow: visible;
  max-width: calc(100% - var(--narrative-editor-left) - var(--narrative-editor-left));
  margin: 0 0 0 var(--narrative-editor-left);
  padding: 0 0 120px;
  color: var(--wb-narrative-text);
  font-size: calc(15px * var(--wb-font-scale, 1));
  line-height: var(--wb-line-height, 1.75);
}

.narrative-editor :deep(.editor-content .tiptap p) {
  color: var(--wb-narrative-text);
}

.narrative-editor :deep(.editor-content .tiptap h1),
.narrative-editor :deep(.editor-content .tiptap h2),
.narrative-editor :deep(.editor-content .tiptap h3),
.narrative-editor :deep(.editor-content .tiptap strong) {
  color: var(--wb-narrative-text);
}

.narrative-editor :deep(.editor-content .tiptap p.is-editor-empty:first-child::before) {
  color: var(--wb-narrative-text-faint);
}

.appearance-popover :deep(.appearance-panel) {
  border-color: var(--wb-narrative-border-strong);
  background: rgba(255, 255, 255, 0.98);
  color: var(--wb-narrative-text);
  box-shadow: 0 20px 46px rgba(17, 24, 39, 0.12);
}

.appearance-popover :deep(.panel-head h3),
.appearance-popover :deep(.setting-label) {
  color: var(--wb-narrative-text);
}

.appearance-popover :deep(.eyebrow),
.appearance-popover :deep(.panel-tip) {
  color: var(--wb-narrative-text-muted);
}

.appearance-popover :deep(.reset-btn) {
  border-color: var(--wb-narrative-border);
  background: var(--wb-narrative-hover);
  color: var(--wb-narrative-text);
}

.format-toolbar :deep(.shortcut-help-btn) {
  border: 0;
  background: transparent;
  color: var(--wb-narrative-text-muted);
}

@media (max-width: 980px) {
  .narrative-editor-page {
    --narrative-sidebar-width: 260px;
    --narrative-editor-left: 48px;
  }

  .editor-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .editor-workspace.ai-panel-open {
    grid-template-columns: minmax(0, 1fr);
  }

  .outline-panel,
  .narrative-ai-resizer,
  .narrative-ai-panel {
    display: none;
  }

  .narrative-history-panel {
    display: none;
  }

  .toolbar-status-group {
    margin-left: 0;
  }
}
</style>
