<template>
  <div class="productionMusicV2">
    <header class="pageHeader">
      <div><h2>配乐导演</h2><p>项目音乐方向、可复用作品与本集用乐安排。</p></div>
      <t-space>
        <t-button variant="outline" :loading="loading" @click="loadAll"><template #icon><i-refresh /></template>刷新</t-button>
        <t-button variant="outline" @click="toggleAgent"><template #icon><i-message /></template>{{ agentVisible ? "收起 Agent" : "打开 Agent" }}</t-button>
      </t-space>
    </header>

    <main class="directorLayout" :class="{ agentHidden: !agentVisible }">
      <section class="workspace">
        <nav class="mainTabs" aria-label="配乐工作区">
          <button type="button" :class="{ active: activeStep === 'project' }" @click="openProjectDirection"><strong>项目配乐</strong><small>{{ libraryItems.length }} 个音乐作品</small></button>
          <button type="button" :class="{ active: activeStep === 'episode' }" @click="openEpisodeWorkspace"><strong>本集用乐</strong><small>{{ selectedScriptId ? `${cues.length} 个用乐段落` : "安排复用、新做或静音" }}</small></button>
        </nav>

        <t-loading :loading="loading" show-overlay>
          <p v-if="promptReviewPendingCount && (activeStep === 'episode' || projectTab === 'works')" class="taskProgressText">当前 Prompt 正在检查，请等待本次检查完成后再提交；未审核版本需等待结果后才能生成。</p>
          <section v-if="activeStep === 'project'" class="workspaceBody">
            <nav class="subTabs" aria-label="项目配乐内容">
              <button type="button" :class="{ active: projectTab === 'direction' }" @click="projectTab = 'direction'">配乐方向</button>
              <button type="button" :class="{ active: projectTab === 'works' }" @click="openWorksWorkspace">音乐作品 <span>{{ libraryItems.length }}</span></button>
            </nav>

            <section v-if="projectTab === 'direction'" class="directionWorkspace">
              <article class="documentSurface">
                <header class="documentHeader"><div><h3>配乐方向 · Music Bible</h3><p>整体听感、主题动机、配器与静默策略。</p></div><t-space><t-select v-model="selectedBibleId" :options="bibleOptions" placeholder="选择版本" @change="loadBibleDetail" /><t-button theme="primary" :loading="busy.bible" @click="submitBible">生成方向</t-button><t-button variant="outline" :disabled="!selectedBible" :loading="busy.bibleReview" @click="submitBibleReview">重新检查</t-button></t-space></header>
                <div v-if="selectedBible" class="documentReader"><aside class="documentOutline"><strong>文档目录</strong><button v-for="item in bibleCatalog" :key="item.id" type="button" :class="{ active: activeBibleCatalogId === item.id }" :style="{ paddingLeft: `${8 + (item.level - 1) * 12}px` }" :aria-current="activeBibleCatalogId === item.id ? 'location' : undefined" @click="scrollToBibleHeading(item.id)">{{ item.text }}</button><p v-if="selectedBible.content && !bibleCatalog.length" class="catalogEmpty">暂无可用目录</p></aside><div ref="bibleContentRef" class="readableDetail"><strong>{{ selectedBible.title || `版本 ${selectedBible.version || selectedBible.id}` }}</strong><MdPreview v-if="selectedBible.content" class="musicMarkdown" :model-value="selectedBible.content" :theme="mdTheme" :md-heading-id="bibleHeadingId" preview-only @on-get-catalog="handleBibleCatalog" /><p v-else>暂无正文</p></div></div>
                <EmptyState v-else text="告诉 Agent 这部片子的配乐方向，或直接生成第一版配乐方向。" />
                <ReviewList :reviews="bibleReviews" />
              </article>
            </section>

            <section v-else class="workbenchSplit">
              <aside class="contextRail libraryRail">
                <header><div><h3>音乐作品</h3><small>选择作品与编曲版本</small></div><t-button size="small" variant="outline" @click="libraryDialogVisible = true">新建</t-button></header>
                <div v-if="selectedPlan?.recommendedProduction" class="planHint"><strong>推荐制作</strong><span>{{ selectedPlan.recommendedProduction.workKey }} / {{ selectedPlan.recommendedProduction.editionKey }}</span></div>
                <div class="railActions"><t-button size="small" :loading="busy.plan" :disabled="!selectedBible" @click="submitProjectPlan">生成作品规划</t-button><t-button size="small" variant="text" :disabled="!selectedPlan" :loading="busy.planReview" @click="submitPlanReview">检查规划</t-button></div>
                <EmptyState v-if="!libraryItems.length" text="生成项目作品规划或新建音乐作品后，作品会出现在这里。" compact />
                <div v-else class="libraryList"><section v-for="item in libraryItems" :key="item.id" class="libraryListItem" :class="{ selected: selectedLibraryItemId === item.id }"><button type="button" class="workSelect" @click="selectLibraryItem(item.id)"><span class="workType">{{ workTypeLabel(item.workType) }}</span><strong>{{ item.title || item.workKey }}</strong><small>{{ item.narrativeRole || "暂无叙事说明" }}</small></button><button v-for="edition in item.editions" :key="edition.id" type="button" class="editionSelect" :class="{ selected: selectedEditionId === edition.id }" @click="openEditionProduction(item.id, edition.id)"><span>{{ edition.title || edition.editionKey }}</span><small>{{ vocalModeLabel(edition.vocalMode) }} · {{ edition.versions?.length || 0 }} 个版本</small></button></section></div>
              </aside>

              <section class="contextComposer">
                <header class="composerHeader"><div><h3>{{ selectedLibraryItem?.title || "选择音乐作品" }}<template v-if="selectedEdition"> / {{ selectedEdition.title || selectedEdition.editionKey }}</template></h3><p v-if="selectedEdition">{{ selectedEdition.narrativePhase || "为当前叙事阶段制作可试听版本" }}</p><p v-else>从左侧选择一个编曲版本，再编辑 Prompt 并生成候选音频。</p></div><t-space v-if="selectedEdition"><t-tag variant="light" :theme="productionVoiceMode === 'vocal' ? 'warning' : 'primary'">{{ vocalModeLabel(productionVoiceMode) }}</t-tag><modelSelect v-if="promptMode === 'modelSpecific'" v-model="musicModel" class="modelSelect" type="music" change-config @change="handleModelChange" /><t-button size="small" variant="outline" @click="loadProductionData">刷新</t-button></t-space></header>
                <EmptyState v-if="!selectedEdition" text="选择一个编曲版本后，可在这里完成 Prompt、生成、试听与选版。" />
                <template v-else>
                  <div v-if="selectedEdition.vocalMode === 'optional'" class="modeChooser"><span>本次制作</span><t-radio-group v-model="optionalVocalMode" variant="default-filled"><t-radio-button value="instrumental">纯音乐</t-radio-button><t-radio-button value="vocal">人声</t-radio-button></t-radio-group></div>
                  <section class="composerFlow" :class="{ candidateRail: !agentVisible }">
                    <div class="editorStack">
                      <article v-if="showLyricsEditor" class="panel lyricsPanel"><header class="panelHeader"><div><h4>歌词版本</h4><p>当前为人声制作。确认歌词后，重新编译 Prompt 才会写入精确关联。</p></div><t-button size="small" variant="outline" :loading="busy.lyrics" @click="submitLyricsGenerate">生成草稿</t-button></header><t-select v-model="selectedLyricsId" :options="lyricsOptions" clearable placeholder="选择已保存歌词" @change="loadSelectedLyrics" /><t-textarea v-model="lyricsDraft" :autosize="{ minRows: 6, maxRows: 12 }" placeholder="输入或编辑歌词正文" /><div class="inlineActions"><t-button size="small" :disabled="!lyricsDraft.trim()" @click="saveLyricsDraft">保存为新版本</t-button><t-button size="small" variant="outline" :disabled="!selectedLyrics || selectedLyrics.state === 'confirmed' || selectedLyrics.reviewStatus === 'blocked'" @click="confirmSelectedLyrics">确认歌词</t-button><StatusTag v-if="selectedLyrics" :status="selectedLyrics.reviewStatus" /></div></article>
                      <article class="panel promptPanel"><header class="panelHeader"><div><h4>模型专用 Prompt</h4><p>{{ promptContextDescription }}</p></div><t-space><t-button size="small" :disabled="!canCompilePrompt" :loading="busy.compile" @click="submitCompilePrompt">编译 Prompt</t-button><t-button size="small" variant="outline" :disabled="!selectedPrompt" :loading="busy.promptReview" @click="submitPromptReview">重新检查</t-button></t-space></header><t-radio-group v-model="promptMode" variant="default-filled"><t-radio-button value="generic">通用 Prompt</t-radio-button><t-radio-button value="modelSpecific">模型专用</t-radio-button></t-radio-group><p v-if="promptMode === 'generic'" class="promptHint">通用 Prompt 可保存和审核；模型专用编译交给配乐导演 Agent。</p><p v-else-if="promptRequiresRecompile" class="promptHint errorText">模型或 Profile 与当前版本不一致，请重新编译后使用新版本。</p><p v-else-if="selectedPrompt && !promptVocalCompatible" class="promptHint errorText">该历史 Prompt 与当前{{ vocalModeLabel(productionVoiceMode) }}制作不兼容，请重新编译，不会改写历史版本。</p><t-select v-model="selectedPromptId" :options="promptOptions" placeholder="选择 Prompt 版本" @change="loadSelectedPrompt" /><t-textarea v-model="promptDraft" :autosize="{ minRows: 8, maxRows: 16 }" placeholder="保存的 Prompt 正文" /><div class="promptSettings"><t-input-number v-model="promptDuration" :min="modelDurationMin" :max="modelDurationMax" :step="1" suffix="秒" /><t-input-number v-if="productionTarget === 'edition'" v-model="effectiveDuration" :min="1" :step="1" suffix="建议用乐秒数" /><span v-if="promptMode === 'modelSpecific' && modelCapabilities.durationRange">模型范围 {{ modelDurationMin }} - {{ modelDurationMax }} 秒</span></div><div class="inlineActions"><t-button size="small" :disabled="!canSavePrompt" @click="savePromptDraft">保存为新版本</t-button><StatusTag v-if="selectedPrompt" :status="selectedPrompt.reviewStatus" /><span v-if="selectedPrompt?.reviewStatus === 'warning'" class="warningText">生成前需明确确认警告</span></div></article>
                    </div>
                    <article class="panel candidatePanel"><header class="panelHeader"><div><h4>候选音频</h4><p>{{ generationDescription }}</p></div><t-space><t-checkbox v-if="selectedPrompt?.reviewStatus === 'warning'" v-model="acknowledgeWarnings">已了解审阅警告</t-checkbox><t-button theme="primary" :disabled="!canGenerate" :loading="busy.generate" @click="submitGenerate">生成候选音频</t-button></t-space></header><ReviewList :reviews="promptReviews" compact /><div v-if="candidateOutcome" class="candidateOutcome"><strong>本次生成</strong><span>已保存 {{ candidateOutcome.candidateCount }} 个候选版本，请试听后手动选版。</span><small v-if="candidateOutcome.failedCount">另有 {{ candidateOutcome.failedCount }} 个候选未保存：{{ candidateOutcome.failedSummary }}</small></div><div v-if="productionVersions.length" class="versionList"><article v-for="version in productionVersions" :key="versionKey(version)" class="audioVersion"><div><strong>v{{ version.version || version.id }}</strong><StatusTag :status="version.state" /><span class="sourceTag">{{ version.lyricsVersionId ? `歌词 v${version.lyricsVersionId}` : "纯音乐" }}</span><p v-if="version.errorReason" class="errorText">{{ version.errorReason }}</p><small>Prompt {{ version.promptVersionId || "-" }} · {{ version.generationDurationSec || version.effectiveMusicDurationSec || "-" }} 秒</small></div><div class="audioActions"><t-button v-if="hasPlayableAudio(version)" size="small" variant="outline" @click="openPreview(version)">试听</t-button><t-button v-if="version.state === 'complete' && hasPlayableAudio(version)" size="small" variant="outline" :loading="busy[downloadBusyKey('libraryVersion', version.id)]" @click="downloadProductionVersion('libraryVersion', version)">下载</t-button><t-button v-else-if="version.state === 'complete'" size="small" variant="outline" disabled>暂无音频</t-button><t-button size="small" :disabled="version.state !== 'complete' || isSelectedVersion(version)" @click="selectProductionVersion(version)">选为当前版本</t-button><t-button v-if="version.state === 'complete' && hasPlayableAudio(version)" size="small" variant="outline" @click="openTrim(version as MusicLibraryVersion)">截取</t-button></div></article></div><EmptyState v-else text="审核通过后生成多个候选音频，系统不会自动替你选版。" compact /></article>
                  </section>
                </template>
              </section>
            </section>
          </section>

          <section v-else class="workspaceBody">
            <header class="episodeHeader"><div><h3>本集用乐</h3><p>按叙事段落决定复用、新做或静音。</p></div><t-space><t-select v-model="selectedScriptId" class="episodeSelect" :options="scriptOptions" placeholder="选择剧集" @change="loadEpisodeData" /><t-button :disabled="!selectedBible || !selectedScriptId" :loading="busy.episodePlan" @click="submitEpisodePlan">生成本集用乐</t-button></t-space></header>
            <div class="episodeToolbar"><t-select v-model="selectedEpisodePlanId" :options="episodePlanOptions" placeholder="选择本集用乐规划" @change="loadCues" /><span>{{ cues.length }} 个用乐段落</span><t-button size="small" variant="outline" :loading="busy.cues" @click="loadCues">刷新</t-button></div>
            <EmptyState v-if="!selectedScriptId" text="选择剧集后即可生成或查看本集的叙事用乐安排。" />
            <EmptyState v-else-if="!selectedEpisodePlanId" text="当前剧集还没有用乐规划。生成后可以决定每个段落是复用、新做还是静音。" />
            <section v-else class="workbenchSplit cueWorkspace">
              <aside class="contextRail cueRail"><header><div><h3>本集用乐段落</h3><small>{{ cues.length }} 个 Cue</small></div></header><button v-for="cue in cues" :key="cue.id" type="button" class="cueSelect" :class="{ selected: selectedCueId === cue.id }" @click="openCueWorkspace(cue.id)"><span>{{ cue.cueKey || `Cue ${cue.id}` }}</span><strong>{{ cue.title || "未命名用乐段落" }}</strong><small>{{ cue.binding?.suggestedUseDurationSec || cue.estimatedDurationSec || "-" }} 秒</small><t-tag size="small" :theme="usageTheme(cue.usageMode)" variant="light">{{ usageLabel(cue.usageMode) }}</t-tag></button></aside>
              <section class="contextComposer"><EmptyState v-if="!selectedCue" text="从左侧选择一个用乐段落。" /><template v-else><header class="composerHeader"><div><h3>{{ selectedCue.cueKey || `Cue ${selectedCue.id}` }} · {{ selectedCue.title || "未命名用乐段落" }}</h3><p>{{ refText(selectedCue.startRef) }} → {{ refText(selectedCue.endRef) }} · 建议 {{ selectedCue.binding?.suggestedUseDurationSec || selectedCue.estimatedDurationSec || "-" }} 秒</p></div><t-button size="small" variant="text" @click="loadCues">刷新段落</t-button></header><t-radio-group :model-value="selectedCue.usageMode || 'new'" class="cueModeChooser" variant="default-filled" @change="handleCueUsageChange(selectedCue, $event)"><t-radio-button value="reuse">复用项目版本</t-radio-button><t-radio-button value="new">新做音频</t-radio-button><t-radio-button value="silence">静音</t-radio-button></t-radio-group><section v-if="selectedCue.usageMode === 'reuse'" class="bindingSurface"><h4>复用项目版本</h4><p>选择已完成的项目编曲版本，并显式绑定到本段。</p><t-select v-model="cueBindingDraft[selectedCue.id].editionId" :options="editionOptions" placeholder="选择编曲版本" @change="() => resetCueVersion(selectedCue!.id)" /><t-select v-if="cueBindingDraft[selectedCue.id].editionId" v-model="cueBindingDraft[selectedCue.id].libraryVersionId" :options="libraryVersionOptions(cueBindingDraft[selectedCue.id].editionId)" placeholder="选择可复用成品" /><t-input-number v-model="cueBindingDraft[selectedCue.id].duration" :min="1" :step="1" suffix="秒" /><t-button theme="primary" :loading="busy[`bind-${selectedCue.id}`]" @click="saveCueBinding(selectedCue)">保存复用安排</t-button></section><EmptyState v-else-if="selectedCue.usageMode === 'silence'" text="静音段落不需要 Prompt 或音频生成。" /><template v-else><section class="bindingSurface"><h4>本段新做设置</h4><p>可关联一个项目编曲版本作为方向参考；保存后不会自动选择候选成品。</p><t-select v-model="cueBindingDraft[selectedCue.id].editionId" :options="editionOptions" placeholder="选择参考编曲版本" @change="() => resetCueVersion(selectedCue!.id)" /><t-input-number v-model="cueBindingDraft[selectedCue.id].duration" :min="1" :step="1" suffix="秒" /><t-button size="small" variant="outline" :loading="busy[`bind-${selectedCue.id}`]" @click="saveCueBinding(selectedCue)">保存本段安排</t-button></section><section class="composerFlow" :class="{ candidateRail: !agentVisible }"><div class="editorStack"><article class="panel promptPanel"><header class="panelHeader"><div><h4>本段模型专用 Prompt</h4><p>本段生成只使用当前 Cue 的精确 Prompt，不与项目作品候选混用。</p></div><t-space><modelSelect v-if="promptMode === 'modelSpecific'" v-model="musicModel" class="modelSelect" type="music" change-config @change="handleModelChange" /><t-button size="small" :disabled="!canCompilePrompt" :loading="busy.compile" @click="submitCompilePrompt">编译 Prompt</t-button></t-space></header><t-radio-group v-model="promptMode" variant="default-filled"><t-radio-button value="generic">通用 Prompt</t-radio-button><t-radio-button value="modelSpecific">模型专用</t-radio-button></t-radio-group><p v-if="promptMode === 'generic'" class="promptHint">通用 Prompt 可保存和审核；模型专用编译交给配乐导演 Agent。</p><p v-else-if="promptRequiresRecompile" class="promptHint errorText">模型或 Profile 与当前版本不一致，请重新编译后使用新版本。</p><t-select v-model="selectedPromptId" :options="promptOptions" placeholder="选择 Prompt 版本" @change="loadSelectedPrompt" /><t-textarea v-model="promptDraft" :autosize="{ minRows: 8, maxRows: 16 }" placeholder="保存的 Prompt 正文" /><div class="promptSettings"><t-input-number v-model="promptDuration" :min="modelDurationMin" :max="modelDurationMax" :step="1" suffix="秒" /></div><div class="inlineActions"><t-button size="small" :disabled="!canSavePrompt" @click="savePromptDraft">保存为新版本</t-button><t-button size="small" variant="outline" :disabled="!selectedPrompt" :loading="busy.promptReview" @click="submitPromptReview">重新检查</t-button><StatusTag v-if="selectedPrompt" :status="selectedPrompt.reviewStatus" /></div></article></div><article class="panel candidatePanel"><header class="panelHeader"><div><h4>本段候选音频</h4><p>{{ generationDescription }}</p></div><t-space><t-checkbox v-if="selectedPrompt?.reviewStatus === 'warning'" v-model="acknowledgeWarnings">已了解审阅警告</t-checkbox><t-button theme="primary" :disabled="!canGenerate" :loading="busy.generate" @click="submitGenerate">生成本段候选音频</t-button></t-space></header><ReviewList :reviews="promptReviews" compact /><div v-if="candidateOutcome" class="candidateOutcome"><strong>本次生成</strong><span>已保存 {{ candidateOutcome.candidateCount }} 个候选版本，请试听后手动选版。</span><small v-if="candidateOutcome.failedCount">另有 {{ candidateOutcome.failedCount }} 个候选未保存：{{ candidateOutcome.failedSummary }}</small></div><div v-if="productionVersions.length" class="versionList"><article v-for="version in productionVersions" :key="versionKey(version)" class="audioVersion"><div><strong>候选 {{ version.version || version.id }}</strong><StatusTag :status="version.state" /><p v-if="version.errorReason" class="errorText">{{ version.errorReason }}</p><small>Prompt {{ version.promptVersionId || "-" }} · {{ selectedCue.binding?.suggestedUseDurationSec || selectedCue.estimatedDurationSec || "-" }} 秒</small></div><div class="audioActions"><t-button v-if="hasPlayableAudio(version)" size="small" variant="outline" @click="openPreview(version)">试听</t-button><t-button v-if="version.state === 'complete' && hasPlayableAudio(version)" size="small" variant="outline" :loading="busy[downloadBusyKey('cueAsset', version.id)]" @click="downloadProductionVersion('cueAsset', version)">下载</t-button><t-button v-else-if="version.state === 'complete'" size="small" variant="outline" disabled>暂无音频</t-button><t-button size="small" :disabled="version.state !== 'complete' || isSelectedVersion(version)" @click="selectProductionVersion(version)">选为本段版本</t-button></div></article></div><EmptyState v-else text="审核通过后生成候选音频，再显式选为本段版本。" compact /></article></section></template></template></section>
            </section>
          </section>
        </t-loading>
      </section>
      <aside v-if="agentVisible" class="agentSlot"><AgentChatPanel :title="musicAgentTitle" placeholder="告诉我你希望推进哪一步配乐工作" :connected="musicAgentConnected" :loading="musicAgentLoading" :messages="agentMessages" @send="sendAgentMessage" @stop="stopAgent" @close="agentVisible = false"><template #status><section v-if="agentStatusText || agentProgress" class="agentRunStatus" :class="{ running: musicAgentStore.runRunning }"><strong>{{ agentStatusText }}</strong><span v-if="agentProgress">{{ agentProgress.title }}</span><small v-if="agentProgress?.detail || agentProgress?.phase">{{ agentProgress?.detail || agentProgress?.phase }}</small><small v-else-if="musicAgentStore.runReason">{{ musicAgentStore.runReason }}</small></section><section v-if="failedMusicTasks.length" class="agentTaskFailures"><strong>任务失败</strong><p v-for="task in failedMusicTasks" :key="task.taskId">{{ task.targetType }}：{{ task.reason || "未返回失败原因" }}</p></section></template><template #timeline><details v-if="musicAgentStore.timeline.length" class="agentTimeline"><summary>执行轨迹 {{ musicAgentStore.timeline.length }} 项</summary><div v-for="item in musicAgentStore.timeline" :key="timelineKey(item)" class="timelineItem"><strong>{{ timelineLabel(item) }}</strong><span>{{ timelineDetail(item) }}</span></div></details></template><template #footer-prefix><t-popup trigger="click" placement="top-left"><t-button shape="square" variant="outline" size="small"><template #icon><i-setting-config size="16" /></template></t-button><template #content><div class="musicAgentMenu"><button type="button" @click="reconnectMusicAgent"><i-api size="14" />重连 Agent</button><button type="button" @click="clearMusicAgentMemory('message')"><i-delete size="14" />清除消息记忆</button><button type="button" @click="clearMusicAgentMemory('summary')"><i-close size="14" />清除摘要记忆</button><button type="button" class="danger" @click="clearMusicAgentMemory('all')"><i-delete-one size="14" />清除全部记忆</button></div></template></t-popup></template></AgentChatPanel></aside>
    </main>

    <t-dialog v-model:visible="libraryDialogVisible" header="新建音乐作品" :confirm-btn="{ content: '创建' }" @confirm="createLibraryWork"><t-form label-align="top"><t-form-item label="作品名称"><t-input v-model="libraryForm.title" /></t-form-item><t-form-item label="作品标识"><t-input v-model="libraryForm.workKey" placeholder="例如 main-theme" /></t-form-item><t-form-item label="类型"><t-select v-model="libraryForm.workType" :options="workTypeOptions" /></t-form-item><t-form-item label="叙事作用"><t-textarea v-model="libraryForm.narrativeRole" /></t-form-item></t-form></t-dialog>
    <t-dialog v-model:visible="editionDialogVisible" :header="editionForm.editionId ? '编辑编曲版本' : '新建编曲版本'" :confirm-btn="{ content: '保存' }" @confirm="saveEdition"><t-form label-align="top"><t-form-item label="名称"><t-input v-model="editionForm.title" /></t-form-item><t-form-item label="版本标识"><t-input v-model="editionForm.editionKey" /></t-form-item><t-form-item label="编曲类型"><t-select v-model="editionForm.editionType" :options="editionTypeOptions" /></t-form-item><t-form-item label="人声模式"><t-select v-model="editionForm.vocalMode" :options="vocalModeOptions" /></t-form-item><t-form-item label="叙事阶段"><t-input v-model="editionForm.narrativePhase" /></t-form-item></t-form></t-dialog>
    <section v-if="trimTarget" class="trimSetup"><t-input v-model="trimForm.title" placeholder="截取版本名称" /><t-input-number v-model="trimForm.fadeInMs" :min="0" :step="50" suffix="淡入毫秒" /><t-input-number v-model="trimForm.fadeOutMs" :min="0" :step="50" suffix="淡出毫秒" /><t-select v-model="trimForm.bindCueId" :options="cueOptions" clearable placeholder="可选：绑定用乐段落" /><t-checkbox v-model="trimForm.select">截取后选为当前版本</t-checkbox></section>
    <AudioClipDialog v-if="trimTarget" v-model:visible="trimDialogVisible" :src="audioUrl(trimTarget)" :name="trimTargetLabel" :default-clip-end="trimDefaultClipEnd" save-label="提交后端截取" server-trim @save="submitTrim" />
    <AudioClipDialog v-if="previewTarget" v-model:visible="previewDialogVisible" title="试听音频" :src="audioUrl(previewTarget)" :name="previewTargetLabel" mode="preview" />
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, resolveComponent, watch } from "vue";
import { DialogPlugin } from "tdesign-vue-next";
import { MdPreview } from "md-editor-v3";
import "md-editor-v3/lib/style.css";
import AgentChatPanel, { type AgentPanelMessage } from "@/components/AgentChatPanel.vue";
import AudioClipDialog from "@/components/AudioClipDialog.vue";
import modelSelect from "@/components/modelSelect.vue";
import projectStore from "@/stores/project";
import settingStore from "@/stores/setting";
import useTaskCenterStore, { createTaskKey, normalizeTaskStatus, type RuntimeTask } from "@/stores/taskCenter";
import { useMusicProductionAgentStore } from "@/stores/musicProductionAgent";
import { getPlayableMediaUrl } from "@/utils/mediaRef";
import axios from "@/utils/axios";
import {
  bindMusicCue, compileMusicCuePrompt, compileMusicLibraryPrompt, confirmMusicLyrics, createMusicLibraryItem, downloadMusicCandidate, generateMusicBible, generateMusicCueAudio, generateMusicLibraryAudio, generateMusicLyrics, generateMusicPlan, getMusicBibleDetail, getMusicLibraryDetail, getMusicPlanDetail, listMusicBibles, listMusicCuePrompts, listMusicCues, listMusicLibrary, listMusicLibraryPrompts, listMusicLyrics, listMusicPlans, reviewMusicBible, reviewMusicCuePrompt, reviewMusicLibraryPrompt, reviewMusicPlan, saveMusicCuePrompt, saveMusicLibraryEdition, saveMusicLibraryPrompt, saveMusicLyrics, selectMusicCueAsset, selectMusicLibraryVersion, trimMusicLibraryVersion,
  type MusicBible, type MusicCue, type MusicCueAsset, type MusicDownloadTargetType, type MusicLibraryEdition, type MusicLibraryItem, type MusicLibraryVersion, type MusicLyricsVersion, type MusicModelCapabilities, type MusicPlan, type MusicPlanMode, type MusicPromptMode, type MusicPromptVersion, type MusicTaskEnvelope, type MusicUsageMode,
} from "@/api/productionMusic";
import { listProductionReviews } from "@/api/productionReview";
import type { ProductionReviewSuggestion } from "@/types/productionReview";

