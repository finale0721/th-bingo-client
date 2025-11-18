import { defineStore } from "pinia";
import { computed, reactive, ref } from "vue";
import { useRoomStore } from "./RoomStore";
import { Spell, SpellStatus, RoomConfig } from "@/types";
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

  const isEditorMode = ref(false);
  const spells = ref<Spell[]>([]);
  const spells2 = ref<Spell[]>([]);
  const spellStatus = ref<SpellStatus[]>([]);
  const currentBoard = ref(0);
  const bpGameData = reactive({ spell_failed_count_a: [], spell_failed_count_b: [] });
  const normalGameData = reactive({
    is_portal_a: [] as number[],
    is_portal_b: [] as number[],
  });

  // 编辑器需要一个独立的roomConfig副本，以防影响到房间的真实设置
  const roomConfig = reactive<RoomConfig>(<RoomConfig>{
    ...roomStore.roomConfig,
  });

  const selectedSpellIndex = ref(-1);
  const isEditorModalVisible = ref(false);
  // Partial<Spell> 表示剪贴板只存储部分Spell字段
  const clipboard = ref<Partial<Spell> | null>(null);

  const isDatabasePanelVisible = ref(false);
  const localSpellDatabase = ref<Spell[]>(local.get("custom_spell_database") || []);

  const serverSpellCache = ref<Map<number, CacheEntry>>(new Map());
  const isFetchingServerData = ref(false);

  const enterEditorMode = () => {
    // 1. 复制当前的房间设置到编辑器，确保双盘面等设置同步
    Object.assign(roomConfig, roomStore.roomConfig);

    // 2. 初始化空白盘面
    spells.value = Array.from({ length: 25 }, () => createBlankSpell());
    spellStatus.value = Array.from({ length: 25 }, () => SpellStatus.NONE);


    if (roomConfig.dual_board > 0) {
      spells2.value = Array.from({ length: 25 }, () => createBlankSpell());
      normalGameData.is_portal_a = Array(25).fill(0);
      normalGameData.is_portal_b = Array(25).fill(0);
    } else {
      spells2.value = [];
      normalGameData.is_portal_a = []
      normalGameData.is_portal_b = [];
    }

    selectedSpellIndex.value = -1; // 重置选中
    isEditorMode.value = true;


  };

  // 处理单击逻辑
  const selectSpell = (index: number) => {
    if (selectedSpellIndex.value === index) {
      // 如果再次点击已选中的格子，则打开编辑器
      isEditorModalVisible.value = true;
    } else {
      // 否则，只选中格子
      selectedSpellIndex.value = index;
    }
    console.log(index);
  };

  // 更新符卡数据
  const updateSpell = (payload: { index: number; spellData: Partial<Spell> }) => {
    const targetSpells = currentBoard.value === 0 ? spells.value : spells2.value;
    // 使用 Object.assign 更新，保留原始对象引用
    Object.assign(targetSpells[payload.index], payload.spellData);
  };

  // 更新符卡状态
  const updateSpellStatus = (payload: { index: number; status: SpellStatus }) => {
    spellStatus.value[payload.index] = payload.status;
  };

  // 更新传送门状态
  const updatePortalStatus = (payload: { index: number; isPortal: boolean }) => {
    const targetPortals = currentBoard.value === 0 ? normalGameData.is_portal_a : normalGameData.is_portal_b;
    targetPortals[payload.index] = payload.isPortal ? 1 : 0;
  };

  // 清空格子
  const clearSpell = (index: number) => {
    const blankSpell = createBlankSpell();
    updateSpell({ index, spellData: blankSpell });
    updateSpellStatus({ index, status: SpellStatus.NONE });
    updatePortalStatus({ index, isPortal: false });
  };

  // 复制 (只复制数据字段)
  const copySpell = (index: number) => {
    if (index === -1) return;
    const targetSpells = currentBoard.value === 0 ? spells.value : spells2.value;
    const sourceSpell = targetSpells[index];
    clipboard.value = {
      name: sourceSpell.name,
      game: sourceSpell.game,
      rank: sourceSpell.rank,
      star: sourceSpell.star,
      desc: sourceSpell.desc,
    };
  };

  // 粘贴
  const pasteSpell = (index: number) => {
    if (index === -1 || !clipboard.value) return;
    updateSpell({ index, spellData: clipboard.value });
  };

  const closeModal = () => {
    isEditorModalVisible.value = false;
  }

  const exitEditorMode = () => {
    // 清理数据
    spells.value = [];
    spells2.value = [];
    spellStatus.value = [];
    isEditorMode.value = false;
  };

  const toggleEditorMode = () => {
    if (isEditorMode.value) {
      exitEditorMode();
    } else {
      enterEditorMode();
    }
  };

  const toggleDatabasePanel = () => {
    isDatabasePanelVisible.value = !isDatabasePanelVisible.value;
  };

  const saveToLocalDatabase = (spell: Spell) => {
    const exists = localSpellDatabase.value.some(
      (s) => s.name === spell.name && s.game === spell.game && s.rank === spell.rank
    );
    if (!exists) {
      const newSpell = createBlankSpell();
      newSpell.name = spell.name;
      newSpell.game = spell.game;
      newSpell.rank = spell.rank;
      newSpell.star = spell.star;
      newSpell.desc = spell.desc;

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

  // 获取指定版本的服务器数据
  const fetchServerSpells = async (version: number) => {
    const now = Date.now();
    const cacheEntry = serverSpellCache.value.get(version);

    // 检查缓存是否有效
    if (cacheEntry && (now - cacheEntry.timestamp < CACHE_DURATION)) {
      return;
    }

    isFetchingServerData.value = true;
    try {
      const base64Data: string = await ws.send(WebSocketActionType.GET_XLSX_DATA, { id: version });

      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const jsonString = pako.inflate(bytes, { to: "string" });
      const rawData = JSON.parse(jsonString);

      const flattenedSpells: Spell[] = [];
      Object.values(rawData).forEach((isExMap: any) => {
        Object.values(isExMap).forEach((gameMap: any) => {
          Object.values(gameMap).forEach((spellList: any) => {
            if (Array.isArray(spellList)) {
              flattenedSpells.push(...spellList);
            }
          });
        });
      });

      // 更新缓存
      serverSpellCache.value.set(version, {
        data: flattenedSpells,
        timestamp: now
      });

    } catch (e) {
      console.error("Failed to fetch spell data", e);
    } finally {
      isFetchingServerData.value = false;
    }
  };

  const applySpellFromDatabase = (spell: Spell) => {
    if (selectedSpellIndex.value === -1) return;
    updateSpell({
      index: selectedSpellIndex.value,
      spellData: {
        name: spell.name,
        game: spell.game,
        rank: spell.rank,
        star: spell.star,
        desc: spell.desc,
      }
    });
  };

  const updateLocalDatabaseSpell = (index: number, spell: Spell) => {
    if (index >= 0 && index < localSpellDatabase.value.length) {
      // 更新数据
      localSpellDatabase.value[index] = { ...localSpellDatabase.value[index], ...spell };
      // 持久化
      local.set("custom_spell_database", localSpellDatabase.value);
    }
  };

  return {
    isEditorMode,
    spells,
    spells2,
    spellStatus,
    roomConfig,
    currentBoard,
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
  }
});