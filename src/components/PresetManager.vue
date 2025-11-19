<template>
  <el-dialog v-model="editorStore.isPresetManagerVisible" title="预设管理器" width="900px" top="5vh" class="preset-dialog">
    <div class="preset-toolbar">
      <div class="left-group">
        <el-button-group>
          <el-button type="primary" @click="handleExportPage">导出本页</el-button>
          <el-button type="primary" @click="handleExportAll">导出全部</el-button>
        </el-button-group>
      </div>
      <div class="right-group">
        <el-button type="success" @click="importDialogVisible = true">导入到本页</el-button>
        <el-button type="warning" @click="replayDialogVisible = true">从Replay导入</el-button>
      </div>
    </div>

    <div class="preset-list">
      <el-table :data="currentPageSlots" border stripe height="480px" size="small" :header-cell-style="{background:'#f5f7fa'}">
        <el-table-column label="ID" width="60" align="center">
          <template #default="{ row }">
            <span class="id-cell">{{ row.id + 1 }}</span>
          </template>
        </el-table-column>

        <el-table-column label="备注" min-width="180">
          <template #default="{ row }">
            <div v-if="hasPreset(row.id)" class="note-cell">
              <span class="note-text">{{ getPreset(row.id).note }}</span>
            </div>
            <span v-else class="empty-text">-- 空 --</span>
          </template>
        </el-table-column>

        <el-table-column label="符卡数" width="100" align="center">
          <template #default="{ row }">
            <span v-if="hasPreset(row.id)" class="count-text">{{ getCardCountInfo(getPreset(row.id)) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="保存时间" width="150" align="center">
          <template #default="{ row }">
            <span v-if="hasPreset(row.id)" class="time-text">{{ formatTime(getPreset(row.id).timestamp) }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="200" align="center">
          <template #default="{ row }">
            <div class="action-buttons">
              <template v-if="hasPreset(row.id)">
                <el-button type="success" link size="small" @click="handleLoad(row.id)">读取</el-button>
                <el-button type="warning" link size="small" @click="handleEditNote(row.id)">备注</el-button>
                <el-button type="danger" link size="small" @click="handleDelete(row.id)">删除</el-button>
              </template>
              <el-button type="primary" link size="small" @click="handleSave(row.id)">保存</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <div class="preset-pagination">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="10"
        :total="100"
        layout="prev, pager, next"
        background
      />
    </div>

    <!-- 导入弹窗 -->
    <el-dialog v-model="importDialogVisible" title="导入预设 (覆盖当前页)" width="500px" append-to-body>
      <el-input v-model="importCode" type="textarea" :rows="6" placeholder="在此处粘贴预设代码..." />
      <div class="dialog-tip">注意：导入的数据将覆盖当前页（第 {{ currentPage }} 页）的栏位。</div>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleImport">导入</el-button>
      </template>
    </el-dialog>

    <!-- Replay导入弹窗 -->
    <el-dialog v-model="replayDialogVisible" title="从Replay导入" width="500px" append-to-body>
      <el-input v-model="replayCode" type="textarea" :rows="6" placeholder="在此处粘贴Replay代码..." />
      <div class="dialog-tip">注意：这将覆盖当前编辑器中的所有内容。</div>
      <template #footer>
        <el-button @click="replayDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="handleReplayImport">覆盖导入</el-button>
      </template>
    </el-dialog>

    <!-- 导出结果弹窗 -->
    <el-dialog v-model="exportResultVisible" title="导出结果" width="500px" append-to-body>
      <el-input v-model="exportResult" type="textarea" :rows="6" readonly />
      <template #footer>
        <el-button type="primary" @click="copyExport">复制</el-button>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import { useEditorStore } from '@/store/EditorStore';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ElDialog, ElButton, ElButtonGroup, ElTable, ElTableColumn, ElPagination, ElInput } from 'element-plus';
import { EditorPreset } from "@/types";

const editorStore = useEditorStore();
const currentPage = ref(1);
const importDialogVisible = ref(false);
const replayDialogVisible = ref(false);
const exportResultVisible = ref(false);
const importCode = ref('');
const replayCode = ref('');
const exportResult = ref('');

const currentPageSlots = computed(() => {
  const start = (currentPage.value - 1) * 10;
  return Array.from({ length: 10 }, (_, i) => ({ id: start + i }));
});

const hasPreset = (id: number) => editorStore.presets.some(p => p.id === id);
const getPreset = (id: number) => editorStore.presets.find(p => p.id === id)!;

const handleSave = async (id: number) => {
  let note = "新预设";
  if (hasPreset(id)) {
    note = getPreset(id).note;
  }
  try {
    const { value } = await ElMessageBox.prompt('请输入备注', '保存预设', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: note,
    });
    editorStore.savePreset(id, value);
    ElMessage.success('保存成功');
  } catch {}
};

const handleLoad = (id: number) => {
  ElMessageBox.confirm('确定要读取此预设吗？当前未保存的修改将丢失。', '提示', { type: 'warning' })
    .then(() => {
      editorStore.loadPreset(id);
      ElMessage.success('读取成功');
      editorStore.isPresetManagerVisible = false;
    }).catch(() => {});
};

const handleDelete = (id: number) => {
  ElMessageBox.confirm('确定删除此预设？', '警告', { type: 'warning' }).then(() => {
    editorStore.deletePreset(id);
    ElMessage.success('已删除');
  }).catch(() => {});
};

const handleEditNote = async (id: number) => {
  const preset = getPreset(id);
  try {
    const { value } = await ElMessageBox.prompt('修改备注', '编辑', { inputValue: preset.note });
    editorStore.savePreset(id, value);
  } catch {}
};

const handleExportPage = () => {
  const ids = currentPageSlots.value.map(s => s.id);
  const code = editorStore.exportPresets(ids);
  showExport(code);
};

const handleExportAll = () => {
  const ids = editorStore.presets.map(p => p.id);
  const code = editorStore.exportPresets(ids);
  showExport(code);
};

const showExport = (code: string) => {
  if (!code || code === 'W10=') {
    ElMessage.info('没有可导出的数据');
    return;
  }
  exportResult.value = code;
  exportResultVisible.value = true;
};

const copyExport = () => {
  navigator.clipboard.writeText(exportResult.value);
  ElMessage.success('已复制');
};

const handleImport = () => {
  if (!importCode.value) return;
  // 传入当前页的起始ID，实现覆盖当前页逻辑
  const startId = (currentPage.value - 1) * 10;
  const success = editorStore.importPresets(importCode.value, startId);
  if (success) {
    ElMessage.success('导入成功，已覆盖当前页栏位');
    importDialogVisible.value = false;
    importCode.value = '';
  } else {
    ElMessage.error('导入失败，代码格式错误');
  }
};

const handleReplayImport = () => {
  if (!replayCode.value) return;
  const success = editorStore.importReplay(replayCode.value);
  if (success) {
    ElMessage.success('Replay数据已加载到编辑器');
    replayDialogVisible.value = false;
    editorStore.isPresetManagerVisible = false;
    replayCode.value = '';
  } else {
    ElMessage.error('Replay解析失败');
  }
};

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}-${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
};

const getCardCountInfo = (preset: EditorPreset) => {
  const countA = preset.data.spells.filter(s => s.name && s.name.trim() !== '').length;
  if (preset.data.roomConfig.dual_board > 0) {
    const countB = preset.data.spells2.filter(s => s.name && s.name.trim() !== '').length;
    return `${countA} / ${countB}`;
  }
  return `${countA}`;
};
</script>

<style scoped>
.preset-toolbar {
  margin-bottom: 15px;
  display: flex;
  justify-content: space-between;
}
.preset-pagination {
  margin-top: 15px;
  display: flex;
  justify-content: center;
}
</style>