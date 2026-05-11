<template>
  <div class="room">
    <room-layout
      ref="layoutRef"
      v-model="selectedSpellIndex"
      :menu="menu"
      :multiple="isBingoBp || (isBingoStandard && gameStore.gameStatus === GameStatus.COUNT_DOWN)"
      :is-editor-mode="editorStore.isEditorMode"
      @editor-cell-click="handleEditorCellClick"
    >
      <template #left>
        <div
          :class="{ 'page-icon': playerASide === 0, 'page-icon-reverse': playerASide === 1 }"
          v-if="isDualBoard"
          @click="switchDualBoardSide"
        ></div>
        <score-board
          class="change-card"
          v-if="isBingoStandard"
          :size="48"
          :manual="soloMode ? isPlayerA : isHost"
          label="鎹㈠崱娆℃暟"
          v-model="roomData.change_card_count[0]"
          @add="addChangeCardCount(0)"
          @minus="removeChangeCardCount(0)"
          :disabled="!inGame"
        ></score-board>
        <score-board class="spell-card-score-card" :size="30" label="寰楀垎" v-model="playerAScore"></score-board>
        <score-board class="spell-card-score-card" :size="30" :label="isBingoLink ? '宸叉敹绛夌骇' : '绛夌骇'" v-model="playerALevel"></score-board>
        <score-board
          v-if="isBingoLink"
          class="spell-card-score-card"
          :size="30"
          label="鍓╀綑璺宠繃"
          :manual="canManageLinkA"
          :model-value="linkSkipRemainA"
          @add="setLinkSkipUsed(0, linkData.skip_used_a - 1)"
          @minus="setLinkSkipUsed(0, linkData.skip_used_a + 1)"
          :disabled="!inGame"
        ></score-board>
        <div v-if="isBingoLink && canManageLinkA && linkPhase === 2" class="link-manage-buttons">
          <el-button size="small" @click="forceLinkSkip(0)" :disabled="linkPlayerFinished(0)">寮哄埗璺宠繃</el-button>
          <el-button size="small" @click="undoLinkFinish(0)" :disabled="linkData.current_step_a <= 0">鎾ら攢鏀跺彇</el-button>
        </div>
        <el-button
          class="alert-button"
          type="primary"
          v-if="isHost"
          @click="warnPlayer(roomData.names[0])"
          :disabled="!inGame"
        >
          璀﹀憡
        </el-button>
        <el-button
          class="alert-button"
          type="primary"
          v-if="isHost && isDualBoard"
          @click="hostSwitchPlayerSide(0)"
          :disabled="!inGame"
        >
          鎹㈤潰
        </el-button>
      </template>

      <template #right>
        <div
          :class="{ 'page-icon': playerBSide === 0, 'page-icon-reverse': playerBSide === 1 }"
          v-if="isDualBoard"
          @click="switchDualBoardSide"
        ></div>
        <score-board
          class="change-card"
          v-if="isBingoStandard"
          :size="48"
          :manual="soloMode ? isPlayerB : isHost"
          label="鎹㈠崱娆℃暟"
          v-model="roomData.change_card_count[1]"
          @add="addChangeCardCount(1)"
          @minus="removeChangeCardCount(1)"
          :disabled="!inGame"
        ></score-board>
        <score-board class="spell-card-score-card" :size="30" label="寰楀垎" v-model="playerBScore"></score-board>
        <score-board class="spell-card-score-card" :size="30" :label="isBingoLink ? '宸叉敹绛夌骇' : '绛夌骇'" v-model="playerBLevel"></score-board>
        <score-board
          v-if="isBingoLink"
          class="spell-card-score-card"
          :size="30"
          label="鍓╀綑璺宠繃"
          :manual="canManageLinkB"
          :model-value="linkSkipRemainB"
          @add="setLinkSkipUsed(1, linkData.skip_used_b - 1)"
          @minus="setLinkSkipUsed(1, linkData.skip_used_b + 1)"
          :disabled="!inGame"
        ></score-board>
        <div v-if="isBingoLink && canManageLinkB && linkPhase === 2" class="link-manage-buttons">
          <el-button size="small" @click="forceLinkSkip(1)" :disabled="linkPlayerFinished(1)">寮哄埗璺宠繃</el-button>
          <el-button size="small" @click="undoLinkFinish(1)" :disabled="linkData.current_step_b <= 0">鎾ら攢鏀跺彇</el-button>
        </div>
        <el-button
          class="alert-button"
          type="primary"
          v-if="isHost"
          @click="warnPlayer(roomData.names[1])"
          :disabled="!inGame"
        >
          璀﹀憡
        </el-button>
        <el-button
          class="alert-button"
          type="primary"
          v-if="isHost && isDualBoard"
          @click="hostSwitchPlayerSide(1)"
          :disabled="!inGame"
        >
          鎹㈤潰
        </el-button>
      </template>

      <template #extra>
        <div v-if="isBingoLink && inGame" class="link-board-summary">
          <span>A 路线 {{ routeA.length }} / 等级分 {{ linkRouteScoreA }}<template v-if="linkRouteFastestA > 0"> / 理论 {{ linkRouteFastestA }}s</template></span>
          <span>B 路线 {{ routeB.length }} / 等级分 {{ linkRouteScoreB }}<template v-if="linkRouteFastestB > 0"> / 理论 {{ linkRouteFastestB }}s</template></span>
        </div>
        <div v-if="isBingoStandard && currentBoardLevelTotal > 0" class="board-level-summary">
          <span>鎬荤瓑绾?{{ currentBoardLevelTotal }}</span>
          <span>鍓╀綑 {{ currentBoardRemainingLevel }}</span>
        </div>
        <game-bp v-if="isBpPhase" v-model="bpCode"></game-bp>
        <div
          :class="{ page: gameStore.currentBoard === 0, 'page-reverse': gameStore.currentBoard === 1 }"
          v-if="isDualBoard"
        ></div>
      </template>

      <template #widget>
        <count-down
          ref="countdownRef"
          :size="30"
          @complete="onCountDownComplete"
          v-show="
            (isBingoStandard && inGame) ||
            (isBingoBp && gameStore.gameStatus === GameStatus.COUNT_DOWN) ||
            (isBingoLink && inGame && linkPhase === 1)
          "
        ></count-down>
      </template>

      <template #button-center>
        <div v-if="gameStore.isReplayMode" class="replay-controls">
          <!-- 璋冮€?-->
          <el-slider
            v-model="replaySpeed"
            :marks="speedMarks"
            :step="1"
            :min="1"
            :max="8"
            style="width: 144px; margin: 0 15px"
            @change="changeReplaySpeed"
          />
          <el-button
            :icon="ArrowLeft"
            @click="jumpToPreviousReplayAction"
            :disabled="replayInstance.state.currentTime <= 0"
            circle
          />

          <!-- 鍥炴斁鎺у埗鎸夐挳 -->
          <el-button
            :icon="replayInstance.state.isPlaying ? VideoPause : VideoPlay"
            @click="toggleReplay"
            :disabled="replayInstance.state.isReplayFinished"
            circle
          />
          <el-button
            :icon="ArrowRight"
            @click="jumpToNextReplayAction"
            :disabled="replayInstance.state.currentTime <= 0"
            circle
          />
          <!-- 鏃堕棿杞存粦鍧?-->
          <el-slider
            v-if="replayInstance.state.totalTime > 0"
            v-model="replayInstance.state.currentTime"
            :max="replayInstance.state.totalTime"
            :format-tooltip="formatReplayTime"
            @change="handleTimelineChange"
            style="width: 144px; margin: 0 15px"
          />

          <div class="replay-time">
            {{ formatReplayTime(replayInstance.state.currentTime) }} /
            {{ formatReplayTime(replayInstance.state.totalTime) }}
          </div>

          <el-button type="primary" @click="confirmExitReplay" style="margin-left: 15px"> 閫€鍑哄洖鏀?</el-button>
        </div>

        <template v-else-if="!editorStore.isEditorMode">
          <template v-if="!soloMode && isHost">
            <el-button type="primary" v-if="!inGame && !isBpPhase" @click="editorStore.openPresetManager('select')">
              自定义游戏
            </el-button>
            <el-button type="primary" v-if="!inGame && !isBpPhase" @click="startGame">开始比赛</el-button>
            <el-button type="primary" v-if="isBpPhase" @click="drawSpellCard" :disabled="banPick.phase < 99">
              抽取符卡
            </el-button>
            <el-button type="primary" v-if="inGame && winFlag === 0 && !isBingoLink" @click="stopGame">缁撴潫姣旇禌</el-button>
            <el-button type="primary" v-if="winFlag !== 0" @click="confirmWinner">
              纭锛歿{ winFlag < 0 ? roomData.names[0] : roomData.names[1] }}鑾疯儨
            </el-button>
          </template>

          <template v-if="soloMode && isPlayerA">
            <el-button type="primary" v-if="!inGame && !isBpPhase" @click="startGame">开始比赛</el-button>
            <el-button type="primary" v-if="banPick.phase === 9999" @click="drawSpellCard">鎶藉彇绗﹀崱</el-button>
            <el-button type="primary" v-if="isBingoLink && winFlag !== 0" @click="confirmWinner">
              纭锛歿{ winFlag < 0 ? roomData.names[0] : roomData.names[1] }}鑾疯儨
            </el-button>
          </template>

          <template v-if="isPlayer">
            <template v-if="inGame">
              <template v-if="isBingoStandard">
                <confirm-select-button
                  @click="confirmSelect"
                  :disabled="selectedSpellIndex < 0 || gamePaused"
                  v-if="!spellCardSelected"
                  :cooldown="selectCooldown"
                  :immediate="gameStore.gameStatus === GameStatus.STARTED && !gameStore.spellCardGrabbedFlag"
                  :paused="gamePaused"
                  @finish="setCdTime"
                  text="閫夋嫨绗﹀崱"
                ></confirm-select-button>
                <confirm-select-button
                  @click="confirmAttained"
                  v-if="spellCardSelected"
                  :disabled="gameStore.gameStatus !== GameStatus.STARTED"
                  :cooldown="roomSettings.confirmDelay * 1000"
                  :immediate="gameStore.alreadySelectCard"
                  text="纭鏀跺彇"
                ></confirm-select-button>
              </template>
              <template v-if="isBingoBp">
                <el-button
                  type="primary"
                  @click="confirmBp"
                  :disabled="!isMyTurn || !bingoBpPhase || selectedSpellIndex < 0"
                  v-if="!gameStore.bpGameData.ban_pick"
                  >{{ bingoBpPhase ? (isMyTurn ? "閫夋嫨绗﹀崱" : "绛夊緟瀵规墜閫夋嫨绗﹀崱") : "绛夊緟鎴夸富鎿嶄綔" }}</el-button
                >
                <el-button
                  type="primary"
                  @click="confirmBp"
                  v-if="gameStore.bpGameData.ban_pick"
                  :disabled="!isMyTurn || !bingoBpPhase || selectedSpellIndex < 0"
                  >{{ bingoBpPhase ? (isMyTurn ? "绂佺敤绗﹀崱" : "绛夊緟瀵规墜绂佺敤绗﹀崱") : "绛夊緟鎴夸富鎿嶄綔" }}</el-button
                >
              </template>
              <template v-if="isBingoLink">
                <el-button
                  type="primary"
                  @click="confirmLinkRoute"
                  :disabled="!linkRouteComplete"
                  v-if="linkPhase === 1"
                  >{{ myLinkRouteConfirmed ? "鍙栨秷纭" : "纭璺嚎" }}</el-button
                >
                <confirm-select-button
                  v-if="linkPhase === 2 && !myLinkFinished && !myLinkCurrentSelected"
                  @click="linkNextCard"
                  :cooldown="linkCooldown"
                  :immediate="true"
                  text="选择下一张"
                ></confirm-select-button>
                <confirm-select-button
                  v-if="linkPhase === 2 && !myLinkFinished && myLinkCurrentSelected"
                  @click="linkFinishCard"
                  :cooldown="roomSettings.confirmDelay * 1000"
                  :immediate="true"
                  text="纭鏀跺彇"
                ></confirm-select-button>
                <el-button
                  v-if="linkPhase === 2 && !myLinkFinished"
                  size="small"
                  @click="linkSkipCard"
                  :disabled="!canLinkSkip"
                  >璺宠繃</el-button
                >
              </template>
            </template>

            <template v-if="isBpPhase">
              <el-button
                type="primary"
                v-if="banPick.phase < 11"
                :disabled="!(isPlayerA && playerACanBP) && !(isPlayerB && playerBCanBP)"
                @click="playerBanPick"
                >纭畾</el-button
              >
              <el-button type="primary" v-if="banPick.phase === 11" @click="confirmOpenEX(true)">开启</el-button>
              <el-button type="primary" v-if="banPick.phase === 11" @click="confirmOpenEX(false)">不开启</el-button>
            </template>

            <el-button type="primary" v-if="!inGame && !isBpPhase" @click="editorStore.openPresetManager('select')">
              鑷畾涔夋父鎴?
            </el-button>
          </template>

          <!-- <template v-if="isBingoLink">
          <el-button type="primary" v-if="!inGame">寮€濮嬫瘮璧?/el-button>
          <el-button type="primary" v-else>缁撴潫姣旇禌</el-button>
          </template> -->
        </template>

        <template v-else>
          <div>
            <el-button type="primary" @click="editorStore.toggleDatabasePanel">
              {{ editorStore.isDatabasePanelVisible ? "关闭数据库" : "打开数据库" }}
            </el-button>
            <el-button type="primary" @click="editorStore.isPresetManagerVisible = true"> 棰勮绠＄悊 </el-button>
          </div>
        </template>
      </template>

      <template #button-left-1>
        <div v-if="!gameStore.isReplayMode && !editorStore.isEditorMode">
          <template v-if="!soloMode && isHost">
            <template v-if="isBingoStandard || !inGame">
              <el-button size="small" :disabled="inGame" @click="resetRoom">閲嶇疆鎴块棿</el-button>
            </template>
            <template v-else>
              <el-button size="small" :disabled="!inGame" v-if="gamePaused" @click="resumeGame"> 缁х画姣旇禌 </el-button>
              <el-button size="small" :disabled="!inGame" v-else @click="pauseGame">鏆傚仠姣旇禌</el-button>
            </template>
          </template>
          <template v-if="soloMode && isPlayerA">
            <el-button v-if="isPlayerA && !inGame" size="small" @click="resetRoom">閲嶇疆鎴块棿</el-button>
            <el-button v-if="isPlayerA && inGame" size="small" @click="stopGame">缁撴潫姣旇禌</el-button>
          </template>
        </div>
        <div v-else-if="editorStore.isEditorMode">
          <el-button type="danger" size="small" @click="handleClearAll"> 娓呯┖鏍煎瓙 </el-button>
          <el-button type="warning" size="small" @click="handleShuffleSpells"> 娲楁贩鏍煎瓙 </el-button>
        </div>
      </template>

      <template #button-right-1>
        <div v-if="!gameStore.isReplayMode && !editorStore.isEditorMode">
          <template v-if="isOwner">
            <template v-if="isBingoStandard">
              <template v-if="!isBpPhase">
                <el-button size="small" :disabled="!inGame" v-if="gamePaused" @click="resumeGame"> 缁х画姣旇禌 </el-button>
                <el-button size="small" :disabled="!inGame" v-else @click="pauseGame">鏆傚仠姣旇禌</el-button>
              </template>
              <el-button :disabled="bpStatus !== 5" size="small" v-else @click="startBP">閲嶆柊BP</el-button>
            </template>
            <template v-if="isBingoBp">
              <el-button size="small" @click="nextRound" :disabled="!inGame || gameStore.bpGameData.ban_pick !== 2"
                >杩涘叆涓嬭疆</el-button
              >
            </template>
            <template v-if="isBingoLink">
              <el-button
                size="small"
                @click="startLinkRun"
                :disabled="!inGame || linkPhase !== 1 || !bothLinkRoutesConfirmed"
                >开始收卡</el-button
              >
            </template>
          </template>
        </div>
      </template>

      <template #button-right-2>
        <template v-if="isBingoLink && linkPhase === 1 && isPlayer">
          <el-button type="primary" @click="linkUndo" :disabled="myLinkRouteConfirmed">鎾ゅ洖璺嚎</el-button>
        </template>
        <template v-if="isDualBoard && roomStore.roomConfig.type == BingoType.STANDARD">
          <el-button type="primary" @click="switchDualBoardSide">
            {{ boardNotDecided() ? "切换盘面" : isOnCurrentBoard() ? "查看另一面" : "返回当前面" }}
          </el-button>
        </template>
      </template>
    </room-layout>

    <spell-editor-modal
      v-if="editorStore.isEditorModalVisible && editorStore.selectedSpellIndex !== -1"
      :spell="selectedSpellData.spell"
      :status="selectedSpellData.status"
      :is-portal="selectedSpellData.isPortal"
      @confirm="handleEditorConfirm"
      @clear="handleEditorClear"
      @close="editorStore.closeModal()"
    />
    <spell-database-panel v-if="editorStore.isEditorMode" />
    <preset-manager />
  </div>
