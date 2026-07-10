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
        <component :is="layout" region="left" :context="modeLayoutContext" />
        <el-button
          class="alert-button"
          type="primary"
          v-if="isHost"
          @click="warnPlayer(roomData.names[0])"
          :disabled="!inGame"
        >
          警告
        </el-button>
        <el-button
          class="alert-button"
          type="primary"
          v-if="isHost && isDualBoard"
          @click="hostSwitchPlayerSide(0)"
          :disabled="!inGame"
        >
          换面
        </el-button>
      </template>

      <template #right>
        <div
          :class="{ 'page-icon': playerBSide === 0, 'page-icon-reverse': playerBSide === 1 }"
          v-if="isDualBoard"
          @click="switchDualBoardSide"
        ></div>
        <component :is="layout" region="right" :context="modeLayoutContext" />
        <el-button
          class="alert-button"
          type="primary"
          v-if="isHost"
          @click="warnPlayer(roomData.names[1])"
          :disabled="!inGame"
        >
          警告
        </el-button>
        <el-button
          class="alert-button"
          type="primary"
          v-if="isHost && isDualBoard"
          @click="hostSwitchPlayerSide(1)"
          :disabled="!inGame"
        >
          换面
        </el-button>
      </template>

      <template #extra>
        <component :is="layout" region="extra" :context="modeLayoutContext" />
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
          <!-- 调速-->
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

          <!-- 回放控制按钮 -->
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
          <!-- 回放进度条-->
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

          <el-button type="primary" @click="confirmExitReplay" style="margin-left: 15px">退出回放</el-button>
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
            <el-button type="primary" v-if="inGame && winFlag === 0" @click="stopGame">结束比赛</el-button>
            <el-button type="primary" v-if="winFlag !== 0" @click="confirmWinner">
              确认：{{ winFlag < 0 ? roomData.names[0] : roomData.names[1] }}获胜
            </el-button>
          </template>

          <template v-if="soloMode && isPlayerA">
            <el-button type="primary" v-if="!inGame && !isBpPhase" @click="startGame">开始比赛</el-button>
            <el-button type="primary" v-if="banPick.phase === 9999" @click="drawSpellCard">抽取符卡</el-button>
            <el-button type="primary" v-if="isBingoLink && winFlag !== 0" @click="confirmWinner">
              确认：{{ winFlag < 0 ? roomData.names[0] : roomData.names[1] }}获胜
            </el-button>
          </template>

          <template v-if="isPlayer">
            <component :is="layout" region="player-actions" :context="modeLayoutContext" />
          </template>

          <template v-if="isBingoLink && isTakeoverActive && isOwner && !isPlayer">
            <component :is="layout" region="takeover-actions" :context="modeLayoutContext" />
          </template>

        </template>

        <template v-else>
          <div>
            <el-button type="primary" @click="editorStore.toggleDatabasePanel">
              {{ editorStore.isDatabasePanelVisible ? "关闭数据库" : "打开数据库" }}
            </el-button>
            <el-button type="primary" @click="editorStore.isPresetManagerVisible = true"> 预设管理 </el-button>
          </div>
        </template>
      </template>

      <template #button-left-1>
        <component
          v-if="!gameStore.isReplayMode && !editorStore.isEditorMode"
          :is="layout"
          region="secondary-actions"
          :context="modeLayoutContext"
        />
        <div v-else-if="editorStore.isEditorMode">
          <el-button type="danger" size="small" @click="handleClearAll">清空格子</el-button>
          <el-button type="warning" size="small" @click="handleShuffleSpells">洗混格子</el-button>
        </div>
      </template>

      <template #button-right-1>
        <div v-if="!gameStore.isReplayMode && !editorStore.isEditorMode">
          <component :is="layout" region="owner-actions" :context="modeLayoutContext" />
        </div>
      </template>

      <template #button-right-2>
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
import { computed, h, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import type { Component } from "vue";
import { BingoType, BpStatus, GameStatus, SpellStatus } from "@/types";
import RoomLayout from "./roomLayout.vue";
import CountDown from "@/components/count-down.vue";
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
import type { RoomModeMenuContext, RoomMenuItem } from "../modes/types";

const props = defineProps<{
  mode: BingoType;
  layout: Component;
  getMenu: (context: RoomModeMenuContext) => RoomMenuItem[];
}>();
const layout = computed(() => props.layout);

const roomStore = useRoomStore();
const gameStore = useGameStore();
const editorStore = useEditorStore();
const replayInstance = Replay;

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
const showLinkAiSpeedrun = computed(() =>
  isBingoLink.value && inGame.value && roomStore.roomConfig.use_ai && isOwner.value
);

const inMatch = computed(() => roomStore.inMatch);
const isBingoStandard = computed(() => props.mode === BingoType.STANDARD);
const isBingoBp = computed(() => props.mode === BingoType.BP);
const isBingoLink = computed(() => props.mode === BingoType.LINK);

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
const menu = computed(() => props.getMenu({
  soloMode: soloMode.value,
  isPlayerA: isPlayerA.value,
  isPlayerB: isPlayerB.value,
  isHost: isHost.value,
}));

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

//赛前BP
const bpCode = ref("");
const banPick = computed(() => roomStore.banPick);
const bpStatus = computed(() => roomStore.bpStatus);

const startBP = () => {
  roomStore.startBanPick();
};
const playerBanPick = () => {
  if (!bpCode.value) {
    ElMessageBox.confirm("你没有选择作品，是否确认不选择？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
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

//标准赛
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
  //计算是否产生了新的四连
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
  //加分的一方收卡音效
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
    //如果没有导播...
    if (winFlag.value !== 0) {
      //单人练习模式允许关闭胜利判定
      if (roomStore.practiceMode && roomSettings.value.noWinningDeclaration) {
        layoutRef.value?.hideAlert();
      } else {
        //否则由左侧玩家决定胜负
        layoutRef.value?.showAlert("已满足胜利条件，等待左侧玩家判断胜负", "red");
      }
    } else {
      layoutRef.value?.hideAlert();
    }
  }
  if (!soloMode.value && !isHost.value) {
    if (winFlag.value !== 0) {
      layoutRef.value?.showAlert("已满足胜利条件，等待房主判断胜负", "red");
    } else {
      layoutRef.value?.hideAlert();
    }
  }
};

//BP赛
const isMyTurn = computed(
  () =>
    (isPlayerA.value && gameStore.bpGameData.whose_turn === 0) ||
    (isPlayerB.value && gameStore.bpGameData.whose_turn === 1)
);
const bingoBpPhase = computed(() => gameStore.bpGameData.ban_pick !== 2);
//总失败次数
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

  //加分的一方收卡音效
  if ((playerAScore.value < scoreA && isPlayerA.value) || (playerBScore.value < scoreB && isPlayerB.value)) {
    layoutRef.value?.infoCaptureCard();
  }
  playerAScore.value = scoreA;
  playerBScore.value = scoreB;

  //失败的一方爆点音效
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
      layoutRef.value?.showAlert("已满足胜利条件，等待房主判断胜负", "red");
    } else {
      layoutRef.value?.hideAlert();
    }
  }
};

