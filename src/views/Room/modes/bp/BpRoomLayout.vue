<template>
  <template v-if="isPlayerRegion">
    <score-board class="spell-card-score-card" :size="30" label="得分" v-model="score" />
    <score-board class="spell-card-score-card" :size="30" label="等级" v-model="level" />
  </template>

  <game-bp v-else-if="region === 'extra' && context.isBpPhase" v-model="bpCodeModel" />

  <template v-else-if="region === 'player-actions'">
    <template v-if="context.inGame">
      <el-button
        type="primary"
        @click="context.confirmBp"
        :disabled="!context.isMyTurn || !context.bingoBpPhase || context.selectedSpellIndex < 0"
      >{{ actionText }}</el-button>
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
  </template>

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

  <el-button
    v-else-if="region === 'owner-actions' && context.isOwner"
    size="small"
    @click="context.nextRound"
    :disabled="!context.inGame || context.gameStore.bpGameData.ban_pick !== 2"
  >进入下轮</el-button>
</template>

<script lang="ts" setup>
import { computed } from "vue";
import { ElButton } from "element-plus";
import ScoreBoard from "@/components/score-board.vue";
import GameBp from "@/components/game-bp.vue";

const props = defineProps<{
  region: "left" | "right" | "extra" | "player-actions" | "secondary-actions" | "owner-actions";
  context: any;
}>();

const isPlayerRegion = computed(() => props.region === "left" || props.region === "right");
const playerIndex = computed<0 | 1>(() => props.region === "right" ? 1 : 0);
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
const actionText = computed(() => {
  if (!props.context.bingoBpPhase) return "等待房主操作";
  if (!props.context.isMyTurn) return props.context.gameStore.bpGameData.ban_pick ? "等待对手禁用符卡" : "等待对手选择符卡";
  return props.context.gameStore.bpGameData.ban_pick ? "禁用符卡" : "选择符卡";
});
</script>
