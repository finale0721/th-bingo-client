<template>
  <div class="rule-pb">
    <el-row>
      <el-col :span="4">
        <div class="player-extra-info" v-if="roomData.started">
          <div class="spell-card-score">
            <div class="spell-card-score-number">
              <div class="spell-card-score-number-info">{{ playerAScore }}</div>
            </div>
            <div class="spell-card-score-text">得分</div>
          </div>
        </div>
      </el-col>
      <el-col :span="16">
        <div class="bingo-wrap">
          <right-click-menu
            style="width: 100%; height: 100%"
            :menuData="menuData"
            :disabled="!isHost"
            @click="onMenuClick"
          >
            <div class="bingo-items">
              <template v-if="gameData.spells">
                <div class="spell-card" v-for="(item, index) in gameData.spells" :key="index">
                  <spell-card-cell
                    :name="item.name"
                    :desc="item.desc"
                    :level="item.star"
                    @click="selectSpellCard(index)"
                    :selected="selectedSpellIndex === index"
                    :status="gameData.status[index]"
                    :index="index"
                  ></spell-card-cell>
                </div>
              </template>
            </div>
          </right-click-menu>
          <div v-if="!inGame || (winFlag !== 0 && !isHost)" class="game-alert">
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
        <div v-if="isHost" class="host-buttons">
          <el-button size="small" @click="resetRoom" :disabled="inGame">重置房间</el-button>
          <el-button type="primary" @click="start" v-if="winFlag === 0">{{
            inGame ? "结束比赛" : "开始比赛"
          }}</el-button>
          <el-button type="primary" @click="confirmWinner" v-else
            >确认：{{ winFlag < 0 ? roomData.names[0] : roomData.names[1] }}获胜</el-button
          >
          <el-button size="small" @click="nextRound" :disabled="gamePhase !== 2 || gameData.ban_pick !== 2"
            >进入下轮</el-button
          >
        </div>
        <div v-if="inGame && !isHost">
          <el-button
            type="primary"
            @click="confirmSelect"
            :disabled="!isMyTurn || !bpPhase"
            v-if="!gameData.ban_pick"
            >{{ bpPhase ? (isMyTurn ? "选择符卡" : "等待对手选择符卡") : "等待房主操作" }}</el-button
          >
          <el-button type="primary" @click="confirmBan" v-if="gameData.ban_pick" :disabled="!isMyTurn || !bpPhase">{{
            bpPhase ? (isMyTurn ? "禁用符卡" : "等待对手禁用符卡") : "等待房主操作"
          }}</el-button>
        </div>
      </el-col>
      <el-col :span="4">
        <div class="player-extra-info" v-if="roomData.started">
          <div class="spell-card-score">
            <div class="spell-card-score-number">
              <div class="spell-card-score-number-info">{{ playerBScore }}</div>
            </div>
            <div class="spell-card-score-text">得分</div>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, ref, h } from "vue";
import SpellCardCell from "@/components/spell-card-cell.vue";
import RightClickMenu from "@/components/right-click-menu.vue";
import BingoEffect from "@/components/bingo-effect/index.vue";
import CountDown from "@/components/count-down.vue";
import { ElButton, ElMessageBox, ElRadio, ElRadioGroup, ElRow, ElCol } from "element-plus";

