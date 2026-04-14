<template>
  <div
    class="h-screen overflow-hidden bg-[linear-gradient(180deg,_#f7fafe_0%,_#f3f6fb_100%)]"
  >
    <div class="flex h-full w-full">
      <section
        class="relative flex min-w-0 flex-1 flex-col overflow-hidden border-r border-slate-200/80 bg-white/55"
        :class="{ 'border-r-0': !showRightSidebar }"
      >
        <ChatHeader
          :show-logs="showLogs"
          :show-tasks="showTasks"
          :disable-purge="isLoading || purgeConfirmLoading"
          @open-memory="openMemorySnapshot"
          @open-model-config="openModelConfig"
          @open-purge-confirm="openPurgeConfirm"
          @toggle-logs="showLogs = !showLogs"
          @toggle-tasks="showTasks = !showTasks"
        />

      <div
        class="flex flex-grow flex-col overflow-y-auto px-10 py-8 scroll-smooth"
        :style="{ paddingBottom: composerDockPadding }"
        ref="messagesContainer"
        @scroll="handleMessagesScroll"
      >
        <ChatMessageList
          :messages="messages"
          :participants="chatParticipants"
          :revertible-message-id="revertibleUserMessageId"
          @edit-avatar="openAvatarEditor"
          @revert-message="handleRevertLastTurn"
        />
      </div>

        <div class="absolute inset-x-0 bottom-0 z-20 px-8 pb-7 pt-3 pointer-events-none">
          <MessageComposer
            class="pointer-events-auto"
            ref="composerRef"
            v-model="userInput"
            :is-loading="isLoading"
            :can-send="canSendMessage"
            :uploaded-files="uploadedFiles"
            @send="handleSend"
            @interrupt="handleInterruptRun"
            @pick-file="handlePickFile"
            @paste-files="handlePasteFiles"
            @delete-file="requestDeleteFile"
          />
        </div>
      </section>

      <transition
        enter-active-class="transition ease-out duration-300"
        enter-from-class="transform translate-x-4 opacity-0"
        enter-to-class="transform translate-x-0 opacity-100"
        leave-active-class="transition ease-in duration-200"
        leave-from-class="transform translate-x-0 opacity-100"
        leave-to-class="transform translate-x-4 opacity-0"
      >
        <aside
          v-if="showRightSidebar"
          class="flex h-full w-[360px] flex-shrink-0 flex-col border-l border-slate-200 bg-white"
        >
          <AILogPanel v-if="showLogs" :logs="agentLogs" />
          <TaskQueuePanel
            v-if="showTasks"
            :snapshot="taskMonitorSnapshot"
            :loading="taskMonitorLoading"
            :class="{ 'border-t border-slate-200': showLogs }"
          />
        </aside>
      </transition>
    </div>

    <div
      v-if="showMemorySnapshot"
      class="absolute inset-0 z-40 flex items-center justify-center bg-black/30 px-4"
    >
      <div class="w-full max-w-4xl rounded-xl border border-gray-200 bg-white p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div class="mb-5 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-800">AI 当前记忆状态</h3>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              :disabled="memorySnapshotLoading"
              @click="loadMemorySnapshot"
            >
              {{ memorySnapshotLoading ? '刷新中...' : '刷新' }}
            </button>
            <button
              type="button"
              class="text-gray-500 hover:text-gray-700"
              @click="showMemorySnapshot = false"
            >
              ✕
            </button>
          </div>
        </div>

        <div v-if="memorySnapshotError" class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {{ memorySnapshotError }}
        </div>

        <div v-if="memorySnapshotData" class="space-y-5">
          <section class="rounded-lg border border-gray-200 p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <h4 class="text-sm font-semibold text-gray-800">长期稳定记忆</h4>
              <div class="text-xs text-gray-500">
                更新时间 {{ formatIsoTime(memorySnapshotData.memory.longTerm.updatedAt) || '暂无' }}
              </div>
            </div>
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 xl:col-span-2">
                <div class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">记忆总体总结</div>
                <div class="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                  {{ memorySnapshotData.memory.longTerm.memorySummary || '暂无' }}
                </div>
              </div>
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">用户画像</div>
                <div class="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                  {{ memorySnapshotData.memory.longTerm.userProfile || '暂无' }}
                </div>
              </div>
            </div>
          </section>

          <section class="rounded-lg border border-gray-200 p-4">
            <div class="mb-3 flex items-center justify-between gap-3">
              <h4 class="text-sm font-semibold text-gray-800">阶段记忆</h4>
              <div class="flex flex-wrap items-center justify-end gap-2 text-xs text-gray-500">
                <span class="rounded-full bg-slate-100 px-2 py-1">
                  最后阶段 #{{ memorySnapshotData.memory.archiveStatus.lastStageIndex || 0 }}
                </span>
                <span class="rounded-full bg-slate-100 px-2 py-1">
                  待归档 {{ memorySnapshotData.memory.archiveStatus.bufferMessageCount }} 条
                </span>
                <span
                  class="inline-flex rounded-full px-2 py-1 font-medium"
                  :class="archiveHealthClass(memorySnapshotData.memory.archiveStatus.apiStatus)"
                >
                  {{ describeArchiveHealth(memorySnapshotData.memory.archiveStatus.apiStatus) }}
                </span>
                <span class="rounded-full bg-slate-100 px-2 py-1">
                  {{ formatIsoTime(memorySnapshotData.memory.archiveStatus.lastArchivedAt) || '暂无归档' }}
                </span>
              </div>
            </div>
            <div v-if="memorySnapshotData.memory.recentStages.length" class="space-y-3">
              <article
                v-for="stage in memorySnapshotData.memory.recentStages"
                :key="`memory-stage-${stage.id}`"
                class="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div class="mb-2 flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-medium text-slate-800">阶段 #{{ stage.stageIndex }}</span>
                    <span class="rounded-full px-2 py-1 text-[11px]" :class="memoryStageStatusClass(stage.status)">
                      {{ describeMemoryStageStatus(stage.status) }}
                    </span>
                  </div>
                  <div class="text-xs text-slate-500">
                    {{ describeMemoryStageTrigger(stage.triggerKind) }} · {{ stage.messageCount }} 条
                  </div>
                </div>
                <div class="mb-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                  {{ stage.summary || '暂无阶段摘要' }}
                </div>
                <div class="rounded-lg bg-white px-3 py-3">
                  <div class="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">阶段氛围</div>
                  <div class="text-xs text-slate-700">
                    {{ describeMood(stage.moodLabel) }}
                  </div>
                </div>
                <div class="mt-3 text-xs text-slate-500">
                  序号范围 #{{ stage.startSequence }} - #{{ stage.endSequence }} ·
                  {{ formatIsoTime(stage.endedAt) || '暂无时间' }}
                </div>
              </article>
            </div>
            <div v-else class="text-sm text-gray-500">（暂无阶段记忆）</div>
          </section>

          <section class="rounded-lg border border-gray-200 p-4">
            <h4 class="mb-2 text-sm font-semibold text-gray-800">锚点记忆 (Anchors)</h4>
            <div v-if="memorySnapshotData.memory.anchors.length" class="flex flex-wrap gap-2">
              <span
                v-for="(anchor, index) in memorySnapshotData.memory.anchors"
                :key="`anchor-${index}`"
                class="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 border border-blue-100"
              >
                {{ anchor }}
              </span>
            </div>
            <div v-else class="text-sm text-gray-500">（暂无锚点）</div>
          </section>

          <section class="rounded-lg border border-gray-200 p-4">
            <h4 class="mb-2 text-sm font-semibold text-gray-800">短期滑动窗口（{{ memorySnapshotData.memory.shortTerm.length }} 条）</h4>
            <div v-if="memorySnapshotData.memory.shortTerm.length" class="space-y-2">
              <div
                v-for="(item, index) in memorySnapshotData.memory.shortTerm"
                :key="`short-term-${index}-${item.timestamp}`"
                class="rounded border border-gray-100 bg-gray-50 p-3"
              >
                <div class="mb-1 flex items-center justify-between text-xs text-gray-500">
                  <span class="font-medium">{{ item.role }}</span>
                  <span>{{ formatIsoTime(item.timestamp) }}</span>
                </div>
                <div class="whitespace-pre-wrap break-words text-sm text-gray-700">{{ item.content }}</div>
              </div>
            </div>
            <div v-else class="text-sm text-gray-500">（暂无短期记忆）</div>
          </section>

          <section class="rounded-lg border border-gray-200 p-4">
            <h4 class="mb-3 text-sm font-semibold text-gray-800">短期插槽状态</h4>
            <div class="grid gap-4 md:grid-cols-2">
              <article class="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                <div class="mb-3 flex items-center justify-between">
                  <h5 class="text-sm font-medium text-emerald-900">对话控制状态</h5>
                  <span class="rounded-full bg-white/80 px-2 py-1 text-[11px] text-emerald-700">
                    观测 #{{ memorySnapshotData.slots.lastObservationId }}
                  </span>
                </div>
                <div class="space-y-3 text-sm text-slate-700">
                  <div>
                    <div class="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-700">对话模式</div>
                    <div class="rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-700">
                      {{ describeConversationMode(memorySnapshotData.slots.conversation_state.conversation_mode) }}
                    </div>
                  </div>
                  <div>
                    <div class="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-700">互动状态</div>
                    <div class="rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-700">
                      {{ describeInteractionState(memorySnapshotData.slots.conversation_state.interaction_state) }}
                    </div>
                  </div>
                </div>
                <div class="mt-3 text-xs text-emerald-800/80">
                  更新时间：{{ formatIsoTime(memorySnapshotData.slots.conversation_state.updatedAt) || '暂无' }}
                </div>
              </article>

              <article class="rounded-xl border border-rose-100 bg-rose-50/70 p-4">
                <div class="mb-3 flex items-center justify-between">
                  <h5 class="text-sm font-medium text-rose-900">用户情绪</h5>
                  <span
                    class="rounded-full px-2 py-1 text-[11px]"
                    :class="moodBadgeClass(memorySnapshotData.slots.user_mood.current_mood)"
                  >
                    {{ describeMood(memorySnapshotData.slots.user_mood.current_mood) }}
                  </span>
                </div>
                <div class="rounded-xl bg-white/70 p-3">
                  <div class="mb-2 flex items-center justify-between text-xs text-slate-600">
                    <span>情绪倾向</span>
                    <span>{{ formatMoodValence(memorySnapshotData.slots.user_mood.valence) }}</span>
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      class="h-full rounded-full bg-gradient-to-r from-sky-400 via-slate-300 to-rose-400"
                      :style="{ width: moodValenceWidth(memorySnapshotData.slots.user_mood.valence) }"
                    />
                  </div>
                  <div class="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div class="rounded-lg bg-rose-50 px-3 py-2">
                      置信度：{{ formatPercent(memorySnapshotData.slots.user_mood.confidence) }}
                    </div>
                    <div class="rounded-lg bg-rose-50 px-3 py-2">
                      过期游标：{{ memorySnapshotData.slots.user_mood.expiresAfterObservationId ?? '无' }}
                    </div>
                  </div>
                </div>
                <div class="mt-3 text-xs text-rose-800/80">
                  更新时间：{{ formatIsoTime(memorySnapshotData.slots.user_mood.updatedAt) || '暂无' }}
                </div>
              </article>
            </div>
          </section>

          <section class="rounded-lg border border-gray-200 p-4">
            <div class="mb-2 flex items-center justify-between gap-3">
              <h4 class="text-sm font-semibold text-gray-800">人格状态</h4>
              <button
                type="button"
                class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="memorySnapshotLoading || personaResetLoading"
                @click="openPersonaResetConfirm"
              >
                {{ personaResetLoading ? '重置中...' : '重置人格' }}
              </button>
            </div>
            <template v-if="memorySnapshotData.persona">
              <div class="mb-3 text-sm text-gray-700 whitespace-pre-wrap break-words">
                {{ memorySnapshotData.persona.current_behavioral_narrative }}
              </div>
              <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div
                  v-for="metric in personaMetricEntries(memorySnapshotData.persona.metrics)"
                  :key="`persona-metric-${metric.key}`"
                  class="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div class="mb-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{{ metric.label }}</span>
                    <span class="font-medium text-slate-700">{{ metric.value.toFixed(2) }}</span>
                  </div>
                  <div class="h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      class="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600"
                      :style="{ width: metricBarWidth(metric.value) }"
                    />
                  </div>
                </div>
              </div>

              <div class="mt-4 grid gap-4 lg:grid-cols-3">
                <div class="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h5 class="mb-3 text-sm font-medium text-slate-800">稳定偏好层</h5>
                  <div class="space-y-2">
                    <div
                      v-for="metric in personaMetricEntries(memorySnapshotData.persona.stable_preferences)"
                      :key="`stable-${metric.key}`"
                      class="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs text-slate-700"
                    >
                      <span>{{ metric.label }}</span>
                      <span class="font-medium">{{ metric.value.toFixed(2) }}</span>
                    </div>
                  </div>
                </div>
                <div class="rounded-xl border border-violet-200 bg-violet-50/70 p-4">
                  <h5 class="mb-3 text-sm font-medium text-violet-900">会话激素层</h5>
                  <div class="space-y-2">
                    <div
                      v-for="metric in personaDeltaEntries(memorySnapshotData.persona.session_hormones)"
                      :key="`session-${metric.key}`"
                      class="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
                      :class="deltaToneClass(metric.value)"
                    >
                      <span>{{ metric.label }}</span>
                      <span class="font-medium">{{ formatSignedMetric(metric.value) }}</span>
                    </div>
                  </div>
                </div>
                <div class="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <h5 class="mb-3 text-sm font-medium text-amber-900">瞬时波动层</h5>
                  <div class="space-y-2">
                    <div
                      v-for="metric in personaDeltaEntries(memorySnapshotData.persona.transient_state)"
                      :key="`transient-${metric.key}`"
                      class="flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
                      :class="deltaToneClass(metric.value)"
                    >
                      <span>{{ metric.label }}</span>
                      <span class="font-medium">{{ formatSignedMetric(metric.value) }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div class="mb-3 flex items-center justify-between gap-3">
                  <h5 class="text-sm font-medium text-gray-800">最近人格观察</h5>
                  <div class="text-xs text-gray-500">
                    演化轮次 {{ memorySnapshotData.persona.evolution_turn }} / 观测游标
                    {{ memorySnapshotData.persona.last_observation_id }}
                  </div>
                </div>
                <div v-if="memorySnapshotData.persona.recent_interaction_buffer.length" class="space-y-2">
                  <div
                    v-for="item in [...memorySnapshotData.persona.recent_interaction_buffer].slice(-6).reverse()"
                    :key="`persona-observation-${item.turn}-${item.user_signal}-${item.impact}`"
                    class="rounded-lg border border-gray-200 bg-white px-3 py-3"
                  >
                    <div class="mb-1 flex items-center justify-between text-xs text-gray-500">
                      <span class="font-medium text-gray-700">{{ formatSignalLabel(item.user_signal) }}</span>
                      <span>turn {{ item.turn }}</span>
                    </div>
                    <div class="whitespace-pre-wrap break-words text-sm text-gray-700">
                      {{ item.impact }}
                    </div>
                  </div>
                </div>
                <div v-else class="text-sm text-gray-500">（暂无人格观察记录）</div>
              </div>

              <div class="mt-3 text-xs text-gray-500">
                最后更新：{{ formatIsoTime(memorySnapshotData.persona.last_updated) }}
              </div>
            </template>
            <div v-else class="text-sm text-gray-500">（暂无人格状态）</div>
          </section>
        </div>

        <div v-else-if="memorySnapshotLoading" class="py-8 text-center text-sm text-gray-500">
          正在读取记忆状态...
        </div>

        <div v-else class="py-8 text-center text-sm text-gray-500">
          暂无可展示的记忆数据
        </div>
      </div>
    </div>

    <div
      v-if="showModelConfig"
      class="absolute inset-0 z-30 flex items-center justify-center bg-black/30 px-4"
    >
      <div class="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div class="mb-5 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-800">模型设置</h3>
          <button
            type="button"
            class="text-gray-500 hover:text-gray-700"
            @click="showModelConfig = false"
          >
            ✕
          </button>
        </div>

        <div class="mb-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition"
            :class="
              activeModelConfigTab === 'main'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            "
            @click="activeModelConfigTab = 'main'"
          >
            主模型
          </button>
          <button
            type="button"
            class="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition"
            :class="
              activeModelConfigTab === 'quick'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            "
            @click="activeModelConfigTab = 'quick'"
          >
            快速模型
          </button>
        </div>

        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label class="flex flex-col gap-1 text-sm text-gray-700">
            模型别名
            <input
              v-model="activeModelNameField"
              type="text"
              class="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
              :placeholder="activeModelConfigTab === 'main' ? '例如：默认模型' : '例如：快速模型'"
            />
          </label>

          <label class="flex flex-col gap-1 text-sm text-gray-700">
            Vendor
            <select
              v-model="activeModelVendorField"
              class="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
            >
              <option value="openai">openai-compatible</option>
              <option value="anthropic">anthropic</option>
            </select>
          </label>

          <label class="flex flex-col gap-1 text-sm text-gray-700 md:col-span-2">
            模型名称
            <input
              v-model="activeModelIdField"
              type="text"
              class="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
              :placeholder="activeModelConfigTab === 'main' ? '例如：qwen-plus' : '例如：qwen3.5-flash'"
            />
          </label>

          <label class="flex flex-col gap-1 text-sm text-gray-700 md:col-span-2">
            API Key
            <div class="flex gap-2">
              <input
                v-model="activeModelKeyField"
                :type="showModelKey ? 'text' : 'password'"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
                :placeholder="
                  activeModelConfigTab === 'main'
                    ? '请输入模型密钥'
                    : '留空时回退使用主模型 API Key'
                "
              />
              <button
                type="button"
                class="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-600"
                @click="showModelKey = !showModelKey"
              >
                {{ showModelKey ? '隐藏' : '显示' }}
              </button>
            </div>
          </label>

          <label class="flex flex-col gap-1 text-sm text-gray-700 md:col-span-2">
            Base URL
            <input
              v-model="activeModelBaseUrlField"
              type="text"
              class="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
              :placeholder="
                activeModelConfigTab === 'main'
                  ? '例如：https://dashscope.aliyuncs.com/compatible-mode/v1'
                  : '留空时回退使用主模型 Base URL'
              "
            />
          </label>

          <label class="flex flex-col gap-1 text-sm text-gray-700">
            Temperature
            <input
              v-model.number="activeModelTemperatureField"
              type="number"
              min="0"
              max="2"
              step="0.1"
              class="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
            />
          </label>

          <label class="flex flex-col gap-1 text-sm text-gray-700">
            主 Agent 超时(ms)
            <input
              v-model.number="modelConfigForm.mainAgentTimeoutMs"
              type="number"
              min="10000"
              max="300000"
              step="1000"
              class="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
            />
          </label>

          <label class="flex flex-col gap-1 text-sm text-gray-700">
            子 Agent 超时(ms)
            <input
              v-model.number="modelConfigForm.childAgentTimeoutMs"
              type="number"
              min="5000"
              max="300000"
              step="1000"
              class="rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-500"
            />
          </label>

          <label class="flex items-center gap-2 text-sm text-gray-700">
            <input v-model="modelConfigForm.streaming" type="checkbox" />
            启用 streaming
          </label>

          <label class="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
            <input v-model="modelConfigForm.useResponsesApi" type="checkbox" />
            启用 Responses API（仅 OpenAI 兼容模型生效）
          </label>
        </div>

        <div class="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 class="text-sm font-semibold text-slate-800">模型测速</h4>
              <p class="text-xs text-slate-500">
                使用当前 tab 的表单参数测试当前模型的单次响应耗时。
              </p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                :disabled="modelConfigLoading || modelConfigSaving || modelSpeedTesting !== null"
                @click="testModelSpeed(activeModelConfigTab)"
              >
                {{
                  modelSpeedTesting === activeModelConfigTab
                    ? activeModelConfigTab === 'main'
                      ? '主模型测速中...'
                      : '快速模型测速中...'
                    : activeModelConfigTab === 'main'
                      ? '测速主模型'
                      : '测速快速模型'
                }}
              </button>
            </div>
          </div>

          <div class="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm">
            <div class="mb-2 flex items-center justify-between gap-3">
              <span class="font-medium text-slate-800">
                {{ activeModelConfigTab === 'main' ? '主模型' : '快速模型' }}
              </span>
                <span class="text-xs text-slate-500">
                  {{
                    activeModelSpeedResult?.model ||
                  activeModelIdField ||
                  '未测试'
                  }}
                </span>
            </div>
            <div v-if="activeModelSpeedResult" class="space-y-1 text-xs text-slate-600">
              <div>
                结果：
                <span :class="activeModelSpeedResult.ok ? 'text-emerald-600' : 'text-rose-600'">
                  {{ activeModelSpeedResult.ok ? '成功' : '失败' }}
                </span>
              </div>
              <div>耗时：{{ activeModelSpeedResult.elapsedMs }} ms</div>
              <div>适配器：{{ activeModelSpeedResult.profile }}</div>
              <div v-if="activeModelSpeedResult.previewText" class="line-clamp-2">
                返回：{{ activeModelSpeedResult.previewText }}
              </div>
              <div v-else-if="activeModelSpeedResult.error" class="line-clamp-2 text-rose-600">
                错误：{{ activeModelSpeedResult.error }}
              </div>
            </div>
            <div v-else class="text-xs text-slate-500">尚未测速</div>
          </div>
        </div>

        <div class="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700"
            @click="showModelConfig = false"
          >
            取消
          </button>
          <button
            type="button"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="modelConfigSaving || modelConfigLoading"
            @click="saveModelConfig"
          >
            {{ modelConfigSaving ? '保存中...' : '保存配置' }}
          </button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-model="showPurgeConfirm"
      title="确认清空所有 AI 数据？"
      message="这将删除对话历史、记忆状态、人格状态和上传文件，且无法撤销。"
      confirm-text="确认清空"
      cancel-text="取消"
      loading-text="清空中..."
      size="md"
      icon="warning"
      :danger="true"
      :loading="purgeConfirmLoading"
      @confirm="confirmPurgeAllData"
      @cancel="restoreInputFocus"
    />

    <ConfirmDialog
      v-model="showDeleteFileConfirm"
      title="确认删除文件？"
      :message="deleteFileConfirmMessage"
      confirm-text="删除"
      cancel-text="取消"
      loading-text="删除中..."
      size="sm"
      icon="danger"
      :danger="true"
      :loading="deleteFileConfirmLoading"
      @confirm="confirmDeleteFile"
      @cancel="cancelDeleteFile"
    />

    <ConfirmDialog
      v-model="showPersonaResetConfirm"
      title="确认重置人格状态？"
      message="这将把人格指标恢复到默认初始值，不会删除对话历史、记忆和上传文件。"
      confirm-text="重置人格"
      cancel-text="取消"
      loading-text="重置中..."
      size="sm"
      icon="warning"
      :danger="true"
      :loading="personaResetLoading"
      @confirm="confirmResetPersonaState"
      @cancel="restoreInputFocus"
    />

    <ConfirmDialog
      v-model="showNoticeDialog"
      :title="noticeTitle"
      :message="noticeMessage"
      confirm-text="知道了"
      :show-cancel="false"
      size="sm"
      :icon="noticeIcon"
      @confirm="closeNoticeDialog"
    />

    <AvatarEditorDialog
      v-model="showAvatarEditor"
      :participant="editingParticipant"
      @apply="applyAvatarProfile"
      @cancel="restoreInputFocus"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'
import { useAIChatService } from '../services/aiClientService'
import { isFilePickerCancelled } from '../utils/filePicker'
import AILogPanel from '../components/AILogPanel.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import TaskQueuePanel from '../components/TaskQueuePanel.vue'
import AvatarEditorDialog from '../features/chat/components/AvatarEditorDialog.vue'
import ChatHeader from '../features/chat/components/ChatHeader.vue'
import ChatMessageList from '../features/chat/components/ChatMessageList.vue'
import MessageComposer from '../features/chat/components/MessageComposer.vue'
import type { ChatParticipantProfile, UploadedChatFile } from '../features/chat/types'
import {
  isSupportedChatImageUpload,
  type MainAgentUserMessageInput
} from '../../../share/cache/AItype/states/mainAgentMessageContent'
import type { ChatMessage } from '../../../share/cache/render/aiagent/chatMessage'
import type { ChatAvatarProfilesPayload, ChatParticipantKey } from '../../../share/cache/render/aiagent/chatAvatarProfile'
import type {
  ModelConfigInput,
  ModelConfigPayload,
  ModelSpeedTestResult,
  ModelSpeedTestTarget
} from '../../../share/cache/AItype/model/modelConfigPayload'
import type { MemoryInspectionPayload } from '../../../share/cache/AItype/states/memoryInspection'
import type {
  PersonaMetricDelta,
  PersonaMetrics
} from '../../../share/cache/AItype/states/personalState'
import type { TaskMonitorSnapshot } from '../../../share/cache/AItype/states/taskLifecycleState'

const {
  messages,
  isLoading,
  sendMessage,
  interruptCurrentRun,
  revertLastChatTurn,
  loadHistory,
  refreshHistory,
  purgeAllData,
  resetPersonaState,
  agentLogs
} =
  useAIChatService()
const userInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const composerRef = ref<{ focusInput: () => void } | null>(null)
const showLogs = ref(true) // 默认开启调试面板以便演示
const showTasks = ref(true)
const showModelConfig = ref(false)
const modelConfigLoading = ref(false)
const modelConfigSaving = ref(false)
const modelSpeedTesting = ref<ModelSpeedTestTarget | null>(null)
const modelSpeedResults = ref<Partial<Record<ModelSpeedTestTarget, ModelSpeedTestResult>>>({})
const activeModelConfigTab = ref<ModelSpeedTestTarget>('main')
const showModelKey = ref(false)
const showMemorySnapshot = ref(false)
const memorySnapshotLoading = ref(false)
const memorySnapshotError = ref('')
const memorySnapshotData = ref<MemoryInspectionPayload | null>(null)
const showPersonaResetConfirm = ref(false)
const personaResetLoading = ref(false)
const showPurgeConfirm = ref(false)
const purgeConfirmLoading = ref(false)
type DialogIcon = 'none' | 'info' | 'warning' | 'danger' | 'success'

const uploadedFiles = ref<UploadedChatFile[]>([])
const canSendMessage = computed(
  () =>
    !uploadedFiles.value.some((file) => file.status === 'pending') &&
    (Boolean(userInput.value.trim()) || uploadedFiles.value.length > 0)
)
const pendingDeleteFile = ref<UploadedChatFile | null>(null)
const showDeleteFileConfirm = ref(false)
const deleteFileConfirmLoading = ref(false)
const showNoticeDialog = ref(false)
const noticeTitle = ref('')
const noticeMessage = ref('')
const noticeIcon = ref<DialogIcon>('info')
const showAvatarEditor = ref(false)
const editingParticipantKey = ref<ChatParticipantKey>('ai')
const taskMonitorSnapshot = ref<TaskMonitorSnapshot | null>(null)
const taskMonitorLoading = ref(false)
const shouldFollowMessages = ref(true)
let taskMonitorTimer: number | null = null

const showRightSidebar = computed(() => showLogs.value || showTasks.value)
const AUTO_SCROLL_THRESHOLD_PX = 120
const composerDockPadding = computed(() => (uploadedFiles.value.length ? '10.5rem' : '7.5rem'))

const activeModelSpeedResult = computed(() => modelSpeedResults.value[activeModelConfigTab.value] ?? null)
const activeModelNameField = computed({
  get: () =>
    activeModelConfigTab.value === 'main'
      ? modelConfigForm.value.modelName
      : modelConfigForm.value.quickModelName,
  set: (value: string) => {
    if (activeModelConfigTab.value === 'main') {
      modelConfigForm.value.modelName = value
    } else {
      modelConfigForm.value.quickModelName = value
    }
  }
})

const activeModelVendorField = computed({
  get: () =>
    activeModelConfigTab.value === 'main'
      ? modelConfigForm.value.vendor
      : modelConfigForm.value.quickVendor,
  set: (value: ModelConfigInput['vendor']) => {
    if (activeModelConfigTab.value === 'main') {
      modelConfigForm.value.vendor = value
    } else {
      modelConfigForm.value.quickVendor = value
    }
  }
})

const activeModelIdField = computed({
  get: () =>
    activeModelConfigTab.value === 'main'
      ? modelConfigForm.value.model
      : modelConfigForm.value.quickModel,
  set: (value: string) => {
    if (activeModelConfigTab.value === 'main') {
      modelConfigForm.value.model = value
    } else {
      modelConfigForm.value.quickModel = value
    }
  }
})

const activeModelKeyField = computed({
  get: () =>
    activeModelConfigTab.value === 'main'
      ? modelConfigForm.value.modelKey
      : modelConfigForm.value.quickModelKey,
  set: (value: string) => {
    if (activeModelConfigTab.value === 'main') {
      modelConfigForm.value.modelKey = value
    } else {
      modelConfigForm.value.quickModelKey = value
    }
  }
})

const activeModelBaseUrlField = computed({
  get: () =>
    activeModelConfigTab.value === 'main'
      ? modelConfigForm.value.baseURL
      : modelConfigForm.value.quickBaseURL,
  set: (value: string) => {
    if (activeModelConfigTab.value === 'main') {
      modelConfigForm.value.baseURL = value
    } else {
      modelConfigForm.value.quickBaseURL = value
    }
  }
})

const activeModelTemperatureField = computed({
  get: () =>
    activeModelConfigTab.value === 'main'
      ? modelConfigForm.value.temperature
      : modelConfigForm.value.quickTemperature,
  set: (value: number) => {
    if (activeModelConfigTab.value === 'main') {
      modelConfigForm.value.temperature = value
    } else {
      modelConfigForm.value.quickTemperature = value
    }
  }
})

const revertibleTurnId = computed<number | undefined>(() => {
  if (isLoading.value) {
    return undefined
  }

  const lastMessage = messages.value.at(-1)
  if (!lastMessage || lastMessage.sender !== 'ai' || typeof lastMessage.turnId !== 'number') {
    return undefined
  }

  return lastMessage.turnId
})

const revertibleUserMessage = computed<ChatMessage | undefined>(() => {
  const turnId = revertibleTurnId.value
  if (typeof turnId !== 'number') {
    return undefined
  }

  return [...messages.value]
    .reverse()
    .find((message) => message.sender === 'user' && message.turnId === turnId)
})

const revertibleUserMessageId = computed<number | undefined>(() => revertibleUserMessage.value?.id)

const deleteFileConfirmMessage = computed<string>(() => {
  const file = pendingDeleteFile.value
  if (!file) return '确认删除该文件吗？'
  return `文件名：${file.name}\n此操作无法撤销。`
})

const defaultModelConfig: ModelConfigInput = {
  modelKey: '',
  vendor: 'openai',
  model: 'qwen-plus',
  modelName: '默认模型',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  temperature: 0.9,
  quickModelKey: '',
  quickVendor: 'openai',
  quickModel: 'qwen3.5-flash',
  quickModelName: '快速模型',
  quickBaseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  quickTemperature: 0.3,
  streaming: true,
  useResponsesApi: false,
  mainAgentTimeoutMs: 60000,
  childAgentTimeoutMs: 30000
}

const modelConfigForm = ref<ModelConfigInput>({
  ...defaultModelConfig
})

const chatParticipants = ref<Record<'ai' | 'user', ChatParticipantProfile>>({
  ai: {
    label: 'AI AGENT',
    nickname: '法弥拉',
    avatarText: 'AI',
    avatarUrl: '',
    avatarAlt: '法弥拉头像',
    avatarObjectPosition: 'center',
    avatarScale: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    accent: 'ai' as const,
    statusIcon: '🔥'
  },
  user: {
    label: 'USER',
    nickname: '你',
    avatarText: '你',
    avatarUrl: '',
    avatarAlt: '用户头像',
    avatarObjectPosition: 'center',
    avatarScale: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    accent: 'user' as const
  }
})

const editingParticipant = computed<ChatParticipantProfile | null>(
  () => chatParticipants.value[editingParticipantKey.value] ?? null
)

const mergeAvatarProfiles = (profiles: ChatAvatarProfilesPayload): void => {
  chatParticipants.value = {
    ai: {
      ...chatParticipants.value.ai,
      ...(profiles.ai ?? {})
    },
    user: {
      ...chatParticipants.value.user,
      ...(profiles.user ?? {})
    }
  }
}

const applyModelConfig = (config: ModelConfigPayload): void => {
  modelConfigForm.value = {
    modelKey: config.modelKey || '',
    vendor: config.vendor,
    model: config.model || 'qwen-plus',
    modelName: config.modelName || '默认模型',
    baseURL: config.baseURL || '',
    temperature: Number.isFinite(config.temperature) ? config.temperature : 0.9,
    quickModelKey: config.quickModelKey || '',
    quickVendor: config.quickVendor || 'openai',
    quickModel: config.quickModel || 'qwen3.5-flash',
    quickModelName: config.quickModelName || '快速模型',
    quickBaseURL: config.quickBaseURL || config.baseURL || '',
    quickTemperature: Number.isFinite(config.quickTemperature) ? config.quickTemperature : 0.3,
    streaming: config.streaming !== false,
    useResponsesApi: config.useResponsesApi === true,
    mainAgentTimeoutMs:
      Number.isFinite(config.mainAgentTimeoutMs) && config.mainAgentTimeoutMs > 0
        ? config.mainAgentTimeoutMs
        : 60000,
    childAgentTimeoutMs:
      Number.isFinite(config.childAgentTimeoutMs) && config.childAgentTimeoutMs > 0
        ? config.childAgentTimeoutMs
        : 30000
  }
}

const loadModelConfig = async (): Promise<void> => {
  modelConfigLoading.value = true
  try {
    const config = await window.api.getModelConfig()
    applyModelConfig(config)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    showNotice('加载模型配置失败', message, 'warning')
  } finally {
    modelConfigLoading.value = false
  }
}

const loadMemorySnapshot = async (): Promise<void> => {
  memorySnapshotLoading.value = true
  memorySnapshotError.value = ''
  try {
    const data = await window.api.getMemorySnapshot()
    memorySnapshotData.value = data
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    memorySnapshotError.value = `读取记忆状态失败：${message}`
  } finally {
    memorySnapshotLoading.value = false
  }
}

const openMemorySnapshot = async (): Promise<void> => {
  showMemorySnapshot.value = true
  await loadMemorySnapshot()
}

const openPersonaResetConfirm = (): void => {
  showPersonaResetConfirm.value = true
}

const openModelConfig = async (): Promise<void> => {
  await loadModelConfig()
  modelSpeedResults.value = {}
  showModelConfig.value = true
}

const saveModelConfig = async (): Promise<void> => {
  if (!modelConfigForm.value.model.trim()) {
    showNotice('参数校验失败', '模型名称不能为空', 'warning')
    return
  }
  modelConfigSaving.value = true
  try {
    const saved = await window.api.saveModelConfig({
      ...modelConfigForm.value,
      model: modelConfigForm.value.model.trim(),
      modelName: modelConfigForm.value.modelName.trim() || '默认模型',
      baseURL: modelConfigForm.value.baseURL.trim(),
      modelKey: modelConfigForm.value.modelKey.trim(),
      temperature: Number(modelConfigForm.value.temperature),
      quickModelKey: modelConfigForm.value.quickModelKey.trim(),
      quickVendor: modelConfigForm.value.quickVendor,
      quickModel: modelConfigForm.value.quickModel.trim(),
      quickModelName: modelConfigForm.value.quickModelName.trim() || '快速模型',
      quickBaseURL: modelConfigForm.value.quickBaseURL.trim(),
      quickTemperature: Number(modelConfigForm.value.quickTemperature),
      mainAgentTimeoutMs: Number(modelConfigForm.value.mainAgentTimeoutMs),
      childAgentTimeoutMs: Number(modelConfigForm.value.childAgentTimeoutMs)
    })
    applyModelConfig(saved)
    showModelConfig.value = false
    showNotice('保存成功', '模型配置已保存。下一次对话会使用新配置。', 'success')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    showNotice('保存模型配置失败', message, 'warning')
  } finally {
    modelConfigSaving.value = false
  }
}

const testModelSpeed = async (target: ModelSpeedTestTarget): Promise<void> => {
  modelSpeedTesting.value = target
  try {
    const result = await window.api.testModelSpeed(
      {
        ...modelConfigForm.value,
        model: modelConfigForm.value.model.trim(),
        modelName: modelConfigForm.value.modelName.trim() || '默认模型',
        baseURL: modelConfigForm.value.baseURL.trim(),
        modelKey: modelConfigForm.value.modelKey.trim(),
        temperature: Number(modelConfigForm.value.temperature),
        quickModelKey: modelConfigForm.value.quickModelKey.trim(),
        quickVendor: modelConfigForm.value.quickVendor,
        quickModel: modelConfigForm.value.quickModel.trim(),
        quickModelName: modelConfigForm.value.quickModelName.trim() || '快速模型',
        quickBaseURL: modelConfigForm.value.quickBaseURL.trim(),
        quickTemperature: Number(modelConfigForm.value.quickTemperature),
        mainAgentTimeoutMs: Number(modelConfigForm.value.mainAgentTimeoutMs),
        childAgentTimeoutMs: Number(modelConfigForm.value.childAgentTimeoutMs)
      },
      target
    )
    modelSpeedResults.value = {
      ...modelSpeedResults.value,
      [target]: result
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    showNotice('测速失败', message, 'warning')
  } finally {
    modelSpeedTesting.value = null
  }
}

const loadTaskMonitorSnapshot = async (silent = false): Promise<void> => {
  if (!silent) {
    taskMonitorLoading.value = true
  }
  try {
    taskMonitorSnapshot.value = await window.api.getTaskMonitorSnapshot()
  } catch (error) {
    console.error('Failed to load task monitor snapshot:', error)
  } finally {
    taskMonitorLoading.value = false
  }
}

const isNearBottom = (): boolean => {
  const container = messagesContainer.value
  if (!container) return true

  const distanceToBottom =
    container.scrollHeight - container.scrollTop - container.clientHeight
  return distanceToBottom <= AUTO_SCROLL_THRESHOLD_PX
}

const scrollMessagesToBottom = (): void => {
  if (!messagesContainer.value) return
  messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
}

const handleMessagesScroll = (): void => {
  shouldFollowMessages.value = isNearBottom()
}

const createUploadedFileId = (name: string): string =>
  self.crypto?.randomUUID ? self.crypto.randomUUID() : `${Date.now()}-${name}`

const readImagePreviewUrl = async (file: File): Promise<string | undefined> => {
  if (!String(file.type || '').startsWith('image/')) {
    return undefined
  }

  return await new Promise<string | undefined>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined)
    reader.onerror = () => resolve(undefined)
    reader.readAsDataURL(file)
  })
}

