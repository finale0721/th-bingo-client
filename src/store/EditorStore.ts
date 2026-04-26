import { defineStore } from "pinia";
import { reactive, ref, watch, computed } from "vue";
import { useRoomStore } from "./RoomStore";
import { useGameStore } from "./GameStore";
import { Spell, SpellStatus, RoomConfig, EditorPreset } from "@/types";
import { local } from "@/utils/Storage";
import ws from "@/utils/webSocket/WebSocketBingo";
import { WebSocketActionType } from "@/utils/webSocket/types";
import { BoardSpec } from "@/utils/board";
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
  const gameStore = useGameStore();

  const boardSpec = computed(() => new BoardSpec(roomStore.roomConfig.board_size || 5));
  const boardArea = computed(() => boardSpec.value.area);

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
        if (spells2.value.length === 0) {
          spells2.value = Array.from({ length: boardArea.value }, () => createBlankSpell());
          if (normalGameData.is_portal_b.length === 0) {
            normalGameData.is_portal_b = Array(boardArea.value).fill(0);
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
    const area = boardArea.value;
    spells.value = Array.from({ length: area }, () => createBlankSpell());
    spellStatus.value = Array.from({ length: area }, () => SpellStatus.NONE);

    initialLeftTime.value = roomStore.roomConfig.game_time * 60;
    initialCountDown.value = 0;
    initialCdTimeA.value = 0;
    initialCdTimeB.value = 0;
    normalGameData.is_portal_a = Array(area).fill(0);

    spells2.value = Array.from({ length: area }, () => createBlankSpell());
    normalGameData.is_portal_b = Array(area).fill(0);
  };

  const clearAllSpells = () => {
    const area = boardArea.value;
    spells.value = Array.from({ length: area }, () => createBlankSpell());
    spells2.value = Array.from({ length: area }, () => createBlankSpell());
    spellStatus.value = Array.from({ length: area }, () => SpellStatus.NONE);
    normalGameData.is_portal_a = Array(area).fill(0);
    normalGameData.is_portal_b = Array(area).fill(0);
  };

  const shuffleSpells = () => {
    const currentBoard = gameStore.currentBoard;
    const targetSpells = currentBoard === 0 ? spells.value : spells2.value;
    const targetPortals = currentBoard === 0 ? normalGameData.is_portal_a : normalGameData.is_portal_b;
    const bs = boardSpec.value;
    const size = bs.size;
    const area = bs.area;

    interface CellInfo {
      spell: Spell;
      status: SpellStatus;
      isPortal: number;
      star: number;
    }

    const nonEmptyCells: CellInfo[] = [];
    for (let i = 0; i < area; i++) {
      const spell = targetSpells[i];
      if (spell.name || spell.game || spell.rank) {
        nonEmptyCells.push({
          spell: { ...spell },
          status: spellStatus.value[i],
          isPortal: targetPortals[i],
          star: spell.star || 0
        });
      }
    }

    // Fisher-Yates shuffle helper
    const shuffle = <T>(arr: T[]): T[] => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    // Generate high-level positions: one per row/col, center always high
    // Mirrors server's SpellFactory.highLevelPositions
    const generateHighLevelPositions = (): number[] => {
      const perm = Array.from({ length: size }, (_, i) => i);
      const shuffled = shuffle(perm);

      if (size % 2 === 1) {
        const mid = Math.floor(size / 2);
        const centerCol = mid;
        const currentColAtMid = shuffled[mid];
        const indexOfCenterCol = shuffled.indexOf(centerCol);
        shuffled[mid] = centerCol;
        shuffled[indexOfCenterCol] = currentColAtMid;
      } else {
        const mid1 = size / 2 - 1;
        const mid2 = size / 2;
        if (shuffled[mid1] !== mid1 && shuffled[mid1] !== mid2) {
          const target = (shuffled[mid2] === mid1 || shuffled[mid2] === mid2) ? shuffled[mid2] : mid1;
          const idx = shuffled.indexOf(target);
          const tmp = shuffled[mid1];
          shuffled[mid1] = target;
          shuffled[idx] = tmp;
        }
        if (shuffled[mid2] !== mid1 && shuffled[mid2] !== mid2) {
          const otherCenterCol = shuffled[mid1] === mid1 ? mid2 : mid1;
          const idx = shuffled.indexOf(otherCenterCol);
          const tmp = shuffled[mid2];
          shuffled[mid2] = otherCenterCol;
          shuffled[idx] = tmp;
        }
      }

      return Array.from({ length: size }, (_, row) => bs.index(row, shuffled[row]));
    };

    const highRatedCells = nonEmptyCells.filter(cell => cell.star >= 4);

    // If not enough high-rated cells for structured placement, just shuffle all
    if (highRatedCells.length < size) {
      const shuffled = shuffle(nonEmptyCells);

      for (let i = 0; i < area; i++) {
        targetSpells[i] = createBlankSpell();
        targetPortals[i] = 0;
      }

      shuffled.forEach((cell, idx) => {
        targetSpells[idx] = cell.spell;
        targetPortals[idx] = cell.isPortal;
        spellStatus.value[idx] = cell.status;
      });

      return { success: true, message: '操作成功' };
    }

    // Enough high-rated cells: place them at high-level positions
    const selectedHigh = shuffle(highRatedCells).slice(0, size);
    const positions = generateHighLevelPositions();
    const positionsSet = new Set(positions);

    const remainingCells = shuffle(
      nonEmptyCells.filter(cell => !selectedHigh.includes(cell))
    );

    // Clear current board
    for (let i = 0; i < area; i++) {
      targetSpells[i] = createBlankSpell();
      targetPortals[i] = 0;
    }

    // Place high-rated cells at designated positions
    selectedHigh.forEach((cell, idx) => {
      const pos = positions[idx];
      targetSpells[pos] = cell.spell;
      targetPortals[pos] = cell.isPortal;
      spellStatus.value[pos] = cell.status;
    });

    // Place remaining cells in remaining positions
    let remainingIdx = 0;
    for (let i = 0; i < area && remainingIdx < remainingCells.length; i++) {
      if (!positionsSet.has(i)) {
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
    normalGameData.is_portal_a = d.isPortalA || Array(boardArea.value).fill(0);
    normalGameData.is_portal_b = d.isPortalB || Array(boardArea.value).fill(0);

    // 确保数据结构完整
    if (spells2.value.length === 0) {
      spells2.value = Array.from({ length: boardArea.value }, () => createBlankSpell());
    }
    if (normalGameData.is_portal_b.length === 0) {
      normalGameData.is_portal_b = Array(boardArea.value).fill(0);
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
      const area = data.spells.length || boardArea.value;
      spellStatus.value = data.initStatus || Array(area).fill(0);

      Object.assign(roomStore.roomConfig, data.roomConfig);

      if (data.normalData) {
        normalGameData.is_portal_a = data.normalData.is_portal_a || Array(area).fill(0);
        normalGameData.is_portal_b = data.normalData.is_portal_b || Array(area).fill(0);
      }

      initialLeftTime.value = data.roomConfig.game_time * 60;

      if (spells2.value.length === 0) {
        spells2.value = Array.from({ length: area }, () => createBlankSpell());
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
    boardSpec,
    boardArea,
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