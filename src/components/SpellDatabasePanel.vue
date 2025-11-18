<template>
  <div
    v-if="editorStore.isDatabasePanelVisible"
    class="database-window"
    :style="{ top: position.y + 'px', left: position.x + 'px' }"
  >
    <!-- 头部保持不变 -->
    <div class="window-header" @mousedown="startDrag">
      <span class="title">符卡数据库查询</span>
      <div class="header-controls">
        <el-icon class="close-btn" @click="editorStore.toggleDatabasePanel"><Close /></el-icon>
      </div>
    </div>

    <div class="window-body">
      <!-- 控制栏 -->
      <div class="control-bar">
        <el-radio-group v-model="activeTab" size="small" style="margin-right: auto;">
          <el-radio-button label="local">本地库</el-radio-button>
          <el-radio-button label="server">服务器库</el-radio-button>
        </el-radio-group>

        <!-- 本地库特有按钮 -->
        <el-button
          v-if="activeTab === 'local'"
          type="success"
          size="small"
          icon="Plus"
          @click="openDbDialog('create')"
        >
          新建数据
        </el-button>

        <!-- 服务器库特有控件 -->
        <template v-if="activeTab === 'server'">
          <el-select
            v-model="editorStore.roomConfig.spell_version"
            placeholder="选择卡池"
            size="small"
            style="width: 120px; margin-right: 5px;"
          >
            <el-option
              v-for="item in Config.spellVersionList"
              :key="item.type"
              :label="item.name"
              :value="item.type"
            />
          </el-select>
          <el-button
            type="primary"
            size="small"
            :loading="editorStore.isFetchingServerData"
            :disabled="cooldown > 0"
            @click="handleFetchServer"
          >
            {{ cooldown > 0 ? `${cooldown}s` : '请求' }}
          </el-button>
        </template>
      </div>

      <!-- 筛选栏保持不变 -->
      <div class="filter-bar">
        <el-input v-model="filters.game" placeholder="作品" size="small" clearable style="width: 80px" />
        <el-input v-model="filters.name" placeholder="名称" size="small" clearable style="width: 120px" />
        <el-input v-model="filters.rank" placeholder="分类" size="small" clearable style="width: 80px" />
        <el-input-number v-model="filters.star" :min="0" :max="6" size="small" placeholder="评级" controls-position="right" style="width: 80px" />
        <el-button size="small" @click="clearFilters">重置</el-button>
      </div>

      <!-- 数据表格 -->
      <div class="table-container">
        <el-table
          :data="paginatedSpells"
          style="width: 100%; height: 100%"
          size="small"
          border
          stripe
          empty-text="暂无数据"
          @sort-change="handleSortChange"
        >
          <el-table-column prop="game" label="作品" width="80" sortable="custom" show-overflow-tooltip />
          <el-table-column prop="name" label="符卡名" min-width="160" sortable="custom" show-overflow-tooltip />
          <el-table-column prop="rank" label="分类" width="70" sortable="custom" />
          <el-table-column prop="star" label="评级" width="70" sortable="custom" align="center">
            <template #default="scope">
              {{ scope.row.star }} <el-icon color="#e6a23c"><StarFilled /></el-icon>
            </template>
          </el-table-column>
          <el-table-column prop="desc" label="位置" min-width="100" show-overflow-tooltip />

          <el-table-column label="操作" width="140" fixed="right" align="center">
            <template #default="scope">
              <!-- 通用：填入 -->
              <el-button type="primary" link size="small" @click="handleUse(scope.row)">填入</el-button>

              <!-- 本地库：编辑/删除 -->
              <template v-if="activeTab === 'local'">
                <el-button type="warning" link size="small" @click="openDbDialog('edit', scope.row)">编辑</el-button>
                <el-button type="danger" link size="small" @click="handleDelete(scope.row)">删除</el-button>
              </template>

              <!-- 服务器库：导入 -->
              <template v-if="activeTab === 'server'">
                <el-button type="success" link size="small" @click="handleImportToLocal(scope.row)">导入</el-button>
              </template>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 分页保持不变 -->
      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          :total="filteredSpells.length"
          small
          background
        />
      </div>
    </div>

    <!-- 内部弹窗：新建/编辑数据 -->
    <el-dialog
      v-model="dbDialogVisible"
      :title="dbDialogMode === 'create' ? '新建本地数据' : '编辑本地数据'"
      width="400px"
      append-to-body
    >
      <el-form :model="dbForm" label-width="60px">
        <el-form-item label="名称" required>
          <el-input v-model="dbForm.name" />
        </el-form-item>
        <el-form-item label="作品">
          <el-input v-model="dbForm.game" />
        </el-form-item>
        <el-form-item label="分类">
          <el-input v-model="dbForm.rank" />
        </el-form-item>
        <el-form-item label="评级">
          <el-rate v-model="dbForm.star" :max="6" clearable />
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="dbForm.desc" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dbDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveDbSpell">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted, reactive } from 'vue';
import { useEditorStore } from '@/store/EditorStore';
import { Spell } from '@/types';
import Config from '@/config';
import { Close, StarFilled, Plus } from '@element-plus/icons-vue';
import {
  ElButton, ElIcon, ElInput, ElInputNumber, ElRadioGroup, ElRadioButton,
  ElSelect, ElOption, ElTable, ElTableColumn, ElPagination, ElMessage,
  ElDialog, ElForm, ElFormItem, ElRate
} from 'element-plus';