</template>

<script lang="ts" setup>
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { BingoType, BpStatus, GameStatus, SpellStatus } from "@/types";
import RoomLayout from "./components/roomLayout.vue";
import ScoreBoard from "@/components/score-board.vue";
import CountDown from "@/components/count-down.vue";
import GameBp from "@/components/game-bp.vue";
import ConfirmSelectButton from "@/components/button-with-cooldown.vue";
import { ElButton, ElMessage, ElMessageBox, ElRadio, ElRadioGroup, ElSlider } from "element-plus";
import ws from "@/utils/webSocket/WebSocketBingo";
import { useRoomStore } from "@/store/RoomStore";
import { useGameStore } from "@/store/GameStore";
import { WebSocketActionType, WebSocketPushActionType } from "@/utils/webSocket/types";
import { VideoPlay, VideoPause, ArrowLeft, ArrowRight } from "@element-plus/icons-vue";
import Replay from "@/utils/Replay";
import { useEditorStore } from "@/store/EditorStore";
import SpellEditorModal from "@/components/SpellEditorModal.vue";
import SpellDatabasePanel from "@/components/SpellDatabasePanel.vue";
import PresetManager from "@/components/PresetManager.vue";
import { BoardSpec } from "@/utils/board";
import Config from "@/config";

const roomStore = useRoomStore();
const gameStore = useGameStore();
const editorStore = useEditorStore();

