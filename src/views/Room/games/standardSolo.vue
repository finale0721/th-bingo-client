<!-- eslint-disable vue/no-parsing-error -->
<template>
  <div class="rule-standard">
    <el-row>
      <el-col :span="4">
        <div class="player-extra-info" v-if="roomData.started">
          <div class="player-extra-info-inner">
            <div class="change-card">
              <div class="change-card-number">
                <div class="change-card-number-btn" v-if="!isWatcher">
                  <el-button
                    :disabled="roomData.change_card_count[0] <= 0"
                    type="primary"
                    link
                    :icon="Minus"
                    @click="removeChangeCardCount(0)"
                  />
                </div>
                <div class="change-card-number-info">{{ roomData.change_card_count[0] }}</div>
                <div class="change-card-number-btn" v-if="!isWatcher">
                  <el-button type="primary" link :icon="Plus" @click="addChangeCardCount(0)" />
                </div>
              </div>
              <div class="change-card-text">换卡次数</div>
            </div>
            <div class="spell-card-score">
              <div class="spell-card-score-number">
                <div class="spell-card-score-number-info">{{ playerAScore }}</div>
              </div>
              <div class="spell-card-score-text">得分</div>
            </div>
          </div>
        </div>
      </el-col>
      <el-col :span="16">
        <div class="bingo-wrap">
          <right-click-menu style="width: 100%; height: 100%" :menuData="menuData" @click="onMenuClick">
            <div class="bingo-items">
              <template v-if="gameData.spells">
                <div class="spell-card" v-for="(item, index) in gameData.spells" :key="index">
                  <spell-card-cell
                    :name="item.name"
                    :desc="item.desc"
                    @click="selectSpellCard(index)"
                    :selected="selectedSpellIndex === index"
                    :status="gameData.status[index]"
                    :index="index"
                  ></spell-card-cell>
                </div>
              </template>
            </div>
          </right-click-menu>
          <div v-if="!inGame || winFlag !== 0 || gamePaused" class="game-alert">
            <div :style="{ color: alertInfoColor }">{{ alertInfo }}</div>
          </div>
          <bingo-effect class="bingo-effect" />
        </div>
        <div class="count-down-wrap">
          <count-down
            ref="countdown"
            v-model="countdownSeconds"
            @complete="onCountDownComplete"
            v-show="inGame"
          ></count-down>
        </div>
        <div class="host-buttons">
          <el-button v-if="isPlayerA && !inGame" size="small" @click="resetRoom">重置房间</el-button>
          <el-button v-if="isPlayerA && inGame" size="small" @click="stop">结束比赛</el-button>
          <template v-if="inGame">
            <confirm-select-button
              @click="confirmSelect"
              :disabled="selectedSpellIndex < 0 || gamePaused"
              v-if="!spellCardSelected"
              :cooldown="gameData.cdTime || 30"
              :startTime="cooldownStartTime"
              :immediate="gamePhase > 1"
              text="选择符卡"
            ></confirm-select-button>
            <confirm-select-button
              @click="confirmAttained"
              v-if="spellCardSelected"
              :disabled="gamePhase < 2 || gamePaused"
              :cooldown="roomSettings.confirmDelay"
              text="确认收取"
            ></confirm-select-button>
          </template>
          <el-button v-if="isPlayerA && !inGame" type="primary" @click="start">开始比赛</el-button>
          <el-button v-if="isPlayerA" size="small" @click="pause" :disabled="gamePhase !== 2">{{
            gamePaused ? "继续比赛" : "暂停比赛"
          }}</el-button>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="player-extra-info" v-if="roomData.started">
          <div class="player-extra-info-inner">
            <div class="change-card">
              <div class="change-card-number">
                <div class="change-card-number-btn" v-if="!isWatcher">
                  <el-button
                    :disabled="roomData.change_card_count[1] <= 0"
                    type="primary"
                    link
                    :icon="Minus"
                    @click="removeChangeCardCount(1)"
                  />
                </div>
                <div class="change-card-number-info">{{ roomData.change_card_count[1] }}</div>
                <div class="change-card-number-btn" v-if="!isWatcher">
                  <el-button type="primary" link :icon="Plus" @click="addChangeCardCount(1)" />
                </div>
              </div>
              <div class="change-card-text">换卡次数</div>
            </div>
            <div class="spell-card-score">
              <div class="spell-card-score-number">
                <div class="spell-card-score-number-info">{{ playerBScore }}</div>
              </div>
              <div class="spell-card-score-text">得分</div>
            </div>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, ref, h, getCurrentInstance } from "vue";