// link赛
const linkData = computed(() => gameStore.linkGameData);
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
const linkEndA = computed(() => roomStore.roomConfig.link_end_a ?? boardSpec.value.area - 1);
const linkEndB = computed(() => roomStore.roomConfig.link_end_b ?? boardSpec.value.index(boardSpec.value.size - 1, 0));
const myLinkRouteConfirmed = computed(() => {
  const idx = myEffectivePlayerIndex.value;
  if (idx !== null) return linkConfirmedForPlayer(idx);
  return isPlayerA.value ? linkData.value.route_confirmed_a : linkData.value.route_confirmed_b;
});
const controlledLinkPlayer = computed<0 | 1 | null>(() => {
  const takeover = takeoverPlayerIndex.value;
  if (takeover >= 0 && isOwner.value) return takeover as 0 | 1;
  if (isHost.value) return null;
  if (isPlayerA.value) return 0;
  if (isPlayerB.value) return 1;
  return null;
});
const myEffectivePlayerIndex = computed<0 | 1 | null>(() => {
  const takeover = takeoverPlayerIndex.value;
  if (takeover >= 0 && isOwner.value) return takeover as 0 | 1;
  if (isPlayerA.value) return 0;
  if (isPlayerB.value) return 1;
  return null;
});
const linkRouteForPlayer = (playerIndex: 0 | 1) => (playerIndex === 0 ? routeA.value : routeB.value);
const linkConfirmedForPlayer = (playerIndex: 0 | 1) =>
  playerIndex === 0 ? linkData.value.route_confirmed_a : linkData.value.route_confirmed_b;