const countdownRef = ref<InstanceType<typeof CountDown>>();
const layoutRef = ref<InstanceType<typeof RoomLayout>>();

//const selectedSpellIndex = ref(-1);
const winFlag = ref(0);

const gameModeSelectedSpellIndex = ref(-1);
const selectedSpellIndex = computed({
  get: () => {
    // If in editor mode, get the index from the editorStore.
    // Otherwise, get it from our local ref for game mode.
    return editorStore.isEditorMode ? editorStore.selectedSpellIndex : gameModeSelectedSpellIndex.value;
  },
  set: (val) => {
    // The setter is ONLY used by the v-model in game mode.
    // In editor mode, the selection is set directly by our new event handler.
    if (!editorStore.isEditorMode) {
      gameModeSelectedSpellIndex.value = val;
    }
  },
});
const playerALeftCd = computed(() => (gameStore.leftCdTime >= 0 ? gameStore.leftCdTime : roomStore.actualCdTimeA));
const playerBLeftCd = computed(() => (gameStore.leftCdTime >= 0 ? gameStore.leftCdTime : roomStore.actualCdTimeB));

const roomData = computed(() => roomStore.roomData);
const roomSettings = computed(() => roomStore.roomSettings);
const roomConfig = computed(() => roomStore.roomConfig);
const boardSpec = computed(() => new BoardSpec(roomConfig.value.board_size || 5));
const boardArea = computed(() => boardSpec.value.area);
const soloMode = computed(() => {
  return roomStore.soloMode;
});
const isHost = computed(() => roomStore.isHost);
const isPlayer = computed(() => roomStore.isPlayer);
const isPlayerA = computed(() => roomStore.isPlayerA);
const isPlayerB = computed(() => roomStore.isPlayerB);
const isOwner = computed(() => (soloMode.value ? isPlayerA.value : isHost.value));

const inMatch = computed(() => roomStore.inMatch);
const isBingoStandard = computed(() => roomStore.roomData.type === BingoType.STANDARD);
const isBingoBp = computed(() => roomStore.roomData.type === BingoType.BP);
const isBingoLink = computed(() => roomStore.roomData.type === BingoType.LINK);

const isDualBoard = computed(() => roomStore.roomConfig.dual_board > 0);
const playerASide = computed(() => (isDualBoard.value ? gameStore.normalGameData.which_board_a : 0));
const playerBSide = computed(() => (isDualBoard.value ? gameStore.normalGameData.which_board_b : 0));
const currentBoardSpells = computed(() => {
  const source = isDualBoard.value && gameStore.currentBoard === 1 ? gameStore.spells2 : gameStore.spells;
  return (source || []).slice(0, boardArea.value);
});
const currentBoardLevelTotal = computed(() =>
  currentBoardSpells.value.reduce((sum, spell) => sum + (spell?.star || 0), 0)
);
const isCurrentBoardCellCaptured = (index: number) => {
  const status = gameStore.spellStatus[index];
  return (
    status === SpellStatus.A_ATTAINED ||
    status === SpellStatus.B_ATTAINED ||
    status === SpellStatus.BOTH_ATTAINED
  );
};
const currentBoardRemainingLevel = computed(() =>
  currentBoardSpells.value.reduce((sum, spell, index) => {
    if (!spell || isCurrentBoardCellCaptured(index)) return sum;
    return sum + (spell.star || 0);
  }, 0)
);

const playerACanBP = computed(
  () =>
    bpStatus.value === BpStatus.IS_A_BAN ||
    bpStatus.value === BpStatus.IS_A_PICK ||
    bpStatus.value === BpStatus.SELECT_OPEN_EX
);
const playerBCanBP = computed(
  () =>
    bpStatus.value === BpStatus.IS_B_BAN ||
    bpStatus.value === BpStatus.IS_B_PICK ||
    bpStatus.value === BpStatus.SELECT_OPEN_EX
);
const playerASelectedIndex = computed(() => gameStore.playerASelectedIndex);
const playerBSelectedIndex = computed(() => gameStore.playerBSelectedIndex);
const spellCardSelected = computed(() => {
  if (isPlayerA.value) {
    return playerASelectedIndex.value !== -1;
  }
  if (isPlayerB.value) {
    return playerBSelectedIndex.value !== -1;
  }
  return false;
});
const menu = computed<{ label: string; value: number; tag?: string; isReset?: boolean }[]>(() => {
  let data: { label: string; value: number; tag?: string; isReset?: boolean }[] = [];
  if (roomData.value.type === BingoType.LINK) return data;
  switch (roomData.value.type) {
    case BingoType.STANDARD:
      if (soloMode.value) {
        data = [
          {
            label: "缃┖",
            value: 0,
          },
        ];
        if (isPlayerA.value) {
          data = [
            ...data,
            {
              label: "閫夋嫨",
              value: 1,
              tag: "playerA",
            },
            {
              label: "鏀跺彇",
              value: 5,
              tag: "playerA",
            },
            {
              label: "閫夋嫨",
              value: 3,
              tag: "playerB",
            },
            {
              label: "鏀跺彇",
              value: 7,
              tag: "playerB",
            },

            /*
            {
              label: "鍒锋柊",
              value: 0x100,
            },

             */
          ];
        }
        if (isPlayerB.value) {
          data = [
            ...data,
            {
              label: "閫夋嫨",
              value: 1,
              tag: "playerA",
            },
            {
              label: "鏀跺彇",
              value: 5,
              tag: "playerA",
            },
            {
              label: "閫夋嫨",
              value: 3,
              tag: "playerB",
            },
            {
              label: "鏀跺彇",
              value: 7,
              tag: "playerB",
            },
          ];
        }
      } else {
        if (isHost.value) {
          data = [
            {
              label: "缃┖",
              value: 0,
            },
            {
              label: "宸︿晶閫夋嫨",
              value: 1,
              tag: "playerA",
            },
            {
              label: "鍙充晶閫夋嫨",
              value: 3,
              tag: "playerB",
            },
            {
              label: "涓や晶閫夋嫨",
              value: 2,
            },
            {
              label: "宸︿晶鏀跺彇",
              value: 5,
              tag: "playerA",
            },
            {
              label: "鍙充晶鏀跺彇",
              value: 7,
              tag: "playerB",
            },
            {
              label: "鍒锋柊",
              value: 0x100,
            },
          ];
        }
      }
      break;
    case BingoType.BP:
      if (isHost.value) {
        data = [
          {
            label: "鏀跺彇澶辫触",
            value: 0,
            isReset: false,
          },
          {
            label: "绂佺敤",
            value: -1,
          },
          {
            label: "缃┖",
            value: 0,
            isReset: true,
          },
          {
            label: "宸︿晶閫夋嫨",
            value: 1,
            tag: "playerA",
          },
          {
            label: "鍙充晶閫夋嫨",
            value: 3,
            tag: "playerB",
          },
          // {
          //   label: "涓や晶閫夋嫨",
          //   value: 2,
          // },
          {
            label: "宸︿晶鏀跺彇",
            value: 5,
            tag: "playerA",
          },
          {
            label: "鍙充晶鏀跺彇",
            value: 7,
            tag: "playerB",
          },
          {
            label: "鍒锋柊",
            value: 0x100,
          },
        ];
      }
      break;
    case BingoType.LINK:
      if (soloMode.value) {
        data = [
          {
            label: "缃┖",
            value: 0,
          },
        ];
        if (isPlayerA.value) {
          data = [
            ...data,
            {
              label: "鏀跺彇",
              value: 5,
              tag: "playerA",
            },
          ];
        }
        if (isPlayerB.value) {
          data = [
            ...data,
            {
              label: "鏀跺彇",
              value: 7,
              tag: "playerB",
            },
          ];
        }
      } else {
        if (isHost.value) {
          data = [
            {
              label: "缃┖",
              value: 0,
            },
            {
              label: "涓や晶鏀跺彇",
              value: 6,
            },
            {
              label: "宸︿晶鏀跺彇",
              value: 5,
              tag: "playerA",
            },
            {
              label: "鍙充晶鏀跺彇",
              value: 7,
              tag: "playerB",
            },
            {
              label: "鍒锋柊",
              value: 0x100,
            },
          ];
        }
      }
      break;
  }
  return data;
});

