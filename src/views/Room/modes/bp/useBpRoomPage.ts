import { BingoType } from "@/types";
import type { RoomModeMenuContext, RoomModePageConfig } from "../types";
import BpRoomLayout from "./BpRoomLayout.vue";

const getMenu = ({ isHost }: RoomModeMenuContext) => isHost ? [
  { label: "收取失败", value: 0, isReset: false },
  { label: "禁用", value: -1 },
  { label: "置空", value: 0, isReset: true },
  { label: "左侧选择", value: 1, tag: "playerA" },
  { label: "右侧选择", value: 3, tag: "playerB" },
  { label: "左侧收取", value: 5, tag: "playerA" },
  { label: "右侧收取", value: 7, tag: "playerB" },
  { label: "刷新", value: 0x100 },
] : [];

export const useBpRoomPage = (): RoomModePageConfig => ({
  mode: BingoType.BP,
  pageClass: "room-page-bp",
  layout: BpRoomLayout,
  getMenu,
});
