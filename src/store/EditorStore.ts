import { defineStore } from "pinia";
import { reactive, ref, watch } from "vue";
import { useRoomStore } from "./RoomStore";
import { useGameStore } from "./GameStore"; // 引入 GameStore
import { Spell, SpellStatus, RoomConfig, EditorPreset } from "@/types";
import { local } from "@/utils/Storage";
import ws from "@/utils/webSocket/WebSocketBingo";
import { WebSocketActionType } from "@/utils/webSocket/types";
import pako from "pako";

// 创建一个默认的空白Spell对象
const createBlankSpell = (): Spell => ({
  index: 0,
  game: "",
  name: "",
  rank: "",
  star: 1,
  desc: "",
  id: 0,
  fastest: 0,
  miss_time: 0,
  power_weight: 0,
  difficulty: 0,
  change_rate: 0,
  max_cap_rate: 0,
});

interface CacheEntry {
  data: Spell[];
  timestamp: number;
}

const CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 hours

export const useEditorStore = defineStore("editor", () => {
  const roomStore = useRoomStore();
  const gameStore = useGameStore(); // 使用 GameStore

  // --- 基础状态 ---
  const isEditorMode = ref(false);
  const spells = ref<Spell[]>([]);
  const spells2 = ref<Spell[]>([]);
  const spellStatus = ref<SpellStatus[]>([]);
  // const currentBoard = ref(0); // 移除：统一使用 gameStore.currentBoard

  // 兼容 GameStore 接口的数据结构
  const bpGameData = reactive({ spell_failed_count_a: [], spell_failed_count_b: [] });
  const normalGameData = reactive({
    is_portal_a: [] as number[],
    is_portal_b: [] as number[],
  });

  // --- 初始状态设定 ---
  const initialLeftTime = ref(1800); // 秒
  const initialCountDown = ref(120);
  const initialCdTimeA = ref(0);
  const initialCdTimeB = ref(0);

  // --- 交互状态 ---
  const selectedSpellIndex = ref(-1);
  const isEditorModalVisible = ref(false);
  const clipboard = ref<Partial<Spell> | null>(null);

  // --- 数据库与面板 ---
  const isDatabasePanelVisible = ref(false);
  const localSpellDatabase = ref<Spell[]>(local.get("custom_spell_database") || []);
  const serverSpellCache = ref<Map<number, CacheEntry>>(new Map());
  const isFetchingServerData = ref(false);

  // --- 弹窗控制 ---
  const isInitialStateModalVisible = ref(false);
  const isPresetManagerVisible = ref(false);

  // --- 预设与备份 ---
  const presets = ref<EditorPreset[]>(local.get("editor_presets") || []);
  // 用于退出编辑器时恢复 roomStore 的真实配置
  const originalRoomConfigBackup = ref<RoomConfig | null>(null);

  let autoSaveTimer: number | null = null;
  const presetManagerMode = ref<'manage' | 'select'>('manage');

  const openPresetManager = (mode: 'manage' | 'select' = 'manage') => {
    presetManagerMode.value = mode;
    isPresetManagerVisible.value = true;
  };

  // --- 监听双盘面设置变化 ---
  watch(
    () => roomStore.roomConfig.dual_board,
    (newVal) => {
      if (!isEditorMode.value) return;

      if (newVal > 0) {
        // 开启双盘面：如果 spells2 为空，则初始化
        if (spells2.value.length === 0) {
          spells2.value = Array.from({ length: 25 }, () => createBlankSpell());
          // 注意：这里不重置 is_portal_b，保留可能存在的隐藏数据
          if (normalGameData.is_portal_b.length === 0) {
            normalGameData.is_portal_b = Array(25).fill(0);
          }
        }
      } else {
        // 关闭双盘面：切回盘面0
        // 关键修改：不清除 spells2 和 portal 数据，仅切换显示
        gameStore.currentBoard = 0;
      }
    }
  );

  // --- 核心逻辑 ---

  // 自动存档相关常量
  const AUTO_SAVE_START_ID = 100; // 101-110 对应 id 100-109
  const AUTO_SAVE_COUNT = 10;
  const AUTO_SAVE_INTERVAL = 180000; // 180秒

  const enterEditorMode = () => {
    originalRoomConfigBackup.value = JSON.parse(JSON.stringify(roomStore.roomConfig));

    // 加载最新的自动存档（从101-110中找最新的）
    const autoSaveSlots = presets.value.filter(p => 
      p.id >= AUTO_SAVE_START_ID && p.id < AUTO_SAVE_START_ID + AUTO_SAVE_COUNT
    );
    
    if (autoSaveSlots.length > 0) {
      // 找到时间戳最新的自动存档
      const latestAutoSave = autoSaveSlots.reduce((latest, current) => {
        return current.timestamp > latest.timestamp ? current : latest;
      });
      loadPresetData(latestAutoSave);
    } else {
      resetToBlank();
    }

    selectedSpellIndex.value = -1;
    isEditorMode.value = true;
    gameStore.currentBoard = 0;

    // 启动自动保存 (30秒)
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = window.setInterval(() => {
      saveAutoSave();
    }, AUTO_SAVE_INTERVAL);
  };

  const exitEditorMode = () => {
    // 停止自动保存
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer);
      autoSaveTimer = null;
    }
    // 退出时立即保存一次
    saveAutoSave();

    if (originalRoomConfigBackup.value) {
      Object.assign(roomStore.roomConfig, originalRoomConfigBackup.value);
      originalRoomConfigBackup.value = null;
    }

    spells.value = [];
    spells2.value = [];
    spellStatus.value = [];
    isEditorMode.value = false;

    isDatabasePanelVisible.value = false;
    isInitialStateModalVisible.value = false;
    isPresetManagerVisible.value = false;
    isEditorModalVisible.value = false;
    gameStore.currentBoard = 0;
  };

  const resetToBlank = () => {
    spells.value = Array.from({ length: 25 }, () => createBlankSpell());
    spellStatus.value = Array.from({ length: 25 }, () => SpellStatus.NONE);

    initialLeftTime.value = roomStore.roomConfig.game_time * 60;
    initialCountDown.value = 0;
    initialCdTimeA.value = 0;
    initialCdTimeB.value = 0;
    normalGameData.is_portal_a = Array(25).fill(0);

    // 即使当前是单盘面，也初始化 spells2 结构以便随时切换，但不显示
    spells2.value = Array.from({ length: 25 }, () => createBlankSpell());
    normalGameData.is_portal_b = Array(25).fill(0);
  };

  const clearAllSpells = () => {
    spells.value = Array.from({ length: 25 }, () => createBlankSpell());
    spells2.value = Array.from({ length: 25 }, () => createBlankSpell());
    spellStatus.value = Array.from({ length: 25 }, () => SpellStatus.NONE);
    normalGameData.is_portal_a = Array(25).fill(0);
    normalGameData.is_portal_b = Array(25).fill(0);
  };

  // 洗混格子：只洗混当前面
  const shuffleSpells = () => {
    const currentBoard = gameStore.currentBoard;
    const targetSpells = currentBoard === 0 ? spells.value : spells2.value;
    const targetPortals = currentBoard === 0 ? normalGameData.is_portal_a : normalGameData.is_portal_b;

    // 收集非空格子的信息（包含原始索引）
    interface CellInfo {
      index: number;
      spell: Spell;
      status: SpellStatus;
      isPortal: number;
      star: number;
    }

    const nonEmptyCells: CellInfo[] = [];
    for (let i = 0; i < 25; i++) {
      const spell = targetSpells[i];
      // 判断格子是否非空：name、game、rank 至少有一个有值
      if (spell.name || spell.game || spell.rank) {
        nonEmptyCells.push({
          index: i,
          spell: { ...spell },
          status: spellStatus.value[i],
          isPortal: targetPortals[i],
          star: spell.star || 0
        });
      }
    }

    // 筛选出评级>=4的格子
    const highRatedCells = nonEmptyCells.filter(cell => cell.star >= 4);

    // 如果不足5个评级>=4的格子，直接随机洗混所有非空格子
    if (highRatedCells.length < 5) {
      // Fisher-Yates 洗牌算法
      for (let i = nonEmptyCells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nonEmptyCells[i], nonEmptyCells[j]] = [nonEmptyCells[j], nonEmptyCells[i]];
      }

      // 清空当前面
      for (let i = 0; i < 25; i++) {
        targetSpells[i] = createBlankSpell();
        targetPortals[i] = 0;
      }

      // 将洗混后的格子放入前 N 个位置
      nonEmptyCells.forEach((cell, idx) => {
        targetSpells[idx] = cell.spell;
        targetPortals[idx] = cell.isPortal;
        spellStatus.value[idx] = cell.status;
      });

      return { success: true, message: '操作成功' };
    }

    // 有至少5个评级>=4的格子，需要特殊排布
    // 新规则：中心格(索引12)固定为高级格，其余4个高级格与中心格不同行不同列

    // 随机选择5个高评级格子
    const shuffledHighRated = [...highRatedCells];
    for (let i = shuffledHighRated.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledHighRated[i], shuffledHighRated[j]] = [shuffledHighRated[j], shuffledHighRated[i]];
    }
    const selected5 = shuffledHighRated.slice(0, 5);

    // 中心格位置
    const centerPos = 12; // 第3行第3列 (2*5+2)

    // 从selected5中随机选一个放在中心格
    const centerCellIndex = Math.floor(Math.random() * 5);
    const centerCell = selected5[centerCellIndex];
    // 剩下的4个高级格
    const other4Cells = selected5.filter((_, idx) => idx !== centerCellIndex);

    // 生成4个位置：不能与中心格同行(第2行)同列(第2列)
    // 可用位置是除去第2行和第2列的4x4子矩阵
    // 行：0,1,3,4；列：0,1,3,4
    const availableRows = [0, 1, 3, 4];
    const availableCols = [0, 1, 3, 4];

    // 随机排列列，确保每行一个不同列
    for (let i = availableCols.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableCols[i], availableCols[j]] = [availableCols[j], availableCols[i]];
    }

    // 4个高级格位置：每行一个，对应随机列
    const positions4 = availableRows.map((row, idx) => row * 5 + availableCols[idx]);

    // 剩余格子（未被选中的高评级格子 + 其他非空格子）
    const remainingCells = nonEmptyCells.filter(cell => !selected5.some(s => s.index === cell.index));
    // 随机洗混剩余格子
    for (let i = remainingCells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remainingCells[i], remainingCells[j]] = [remainingCells[j], remainingCells[i]];
    }

    // 清空当前面
    for (let i = 0; i < 25; i++) {
      targetSpells[i] = createBlankSpell();
      targetPortals[i] = 0;
    }

    // 放置中心高级格
    targetSpells[centerPos] = centerCell.spell;
    targetPortals[centerPos] = centerCell.isPortal;
    spellStatus.value[centerPos] = centerCell.status;

    // 放置其余4个高级格
    other4Cells.forEach((cell, idx) => {
      const pos = positions4[idx];
      targetSpells[pos] = cell.spell;
      targetPortals[pos] = cell.isPortal;
      spellStatus.value[pos] = cell.status;
    });

    // 放置剩余格子到剩余位置
    const usedPositions = new Set([centerPos, ...positions4]);
    let remainingIdx = 0;
    for (let i = 0; i < 25 && remainingIdx < remainingCells.length; i++) {
      if (!usedPositions.has(i)) {
        const cell = remainingCells[remainingIdx++];
        targetSpells[i] = cell.spell;
        targetPortals[i] = cell.isPortal;
        spellStatus.value[i] = cell.status;
      }
    }

    return { success: true, message: '操作成功' };
  };

  // --- 预设管理逻辑 ---

  const savePreset = (id: number, note: string) => {
    const presetData: EditorPreset = {
      id,
      note,
      timestamp: Date.now(),
      data: {
        spells: JSON.parse(JSON.stringify(spells.value)),
        spells2: JSON.parse(JSON.stringify(spells2.value)),
        spellStatus: [...spellStatus.value],
        roomConfig: JSON.parse(JSON.stringify(roomStore.roomConfig)), // 直接保存当前 roomStore 的配置
        initialLeftTime: initialLeftTime.value,
        initialCountDown: initialCountDown.value,
        initialCdTimeA: initialCdTimeA.value,
        initialCdTimeB: initialCdTimeB.value,
        isPortalA: [...normalGameData.is_portal_a],
        isPortalB: [...normalGameData.is_portal_b],
      }
    };

    const savePreset = (id: number, note: string) => {
      const presetData: EditorPreset = {
        id,
        note,
        timestamp: Date.now(),
        data: {
          spells: JSON.parse(JSON.stringify(spells.value)),
          spells2: JSON.parse(JSON.stringify(spells2.value)),
          spellStatus: [...spellStatus.value],
          roomConfig: JSON.parse(JSON.stringify(roomStore.roomConfig)),
          initialLeftTime: initialLeftTime.value,
          initialCountDown: initialCountDown.value,
          initialCdTimeA: initialCdTimeA.value,
          initialCdTimeB: initialCdTimeB.value,
          isPortalA: [...normalGameData.is_portal_a],
          isPortalB: [...normalGameData.is_portal_b],
        }
      };

      const index = presets.value.findIndex(p => p.id === id);
      if (index > -1) {
        presets.value[index] = presetData;
      } else {
        presets.value.push(presetData);
      }
      local.set("editor_presets", presets.value);
    };

    const index = presets.value.findIndex(p => p.id === id);
    if (index > -1) {
      presets.value[index] = presetData;
    } else {
      presets.value.push(presetData);
    }
    local.set("editor_presets", presets.value);
  };

  const loadPreset = (id: number) => {
    const preset = presets.value.find(p => p.id === id);
    if (preset) {
      loadPresetData(preset);
    }
  };

  const loadPresetData = (preset: EditorPreset) => {
    const d = preset.data;
    spells.value = d.spells;
    spells2.value = d.spells2 || [];
    spellStatus.value = d.spellStatus;

    // 恢复房间设置
    Object.assign(roomStore.roomConfig, d.roomConfig);

    initialLeftTime.value = d.initialLeftTime;
    initialCountDown.value = d.initialCountDown;
    initialCdTimeA.value = d.initialCdTimeA;
    initialCdTimeB.value = d.initialCdTimeB;
    normalGameData.is_portal_a = d.isPortalA || Array(25).fill(0);
    normalGameData.is_portal_b = d.isPortalB || Array(25).fill(0);

    // 确保数据结构完整
    if (spells2.value.length === 0) {
      spells2.value = Array.from({ length: 25 }, () => createBlankSpell());
    }
    if (normalGameData.is_portal_b.length === 0) {
      normalGameData.is_portal_b = Array(25).fill(0);
    }
  };

  const deletePreset = (id: number) => {
    const index = presets.value.findIndex(p => p.id === id);
    if (index > -1) {
      presets.value.splice(index, 1);
      local.set("editor_presets", presets.value);
    }
  };

  // 自动存档保存逻辑：轮询保存到101-110
  let lastAutoSaveId = AUTO_SAVE_START_ID;
  const saveAutoSave = () => {
    // 找到当前要保存的自动存档位置
    const targetId = lastAutoSaveId;
    
    // 保存预设
    const presetData: EditorPreset = {
      id: targetId,
      note: `自动存档 #${targetId - AUTO_SAVE_START_ID + 101}`,
      timestamp: Date.now(),
      data: {
        spells: JSON.parse(JSON.stringify(spells.value)),
        spells2: JSON.parse(JSON.stringify(spells2.value)),
        spellStatus: [...spellStatus.value],
        roomConfig: JSON.parse(JSON.stringify(roomStore.roomConfig)),
        initialLeftTime: initialLeftTime.value,
        initialCountDown: initialCountDown.value,
        initialCdTimeA: initialCdTimeA.value,
        initialCdTimeB: initialCdTimeB.value,
        isPortalA: [...normalGameData.is_portal_a],
        isPortalB: [...normalGameData.is_portal_b],
      }
    };

    const index = presets.value.findIndex(p => p.id === targetId);
    if (index > -1) {
      presets.value[index] = presetData;
    } else {
      presets.value.push(presetData);
    }
    local.set("editor_presets", presets.value);

    // 更新下一个保存位置
    lastAutoSaveId++;
    if (lastAutoSaveId >= AUTO_SAVE_START_ID + AUTO_SAVE_COUNT) {
      lastAutoSaveId = AUTO_SAVE_START_ID;
    }
  };

  const exportPresets = (ids: number[]) => {
    const exportData = presets.value.filter(p => ids.includes(p.id));
    const cleanData = exportData.map(p => {
      const { id, ...rest } = p;
      return rest;
    });
    const json = JSON.stringify(cleanData);
    const compressed = pako.deflate(json);
    let binary = '';
    const len = compressed.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(compressed[i]);
    }
    return btoa(binary);
  };

  const importPresets = (code: string, pageStartId: number = -1) => {
    try {
      const binary = atob(code);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const json = pako.inflate(bytes, { to: 'string' });
      const importedData: Omit<EditorPreset, 'id'>[] = JSON.parse(json);

      importedData.forEach((p, index) => {
        let targetId: number;
        if (pageStartId > -1) {
          targetId = pageStartId + index;
          if (targetId > 99) return;
        } else {
          return;
        }

        const newPreset: EditorPreset = {
          ...p,
          id: targetId
        };

        const existingIdx = presets.value.findIndex(existing => existing.id === targetId);
        if (existingIdx > -1) {
          presets.value[existingIdx] = newPreset;
        } else {
          presets.value.push(newPreset);
        }
      });

      local.set("editor_presets", presets.value);
      return true;
    } catch (e) {
      console.error("Import failed", e);
      return false;
    }
  };

  // 从指定页开始，顺序寻找空栏位导入预设
  const importPresetsToEmptySlots = (code: string, startPage: number) => {
    const result = {
      success: false,
      message: '',
      importedCount: 0,
      skippedCount: 0
    };

    try {
      const binary = atob(code);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const json = pako.inflate(bytes, { to: 'string' });
      const importedData: Omit<EditorPreset, 'id'>[] = JSON.parse(json);

      // 从起始页开始收集所有空栏位（排除自动存档区域 100-109）
      const emptySlots: number[] = [];
      for (let page = startPage; page <= 10; page++) {
        const pageStartId = (page - 1) * 10;
        for (let i = 0; i < 10; i++) {
          const slotId = pageStartId + i;
          if (slotId >= 100) break; // 跳过自动存档区域
          if (!presets.value.some(p => p.id === slotId)) {
            emptySlots.push(slotId);
          }
        }
      }

      let importedCount = 0;
      importedData.forEach((p, index) => {
        if (index < emptySlots.length) {
          const targetId = emptySlots[index];
          const newPreset: EditorPreset = {
            ...p,
            id: targetId
          };
          presets.value.push(newPreset);
          importedCount++;
        }
      });

      local.set("editor_presets", presets.value);

      result.importedCount = importedCount;
      result.skippedCount = importedData.length - importedCount;
      
      if (importedCount === 0) {
        result.success = false;
        result.message = '没有足够的空栏位，导入失败';
      } else if (result.skippedCount > 0) {
        result.success = true;
        result.message = `成功导入 ${importedCount} 个预设，${result.skippedCount} 个预设因栏位不足未导入`;
      } else {
        result.success = true;
        result.message = `成功导入全部 ${importedCount} 个预设`;
      }

      return result;
    } catch (e) {
      console.error("Import failed", e);
      result.success = false;
      result.message = '导入失败，代码格式错误';
      return result;
    }
  };

  // 导入单个预设到指定栏位
  const importSinglePreset = (code: string, targetId: number) => {
    const result = {
      success: false,
      message: '',
      warning: false
    };

    try {
      const binary = atob(code);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const json = pako.inflate(bytes, { to: 'string' });
      const importedData: Omit<EditorPreset, 'id'>[] = JSON.parse(json);

      if (importedData.length === 0) {
        result.success = false;
        result.message = '导入代码中没有预设数据';
        return result;
      }

      // 如果导入代码中有多个预设，选择时间戳最新的一个
      let selectedPreset = importedData[0];
      if (importedData.length > 1) {
        selectedPreset = importedData.reduce((latest, current) => {
          return (current.timestamp || 0) > (latest.timestamp || 0) ? current : latest;
        });
        result.warning = true;
      }

      const newPreset: EditorPreset = {
        ...selectedPreset,
        id: targetId
      };

      const existingIdx = presets.value.findIndex(existing => existing.id === targetId);
      if (existingIdx > -1) {
        presets.value[existingIdx] = newPreset;
      } else {
        presets.value.push(newPreset);
      }

      local.set("editor_presets", presets.value);

      result.success = true;
      if (result.warning) {
        result.message = `导入成功（从 ${importedData.length} 个预设中选择了最新的）`;
      } else {
        result.message = '导入成功';
      }

      return result;
    } catch (e) {
      console.error("Single import failed", e);
      result.success = false;
      result.message = '导入失败，代码格式错误';
      return result;
    }
  };

  const importReplay = (replayCode: string) => {
    try {
      const validBase64Chars = replayCode.match(/[A-Za-z0-9+/=]/g);
      if (!validBase64Chars) throw new Error("Invalid code");
      const cleanBase64 = validBase64Chars.join("");
      const binaryString = atob(cleanBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const jsonString = pako.inflate(bytes, { to: "string" });
      const payload = JSON.parse(jsonString);
      const data = payload.data;

      spells.value = data.spells;
      spells2.value = data.spells2 || [];
      spellStatus.value = data.initStatus || Array(25).fill(0);

      Object.assign(roomStore.roomConfig, data.roomConfig);

      if (data.normalData) {
        normalGameData.is_portal_a = data.normalData.is_portal_a || Array(25).fill(0);
        normalGameData.is_portal_b = data.normalData.is_portal_b || Array(25).fill(0);
      }

      initialLeftTime.value = data.roomConfig.game_time * 60;

      if (spells2.value.length === 0) {
        spells2.value = Array.from({ length: 25 }, () => createBlankSpell());
      }

      return true;
    } catch (e) {
      console.error("Replay import failed", e);
      return false;
    }
  };

  // --- 单元格操作 (使用 gameStore.currentBoard) ---
  const selectSpell = (index: number) => {
    if (selectedSpellIndex.value === index) {
      isEditorModalVisible.value = true;
    } else {
      selectedSpellIndex.value = index;
    }
  };

  const updateSpell = (payload: { index: number; spellData: Partial<Spell> }) => {
    // 使用 gameStore.currentBoard 决定目标数组
    const targetSpells = gameStore.currentBoard === 0 ? spells.value : spells2.value;
    Object.assign(targetSpells[payload.index], payload.spellData);
  };

  const updateSpellStatus = (payload: { index: number; status: SpellStatus }) => {
    spellStatus.value[payload.index] = payload.status;
  };

  const updatePortalStatus = (payload: { index: number; isPortal: boolean }) => {
    // 使用 gameStore.currentBoard 决定目标数组
    const targetPortals = gameStore.currentBoard === 0 ? normalGameData.is_portal_a : normalGameData.is_portal_b;
    targetPortals[payload.index] = payload.isPortal ? 1 : 0;
  };

  const clearSpell = (index: number) => {
    const blankSpell = createBlankSpell();
    updateSpell({ index, spellData: blankSpell });
    updateSpellStatus({ index, status: SpellStatus.NONE });
    updatePortalStatus({ index, isPortal: false });
  };

  const copySpell = (index: number) => {
    if (index === -1) return;
    const targetSpells = gameStore.currentBoard === 0 ? spells.value : spells2.value;
    const sourceSpell = targetSpells[index];
    clipboard.value = {
      name: sourceSpell.name,
      game: sourceSpell.game,
      rank: sourceSpell.rank,
      star: sourceSpell.star,
      desc: sourceSpell.desc,
    };
  };

  const pasteSpell = (index: number) => {
    if (index === -1 || !clipboard.value) return;
    updateSpell({ index, spellData: clipboard.value });
  };

  const closeModal = () => { isEditorModalVisible.value = false; };
  const toggleEditorMode = () => { isEditorMode.value ? exitEditorMode() : enterEditorMode(); };
  const toggleDatabasePanel = () => { isDatabasePanelVisible.value = !isDatabasePanelVisible.value; };

  const saveToLocalDatabase = (spell: Spell) => {
    const exists = localSpellDatabase.value.some(s => s.name === spell.name && s.game === spell.game && s.rank === spell.rank);
    if (!exists) {
      const newSpell = createBlankSpell();
      Object.assign(newSpell, { name: spell.name, game: spell.game, rank: spell.rank, star: spell.star, desc: spell.desc });
      localSpellDatabase.value.push(newSpell);
      local.set("custom_spell_database", localSpellDatabase.value);
      return true;
    }
    return false;
  };

  const deleteFromLocalDatabase = (spell: Spell) => {
    const index = localSpellDatabase.value.indexOf(spell);
    if (index > -1) {
      localSpellDatabase.value.splice(index, 1);
      local.set("custom_spell_database", localSpellDatabase.value);
    }
  };

  const fetchServerSpells = async (version: number) => {
    const now = Date.now();
    const cacheEntry = serverSpellCache.value.get(version);
    if (cacheEntry && (now - cacheEntry.timestamp < CACHE_DURATION)) return;
    isFetchingServerData.value = true;
    try {
      const base64Data: string = await ws.send(WebSocketActionType.GET_XLSX_DATA, { id: version });
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      const jsonString = pako.inflate(bytes, { to: "string" });
      const rawData = JSON.parse(jsonString);
      const flattenedSpells: Spell[] = [];
      Object.values(rawData).forEach((isExMap: any) => {
        Object.values(isExMap).forEach((gameMap: any) => {
          Object.values(gameMap).forEach((spellList: any) => {
            if (Array.isArray(spellList)) flattenedSpells.push(...spellList);
          });
        });
      });
      serverSpellCache.value.set(version, { data: flattenedSpells, timestamp: now });
    } catch (e) {
      console.error("Failed to fetch spell data", e);
    } finally {
      isFetchingServerData.value = false;
    }
  };

  const applySpellFromDatabase = (spell: Spell) => {
    if (selectedSpellIndex.value === -1) return;
    updateSpell({ index: selectedSpellIndex.value, spellData: { name: spell.name, game: spell.game, rank: spell.rank, star: spell.star, desc: spell.desc } });
  };

  const updateLocalDatabaseSpell = (index: number, spell: Spell) => {
    if (index >= 0 && index < localSpellDatabase.value.length) {
      localSpellDatabase.value[index] = { ...localSpellDatabase.value[index], ...spell };
      local.set("custom_spell_database", localSpellDatabase.value);
    }
  };

  watch(() => isEditorMode.value, (value) => {
    presetManagerMode.value = value ? 'manage' : 'select'
  });

  return {
    isEditorMode,
    spells,
    spells2,
    spellStatus,
    normalGameData,
    bpGameData,
    enterEditorMode,
    exitEditorMode,
    toggleEditorMode,
    selectedSpellIndex,
    isEditorModalVisible,
    selectSpell,
    updateSpell,
    updateSpellStatus,
    updatePortalStatus,
    clearSpell,
    clearAllSpells,
    shuffleSpells,
    copySpell,
    pasteSpell,
    closeModal,
    isDatabasePanelVisible,
    localSpellDatabase,
    serverSpellCache,
    isFetchingServerData,
    toggleDatabasePanel,
    saveToLocalDatabase,
    deleteFromLocalDatabase,
    fetchServerSpells,
    applySpellFromDatabase,
    updateLocalDatabaseSpell,
    initialLeftTime,
    initialCountDown,
    initialCdTimeA,
    initialCdTimeB,
    isInitialStateModalVisible,
    isPresetManagerVisible,
    presets,
    savePreset,
    loadPreset,
    deletePreset,
    exportPresets,
    importPresets,
    importPresetsToEmptySlots,
    importSinglePreset,
    importReplay,
    presetManagerMode,
    openPresetManager,
  };
});