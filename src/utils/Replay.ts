import { useGameStore } from "@/store/GameStore";
import { computed, nextTick, reactive, ref, watch } from "vue";
import { useRoomStore } from "@/store/RoomStore";
import { BingoType, GameData, GameStatus, OneSpell, RoomConfig, Spell, SpellStatus } from "@/types";
import ws from "@/utils/webSocket/WebSocketBingo";
import { WebSocketActionType, WebSocketPushActionType } from "@/utils/webSocket/types";
import Config from "@/config";
import pako from "pako";

export interface PlayerAction {
  playerName: string;
  actionType: string;
  spellIndex: number;
  spellName: string;
  timestamp: number;
  spell?: Spell; // 附加一个spell对象，方便处理
  scoreNow: number[];
}

export interface GameLogData {
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
  initStatus: number[];
  isCustomGame: boolean | null;
}

export interface ReplayPayload {
  version: string;
  data: GameLogData;
}

const REPLAY_DATA_VERSION = "1.0";

class Replay {
  private gameStore = useGameStore();
  private roomStore = useRoomStore();
  private originalRoomConfig = {
    rid: "", // 房间名
    type: BingoType.STANDARD, // 1-标准赛，2-BP赛，3-link赛
    game_time: 30, // 游戏总时间（不含倒计时），单位：分
    countdown: 5, // 倒计时，单位：秒
    games: [], // 含有哪些作品
    ranks: [], // 含有哪些游戏难度，也就是L卡和EX卡
    need_win: 3, // 需要胜利的局数，例如2表示bo3
    difficulty: 3, // 难度（影响不同星级的卡的分布），1对应E，2对应N，3对应L，其它对应随机
    cd_time: 30, // 选卡cd，收卡后要多少秒才能选下一张卡
    cd_modifier_a: 0, // 左侧选手CD修正值
    cd_modifier_b: 0, // 右侧选手CD修正值
    reserved_type: 1, // 纯客户端用的一个类型字段，服务器只负责透传
    blind_setting: 1,
    spell_version: 1,
    dual_board: 0,
    portal_count: 5,
    blind_reveal_level: 2,
    diff_level: 3,
    use_ai: false,
    ai_strategy_level: 2,
    ai_style: 0,
    ai_base_power: 5,
    ai_experience: 5,
    ai_temperature: 0.0,
    game_weight: {},
    ai_preference: {},
    custom_level_count: [],
  };
  private originalPlayerNames: string[] = Array(2).fill("");

  public isPlaying = false;

  private gameLogData: GameLogData | null = null;
  private actionIndex = 0;
  private speed: number = 1;
  private replayTimerId: number | null = null;
  private lastTickTime: number = 0;

  public state = reactive({
    isPlaying: false,
    isReplayFinished: false,
    currentTime: 0,
    totalTime: 0,
  });

  // 开始回放
  public startReplay(): void {
    if (!this.gameLogData) return;

    this.cleanupPreviousReplay();
    this.gameStore.setReplayMode(true);

    //  备份当前房间配置和玩家名称
    for (const i in this.roomStore.roomConfig) {
      this.originalRoomConfig[i] = this.roomStore.roomConfig[i];
    }
    this.originalPlayerNames = [...this.roomStore.roomData.names];

    //  设置回放用的房间配置和玩家名称
    for (const i in this.gameLogData.roomConfig) {
      this.roomStore.roomConfig[i] = this.gameLogData.roomConfig[i];
    }
    this.roomStore.roomData.names = [...this.gameLogData.players];

    //  基于回放数据初始化游戏
    this.initGameData();

    //  初始化回放状态
    this.actionIndex = 0;
    this.state.totalTime = this.getTotalTime();
    this.state.currentTime = 0;
    this.state.isReplayFinished = false;
    this.state.isPlaying = true;
    this.speed = 1;

    //  启动计时器
    this.startReplayTimer();
  }

  // 启动/重启回放计时器
  private startReplayTimer(): void {
    if (this.replayTimerId) clearInterval(this.replayTimerId);

    this.lastTickTime = Date.now();
    this.replayTimerId = window.setInterval(() => {
      if (!this.state.isPlaying || !this.gameLogData) return;

      // 1. 基于增量时间和速度更新当前时间
      const now = Date.now();
      const deltaTime = now - this.lastTickTime;
      this.lastTickTime = now;
      this.state.currentTime += deltaTime * this.speed;

      // 2. 执行待处理的动作
      this.executePendingActions();

      // 3. 检查回放是否结束
      if (this.actionIndex >= this.gameLogData.actions.length) {
        this.state.isReplayFinished = true;
        this.state.isPlaying = false;
        if (this.replayTimerId) {
          clearInterval(this.replayTimerId);
          this.replayTimerId = null;
        }
      }
    }, 10);
  }

