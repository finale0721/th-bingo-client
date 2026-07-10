<template>
  <template v-if="isPlayerRegion">
    <score-board
      class="change-card"
      :size="48"
      :manual="context.soloMode ? isPlayer : context.isHost"
      label="换卡次数"
      v-model="changeCardCount"
      @add="context.addChangeCardCount(playerIndex)"
      @minus="context.removeChangeCardCount(playerIndex)"
      :disabled="!context.inGame"
    />
    <score-board class="spell-card-score-card" :size="30" label="得分" v-model="score" />
    <score-board class="spell-card-score-card" :size="30" label="等级" v-model="level" />
  </template>

  <div v-else-if="region === 'extra' && context.currentBoardLevelTotal > 0" class="board-level-summary">
    <span>总等级{{ context.currentBoardLevelTotal }}</span>
    <span>剩余 {{ context.currentBoardRemainingLevel }}</span>
  </div>
  <game-bp v-else-if="region === 'extra' && context.isBpPhase" v-model="bpCodeModel" />

  <template v-else-if="region === 'player-actions'">
    <template v-if="context.inGame">
      <confirm-select-button
        v-if="!context.spellCardSelected"
        @click="context.confirmSelect"
        :disabled="context.selectedSpellIndex < 0 || context.gamePaused"
        :cooldown="context.selectCooldown"
        :immediate="context.gameStore.gameStatus === GameStatus.STARTED && !context.gameStore.spellCardGrabbedFlag"
        :paused="context.gamePaused"
        @finish="context.setCdTime"
        text="选择符卡"
      />
      <confirm-select-button
        v-else
        @click="context.confirmAttained"
        :disabled="context.gameStore.gameStatus !== GameStatus.STARTED"
        :cooldown="context.roomSettings.confirmDelay * 1000"
        :immediate="context.gameStore.alreadySelectCard"
        text="确认收取"
      />
    </template>
    <template v-if="context.isBpPhase">
      <el-button
        v-if="context.banPick.phase < 11"
        type="primary"
        :disabled="!(context.isPlayerA && context.playerACanBP) && !(context.isPlayerB && context.playerBCanBP)"
        @click="context.playerBanPick"
      >确定</el-button>
      <el-button v-if="context.banPick.phase === 11" type="primary" @click="context.confirmOpenEX(true)">开启</el-button>
      <el-button v-if="context.banPick.phase === 11" type="primary" @click="context.confirmOpenEX(false)">不开启</el-button>
    </template>
    <el-button
      v-if="!context.inGame && !context.isBpPhase"
      type="primary"
      @click="context.editorStore.openPresetManager('select')"
    >自定义游戏</el-button>
  </template>

  <template v-else-if="region === 'secondary-actions'">
    <el-button v-if="!context.soloMode && context.isHost" size="small" :disabled="context.inGame" @click="context.resetRoom">重置房间</el-button>
    <template v-if="context.soloMode && context.isPlayerA">
      <el-button v-if="!context.inGame" size="small" @click="context.resetRoom">重置房间</el-button>
      <el-button v-else size="small" @click="context.stopGame">结束比赛</el-button>
    </template>
  </template>

  <template v-else-if="region === 'owner-actions' && context.isOwner">
    <template v-if="!context.isBpPhase">
      <el-button v-if="context.gamePaused" size="small" :disabled="!context.inGame" @click="context.resumeGame">继续比赛</el-button>
      <el-button v-else size="small" :disabled="!context.inGame" @click="context.pauseGame">暂停比赛</el-button>
    </template>
    <el-button v-else size="small" :disabled="context.bpStatus !== 5" @click="context.startBP">重新BP</el-button>
  </template>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { GameStatus } from "@/types";
import { ElButton } from "element-plus";
import ScoreBoard from "@/components/score-board.vue";
import GameBp from "@/components/game-bp.vue";
import ConfirmSelectButton from "@/components/button-with-cooldown.vue";

const props = defineProps<{
  region: "left" | "right" | "extra" | "player-actions" | "secondary-actions" | "owner-actions";
  context: any;
}>();

const isPlayerRegion = computed(() => props.region === "left" || props.region === "right");
const playerIndex = computed<0 | 1>(() => props.region === "right" ? 1 : 0);
const isPlayer = computed(() => playerIndex.value === 0 ? props.context.isPlayerA : props.context.isPlayerB);
const changeCardCount = computed({
  get: () => props.context.roomData.change_card_count[playerIndex.value],
  set: (value) => props.context.setChangeCardCount(playerIndex.value, value),
});
const score = computed({
  get: () => playerIndex.value === 0 ? props.context.playerAScore : props.context.playerBScore,
  set: (value) => props.context.setPlayerScore(playerIndex.value, value),
});
const level = computed({
  get: () => playerIndex.value === 0 ? props.context.playerALevel : props.context.playerBLevel,
  set: (value) => props.context.setPlayerLevel(playerIndex.value, value),
});
const bpCodeModel = computed({
  get: () => props.context.bpCode,
  set: (value) => props.context.setBpCode(value),
});
</script>

<style lang="scss" scoped>
.board-level-summary {
  position: absolute;
  top: -30px;
  left: 50%;
  z-index: 120;
  display: flex;
  gap: 14px;
  align-items: center;
  transform: translateX(-50%);
  padding: 4px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.92);
  color: #303133;
  font-size: 13px;
  line-height: 18px;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  pointer-events: none;
}
</style>