import SpellCardCell from "@/components/spell-card-cell.vue";
import RightClickMenu from "@/components/right-click-menu.vue";
import BingoEffect from "@/components/bingo-effect/index.vue";
import CountDown from "@/components/count-down.vue";
import ConfirmSelectButton from "@/components/button-with-cooldown.vue";
import { ElButton, ElMessageBox, ElRadio, ElRadioGroup, ElRow, ElCol } from "element-plus";
import { Minus, Plus } from "@element-plus/icons-vue";

export default defineComponent({
  name: "Room",
  data() {
    return {
      countdownSeconds: 0,
      selectedSpellIndex: -1,
      winFlag: 0,
      audioPlaying: false,
      alertInfo: "等待左侧玩家开始比赛",
      alertInfoColor: "#000",
      cardCount: [2, 2],
      oldSumArr: [] as number[],
      playerAScore: 0,
      playerBScore: 0,
      enableConfirm: true,
    };
  },

  components: {
    SpellCardCell,
    BingoEffect,
    CountDown,
    ElButton,
    RightClickMenu,
    ElRow,
    ElCol,
    ConfirmSelectButton,
  },
  setup() {
    // const countdown = ref();
    // const spellCardGrabbedAudio = ref();
    // const { proxy }: any = getCurrentInstance();

    // return {
    //   timeMistake: computed(() => store.getters.heartBeat.timeMistake),
    //   gameData: computed(() => store.getters.gameData),
    //   roomData: computed(() => store.getters.roomData),
    //   roomSettings: computed(() => store.getters.roomSettings),
    //   inRoom: computed(() => store.getters.inRoom),
    //   inGame: computed(() => store.getters.inGame),
    //   gamePaused: computed(() => store.getters.gamePaused),
    //   isPlayerA: computed(() => store.getters.isPlayerA),
    //   isPlayerB: computed(() => store.getters.isPlayerB),
    //   isWatcher: computed(() => store.getters.isWatcher),
    //   playerASelectedIndex: computed(() => store.getters.playerASelectedIndex),
    //   playerBSelectedIndex: computed(() => store.getters.playerBSelectedIndex),
    //   gamePhase: computed(() => store.getters.gameData.phase || 0),
    //   spellCardSelected: computed(() => {
    //     if (store.getters.isPlayerA) {
    //       return store.getters.playerASelectedIndex !== -1;
    //     }
    //     if (store.getters.isPlayerB) {
    //       return store.getters.playerBSelectedIndex !== -1;
    //     }
    //     return false;
    //   }),
    //   cooldownStartTime: computed(() => {
    //     const lastGetTime = store.getters.gameData.last_get_time;
    //     if (store.getters.isPlayerA) {
    //       return lastGetTime[0];
    //     } else if (store.getters.isPlayerB) {
    //       return lastGetTime[1];
    //     } else {
    //       return 0;
    //     }
    //   }),
    //   menuData: computed(() => {
    //     if (proxy.isPlayerA) {
    //       return [
    //         {
    //           label: "置空",
    //           value: 0,
    //         },
    //         {
    //           label: "选择",
    //           value: 1,
    //           tag: "playerA",
    //         },
    //         {
    //           label: "收取",
    //           value: 5,
    //           tag: "playerA",
    //         },
    //       ];
    //     }
    //     if (proxy.isPlayerB) {
    //       return [
    //         {
    //           label: "置空",
    //           value: 0,
    //         },
    //         {
    //           label: "选择",
    //           value: 3,
    //           tag: "playerB",
    //         },
    //         {
    //           label: "收取",
    //           value: 7,
    //           tag: "playerB",
    //         },
    //       ];
    //     }
    //     return [];
    //   }),
    //   countdown,
    //   spellCardGrabbedAudio,
    //   Minus,
    //   Plus,
    // };
  },
  // watch: {
  //   gameData(value, oldValue) {
  //     if (value.start_time) {
  //       const pauseBeginTime = value.pause_begin_ms || null;
  //       const currentTime = new Date().getTime() + this.timeMistake;
  //       const startTime = value.start_time;
  //       const totalPauseTime = value.total_pause_time || 0;

  //       let pasedTime;
  //       if (pauseBeginTime) {
  //         pasedTime = (pauseBeginTime - startTime - totalPauseTime) / 1000;
  //       } else {
  //         pasedTime = (currentTime - startTime - totalPauseTime) / 1000;
  //       }
  //       const standbyCountDown = this.roomData.room_config.countdown - pasedTime;
  //       const gameCountDown = this.roomData.room_config.game_time * 60 - pasedTime;
  //       if (standbyCountDown > 0) {
  //         this.countdownSeconds = Math.ceil(standbyCountDown);
  //         this.$nextTick(() => {
  //           this.countdown.start();
  //         });
  //       } else {
  //         if (this.isPlayerA && value.phase < 2) {
  //           this.$store.dispatch("set_phase", { phase: 2 });
  //         }
  //         this.countdownSeconds = Math.ceil(gameCountDown);
  //         if (!value.pause_begin_ms) {
  //           this.$nextTick(() => {
  //             this.countdown.start();
  //           });
  //         }
  //       }
  //     } else {
  //       this.$store.commit("change_game_state", false);
  //     }

  //     if (value.phase === 2 && oldValue.phase === 1) {
  //       this.$store.dispatch("get_spells");
  //     }

  //     const status = value.status;
  //     if (status && status.length) {
  //       if (status[this.selectedSpellIndex] !== 0) {
  //         this.selectedSpellIndex = -1;
  //       }

  //       const available: number[] = new Array(12).fill(2);
  //       const sumArr: number[] = new Array(12).fill(0);
  //       this.winFlag = 0;
  //       let countA = 0;
  //       let countB = 0;
  //       let scoreA = 0;
  //       let scoreB = 0;
  //       status.forEach((item: number, index: number) => {
  //         const rowIndex = Math.floor(index / 5);
  //         const columnIndex = index % 5;
  //         if (item === 5) {
  //           countA++;
  //           scoreA += 1;
  //           if (available[rowIndex] > 0) available[rowIndex] -= 2;
  //           if (available[columnIndex + 5] > 0) available[columnIndex + 5] -= 2;
  //           sumArr[rowIndex] -= 1;
  //           sumArr[columnIndex + 5] -= 1;
  //           if (index % 6 === 0) {
  //             sumArr[10] -= 1;
  //             if (available[10] > 0) available[10] -= 2;
  //           }
  //           if (index && index !== 24 && index % 4 === 0) {
  //             sumArr[11] -= 1;
  //             if (available[11] > 0) available[11] -= 2;
  //           }
  //         } else if (item === 7) {
  //           countB++;
  //           scoreB += 1;
  //           if (available[rowIndex] % 2 === 0) available[rowIndex] -= 1;
  //           if (available[columnIndex + 5] % 2 === 0) available[columnIndex + 5] -= 1;
  //           sumArr[rowIndex] += 1;
  //           sumArr[columnIndex + 5] += 1;
  //           if (index % 6 === 0) {
  //             sumArr[10] += 1;
  //             if (available[10] % 2 === 0) available[10] -= 1;
  //           }
  //           if (index && index !== 24 && index % 4 === 0) {
  //             sumArr[11] += 1;
  //             if (available[11] % 2 === 0) available[11] -= 1;
  //           }
  //         }
  //       });

  //       let gamePointFlag = false;
  //       for (let i = 0; i < 12; i++) {
  //         if (sumArr[i] === -5) {
  //           this.winFlag = -(i + 1);
  //           break;
  //         } else if (sumArr[i] === 5) {
  //           this.winFlag = i + 1;
  //           break;
  //         } else if (
  //           (sumArr[i] === -4 && this.oldSumArr[i] > -4 && this.isPlayerB) ||
  //           (sumArr[i] === 4 && this.oldSumArr[i] < 4 && this.isPlayerA)
  //         ) {
  //           gamePointFlag = true;
  //         }
  //       }
  //       if (gamePointFlag) {
  //         this.$bus.emit("game_point");
  //       }
  //       this.oldSumArr = sumArr;

  //       this.playerAScore = scoreA;
  //       this.playerBScore = scoreB;

  //       if (countA >= 13) {
  //         this.winFlag = -13;
  //       }
  //       if (countB >= 13) {
  //         this.winFlag = 13;
  //       }
  //       if (this.winFlag !== 0 && this.isPlayerA) {
  //         this.confirmWinner();
  //       }
  //     }
  //   },
  //   roomData(value) {
  //     if (!value.started) {
  //       this.alertInfo = "等待左侧玩家开始比赛";
  //       this.alertInfoColor = "#000";
  //     }
  //     if (value.winner !== undefined) {
  //       ElMessageBox.alert(`${this.roomData.names[value.winner]}获胜`, "比赛结束", {
  //         confirmButtonText: "确定",
  //       });
  //       delete value.winner;
  //     }
  //     this.cardCount = value.change_card_count;
  //   },
  //   inGame(value) {
  //     if (!value) {
  //       this.countdownSeconds = 0;
  //     }
  //   },
  //   gamePaused(value) {
  //     if (value) {
  //       this.alertInfo = "游戏已暂停";
  //       this.alertInfoColor = "#000";
  //       this.countdown.pause();
  //     } else {
  //       this.countdown.start();
  //     }
  //   },
  //   spellCardSelected(value) {
  //     if (value) {
  //       this.enableConfirm = false;
  //     }
  //   },
  // },
  // methods: {
  //   start() {
  //     this.$store
  //       .dispatch("update_room_config", {
  //         room_config: {
  //           game_time: this.roomSettings.gameTimeLimit,
  //           countdown: this.roomSettings.countdownTime,
  //           cd_time: this.roomSettings.cdTime,
  //           games: this.roomSettings.checkList,
  //           ranks: this.roomSettings.rankList,
  //           difficulty: this.roomSettings.difficulty,
  //           need_win: (this.roomSettings.format + 1) / 2,
  //           is_private: this.roomSettings.private,
  //         },
  //       })
  //       .then(() => {
  //         this.$store.dispatch("start_game").then(() => {
  //           this.$store.dispatch("change_card_count", {
  //             cnt: [this.roomSettings.playerA.changeCardCount, this.roomSettings.playerB.changeCardCount],
  //           });
  //           this.$store.commit("change_game_state", true);
  //           this.$store.dispatch("set_phase", { phase: 1 }).then(() => {
  //             this.countdown.start();
  //           });
  //         });
  //       });
  //   },
  //   stop() {
  //     // if (this.winFlag === 0) {
  //     //   const checked = ref<boolean | string | number>(-1);
  //     //   ElMessageBox({
  //     //     title: "还没有人获胜，现在结束比赛请选择一个选项",
  //     //     message: () =>
  //     //       h(
  //     //         ElRadioGroup,
  //     //         {
  //     //           modelValue: checked.value,
  //     //           "onUpdate:modelValue": (val: boolean | string | number) => {
  //     //             checked.value = val;
  //     //           },
  //     //         },
  //     //         () => [
  //     //           h(
  //     //             ElRadio,
  //     //             {
  //     //               label: -1,
  //     //             },
  //     //             {
  //     //               default: () => "结果作废",
  //     //             }
  //     //           ),
  //     //           h(
  //     //             ElRadio,
  //     //             {
  //     //               label: 0,
  //     //             },
  //     //             {
  //     //               default: () => this.roomData.names[0] + "获胜",
  //     //             }
  //     //           ),
  //     //           h(
  //     //             ElRadio,
  //     //             {
  //     //               label: 1,
  //     //             },
  //     //             {
  //     //               default: () => this.roomData.names[1] + "获胜",
  //     //             }
  //     //           ),
  //     //         ]
  //     //       ),
  //     //   })
  //     //     .then(() => {
  //     //       //winner
  //     //       if ((checked.value as number) < 0) {
  //     //         this.$store.dispatch("stop_game", { winner: -1 }).then(() => {
  //     //           this.$store.dispatch("set_phase", { phase: 0 }).then(() => {
  //     //             this.countdownSeconds = this.roomSettings.countdownTime;
  //     //           });
  //     //         });
  //     //       } else {
  //     //         this.$store.dispatch("stop_game", { winner: checked.value }).then(() => {
  //     //           this.$store.dispatch("set_phase", { phase: 0 }).then(() => {
  //     //             this.countdownSeconds = this.roomSettings.countdownTime;
  //     //           });
  //     //         });
  //     //       }
  //     //     })
  //     //     .catch(() => {});
  //     // }
  //   },
  //   pause() {
  //     if (this.gamePaused) {
  //       this.$store.dispatch("pause", { pause: false });
  //     } else {
  //       this.$store.dispatch("pause", { pause: true });
  //     }
  //   },
  //   onCountDownComplete() {
  //     if (this.gamePhase === 1) {
  //       this.countdownSeconds = this.gameData.game_time * 60 - this.gameData.countdown;
  //       if (this.isPlayerA) {
  //         this.$store.dispatch("set_phase", { phase: 2 }).then(() => {
  //           this.countdown.start();
  //         });
  //       }
  //     } else if (this.gamePhase === 2) {
  //       if (this.isPlayerA) {
  //         this.$store.dispatch("set_phase", { phase: 0 });
  //       }
  //     }
  //   },
  //   selectSpellCard(index: number) {
  //     if (this.isWatcher) {
  //       return;
  //     }
  //     if (this.selectedSpellIndex === index) {
  //       this.selectedSpellIndex = -1;
  //     } else if (!this.spellCardSelected) {
  //       if (
  //         this.gameData.status[index] === 0 ||
  //         (this.isPlayerB && this.gameData.status[index] === 1) ||
  //         (this.isPlayerA && this.gameData.status[index] === 3)
  //       )
  //         this.selectedSpellIndex = index;
  //     }
  //   },
  //   confirmSelect() {
  //     if (this.isPlayerA) {
  //       this.$store.dispatch("update_spell", { idx: this.selectedSpellIndex, status: 1 }).then(() => {
  //         this.selectedSpellIndex = -1;
  //       });
  //     }
  //     if (this.isPlayerB) {
  //       this.$store.dispatch("update_spell", { idx: this.selectedSpellIndex, status: 3 }).then(() => {
  //         this.selectedSpellIndex = -1;
  //       });
  //     }
  //   },
  //   confirmAttained() {
  //     if (this.isPlayerA) {
  //       this.$store.dispatch("update_spell", { idx: this.playerASelectedIndex, status: 5 });
  //       this.$store.commit("set_last_get_time", {
  //         index: 0,
  //         time: new Date().getTime() + this.timeMistake,
  //       });
  //     }
  //     if (this.isPlayerB) {
  //       this.$store.dispatch("update_spell", { idx: this.playerBSelectedIndex, status: 7 });
  //       this.$store.commit("set_last_get_time", {
  //         index: 1,
  //         time: new Date().getTime() + this.timeMistake,
  //       });
  //     }
  //   },
  //   confirmWinner() {
  //     this.$store.dispatch("stop_game", { winner: this.winFlag < 0 ? 0 : 1 }).then(() => {
  //       this.winFlag = 0;
  //       this.countdown.reset();
  //     });
  //   },
  //   onMenuClick({ event, target, item }: any) {
  //     const index = target.getAttribute("index");
  //     if (index !== null) {
  //       this.$store.dispatch("update_spell", { idx: parseInt(index), status: item.value });
  //     }
  //   },
  //   resetRoom() {
  //     ElMessageBox.confirm("该操作会把房间回复到初始状态，是否确认？", "警告", {
  //       confirmButtonText: "确认",
  //       cancelButtonText: "取消",
  //       type: "warning",
  //     })
  //       .then(() => {
  //         this.$store.dispatch("reset_room");
  //       })
  //       .catch(() => {});
  //   },
  //   addChangeCardCount(index: number) {
  //     const arr = [...this.roomData.change_card_count];
  //     arr[index]++;
  //     this.$store.dispatch("change_card_count", {
  //       cnt: arr,
  //     });
  //   },
  //   removeChangeCardCount(index: number) {
  //     const arr = [...this.roomData.change_card_count];
  //     arr[index]--;
  //     this.$store.dispatch("change_card_count", {
  //       cnt: arr,
  //     });
  //   },
  // },
});
</script>