const revokePreviewUrl = (file: UploadedChatFile | null | undefined): void => {
  const previewUrl = file?.previewUrl
  if (previewUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(previewUrl)
  }
}

const replaceUploadedFile = (fileId: string, next: UploadedChatFile): void => {
  uploadedFiles.value = uploadedFiles.value.map((file) => (file.id === fileId ? next : file))
}

const removeUploadedFile = (fileId: string): UploadedChatFile | undefined => {
  const target = uploadedFiles.value.find((item) => item.id === fileId)
  if (!target) {
    return undefined
  }
  revokePreviewUrl(target)
  uploadedFiles.value = uploadedFiles.value.filter((item) => item.id !== fileId)
  return target
}

const clearComposerFiles = (): void => {
  for (const file of uploadedFiles.value) {
    revokePreviewUrl(file)
  }
  uploadedFiles.value = []
}

const uploadPendingSourceFile = async (fileId: string, sourcePath: string): Promise<void> => {
  try {
    const uploaded = await window.api.uploadFile(sourcePath)
    const current = uploadedFiles.value.find((file) => file.id === fileId)
    if (!current) {
      await window.api.deleteFile(uploaded.resourceUrl).catch(() => undefined)
      return
    }
    replaceUploadedFile(fileId, {
      ...current,
      resourceUrl: uploaded.resourceUrl,
      mimeType: uploaded.mimeType ?? current.mimeType,
      previewUrl: current.previewUrl || uploaded.resourceUrl,
      status: 'uploaded'
    })
  } catch (error: unknown) {
    removeUploadedFile(fileId)
    const message = error instanceof Error ? error.message : String(error)
    showNotice('图片上传失败', message, 'warning')
  }
}