const inGame = computed(() => roomStore.inGame);
onMounted(() => {
  if (!inGame.value) {
    if (soloMode.value) {
      if (!isBpPhase.value) layoutRef.value?.showAlert("等待左侧玩家开始比赛", "#000");
    } else {
      if (!isBpPhase.value) layoutRef.value?.showAlert("等待房主开始比赛", "#000");
    }
  } else {
    layoutRef.value?.hideAlert();
  }
});
const isBpPhase = computed(
  () => roomStore.banPick.phase > 0 && (roomStore.banPick.phase < 99 || gameStore.gameStatus === GameStatus.NOT_STARTED)
);
watch(
  isBpPhase,
  (value) => {
    if (value) {
      layoutRef.value?.hideAlert();
    }
  },
  {
    immediate: true,
  }
);
watch([inGame, isBpPhase], ([inGame, isBpPhase]) => {
  if (!inGame && !isBpPhase) {
    if (soloMode.value) {
      layoutRef.value?.showAlert("等待左侧玩家开始比赛", "#000");
    } else {
      layoutRef.value?.showAlert("等待房主开始比赛", "#000");
    }
  } else {
    layoutRef.value?.hideAlert();
  }
});

const gamePaused = computed(() => gameStore.gameStatus === GameStatus.PAUSED);
onMounted(() => {
  if (gamePaused.value) {
    layoutRef.value?.showAlert("游戏已暂停", "#000");
    countdownRef.value?.pause();
  }
});
watch(
  gamePaused,
  (value) => {
    if (value) {
      layoutRef.value?.showAlert("游戏已暂停", "#000");
      countdownRef.value?.pause();
    } else {
      layoutRef.value?.hideAlert();
      if (!isBingoBp.value) {
        nextTick(() => {
          countdownRef.value?.start();
        });
      }
    }
  },
  {
    immediate: true,
  }
);

//璧涘墠BP
const bpCode = ref("");
const banPick = computed(() => roomStore.banPick);
const bpStatus = computed(() => roomStore.bpStatus);

const startBP = () => {
  roomStore.startBanPick();
};
const playerBanPick = () => {
  if (!bpCode.value) {
    ElMessageBox.confirm("你没有选择作品，是否确认不选择？", "提示", {
      confirmButtonText: "纭畾",
      cancelButtonText: "鍙栨秷",
      type: "warning",
    })
      .then(() => {
        roomStore.banPickCard("");
      })
      .catch(() => {});
  } else {
    roomStore.banPickCard(bpCode.value);
  }
};
const confirmOpenEX = (flag: boolean) => {
  if (flag) {
    roomStore.banPickCard("1");
  } else {
    roomStore.banPickCard("-1");
  }
};

//鏍囧噯璧?
const oldSumArr = ref<number[]>([]);
const playerAScore = ref(0);
const playerBScore = ref(0);
const playerALevel = ref(0);
const playerBLevel = ref(0);
const selectCooldown = computed(() => {
  if (!gameStore.inited) {
    return -1;
  }
  const c =
    gameStore.leftCdTime >= 0
      ? gameStore.leftCdTime
      : isPlayerA.value
      ? roomStore.actualCdTimeA
      : roomStore.actualCdTimeB;
  return c;
});

const setCdTime = () => {
  gameStore.leftCdTime = -1;
};

const getStandardSpellStar = (index: number, playerIndex: 0 | 1) => {
  const boardMarker = gameStore.normalGameData?.get_on_which_board?.[index] || 0;
  const useSecondBoard = playerIndex === 0 ? boardMarker === 0x2 : boardMarker === 0x20;
  const spell = useSecondBoard ? gameStore.spells2[index] : gameStore.spells[index];
  return spell?.star || 0;
};

const getStandardTieBreakWinner = (
  status: number[],
  countA: number,
  countB: number,
  levelA: number,
  levelB: number
) => {
  const board = boardSpec.value;
  if (board.area % 2 !== 0) {
    return 0;
  }
  const halfArea = board.area / 2;
  if (countA !== halfArea && countB !== halfArea) {
    return 0;
  }
  if (levelA === levelB) {
    return 0;
  }

  if (!isDualBoard.value) {
    const totalLevel = gameStore.spells.slice(0, board.area).reduce((sum, spell) => sum + (spell?.star || 0), 0);
    if (countA === halfArea && levelA > totalLevel / 2) return -13;
    if (countB === halfArea && levelB > totalLevel / 2) return 13;
    return 0;
  }

  const remainingMaxLevel = status.slice(0, board.area).reduce((sum, cellStatus, index) => {
    if (cellStatus === 5 || cellStatus === 7) {
      return sum;
    }
    return sum + Math.max(gameStore.spells[index]?.star || 0, gameStore.spells2[index]?.star || 0);
  }, 0);
  if (countA === halfArea && levelA > levelB && levelA - levelB > remainingMaxLevel) return -13;
  if (countB === halfArea && levelB > levelA && levelB - levelA > remainingMaxLevel) return 13;
  return 0;
};

const decideStandard = (status) => {
  const board = boardSpec.value;
  const extraLines = gameStore.normalGameData?.extra_lines || [];
  const lines = board.winningLines(extraLines);
  const lineCount = lines.length;
  const available: number[] = new Array(lineCount).fill(2);
  const sumArr: number[] = new Array(lineCount).fill(0);
  winFlag.value = 0;
  let countA = 0;
  let countB = 0;
  let scoreA = 0;
  let scoreB = 0;
  let levelA = 0;
  let levelB = 0;
  const cellToLines: number[][] = Array.from({ length: board.area }, () => []);
  lines.forEach((line, li) => {
    line.forEach((idx) => cellToLines[idx].push(li));
  });
  status.forEach((item: number, index: number) => {
    if (item === 5) {
      countA++;
      scoreA += 1;
      levelA += getStandardSpellStar(index, 0);
      for (const li of cellToLines[index]) {
        if (available[li] > 0) available[li] -= 2;
        sumArr[li] -= 1;
      }
    } else if (item === 7) {
      countB++;
      scoreB += 1;
      levelB += getStandardSpellStar(index, 1);
      for (const li of cellToLines[index]) {
        if (available[li] % 2 === 0) available[li] -= 1;
        sumArr[li] += 1;
      }
    }
  });
  //璁＄畻鏄惁浜х敓浜嗘柊鐨勫洓杩?
  let gamePointFlag = false;
  const fullLine = board.size;
  const nearLine = fullLine - 1;
  for (let i = 0; i < lineCount; i++) {
    if (sumArr[i] === -fullLine) {
      winFlag.value = -(i + 1);
      break;
    } else if (sumArr[i] === fullLine) {
      winFlag.value = i + 1;
      break;
    } else if (
      (sumArr[i] === -nearLine && oldSumArr.value[i] > -nearLine && isPlayerB.value) ||
      (sumArr[i] === nearLine && oldSumArr.value[i] < nearLine && isPlayerA.value)
    ) {
      gamePointFlag = true;
    }
  }
  if (gamePointFlag) {
    layoutRef.value?.warnGamePoint();
  }
  oldSumArr.value = sumArr;
  //鍔犲垎鐨勪竴鏂规敹鍗￠煶鏁?
  if ((playerAScore.value < scoreA && isPlayerA.value) || (playerBScore.value < scoreB && isPlayerB.value)) {
    layoutRef.value?.infoCaptureCard();
  }

  playerAScore.value = scoreA;
  playerBScore.value = scoreB;

  playerALevel.value = levelA;
  playerBLevel.value = levelB;

  if (winFlag.value === 0) {
    if (countA > board.area / 2) {
      winFlag.value = -13;
    } else if (countB > board.area / 2) {
      winFlag.value = 13;
    } else {
      winFlag.value = getStandardTieBreakWinner(status, countA, countB, levelA, levelB);
    }
  }

  if (winFlag.value === 0 && gameStore.leftTime < 0 && countA !== countB) {
    if (countA > countB) {
      winFlag.value = -14;
    } else {
      winFlag.value = 14;
    }
    // if (trainingMode.value) Mit.emit("ai_game_over");
  }

  if (soloMode.value && winFlag.value !== 0) {
    // if (trainingMode.value) Mit.emit("ai_game_over");
    //confirmWinner();
    //濡傛灉娌℃湁瀵兼挱...
    if (winFlag.value !== 0) {
      //鍗曚汉缁冧範妯″紡鍏佽鍏抽棴鑳滃埄鍒ゅ畾
      if (roomStore.practiceMode && roomSettings.value.noWinningDeclaration) {
        layoutRef.value?.hideAlert();
      } else {
        //鍚﹀垯鐢卞乏渚х帺瀹跺喅瀹氳儨鍒?
        layoutRef.value?.showAlert("宸叉弧瓒宠儨鍒╂潯浠讹紝绛夊緟宸︿晶鐜╁鍒ゆ柇鑳滆礋", "red");
      }
    } else {
      layoutRef.value?.hideAlert();
    }
  }
  if (!soloMode.value && !isHost.value) {
    if (winFlag.value !== 0) {
      layoutRef.value?.showAlert("宸叉弧瓒宠儨鍒╂潯浠讹紝绛夊緟鎴夸富鍒ゆ柇鑳滆礋", "red");
    } else {
      layoutRef.value?.hideAlert();
    }
  }
};