const editorStore = useEditorStore();

// --- 窗口拖动逻辑 (保持不变) ---
const position = reactive({ x: 0, y: 100 });
let isDragging = false;
let dragStart = { x: 0, y: 0 };
let windowStart = { x: 0, y: 0 };

onMounted(() => {
  const winWidth = window.innerWidth;
  const winHeight = window.innerHeight;
  position.x = winWidth - 620;
  position.y = (winHeight - 500) / 2;
});

const startDrag = (e: MouseEvent) => {
  isDragging = true;
  dragStart.x = e.clientX;
  dragStart.y = e.clientY;
  windowStart.x = position.x;
  windowStart.y = position.y;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
};

const onDrag = (e: MouseEvent) => {
  if (!isDragging) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  position.x = windowStart.x + dx;
  position.y = windowStart.y + dy;
};

const stopDrag = () => {
  isDragging = false;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
};

// --- 数据逻辑 ---
const activeTab = ref<'local' | 'server'>('local');
const cooldown = ref(0);
const currentPage = ref(1);
const pageSize = ref(20);

// 排序状态
const sortState = reactive({
  prop: '',
  order: '' // 'ascending' | 'descending' | null
});

const filters = reactive({
  name: '',
  game: '',
  rank: '',
  star: 0,
});

const clearFilters = () => {
  filters.name = '';
  filters.game = '';
  filters.rank = '';
  filters.star = 0;
};

watch(() => editorStore.roomConfig.spell_version, () => {
  currentPage.value = 1;
});

const currentSource = computed(() => {
  if (activeTab.value === 'local') {
    return editorStore.localSpellDatabase;
  } else {
    const version = editorStore.roomConfig.spell_version;
    const cache = editorStore.serverSpellCache.get(version);
    if (cache && (Date.now() - cache.timestamp < 3 * 60 * 60 * 1000)) {
      return cache.data;
    }
    return [];
  }
});

// 1. 过滤
const filteredSpells = computed(() => {
  const { name, game, rank, star } = filters;
  return currentSource.value.filter(spell => {
    if (!spell) return false;
    const matchName = !name || (spell.name && spell.name.toLowerCase().includes(name.toLowerCase()));
    const matchGame = !game || (spell.game && spell.game.toLowerCase().includes(game.toLowerCase()));
    const matchRank = !rank || (spell.rank && spell.rank.toLowerCase().includes(rank.toLowerCase()));
    const matchStar = star === 0 || spell.star === star;
    return matchName && matchGame && matchRank && matchStar;
  });
});

// 2. 排序 (在分页前进行)
const sortedSpells = computed(() => {
  if (!sortState.prop || !sortState.order) {
    return filteredSpells.value;
  }
  // 浅拷贝数组以避免修改原数组顺序
  const list = [...filteredSpells.value];
  const { prop, order } = sortState;
  const multiplier = order === 'descending' ? -1 : 1;

  list.sort((a, b) => {
    const valA = a[prop as keyof Spell];
    const valB = b[prop as keyof Spell];

    if (typeof valA === 'number' && typeof valB === 'number') {
      return (valA - valB) * multiplier;
    }
    // 字符串排序
    const strA = String(valA || '');
    const strB = String(valB || '');
    return strA.localeCompare(strB) * multiplier;
  });

  return list;
});