const uploadClipboardImage = async (fileId: string, file: File): Promise<void> => {
  try {
    const uploaded = await window.api.uploadFileData({
      fileName: file.name || `pasted-image-${Date.now()}.png`,
      mimeType: file.type || undefined,
      data: await file.arrayBuffer()
    })
    const current = uploadedFiles.value.find((item) => item.id === fileId)
    if (!current) {
      await window.api.deleteFile(uploaded.resourceUrl).catch(() => undefined)
      return
    }
    replaceUploadedFile(fileId, {
      ...current,
      resourceUrl: uploaded.resourceUrl,
      mimeType: uploaded.mimeType ?? current.mimeType,
      status: 'uploaded'
    })
  } catch (error: unknown) {
    removeUploadedFile(fileId)
    const message = error instanceof Error ? error.message : String(error)
    showNotice('粘贴图片失败', message, 'warning')
  }
}

// Load history when component is mounted
onMounted(async () => {
  await loadModelConfig()
  mergeAvatarProfiles(await window.api.getAvatarProfiles())
  await loadTaskMonitorSnapshot()
  await loadHistory()
  taskMonitorTimer = window.setInterval(() => {
    void loadTaskMonitorSnapshot(true)
    if (!isLoading.value) {
      void refreshHistory()
    }
  }, 2500)
  // Scroll to bottom after loading history
  await nextTick()
  scrollMessagesToBottom()
  shouldFollowMessages.value = true
})