//BP璧?
const isMyTurn = computed(
  () =>
    (isPlayerA.value && gameStore.bpGameData.whose_turn === 0) ||
    (isPlayerB.value && gameStore.bpGameData.whose_turn === 1)
);
const bingoBpPhase = computed(() => gameStore.bpGameData.ban_pick !== 2);
//鎬诲け璐ユ鏁?
const playerAFailure = ref(0);
const playerBFailure = ref(0);

const nextRound = () => {
  gameStore.bpGameNextRound();
};
const confirmBp = () => {
  if (selectedSpellIndex.value === -1) return;
  gameStore.bpGameBanPick(selectedSpellIndex.value).then(() => {
    gameModeSelectedSpellIndex.value = -1;
  });
};
const decideBp = (status) => {
  const board = boardSpec.value;
  const lines = board.winningLines();
  const lineCount = lines.length;
  const available: number[] = new Array(lineCount).fill(2);
  const sumArr: number[] = new Array(lineCount).fill(0);
  winFlag.value = 0;
  let count = 0;
  let scoreA = 0;
  let scoreB = 0;
  const cellToLines: number[][] = Array.from({ length: board.area }, () => []);
  lines.forEach((line, li) => {
    line.forEach((idx) => cellToLines[idx].push(li));
  });
  status.forEach((item: number, index: number) => {
    if (item == -1) {
      count++;
    }
    if (item === 5) {
      count++;
      scoreA += gameStore.spells[index].star;
      for (const li of cellToLines[index]) {
        if (available[li] > 0) available[li] -= 2;
        sumArr[li] -= 1;
      }
    } else if (item === 7) {
      count++;
      scoreB += gameStore.spells[index].star;
      for (const li of cellToLines[index]) {
        if (available[li] % 2 === 0) available[li] -= 1;
        sumArr[li] += 1;
      }
    }
  });

  const fullLine = board.size;
  for (let i = 0; i < lineCount; i++) {
    if (sumArr[i] === -fullLine) {
      winFlag.value = -(i + 1);
      break;
    } else if (sumArr[i] === fullLine) {
      winFlag.value = i + 1;
      break;
    }
  }

  let playerAFailureNew = 0;
  let playerBFailureNew = 0;
  gameStore.bpGameData.spell_failed_count_a.forEach((item: number) => {
    playerAFailureNew += item;
  });
  gameStore.bpGameData.spell_failed_count_b.forEach((item: number) => {
    playerBFailureNew += item;
  });

  //鍔犲垎鐨勪竴鏂规敹鍗￠煶鏁?
  if ((playerAScore.value < scoreA && isPlayerA.value) || (playerBScore.value < scoreB && isPlayerB.value)) {
    layoutRef.value?.infoCaptureCard();
  }
  playerAScore.value = scoreA;
  playerBScore.value = scoreB;

  //澶辫触鐨勪竴鏂圭垎鐐搁煶鏁?
  if (
    (playerAFailure.value < playerAFailureNew && isPlayerA.value) ||
    (playerBFailure.value < playerBFailureNew && isPlayerB.value)
  ) {
    layoutRef.value?.infoFailCard();
  }
  playerAFailure.value = playerAFailureNew;
  playerBFailure.value = playerBFailureNew;

  if (count == board.area) {
    if (scoreB - scoreA < 0) {
      winFlag.value = -25;
    } else {
      winFlag.value = 25;
    }
  }

  if (!isHost.value) {
    if (winFlag.value !== 0) {
      layoutRef.value?.showAlert("宸叉弧瓒宠儨鍒╂潯浠讹紝绛夊緟鎴夸富鍒ゆ柇鑳滆礋", "red");
    } else {
      layoutRef.value?.hideAlert();
    }
  }
};

//link璧?const linkData = computed(() => gameStore.linkGameData);
const linkPhase = computed(() => {
  if (!inGame.value) return 0;
  if (linkData.value.event_a === 1 || linkData.value.event_b === 1) return 2;
  if (linkData.value.event_a === 3 && linkData.value.event_b === 3) return 3;
  if (linkData.value.route_confirmed_a || linkData.value.route_confirmed_b || routeA.value.length > 1 || routeB.value.length > 1) {
    return 1;
  }
  return 1;
});
const routeA = computed(() => linkData.value.link_idx_a?.length ? linkData.value.link_idx_a : [0]);
const routeB = computed(() =>
  linkData.value.link_idx_b?.length ? linkData.value.link_idx_b : [boardSpec.value.size - 1]
);
const linkRouteLevelA = computed(() => routeA.value.reduce((sum, idx) => sum + (gameStore.spells[idx]?.star || 0), 0));
const linkRouteLevelB = computed(() => routeB.value.reduce((sum, idx) => sum + (gameStore.spells[idx]?.star || 0), 0));
const linkLevelCoefficient = computed(() => roomStore.roomConfig.link_level_coefficient ?? 2);
const linkRouteScoreA = computed(() => Math.round(linkRouteLevelA.value * linkLevelCoefficient.value * 10) / 10);
const linkRouteScoreB = computed(() => Math.round(linkRouteLevelB.value * linkLevelCoefficient.value * 10) / 10);
const linkFastestEnabled = computed(() => Config.spellListWithTimer.includes(roomStore.roomConfig.spell_version));
const linkRouteFastest = (route: number[]) => {
  if (!linkFastestEnabled.value) return 0;
  const total = route.reduce((sum, idx) => sum + (gameStore.spells[idx]?.fastest || 0), 0);
  return Math.round(total * 10) / 10;
};
const linkRouteFastestA = computed(() => linkRouteFastest(routeA.value));
const linkRouteFastestB = computed(() => linkRouteFastest(routeB.value));
const linkEndA = computed(() => boardSpec.value.area - 1);
const linkEndB = computed(() => boardSpec.value.index(boardSpec.value.size - 1, 0));
const myLinkRoute = computed(() => (isPlayerA.value ? routeA.value : routeB.value));
const myLinkRouteConfirmed = computed(() =>
  isPlayerA.value ? linkData.value.route_confirmed_a : linkData.value.route_confirmed_b
);
const linkRouteComplete = computed(() => {
  const route = myLinkRoute.value;
  const end = isPlayerA.value ? linkEndA.value : linkEndB.value;
  return route.length > 0 && route[route.length - 1] === end;
});
const bothLinkRoutesConfirmed = computed(() => linkData.value.route_confirmed_a && linkData.value.route_confirmed_b);
const myLinkFinished = computed(() => (isPlayerA.value ? linkData.value.event_a === 3 : linkData.value.event_b === 3));
const myLinkCurrentStep = computed(() => (isPlayerA.value ? linkData.value.current_step_a : linkData.value.current_step_b));
const myLinkLastGetTime = computed(() => (isPlayerA.value ? linkData.value.last_get_time_a : linkData.value.last_get_time_b));
const myLinkSkipUsed = computed(() => (isPlayerA.value ? linkData.value.skip_used_a : linkData.value.skip_used_b));
const linkSkipLimit = (route: number[]) => route.length > 10 ? 2 : 1;
const linkSkipRemainA = computed(() => Math.max(0, linkSkipLimit(routeA.value) - (linkData.value.skip_used_a || 0)));
const linkSkipRemainB = computed(() => Math.max(0, linkSkipLimit(routeB.value) - (linkData.value.skip_used_b || 0)));
const canManageLinkA = computed(() => isBingoLink.value && (roomData.value.host ? isHost.value : isPlayerA.value));
const canManageLinkB = computed(() => isBingoLink.value && (roomData.value.host ? isHost.value : isPlayerB.value));
const linkPlayerFinished = (playerIndex: 0 | 1) => playerIndex === 0 ? linkData.value.event_a === 3 : linkData.value.event_b === 3;
const myLinkCurrentIndex = computed(() => myLinkRoute.value[myLinkCurrentStep.value] ?? -1);
const myLinkCurrentSelected = computed(() => {
  const idx = myLinkCurrentIndex.value;
  if (idx < 0) return false;
  const status = isPlayerA.value ? linkData.value.status_a?.[idx] : linkData.value.status_b?.[idx];
  return status === (isPlayerA.value ? 1 : 3);
});
const linkNow = ref(Date.now());
const linkCooldown = computed(() => {
  if (linkPhase.value !== 2) return -1;
  const cd = isPlayerA.value ? roomStore.actualCdTimeA : roomStore.actualCdTimeB;
  return Math.max(0, myLinkLastGetTime.value + cd - linkNow.value);
});
const canLinkSkip = computed(() => {
  const route = myLinkRoute.value;
  const step = myLinkCurrentStep.value;
  if (step >= route.length) return false;
  if (myLinkSkipUsed.value >= linkSkipLimit(route)) return false;
  const spell = gameStore.spells[route[step]];
  if (!spell) return false;
  return linkNow.value - myLinkLastGetTime.value >= (spell.star + 1) * 60000;
});

