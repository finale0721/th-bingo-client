<template>
  <component :is="activeRoomPage" />
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent } from "vue";
import { BingoType } from "@/types";
import { useRoomStore } from "@/store/RoomStore";

const roomStore = useRoomStore();

const roomPages = {
  [BingoType.STANDARD]: defineAsyncComponent(() => import("./modes/standard/StandardRoomPage.vue")),
  [BingoType.BP]: defineAsyncComponent(() => import("./modes/bp/BpRoomPage.vue")),
  [BingoType.LINK]: defineAsyncComponent(() => import("./modes/link/LinkRoomPage.vue")),
};

const activeRoomPage = computed(() => roomPages[roomStore.roomData.type] ?? roomPages[BingoType.STANDARD]);
</script>
