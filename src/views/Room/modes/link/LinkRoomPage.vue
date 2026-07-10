<template>
  <main :class="pageClass" data-room-mode="link">
    <room-runtime :mode="mode" :layout="layout" :get-menu="getMenu" />
  </main>
</template>

<script lang="ts" setup>
import RoomRuntime from "../../components/RoomRuntime.vue";
import { useLinkRoomPage } from "./useLinkRoomPage";

const { mode, pageClass, layout, getMenu } = useLinkRoomPage();
</script>