const decideLink = () => {
  const now = Date.now();
  const liveScore = (playerIndex: 0 | 1) => {
    const route = playerIndex === 0 ? routeA.value : routeB.value;
    const step = playerIndex === 0 ? linkData.value.current_step_a || 0 : linkData.value.current_step_b || 0;
    const start = playerIndex === 0 ? linkData.value.start_ms_a : linkData.value.start_ms_b;
    const end = playerIndex === 0 ? linkData.value.end_ms_a : linkData.value.end_ms_b;
    const event = playerIndex === 0 ? linkData.value.event_a : linkData.value.event_b;
    const taken = route.slice(0, step);
    const level = taken.reduce((sum, idx) => sum + (gameStore.spells[idx]?.star || 0), 0);
    const fastest = taken.reduce((sum, idx) => sum + (gameStore.spells[idx]?.fastest || 0), 0);
    const usedMs = start > 0 ? (event === 3 && end > 0 ? end : now) - start : 0;
    return (
      boardSpec.value.size * 200 +
      level * (roomStore.roomConfig.link_level_coefficient ?? 2) +
      fastest * (roomStore.roomConfig.link_fastest_coefficient ?? 1) -
      usedMs / 1000
    );
  };
  playerAScore.value = Math.round(liveScore(0) * 10) / 10;
  playerBScore.value = Math.round(liveScore(1) * 10) / 10;
  playerALevel.value = routeA.value.slice(0, linkData.value.current_step_a || 0).reduce((sum, idx) => {
    return sum + (gameStore.spells[idx]?.star || 0);
  }, 0);
  playerBLevel.value = routeB.value.slice(0, linkData.value.current_step_b || 0).reduce((sum, idx) => {
    return sum + (gameStore.spells[idx]?.star || 0);
  }, 0);
  if (linkData.value.event_a === 3 && linkData.value.event_b === 3) {
    winFlag.value = (linkData.value.score_a || 0) >= (linkData.value.score_b || 0) ? -30 : 30;
    if (!isOwner.value) layoutRef.value?.showAlert("鍙屾柟宸插畬鎴愶紝绛夊緟纭鑳滆礋", "red");
  } else if (inGame.value && isBingoLink.value) {
    winFlag.value = 0;
  }
};

const confirmLinkRoute = () => {
  gameStore.linkConfirmRoute(!myLinkRouteConfirmed.value);
};
const linkUndo = () => {
  gameStore.linkUndo();
};
const startLinkRun = () => {
  countdownRef.value?.stop();
  gameStore.gameStatus = GameStatus.STARTED;
  gameStore.linkSetPhase(2);
};
const linkNextCard = () => {
  gameStore.linkNextCard();
};
const linkFinishCard = () => {
  gameStore.linkFinishCard();
};
const linkSkipCard = () => {
  gameStore.linkSkipCard();
};
const forceLinkSkip = (playerIndex: 0 | 1) => {
  gameStore.linkForceSkip(playerIndex);
};
const undoLinkFinish = (playerIndex: 0 | 1) => {
  gameStore.linkUndoFinish(playerIndex);
};
const setLinkSkipUsed = (playerIndex: 0 | 1, value: number) => {
  gameStore.linkSetSkipUsed(playerIndex, value);
};

watch(
  () => gameStore.linkGameData,
  () => {
    if (isBingoLink.value) decideLink();
  },
  { deep: true, immediate: true }
);

const linkLiveTimer = ref<number | null>(null);
watch(
  () => [isBingoLink.value, linkPhase.value],
  ([isLink, phase]) => {
    if (linkLiveTimer.value) {
      clearInterval(linkLiveTimer.value);
      linkLiveTimer.value = null;
    }
    if (isLink && phase === 2) {
      linkLiveTimer.value = window.setInterval(() => {
        linkNow.value = Date.now();
        decideLink();
      }, 1000);
    }
  },
  { immediate: true }
);

watch(canLinkSkip, (canSkip, wasCanSkip) => {
  if (canSkip && !wasCanSkip && isBingoLink.value && linkPhase.value === 2 && isPlayer.value) {
    layoutRef.value?.infoSkipAvailable();
  }
});

watch(
  () => gameStore.gameStatus,
  (newVal, oldVal) => {
    switch (newVal) {
      case GameStatus.NOT_STARTED:
        playerAScore.value = 0;
        playerBScore.value = 0;
        playerAFailure.value = 0;
        playerBFailure.value = 0;
        playerALevel.value = 0;
        playerBLevel.value = 0;
        break;
      case GameStatus.COUNT_DOWN:
        nextTick(() => {
          countdownRef.value?.start();
        });
        break;
      case GameStatus.STARTED:
        if (!isBingoBp.value) {
          nextTick(() => {
            countdownRef.value?.start();
          });
        }
        break;
      case GameStatus.PAUSED:
        break;
      case GameStatus.ENDED:
        layoutRef.value?.showAlert("姣旇禌宸茬粨鏉燂紝绛夊緟鎴夸富鎿嶄綔", "red");
        // ElMessageBox.alert(`${roomData.value.last_winner}鑾疯儨`, "姣旇禌缁撴潫", {
        //   confirmButtonText: "纭畾",
        // });
        // roomStore.roomData.change_card_count = [0, 0];
        break;
    }
  },
  {
    immediate: true,
  }
);

watch(
  () => gameStore.spellStatus,
  (status) => {
    if (status && status.length) {
      if (isBingoStandard.value) {
        decideStandard(status);
      }
      if (isBingoBp.value) {
        decideBp(status);
      }
    }

    // if (isBingoLink.value) {
    //   winFlag.value = 0;
    //   if (newVal.link_data) {
    //     decideLink(newVal);
    //   }
    // }
  },
  { deep: true, immediate: true }
);