onBeforeUnmount(() => {
  clearComposerFiles()
  if (taskMonitorTimer) {
    clearInterval(taskMonitorTimer)
    taskMonitorTimer = null
  }
})

const handleSend = async (): Promise<void> => {
  if (!canSendMessage.value) return
  shouldFollowMessages.value = true
  const input: MainAgentUserMessageInput = {
    text: userInput.value,
    files: uploadedFiles.value
      .filter((file) => file.status === 'uploaded' && file.resourceUrl)
      .map((file) => ({
        fileId: file.id,
        fileUrl: file.resourceUrl as string,
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: file.mimeType
      }))
  }
  await sendMessage(input)
  userInput.value = ''
  clearComposerFiles()
  await loadTaskMonitorSnapshot(true)
}

const handleInterruptRun = async (): Promise<void> => {
  const result = await interruptCurrentRun()
  showNotice(result.ok ? '停止请求已发送' : '无法停止当前回复', result.message, result.ok ? 'info' : 'warning')
}

const handleRevertLastTurn = async (message?: ChatMessage): Promise<void> => {
  const result = await revertLastChatTurn()
  if (result.ok) {
    userInput.value = result.restoredInput?.text || message?.text || revertibleUserMessage.value?.text || ''
    clearComposerFiles()
    uploadedFiles.value = (result.restoredInput?.files ?? []).map((file) => ({
      id: file.fileId,
      name: file.fileName,
      resourceUrl: file.fileUrl,
      sourcePath: '',
      size: file.sizeBytes ?? 0,
      mimeType: file.mimeType,
      previewUrl: file.fileUrl,
      status: 'uploaded'
    }))
    await loadTaskMonitorSnapshot(true)
    showNotice('已撤回上一轮', result.message, 'success')
    await nextTick()
    scrollMessagesToBottom()
    await restoreInputFocus()
    return
  }

  showNotice('撤回失败', result.message, 'warning')
}

