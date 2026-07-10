<template>
  <main :class="pageClass" data-room-mode="bp">
    <room-runtime :mode="mode" :layout="layout" :get-menu="getMenu" />
  </main>
</template>

<script lang="ts" setup>
import RoomRuntime from "../../components/RoomRuntime.vue";
import { useBpRoomPage } from "./useBpRoomPage";

const { mode, pageClass, layout, getMenu } = useBpRoomPage();
</script>