const linkEndForPlayer = (playerIndex: 0 | 1) => (playerIndex === 0 ? linkEndA.value : linkEndB.value);
const linkRouteComplete = computed(() => {
  const idx = myEffectivePlayerIndex.value ?? (isPlayerA.value ? 0 : 1);
  const route = linkRouteForPlayer(idx);
  const end = linkEndForPlayer(idx);
  return route.length > 0 && route[route.length - 1] === end;
});
const bothLinkRoutesConfirmed = computed(() => linkData.value.route_confirmed_a && linkData.value.route_confirmed_b);
const myLinkFinished = computed(() => (isPlayerA.value ? linkData.value.event_a === 3 : linkData.value.event_b === 3));
const myLinkLastGetTime = computed(() => (isPlayerA.value ? linkData.value.last_get_time_a : linkData.value.last_get_time_b));
const linkSkipLimit = (route: number[]) => route.length > 10 ? 2 : 1;
const linkSkipRemainA = computed(() => Math.max(0, linkSkipLimit(routeA.value) - (linkData.value.skip_used_a || 0)));
const linkSkipRemainB = computed(() => Math.max(0, linkSkipLimit(routeB.value) - (linkData.value.skip_used_b || 0)));
const canManageLinkA = computed(() => isBingoLink.value && (isHost.value || (!roomData.value.host && isPlayerA.value)));
const canManageLinkB = computed(() => isBingoLink.value && (isHost.value || (!roomData.value.host && isPlayerB.value)));
// Use ref+watch instead of computed to avoid Vue computed caching issues with reactive object properties
const takeoverPlayerIndex = ref(gameStore.linkGameData.takeover_player_index ?? -1);
const takeoverUiKey = ref(0);
watch(
  () => [
    gameStore.linkGameData.takeover_player_index,
    gameStore.linkGameData.route_confirmed_a,
    gameStore.linkGameData.route_confirmed_b,
  ],
  ([takeover]) => {
    takeoverPlayerIndex.value = takeover ?? -1;
    takeoverUiKey.value++;
  }
);
const isTakeoverActive = computed(() => takeoverPlayerIndex.value >= 0);
const canTakeover = computed(() => isBingoLink.value && linkPhase.value === 1 && isOwner.value);
const linkPlayerFinished = (playerIndex: 0 | 1) => playerIndex === 0 ? linkData.value.event_a === 3 : linkData.value.event_b === 3;
const linkCurrentStepForPlayer = (playerIndex: 0 | 1) => playerIndex === 0 ? linkData.value.current_step_a || 0 : linkData.value.current_step_b || 0;
const linkCurrentIndexForPlayer = (playerIndex: 0 | 1) => linkRouteForPlayer(playerIndex)[linkCurrentStepForPlayer(playerIndex)] ?? -1;
const linkCurrentSelectedForPlayer = (playerIndex: 0 | 1) => {
  const idx = linkCurrentIndexForPlayer(playerIndex);
  if (idx < 0) return false;
  const status = playerIndex === 0 ? linkData.value.status_a?.[idx] : linkData.value.status_b?.[idx];
  return status === (playerIndex === 0 ? 1 : 3);
};
const myLinkCurrentSelected = computed(() => controlledLinkPlayer.value != null && linkCurrentSelectedForPlayer(controlledLinkPlayer.value));
const linkNow = ref(Date.now());
const getLinkNow = () => gameStore.isReplayMode ? replayInstance.getReplayWallTime() : Date.now();
const linkCooldown = computed(() => {
  if (linkPhase.value !== 2) return -1;
  const cd = isPlayerA.value ? roomStore.actualCdTimeA : roomStore.actualCdTimeB;
  return Math.max(0, myLinkLastGetTime.value + cd - linkNow.value);
});
const canLinkSkip = computed(() => {
  if (controlledLinkPlayer.value == null) return false;
  return canLinkSkipForPlayer(controlledLinkPlayer.value);
});
const linkSkipUsedForPlayer = (playerIndex: 0 | 1) =>
  playerIndex === 0 ? linkData.value.skip_used_a || 0 : linkData.value.skip_used_b || 0;