const handlePickFile = async (): Promise<void> => {
  try {
    const result = await window.api.pickFile()
    const validation = isSupportedChatImageUpload({
      fileName: result.fileName,
      mimeType: result.mimeType,
      sizeBytes: result.size
    })
    if (!validation.ok) {
      showNotice('暂不支持该文件', validation.reason, 'warning')
      return
    }
    const id = createUploadedFileId(result.fileName)
    uploadedFiles.value.push({
      id,
      name: result.fileName,
      sourcePath: result.sourcePath,
      size: result.size,
      mimeType: result.mimeType,
      status: 'pending'
    })
    void uploadPendingSourceFile(id, result.sourcePath)
  } catch (error: unknown) {
    if (isFilePickerCancelled(error)) {
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    showNotice('文件选择失败', message, 'warning')
  }
}

const handlePasteFiles = async (files: File[]): Promise<void> => {
  for (const file of files) {
    const validation = isSupportedChatImageUpload({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size
    })
    if (!validation.ok) {
      showNotice('暂不支持该文件', validation.reason, 'warning')
      continue
    }

    const previewUrl = await readImagePreviewUrl(file)
    const id = createUploadedFileId(file.name || 'pasted-image')
    uploadedFiles.value.push({
      id,
      name: file.name || `pasted-image-${Date.now()}.png`,
      sourcePath: '',
      size: file.size,
      mimeType: file.type || undefined,
      previewUrl,
      status: 'pending'
    })
    void uploadClipboardImage(id, file)
  }
}

type PersonaMetricKey = keyof PersonaMetrics

const PERSONA_METRICS: Array<{ key: PersonaMetricKey; label: string }> = [
  { key: 'autonomy_level', label: '自主性' },
  { key: 'verbosity_index', label: '详略度' },
  { key: 'risk_tolerance', label: '风险倾向' },
  { key: 'formality_score', label: '正式度' }
]

const formatIsoTime = (iso?: string): string => {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const seconds = date.getSeconds().toString().padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}:${seconds}`
}

const formatPercent = (value?: number): string => {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.round((value as number) * 100)}%`
}

