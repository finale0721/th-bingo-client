import { BingoType, SpellStatus } from "@/types";
import type { RoomModeMenuContext, RoomModePageConfig } from "../types";
import StandardRoomLayout from "./StandardRoomLayout.vue";

const getMenu = ({ soloMode, isPlayerA, isPlayerB, isHost }: RoomModeMenuContext) => {
  if (soloMode) {
    const menu = [{ label: "置空", value: SpellStatus.NONE }];
    if (!isPlayerA && !isPlayerB) return menu;
    return [
      ...menu,
      { label: "选择", value: SpellStatus.LEFT_SELECT, tag: "playerA" },
      { label: "收取", value: SpellStatus.LEFT_GET, tag: "playerA" },
      { label: "选择", value: SpellStatus.RIGHT_SELECT, tag: "playerB" },
      { label: "收取", value: SpellStatus.RIGHT_GET, tag: "playerB" },
    ];
  }
  if (!isHost) return [];
  return [
    { label: "置空", value: SpellStatus.NONE },
    { label: "左侧选择", value: SpellStatus.LEFT_SELECT, tag: "playerA" },
    { label: "右侧选择", value: SpellStatus.RIGHT_SELECT, tag: "playerB" },
    { label: "两侧选择", value: SpellStatus.LEFT_SELECT | SpellStatus.RIGHT_SELECT },
    { label: "左侧收取", value: SpellStatus.LEFT_GET, tag: "playerA" },
    { label: "右侧收取", value: SpellStatus.RIGHT_GET, tag: "playerB" },
    { label: "刷新", value: 0x100 },
  ];
};

export const useStandardRoomPage = (): RoomModePageConfig => ({
  mode: BingoType.STANDARD,
  pageClass: "room-page-standard",
  layout: StandardRoomLayout,
  getMenu,
});