export default defineComponent({
  name: "Room",
  data() {
    return {
      countdownSeconds: 0,
      playerAScore: 0,
      playerBScore: 0,
      selectedSpellIndex: -1,
      winFlag: 0,
      audioPlaying: false,
      alertInfo: "等待房主开始比赛",
      alertInfoColor: "#000",
      cardCount: [2, 2],
      menuData: [
        {
          label: "收取失败",
          value: 0,
        },
        {
          label: "禁用",
          value: -1,
        },
        {
          label: "左侧玩家选择",
          value: 1,
          tag: "playerA",
        },
        {
          label: "右侧玩家选择",
          value: 3,
          tag: "playerB",
        },
        // {
        //   label: "两侧玩家选择",
        //   value: 2,
        // },
        {
          label: "左侧玩家收取",
          value: 5,
          tag: "playerA",
        },
        {
          label: "右侧玩家收取",
          value: 7,
          tag: "playerB",
        },
      ],
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
  },
  // setup() {
  //   const store = useStore();
  //   const countdown = ref();

  //   return {
  //     timeMistake: computed(() => store.getters.heartBeat.timeMistake),
  //     gameData: computed(() => store.getters.gameData),
  //     roomData: computed(() => store.getters.roomData),
  //     roomSettings: computed(() => store.getters.roomSettings),
  //     inRoom: computed(() => store.getters.inRoom),
  //     isHost: computed(() => store.getters.isHost),
  //     inGame: computed(() => store.getters.inGame),
  //     isPlayerA: computed(() => store.getters.isPlayerA),
  //     isPlayerB: computed(() => store.getters.isPlayerB),
  //     isMyTurn: computed(
  //       () =>
  //         (store.getters.isPlayerA && store.getters.gameData.whose_turn === 0) ||
  //         (store.getters.isPlayerB && store.getters.gameData.whose_turn === 1)
  //     ),
  //     gamePhase: computed(() => store.getters.gameData.phase || 0),
  //     bpPhase: computed(() => store.getters.gameData.ban_pick !== 2),
  //     countdown,
  //   };
  // },
  // watch: {
  //   gameData(value) {
  //     if (value.start_time) {
  //       const currentTime = new Date().getTime() + this.timeMistake;
  //       const startTime = value.start_time;

  //       let pasedTime;
  //       pasedTime = (currentTime - startTime) / 1000;
  //       const standbyCountDown = this.roomData.room_config.countdown - pasedTime;
  //       const gameCountDown = this.roomData.room_config.game_time * 60 - pasedTime;
  //       if (standbyCountDown > 0) {
  //         this.countdownSeconds = Math.ceil(standbyCountDown);
  //         this.$nextTick(() => {
  //           this.countdown.start();
  //         });
  //       } else {
  //         if (this.isHost && value.phase < 2) {
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

  //     const status = value.status;
  //     if (status && status.length) {
  //       const available: number[] = new Array(12).fill(2);
  //       const sumArr: number[] = new Array(12).fill(0);
  //       this.winFlag = 0;
  //       let count = 0;
  //       let scoreA = 0;
  //       let scoreB = 0;
  //       status.forEach((item: number, index: number) => {
  //         const rowIndex = Math.floor(index / 5);
  //         const columnIndex = index % 5;
  //         if (item == -1) {
  //           count++;
  //         }
  //         if (item === 5) {
  //           count++;
  //           scoreA += this.gameData.spells[index].star;
  //           if (available[rowIndex] > 0) available[rowIndex] -= 2;
  //           if (available[columnIndex + 5] > 0) available[columnIndex + 5] -= 2;
  //           sumArr[rowIndex] -= 1;
  //           sumArr[columnIndex + 5] -= 1;
  //           if (index % 6 === 0) {
  //             sumArr[10] -= 1;
  //             if (available[10] > 0) available[10] -= 2;
  //           }
  //           if (index && index % 4 === 0) {
  //             sumArr[11] -= 1;
  //             if (available[11] > 0) available[11] -= 2;
  //           }
  //         } else if (item === 7) {
  //           count++;
  //           scoreB += this.gameData.spells[index].star;
  //           if (available[rowIndex] % 2 === 0) available[rowIndex] -= 1;
  //           if (available[columnIndex + 5] % 2 === 0) available[columnIndex + 5] -= 1;
  //           sumArr[rowIndex] += 1;
  //           sumArr[columnIndex + 5] += 1;
  //           if (index % 6 === 0) {
  //             sumArr[10] += 1;
  //             if (available[10] % 2 === 0) available[10] -= 1;
  //           }
  //           if (index && index % 4 === 0) {
  //             sumArr[11] += 1;
  //             if (available[11] % 2 === 0) available[11] -= 1;
  //           }
  //         }
  //       });

  //       for (let i = 0; i < 12; i++) {
  //         if (sumArr[i] === -5) {
  //           this.winFlag = -(i + 1);
  //           break;
  //         } else if (sumArr[i] === 5) {
  //           this.winFlag = i + 1;
  //           break;
  //         }
  //       }

  //       this.playerAScore = scoreA;
  //       this.playerBScore = scoreB;

  //       if (count == 25) {
  //         if (scoreB - scoreA < 0) {
  //           this.winFlag = -25;
  //         } else {
  //           this.winFlag = 25;
  //         }
  //       }
  //       if (this.winFlag !== 0) {
  //         this.alertInfo = "已满足胜利条件，等待房主判断";
  //         this.alertInfoColor = "red";
  //       }
  //     }
  //   },
  //   roomData(value) {
  //     if (!value.started) {
  //       this.alertInfo = "等待房主开始比赛";
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
  // },
  // methods: {
  //   start() {
  //     if (this.inGame) {
  //       if (this.winFlag === 0) {
  //         const checked = ref<boolean | string | number>(-1);
  //         ElMessageBox({
  //           title: "还没有人获胜，现在结束比赛请选择一个选项",
  //           message: () =>
  //             h(
  //               ElRadioGroup,
  //               {
  //                 modelValue: checked.value,
  //                 "onUpdate:modelValue": (val: boolean | string | number) => {
  //                   checked.value = val;
  //                 },
  //               },
  //               () => [
  //                 h(
  //                   ElRadio,
  //                   {
  //                     label: -1,
  //                   },
  //                   {
  //                     default: () => "结果作废",
  //                   }
  //                 ),
  //                 h(
  //                   ElRadio,
  //                   {
  //                     label: 0,
  //                   },
  //                   {
  //                     default: () => this.roomData.names[0] + "获胜",
  //                   }
  //                 ),
  //                 h(
  //                   ElRadio,
  //                   {
  //                     label: 1,
  //                   },
  //                   {
  //                     default: () => this.roomData.names[1] + "获胜",
  //                   }
  //                 ),
  //               ]
  //             ),
  //         })
  //           .then(() => {
  //             //winner
  //             if ((checked.value as number) < 0) {
  //               this.$store.dispatch("stop_game", { winner: -1 }).then(() => {
  //                 this.$store.dispatch("set_phase", { phase: 0 }).then(() => {
  //                   this.countdownSeconds = this.roomSettings.countdownTime;
  //                 });
  //               });
  //             } else {
  //               this.$store.dispatch("stop_game", { winner: checked.value }).then(() => {
  //                 this.$store.dispatch("set_phase", { phase: 0 }).then(() => {
  //                   this.countdownSeconds = this.roomSettings.countdownTime;
  //                 });
  //               });
  //             }
  //           })
  //           .catch(() => {});
  //       }
  //     } else {
  //       this.$store
  //         .dispatch("update_room_config", {
  //           room_config: {
  //             game_time: this.roomSettings.gameTimeLimit,
  //             countdown: this.roomSettings.countdownTime,
  //             cd_time: this.roomSettings.cdTime,
  //             games: this.roomSettings.checkList,
  //             ranks: this.roomSettings.rankList,
  //             difficulty: this.roomSettings.difficulty,
  //             need_win: (this.roomSettings.format + 1) / 2,
  //             is_private: this.roomSettings.private,
  //           },
  //         })
  //         .then(() => {
  //           this.$store.dispatch("start_game").then(() => {
  //             this.$store.dispatch("change_card_count", {
  //               cnt: [this.roomSettings.playerA.changeCardCount, this.roomSettings.playerB.changeCardCount],
  //             });
  //             this.$store.commit("change_game_state", true);
  //             this.$store.dispatch("set_phase", { phase: 1 }).then(() => {
  //               this.countdown.start();
  //             });
  //           });
  //         });
  //     }
  //   },
  //   nextRound() {
  //     this.$store.dispatch("next_round");
  //   },
  //   onCountDownComplete() {
  //     if (this.gamePhase === 1) {
  //       this.countdownSeconds = this.gameData.game_time * 60 - this.gameData.countdown;
  //       if (this.isHost) {
  //         this.$store.dispatch("set_phase", { phase: 2 }).then(() => {
  //           this.countdown.start();
  //         });
  //       }
  //     } else if (this.gamePhase === 2) {
  //       if (this.isHost) {
  //         this.$store.dispatch("set_phase", { phase: 0 });
  //       }
  //     }
  //   },
  //   selectSpellCard(index: number) {
  //     if (this.selectedSpellIndex === index) {
  //       this.selectedSpellIndex = -1;
  //     } else if (this.gameData.status[index] === 0) {
  //       this.selectedSpellIndex = index;
  //     }
  //   },
  //   confirmSelect() {
  //     if (this.isPlayerA) {
  //       this.$store.dispatch("update_spell", { idx: this.selectedSpellIndex, status: 1 }).then(() => {
  //         this.selectedSpellIndex = -1;
  //       });
  //     } else if (this.isPlayerB) {
  //       this.$store.dispatch("update_spell", { idx: this.selectedSpellIndex, status: 3 }).then(() => {
  //         this.selectedSpellIndex = -1;
  //       });
  //     }
  //   },
  //   confirmBan() {
  //     this.$store.dispatch("update_spell", { idx: this.selectedSpellIndex, status: -1 }).then(() => {
  //       this.selectedSpellIndex = -1;
  //     });
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
.rule-bp {
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
}

.spell-card-score {
  padding-bottom: 64px;

  .spell-card-score-number {
    display: flex;
    align-items: center;

    .spell-card-score-number-btn {
      font-size: 24px;
    }

    .spell-card-score-number-info {
      font-size: 48px;
      margin: 0 15px;
    }
  }

  .spell-card-score-text {
    font-size: 12px;
  }
}
</style>
