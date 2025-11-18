<template>
  <el-dialog v-model="visible" title="编辑符卡" @close="onCancel">
    <el-form :model="formData" label-width="80px">
      <el-form-item label="名称" required>
        <el-input v-model="formData.name"></el-input>
      </el-form-item>
      <el-form-item label="作品">
        <el-input v-model="formData.game"></el-input>
      </el-form-item>
      <el-form-item label="难度">
        <el-input v-model="formData.rank"></el-input>
      </el-form-item>
      <el-form-item label="评级">
        <el-input-number v-model="formData.star" :min="0" :max="5" />
      </el-form-item>
      <el-form-item label="描述">
        <el-input v-model="formData.desc" type="textarea"></el-input>
      </el-form-item>
      <el-divider />
      <el-form-item label="初始状态">
        <el-select v-model="formData.status">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="是否转换" v-if="editorStore.roomConfig.dual_board > 0">
        <el-switch v-model="formData.isPortal"></el-switch>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="onClear" type="warning">清空该格</el-button>
      <el-button @click="onCancel">取消</el-button>
      <el-button type="primary" @click="onConfirm">确认</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref, watch } from "vue";
import { Spell, SpellStatus } from "@/types";
import {
  ElButton,
  ElDialog,
  ElDivider,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElOption,
  ElSelect,
  ElSwitch,
} from "element-plus";
import { useEditorStore } from "@/store/EditorStore";

const editorStore = useEditorStore();

const props = defineProps<{
  spell: Spell;
  status: SpellStatus;
  isPortal: boolean;
}>();

const emits = defineEmits(["confirm", "clear", "close"]);

const visible = ref(true);
const formData = ref({
  name: "",
  game: "",
  rank: "",
  star: 1,
  desc: "",
  status: SpellStatus.NONE,
  isPortal: false,
});

const statusMenu = [
  {
    label: "置空",
    value: SpellStatus.NONE,
  },
  {
    label: "左侧玩家选择",
    value: SpellStatus.A_SELECTED,
  },
  {
    label: "右侧玩家选择",
    value: SpellStatus.B_SELECTED,
  },
  {
    label: "两侧玩家选择",
    value: SpellStatus.BOTH_SELECTED,
  },
  {
    label: "左侧玩家收取",
    value: SpellStatus.A_ATTAINED,
  },
  {
    label: "右侧玩家收取",
    value: SpellStatus.B_ATTAINED,
  },
  {
    label: "禁用",
    value: SpellStatus.BANNED,
  },
];

// 将SpellStatus枚举转换为el-select可用的选项
const statusOptions = statusMenu
  .filter(({ value }) => typeof value === "number" && value.valueOf() < 0x10) // 只取数字枚举值
  .map(({ label, value }) => ({ label: label, value }));

watch(
  () => props.spell,
  (newSpell) => {
    if (newSpell) {
      formData.value.name = newSpell.name;
      formData.value.game = newSpell.game;
      formData.value.rank = newSpell.rank;
      formData.value.star = newSpell.star;
      formData.value.desc = newSpell.desc;
      formData.value.status = props.status;
      formData.value.isPortal = props.isPortal;
    }
  },
  { immediate: true }
);

const onConfirm = () => {
  emits("confirm", {
    spellData: {
      name: formData.value.name,
      game: formData.value.game,
      rank: formData.value.rank,
      star: formData.value.star,
      desc: formData.value.desc,
    },
    status: formData.value.status,
    isPortal: formData.value.isPortal,
  });
};

const onClear = () => {
  emits("clear");
};

const onCancel = () => {
  emits("close");
};
</script>