const linkSkipWaitLeftForPlayer = (playerIndex: 0 | 1) => {
  const route = linkRouteForPlayer(playerIndex);
  const step = linkCurrentStepForPlayer(playerIndex);
  if (step >= route.length) return 0;
  const spell = gameStore.spells[route[step]];
  if (!spell) return 0;
  const lastGet = playerIndex === 0 ? linkData.value.last_get_time_a : linkData.value.last_get_time_b;
  return Math.max(0, lastGet + linkCdForPlayer(playerIndex) + 45_000 - linkNow.value);
};
const linkSkipButtonText = computed(() => {
  if (controlledLinkPlayer.value == null) return "跳过";
  const playerIndex = controlledLinkPlayer.value;
  const route = linkRouteForPlayer(playerIndex);
  if (linkSkipUsedForPlayer(playerIndex) >= linkSkipLimit(route)) return "无跳过次数";
  const cdLeft = linkCdLeftForPlayer(playerIndex);
  if (cdLeft > 0) return `CD ${Math.ceil(cdLeft / 1000)}秒`;
  const waitLeft = linkSkipWaitLeftForPlayer(playerIndex);
  if (waitLeft > 0) return `${Math.ceil(waitLeft / 1000)}秒后可跳过`;
  return "跳过";
});
const canLinkSkipForPlayer = (playerIndex: 0 | 1) => {
  const route = linkRouteForPlayer(playerIndex);
  const step = linkCurrentStepForPlayer(playerIndex);
  if (step >= route.length) return false;
  if (linkCdLeftForPlayer(playerIndex) > 0) return false;
  if (linkSkipUsedForPlayer(playerIndex) >= linkSkipLimit(route)) return false;
  return linkSkipWaitLeftForPlayer(playerIndex) <= 0;
};