type StepKey = "project" | "episode";
type ProjectTab = "direction" | "works";
type BibleCatalogItem = { id: string; text: string; level: number };
type MusicTaskScope = "bible" | "bibleReview" | "plan" | "planReview" | "episodePlan" | "lyrics" | "compile" | "promptReview" | "audio" | "trim";
const { project } = storeToRefs(projectStore());
const { baseUrl, themeSetting } = storeToRefs(settingStore());
const mdTheme = computed(() =>
  themeSetting.value.mode === "auto" ? undefined : themeSetting.value.mode
);
const taskCenter = useTaskCenterStore();
const musicAgentStore = useMusicProductionAgentStore();
const loading = ref(false);
const agentVisible = ref(true);
const activeStep = ref<StepKey>("project");
const projectTab = ref<ProjectTab>("direction");
const optionalVocalMode = ref<"instrumental" | "vocal">("instrumental");
const projectId = computed(() => Number(project.value?.id || 0));
const bibles = ref<MusicBible[]>([]); const selectedBibleId = ref<number>(); const selectedBible = ref<MusicBible | null>(null); const bibleReviews = ref<ProductionReviewSuggestion[]>([]);
const bibleCatalog = ref<BibleCatalogItem[]>([]); const activeBibleCatalogId = ref(""); const bibleContentRef = ref<HTMLElement>();
let bibleScrollContainer: HTMLElement | null = null;
const projectPlanMode = ref<Extract<MusicPlanMode, "concept" | "project">>("project"); const plans = ref<MusicPlan[]>([]); const selectedPlanId = ref<number>(); const selectedPlan = ref<MusicPlan | null>(null); const planReviews = ref<ProductionReviewSuggestion[]>([]);
const scriptOptions = ref<Array<{ label: string; value: number }>>([]); const selectedScriptId = ref<number>(); const selectedEpisodePlanId = ref<number>(); const cues = ref<MusicCue[]>([]); const selectedCueId = ref<number>();
const libraryItems = ref<MusicLibraryItem[]>([]); const selectedLibraryItemId = ref<number>(); const selectedLibraryItem = ref<MusicLibraryItem | null>(null); const selectedEditionId = ref<number>();
const musicModel = ref(""); const modelCapabilities = ref<MusicModelCapabilities>({}); const productionTarget = ref<"edition" | "cue">("edition"); const promptMode = ref<MusicPromptMode>("modelSpecific"); const promptVersions = ref<MusicPromptVersion[]>([]); const selectedPromptId = ref<number>(); const selectedPrompt = ref<MusicPromptVersion | null>(null); const promptDraft = ref(""); const promptDuration = ref<number>(); const effectiveDuration = ref<number>(); const promptBaseGenerationConfig = ref<Record<string, unknown>>({}); const promptBaseModel = ref<string | null>(null); const promptProfileSource = ref<string | null>(null); const promptBaseDuration = ref<number>(); const promptBaseEffectiveDuration = ref<number>(); const lyricsVersions = ref<MusicLyricsVersion[]>([]); const selectedLyricsId = ref<number>(); const selectedLyrics = ref<MusicLyricsVersion | null>(null); const lyricsDraft = ref(""); const promptReviews = ref<ProductionReviewSuggestion[]>([]); const acknowledgeWarnings = ref(false);
const cueBindingDraft = ref<Record<number, { editionId?: number; libraryVersionId?: number; duration?: number }>>({});
const directBusy = ref<Record<string, boolean>>({});
const taskOperations = ref<Record<string, string[]>>({});
const promptReviewSubmittingOwners = ref<string[]>([]);
const busy = computed<Record<string, boolean>>(() => ({
  ...directBusy.value,
  bible: isTaskBusy("bible", taskOwner("project", projectId.value)),
  bibleReview: isTaskBusy("bibleReview", taskOwner("bible", selectedBible.value?.id)),
  plan: isTaskBusy("plan", taskOwner("project", projectId.value)),
  planReview: isTaskBusy("planReview", taskOwner("plan", selectedPlan.value?.id)),
  episodePlan: isTaskBusy("episodePlan", taskOwner("script", selectedScriptId.value)),
  lyrics: isTaskBusy("lyrics", taskOwner("edition", selectedEdition.value?.id)),
  compile: isTaskBusy("compile", productionContextTaskOwner.value),
  promptReview: promptReviewPendingCount.value > 0,
  generate: isTaskBusy("audio", promptTaskOwner.value),
}));
const releases = new Map<string, () => void>();
const libraryDialogVisible = ref(false); const editionDialogVisible = ref(false); const libraryForm = ref({ title: "", workKey: "", workType: "score_theme" as any, narrativeRole: "" }); const editionForm = ref<any>({});
const trimTarget = ref<MusicLibraryVersion | null>(null); const trimDialogVisible = ref(false); const trimForm = ref({ title: "", fadeInMs: 300, fadeOutMs: 800, bindCueId: undefined as number | undefined, select: false });
const previewTarget = ref<MusicLibraryVersion | MusicCueAsset | null>(null); const previewDialogVisible = ref(false);
const candidateOutcome = ref<{ taskId: string; candidateCount: number; failedCount: number; failedSummary: string } | null>(null);
const handledCandidateTaskIds = new Set<string>();