const metricBarWidth = (value: number): string => {
  const normalized = Math.max(0, Math.min(1, value))
  return `${Math.round(normalized * 100)}%`
}

const formatSignedMetric = (value: number): string => {
  const normalized = Number.isFinite(value) ? value : 0
  return `${normalized >= 0 ? '+' : ''}${normalized.toFixed(2)}`
}

const deltaToneClass = (value: number): string => {
  if (value >= 0.08) {
    return 'border-rose-200 bg-rose-50 text-rose-700'
  }
  if (value <= -0.08) {
    return 'border-sky-200 bg-sky-50 text-sky-700'
  }
  return 'border-gray-200 bg-white text-gray-600'
}

const personaMetricEntries = (metrics: PersonaMetrics) =>
  PERSONA_METRICS.map((metric) => ({
    ...metric,
    value: metrics[metric.key]
  }))

const personaDeltaEntries = (metrics: PersonaMetricDelta) =>
  PERSONA_METRICS.map((metric) => ({
    ...metric,
    value: metrics[metric.key]
  }))

const describeMood = (value?: string): string => {
  switch (value) {
    case 'calm':
      return '平静'
    case 'positive':
      return '积极'
    case 'impatient':
      return '急切'
    case 'frustrated':
      return '受挫'
    case 'uncertain':
      return '犹疑'
    default:
      return '未识别'
  }
}

