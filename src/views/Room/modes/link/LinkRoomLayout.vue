<template>
  <template v-if="isPlayerRegion">
    <score-board class="spell-card-score-card" :size="30" label="得分" v-model="score" />
    <score-board class="spell-card-score-card" :size="30" label="已收等级" v-model="level" />
    <score-board
      class="spell-card-score-card"
      :size="30"
      label="剩余跳过"
      :manual="canManage"
      :model-value="skipRemain"
      :min="0"
      :max="context.linkSkipLimit(route)"
      @add="context.setLinkSkipRemain(playerIndex, skipRemain + 1)"
      @minus="context.setLinkSkipRemain(playerIndex, skipRemain - 1)"
      :disabled="!context.inGame"
    />
    <div v-if="context.inGame" :class="['link-board-summary', `link-board-summary-${sideName}`]">
      <span>路线 {{ route.length }} / 等级分 {{ routeScore }}</span>
      <span v-if="routeFastest > 0">理论 {{ routeFastest }}s</span>
      <span>用时 {{ context.formatLinkDuration(effectiveUsedMs) }}</span>
      <span v-if="cdLeft > 0">CD {{ Math.ceil(cdLeft / 1000) }}s</span>
    </div>
    <div v-if="canManage && context.linkPhase === 2" class="link-manage-buttons">
      <el-button size="small" @click="context.forceLinkSkip(playerIndex)" :disabled="context.linkPlayerFinished(playerIndex) || cdLeft > 0">强制跳过</el-button>
      <el-button size="small" @click="context.undoLinkFinish(playerIndex)" :disabled="currentStep <= 0">撤销收取</el-button>
    </div>
    <div v-if="context.canTakeover && context.linkPhase === 1" class="link-manage-buttons" :key="`tk-ctrl-${playerIndex}-${context.takeoverUiKey}`">
      <el-button v-show="context.takeoverPlayerIndex !== playerIndex" size="small" @click="context.takeoverRoute(playerIndex)">接管路线</el-button>
      <el-button v-show="context.takeoverPlayerIndex === playerIndex" size="small" type="warning" @click="context.releaseTakeover">释放接管</el-button>
    </div>
    <div
      v-if="context.linkPhase === 1 && context.takeoverPlayerIndex === playerIndex && !context.isOwner"
      class="link-manage-buttons"
      :key="`tk-lock-${playerIndex}-${context.takeoverUiKey}`"
    ><span class="link-takeover-warning">路线已被接管</span></div>
    <div v-if="playerIndex === 1 && context.showLinkAiSpeedrun" class="link-manage-buttons">
      <el-button size="small" type="warning" @click="context.linkAiSpeedrun" :disabled="context.linkPlayerFinished(1)">速通</el-button>
    </div>
  </template>

  <template v-else-if="region === 'player-actions' && context.inGame">
    <el-button
      v-if="context.linkPhase === 1"
      type="primary"
      @click="context.confirmLinkRoute"
      :disabled="!context.linkRouteComplete"
    >{{ context.myLinkRouteConfirmed ? "取消确认" : "确认路线" }}</el-button>
    <confirm-select-button
      v-if="context.linkPhase === 2 && !context.myLinkFinished && !context.myLinkCurrentSelected"
      @click="context.linkNextCard"
      :cooldown="context.linkCooldown"
      :immediate="true"
      text="选择下一张"
    />
    <confirm-select-button
      v-if="context.linkPhase === 2 && !context.myLinkFinished && context.myLinkCurrentSelected"
      @click="context.linkFinishCard"
      :cooldown="context.roomSettings.confirmDelay * 1000"
      :immediate="true"
      text="确认收取"
    />
    <el-button
      v-if="context.linkPhase === 2 && !context.myLinkFinished"
      size="small"
      @click="context.linkSkipCard"
      :disabled="!context.canLinkSkip"
    >{{ context.linkSkipButtonText }}</el-button>
  </template>

  <el-button
    v-else-if="region === 'takeover-actions' && context.inGame && context.linkPhase === 1"
    type="primary"
    @click="context.confirmLinkRoute"
    :disabled="!context.linkRouteComplete"
    :key="`tk-confirm-${context.takeoverUiKey}`"
  >{{ context.myLinkRouteConfirmed ? "取消确认" : "确认路线" }}</el-button>

  <template v-else-if="region === 'secondary-actions'">
    <template v-if="!context.soloMode && context.isHost">
      <el-button v-if="!context.inGame" size="small" @click="context.resetRoom">重置房间</el-button>
      <el-button v-else-if="context.gamePaused" size="small" @click="context.resumeGame">继续比赛</el-button>
      <el-button v-else size="small" @click="context.pauseGame">暂停比赛</el-button>
    </template>
    <template v-if="context.soloMode && context.isPlayerA">
      <el-button v-if="!context.inGame" size="small" @click="context.resetRoom">重置房间</el-button>
      <el-button v-else size="small" @click="context.stopGame">结束比赛</el-button>
    </template>
  </template>

  <template v-else-if="region === 'owner-actions'">
    <el-button
      v-if="context.isOwner"
      size="small"
      @click="context.startLinkRun"
      :disabled="!context.inGame || context.linkPhase !== 1 || !context.bothLinkRoutesConfirmed || context.isTakeoverActive"
    >开始收卡</el-button>
    <el-button
      v-if="context.linkPhase === 1 && (context.isPlayer || (context.isTakeoverActive && context.isOwner))"
      type="primary"
      @click="context.linkUndo"
      :disabled="context.myLinkRouteConfirmed"
    >撤回路线</el-button>
  </template>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { ElButton } from "element-plus";