// 3. 分页
const paginatedSpells = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return sortedSpells.value.slice(start, end);
});

// 处理排序事件
const handleSortChange = ({ prop, order }: any) => {
  sortState.prop = prop;
  sortState.order = order;
};

const handleFetchServer = () => {
  if (cooldown.value > 0) return;
  editorStore.fetchServerSpells(editorStore.roomConfig.spell_version);
  cooldown.value = 10;
  const timer = setInterval(() => {
    cooldown.value--;
    if (cooldown.value <= 0) clearInterval(timer);
  }, 1000);
};

const handleUse = (spell: Spell) => {
  if (editorStore.selectedSpellIndex === -1) {
    ElMessage.warning('请先在盘面上选中一个格子');
    return;
  }
  editorStore.applySpellFromDatabase(spell);
  ElMessage.success('已填入选中格');
};

const handleDelete = (spell: Spell) => {
  editorStore.deleteFromLocalDatabase(spell);
  ElMessage.success('已删除');
};

const handleImportToLocal = (spell: Spell) => {
  const success = editorStore.saveToLocalDatabase(spell);
  if (success) {
    ElMessage.success('已导入到本地库');
  } else {
    ElMessage.warning('本地库已存在该数据');
  }
};

// --- 新建/编辑 弹窗逻辑 ---
const dbDialogVisible = ref(false);
const dbDialogMode = ref<'create' | 'edit'>('create');
const editingSpellOriginal = ref<Spell | null>(null); // 用于编辑时定位原数据
const dbForm = reactive({
  name: '',
  game: '',
  rank: '',
  star: 1,
  desc: ''
});

const openDbDialog = (mode: 'create' | 'edit', spell?: Spell) => {
  dbDialogMode.value = mode;
  if (mode === 'edit' && spell) {
    editingSpellOriginal.value = spell;
    dbForm.name = spell.name;
    dbForm.game = spell.game;
    dbForm.rank = spell.rank;
    dbForm.star = spell.star;
    dbForm.desc = spell.desc;
  } else {
    editingSpellOriginal.value = null;
    dbForm.name = '';
    dbForm.game = '';
    dbForm.rank = '';
    dbForm.star = 1;
    dbForm.desc = '';
  }
  dbDialogVisible.value = true;
};

const saveDbSpell = () => {
  if (!dbForm.name) {
    ElMessage.warning('名称不能为空');
    return;
  }

  const spellData: Spell = {
    index: 0,
    name: dbForm.name,
    game: dbForm.game,
    rank: dbForm.rank,
    star: dbForm.star,
    desc: dbForm.desc,
    id: 0, fastest: 0, miss_time: 0, power_weight: 0, difficulty: 0, change_rate: 0, max_capRate: 0
  };

  if (dbDialogMode.value === 'create') {
    const success = editorStore.saveToLocalDatabase(spellData);
    if (success) ElMessage.success('创建成功');
    else ElMessage.warning('已存在相同数据');
  } else {
    // 编辑模式：找到原数据在数组中的索引
    if (editingSpellOriginal.value) {
      const index = editorStore.localSpellDatabase.indexOf(editingSpellOriginal.value);
      if (index > -1) {
        editorStore.updateLocalDatabaseSpell(index, spellData);
        ElMessage.success('更新成功');
      }
    }
  }
  dbDialogVisible.value = false;
};

</script>

<style lang="scss" scoped>
.database-window {
  position: fixed;
  width: 660px;
  height: 600px;
  background-color: #fff;
  box-shadow: 0 0 15px rgba(0,0,0,0.2);
  border-radius: 8px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #ddd;

  .window-header {
    height: 30px;
    background-color: var(--el-color-primary);
    color: #fff;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 15px;
    cursor: move;
    user-select: none;

    .title {
      font-weight: bold;
    }

    .close-btn {
      cursor: pointer;
      font-size: 18px;
      &:hover { opacity: 0.8; }
    }
  }

  .window-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 10px;
    box-sizing: border-box;
    overflow: hidden;

    .control-bar {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
    }

    .filter-bar {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }

    .table-container {
      flex: 1;
      overflow: hidden;
    }

    .pagination-bar {
      margin-top: 8px;
      display: flex;
      justify-content: flex-end;
    }
  }
}
</style>