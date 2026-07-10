import { BingoType } from "@/types";
import type { RoomModeMenuContext, RoomModePageConfig } from "../types";
import StandardRoomLayout from "./StandardRoomLayout.vue";

const getMenu = ({ soloMode, isPlayerA, isPlayerB, isHost }: RoomModeMenuContext) => {
  if (soloMode) {
    const menu = [{ label: "置空", value: 0 }];
    if (!isPlayerA && !isPlayerB) return menu;
    return [
      ...menu,
      { label: "选择", value: 1, tag: "playerA" },
      { label: "收取", value: 5, tag: "playerA" },
      { label: "选择", value: 3, tag: "playerB" },
      { label: "收取", value: 7, tag: "playerB" },
    ];
  }
  if (!isHost) return [];
  return [
    { label: "置空", value: 0 },
    { label: "左侧选择", value: 1, tag: "playerA" },
    { label: "右侧选择", value: 3, tag: "playerB" },
    { label: "两侧选择", value: 2 },
    { label: "左侧收取", value: 5, tag: "playerA" },
    { label: "右侧收取", value: 7, tag: "playerB" },
    { label: "刷新", value: 0x100 },
  ];
};

export const useStandardRoomPage = (): RoomModePageConfig => ({
  mode: BingoType.STANDARD,
  pageClass: "room-page-standard",
  layout: StandardRoomLayout,
  getMenu,
});