const bibleOptions = computed(() => bibles.value.map((item) => ({ label: `${item.title || "配乐方向"} · v${item.version || item.id}`, value: item.id })));
const projectPlanOptions = computed(() => plans.value.filter((item) => item.mode !== "episode").map((item) => ({ label: `${item.mode === "concept" ? "概念" : "项目"} · v${item.version || item.id}`, value: item.id })));
const episodePlanOptions = computed(() => plans.value.filter((item) => item.mode === "episode" && Number(item.scriptId) === selectedScriptId.value).map((item) => ({ label: `本集用乐 · v${item.version || item.id}`, value: item.id })));
const selectedEpisodePlan = computed(() => plans.value.find((item) => item.id === selectedEpisodePlanId.value) || null);
const selectedCue = computed(() => cues.value.find((item) => item.id === selectedCueId.value) || null);
const selectedEdition = computed(() => selectedLibraryItem.value?.editions.find((item) => item.id === selectedEditionId.value) || null);
const editionOptions = computed(() => libraryItems.value.flatMap((item) => item.editions.map((edition) => ({ label: `${item.title || item.workKey} / ${edition.title || edition.editionKey}`, value: edition.id }))));
const cueOptions = computed(() => cues.value.map((cue) => ({ label: cue.title || cue.cueKey || `段落 ${cue.id}`, value: cue.id })));
const productionContext = computed(() => productionTarget.value === "edition" ? selectedEdition.value : selectedCue.value && selectedCue.value.usageMode !== "silence" ? selectedCue.value : null);
const productionTargetLabel = computed(() => productionTarget.value === "edition" ? selectedEdition.value ? `${selectedLibraryItem.value?.title || "作品"} / ${selectedEdition.value.title || selectedEdition.value.editionKey}` : "未选择编曲版本" : selectedCue.value ? selectedCue.value.title || selectedCue.value.cueKey || "用乐段落" : "未选择用乐段落");
const productionContextTaskOwner = computed(() => productionTarget.value === "edition" ? taskOwner("edition", selectedEdition.value?.id) : taskOwner("cue", selectedCue.value?.id));
const promptTaskOwner = computed(() => taskOwner("prompt", selectedPrompt.value?.id));
const promptReviewTaskCount = computed(() => taskOperationCount("promptReview", promptTaskOwner.value));
const promptReviewSubmittingCount = computed(() => promptTaskOwner.value ? promptReviewSubmittingOwners.value.filter((ownerKey) => ownerKey === promptTaskOwner.value).length : 0);
const promptReviewPendingCount = computed(() => promptReviewTaskCount.value + promptReviewSubmittingCount.value);
const productionVersions = computed<Array<MusicLibraryVersion | MusicCueAsset>>(() => productionTarget.value === "edition" ? selectedEdition.value?.versions || [] : selectedCue.value?.assets || []);
const productionVoiceMode = computed<"instrumental" | "vocal">(() => {
  if (productionTarget.value !== "edition") return "instrumental";
  const mode = selectedEdition.value?.vocalMode;
  return mode === "vocal" ? "vocal" : mode === "optional" ? optionalVocalMode.value : "instrumental";
});
const showLyricsEditor = computed(() => productionTarget.value === "edition" && productionVoiceMode.value === "vocal");
const activeConfirmedLyricsId = computed(() => showLyricsEditor.value && selectedLyrics.value?.state === "confirmed" ? selectedLyrics.value.id : null);
const promptVocalCompatible = computed(() => {
  if (!selectedPrompt.value || productionTarget.value !== "edition") return true;
  return productionVoiceMode.value === "vocal" ? Boolean(selectedPrompt.value.lyricsVersionId) : !selectedPrompt.value.lyricsVersionId;
});
const promptOptions = computed(() => promptVersions.value.map((item) => {
  const compatible = productionTarget.value !== "edition" || (productionVoiceMode.value === "vocal" ? Boolean(item.lyricsVersionId) : !item.lyricsVersionId);
  const source = item.lyricsVersionId ? `歌词 v${item.lyricsVersionId}` : "纯音乐";
  return { label: `v${item.version || item.id} · ${source} · ${item.reviewStatus || "unreviewed"}`, value: item.id, disabled: !compatible && item.id !== selectedPromptId.value };
}));
const lyricsOptions = computed(() => lyricsVersions.value.map((item) => ({ label: `v${item.version || item.id} · ${item.state || "draft"}`, value: item.id })));
const modelDurationMin = computed(() => Number(modelCapabilities.value.durationRange?.min || 1)); const modelDurationMax = computed(() => Number(modelCapabilities.value.durationRange?.max || 999));
const promptRequiresRecompile = computed(() => Boolean(promptMode.value === "modelSpecific" && (!selectedPrompt.value || selectedPrompt.value.promptMode !== "modelSpecific" || !promptProfileSource.value || promptBaseModel.value !== musicModel.value || selectedPrompt.value.profileSource !== promptProfileSource.value)));
const canCompilePrompt = computed(() => Boolean(promptMode.value === "modelSpecific" && musicModel.value && productionContext.value && (!showLyricsEditor.value || activeConfirmedLyricsId.value)));
const canSavePrompt = computed(() => Boolean(promptDraft.value.trim() && (!showLyricsEditor.value || activeConfirmedLyricsId.value) && (promptMode.value !== "modelSpecific" || (musicModel.value && !promptRequiresRecompile.value))));
const canGenerate = computed(() => Boolean(!promptRequiresRecompile.value && promptVocalCompatible.value && selectedPrompt.value?.promptMode === "modelSpecific" && selectedPrompt.value.model && selectedPrompt.value.profileSource && ["passed", "warning"].includes(String(selectedPrompt.value.reviewStatus)) && (selectedPrompt.value.reviewStatus !== "warning" || acknowledgeWarnings.value)));
const promptContextDescription = computed(() => productionTarget.value === "edition" ? productionVoiceMode.value === "vocal" ? `人声制作 · ${activeConfirmedLyricsId.value ? `已选歌词 v${selectedLyrics.value?.version || activeConfirmedLyricsId.value}` : "请先确认歌词"}` : "纯音乐制作 · 不会关联歌词版本" : "本段生成只使用当前 Cue 的精确 Prompt，不与项目作品候选混用。");
const generationDescription = computed(() => {
  const prompt = selectedPrompt.value ? `Prompt v${selectedPrompt.value.version || selectedPrompt.value.id}` : "未选择 Prompt";
  if (productionTarget.value === "cue") return `${prompt} · 建议使用 ${selectedCue.value?.binding?.suggestedUseDurationSec || selectedCue.value?.estimatedDurationSec || "-"} 秒`;
  return `${prompt} · ${productionVoiceMode.value === "vocal" ? `歌词 v${selectedPrompt.value?.lyricsVersionId || "-"}` : "纯音乐"} · 生成 ${promptDuration.value || "-"} 秒`;
});
const trimTargetLabel = computed(() => `版本 ${trimTarget.value?.version || trimTarget.value?.id || ""} 截取`);
const trimDefaultClipEnd = computed(() => {
  const versionDuration = Number(trimTarget.value?.effectiveMusicDurationSec || 0);
  if (Number.isFinite(versionDuration) && versionDuration > 0) return versionDuration;
  const cueDuration = Number(selectedCue.value?.binding?.suggestedUseDurationSec || selectedCue.value?.estimatedDurationSec || 0);
  return Number.isFinite(cueDuration) && cueDuration > 0 ? cueDuration : undefined;
});
const previewTargetLabel = computed(() => {
  const version = previewTarget.value;
  if (!version) return "";
  const title = productionTarget.value === "edition" ? selectedEdition.value?.title || "音乐版本" : selectedCue.value?.title || "用乐段落";
  return `${title} · v${version.version || version.id}`;
});