  // 暂停回放
  public pauseReplay(): void {
    this.state.isPlaying = false;
    if (this.replayTimerId) {
      clearInterval(this.replayTimerId);
      this.replayTimerId = null;
    }
  }

  // 恢复回放
  public resumeReplay(): void {
    if (!this.state.isPlaying && !this.state.isReplayFinished) {
      this.state.isPlaying = true;
      this.startReplayTimer();
    }
  }

  // 设定速度 (已简化)
  public setSpeed(speed: number): void {
    this.speed = speed;
  }

  // 执行待处理的动作
  private executePendingActions(): void {
    if (!this.gameLogData) return;

    const actions = this.gameLogData.actions;

    // 执行所有应该在当前时间之前执行的动作
    // 使用 this.state.currentTime 进行判断
    while (this.actionIndex < actions.length && actions[this.actionIndex].timestamp <= this.state.currentTime) {
      this.executeAction(actions[this.actionIndex]);
      this.actionIndex++;
    }
  }

  // 初始化游戏数据
  private initGameData(): void {
    if (!this.gameLogData) return;

    // 设置spells和spells2
    this.gameStore.spells = [...this.gameLogData.spells];
    if (this.gameLogData.spells2) {
      this.gameStore.spells2 = [...this.gameLogData.spells2];
    }

    // 设置normalData
    if (this.gameLogData.normalData) {
      for (const i in this.gameLogData.normalData) {
        this.gameStore.normalGameData[i] = this.gameLogData.normalData[i];
      }
    }

    // 设置初始spellStatus
    this.gameStore.spellStatus = [...this.gameLogData.initStatus];

    // 标记游戏开始
    this.roomStore.roomData.started = true;
    this.gameStore.leftTime = this.roomStore.roomConfig.game_time * 1000 * 60 * 9;
  }

  // 执行单个操作
  private executeAction(action: PlayerAction): void {
    switch (action.actionType.split("-")[0]) {
      case "select":
        this.handleSelect(action);
        break;
      case "finish":
      case "contest_win":
        this.handleFinish(action);
        break;
      case "pause":
        this.handlePause();
        break;
      case "resume":
        this.handleResume();
        break;
      case "set":
        this.handleSetSpellStatus(action);
        break;
    }
  }

  // 处理选择操作
  private handleSelect(action: PlayerAction): void {
    const playerIndex = this.gameLogData?.players.indexOf(action.playerName) || 0;
    if (playerIndex === 0) {
      this.gameStore.spellStatus[action.spellIndex] =
        this.gameStore.spellStatus[action.spellIndex] === SpellStatus.B_SELECTED
          ? SpellStatus.BOTH_SELECTED
          : SpellStatus.A_SELECTED;
    } else {
      this.gameStore.spellStatus[action.spellIndex] =
        this.gameStore.spellStatus[action.spellIndex] === SpellStatus.A_SELECTED
          ? SpellStatus.BOTH_SELECTED
          : SpellStatus.B_SELECTED;
    }
  }

  // 处理完成操作
  private handleFinish(action: PlayerAction): void {
    const playerIndex = this.gameLogData?.players.indexOf(action.playerName) || 0;
    this.gameStore.spellStatus[action.spellIndex] = playerIndex === 0 ? SpellStatus.A_ATTAINED : SpellStatus.B_ATTAINED;
  }

  // 处理暂停操作
  private handlePause(): void {
    this.gameStore.gameStatus = GameStatus.PAUSED;
  }

  // 处理恢复操作
  private handleResume(): void {
    this.gameStore.gameStatus = GameStatus.STARTED;
  }

  // 处理设置spellStatus操作
  private handleSetSpellStatus(action: PlayerAction): void {
    const status = parseInt(action.actionType.split("-")[1], 10);
    this.gameStore.spellStatus[action.spellIndex] = status;
  }