//鏂规硶
const startGame = () => {
  if (roomSettings.value.gamebp && (!roomSettings.value.matchbp || !inMatch.value)) {
    startBP();
  } else {
    gameStore.startGame().then(() => {
      roomStore.updateChangeCardCount(roomData.value.names[0], roomSettings.value.playerA.changeCardCount);
      roomStore.updateChangeCardCount(roomData.value.names[1], roomSettings.value.playerB.changeCardCount);
      if (isBingoLink.value) gameStore.linkSetPhase(1);
      if (isBingoLink.value) {
        gameStore.gameStatus = GameStatus.COUNT_DOWN;
        gameStore.leftTime = roomConfig.value.countdown * 1000;
        nextTick(() => countdownRef.value?.start());
      }
      layoutRef.value?.hideAlert();
    });
  }
};
const drawSpellCard = () => {
  gameStore.startGame().then(() => {
    roomStore.updateChangeCardCount(roomData.value.names[0], roomSettings.value.playerA.changeCardCount);
    roomStore.updateChangeCardCount(roomData.value.names[1], roomSettings.value.playerB.changeCardCount);
    layoutRef.value?.hideAlert();
  });
};
const stopGame = () => {
  const checked = ref<1 | 0 | -1>(-1);
  ElMessageBox({
    title: "杩樻病鏈変汉鑾疯儨锛岀幇鍦ㄧ粨鏉熸瘮璧涜閫夋嫨涓€涓€夐」",
    message: () =>
      h(
        ElRadioGroup,
        {
          modelValue: checked.value,
          "onUpdate:modelValue": (val: any) => {
            checked.value = val;
          },
        },
        () => [
          h(
            ElRadio,
            {
              value: -1,
            },
            {
              default: () => "缁撴灉浣滃簾",
            }
          ),
          h(
            ElRadio,
            {
              value: 0,
            },
            {
              default: () => roomData.value.names[0] + "鑾疯儨",
            }
          ),
          h(
            ElRadio,
            {
              value: 1,
            },
            {
              default: () => roomData.value.names[1] + "鑾疯儨",
            }
          ),
        ]
      ),
  })
    .then(() => {
      //winner
      if ((checked.value as number) < 0) {
        gameStore.stopGame(-1);
      } else {
        gameStore.stopGame(checked.value);
      }
    })
    .catch(() => {});
};
const pauseGame = () => {
  gameStore.pause(true);
};
const resumeGame = () => {
  gameStore.pause(false);
};
const confirmWinner = () => {
  gameStore.stopGame(winFlag.value < 0 ? 0 : 1).then(() => {
    countdownRef.value?.stop();
    winFlag.value = 0;
  });
};
/*
const stopGameInfo = (winner: number) => {
  if (isPlayerA.value) {
    winner == 0 ? layoutRef.value?.infoWinGame() : layoutRef.value?.infoLoseGame();
  }
  if (isPlayerB.value) {
    winner == 1 ? layoutRef.value?.infoWinGame() : layoutRef.value?.infoLoseGame();
  }
};*/
const playerAWin = ref(0);
const playerBWin = ref(0);
watch(
  () => roomData.value.score,
  (score) => {
    if (score[0] > playerAWin.value) {
      if (isPlayerA.value) layoutRef.value?.infoWinGame();
      if (isPlayerB.value) layoutRef.value?.infoLoseGame();
    }
    if (score[1] > playerBWin.value) {
      if (isPlayerB.value) layoutRef.value?.infoWinGame();
      if (isPlayerA.value) layoutRef.value?.infoLoseGame();
    }
    playerAWin.value = score[0];
    playerBWin.value = score[1];
  },
  { deep: true, immediate: true }
);
const confirmSelect = () => {
  gameStore.alreadySelectCard = true;
  gameStore.selectSpell(selectedSpellIndex.value).then(() => {
    gameModeSelectedSpellIndex.value = -1;
  });
  if (isDualBoard.value) switchToSelfPage();
};
const confirmAttained = () => {
  if (isDualBoard.value) switchToSelfPage();
  gameStore.finishSpell(isPlayerA.value ? playerASelectedIndex.value : playerBSelectedIndex.value);
};
const warnPlayer = (name) => {
  return ws.send(WebSocketActionType.GM_WARN_PLAYER, { name });
};
const onCountDownComplete = () => {
  if (isBingoLink.value && linkPhase.value === 1) {
    gameStore.gameStatus = GameStatus.STARTED;
    if (isOwner.value) {
      gameStore.linkSetPhase(2);
    }
    return;
  }
  if (gameStore.gameStatus === GameStatus.COUNT_DOWN) {
    gameStore.gameStatus = GameStatus.STARTED;
    gameStore.leftTime = roomConfig.value.game_time * 1000 * 60;
    if (!isBingoBp.value) {
      nextTick(() => {
        countdownRef.value?.start();
      });
    }
  } else if (gameStore.gameStatus === GameStatus.STARTED) {
    gameStore.gameStatus = GameStatus.ENDED;
    if (!isHost.value) {
      layoutRef.value?.showAlert("娓告垙鏃堕棿鍒帮紝绛夊緟鎴夸富鍒ゆ柇鑳滆礋", "red");
    } else {
      layoutRef.value?.showAlert("娓告垙鏃堕棿鍒帮紝绛夊緟宸︿晶鐜╁鍒ゆ柇鑳滆礋", "red");
    }
  }
};
const resetRoom = () => {
  ElMessageBox.confirm("该操作会把房间恢复到初始状态，是否确认？", "警告", {
    confirmButtonText: "纭",
    cancelButtonText: "鍙栨秷",
    type: "warning",
  })
    .then(() => {
      roomStore.resetRoom();
    })
    .catch(() => {});
};
const addChangeCardCount = (index: number) => {
  roomStore.updateChangeCardCount(roomData.value.names[index], roomData.value.change_card_count[index] + 1);
};
const removeChangeCardCount = (index: number) => {
  roomStore.updateChangeCardCount(roomData.value.names[index], roomData.value.change_card_count[index] - 1);
};

const switchDualBoardSide = () => {
  gameStore.currentBoard = 1 - gameStore.currentBoard;
  //浠呭€掕鏃舵湡闂翠笖鏈疄闄呴€夋嫨鏃跺厑璁稿疄闄呯殑鐩橀潰杞崲
  if (boardNotDecided()) {
    ws.send(WebSocketActionType.NORMAL_DUAL_BOARD_CHANGE, {
      player: isPlayerA.value ? 0 : 1,
      to: gameStore.currentBoard,
    });
  }
};
const switchToSelfPage = () => {
  if (!boardNotDecided()) {
    gameStore.currentBoard = isPlayerA.value ? playerASide.value : playerBSide.value;
  }
};
const switchSideForce = (playerId: number) => {
  ws.send(WebSocketActionType.NORMAL_DUAL_BOARD_CHANGE, {
    player: playerId,
    to: playerId === 0 ? 1 - playerASide.value : 1 - playerBSide.value,
  });
};
const hostSwitchPlayerSide = (playerId: number) => {
  ElMessageBox.confirm(`是否改变玩家 ` + roomStore.roomData.names[playerId] + ` 到另一面？`, "警告", {
    confirmButtonText: "纭",
    cancelButtonText: "鍙栨秷",
    type: "warning",
  })
    .then(() => {
      switchSideForce(playerId);
    });
};

ws.on(WebSocketPushActionType.PUSH_NORMAL_DUAL_BOARD_CHANGE, (data) => {
  const playerIndex = data!.playerId;
  const toSide = data!.to;
  playerIndex === 0
    ? (gameStore.normalGameData.which_board_a = toSide)
    : (gameStore.normalGameData.which_board_b = toSide);
  if (isPlayerA.value) {
    gameStore.currentBoard = gameStore.normalGameData.which_board_a;
  }
  if (isPlayerB.value) {
    gameStore.currentBoard = gameStore.normalGameData.which_board_b;
  }
});
//涓嶆槸閫夋墜锛屽缁堜负鏌ョ湅妯″紡
//鏄€夋墜锛屽彧鏈夊€掕鏃舵湡闂翠笖鏈疄闄呴€夊崱鎵嶆湁鑷敱杩涜瀹為檯鐨勫垏鎹紝鍏朵綑鎯呭喌浠ユ湇鍔″櫒涓哄噯
const boardNotDecided = () => {
  if (gameStore.isReplayMode) return false;
  return isPlayer.value && gameStore.gameStatus === GameStatus.COUNT_DOWN && !spellCardSelected.value;
};
//鍦ㄤ笉鍏佽鑷敱鍒囨崲鐨勬椂鍊欙紝鍒ゆ柇閫夋墜鏄惁涓庢湇鍔″櫒鏈€杩戣繑鍥炵殑鏁版嵁鐩哥
const isOnCurrentBoard = () => {
  if (boardNotDecided()) {
    return true;
  }
  if (isPlayerA.value) {
    return gameStore.currentBoard === gameStore.normalGameData.which_board_a;
  }
  if (isPlayerB.value) {
    return gameStore.currentBoard === gameStore.normalGameData.which_board_b;
  }
  return true;
};

// Auto-switch functionality for dual boards
const autoSwitchTimer = ref<number | null>(null);
const autoSwitchLeftTime = ref(0);

// Start auto-switch timer
const startAutoSwitchTimer = () => {
  if (autoSwitchTimer.value) return;

  // Reset left time to interval value
  autoSwitchLeftTime.value = roomSettings.value.autoSwitchInterval;

  autoSwitchTimer.value = setInterval(() => {
    autoSwitchLeftTime.value--;

    if (autoSwitchLeftTime.value <= 0) {
      // Perform auto-switch
      switchDualBoardSide();
      autoSwitchLeftTime.value = roomSettings.value.autoSwitchInterval;
    }
  }, 1000);
};

// Stop auto-switch timer
const stopAutoSwitchTimer = () => {
  if (autoSwitchTimer.value) {
    clearInterval(autoSwitchTimer.value);
    autoSwitchTimer.value = null;
  }
  autoSwitchLeftTime.value = 0;
};

// Reset auto-switch timer
const resetAutoSwitchTimer = () => {
  stopAutoSwitchTimer();
  if (shouldAutoSwitch.value) {
    startAutoSwitchTimer();
  }
};

// Check if auto-switch conditions are met
const shouldAutoSwitch = computed(() => {
  return (
    roomSettings.value.autoSwitchInDualMode && !isPlayer.value && roomStore.roomConfig.dual_board > 0 && inGame.value
  );
});