<style lang="scss" scoped>
.rule-standard {
  width: 100%;
  height: 100%;
}

.bingo-wrap {
  width: 100%;
  height: 500px;
  box-sizing: border-box;
  position: relative;

  .bingo-items {
    width: 100%;
    height: 100%;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-content: space-between;
    border: 1px solid #000;
    border-radius: 4px;
    padding: 2px;
    box-sizing: border-box;

    .spell-card {
      border: 1px solid #000;
      border-radius: 4px;
      width: 19.4%;
      height: 19.4%;
    }
  }

  .game-alert {
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    position: absolute;
    left: 0;
    top: 0;
    background-color: #ffffffcc;
    z-index: 100;
  }
}

.bingo-effect {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 99;
}

.count-down-wrap {
  font-size: 30px;
  margin: 10px 0;
  height: 35px;
}

.audio {
  display: none;
}

.host-buttons > * {
  margin: 0 15px;
}

.player-extra-info {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-wrap: wrap;
}

.player-extra-info-inner {
  padding-bottom: 64px;
}

.change-card {
  width: 100%;
  margin-bottom: 20px;
  .change-card-number {
    display: flex;
    justify-content: center;
    align-items: center;

    .change-card-number-btn {
      font-size: 24px;
    }

    .change-card-number-info {
      font-size: 48px;
      margin: 0 15px;
    }
  }

  .change-card-text {
    font-size: 12px;
  }
}

.spell-card-score {
  width: 100%;
  .spell-card-score-number {
    display: flex;
    justify-content: center;
    align-items: center;

    .spell-card-score-number-info {
      font-size: 30px;
      margin: 0 15px;
    }
  }

  .spell-card-score-text {
    font-size: 12px;
  }
}
</style>
