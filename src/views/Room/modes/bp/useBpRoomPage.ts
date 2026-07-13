import { BingoType, SpellStatus } from "@/types";
import type { RoomModeMenuContext, RoomModePageConfig } from "../types";
import BpRoomLayout from "./BpRoomLayout.vue";

const getMenu = ({ isHost }: RoomModeMenuContext) => isHost ? [
  { label: "收取失败", value: SpellStatus.NONE, isReset: false },
  { label: "禁用", value: SpellStatus.BANNED },
  { label: "置空", value: SpellStatus.NONE, isReset: true },
  { label: "左侧选择", value: SpellStatus.LEFT_SELECT, tag: "playerA" },
  { label: "右侧选择", value: SpellStatus.RIGHT_SELECT, tag: "playerB" },
  { label: "左侧收取", value: SpellStatus.LEFT_GET, tag: "playerA" },
  { label: "右侧收取", value: SpellStatus.RIGHT_GET, tag: "playerB" },
  { label: "刷新", value: 0x100 },
] : [];

export const useBpRoomPage = (): RoomModePageConfig => ({
  mode: BingoType.BP,
  pageClass: "room-page-bp",
  layout: BpRoomLayout,
  getMenu,
});