const musicAgentMode = computed(() => activeStep.value === "episode" && selectedScriptId.value ? "episode" as const : "project" as const);
const musicAgentScriptId = computed(() => musicAgentMode.value === "episode" ? selectedScriptId.value : undefined);
const musicAgentConnected = computed(() => Boolean(projectId.value) && musicAgentStore.connected);
const musicAgentLoading = computed(() => musicAgentStore.runRunning || musicAgentStore.submitting);
const musicAgentTitle = computed(() => "配乐导演 Agent");
const agentProgress = computed(() => {
  const payload = musicAgentStore.businessProgress?.payload || {};
  return musicAgentStore.businessProgress ? { title: String(payload.title || "正在处理"), detail: payload.detail ? String(payload.detail) : "", phase: payload.phase ? String(payload.phase) : "" } : null;
});
const agentStatusText = computed(() => musicAgentStore.runRunning ? "Agent 运行中" : lifecycleLabel(musicAgentStore.latestRun?.status));
const failedMusicTasks = computed(() => musicAgentStore.recentTasks.filter((task) => String(task.status) === "failed").slice(0, 3));
const agentMessages = computed<AgentPanelMessage[]>(() => {
  const messages = musicAgentStore.messages.map((message: any): AgentPanelMessage => ({ id: String(message.id), role: message.role === "user" ? "user" : "assistant", content: extractMessage(message), status: message.status === "error" ? "error" : ["pending", "streaming"].includes(message.status) ? "loading" : "complete" })).filter((message) => message.content);
  return messages.length ? messages : [{ id: "music-welcome", role: "assistant", content: "告诉我当前项目或这一集的配乐目标。我会在你确认后创建对应任务。", status: "complete" }];
});

const EmptyState = defineComponent({ props: { text: { type: String, required: true }, compact: Boolean }, setup(props) { return () => h("div", { class: ["emptyState", { compact: props.compact }] }, props.text); } });
const StatusTag = defineComponent({ props: { status: String }, setup(props) { return () => h(resolveComponent("t-tag") as any, { size: "small", variant: "light", theme: statusTheme(props.status) }, () => props.status || "未知"); } });
const ReviewList = defineComponent({
  props: { reviews: { type: Array as any, default: () => [] }, compact: Boolean },
  setup(props) {
    return () => {
      const reviews = (props.reviews as any[]).filter((item) => item.status === "open");
      if (!reviews.length) return null;
      return h(
        "div",
        { class: ["reviewList", { compact: props.compact }] },
        reviews.map((item) => {
          const fields = [
            ["问题", item.message],
            ["原因", item.reason],
            ["建议", item.proposedAction],
          ].filter(([, value]) => typeof value === "string" && value.trim());
          return h("div", { class: `reviewItem ${item.severity || "info"}` }, [
            h("strong", item.title || item.category || "审核建议"),
            ...fields.map(([label, value]) => h("p", [h("b", `${label}：`), String(value)])),
          ]);
        }),
      );
    };
  },
});

onMounted(async () => { await loadScripts(); await loadAll(); });
onBeforeUnmount(() => { bibleScrollContainer?.removeEventListener("scroll", syncActiveBibleHeading); releases.forEach((release) => release()); });
watch([projectId, selectedScriptId, activeStep], () => { if (projectId.value) void restoreMusicAgent({ refreshAssets: true, restoreHistory: true }); }, { immediate: true });
watch(productionTarget, () => void loadProductionData());
watch(() => musicAgentStore.refreshRevision, () => { if (projectId.value) void refreshRecoveredTargets(); });
watch(() => musicAgentStore.socketRecoveryRevision, () => {
  if (!projectId.value) return;
  void refreshMusicAssets().then(() => musicAgentStore.getHistory(musicAgentMode.value, projectId.value, musicAgentScriptId.value));
});

async function loadAll() { if (!projectId.value) return; loading.value = true; try { await restoreMusicAgent({ refreshAssets: true, restoreHistory: true }); } finally { loading.value = false; } }
function toggleAgent() { agentVisible.value = !agentVisible.value; if (agentVisible.value && projectId.value) void restoreMusicAgent({ refreshAssets: true, restoreHistory: true }); }
function openProjectDirection() { activeStep.value = "project"; projectTab.value = "direction"; productionTarget.value = "edition"; }
function openWorksWorkspace() { activeStep.value = "project"; projectTab.value = "works"; productionTarget.value = "edition"; if (selectedEdition.value) void loadProductionData(); }
function openEpisodeWorkspace() { activeStep.value = "episode"; if (selectedCue.value) { productionTarget.value = "cue"; void loadProductionData(); } }
async function restoreMusicAgent(options: { refreshAssets?: boolean; restoreHistory?: boolean } = {}) { if (!projectId.value) return; const mode = musicAgentMode.value; const scriptId = musicAgentScriptId.value; await musicAgentStore.recover(mode, projectId.value, scriptId); if (options.refreshAssets) await refreshMusicAssets(); await refreshRecoveredTargets(); if (options.restoreHistory) await musicAgentStore.getHistory(mode, projectId.value, scriptId); }
async function refreshMusicAssets() { await Promise.all([loadBibles(), loadPlans(), loadLibrary()]); if (selectedScriptId.value) await loadEpisodeData(); await loadProductionData(); }
async function refreshRecoveredTargets() { const targets = musicAgentStore.takeRefreshTargets(musicAgentMode.value, projectId.value, musicAgentScriptId.value); if (!targets.length) return; await refreshMusicTargets(targets); }
async function refreshMusicTargets(targets: string[]) { const targetSet = new Set(targets); const jobs: Promise<unknown>[] = []; if (targetSet.has("bible")) jobs.push(loadBibles()); if (targetSet.has("plan")) jobs.push(loadPlans()); if (targetSet.has("library")) jobs.push(loadLibrary()); if (targetSet.has("cues")) jobs.push(loadEpisodeData()); if (targetSet.has("lyrics") || targetSet.has("prompt") || targetSet.has("audio")) jobs.push(loadProductionData()); await Promise.all(jobs); }
async function loadScripts() { if (!projectId.value) return; const { data } = await axios.post("/script/getScrptApi", { projectId: projectId.value, name: "" }); scriptOptions.value = (Array.isArray(data) ? data : []).map((item: any) => ({ label: item.name, value: Number(item.id) })); if (!selectedScriptId.value) selectedScriptId.value = scriptOptions.value[0]?.value; }
async function loadBibles() { bibles.value = await listMusicBibles({ projectId: projectId.value, state: "complete" }); if (!bibles.value.some((item) => item.id === selectedBibleId.value)) selectedBibleId.value = bibles.value[0]?.id; await loadBibleDetail(); }
async function loadBibleDetail() { bibleCatalog.value = []; activeBibleCatalogId.value = ""; if (!selectedBibleId.value) { selectedBible.value = null; bibleReviews.value = []; return; } selectedBible.value = await getMusicBibleDetail({ projectId: projectId.value, bibleId: selectedBibleId.value }); bibleReviews.value = await listProductionReviews({ projectId: projectId.value, targetType: "musicBible", targetId: selectedBibleId.value }); }
async function loadPlans() { plans.value = await listMusicPlans({ projectId: projectId.value, state: "complete" }); if (!projectPlanOptions.value.some((item) => item.value === selectedPlanId.value)) selectedPlanId.value = projectPlanOptions.value[0]?.value; await loadPlanDetail(); }
async function loadPlanDetail() { if (!selectedPlanId.value) { selectedPlan.value = null; planReviews.value = []; return; } selectedPlan.value = await getMusicPlanDetail({ projectId: projectId.value, planId: selectedPlanId.value }); planReviews.value = await listProductionReviews({ projectId: projectId.value, targetType: "musicPlan", targetId: selectedPlanId.value }); }
async function loadEpisodeData() { if (!selectedScriptId.value) return; const episodePlans = await listMusicPlans({ projectId: projectId.value, scriptId: selectedScriptId.value, mode: "episode", state: "complete" }); plans.value = [...plans.value.filter((item) => item.mode !== "episode" || Number(item.scriptId) !== selectedScriptId.value), ...episodePlans]; if (!episodePlans.some((item) => item.id === selectedEpisodePlanId.value)) selectedEpisodePlanId.value = episodePlans[0]?.id; await loadCues(); }
async function loadCues() { if (!selectedEpisodePlanId.value) { cues.value = []; return; } directBusy.value.cues = true; try { cues.value = await listMusicCues({ projectId: projectId.value, scriptId: selectedScriptId.value, planId: selectedEpisodePlanId.value }); if (!cues.value.some((item) => item.id === selectedCueId.value)) selectedCueId.value = cues.value[0]?.id; cues.value.forEach(seedCueBinding); } finally { directBusy.value.cues = false; } }
async function loadLibrary() { libraryItems.value = await listMusicLibrary({ projectId: projectId.value }); if (!libraryItems.value.some((item) => item.id === selectedLibraryItemId.value)) selectedLibraryItemId.value = libraryItems.value[0]?.id; await loadSelectedLibraryItem(); }
async function loadSelectedLibraryItem() { if (!selectedLibraryItemId.value) { selectedLibraryItem.value = null; selectedEditionId.value = undefined; return; } selectedLibraryItem.value = await getMusicLibraryDetail({ projectId: projectId.value, libraryItemId: selectedLibraryItemId.value }); if (!selectedLibraryItem.value.editions.some((item) => item.id === selectedEditionId.value)) selectedEditionId.value = selectedLibraryItem.value.editions[0]?.id; }
async function loadProductionData() { if (!projectId.value || !productionContext.value) { promptVersions.value = []; lyricsVersions.value = []; selectedPrompt.value = null; return; } if (productionTarget.value === "edition" && selectedEdition.value) { lyricsVersions.value = await listMusicLyrics({ projectId: projectId.value, editionId: selectedEdition.value.id }); if (!lyricsVersions.value.some((item) => item.id === selectedLyricsId.value)) selectedLyricsId.value = lyricsVersions.value[0]?.id; await loadSelectedLyrics(); promptVersions.value = await listMusicLibraryPrompts({ projectId: projectId.value, editionId: selectedEdition.value.id }); } else if (selectedCue.value) { promptVersions.value = await listMusicCuePrompts({ projectId: projectId.value, cueId: selectedCue.value.id }); } if (!promptVersions.value.some((item) => item.id === selectedPromptId.value)) selectedPromptId.value = promptVersions.value[0]?.id; await loadSelectedPrompt(); }
async function loadSelectedPrompt() {
  selectedPrompt.value = promptVersions.value.find((item) => item.id === selectedPromptId.value) || null;
  promptDraft.value = selectedPrompt.value?.prompt || "";
  promptMode.value = selectedPrompt.value?.promptMode || "modelSpecific";
  if (promptMode.value === "modelSpecific" && selectedPrompt.value?.model) musicModel.value = selectedPrompt.value.model;
  if (promptMode.value === "generic") musicModel.value = "";
  const config = { ...(selectedPrompt.value?.generationConfig || {}) };
  promptBaseGenerationConfig.value = config;
  promptBaseModel.value = selectedPrompt.value?.model || null;
  promptProfileSource.value = selectedPrompt.value?.profileSource || null;
  promptDuration.value = configNumber(config.durationSec);
  effectiveDuration.value = configNumber(config.effectiveMusicDurationSec) ?? selectedCue.value?.binding?.suggestedUseDurationSec ?? selectedCue.value?.estimatedDurationSec ?? undefined;
  promptBaseDuration.value = promptDuration.value;
  promptBaseEffectiveDuration.value = effectiveDuration.value;
  acknowledgeWarnings.value = false;
  promptReviews.value = selectedPrompt.value ? await listProductionReviews({ projectId: projectId.value, targetType: "musicPrompt", targetId: selectedPrompt.value.id }) : [];
}
async function loadSelectedLyrics() { selectedLyrics.value = lyricsVersions.value.find((item) => item.id === selectedLyricsId.value) || null; lyricsDraft.value = selectedLyrics.value?.content || ""; }