const linkCdForPlayer = (playerIndex: 0 | 1) => playerIndex === 0 ? roomStore.actualCdTimeA : roomStore.actualCdTimeB;
const linkActiveUsedMs = (playerIndex: 0 | 1, step: number, event: number, start: number, end: number, now: number) => {
  if (start <= 0) return 0;
  const stop = event === 3 && end > 0 ? end : now;
  const elapsed = Math.max(0, stop - start);
  const cd = Math.max(0, linkCdForPlayer(playerIndex));
  const completedCd = Math.max(0, step - 1) * cd;
  const lastGet = playerIndex === 0 ? linkData.value.last_get_time_a : linkData.value.last_get_time_b;
  const currentCd = event === 3 || step <= 0 || lastGet <= 0 ? 0 : Math.min(cd, Math.max(0, stop - lastGet));
  return Math.max(0, elapsed - completedCd - currentCd);
};
const linkEffectiveUsedMsA = computed(() =>
  linkActiveUsedMs(
    0,
    linkData.value.current_step_a || 0,
    linkData.value.event_a,
    linkData.value.start_ms_a,
    linkData.value.end_ms_a,
    linkNow.value
  )
);
const linkEffectiveUsedMsB = computed(() =>
  linkActiveUsedMs(
    1,
    linkData.value.current_step_b || 0,
    linkData.value.event_b,
    linkData.value.start_ms_b,
    linkData.value.end_ms_b,
    linkNow.value
  )
);
const linkCdLeftForPlayer = (playerIndex: 0 | 1) => {
  const data = linkData.value;
  const event = playerIndex === 0 ? data.event_a : data.event_b;
  if (event !== 1) return 0;
  const step = playerIndex === 0 ? data.current_step_a || 0 : data.current_step_b || 0;
  if (step <= 0) return 0;
  const lastGet = playerIndex === 0 ? data.last_get_time_a : data.last_get_time_b;
  if (lastGet <= 0) return 0;
  return Math.max(0, lastGet + linkCdForPlayer(playerIndex) - linkNow.value);
};
const linkCdLeftA = computed(() => linkCdLeftForPlayer(0));
const linkCdLeftB = computed(() => linkCdLeftForPlayer(1));
const formatLinkDuration = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const decideLink = () => {
  const now = getLinkNow();
  const liveScore = (playerIndex: 0 | 1) => {
    const route = playerIndex === 0 ? routeA.value : routeB.value;
    const step = playerIndex === 0 ? linkData.value.current_step_a || 0 : linkData.value.current_step_b || 0;
    const start = playerIndex === 0 ? linkData.value.start_ms_a : linkData.value.start_ms_b;
    const end = playerIndex === 0 ? linkData.value.end_ms_a : linkData.value.end_ms_b;
    const event = playerIndex === 0 ? linkData.value.event_a : linkData.value.event_b;
    const skipped = new Set(playerIndex === 0 ? linkData.value.skipped_idx_a || [] : linkData.value.skipped_idx_b || []);
    const taken = route.slice(0, step).filter((idx) => !skipped.has(idx));
    const level = taken.reduce((sum, idx) => sum + (gameStore.spells[idx]?.star || 0), 0);
    const fastest = taken.reduce((sum, idx) => sum + (gameStore.spells[idx]?.fastest || 0), 0);
    const usedMs = linkActiveUsedMs(playerIndex, step, event, start, end, now);
    return (
      boardSpec.value.size * 200 +
      level * (roomStore.roomConfig.link_level_coefficient ?? 2) +
      fastest * (roomStore.roomConfig.link_fastest_coefficient ?? 1) -
      usedMs / 1000
    );
  };
  playerAScore.value = Math.round(liveScore(0) * 10) / 10;
  playerBScore.value = Math.round(liveScore(1) * 10) / 10;
  const skippedA = new Set(linkData.value.skipped_idx_a || []);
  const skippedB = new Set(linkData.value.skipped_idx_b || []);
  playerALevel.value = routeA.value.slice(0, linkData.value.current_step_a || 0).reduce((sum, idx) => {
    if (skippedA.has(idx)) return sum;
    return sum + (gameStore.spells[idx]?.star || 0);
  }, 0);
  playerBLevel.value = routeB.value.slice(0, linkData.value.current_step_b || 0).reduce((sum, idx) => {
    if (skippedB.has(idx)) return sum;
    return sum + (gameStore.spells[idx]?.star || 0);
  }, 0);
  if (linkData.value.event_a === 3 && linkData.value.event_b === 3) {
    winFlag.value = (linkData.value.score_a || 0) >= (linkData.value.score_b || 0) ? -30 : 30;
    if (!isOwner.value) layoutRef.value?.showAlert("双方已完成，等待确认胜负", "red");
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
  if (!canLinkSkip.value) return;
  gameStore.linkSkipCard();
};
const forceLinkSkip = (playerIndex: 0 | 1) => {
  if (linkCdLeftForPlayer(playerIndex) > 0 || linkPlayerFinished(playerIndex)) return;
  gameStore.linkForceSkip(playerIndex);
};
const undoLinkFinish = (playerIndex: 0 | 1) => {
  gameStore.linkUndoFinish(playerIndex);
};
const setLinkSkipRemain = (playerIndex: 0 | 1, remain: number) => {
  const route = playerIndex === 0 ? routeA.value : routeB.value;
  const limit = linkSkipLimit(route);
  gameStore.linkSetSkipUsed(playerIndex, Math.max(0, Math.min(limit, limit - remain)));
};
const linkAiSpeedrun = () => {
  gameStore.linkAiSpeedrun();
};
const takeoverRoute = (playerIndex: number) => {
  gameStore.linkTakeoverRoute(playerIndex);
};
const releaseTakeover = () => {
  gameStore.linkReleaseTakeover();
};

const lastLinkStepA = ref(0);
const lastLinkStepB = ref(0);
const linkStepSoundInited = ref(false);
const resetLocalGameState = () => {
  countdownRef.value?.pause();
  gameModeSelectedSpellIndex.value = -1;
  winFlag.value = 0;
  playerAScore.value = 0;
  playerBScore.value = 0;
  playerAFailure.value = 0;
  playerBFailure.value = 0;
  playerALevel.value = 0;
  playerBLevel.value = 0;
  lastLinkStepA.value = 0;
  lastLinkStepB.value = 0;
  linkStepSoundInited.value = false;
  linkNow.value = getLinkNow();
};
watch(
  () => gameStore.linkGameData,
  () => {
    if (isBingoLink.value) decideLink();
    const stepA = gameStore.linkGameData.current_step_a || 0;
    const stepB = gameStore.linkGameData.current_step_b || 0;
    if (linkStepSoundInited.value && ((isPlayerA.value && stepA > lastLinkStepA.value) || (isPlayerB.value && stepB > lastLinkStepB.value))) {
      layoutRef.value?.infoCaptureCard();
    }
    lastLinkStepA.value = stepA;
    lastLinkStepB.value = stepB;
    linkStepSoundInited.value = true;
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
        linkNow.value = getLinkNow();
        decideLink();
      }, 1000);
    }
  },
  { immediate: true }
);

