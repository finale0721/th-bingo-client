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
  max_capRate: 0,
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

  const enterEditorMode = () => {
    originalRoomConfigBackup.value = JSON.parse(JSON.stringify(roomStore.roomConfig));

    const autoSaveSlot = presets.value.find(p => p.id === 99);
    if (autoSaveSlot) {
      loadPresetData(autoSaveSlot);
    } else {
      resetToBlank();
    }

    selectedSpellIndex.value = -1;
    isEditorMode.value = true;
    gameStore.currentBoard = 0;

    // 启动自动保存 (30秒)
    if (autoSaveTimer) clearInterval(autoSaveTimer);
    autoSaveTimer = window.setInterval(() => {
      savePreset(99, "自动存档");
    }, 30000);
  };

  const exitEditorMode = () => {
    // 停止自动保存
    if (autoSaveTimer) {
      clearInterval(autoSaveTimer);
      autoSaveTimer = null;
    }
    // 退出时立即保存一次
    savePreset(99, "自动存档");

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
    importReplay,
  };
});