function taskOwner(type: string, id?: number) { return id == null ? "" : `${type}:${id}`; }
function taskOperationKey(scope: MusicTaskScope, ownerKey: string) { return `${scope}:${ownerKey}`; }
function taskOperationCount(scope: MusicTaskScope, ownerKey: string) { return ownerKey ? taskOperations.value[taskOperationKey(scope, ownerKey)]?.length || 0 : 0; }
function isTaskBusy(scope: MusicTaskScope, ownerKey: string) { return taskOperationCount(scope, ownerKey) > 0; }
function beginPromptReviewSubmission(ownerKey: string) {
  if (!ownerKey || taskOperationCount("promptReview", ownerKey) || promptReviewSubmittingOwners.value.includes(ownerKey)) return false;
  promptReviewSubmittingOwners.value = [...promptReviewSubmittingOwners.value, ownerKey];
  return true;
}
function endPromptReviewSubmission(ownerKey: string) { promptReviewSubmittingOwners.value = promptReviewSubmittingOwners.value.filter((item) => item !== ownerKey); }
function addTaskOperation(scope: MusicTaskScope, ownerKey: string, taskId: string) {
  if (!ownerKey) return;
  const key = taskOperationKey(scope, ownerKey);
  const current = taskOperations.value[key] || [];
  if (!current.includes(taskId)) taskOperations.value[key] = [...current, taskId];
}
function removeTaskOperation(scope: MusicTaskScope, ownerKey: string, taskId: string) {
  if (!ownerKey) return;
  const key = taskOperationKey(scope, ownerKey);
  const remaining = (taskOperations.value[key] || []).filter((item) => item !== taskId);
  if (remaining.length) taskOperations.value[key] = remaining;
  else delete taskOperations.value[key];
}
function registerTask(envelope: MusicTaskEnvelope, scope: MusicTaskScope, ownerKey: string) {
  if (!envelope.taskId || !projectId.value) return;
  const key = createTaskKey("media", projectId.value, envelope.targetId ?? scope, undefined, envelope.taskId);
  const taskId = String(envelope.taskId);
  releases.get(key)?.();
  addTaskOperation(scope, ownerKey, taskId);
  const release = taskCenter.registerTask({ key, domain: "media", taskId: envelope.taskId, unifiedTaskId: envelope.taskId, legacyTaskId: envelope.legacyTaskId ?? undefined, targetType: envelope.targetType, targetId: envelope.targetId ?? scope, projectId: projectId.value, ...(musicAgentMode.value === "episode" && selectedScriptId.value ? { scriptId: selectedScriptId.value } : {}), status: normalizeTaskStatus(envelope.status, "queued") }, (runtimeTask) => handleTask(runtimeTask, scope, ownerKey, taskId, key));
  releases.set(key, release);
}
function handleTask(runtimeTask: RuntimeTask, scope: MusicTaskScope, ownerKey: string, taskId: string, taskKey: string) {
  if (!["completed", "failed", "cancelled"].includes(runtimeTask.status)) return;
  removeTaskOperation(scope, ownerKey, taskId);
  releases.get(taskKey)?.();
  releases.delete(taskKey);
  if (runtimeTask.status === "failed") window.$message.error(runtimeTask.reason || "配乐任务失败");
  void refreshAfterTask(scope).then(() => { if (runtimeTask.status === "completed" && scope === "audio") recordCandidateOutcome(runtimeTask); });
}
async function refreshAfterTask(scope: string) { await Promise.all([loadBibles(), loadPlans(), loadLibrary()]); if (scope.includes("episode")) await loadEpisodeData(); else if (scope.includes("cue") || scope.includes("audio") || scope.includes("trim")) await loadCues(); await loadProductionData(); }
async function submitBible() { const instruction = await askInstruction("本次配乐方向要求（可选）"); if (instruction === null) return; await runTask("bible", taskOwner("project", projectId.value), () => generateMusicBible({ projectId: projectId.value, instruction: instruction || undefined })); }
async function submitBibleReview() { if (!selectedBible.value) return; const bibleId = selectedBible.value.id; await runTask("bibleReview", taskOwner("bible", bibleId), () => reviewMusicBible({ projectId: projectId.value, bibleId })); }
async function submitProjectPlan() { if (!selectedBible.value) return; const bibleId = selectedBible.value.id; const instruction = await askInstruction("项目规划要求（可选）"); if (instruction === null) return; await runTask("plan", taskOwner("project", projectId.value), () => generateMusicPlan({ projectId: projectId.value, mode: projectPlanMode.value, bibleId, instruction: instruction || undefined })); }
async function submitPlanReview() { if (!selectedPlan.value) return; const planId = selectedPlan.value.id; await runTask("planReview", taskOwner("plan", planId), () => reviewMusicPlan({ projectId: projectId.value, planId })); }
async function submitEpisodePlan() { if (!selectedBible.value || !selectedScriptId.value) return; const bibleId = selectedBible.value.id; const scriptId = selectedScriptId.value; const instruction = await askInstruction("本集用乐要求（可选）"); if (instruction === null) return; await runTask("episodePlan", taskOwner("script", scriptId), () => generateMusicPlan({ projectId: projectId.value, mode: "episode", scriptId, bibleId, instruction: instruction || undefined })); }
async function submitLyricsGenerate() { if (!selectedEdition.value) return; const editionId = selectedEdition.value.id; await runTask("lyrics", taskOwner("edition", editionId), () => generateMusicLyrics({ projectId: projectId.value, editionId, basedOnId: selectedLyrics.value?.id })); }
async function submitCompilePrompt() { if (promptMode.value !== "modelSpecific") return window.$message.warning("通用 Prompt 请交给配乐导演 Agent 编译"); if (!canCompilePrompt.value) return window.$message.warning(showLyricsEditor.value ? "请先确认一版歌词" : "请先选择音乐模型"); const instruction = await askInstruction("本次 Prompt 编译要求（可选）"); if (instruction === null) return; if (productionTarget.value === "edition" && selectedEdition.value) { const editionId = selectedEdition.value.id; await runTask("compile", taskOwner("edition", editionId), () => compileMusicLibraryPrompt({ projectId: projectId.value, editionId, model: musicModel.value, instruction: instruction || undefined, requestedDurationSec: promptDuration.value, effectiveMusicDurationSec: effectiveDuration.value, lyricsVersionId: activeConfirmedLyricsId.value })); } else if (selectedCue.value) { const cueId = selectedCue.value.id; await runTask("compile", taskOwner("cue", cueId), () => compileMusicCuePrompt({ projectId: projectId.value, cueId, model: musicModel.value, instruction: instruction || undefined })); } }
async function submitPromptReview() {
  if (!selectedPrompt.value) return;
  const promptVersionId = selectedPrompt.value.id;
  const ownerKey = taskOwner("prompt", promptVersionId);
  if (!beginPromptReviewSubmission(ownerKey)) return;
  try {
    if (productionTarget.value === "edition" && selectedEdition.value) {
      const editionId = selectedEdition.value.id;
      await runTask("promptReview", ownerKey, () => reviewMusicLibraryPrompt({ projectId: projectId.value, editionId, promptVersionId }));
    } else if (selectedCue.value) {
      const cueId = selectedCue.value.id;
      await runTask("promptReview", ownerKey, () => reviewMusicCuePrompt({ projectId: projectId.value, cueId, promptVersionId }));
    }
  } finally {
    endPromptReviewSubmission(ownerKey);
  }
}
async function submitGenerate() { if (!selectedPrompt.value || !canGenerate.value) return; const prompt = selectedPrompt.value; const ownerKey = taskOwner("prompt", prompt.id); candidateOutcome.value = null; const warningsAcknowledged = prompt.reviewStatus === "warning" ? acknowledgeWarnings.value : undefined; if (productionTarget.value === "edition" && selectedEdition.value) { const editionId = selectedEdition.value.id; await runTask("audio", ownerKey, () => generateMusicLibraryAudio({ projectId: projectId.value, editionId, promptVersionId: prompt.id, lyricsVersionId: prompt.lyricsVersionId ?? null, acknowledgeWarnings: warningsAcknowledged })); } else if (selectedCue.value) { const cueId = selectedCue.value.id; await runTask("audio", ownerKey, () => generateMusicCueAudio({ projectId: projectId.value, cueId, promptVersionId: prompt.id, acknowledgeWarnings: warningsAcknowledged, select: false })); } }
async function saveLyricsDraft() { if (!selectedEdition.value || !lyricsDraft.value.trim()) return; const saved = await saveMusicLyrics({ projectId: projectId.value, editionId: selectedEdition.value.id, content: lyricsDraft.value, basedOnId: selectedLyrics.value?.id }); await loadProductionData(); selectedLyricsId.value = saved.id; await loadSelectedLyrics(); window.$message.success("已保存为新的歌词版本"); }
async function confirmSelectedLyrics() { if (!selectedEdition.value || !selectedLyrics.value) return; await confirmMusicLyrics({ projectId: projectId.value, editionId: selectedEdition.value.id, lyricsVersionId: selectedLyrics.value.id }); await loadProductionData(); window.$message.success("歌词已确认"); }
async function savePromptDraft() {
  if (!productionContext.value || !promptDraft.value.trim()) return;
  if (promptMode.value === "modelSpecific" && !musicModel.value) return window.$message.warning("请先选择精确音乐模型");
  if (promptMode.value === "modelSpecific" && promptRequiresRecompile.value) return window.$message.warning("模型或 Profile 已变更，请重新编译 Prompt");
  const model = promptMode.value === "modelSpecific" ? musicModel.value : null;
  const generationConfig = buildPromptGenerationConfig();
  try {
    const saved = productionTarget.value === "edition" && selectedEdition.value
      ? await saveMusicLibraryPrompt({ projectId: projectId.value, editionId: selectedEdition.value.id, promptMode: promptMode.value, model, profileSource: promptMode.value === "modelSpecific" ? promptProfileSource.value : null, prompt: promptDraft.value, generationConfig, lyricsVersionId: activeConfirmedLyricsId.value, basedOnId: selectedPrompt.value?.id })
      : selectedCue.value
        ? await saveMusicCuePrompt({ projectId: projectId.value, scriptId: selectedCue.value.scriptId, cueId: selectedCue.value.id, promptMode: promptMode.value, model, profileSource: promptMode.value === "modelSpecific" ? promptProfileSource.value : null, prompt: promptDraft.value, generationConfig, basedOnId: selectedPrompt.value?.id })
        : null;
    if (!saved) return;
    await loadProductionData();
    selectedPromptId.value = saved.id;
    await loadSelectedPrompt();
    window.$message.success("已保存为新的 Prompt 版本");
  } catch (error) {
    const missingKeys = getMissingPromptConfigKeys(error);
    if (missingKeys.length) {
      window.$message.error(`当前模型配置不完整（${missingKeys.join("、")}），请重新编译 Prompt`);
      return;
    }
    window.$message.error(error instanceof Error ? error.message : "保存 Prompt 失败");
  }
}
async function runTask(scope: MusicTaskScope, ownerKey: string, action: () => Promise<MusicTaskEnvelope>) { try { const envelope = await action(); registerTask(envelope, scope, ownerKey); window.$message.success("任务已提交"); } catch (error: any) { window.$message.error(error?.message || "任务提交失败"); } }