watch(
  () => gameStore.gameStatus,
  (newVal) => {
    switch (newVal) {
      case GameStatus.NOT_STARTED:
        resetLocalGameState();
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
        layoutRef.value?.showAlert("比赛已结束，等待房主操作", "red");
        // ElMessageBox.alert(`${roomData.value.last_winner}获胜`, "比赛结束", {
        //   confirmButtonText: "确定",
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

//方法
const startGame = () => {
  if (roomSettings.value.gamebp && (!roomSettings.value.matchbp || !inMatch.value)) {
    startBP();
  } else {
    roomStore.applyCustomCardPoolSelection();
    gameStore.startGame(roomStore.getStartGameCustomPoolData()).then(() => {
      roomStore.updateChangeCardCount(roomData.value.names[0], roomSettings.value.playerA.changeCardCount);
      roomStore.updateChangeCardCount(roomData.value.names[1], roomSettings.value.playerB.changeCardCount);
      if (isBingoLink.value) gameStore.linkSetPhase(1);
      if (isBingoLink.value) {
        countdownRef.value?.stop();
        gameStore.gameStatus = GameStatus.COUNT_DOWN;
        gameStore.leftTime = roomConfig.value.countdown * 1000;
        nextTick(() => countdownRef.value?.start());
      }
      layoutRef.value?.hideAlert();
    });
  }
};
const drawSpellCard = () => {
  roomStore.applyCustomCardPoolSelection();
  gameStore.startGame(roomStore.getStartGameCustomPoolData()).then(() => {
    roomStore.updateChangeCardCount(roomData.value.names[0], roomSettings.value.playerA.changeCardCount);
    roomStore.updateChangeCardCount(roomData.value.names[1], roomSettings.value.playerB.changeCardCount);
    layoutRef.value?.hideAlert();
  });
};
const stopGame = () => {
  const checked = ref<1 | 0 | -1>(-1);
  ElMessageBox({
    title: "还没有人获胜，现在结束比赛请选择一个选项",
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
              default: () => "结果作废",
            }
          ),
          h(
            ElRadio,
            {
              value: 0,
            },
            {
              default: () => roomData.value.names[0] + "获胜",
            }
          ),
          h(
            ElRadio,
            {
              value: 1,
            },
            {
              default: () => roomData.value.names[1] + "获胜",
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
  if (isBingoLink.value) {
    if (linkPhase.value === 1) {
      gameStore.gameStatus = GameStatus.STARTED;
      if (isOwner.value) {
        gameStore.linkSetPhase(2);
      }
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
      layoutRef.value?.showAlert("游戏时间到，等待房主判断胜负", "red");
    } else {
      layoutRef.value?.showAlert("游戏时间到，等待左侧玩家判断胜负", "red");
    }
  }
};
const resetRoom = () => {
  ElMessageBox.confirm("该操作会把房间恢复到初始状态，是否确认？", "警告", {
    confirmButtonText: "确认",
    cancelButtonText: "取消",
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
  //仅倒计时期间且未实际选择时允许实际的盘面转换
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
    confirmButtonText: "确认",
    cancelButtonText: "取消",
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
//不是选手，始终为查看模式
//是选手，只有倒计时期间且未实际选卡才可自由切换，其余情况以服务端为准
const boardNotDecided = () => {
  if (gameStore.isReplayMode) return false;
  return isPlayer.value && gameStore.gameStatus === GameStatus.COUNT_DOWN && !spellCardSelected.value;
};
//不允许自由切换时，判断选手是否与服务端最近返回的数据相符
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
      // 当新的回放开始时，将 UI 滑块的位置重置为 1
      replaySpeed.value = 1;
    }
  }
);
// 切换回放播放/暂停
const toggleReplay = () => {
  if (replayInstance.state.isReplayFinished) {
    return; // 如果已经结束，不做任何事
  }
  layoutRef.value?.hideAlert();
  if (replayInstance.state.isPlaying) {
    replayInstance.pauseReplay();
  } else {
    replayInstance.resumeReplay();
  }
};
// 改变回放速度
const changeReplaySpeed = (value: number) => {
  const newSpeed = speedValues[value - 1];
  if (newSpeed) {
    replayInstance.setSpeed(newSpeed);
  } else {
    console.error(`Invalid slider value received: ${value}`);
  }
};

// 格式化回放时间显示
const formatReplayTime = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

// 确认退出回放(保持不变)
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

// 计算属性，用于向模态框传递数据
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

// 处理模态框确认事件
const handleEditorConfirm = (payload) => {
  const index = editorStore.selectedSpellIndex;
  editorStore.updateSpell({ index, spellData: payload.spellData });
  editorStore.updateSpellStatus({ index, status: payload.status });
  editorStore.updatePortalStatus({ index, isPortal: payload.isPortal });
  editorStore.closeModal();
};

// 处理模态框清空事件
const handleEditorClear = () => {
  editorStore.clearSpell(editorStore.selectedSpellIndex);
  editorStore.closeModal();
};

// --- 键盘快捷键---
const handleKeyDown = (e: KeyboardEvent) => {
  if (!editorStore.isEditorMode || editorStore.selectedSpellIndex === -1) return;

  // 检查是否在输入框内，避免冲突
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
    confirmButtonText: "确认清空",
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
    confirmButtonText: "确认洗混",
    cancelButtonText: "取消",
  })
    .then(() => {
      const result = editorStore.shuffleSpells();
      if (result.success) {
        ElMessage.success(result.message);
      }
    })
    .catch(() => {});
};

const setPlayerScore = (playerIndex: 0 | 1, value: number) => {
  if (playerIndex === 0) playerAScore.value = value;
  else playerBScore.value = value;
};
const setPlayerLevel = (playerIndex: 0 | 1, value: number) => {
  if (playerIndex === 0) playerALevel.value = value;
  else playerBLevel.value = value;
};
const setChangeCardCount = (playerIndex: 0 | 1, value: number) => {
  roomData.value.change_card_count[playerIndex] = value;
};
const setBpCode = (value: string) => {
  bpCode.value = value;
};

const modeLayoutContext = reactive({
  roomData,
  roomSettings,
  gameStore,
  editorStore,
  soloMode,
  isHost,
  isPlayer,
  isPlayerA,
  isPlayerB,
  isOwner,
  inGame,
  playerAScore,
  playerBScore,
  playerALevel,
  playerBLevel,
  setPlayerScore,
  setPlayerLevel,
  setChangeCardCount,
  addChangeCardCount,
  removeChangeCardCount,
  currentBoardLevelTotal,
  currentBoardRemainingLevel,
  isBpPhase,
  bpCode,
  setBpCode,
  spellCardSelected,
  selectedSpellIndex,
  gamePaused,
  selectCooldown,
  setCdTime,
  confirmSelect,
  confirmAttained,
  banPick,
  playerACanBP,
  playerBCanBP,
  playerBanPick,
  confirmOpenEX,
  bpStatus,
  startBP,
  isMyTurn,
  bingoBpPhase,
  confirmBp,
  nextRound,
  stopGame,
  resetRoom,
  pauseGame,
  resumeGame,
  linkData,
  linkPhase,
  routeA,
  routeB,
  linkRouteScoreA,
  linkRouteScoreB,
  linkRouteFastestA,
  linkRouteFastestB,
  linkEffectiveUsedMsA,
  linkEffectiveUsedMsB,
  linkCdLeftA,
  linkCdLeftB,
  linkSkipRemainA,
  linkSkipRemainB,
  linkSkipLimit,
  setLinkSkipRemain,
  canManageLinkA,
  canManageLinkB,
  formatLinkDuration,
  forceLinkSkip,
  undoLinkFinish,
  linkPlayerFinished,
  canTakeover,
  takeoverPlayerIndex,
  takeoverUiKey,
  takeoverRoute,
  releaseTakeover,
  showLinkAiSpeedrun,
  linkAiSpeedrun,
  linkRouteComplete,
  myLinkRouteConfirmed,
  confirmLinkRoute,
  myLinkFinished,
  myLinkCurrentSelected,
  linkCooldown,
  linkNextCard,
  linkFinishCard,
  canLinkSkip,
  linkSkipCard,
  linkSkipButtonText,
  bothLinkRoutesConfirmed,
  isTakeoverActive,
  startLinkRun,
  linkUndo,
});

</script>

<style lang="scss" scoped>
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