import ScoreBoard from "@/components/score-board.vue";
import ConfirmSelectButton from "@/components/button-with-cooldown.vue";

const props = defineProps<{
  region: "left" | "right" | "extra" | "player-actions" | "takeover-actions" | "secondary-actions" | "owner-actions";
  context: any;
}>();

const isPlayerRegion = computed(() => props.region === "left" || props.region === "right");
const playerIndex = computed<0 | 1>(() => props.region === "right" ? 1 : 0);
const sideName = computed(() => playerIndex.value === 0 ? "a" : "b");
const score = computed({
  get: () => playerIndex.value === 0 ? props.context.playerAScore : props.context.playerBScore,
  set: (value) => props.context.setPlayerScore(playerIndex.value, value),
});
const level = computed({
  get: () => playerIndex.value === 0 ? props.context.playerALevel : props.context.playerBLevel,
  set: (value) => props.context.setPlayerLevel(playerIndex.value, value),
});
const route = computed(() => playerIndex.value === 0 ? props.context.routeA : props.context.routeB);
const routeScore = computed(() => playerIndex.value === 0 ? props.context.linkRouteScoreA : props.context.linkRouteScoreB);
const routeFastest = computed(() => playerIndex.value === 0 ? props.context.linkRouteFastestA : props.context.linkRouteFastestB);
const effectiveUsedMs = computed(() => playerIndex.value === 0 ? props.context.linkEffectiveUsedMsA : props.context.linkEffectiveUsedMsB);
const cdLeft = computed(() => playerIndex.value === 0 ? props.context.linkCdLeftA : props.context.linkCdLeftB);
const skipRemain = computed(() => playerIndex.value === 0 ? props.context.linkSkipRemainA : props.context.linkSkipRemainB);
const canManage = computed(() => playerIndex.value === 0 ? props.context.canManageLinkA : props.context.canManageLinkB);
const currentStep = computed(() => playerIndex.value === 0 ? props.context.linkData.current_step_a : props.context.linkData.current_step_b);
</script>

<style lang="scss" scoped>
.link-board-summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  width: 126px;
  box-sizing: border-box;
  margin-top: 4px;
  padding: 5px 6px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.88);
  font-size: 12px;
  line-height: 1.35;
  text-align: center;
}

.link-board-summary span {
  white-space: normal;
}

.link-takeover-warning {
  color: #e6a23c;
  font-size: 12px;
}
</style>
