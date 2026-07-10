<template>
  <main :class="pageClass" data-room-mode="standard">
    <room-runtime :mode="mode" :layout="layout" :get-menu="getMenu" />
  </main>
</template>

<script lang="ts" setup>
import RoomRuntime from "../../components/RoomRuntime.vue";
import { useStandardRoomPage } from "./useStandardRoomPage";

const { mode, pageClass, layout, getMenu } = useStandardRoomPage();
</script>