function selectCue(id: number) { selectedCueId.value = id; seedCueBinding(selectedCue.value!); activeStep.value = "episode"; productionTarget.value = "cue"; void loadProductionData(); }
function seedCueBinding(cue: MusicCue) { if (!cue) return; cueBindingDraft.value[cue.id] ||= { editionId: cue.binding?.editionId ?? cue.edition?.id ?? undefined, libraryVersionId: cue.binding?.libraryVersionId ?? cue.libraryVersion?.id ?? undefined, duration: cue.binding?.suggestedUseDurationSec ?? cue.estimatedDurationSec ?? undefined }; }
function updateCueUsage(cue: MusicCue, mode: MusicUsageMode) { cue.usageMode = mode; seedCueBinding(cue); if (mode === "silence") { cueBindingDraft.value[cue.id].editionId = undefined; cueBindingDraft.value[cue.id].libraryVersionId = undefined; } }
function handleCueUsageChange(cue: MusicCue, value: unknown) { updateCueUsage(cue, String(value) as MusicUsageMode); productionTarget.value = "cue"; void loadProductionData(); }
function resetCueVersion(cueId: number) { cueBindingDraft.value[cueId].libraryVersionId = undefined; }
async function saveCueBinding(cue: MusicCue) { const draft = cueBindingDraft.value[cue.id]; if (cue.usageMode !== "silence" && !draft.editionId) return window.$message.warning("复用或新做都需要选择编曲版本"); directBusy.value[`bind-${cue.id}`] = true; try { await bindMusicCue({ projectId: projectId.value, cueId: cue.id, usageMode: cue.usageMode || "new", editionId: cue.usageMode === "silence" ? null : draft.editionId, libraryVersionId: cue.usageMode === "silence" ? null : draft.libraryVersionId || null, suggestedUseDurationSec: draft.duration || null }); await loadCues(); window.$message.success("用乐安排已保存"); } finally { directBusy.value[`bind-${cue.id}`] = false; } }
function libraryVersionOptions(editionId?: number) { const edition = libraryItems.value.flatMap((item) => item.editions).find((item) => item.id === editionId); return (edition?.versions || []).filter((item) => item.state === "complete").map((item) => ({ label: `v${item.version || item.id}`, value: item.id })); }
async function selectLibraryItem(id: number) { selectedLibraryItemId.value = id; await loadSelectedLibraryItem(); productionTarget.value = "edition"; activeStep.value = "project"; projectTab.value = "works"; await loadProductionData(); }
async function selectEdition(id: number) { selectedEditionId.value = id; productionTarget.value = "edition"; activeStep.value = "project"; projectTab.value = "works"; await loadProductionData(); }
async function openEditionProduction(itemId: number, editionId: number) { selectedLibraryItemId.value = itemId; await loadSelectedLibraryItem(); await selectEdition(editionId); }
function openCueWorkspace(id: number) { selectCue(id); }
function openEditionDialog() { if (!selectedLibraryItem.value) return; editionForm.value = { libraryItemId: selectedLibraryItem.value.id, editionKey: "", editionType: "narrative_variant", title: "", narrativePhase: "", vocalMode: "instrumental" }; editionDialogVisible.value = true; }
async function createLibraryWork() { if (!libraryForm.value.workKey.trim()) libraryForm.value.workKey = slugify(libraryForm.value.title); if (!libraryForm.value.workKey.trim()) return window.$message.warning("请填写作品标识"); await createMusicLibraryItem({ projectId: projectId.value, bibleId: selectedBible.value?.id ?? null, ...libraryForm.value }); libraryDialogVisible.value = false; await loadLibrary(); }
async function saveEdition() { if (!editionForm.value.libraryItemId || !editionForm.value.editionKey) return window.$message.warning("请填写编曲版本标识"); await saveMusicLibraryEdition({ projectId: projectId.value, ...editionForm.value }); editionDialogVisible.value = false; await loadLibrary(); }
async function selectProductionVersion(version: MusicLibraryVersion | MusicCueAsset) { if (productionTarget.value === "edition" && selectedEdition.value) await selectMusicLibraryVersion({ projectId: projectId.value, editionId: selectedEdition.value.id, libraryVersionId: version.id }); else if (selectedCue.value) await selectMusicCueAsset({ projectId: projectId.value, cueId: selectedCue.value.id, musicCueAssetId: version.id }); await Promise.all([loadLibrary(), loadCues()]); window.$message.success("已选择当前版本"); }
function hasPlayableAudio(version: MusicLibraryVersion | MusicCueAsset) { return Boolean(audioUrl(version)); }
function downloadBusyKey(targetType: MusicDownloadTargetType, targetId: number) { return `download-${targetType}-${targetId}`; }
function candidateDownloadBaseName(targetType: MusicDownloadTargetType, version: MusicLibraryVersion | MusicCueAsset) { return `${targetType === "libraryVersion" ? "项目配乐" : "Cue配乐"}-v${version.version || version.id}`; }
async function downloadProductionVersion(targetType: MusicDownloadTargetType, version: MusicLibraryVersion | MusicCueAsset) {
  if (!projectId.value || version.state !== "complete" || !hasPlayableAudio(version)) return;
  const key = downloadBusyKey(targetType, version.id);
  if (directBusy.value[key]) return;
  directBusy.value[key] = true;
  try {
    const { blob, filename } = await downloadMusicCandidate({ projectId: projectId.value, targetType, targetId: version.id, baseUrl: baseUrl.value, fallbackBaseName: candidateDownloadBaseName(targetType, version) });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    window.$message.success("已开始下载");
  } catch (error) {
    window.$message.error(error instanceof Error ? error.message : "下载音频失败");
  } finally {
    directBusy.value[key] = false;
  }
}
function openPreview(version: MusicLibraryVersion | MusicCueAsset) { if (!hasPlayableAudio(version)) return window.$message.warning("当前版本暂无可试听音频"); previewTarget.value = version; previewDialogVisible.value = true; }
function openTrim(version: MusicLibraryVersion) { trimTarget.value = version; trimForm.value = { title: `${selectedEdition.value?.title || "音乐"}-${Math.round((version.effectiveMusicDurationSec || version.generationDurationSec || 0))}秒`, fadeInMs: 300, fadeOutMs: 800, bindCueId: selectedCue.value?.id, select: false }; trimDialogVisible.value = true; }
async function submitTrim(payload: { start: number; end: number }, controls: { done: (error?: unknown) => void }) { if (!trimTarget.value) return controls.done(); const sourceLibraryVersionId = trimTarget.value.id; try { const envelope = await trimMusicLibraryVersion({ projectId: projectId.value, sourceLibraryVersionId, startMs: Math.round(payload.start * 1000), endMs: Math.round(payload.end * 1000), fadeInMs: trimForm.value.fadeInMs, fadeOutMs: trimForm.value.fadeOutMs, title: trimForm.value.title || trimTargetLabel.value, bindCueId: trimForm.value.bindCueId ?? null, select: trimForm.value.select }); registerTask(envelope, "trim", taskOwner("libraryVersion", sourceLibraryVersionId)); trimDialogVisible.value = false; trimTarget.value = null; controls.done(); window.$message.success("截取任务已提交"); } catch (error) { controls.done(error); window.$message.error(error instanceof Error ? error.message : "截取任务提交失败"); } }
function recordCandidateOutcome(task: RuntimeTask) {
  const taskId = String(task.unifiedTaskId || task.taskId || task.key);
  if (handledCandidateTaskIds.has(taskId)) return;
  const result = task.result && typeof task.result === "object" ? task.result as Record<string, unknown> : {};
  const libraryVersionIds = Array.isArray(result.libraryVersionIds) ? result.libraryVersionIds : [];
  const musicCueAssetIds = Array.isArray(result.musicCueAssetIds) ? result.musicCueAssetIds : [];
  const declaredCount = Number(result.candidateCount);
  const candidateCount = Number.isFinite(declaredCount) && declaredCount >= 0
    ? declaredCount
    : Math.max(libraryVersionIds.length, musicCueAssetIds.length);
  const failedCandidates = Array.isArray(result.failedCandidates) ? result.failedCandidates : [];
  if (!candidateCount && !failedCandidates.length) return;
  handledCandidateTaskIds.add(taskId);
  const failedSummary = failedCandidates
    .map((candidate: any) => String(candidate?.error || candidate?.message || candidate || "候选保存失败"))
    .filter(Boolean)
    .slice(0, 2)
    .join("；");
  candidateOutcome.value = {
    taskId,
    candidateCount,
    failedCount: failedCandidates.length,
    failedSummary: failedSummary || "候选媒体未通过校验",
  };
}
function isSelectedVersion(version: MusicLibraryVersion | MusicCueAsset) { return productionTarget.value === "edition" ? selectedEdition.value?.selectedVersionId === version.id : Boolean((version as MusicCueAsset).selected); }
function audioUrl(version: any) { return getPlayableMediaUrl(version.audioAsset ?? version.media ?? version, "audio"); }
function versionKey(version: any) { return `${productionTarget.value}-${version.id}`; }
function handleModelChange(_value: string, data?: any) { modelCapabilities.value = data || {}; if (!selectedPrompt.value && !promptDuration.value && modelCapabilities.value.durationRange?.min) promptDuration.value = modelCapabilities.value.durationRange.min; }
function configNumber(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined; }
function sameOptionalNumber(left?: number, right?: number) { return left === right || (left == null && right == null); }
function applyConfigNumber(config: Record<string, unknown>, key: string, value: number | undefined, baseValue: number | undefined) { if (sameOptionalNumber(value, baseValue)) return; if (value == null) delete config[key]; else config[key] = value; }
function buildPromptGenerationConfig() { const canReuseBaseConfig = selectedPrompt.value?.promptMode === promptMode.value; const config = canReuseBaseConfig ? { ...promptBaseGenerationConfig.value } : {}; applyConfigNumber(config, "durationSec", promptDuration.value, promptBaseDuration.value); applyConfigNumber(config, "effectiveMusicDurationSec", effectiveDuration.value, promptBaseEffectiveDuration.value); return config; }
function getMissingPromptConfigKeys(error: unknown) { const source = error as any; const payload = source?.data ?? source?.response?.data ?? source; const data = payload?.data ?? payload; return data?.code === "MUSIC_PROMPT_CONFIG_INVALID" && Array.isArray(data.missingRequiredConfigKeys) ? data.missingRequiredConfigKeys.map((key: unknown) => String(key)).filter(Boolean) : []; }
async function sendAgentMessage(text: string) { if (!projectId.value) return; const sent = await musicAgentStore.send(musicAgentMode.value, projectId.value, text, musicAgentScriptId.value); if (!sent) window.$message.warning(musicAgentStore.runRunning ? "当前配乐导演任务仍在后台处理中" : musicAgentStore.runReason || "配乐导演暂时不可发送消息"); }
async function stopAgent() { if (projectId.value) await musicAgentStore.stop(musicAgentMode.value, projectId.value, musicAgentScriptId.value); }
type MusicMemoryType = "message" | "summary" | "all";
const musicMemoryTypeLabel: Record<MusicMemoryType, string> = { message: "消息记忆", summary: "摘要记忆", all: "全部记忆" };
function reconnectMusicAgent() { if (!projectId.value) return; musicAgentStore.reconnect(musicAgentMode.value, projectId.value, musicAgentScriptId.value); }
function clearMusicAgentMemory(type: MusicMemoryType) {
  if (!projectId.value) return;
  const label = musicMemoryTypeLabel[type];
  const dialog = DialogPlugin.confirm({
    header: "清除 Agent 记忆",
    body: `确定清除当前范围的${label}吗？该操作不可恢复。`,
    confirmBtn: "清除",
    cancelBtn: "取消",
    theme: "warning",
    onConfirm: async () => {
      try {
        await axios.post("/agents/clearMemory", {
          projectId: projectId.value,
          agentType: "musicProductionAgent",
          ...(musicAgentMode.value === "episode" && musicAgentScriptId.value ? { episodesId: musicAgentScriptId.value } : {}),
          type,
        });
        await musicAgentStore.getHistory(musicAgentMode.value, projectId.value, musicAgentScriptId.value);
        window.$message.success(`已清除${label}`);
        dialog.destroy();
      } catch (error) {
        window.$message.error(error instanceof Error ? error.message : `清除${label}失败`);
      }
    },
  });
}
function extractMessage(message: any) { if (typeof message?.content === "string") return message.content; return Array.isArray(message?.content) ? message.content.map((part: any) => part?.data?.text || part?.data || "").join("\n") : String(message?.text || message?.message || ""); }
function lifecycleLabel(status?: string) { if (status === "awaiting_user") return "等待用户决定"; if (status === "completed") return "本轮已完成"; if (status === "failed") return "本轮失败"; if (status === "cancelled") return "已取消"; if (status === "interrupted") return "已中断"; return ""; }
function timelineKey(item: any) { return String(item.id || `${item.kind}:${item.createdAt}:${item.stage}`); }
function timelineLabel(item: any) {
  const labels: Record<string, string> = {
    agent_progress: "业务进度",
    agent_output_archived: "过程输出已归档",
    runtime_restarted: "运行时已重启",
    active_scope_deduplicated: "历史运行已收口",
    client_detached: "客户端暂离",
    client_resumed: "客户端恢复",
    interrupted: "运行已中断",
    finished: "运行结束",
  };
  return labels[item.kind] || "运行事件";
}
function timelineDetail(item: any) { const payload = item.payload || {}; return String(payload.title || payload.summary || payload.detail || payload.reason || item.stage || item.subAgent || ""); }
async function askInstruction(title: string): Promise<string | null> {
  return new Promise((resolve) => {
    let value = "";
    let settled = false;
    let dialog: ReturnType<typeof DialogPlugin.confirm> | undefined;

    const finish = (instruction: string | null) => {
      if (settled) return;
      settled = true;
      dialog?.destroy();
      resolve(instruction);
    };

    dialog = DialogPlugin.confirm({
      header: title,
      body: () =>
        h(resolveComponent("t-textarea") as any, {
          placeholder: "可选",
          autosize: { minRows: 3, maxRows: 6 },
          onInput: (next: string) => (value = next),
        }),
      confirmBtn: "继续",
      cancelBtn: "取消",
      onConfirm: () => finish(value.trim()),
      onCancel: () => finish(null),
      onClose: () => finish(null),
    });
  });
}
function planItemLabel(value: any, index: number) { return value?.title || value?.workKey || value?.editionKey || `规划项 ${index + 1}`; }
function refText(value?: Record<string, unknown>) { return String(value?.description || value?.title || value?.label || "叙事节点"); }
function bibleHeadingId({ index }: { index: number }) { return `music-bible-${selectedBible.value?.id || "preview"}-${index}`; }
async function handleBibleCatalog(items: Array<{ text: string; level: number }>) { await nextTick(); bindBibleScrollContainer(); const headings = Array.from(bibleContentRef.value?.querySelectorAll<HTMLElement>(".musicMarkdown h1, .musicMarkdown h2, .musicMarkdown h3, .musicMarkdown h4, .musicMarkdown h5, .musicMarkdown h6") || []); bibleCatalog.value = items.map((item, index) => ({ id: headings[index]?.id || bibleHeadingId({ index }), text: item.text, level: item.level })); activeBibleCatalogId.value = bibleCatalog.value[0]?.id || ""; syncActiveBibleHeading(); }
function scrollToBibleHeading(id: string) { const heading = bibleContentRef.value?.querySelector<HTMLElement>(`#${CSS.escape(id)}`); if (!heading) return; activeBibleCatalogId.value = id; heading.scrollIntoView({ behavior: "smooth", block: "start" }); }
function bindBibleScrollContainer() { const next = bibleContentRef.value?.closest<HTMLElement>(".view") || null; if (next === bibleScrollContainer) return; bibleScrollContainer?.removeEventListener("scroll", syncActiveBibleHeading); bibleScrollContainer = next; bibleScrollContainer?.addEventListener("scroll", syncActiveBibleHeading, { passive: true }); }
function syncActiveBibleHeading() { if (!bibleCatalog.value.length) return; const current = bibleCatalog.value.map((item) => ({ item, heading: bibleContentRef.value?.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`) })).filter((entry): entry is { item: BibleCatalogItem; heading: HTMLElement } => Boolean(entry.heading)); if (!current.length) return; const threshold = 144; const active = [...current].reverse().find(({ heading }) => heading.getBoundingClientRect().top <= threshold) || current[0]; activeBibleCatalogId.value = active.item.id; }
function slugify(value: string) { return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function usageLabel(value?: string) { return value === "reuse" ? "复用" : value === "silence" ? "静音" : "新做"; }
function usageTheme(value?: string) { return value === "silence" ? "default" : value === "reuse" ? "success" : "primary"; }
function vocalModeLabel(value?: string) { return value === "vocal" ? "人声" : value === "optional" ? "可选人声" : "纯音乐"; }
function statusTheme(value?: string) { if (["failed", "blocked"].includes(String(value))) return "danger"; if (["warning", "generating", "processing", "queued"].includes(String(value))) return "warning"; if (["complete", "completed", "passed", "confirmed", "ready"].includes(String(value))) return "success"; return "default"; }
const workTypeOptions = [{ label: "主题曲", value: "theme_song" }, { label: "片头曲", value: "opening_song" }, { label: "片尾曲", value: "ending_song" }, { label: "插曲", value: "insert_song" }, { label: "配乐主题", value: "score_theme" }, { label: "源音乐", value: "source_music" }, { label: "短提示音乐", value: "stinger" }]; const editionTypeOptions = ["master", "narrative_variant", "arrangement", "vocal_variant", "instrumental", "short_edit", "custom"].map((value) => ({ label: value, value })); const vocalModeOptions = ["instrumental", "vocal", "optional"].map((value) => ({ label: value, value })); const workTypeLabel = (value?: string) => workTypeOptions.find((item) => item.value === value)?.label || value || "音乐作品";

</script>

<style lang="scss" scoped>
.productionMusicV2 { min-height: 100%; color: var(--td-text-color-primary); padding: 16px; background: var(--td-bg-color-page); }
.pageHeader,.sectionHeader,.panelHeader,.cueCard header,.inspectorHeader,.libraryInspector .inspectorTitle { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }.pageHeader { margin-bottom:14px; }.pageHeader h2,.sectionHeader h3,.panel h4 { margin:0; }.pageHeader p,.sectionHeader p,.panelHeader p,.libraryCard small,.cueMeta,.cueNarrative,.planSummary p,.libraryInspector p { margin:5px 0 0; color:var(--td-text-color-secondary); font-size:13px; line-height:1.55; }
.directorLayout { display:grid; grid-template-columns:minmax(0,1fr) 408px; align-items:start; gap:16px; min-height:calc(100vh - 160px); }.directorLayout.agentHidden { display:block; }.workspace { min-width:0; }.directorLayout:not(.agentHidden) .workspace { padding-right:0; }.agentSlot { position:sticky; top:12px; width:408px; height:calc(100vh - 224px); min-height:320px; max-height:calc(100vh - 224px); overflow:hidden; }.agentSlot :deep(.rightChatBox) { position:relative; top:auto; right:auto; bottom:auto; width:100% !important; min-width:0; height:100%; min-height:0; margin:0; overflow:hidden; }.agentSlot :deep(.rightChatBox .chatBox) { height:auto; min-height:0; flex:1 1 auto; padding-bottom:8px; }.agentSlot :deep(.rightChatBox .t-chat__list) { flex:1 1 0; min-height:0; height:0; overflow-y:auto; }.agentSlot :deep(.rightChatBox .inputBox) { flex:0 0 auto; margin-top:auto; }
.productionSteps { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1px; overflow:hidden; border:1px solid var(--td-border-level-1-color); background:var(--td-border-level-1-color); }.productionSteps button { border:0; background:var(--td-bg-color-container); min-height:74px; padding:12px 16px; text-align:left; display:grid; grid-template-columns:30px 1fr; gap:1px 10px; cursor:pointer; }.productionSteps button.active { background:var(--td-brand-color-light); }.productionSteps button span { grid-row:span 2; color:var(--td-brand-color); font-weight:700; }.productionSteps button strong { font-size:15px; }.productionSteps button small { color:var(--td-text-color-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.stepContent { display:flex; flex-direction:column; gap:14px; margin-top:14px; }.twoColumn,.productionGrid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }.panel { border:1px solid var(--td-border-level-1-color); background:var(--td-bg-color-container); padding:16px; }.panelHeader { margin-bottom:12px; }.panelHeader > div { min-width:0; }.readableDetail,.planSummary { margin-top:12px; }.readableDetail > p { white-space:pre-wrap; line-height:1.7; }.readableDetail dl { display:grid; grid-template-columns:130px 1fr; gap:7px 12px; margin:14px 0 0; font-size:13px; }.readableDetail dt { color:var(--td-text-color-secondary); }.readableDetail dd { margin:0; }.summaryChips { display:flex; flex-wrap:wrap; gap:6px; }.summaryChips span { padding:4px 8px; background:var(--td-bg-color-secondarycontainer); font-size:12px; }.emptyState { min-height:130px; display:grid; place-items:center; color:var(--td-text-color-secondary); text-align:center; padding:18px; border:1px dashed var(--td-border-level-1-color); margin-top:12px; }.emptyState.compact { min-height:72px; }.reviewList { margin-top:12px; display:grid; gap:7px; }.reviewItem { border-left:3px solid var(--td-brand-color); padding:8px 10px; background:var(--td-bg-color-secondarycontainer); display:grid; gap:3px; font-size:12px; }.reviewItem.blocking { border-color:var(--td-error-color); }.reviewItem.warning { border-color:var(--td-warning-color); }.reviewItem p { margin:0; color:var(--td-text-color-secondary); line-height:1.5; }.reviewItem p b { color:var(--td-text-color-primary); }
.libraryGrid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:10px; }.libraryCard { min-height:138px; display:flex; flex-direction:column; align-items:flex-start; text-align:left; border:1px solid var(--td-border-level-1-color); background:var(--td-bg-color-container); padding:12px; cursor:pointer; }.libraryCard:hover,.libraryCard.selected { border-color:var(--td-brand-color); background:var(--td-brand-color-light); }.libraryCard strong { margin:8px 0 4px; }.libraryCard em { margin-top:auto; font-style:normal; color:var(--td-text-color-secondary); font-size:12px; }.workType { font-size:12px; color:var(--td-brand-color); }.libraryInspector { margin-top:14px; border-top:1px solid var(--td-border-level-1-color); padding-top:14px; }.editionRow { width:100%; display:grid; grid-template-columns:1fr auto auto; align-items:center; gap:12px; padding:10px; margin-top:7px; border:1px solid var(--td-border-level-1-color); background:transparent; text-align:left; cursor:pointer; }.editionRow.selected { border-color:var(--td-brand-color); }.editionRow small,.editionRow em { color:var(--td-text-color-secondary); font-size:12px; font-style:normal; }
.episodeToolbar,.productionTarget,.inlineActions,.promptSettings,.cueMeta,.audioActions,.trimSetup { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }.episodeToolbar { padding:10px 12px; border:1px solid var(--td-border-level-1-color); background:var(--td-bg-color-container); }.episodeToolbar :deep(.t-select) { min-width:260px; }.cueList { display:grid; gap:10px; }.cueCard { border:1px solid var(--td-border-level-1-color); background:var(--td-bg-color-container); padding:14px; cursor:pointer; }.cueCard.selected { border-color:var(--td-brand-color); }.cueCard h4 { margin:4px 0 0; }.cueKey { color:var(--td-brand-color); font-size:12px; }.cueNarrative { display:flex; align-items:center; gap:6px; }.cueBinding { display:grid; grid-template-columns:150px minmax(180px,1fr) minmax(160px,1fr) 140px auto; gap:8px; align-items:center; margin-top:12px; padding-top:12px; border-top:1px solid var(--td-border-level-1-color); }.silenceHint { margin:0; color:var(--td-text-color-secondary); }
.productionTarget { padding:10px 12px; border:1px solid var(--td-border-level-1-color); background:var(--td-bg-color-container); }.productionTarget > span { color:var(--td-text-color-secondary); font-size:13px; }.modelSelect { width:220px; }.lyricsPanel,.promptPanel { min-width:0; }.lyricsPanel :deep(.t-textarea),.promptPanel :deep(.t-textarea) { margin-top:10px; }.promptSettings { margin-top:10px; color:var(--td-text-color-secondary); font-size:12px; }.promptHint { margin:10px 0 0; color:var(--td-text-color-secondary); font-size:12px; line-height:1.5; }.recommendedProduction,.candidateOutcome { display:grid; gap:3px; margin-top:12px; padding:10px; border-left:3px solid var(--td-brand-color); background:var(--td-bg-color-secondarycontainer); font-size:12px; }.recommendedProduction small,.candidateOutcome small { color:var(--td-text-color-secondary); }.warningText,.errorText { color:var(--td-error-color); font-size:12px; }.generationPanel { min-height:220px; }.versionList { display:grid; gap:8px; }.audioVersion { display:flex; align-items:center; justify-content:space-between; gap:12px; border:1px solid var(--td-border-level-1-color); padding:10px; }.audioVersion > div:first-child { display:grid; grid-template-columns:auto auto auto; align-items:center; gap:7px; }.audioVersion p,.audioVersion small { grid-column:1 / -1; margin:0; }.derivation { color:var(--td-brand-color); font-size:12px; }.audioActions { justify-content:flex-end; }.trimSetup { position:fixed; left:-9999px; opacity:0; pointer-events:none; }
.agentRunStatus,.agentTaskFailures,.agentTimeline { margin:0 8px 8px 0; padding:9px 10px; border-left:3px solid var(--td-border-level-1-color); background:var(--td-bg-color-secondarycontainer); display:grid; gap:3px; font-size:12px; }.agentRunStatus.running { border-color:var(--td-brand-color); }.agentRunStatus small,.agentTimeline span { color:var(--td-text-color-secondary); line-height:1.45; }.agentTaskFailures { border-color:var(--td-error-color); }.agentTaskFailures p { margin:0; color:var(--td-error-color); line-height:1.45; }.agentTimeline { display:block; }.agentTimeline summary { cursor:pointer; font-weight:600; }.timelineItem { display:grid; gap:2px; padding:7px 0; border-top:1px solid var(--td-border-level-1-color); }.timelineItem:first-of-type { margin-top:7px; }
.musicMarkdown { margin-top:10px; background:transparent; }.musicMarkdown :deep(.md-editor-preview-wrapper) { padding:0; background:transparent; }.musicMarkdown :deep(.md-editor-preview) { padding:0; color:var(--td-text-color-primary); font-size:14px; line-height:1.75; word-break:break-word; }.musicMarkdown :deep(h1),.musicMarkdown :deep(h2),.musicMarkdown :deep(h3),.musicMarkdown :deep(h4) { margin:18px 0 8px; color:var(--td-text-color-primary); line-height:1.35; }.musicMarkdown :deep(h1) { font-size:20px; }.musicMarkdown :deep(h2) { font-size:17px; }.musicMarkdown :deep(h3) { font-size:15px; }.musicMarkdown :deep(p) { margin:8px 0; }.musicMarkdown :deep(ul),.musicMarkdown :deep(ol) { margin:8px 0; padding-left:22px; }.musicMarkdown :deep(li + li) { margin-top:4px; }.musicMarkdown :deep(blockquote) { margin:10px 0; padding:7px 11px; border-left:3px solid var(--td-brand-color); background:var(--td-bg-color-secondarycontainer); color:var(--td-text-color-secondary); }.musicMarkdown :deep(code) { padding:1px 4px; border-radius:3px; background:var(--td-bg-color-secondarycontainer); }.musicMarkdown :deep(pre) { padding:10px; background:var(--td-bg-color-secondarycontainer); overflow:auto; }.episodePlanPreview { border:1px solid var(--td-border-level-1-color); background:var(--td-bg-color-container); padding:10px 12px; }.episodePlanPreview summary { cursor:pointer; color:var(--td-text-color-secondary); font-size:13px; }.episodePlanPreview[open] summary { margin-bottom:6px; color:var(--td-text-color-primary); }
.musicAgentMenu { display:grid; min-width:180px; padding:4px; gap:2px; }.musicAgentMenu button { display:flex; align-items:center; gap:7px; width:100%; border:0; padding:7px 8px; background:transparent; color:var(--td-text-color-primary); cursor:pointer; text-align:left; }.musicAgentMenu button:hover { background:var(--td-bg-color-container-hover); }.musicAgentMenu button.danger { color:var(--td-error-color); }
.taskProgressText { margin:0; padding:8px 10px; color:var(--td-text-color-secondary); font-size:12px; line-height:1.5; border-left:3px solid var(--td-brand-color); background:var(--td-bg-color-secondarycontainer); }
@media (max-width:1300px) { .directorLayout { display:block; }.directorLayout:not(.agentHidden) .workspace { padding-right:0; }.agentSlot { position:fixed; z-index:30; top:70px; bottom:16px; right:8px; width:400px; height:auto; min-height:0; max-height:none; }.twoColumn,.productionGrid { grid-template-columns:1fr; }.cueBinding { grid-template-columns:1fr 1fr; } }
@media (max-width:760px) { .productionMusicV2 { padding:10px; }.pageHeader { align-items:flex-start; flex-direction:column; }.productionSteps { grid-template-columns:1fr; }.agentSlot { left:8px; width:auto; }.cueBinding { grid-template-columns:1fr; }.audioVersion { align-items:flex-start; flex-direction:column; }.directorLayout:not(.agentHidden) .workspace { padding-bottom:0; } }
</style>

<style lang="scss" scoped>
.mainTabs,
.subTabs {
  display: flex;
  gap: 24px;
  border-bottom: 1px solid var(--td-border-level-1-color);
}

.mainTabs button,
.subTabs button {
  position: relative;
  border: 0;
  background: transparent;
  color: var(--td-text-color-secondary);
  cursor: pointer;
}

.mainTabs button::after,
.subTabs button::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  background: transparent;
  content: "";
}

.mainTabs button.active,
.subTabs button.active {
  color: var(--td-brand-color);
}

.mainTabs button.active::after,
.subTabs button.active::after {
  background: var(--td-brand-color);
}

.mainTabs button {
  display: grid;
  gap: 4px;
  min-width: 132px;
  padding: 12px 0 10px;
  text-align: left;
}

.mainTabs strong { font-size: 15px; }
.mainTabs small,
.subTabs span { color: var(--td-text-color-secondary); font-size: 12px; }
.subTabs { gap: 20px; }
.subTabs button { padding: 12px 2px 9px; font-size: 14px; }
.workspaceBody { display: flex; flex-direction: column; gap: 14px; }
.directionWorkspace { min-height: 0; }

.documentSurface,
.contextRail,
.contextComposer,
.bindingSurface {
  border: 1px solid var(--td-border-level-1-color);
  background: var(--td-bg-color-container);
}

.documentHeader,
.composerHeader,
.episodeHeader,
.contextRail > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.documentHeader,
.composerHeader,
.episodeHeader { padding: 16px; }
.documentHeader { border-bottom: 1px solid var(--td-border-level-1-color); }
.documentHeader h3,
.composerHeader h3,
.episodeHeader h3,
.contextRail h3,
.bindingSurface h4 { margin: 0; }
.documentHeader p,
.composerHeader p,
.episodeHeader p,
.contextRail small,
.bindingSurface p { margin: 5px 0 0; color: var(--td-text-color-secondary); font-size: 13px; line-height: 1.55; }
.documentHeader :deep(.t-select) { width: 160px; }
.documentReader { display: grid; grid-template-columns: 210px minmax(0, 1fr); min-height: 620px; }
.documentOutline { position: sticky; top: 88px; display: grid; align-content: start; gap: 4px; max-height: calc(100vh - 104px); padding: 16px 12px; border-right: 1px solid var(--td-border-level-1-color); overflow-y: auto; }
.documentOutline strong { padding: 0 8px 8px; font-size: 13px; }
.documentOutline button { border: 0; padding: 7px 8px; background: transparent; color: var(--td-text-color-secondary); cursor: pointer; text-align: left; }
.documentOutline button.active { border-left: 3px solid var(--td-brand-color); background: var(--td-brand-color); color: var(--td-text-color-anti); font-weight: 600; }
.catalogEmpty { margin: 0; padding: 7px 8px; color: var(--td-text-color-placeholder); font-size: 12px; }
.documentReader .readableDetail { min-width: 0; margin: 0; padding: 20px 28px calc(100vh - 104px); }
.documentReader .musicMarkdown :deep(h1),
.documentReader .musicMarkdown :deep(h2),
.documentReader .musicMarkdown :deep(h3),
.documentReader .musicMarkdown :deep(h4),
.documentReader .musicMarkdown :deep(h5),
.documentReader .musicMarkdown :deep(h6) { scroll-margin-top: 96px; }

.workbenchSplit { display: grid; grid-template-columns: 260px minmax(0, 1fr); align-items: start; gap: 14px; }
.contextRail { min-height: 480px; padding: 12px; }
.contextRail > header { padding: 2px 2px 12px; }
.planHint { display: grid; gap: 3px; margin: 0 0 10px; padding: 9px; border-left: 3px solid var(--td-brand-color); background: var(--td-bg-color-secondarycontainer); font-size: 12px; }
.railActions { display: flex; gap: 6px; margin-bottom: 10px; }
.libraryList { display: grid; gap: 8px; }
.libraryListItem { border: 1px solid var(--td-border-level-1-color); }
.libraryListItem.selected { border-color: var(--td-brand-color); }
.workSelect,
.editionSelect,
.cueSelect { width: 100%; border: 0; background: transparent; color: var(--td-text-color-primary); cursor: pointer; text-align: left; }
.workSelect { display: grid; gap: 4px; padding: 10px; }
.workSelect strong { font-size: 14px; }
.workSelect small { overflow: hidden; margin: 0; text-overflow: ellipsis; white-space: nowrap; }
.editionSelect { display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; padding: 8px 10px 8px 18px; border-top: 1px solid var(--td-border-level-1-color); font-size: 12px; }
.editionSelect small { grid-column: 1 / -1; margin: 0; }
.editionSelect.selected { background: var(--td-brand-color-light); color: var(--td-brand-color); }
.contextComposer { min-width: 0; }
.composerHeader { border-bottom: 1px solid var(--td-border-level-1-color); }
.modeChooser,
.cueModeChooser { display: flex; align-items: center; gap: 10px; margin: 14px 16px 0; }
.modeChooser > span { color: var(--td-text-color-secondary); font-size: 13px; }
.composerFlow { display: grid; grid-template-columns: 1fr; gap: 14px; padding: 16px; }
.editorStack { display: grid; gap: 14px; min-width: 0; }
.candidateRail { grid-template-columns: minmax(0, 1fr) minmax(300px, 360px); align-items: start; }
.candidateRail .candidatePanel { grid-column: 2; grid-row: 1; }
.candidateRail .versionList { max-height: 520px; overflow: auto; }
.candidateRail .audioVersion { align-items: flex-start; flex-direction: column; gap: 8px; }
.candidateRail .audioActions { justify-content: flex-start; width: 100%; }
.candidatePanel { min-width: 0; }
.candidatePanel .panelHeader { align-items: flex-start; }
.sourceTag { color: var(--td-brand-color); font-size: 12px; }
.bindingSurface { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; margin: 16px; padding: 14px; }
.bindingSurface h4,
.bindingSurface p { flex-basis: 100%; }
.bindingSurface :deep(.t-select) { min-width: 220px; flex: 1 1 220px; }
.cueWorkspace .contextComposer { min-height: 600px; }
.cueRail { display: grid; align-content: start; gap: 7px; }
.cueSelect { position: relative; display: grid; grid-template-columns: 1fr auto; gap: 3px 8px; padding: 11px; border: 1px solid var(--td-border-level-1-color); }
.cueSelect.selected { border-color: var(--td-brand-color); background: var(--td-brand-color-light); }
.cueSelect > span { color: var(--td-brand-color); font-size: 12px; }
.cueSelect strong { font-size: 13px; }
.cueSelect small { color: var(--td-text-color-secondary); }
.cueSelect :deep(.t-tag) { grid-row: span 2; }

@media (max-width: 1120px) {
  .workbenchSplit,
  .documentReader { grid-template-columns: 1fr; }
  .documentOutline { position: static; max-height: none; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); border-right: 0; border-bottom: 1px solid var(--td-border-level-1-color); overflow: visible; }
  .documentOutline strong { grid-column: 1 / -1; }
  .candidateRail { grid-template-columns: 1fr; }
  .candidateRail .candidatePanel { grid-column: auto; grid-row: auto; }
}

@media (max-width: 760px) {
  .mainTabs { gap: 18px; }
  .mainTabs button { min-width: 0; }
  .documentHeader,
  .composerHeader,
  .episodeHeader { flex-direction: column; }
  .documentHeader :deep(.t-space),
  .composerHeader :deep(.t-space) { flex-wrap: wrap; }
  .contextRail { min-height: auto; }
}
</style>