  // 结束回放
  public endReplay(): void {
    this.pauseReplay(); // 先暂停并清理计时器
    this.state.isReplayFinished = false;
    this.gameStore.setReplayMode(false);
    this.roomStore.roomData.started = false;

    // 恢复原始房间配置和玩家名称
    for (const i in this.originalRoomConfig) {
      this.roomStore.roomConfig[i] = this.originalRoomConfig[i];
    }
    this.roomStore.roomData.names = [...this.originalPlayerNames];

    // 重置游戏状态
    this.gameStore.resetGameData();
  }

  // 获取总时间（用于UI显示）
  public getTotalTime(): number {
    if (!this.gameLogData || this.gameLogData.actions.length === 0) return 0;
    return this.gameLogData.actions[this.gameLogData.actions.length - 1].timestamp;
  }

  private cleanupPreviousReplay(): void {
    // 清理计时器
    if (this.replayTimerId) {
      clearInterval(this.replayTimerId);
      this.replayTimerId = null;
    }

    // 重置所有状态变量
    this.actionIndex = 0;
    this.isPlaying = false;

    // 重置游戏状态
    this.gameStore.resetGameData();
  }

  // 跳转到指定时间点
  public jumpToTime(timestamp: number): void {
    if (!this.gameLogData) return;

    // 暂停回放，防止在状态计算时发生冲突
    const wasPlaying = this.state.isPlaying;
    if (wasPlaying) {
      this.pauseReplay();
    }

    // 重置游戏数据到初始状态
    this.initGameData();

    // 设置当前时间
    this.state.currentTime = timestamp;

    // 从头开始执行所有在目标时间戳之前的 actions
    this.actionIndex = 0;
    const actions = this.gameLogData.actions;

    while (this.actionIndex < actions.length && actions[this.actionIndex].timestamp <= timestamp) {
      this.executeAction(actions[this.actionIndex]);
      this.actionIndex++;
    }

    // 更新回放结束状态
    this.state.isReplayFinished =
      this.actionIndex >= this.gameLogData.actions.length && timestamp >= this.state.totalTime;

    // 如果之前是播放状态，则恢复播放
    if (wasPlaying && !this.state.isReplayFinished) {
      this.resumeReplay();
    }
  }

  public getDifficultyFix = (spell: Spell): number => {
    const difficulty = spell.difficulty;
    const max = spell.max_cap_rate;
    if(difficulty < 7) return max;
    if(difficulty < 17) return max * (1.0 - (difficulty - 7) * 0.03);
    return max * 0.7;
  };

  public uint8ArrayToBase64 = (array: Uint8Array): string => {
    // 将每个字节转换为字符
    let binaryString = "";
    for (let i = 0; i < array.length; i++) {
      binaryString += String.fromCharCode(array[i]);
    }
    // 使用 btoa 进行Base64编码
    return btoa(binaryString);
  };

  public formatStringWithLineBreaks = (str: string, lineLength: number): string => {
    const regex = new RegExp(`.{1,${lineLength}}`, "g");
    const lines = str.match(regex);
    return lines ? lines.join("\n") : "";
  };

  public parseReplayData = (replayCodeBlock: string, loadData: boolean=true): ReplayPayload | null => {
    try {
      // 1. 匹配并提取所有Base64有效字符，自动忽略换行、空格等无效字符
      // [A-Za-z0-9+/=] 是Base64字符集。我们把它们拼接成一个干净的字符串。
      const validBase64Chars = replayCodeBlock.match(/[A-Za-z0-9+/=]/g);
      if (!validBase64Chars) {
        throw new Error("无效的回放输入");
      }
      const cleanBase64 = validBase64Chars.join("");

      // 2. Base64 解码 -> 二进制字符串
      const binaryString = atob(cleanBase64);

      // 3. 二进制字符串 -> Uint8Array
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 4. Pako 解压缩 -> 原始JSON字符串
      const jsonString = pako.inflate(bytes, { to: "string" });

      // 5. 解析JSON字符串为对象
      const parsedPayload: ReplayPayload = JSON.parse(jsonString);

      // 6. 验证结构并恢复版本号和原始数据
      if (typeof parsedPayload.version !== "string" || typeof parsedPayload.data !== "object") {
        throw new Error("解析出的数据格式不正确");
      }

      console.log(`成功解析回放数据，版本号: ${parsedPayload.version}`);

      if(loadData) this.gameLogData = parsedPayload.data;

      return {
        version: parsedPayload.version,
        data: parsedPayload.data,
      };
    } catch (error) {
      throw new Error("回放数据解析错误");
      return null;
    }
  };