// Watch for changes to autoSwitchInDualMode
watch(
  () => roomSettings.value.autoSwitchInDualMode,
  (newValue) => {
    if (newValue) {
      if (shouldAutoSwitch.value) {
        startAutoSwitchTimer();
      }
    } else {
      stopAutoSwitchTimer();
    }
  }
);

// Watch for changes to autoSwitchInterval
watch(
  () => roomSettings.value.autoSwitchInterval,
  (newInterval) => {
    if (autoSwitchTimer.value) {
      // Reset left time to the minimum of new interval and current left time
      autoSwitchLeftTime.value = Math.min(newInterval, autoSwitchLeftTime.value);
    }
  }
);

// Watch for inGame changes
watch(
  () => inGame.value,
  (newValue) => {
    if (newValue && shouldAutoSwitch.value) {
      startAutoSwitchTimer();
    } else {
      stopAutoSwitchTimer();
    }
  }
);

// Watch for manual board switches
watch(
  () => gameStore.currentBoard,
  () => {
    // Reset timer only if it's a manual switch (not caused by auto-switch)
    if (autoSwitchTimer.value) {
      resetAutoSwitchTimer();
    }
  }
);

// Start timer when component mounts
onMounted(() => {
  if (shouldAutoSwitch.value) {
    startAutoSwitchTimer();
  }
});

// Clean up timer on component unmount
onUnmounted(() => {
  stopAutoSwitchTimer();
  if (linkLiveTimer.value) {
    clearInterval(linkLiveTimer.value);
    linkLiveTimer.value = null;
  }
});

const replayInstance = Replay;
const replaySpeed = ref(1);
const speedValues = [1, 1.5, 2, 3, 5, 8, 15, 30];
const speedMarks = {
  1: "1",
  2: "1.5",
  3: "2",
  4: "3",
  5: "5",
  6: "8",
  7: "15",
  8: "30",
};
watch(
  () => gameStore.isReplayMode,
  (isReplayActive) => {
    if (isReplayActive) {
      // 褰撴柊鐨勫洖鏀惧紑濮嬫椂锛屽皢UI婊戝潡鐨勪綅缃噸缃负1
      replaySpeed.value = 1;
    }
  }
);
// 鍒囨崲鍥炴斁鎾斁/鏆傚仠
const toggleReplay = () => {
  if (replayInstance.state.isReplayFinished) {
    return; // 濡傛灉宸茬粨鏉燂紝涓嶅仛浠讳綍浜?
  }
  layoutRef.value?.hideAlert();
  if (replayInstance.state.isPlaying) {
    replayInstance.pauseReplay();
  } else {
    replayInstance.resumeReplay();
  }
};
// 鏀瑰彉鍥炴斁閫熷害
const changeReplaySpeed = (value: number) => {
  const newSpeed = speedValues[value - 1];
  if (newSpeed) {
    replayInstance.setSpeed(newSpeed);
  } else {
    console.error(`Invalid slider value received: ${value}`);
  }
};

// 鏍煎紡鍖栧洖鏀炬椂闂存樉绀?(淇濇寔涓嶅彉)
const formatReplayTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

// 纭閫€鍑哄洖鏀?(淇濇寔涓嶅彉)
const confirmExitReplay = () => {
  replayInstance.endReplay();
};

onUnmounted(() => {
  if (gameStore.isReplayMode) {
    replayInstance.endReplay();
  }
});

const handleTimelineChange = (value: number) => {
  replayInstance.jumpToTime(value);
  layoutRef.value?.hideAlert();
};

const jumpToPreviousReplayAction = () => {
  replayInstance.jumpToPreviousAction();
  layoutRef.value?.hideAlert();
};

const jumpToNextReplayAction = () => {
  replayInstance.jumpToNextAction();
  layoutRef.value?.hideAlert();
};

const handleEditorCellClick = (index: number) => {
  // Delegate the logic entirely to the store
  editorStore.selectSpell(index);
};

// 璁＄畻灞炴€э紝鐢ㄤ簬鍚戞ā鎬佹浼犻€掓暟鎹?
const selectedSpellData = computed(() => {
  if (!editorStore.isEditorMode || editorStore.selectedSpellIndex === -1) {
    return { spell: {}, status: 0, isPortal: false };
  }
  const index = editorStore.selectedSpellIndex;
  const board = gameStore.currentBoard;
  const spell = board === 0 ? editorStore.spells[index] : editorStore.spells2[index];
  const status = editorStore.spellStatus[index];
  const portals = board === 0 ? editorStore.normalGameData.is_portal_a : editorStore.normalGameData.is_portal_b;
  const isPortal = (roomStore.roomConfig.dual_board > 0 && portals && portals[index] === 1) || false;
  return { spell, status, isPortal };
});

// 澶勭悊妯℃€佹纭浜嬩欢
const handleEditorConfirm = (payload) => {
  const index = editorStore.selectedSpellIndex;
  editorStore.updateSpell({ index, spellData: payload.spellData });
  editorStore.updateSpellStatus({ index, status: payload.status });
  editorStore.updatePortalStatus({ index, isPortal: payload.isPortal });
  editorStore.closeModal();
};

// 澶勭悊妯℃€佹娓呯┖浜嬩欢
const handleEditorClear = () => {
  editorStore.clearSpell(editorStore.selectedSpellIndex);
  editorStore.closeModal();
};

// --- 閿洏蹇嵎閿?---
const handleKeyDown = (e: KeyboardEvent) => {
  if (!editorStore.isEditorMode || editorStore.selectedSpellIndex === -1) return;

  // 妫€鏌ユ槸鍚﹀湪杈撳叆妗嗗唴锛岄伩鍏嶅啿绐?
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  if (e.ctrlKey || e.metaKey) {
    // metaKey for macOS
    if (e.key === "c") {
      e.preventDefault();
      editorStore.copySpell(editorStore.selectedSpellIndex);
    } else if (e.key === "v") {
      e.preventDefault();
      editorStore.pasteSpell(editorStore.selectedSpellIndex);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      editorStore.clearSpell(editorStore.selectedSpellIndex);
    }
  }
};

onMounted(() => {
  document.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeyDown);
});

const handleClearAll = () => {
  ElMessageBox.confirm("确定要清空所有格子的内容吗？此操作不可恢复。", "警告", {
    type: "warning",
    confirmButtonText: "纭娓呯┖",
    confirmButtonClass: "el-button--danger",
  })
    .then(() => {
      editorStore.clearAllSpells();
      ElMessage.success("已清空");
    })
    .catch(() => {});
};

const handleShuffleSpells = () => {
  ElMessageBox.confirm("确定要洗混当前盘面的格子吗？此操作不可恢复。", "提示", {
    type: "warning",
    confirmButtonText: "纭娲楁贩",
    cancelButtonText: "鍙栨秷",
  })
    .then(() => {
      const result = editorStore.shuffleSpells();
      if (result.success) {
        ElMessage.success(result.message);
      }
    })
    .catch(() => {});
};

</script>

<style lang="scss" scoped>
.link-board-summary {
  position: absolute;
  top: -30px;
  left: 50%;
  z-index: 120;
  display: flex;
  gap: 14px;
  align-items: center;
  transform: translateX(-50%);
  padding: 4px 12px;
  border: 1px solid rgba(0, 0, 0, 0.18);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.88);
  font-size: 13px;
  white-space: nowrap;
}
.page-icon {
  width: 20px;
  height: 20px;
  border: 1px solid #000;
  background-color: var(--bg-color);
  cursor: pointer;
}
.page-icon-reverse {
  width: 20px;
  height: 20px;
  border: 1px solid #000;
  background-color: var(--bg-color-reverse);
  cursor: pointer;
}
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
.page {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--board-overlay-width, calc(100% - 8px));
  height: var(--board-overlay-height, calc(100% - 8px));
  transform: translate(-50%, -50%);
  pointer-events: none;
  background: linear-gradient(90deg, transparent 95%, var(--bg-color)),
    linear-gradient(180deg, transparent 95%, var(--bg-color)), linear-gradient(270deg, transparent 95%, var(--bg-color)),
    linear-gradient(360deg, transparent 95%, var(--bg-color));
}
.page-reverse {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--board-overlay-width, calc(100% - 8px));
  height: var(--board-overlay-height, calc(100% - 8px));
  transform: translate(-50%, -50%);
  pointer-events: none;
  background: linear-gradient(90deg, transparent 95%, var(--bg-color-reverse)),
    linear-gradient(180deg, transparent 95%, var(--bg-color-reverse)),
    linear-gradient(270deg, transparent 95%, var(--bg-color-reverse)),
    linear-gradient(360deg, transparent 95%, var(--bg-color-reverse));
}
.replay-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}
.replay-time {
  font-size: 14px;
  min-width: 100px;
  text-align: center;
}
.button-right-2 {
  align-items: first;
}
</style>