const describeConversationMode = (value?: string): string => {
  switch (value) {
    case 'daily_life':
      return '日常'
    case 'practical_support':
      return '现实协助'
    case 'worldbuilding':
      return '世界共创'
    case 'knowledge_query':
      return '知识问答'
    case 'relational_intimacy':
      return '关系靠近'
    default:
      return '未识别'
  }
}

const describeInteractionState = (value?: string): string => {
  switch (value) {
    case 'casual_chat':
      return '闲聊'
    case 'emotional_sharing':
      return '倾诉'
    case 'working':
      return '工作'
    case 'teasing':
      return '挑逗'
    case 'deep_talk':
      return '深聊'
    default:
      return '未识别'
  }
}

const moodBadgeClass = (value?: string): string => {
  switch (value) {
    case 'positive':
      return 'bg-emerald-100 text-emerald-700'
    case 'calm':
      return 'bg-sky-100 text-sky-700'
    case 'impatient':
      return 'bg-amber-100 text-amber-700'
    case 'frustrated':
      return 'bg-rose-100 text-rose-700'
    case 'uncertain':
      return 'bg-slate-200 text-slate-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

const describeMemoryStageStatus = (value?: string): string => {
  switch (value) {
    case 'completed':
      return '模型归档'
    case 'fallback':
      return '规则回退'
    default:
      return '未知'
  }
}

const memoryStageStatusClass = (value?: string): string => {
  switch (value) {
    case 'completed':
      return 'bg-emerald-100 text-emerald-700'
    case 'fallback':
      return 'bg-amber-100 text-amber-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

const describeMemoryStageTrigger = (value?: string): string => {
  switch (value) {
    case 'window_overflow':
      return '短期窗口切段'
    case 'manual':
      return '手动归档'
    case 'task_boundary':
      return '任务边界'
    default:
      return '阶段归档'
  }
}

const describeArchiveHealth = (value?: string): string => {
  switch (value) {
    case 'healthy':
      return '正常'
    case 'down':
      return '已回退'
    case 'skipped':
      return '待触发'
    default:
      return '未知'
  }
}

const archiveHealthClass = (value?: string): string => {
  switch (value) {
    case 'healthy':
      return 'bg-emerald-100 text-emerald-700'
    case 'down':
      return 'bg-amber-100 text-amber-700'
    case 'skipped':
      return 'bg-slate-200 text-slate-700'
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

const formatMoodValence = (value?: number): string => {
  if (!Number.isFinite(value)) return '中性'
  const normalized = Math.max(-1, Math.min(1, value as number))
  if (normalized >= 0.2) {
    return `正向 ${Math.round(normalized * 100)}%`
  }
  if (normalized <= -0.2) {
    return `负向 ${Math.round(Math.abs(normalized) * 100)}%`
  }
  return '中性'
}

const moodValenceWidth = (value?: number): string => {
  const normalized = Number.isFinite(value) ? Math.max(-1, Math.min(1, value as number)) : 0
  return `${Math.round(((normalized + 1) / 2) * 100)}%`
}

const formatSignalLabel = (signal: string): string => {
  const normalized = signal.replace(/_/g, ' ').trim()
  switch (signal) {
    case 'user_message':
      return '用户输入'
    case 'user_interrupt':
      return '用户打断'
    case 'user_revert':
      return '用户撤回'
    case 'task_completed':
      return '任务完成'
    case 'task_failed':
      return '任务失败'
    case 'task_needs_input':
      return '任务待输入'
    case 'task_cancelled':
      return '任务取消'
    default:
      return normalized || '未知信号'
  }
}

const requestDeleteFile = (file: UploadedChatFile): void => {
  if (file.status === 'pending') {
    removeUploadedFile(file.id)
    return
  }
  if (!file.resourceUrl) {
    removeUploadedFile(file.id)
    return
  }
  pendingDeleteFile.value = file
  showDeleteFileConfirm.value = true
}

const cancelDeleteFile = (): void => {
  pendingDeleteFile.value = null
  showDeleteFileConfirm.value = false
  void restoreInputFocus()
}

const confirmDeleteFile = async (): Promise<void> => {
  const file = pendingDeleteFile.value
  if (!file || !file.resourceUrl) {
    cancelDeleteFile()
    return
  }
  if (deleteFileConfirmLoading.value) return
  deleteFileConfirmLoading.value = true
  try {
    await window.api.deleteFile(file.resourceUrl)
    removeUploadedFile(file.id)
    pendingDeleteFile.value = null
    showDeleteFileConfirm.value = false
    await restoreInputFocus()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    showNotice('删除文件失败', message, 'warning')
  } finally {
    deleteFileConfirmLoading.value = false
  }
}

const restoreInputFocus = async (): Promise<void> => {
  await nextTick()
  window.focus()
  if (
    !isLoading.value &&
    !showModelConfig.value &&
    !showMemorySnapshot.value &&
    !showPurgeConfirm.value &&
    !showPersonaResetConfirm.value &&
    !showDeleteFileConfirm.value &&
    !showNoticeDialog.value
  ) {
    composerRef.value?.focusInput()
  }
}

const showNotice = (title: string, message: string, icon: DialogIcon = 'info'): void => {
  noticeTitle.value = title
  noticeMessage.value = message
  noticeIcon.value = icon
  showNoticeDialog.value = true
}

const closeNoticeDialog = async (): Promise<void> => {
  showNoticeDialog.value = false
  await restoreInputFocus()
}

const openPurgeConfirm = (): void => {
  showPurgeConfirm.value = true
}

const openAvatarEditor = (sender: ChatParticipantKey): void => {
  editingParticipantKey.value = sender
  showAvatarEditor.value = true
}

const applyAvatarProfile = async (input: {
  avatarUrl?: string
  avatarScale?: number
  avatarOffsetX?: number
  avatarOffsetY?: number
}): Promise<void> => {
  const key = editingParticipantKey.value
  try {
    const saved = await window.api.saveAvatarProfile({
      participantKey: key,
      avatarUrl: input.avatarUrl || '',
      avatarScale: input.avatarScale ?? 1,
      avatarOffsetX: input.avatarOffsetX ?? 0,
      avatarOffsetY: input.avatarOffsetY ?? 0
    })
    chatParticipants.value = {
      ...chatParticipants.value,
      [key]: {
        ...chatParticipants.value[key],
        ...saved
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    showNotice('保存头像失败', message, 'warning')
  }
  void restoreInputFocus()
}

const confirmPurgeAllData = async (): Promise<void> => {
  if (purgeConfirmLoading.value) return
  purgeConfirmLoading.value = true
  try {
    await purgeAllData()
    await loadTaskMonitorSnapshot(true)
    clearComposerFiles()
    showPurgeConfirm.value = false
    await restoreInputFocus()
  } finally {
    purgeConfirmLoading.value = false
  }
}

const confirmResetPersonaState = async (): Promise<void> => {
  if (personaResetLoading.value) return
  personaResetLoading.value = true
  try {
    await resetPersonaState()
    await loadMemorySnapshot()
    showPersonaResetConfirm.value = false
    showNotice('人格已重置', '人格状态已恢复到默认初始值。', 'success')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    showNotice('重置人格失败', message, 'warning')
  } finally {
    personaResetLoading.value = false
  }
}

// Scroll to the bottom when new messages are added
watch(
  messages,
  async () => {
    await nextTick()
    if (shouldFollowMessages.value) {
      scrollMessagesToBottom()
    }
  },
  { deep: true }
)
</script>