  public fetchAndProcessGameLog = async () => {
    try {
      const logObject: GameLogData = await ws.send(WebSocketActionType.PRINT_LOG);

      if (typeof logObject !== "object" || logObject === null) {
        throw new Error("收到的日志格式不正确，期望是一个对象");
      }

      // 将spells对象附加到actions上，方便后续处理
      logObject.actions.forEach((action) => {
        if (action.spellIndex >= 0) {
          action.spell = logObject.spells[action.spellIndex];
        }
      });

      const dataToEncode: ReplayPayload = {
        version: REPLAY_DATA_VERSION,
        data: logObject,
      };

      const originalLogString = JSON.stringify(dataToEncode);

      const compressedData = pako.deflate(originalLogString);

      const replayDataB64 = this.uint8ArrayToBase64(compressedData);

      const formattedLog = this.formatLogForDownload(logObject, replayDataB64);
      this.triggerDownload(formattedLog, logObject);
    } catch (error) {
      console.error("获取或处理游戏日志失败:", error);
      throw error;
    }
  };

  public triggerDownload = (content: string, logData: GameLogData) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    //文件命名加入时分信息
    const date = new Date(logData.gameStartTimestamp);
    const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date
      .getDate()
      .toString()
      .padStart(2, "0")}`;
    const timeStr = `${date.getHours().toString().padStart(2, "0")}${date.getMinutes().toString().padStart(2, "0")}`;
    a.download = `BingoLog_${dateStr}_${timeStr}_${logData.players[0]}_vs_${logData.players[1]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  public formatLogForDownload = (logData: GameLogData, replayDataB64: string): string => {
    const { roomConfig, players, score, spells, spells2, actions, gameStartTimestamp, normalData } = logData;
    const output: string[] = [];
    // 辅助函数
    const formatTimestamp = (ms: number) => {
      const totalSeconds = Math.floor(ms / 1000);
      const minutes = Math.floor(totalSeconds / 60)
        .toString()
        .padStart(2, "0");
      const seconds = (totalSeconds % 60).toString().padStart(2, "0");
      return `${minutes}:${seconds}`;
    };

    const customPadEnd = (str: string, targetLength: number, padString = " "): string => {
      const wideCharRegex = /[\u4e00-\u9fa5\uff00-\uffef]/g;
      const visualLength = str.replace(wideCharRegex, "  ").length;
      const paddingLength = targetLength - visualLength;
      if (paddingLength <= 0) {
        return str;
      }
      return str + padString.repeat(paddingLength);
    };

    const isCustomGame = logData.isCustomGame || false;

    // 1. 基础信息
    output.push(`东方Bingo对战日志`);
    output.push(`对局开始时间: ${new Date(gameStartTimestamp).toLocaleString()}`);
    output.push(`玩家: ${players[0]} vs ${players[1]}`);
    output.push(`最终比分: ${score[0]} - ${score[1]}`);
    output.push("---");

    // 2. 游戏设置
    output.push("【游戏设置】");
    output.push(`模式: ${Config.gameTypeList.find((g) => g.type === roomConfig.type)?.name || "未知"}`);
        
    // 显示CD信息，如果有修正值则显示实际CD
    let cdInfo = `时长: ${roomConfig.game_time}分钟, 倒计时: ${roomConfig.countdown}秒, cd： ${roomConfig.cd_time}秒`;
    if (roomConfig.cd_modifier_a !== undefined && roomConfig.cd_modifier_a !== 0 || 
        roomConfig.cd_modifier_b !== undefined && roomConfig.cd_modifier_b !== 0) {
      const actualA = Math.max(1, Math.min(roomConfig.cd_time + (roomConfig.cd_modifier_a || 0), roomConfig.cd_time * 3));
      const actualB = Math.max(1, Math.min(roomConfig.cd_time + (roomConfig.cd_modifier_b || 0), roomConfig.cd_time * 3));
      cdInfo += ` (左侧: ${actualA}秒, 右侧: ${actualB}秒)`;
    }
    output.push(cdInfo);
    // 1. 添加符卡来源与游戏难度
    if(isCustomGame){
      output.push(`卡池：自定义`);
    }else{
      output.push(`卡池：${Config.spellVersionList.find((n) => n.type === roomConfig.spell_version)?.name}`);
      const gameNames = roomConfig.games.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .map((code) => Config.gameOptionList(this.roomStore.roomConfig.spell_version).find((g) => g.code === code)?.name)
        .filter(Boolean)
        .join(", ");
      output.push(`作品来源: ${gameNames || "未指定"}`);
      output.push(`符卡难度: ${roomConfig.ranks.join(", ") || "未指定"}`);
      const difficultyName = Config.difficultyList.find((d) => d.value === roomConfig.difficulty)?.name;
      output.push(`盘面难度: ${difficultyName || "未知"}`);
      let gw = "";
      for (const [gameCode, weight] of Object.entries(roomConfig.game_weight)) {
        if (weight != 0) {
          const gameName =
            gameCode === "weight_balancer"
              ? "生成波动"
              : Config.gameOptionList(this.roomStore.roomConfig.spell_version).find((g) => g.code === gameCode)?.name ||
              "";
          if (gameName === "") {
            continue;
          }
          gw += `${gameName}：${weight}；`;
        }
      }
      if (gw != "") {
        output.push(`游戏生成权重设定：${gw}`);
      }
      if (roomConfig.blind_setting > 1) {
        output.push(`盲盒设定: 模式${roomConfig.blind_setting - 1}, 揭示等级${roomConfig.blind_reveal_level}`);
      }
      if (roomConfig.dual_board > 0) {
        output.push(
          `双重盘面: ${
            roomConfig.dual_board > 0
              ? `开启 (转换格: ${roomConfig.portal_count}, 差异等级: ${roomConfig.diff_level})`
              : "关闭"
          }`
        );
      }
      if (roomConfig.use_ai) {
        output.push(
          `AI参数：Lv.${roomConfig.ai_base_power} / Lv.${roomConfig.ai_experience} 策略等级：${roomConfig.ai_strategy_level} 选卡温度：${roomConfig.ai_temperature}`
        );
        let ai_pref = "";
        for (const [gameCode, pref] of Object.entries(roomConfig.ai_preference)) {
          if (pref != 0) {
            const gameName =
              Config.gameOptionList(this.roomStore.roomConfig.spell_version).find((g) => g.code === gameCode)?.name || "";
            if (gameName === "") {
              continue;
            }
            ai_pref += `${gameName}：${pref}；`;
          }
        }
        if (ai_pref != "") {
          output.push(`AI作品相性：${ai_pref}`);
        }
      }
    }

    output.push("---");

    // 3. 盘面符卡
    const formatBoard = (boardSpells: Spell[], portals: number[] | undefined, title: string) => {
      output.push(title);
      const CELL_WIDTH = 32; // 定义每个单元格的视觉宽度
      for (let i = 0; i < 5; i++) {
        let row = customPadEnd(`${i + 1} | `, 5);
        for (let j = 0; j < 5; j++) {
          const index = i * 5 + j;
          const spell = boardSpells[index];
          const isPortal = portals && portals[index] === 1 ? " (P)" : "";
          const cellContent = `${spell.name.trim()}${isPortal} | `;
          row += customPadEnd(cellContent, CELL_WIDTH);
        }
        output.push(row);
      }

      output.push("【等级分布】");
      for (let i = 0; i < 5; i++) {
        let row = customPadEnd(`${i + 1} | `, 5);
        for (let j = 0; j < 5; j++) {
          const index = i * 5 + j;
          const spell = boardSpells[index];
          const isPortal = portals && portals[index] === 1 ? " (P)" : "";
          const cellContent = `${spell.star}${isPortal} | `;
          row += customPadEnd(cellContent, 8);
        }
        output.push(row);
      }
    };
    formatBoard(spells, normalData?.is_portal_a, "【盘面A】");
    if (roomConfig.dual_board > 0 && spells2) {
      output.push("");
      formatBoard(spells2, normalData?.is_portal_b, "【盘面B】");
    }
    output.push("---");

    // 4. 游戏进程
    output.push("【游戏进程】");
    const playerBoards: { [key: string]: number } = { [players[0]]: 0, [players[1]]: 0 };
    // 预处理，为每个玩家的 select 动作找到对应的 finish
    const playerSelectHistory: { [key: string]: PlayerAction[] } = { [players[0]]: [], [players[1]]: [] };

    actions.forEach((action) => {
      // 4. 时间格式化 & 添加行列信息
      const timeStr = `[${formatTimestamp(action.timestamp)}]`;
      let logLine = `${timeStr} `;
      const boardInfo = roomConfig.dual_board > 0 ? `(盘面${playerBoards[action.playerName] === 0 ? "A" : "B"}) ` : "";
      const spellLocation =
        action.spellIndex >= 0 ? `(${Math.floor(action.spellIndex / 5) + 1}, ${(action.spellIndex % 5) + 1}) ` : "";

      if (action.actionType === "pause") {
        logLine += `${action.playerName} 暂停了游戏。`;
      } else if (action.actionType === "resume") {
        logLine += `${action.playerName} 恢复了游戏。`;
      } else if (action.actionType.startsWith("set-")) {
        const status_string = action.actionType.split("-")[1];
        const status = parseInt(status_string, 10);
        let status_name = "";
        if (status === SpellStatus.NONE) {
          status_name = "置空";
        } else if (status === SpellStatus.A_SELECTED) {
          status_name = "左侧玩家选择";
        } else if (status === SpellStatus.B_SELECTED) {
          status_name = "右侧玩家选择";
        } else if (status === SpellStatus.BOTH_SELECTED) {
          status_name = "双方玩家选择";
        } else if (status === SpellStatus.A_ATTAINED) {
          status_name = "左侧玩家收取";
        } else if (status === SpellStatus.B_ATTAINED) {
          status_name = "右侧玩家收取";
        } else if (status === SpellStatus.BOTH_ATTAINED) {
          status_name = "双方玩家收取";
        } else {
          status_name = "未知";
        }
        logLine += `${action.playerName} 将 "${action.spellName}" 设置为 ${status_name} 状态。当前比分：${action.scoreNow[0]}-${action.scoreNow[1]}。`;
      } else {
        logLine += `玩家 ${action.playerName} ${boardInfo}`;
        switch (action.actionType) {
          case "select":
            logLine += `选择了符卡 ${spellLocation}"${action.spellName}"。`;
            playerSelectHistory[action.playerName].push(action);
            break;
          case "finish":
          case "contest_win":
            const verb = action.actionType === "contest_win" ? "抢了" : "收取了";
            logLine += `${verb}符卡 ${spellLocation}"${action.spellName}"。`;

            // 4. 计算并显示用时
            const lastSelect = playerSelectHistory[action.playerName].pop();
            if (lastSelect) {
              const startTime = Math.max(lastSelect.timestamp, roomConfig.countdown * 1000);
              const endTime = action.timestamp;
              let pauseDurationInInterval = 0;
              let pStart = 0;
              actions.forEach((pAction) => {
                if (pAction.timestamp > startTime && pAction.timestamp < endTime) {
                  if (pAction.actionType === "pause") pStart = pAction.timestamp;
                  if (pAction.actionType === "resume" && pStart > 0) {
                    pauseDurationInInterval += pAction.timestamp - pStart;
                    pStart = 0;
                  }
                }
              });
              const duration = endTime - startTime - pauseDurationInInterval;
              if (duration > 0) {
                logLine += ` (用时: ${(duration / 1000).toFixed(2)}s)`;
              }
              logLine += `(比分：${action.scoreNow[0]}-${action.scoreNow[1]})`;
            }
            break;
        }

        // 处理双盘面翻转
        if (
          roomConfig.dual_board > 0 &&
          normalData &&
          (action.actionType === "finish" || action.actionType === "contest_win")
        ) {
          const currentBoard = playerBoards[action.playerName];
          const portals = currentBoard === 0 ? normalData.is_portal_a : normalData.is_portal_b;
          if (portals && portals[action.spellIndex] === 1) {
            playerBoards[action.playerName] = 1 - currentBoard;
            logLine += ` (切换至盘面${playerBoards[action.playerName] === 0 ? "A" : "B"})`;
          }
        }
      }
      output.push(logLine);
    });
    output.push("---");

    // 5. 评价汇总
    // 5. 评价汇总
    output.push('【数据分析】');
    const countdownMs = roomConfig.countdown * 1000;

    // New data structure for player stats
    const playerStats: { [key: string]: any } = {};
    players.forEach(player => {
      playerStats[player] = {
        selectStack: [],
        totalTime: 0,
        totalFastest: 0,
        totalFastestWeighted: 0,
        totalStars: [0, 0, 0, 0, 0],
        completedTasks: [],
        stolenTasks: [], // For stolen cards
        untrackedFinishes: 0,
        stolenCount: 0,
        stolenTime: 0, // Time lost to stolen cards
      };
    });

    const getSpellForAction = (action: PlayerAction): Spell | undefined => {
      if (!roomConfig.dual_board || !normalData || !spells2) {
        return spells[action.spellIndex];
      }
      // getOnWhichBoard: 0x1: Left/A, 0x2: Left/B, 0x10: Right/A, 0x20: Right/B
      const getInfo = normalData.get_on_which_board[action.spellIndex];
      const playerIndex = players.indexOf(action.playerName);
      const boardFlag = playerIndex === 0 ? (getInfo & 0x0F) : (getInfo >> 4);

      if (boardFlag === 1) return spells[action.spellIndex]; // 在盘面A收取
      if (boardFlag === 2) return spells2[action.spellIndex]; // 在盘面B收取

      // 如果没有收取信息（比如只是select），则根据当前玩家所在盘面判断
      const playerBoard = playerBoards[action.playerName] || 0;
      return playerBoard === 0 ? spells[action.spellIndex] : spells2[action.spellIndex];
    };

    // Single pass through actions to process data for both players
    for (const action of actions) {
      const player = action.playerName;
      if (!player) continue;
      const opponent = players.find(p => p !== player)!;
      const stats = playerStats[player];
      const opponentStats = playerStats[opponent];

      const playerIndex = players.indexOf(player);
      const isHost = playerIndex === -1;

      if (action.actionType === 'select') {
        stats.selectStack.push(action);
      } else if (action.actionType.startsWith('set-')) {
        const status_string = action.actionType.split('-')[1];
        const status = parseInt(status_string, 10);

        // New Rule: If this set action overwrites an opponent's selection, it's a steal.
        const opponentLastSelect = opponentStats.selectStack[opponentStats.selectStack.length - 1];
        if (opponentLastSelect && opponentLastSelect.spellIndex === action.spellIndex) {
          const isPlayerAStealing = playerIndex === 0 && (status === SpellStatus.A_ATTAINED);
          const isPlayerBStealing = playerIndex === 1 && (status === SpellStatus.B_ATTAINED);

          if (isPlayerAStealing || isPlayerBStealing) {
            opponentStats.selectStack.pop(); // Remove the stolen selection
            opponentStats.stolenCount++;

            const spell = getSpellForAction(action);
            if (spell) {
              const startTime = Math.max(opponentLastSelect.timestamp, countdownMs);
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
                opponentStats.stolenTime += duration;
                opponentStats.stolenTasks.push(`- "${spell.name}" (被抢): ${(duration / 1000).toFixed(2)}s`);
              }
            }
          }
        }

        // 1) set-X as a selection
        // host select also accounts for both players
        const isPlayerASelect = (playerIndex === 0 || isHost) && (status === SpellStatus.A_SELECTED || status === SpellStatus.BOTH_SELECTED);
        const isPlayerBSelect = (playerIndex === 1 || isHost) && (status === SpellStatus.B_SELECTED || status === SpellStatus.BOTH_SELECTED);
        if (isPlayerASelect || isPlayerBSelect) {
          stats.selectStack.push(action);
        }

        // 2) set-X as a collection
        const isPlayerAAttain = playerIndex === 0 && status === SpellStatus.A_ATTAINED;
        const isPlayerBAttain = playerIndex === 1 && status === SpellStatus.B_ATTAINED;
        if (isPlayerAAttain || isPlayerBAttain) {
          const lastSelect = stats.selectStack.length > 0 ? stats.selectStack[stats.selectStack.length - 1] : undefined;
          if (lastSelect && lastSelect.spellIndex === action.spellIndex) {
            stats.selectStack.pop(); // Matched selection
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
              stats.totalTime += duration;
              stats.totalFastest += spell.fastest;
              stats.totalStars[spell.star - 1] += 1;
              stats.totalFastestWeighted += spell.fastest + 3.5 + (1 / this.getDifficultyFix(spell) - 1) * (spell.miss_time + 1.5);
              stats.completedTasks.push(`- "${spell.name}": ${(duration / 1000).toFixed(2)}s`);
            }
          } else {
            stats.untrackedFinishes++;
          }
        }
      } else if (action.actionType === 'finish' || action.actionType === 'contest_win') {
        const lastSelect = stats.selectStack.pop();
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
            stats.totalTime += duration;
            stats.totalFastest += spell.fastest;
            stats.totalStars[spell.star - 1] += 1;
            stats.totalFastestWeighted += spell.fastest + 3.5 + (1 / this.getDifficultyFix(spell) - 1) * (spell.miss_time + 1.5);
            stats.completedTasks.push(`- "${spell.name}": ${(duration / 1000).toFixed(2)}s`);
          }
        } else {
          stats.untrackedFinishes++;
        }

        // 3) Contest loss for opponent
        if (action.actionType === 'contest_win') {
          const opponentLastSelect = opponentStats.selectStack[opponentStats.selectStack.length - 1];
          if (opponentLastSelect && opponentLastSelect.spellIndex === action.spellIndex) {
            opponentStats.selectStack.pop();
            opponentStats.stolenCount++;

            const spell = getSpellForAction(action);
            if (!spell) continue;

            const startTime = Math.max(opponentLastSelect.timestamp, countdownMs);
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
              opponentStats.stolenTime += duration;
              opponentStats.stolenTasks.push(`- "${spell.name}" (被抢): ${(duration / 1000).toFixed(2)}s`);
            }
          }
        }
      }
    }

    // Generate output from processed stats
    players.forEach(player => {
      output.push(`[玩家: ${player}]`);
      const stats = playerStats[player];

      // 4) Add stolen time to total time for efficiency calculation
      const totalEffectiveTime = stats.totalTime + stats.stolenTime;

      output.push(...stats.completedTasks);
      output.push(...stats.stolenTasks); // Show stolen tasks in the log

      if (stats.untrackedFinishes > 0) {
        output.push(`(有 ${stats.untrackedFinishes} 次收取操作因无前置选择或不匹配而未计入效率统计)`);
      }
      if (stats.stolenCount > 0) {
        output.push(`(有 ${stats.stolenCount} 张选择的符卡被对手抢走)`);
      }

      output.push(`总计收取 ${stats.completedTasks.length} 张符卡，等级分布: [${stats.totalStars.join(',')}]`);
      output.push(`总收卡时间: ${formatTimestamp(totalEffectiveTime)} (收取: ${formatTimestamp(stats.totalTime)}, 被抢损失: ${formatTimestamp(stats.stolenTime)})`);

      if (Config.spellListWithTimer.includes(roomConfig.spell_version) && !isCustomGame) {
        const efficiency = stats.totalTime > 0 ? ((stats.totalFastest * 1000) / stats.totalTime * 100).toFixed(2) : 'N/A';
        output.push(`纯收卡效率: ${efficiency}%`);
        
        // 计算该选手在本局游戏内可行动的总时间
        // 获取全局最后一次得分时间
        const lastScoreTime = actions.length > 0 ? actions[actions.length - 1].timestamp : 0;
        // 游戏设定最大时间（毫秒）
        const maxGameTimeMs = roomConfig.game_time * 60 * 1000;
        // min(全局最后一次得分时间 - countdown, 游戏设定最大时间)
        const availableTimeBase = Math.min(lastScoreTime - countdownMs, maxGameTimeMs);
        // 该选手的CD（毫秒），考虑CD修正值
        const playerIndex = players.indexOf(player);
        const cdModifier = playerIndex === 0 ? (roomConfig.cd_modifier_a || 0) : (roomConfig.cd_modifier_b || 0);
        const playerCdMs = (Math.max(1, Math.min(roomConfig.cd_time + cdModifier, roomConfig.cd_time * 3))) * 1000;
        // 该选手比分
        const playerScore = score[playerIndex] || 0;
        // 可行动时间 = 基础可用时间 - 选手CD * min(11, 选手比分 - 1)
        const cdPenalty = playerCdMs * Math.min(11, Math.max(0, playerScore - 1));
        const totalAvailableTime = Math.max(0, availableTimeBase - cdPenalty);
        
        const eff_weighted = totalAvailableTime > 0 ? ((stats.totalFastestWeighted * 1000) / totalAvailableTime * 100).toFixed(2) : 'N/A';
        output.push(`总时间效率: ${eff_weighted}%`);
      }
      output.push('');
    });

    const formattedReplayData = this.formatStringWithLineBreaks(replayDataB64, 128);
    output.push("\n\n--- DO NOT EDIT BELOW THIS LINE ---");
    output.push("本局回放代码：\n");
    output.push(formattedReplayData);

    return output.join("\n");
  };
}

export default new Replay();
