import { BingoType } from "@/types";
import type { RoomModePageConfig } from "../types";
import LinkRoomLayout from "./LinkRoomLayout.vue";

const getMenu = () => [];

export const useLinkRoomPage = (): RoomModePageConfig => ({
  mode: BingoType.LINK,
  pageClass: "room-page-link",
  layout: LinkRoomLayout,
  getMenu,
});
