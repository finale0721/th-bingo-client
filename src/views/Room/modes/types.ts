import type { BingoType } from "@/types";
import type { Component } from "vue";

export interface RoomModePageConfig {
  mode: BingoType;
  pageClass: string;
  layout: Component;
  getMenu: (context: RoomModeMenuContext) => RoomMenuItem[];
}

export interface RoomModeMenuContext {
  soloMode: boolean;
  isPlayerA: boolean;
  isPlayerB: boolean;
  isHost: boolean;
}

export interface RoomMenuItem {
  label: string;
  value: number;
  tag?: string;
  isReset?: boolean;
}
