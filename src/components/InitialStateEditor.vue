<template>
  <el-dialog v-model="editorStore.isInitialStateModalVisible" title="设置对局初始状态" width="450px" class="state-editor-dialog">
    <div class="state-container">
      <!-- 游戏时间设定 -->
      <el-card shadow="never" class="mb-3">
        <template #header>
          <div class="card-header">
            <el-icon><Timer /></el-icon>
            <span>时间设定</span>
          </div>
        </template>
        <el-form label-width="100px" size="default">
          <el-form-item label="剩余时间">
            <el-input-number v-model="gameTimeMinutes" :min="1" :max="120" style="width: 140px" />
            <span class="unit-text">分钟</span>
          </el-form-item>
          <el-form-item label="倒计时">
            <el-input-number v-model="editorStore.initialCountDown" :min="1" :max="360" style="width: 140px" />
            <span class="unit-text">秒</span>
          </el-form-item>
          <el-form-item label="左方CD">
            <el-input-number v-model="editorStore.initialCdTimeA" :min="0" style="width: 140px" />
            <span class="unit-text">秒</span>
          </el-form-item>
          <el-form-item label="右方CD">
            <el-input-number v-model="editorStore.initialCdTimeB" :min="0" style="width: 140px" />
            <span class="unit-text">秒</span>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 危险区域 -->
      <div class="danger-zone">
        <el-button type="danger" :icon="Delete" @click="handleClearAll" style="width: 100%">
          清空所有格子内容
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { useEditorStore } from '@/store/EditorStore';
import { ElDialog, ElForm, ElFormItem, ElInputNumber, ElButton, ElSelect, ElOption, ElMessage, ElMessageBox, ElCard, ElIcon } from 'element-plus';
import { Timer, Operation, Delete } from '@element-plus/icons-vue';

const editorStore = useEditorStore();
const batchStatus = ref(0);

const gameTimeMinutes = computed({
  get: () => Math.floor(editorStore.initialLeftTime / 60),
  set: (val) => {
    editorStore.initialLeftTime = val * 60;
  }
});

const applyBatchStatus = () => {
  editorStore.spellStatus.fill(batchStatus.value);
  ElMessage.success("已批量应用状态");
};

const handleClearAll = () => {
  ElMessageBox.confirm('确定要清空所有格子的内容吗？此操作不可恢复。', '警告', {
    type: 'warning',
    confirmButtonText: '确认清空',
    confirmButtonClass: 'el-button--danger'
  }).then(() => {
    editorStore.clearAllSpells();
    ElMessage.success('已清空');
  }).catch(() => {});
};
</script>

<style scoped>
.state-container {
  padding: 0 10px;
}
.mb-3 {
  margin-bottom: 15px;
}
.card-header {
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: bold;
}
.unit-text {
  margin-left: 10px;
  color: #666;
}
.flex-row {
  display: flex;
  align-items: center;
}
.danger-zone {
  margin-top: 20px;
  padding-top: 10px;
  border-top: 1px dashed #e0e0e0;
}
</style>