import { defineStore } from "pinia";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useRoomStore } from "./RoomStore";
import { BingoType, GameData, GameStatus, OneSpell, RoomConfig, Spell, SpellStatus } from "@/types";
import ws from "@/utils/webSocket/WebSocketBingo";
import { WebSocketActionType, WebSocketPushActionType } from "@/utils/webSocket/types";
import Config from "@/config"
import config from "@/config";

interface GameLog {
  index: number;
  status: number;
  oldStatus: number;
  causer: string;
  failCountA?: number;
  failCountB?: number;
  getOnWhichBoard?: number;
}

interface PlayerAction {
  playerName: string;
  actionType: string;
  spellIndex: number;
  spellName: string;
  timestamp: number;
  spell?: Spell; // 附加一个spell对象，方便处理
  scoreNow: number[];
}

interface GameLogData {
  roomConfig: RoomConfig;
  players: string[];
  spells: Spell[];
  spells2: Spell[] | null;
  normalData: {
    which_board_a: number;
    which_board_b: number;
    is_portal_a: number[];
    is_portal_b: number[];
    get_on_which_board: number[];
  } | null;
  actions: PlayerAction[];
  gameStartTimestamp: number;
  score: number[];
}


export const useGameStore = defineStore("game", () => {
  const roomStore = useRoomStore();

  //bingo对局相关
  const spells = ref<Spell[]>([]);
  const spellStatus = ref<SpellStatus[]>([]);
  const leftTime = ref(0);
  const countDownTime = ref(0);
  const gameStatus = ref(GameStatus.NOT_STARTED);
  const leftCdTime = ref(-1);
  const debugSpellList = ref([]);
  const gameLogs = reactive<string[]>([]);
  const winner = ref<-1 | 0 | 1 | undefined | null>(null);
  const inited = ref(false);
  const alreadySelectCard = ref(false);
  const spells2 = ref<Spell[]>([]);
  const currentBoard = ref(0);

  const spellCardGrabbedFlag = ref(false);
  watch(spellCardGrabbedFlag, (val) => {
    if (val) {
      leftCdTime.value = 0;
      nextTick(() => {
        spellCardGrabbedFlag.value = false;
      });
    }
  });

  const bothSelectedIndex = computed(() => spellStatus.value.indexOf(SpellStatus.BOTH_SELECTED));
  const playerASelectedIndex = computed(() =>
    bothSelectedIndex.value === -1 ? spellStatus.value.indexOf(SpellStatus.A_SELECTED) : bothSelectedIndex.value
  );
  const playerBSelectedIndex = computed(() =>
    bothSelectedIndex.value === -1 ? spellStatus.value.indexOf(SpellStatus.B_SELECTED) : bothSelectedIndex.value
  );

  const linkGameData = reactive({});

  const getGameData = () => {
    return ws
      .send(WebSocketActionType.GET_ALL_SPELLS)
      .then((data: GameData) => {
        spells.value = data.spells;
        spells2.value = data.spells2;
        spellStatus.value = data.spell_status;
        leftTime.value = data.left_time;
        gameStatus.value = data.status;
        leftCdTime.value = data.left_cd_time;
        inited.value = true;
        for (const i in data.bp_data) {
          bpGameData[i] = data.bp_data[i];
        }
        for (const i in data.normal_data) {
          normalGameData[i] = data.normal_data[i];
        }
      })
      .catch(() => {});
  };
  watch(
    () => roomStore.roomData.started,
    (started) => {
      if (started) getGameData();
    },
    {
      immediate: true,
    }
  );

  const resetGameData = () => {
    spells.value = [];
    spellStatus.value = [];
    leftTime.value = 0;
    gameStatus.value = GameStatus.NOT_STARTED;
    leftCdTime.value = -1;
    bpGameData.whose_turn = 0;
    bpGameData.ban_pick = 0;
    bpGameData.spell_failed_count_a = [];
    bpGameData.spell_failed_count_b = [];
    spells2.value = [];
    normalGameData.which_board_a = 0;
    normalGameData.which_board_b = 0;
    normalGameData.is_portal_a = [];
    normalGameData.is_portal_b = [];
    normalGameData.get_on_which_board = [];
    currentBoard.value = 0;
  };

  const startGame = () => {
    return ws.send(WebSocketActionType.START_GAME);
  };
  ws.on<RoomConfig>(WebSocketPushActionType.PUSH_START_GAME, (data) => {
    for (const i in data) {
      roomStore.roomConfig[i] = data[i];
    }
    roomStore.roomData.started = true;
    roomStore.resetBanPick();
  });

  // const setPhase = (p) => {
  //   phase.value = p;
  //   return ws.send(WebSocketActionType.SET_PHASE, { phase: p });
  // };
  // const getPhase = () => {
  //   return ws.send(WebSocketActionType.GET_PHASE).then(({ phase }) => {
  //     phase.value = phase;
  //   });
  // };

  const stopGame = (winner: -1 | 0 | 1) => {
    return ws.send(WebSocketActionType.STOP_GAME, { winner });
  };
  ws.on<{ winner: -1 | 0 | 1 }>(WebSocketPushActionType.PUSH_STOP_GAME, (data) => {
    winner.value = data!.winner;
    roomStore.roomData.started = false;
    if (data!.winner !== -1) {
      roomStore.roomData.score[data!.winner]++;
    }
    resetGameData();
  });

  const pause = (pause: boolean) => {
    return ws.send(WebSocketActionType.PAUSE, { pause });
  };
  ws.on(WebSocketPushActionType.PUSH_PAUSE, ({ pause }) => {
    if (pause) {
      gameStatus.value = GameStatus.PAUSED;
    } else {
      gameStatus.value = GameStatus.STARTED;
    }
  });

  const setDebugSeplls = () => {
    return ws.send(WebSocketActionType.SET_DEBUG_SPELLS, { spells: debugSpellList.value });
  };

  const selectSpell = (index: number) => {
    return ws.send(WebSocketActionType.SELECT_SPELL, { index });
  };

  const finishSpell = (index: number, success = true, playerIndex?: 0 | 1) => {
    return ws.send(WebSocketActionType.FINISH_SPELL, { index, success, player_index: playerIndex });
  };

  const refreshSpell = (index: number) => {
    return ws.send(WebSocketActionType.REFRESH_SPELL, { board_idx: currentBoard.value, spell_idx: index })
  };
  ws.on<OneSpell>(WebSocketPushActionType.PUSH_UPDATE_ONE_SPELL, (data) => {
    const log: GameLog = {
      index: data!.spell_idx,
      status: 0x100,
      oldStatus: 0,
      causer: data!.player_name,
    };
    gameLogs.push(getSepllCardLog(log))
    if(data!.board_idx == 0){
      const newSpells = [...spells.value]; // 1. Create a shallow copy of the current array
      newSpells[data!.spell_idx] = data!.spell; // 2. Update the element in the new array
      spells.value = newSpells; // 3. Assign the new array back to the ref
    }else if(data!.board_idx == 1){
      const newSpells2 = [...spells2.value];
      newSpells2[data!.spell_idx] = data!.spell;
      spells2.value = newSpells2;
    }
  })

  const updateSpellStatus = (index, status) => {
    return ws.send(WebSocketActionType.UPDATE_SPELL_STATUS, { index, status });
  };
  ws.on<{
    index: number;
    status: number;
    causer: string;
    spell_failed_count_a?: number;
    spell_failed_count_b?: number;
    which_board_a?: number;
    which_board_b?: number;
    get_on_which_board?: number;
  }>(WebSocketPushActionType.PUSH_UPDATE_SEPLL_STATUS, (data) => {
    const log: GameLog = {
      index: data!.index,
      status: data!.status,
      oldStatus: spellStatus.value[data!.index],
      causer: data!.causer,
    };
    if (data!.spell_failed_count_a) {
      log.failCountA = data!.spell_failed_count_a;
      nextTick(() => {
        bpGameData.spell_failed_count_a[data!.index] = data!.spell_failed_count_a!;
      });
    }
    if (data!.spell_failed_count_b) {
      log.failCountB = data!.spell_failed_count_b;
      nextTick(() => {
        bpGameData.spell_failed_count_b[data!.index] = data!.spell_failed_count_b!;
      });
    }
    if(data!.which_board_a != null){
      normalGameData.which_board_a = data!.which_board_a!;
    }
    if(data!.which_board_b != null){
      normalGameData.which_board_b = data!.which_board_b!;
    }
    if(data!.get_on_which_board){
      log.getOnWhichBoard = data!.get_on_which_board;
      normalGameData.get_on_which_board[data!.index] = data!.get_on_which_board!;
    }
    const logText = getSepllCardLog(log);
    gameLogs.push(logText);

    if (roomStore.isHost) {
      if (data!.causer === roomStore.roomData.names[0]) {
        setTimeout(() => {
          spellStatus.value[data!.index] = data!.status;
        }, roomStore.roomSettings.playerA.delay * 1000);
      } else if (data!.causer === roomStore.roomData.names[1]) {
        setTimeout(() => {
          spellStatus.value[data!.index] = data!.status;
        }, roomStore.roomSettings.playerB.delay * 1000);
      } else {
        spellStatus.value[data!.index] = data!.status;
      }
    } else {
      spellStatus.value[data!.index] = data!.status;
    }
  });

  const getSepllCardLog = ({
                             index,
                             status,
                             oldStatus,
                             causer,
                             failCountA,
                             failCountB,
                           }: {
    index: number;
    status: number;
    oldStatus: number;
    causer: string;
    failCountA?: number;
    failCountB?: number;
  }) => {
    let str = "";
    const playerA = `<span style="padding:0 2px;color:var(--A-color)">${roomStore.roomData.names[0]}</span>`;
    const playerB = `<span style="padding:0 2px;color:var(--B-color)">${roomStore.roomData.names[1]}</span>`;
    const host = `<span style="padding:0 2px;font-weight:600">${roomStore.roomData.host}</span>`;
    const curSpellList = computed(() => currentBoard.value == 0 ? spells.value : spells2.value)
    const spellCard = `<span style="padding:0 2px;font-weight:600">
      ${curSpellList.value[index].name}</span>`;

    if (roomStore.roomData.names[0] === causer) {
      str += playerA;
      switch (status) {
        case -1:
          str += "禁用了符卡";
          break;
        case 0:
        case 3:
          if (roomStore.isPlayerA) {
            if (oldStatus === 5) {
              str += "取消收取符卡";
            } else {
              str += "取消选择符卡";
            }
          }
          break;
        case 1:
        case 2:
          str += "选择了符卡";
          break;
        case 5:
          if (roomStore.isPlayerB && (oldStatus === 3 || oldStatus === 2)) {
            str += "抢了你选择的符卡";
            spellCardGrabbedFlag.value = true;
          } else {
            str += "收取了符卡";
          }
          break;
        case 0x100:
          str += `刷新了${Math.floor(index/5)+1}行${index%5+1}列的符卡`
          break;
      }
      str += spellCard;
    } else if (roomStore.roomData.names[1] === causer) {
      str += playerB;
      switch (status) {
        case -1:
          str += "禁用了符卡";
          break;
        case 0:
        case 1:
          if (roomStore.isPlayerB) {
            if (oldStatus === 7) {
              str += "取消收取符卡";
            } else {
              str += "取消选择符卡";
            }
          }
          break;
        case 2:
        case 3:
          str += "选择了符卡";
          break;
        case 7:
          if (roomStore.isPlayerA && (oldStatus === 1 || oldStatus === 2)) {
            str += "抢了你选择的符卡";
            spellCardGrabbedFlag.value = true;
          } else {
            str += "收取了符卡";
          }
          break;
        case 0x100:
          str += `刷新了${Math.floor(index/5)+1}行${index%5+1}列的符卡`
          break;
      }
      str += spellCard;
    } else {
      if (roomStore.roomData.type === BingoType.BP) {
        const currentCountA = bpGameData.spell_failed_count_a[index];
        const currentCountB = bpGameData.spell_failed_count_b[index];
        if (failCountA! > currentCountA) {
          return `${playerA}收取符卡${spellCard}失败`;
        }
        if (failCountB! > currentCountB) {
          return `${playerB}收取符卡${spellCard}失败`;
        }
      }
      str = `${host}把符卡${spellCard}`;
      switch (status) {
        case -1:
          str += "设置为禁用";
          break;
        case 0:
          str += "状态置空";
          break;
        case 1:
          str += `设置为${playerA}选择`;
          break;
        case 2:
          str += "设置为双方选择";
          break;
        case 3:
          str += `设置为${playerB}选择`;
          break;
        case 5:
          str += `设置为${playerA}收取`;
          break;
        case 6:
          str += "设置为双方收取";
          break;
        case 7:
          str += `设置为${playerB}收取`;
          break;
        case 0x100:
          str += `刷新，该符卡位于${Math.floor(index/5)+1}行${index%5+1}列`
          break;
      }
    }

    return str;
  };

  //bp赛
  const bpGameData = reactive({
    whose_turn: 0, // 轮到谁了，0-左边，1-右边
    ban_pick: 1, // 0-选，1-ban，2-轮到收卡了
    spell_failed_count_a: [] as number[], // 左边玩家25张符卡的失败次数
    spell_failed_count_b: [] as number[], // 右边玩家25张符卡的失败次数
  });

  const normalGameData = reactive({
    which_board_a: 0,
    which_board_b: 0,
    is_portal_a: [] as number[],
    is_portal_b: [] as number[],
    get_on_which_board: [] as number[],
  })

  const bpGameBanPick = (index: number) => {
    return ws.send(WebSocketActionType.BP_GAME_BAN_PICK, { idx: index });
  };

  const bpGameNextRound = () => {
    return ws.send(WebSocketActionType.BP_GAME_NEXT_ROUND);
  };
  ws.on<{ whose_turn: number; ban_pick: number }>(WebSocketPushActionType.PUSH_BP_GAME_NEXT_ROUND, (data) => {
    bpGameData.whose_turn = data!.whose_turn;
    bpGameData.ban_pick = data!.ban_pick;
  });

  watch(
    () => normalGameData.which_board_a,
    (newVal, oldVal) => {
      if (roomStore.isPlayerA){
        currentBoard.value = newVal;
      }
    },
    {
      immediate: true,
      deep: true,
    }
  );

  watch(
    () => normalGameData.which_board_b,
    (boardB) => {
      if (roomStore.isPlayerB){
        currentBoard.value = boardB;
      }
    },
    {
      immediate: true,
      deep: true,
    }
  );

  const fetchAndProcessGameLog = async () => {
    try {
      const serializedLog = await ws.send(WebSocketActionType.PRINT_LOG);
      if (typeof serializedLog !== 'string') {
        throw new Error("收到的日志格式不正确");
      }
      const logData: GameLogData = JSON.parse(serializedLog);

      // 将spells对象附加到actions上，方便后续处理
      logData.actions.forEach(action => {
        if (action.spellIndex >= 0) {
          // 注意：这里假设spellIndex对应的是spells数组。
          // 如果一个动作可能对应spells2，逻辑需要更复杂。
          // 但从后端代码看，logAction只记录了主盘的spell。
          action.spell = logData.spells[action.spellIndex];
        }
      });

      const formattedLog = formatLogForDownload(logData);
      triggerDownload(formattedLog, logData);

    } catch (error) {
      console.error("获取或处理游戏日志失败:", error);
      // 可以使用 ElMessage 提示用户
      // ElMessage.error("获取游戏日志失败");
    }
  };

  const triggerDownload = (content: string, logData: GameLogData) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // 7. 文件命名加入时分信息
    const date = new Date(logData.gameStartTimestamp);
    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    const timeStr = `${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
    a.download = `BingoLog_${dateStr}_${timeStr}_${logData.players[0]}_vs_${logData.players[1]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };


// 替换旧的 formatLogForDownload 方法
  const formatLogForDownload = (logData: GameLogData): string => {
    const { roomConfig, players, score, spells, spells2, actions, gameStartTimestamp, normalData } = logData;
    const output: string[] = [];

    // 辅助函数
    const formatTimestamp = (ms: number) => {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
      const seconds = (totalSeconds % 60).toString().padStart(2, '0');
      return `${minutes}:${seconds}`;
    };

    const customPadEnd = (str: string, targetLength: number, padString = ' '): string => {
      const wideCharRegex = /[\u4e00-\u9fa5\uff00-\uffef]/g;
      const visualLength = str.replace(wideCharRegex, '  ').length;
      const paddingLength = targetLength - visualLength;
      if (paddingLength <= 0) {
        return str;
      }
      return str + padString.repeat(paddingLength);
    };

    // 1. 基础信息
    output.push(`东方Bingo对战日志`);
    output.push(`对局开始时间: ${new Date(gameStartTimestamp).toLocaleString()}`);
    output.push(`玩家: ${players[0]} vs ${players[1]}`);
    output.push(`最终比分: ${score[0]} - ${score[1]}`);
    output.push('---');

    // 2. 游戏设置
    output.push('【游戏设置】');
    output.push(`模式: ${Config.gameTypeList.find(g => g.type === roomConfig.type)?.name || '未知'}`);
    output.push(`时长: ${roomConfig.game_time}分钟, 倒计时: ${roomConfig.countdown}秒, cd： ${roomConfig.cd_time}秒`);
    // 1. 添加符卡来源与游戏难度
    output.push(`卡池：${Config.spellVersionList.find(n => n.type === roomConfig.spell_version)?.name}`)
    const gameNames = roomConfig.games.map(code => Config.gameOptionList.find(g => g.code === code)?.name).filter(Boolean).join(', ');
    output.push(`作品来源: ${gameNames || '未指定'}`);
    output.push(`符卡难度: ${roomConfig.ranks.join(', ') || '未指定'}`);
    const difficultyName = Config.difficultyList.find(d => d.value === roomConfig.difficulty)?.name;
    output.push(`盘面难度: ${difficultyName || '未知'}`);
    if(roomConfig.blind_setting > 1){
      output.push(`盲盒设定: 模式${roomConfig.blind_setting-1}, 揭示等级${roomConfig.blind_reveal_level}`);
    }
    if(roomConfig.dual_board > 0) {
      output.push(`双重盘面: ${roomConfig.dual_board > 0 ? `开启 (转换格: ${roomConfig.portal_count}, 差异等级: ${roomConfig.diff_level})` : '关闭'}`);
    }
    if(roomConfig.use_ai){
      output.push(`AI参数：Lv.${roomConfig.ai_base_power} / Lv.${roomConfig.ai_experience} 策略等级：${roomConfig.ai_strategy_level}`)
    }
    output.push('---');

    // 3. 盘面符卡
    const formatBoard = (boardSpells: Spell[], portals: number[] | undefined, title: string) => {
      output.push(title);
      const CELL_WIDTH = 32; // 定义每个单元格的视觉宽度
      for (let i = 0; i < 5; i++) {
        let row = customPadEnd(`${i + 1} | `, 5);
        for (let j = 0; j < 5; j++) {
          const index = i * 5 + j;
          const spell = boardSpells[index];
          const isPortal = portals && portals[index] === 1 ? ' (P)' : '';
          const cellContent = `${spell.name.trim()}${isPortal}`;
          row += customPadEnd(cellContent, CELL_WIDTH);
        }
        output.push(row);
      }
    };
    formatBoard(spells, normalData?.is_portal_a, '【盘面A】');
    if (roomConfig.dual_board > 0 && spells2) {
      output.push('');
      formatBoard(spells2, normalData?.is_portal_b, '【盘面B】');
    }
    output.push('---');

    // 4. 游戏进程
    output.push('【游戏进程】');
    const playerBoards: { [key: string]: number } = { [players[0]]: 0, [players[1]]: 0 };
    // 预处理，为每个玩家的 select 动作找到对应的 finish
    const playerSelectHistory: { [key: string]: PlayerAction[] } = { [players[0]]: [], [players[1]]: [] };

    actions.forEach(action => {
      // 4. 时间格式化 & 添加行列信息
      const timeStr = `[${formatTimestamp(action.timestamp)}]`;
      let logLine = `${timeStr} `;
      const boardInfo = roomConfig.dual_board > 0 ? `(盘面${playerBoards[action.playerName] === 0 ? 'A' : 'B'}) ` : '';
      const spellLocation = action.spellIndex >= 0 ? `(${Math.floor(action.spellIndex / 5) + 1}, ${action.spellIndex % 5 + 1}) ` : '';

      if (action.actionType === 'pause') {
        logLine += `${action.playerName} 暂停了游戏。`;
      } else if (action.actionType === 'resume') {
        logLine += `${action.playerName} 恢复了游戏。`;
      } else if (action.actionType.startsWith('set-')) {
        logLine += `${action.playerName} 将 "${action.spellName}" 设置为 ${action.actionType.split('-')[1]} 状态。当前比分：${action.scoreNow[0]}-${action.scoreNow[1]}。`;
      } else {
        logLine += `玩家 ${action.playerName} ${boardInfo}`;
        switch (action.actionType) {
          case 'select':
            logLine += `选择了符卡 ${spellLocation}"${action.spellName}"。`;
            playerSelectHistory[action.playerName].push(action);
            break;
          case 'finish':
          case 'contest_win':
            const verb = action.actionType === 'contest_win' ? '抢了' : '收取了';
            logLine += `${verb}符卡 ${spellLocation}"${action.spellName}"。`;

            // 4. 计算并显示用时
            const lastSelect = playerSelectHistory[action.playerName].pop();
            if (lastSelect) {
              const startTime = Math.max(lastSelect.timestamp,  roomConfig.countdown * 1000);
              const endTime = action.timestamp;
              let pauseDurationInInterval = 0;
              let pStart = 0;
              actions.forEach(pAction => {
                if (pAction.timestamp > startTime && pAction.timestamp < endTime) {
                  if (pAction.actionType === 'pause') pStart = pAction.timestamp;
                  if (pAction.actionType === 'resume' && pStart > 0) {
                    pauseDurationInInterval += pAction.timestamp - pStart;
                    pStart = 0;
                  }
                }
              });
              const duration = endTime - startTime - pauseDurationInInterval;
              if (duration > 0) {
                logLine += ` (用时: ${(duration / 1000).toFixed(2)}s)`;
              }
              logLine += `(比分：${action.scoreNow[0]}-${action.scoreNow[1]})`
            }
            break;
        }

        // 处理双盘面翻转
        if (roomConfig.dual_board > 0 && normalData && (action.actionType === 'finish' || action.actionType === 'contest_win')) {
          const currentBoard = playerBoards[action.playerName];
          const portals = currentBoard === 0 ? normalData.is_portal_a : normalData.is_portal_b;
          if (portals && portals[action.spellIndex] === 1) {
            playerBoards[action.playerName] = 1 - currentBoard;
            logLine += ` (切换至盘面${playerBoards[action.playerName] === 0 ? 'A' : 'B'})`;
          }
        }
      }
      output.push(logLine);
    });
    output.push('---');

    // 5. 评价汇总
    output.push('【数据分析】');
    const countdownMs = roomConfig.countdown * 1000;

    players.forEach(player => {
      output.push(`[玩家: ${player}]`);
      const playerActions = actions.filter(a => a.playerName === player);
      const opponent = players.find(p => p !== player)!;

      const selectStack: PlayerAction[] = [];
      let totalTime = 0;
      let totalFastest = 0;
      const totalStars: number[] = [0, 0, 0, 0, 0];
      const completedTasks: string[] = [];
      let untrackedFinishes = 0;
      let stolenCount = 0;

      // 7. dual_board 模式下正确查找符卡
      const getSpellForAction = (action: PlayerAction): Spell | undefined => {
        if (!roomConfig.dual_board || !normalData || !spells2) {
          return spells[action.spellIndex];
        }
        // getOnWhichBoard: 0x1: Left/A, 0x2: Left/B, 0x10: Right/A, 0x20: Right/B
        const getInfo = normalData.get_on_which_board[action.spellIndex];
        const playerIndex = players.indexOf(player);
        const boardFlag = playerIndex === 0 ? (getInfo & 0x0F) : (getInfo >> 4);

        if (boardFlag === 1) return spells[action.spellIndex]; // 在盘面A收取
        if (boardFlag === 2) return spells2[action.spellIndex]; // 在盘面B收取

        // 如果没有收取信息（比如只是select），则无法确定，默认返回盘面A
        return spells[action.spellIndex];
      };

      for (const action of actions) {
        if (action.playerName === player) {
          if (action.actionType === 'select') {
            selectStack.push(action);
          } else if (action.actionType === 'finish' || action.actionType === 'contest_win') {
            const lastSelect = selectStack.pop();
            if (lastSelect) {
              const spell = getSpellForAction(action);
              if (!spell) continue;

              const startTime = Math.max(lastSelect.timestamp, countdownMs);
              const endTime = action.timestamp;
              let pauseDurationInInterval = 0;
              let pStart = 0;
              actions.forEach(pAction => {
                if (pAction.timestamp > startTime && pAction.timestamp < endTime) {
                  if (pAction.actionType === 'pause') pStart = pAction.timestamp;
                  if (pAction.actionType === 'resume' && pStart > 0) {
                    pauseDurationInInterval += pAction.timestamp - pStart;
                    pStart = 0;
                  }
                }
              });
              const duration = endTime - startTime - pauseDurationInInterval;
              if (duration > 0) {
                totalTime += duration;
                totalFastest += spell.fastest;
                totalStars[spell.star - 1] += 1;
                completedTasks.push(`- "${spell.name}": ${(duration / 1000).toFixed(2)}s`);
              }
            } else {
              untrackedFinishes++;
            }
          }
        } else if (action.playerName === opponent) {
          // 5. 处理被抢情况
          if (action.actionType === 'contest_win') {
            // 如果对手抢卡，检查我方是否有对同一张卡的选择
            const myLastSelect = selectStack[selectStack.length - 1];
            if (myLastSelect && myLastSelect.spellIndex === action.spellIndex) {
              selectStack.pop(); // 移除这个被抢的选择
              stolenCount++;
            }
          }
        }
      }

      output.push(...completedTasks);
      if (untrackedFinishes > 0) {
        output.push(`(有 ${untrackedFinishes} 次收取操作因无前置选择而未计入效率统计)`);
      }
      if (stolenCount > 0) {
        output.push(`(有 ${stolenCount} 张选择的符卡被对手抢走)`);
      }
      // 2. 添加星级分布
      output.push(`总计收取 ${completedTasks.length} 张符卡，等级分布: [${totalStars[0]},${totalStars[1]},${totalStars[2]},${totalStars[3]},${totalStars[4]}]`);
      output.push(`总用时: ${formatTimestamp(totalTime)}`);
      if (roomConfig.spell_version === Config.spellListWithTimer) {
        const efficiency = totalTime > 0 ? ((totalFastest * 1000) / totalTime * 100).toFixed(2) : 'N/A';
        output.push(`全局效率: ${efficiency}%`);
      }
      output.push('');
    });

    return output.join('\n');
  };

  return {
    spells,
    spellStatus,
    leftTime,
    countDownTime,
    gameStatus,
    leftCdTime,
    debugSpellList,
    gameLogs,
    playerASelectedIndex,
    playerBSelectedIndex,
    inited,
    spellCardGrabbedFlag,
    bpGameData,
    normalGameData,
    alreadySelectCard,
    spells2,
    currentBoard,
    startGame,
    getGameData,
    stopGame,
    pause,
    setDebugSeplls,
    selectSpell,
    finishSpell,
    updateSpellStatus,
    bpGameBanPick,
    bpGameNextRound,
    refreshSpell,
    fetchAndProcessGameLog,
  };
});
