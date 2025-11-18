import { defineStore } from "pinia";
import { reactive, ref } from "vue";
import { useRoomStore } from "./RoomStore";
import { Spell, SpellStatus, RoomConfig } from "@/types";

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
  };
});