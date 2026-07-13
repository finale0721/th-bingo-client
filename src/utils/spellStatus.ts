import { SpellStatus } from "@/types";

export const SPELL_STATUS_VERSION = 2;
export const BASIC_STATUS_MASK = 0x0000ffff;
export const OPTIONAL_STATUS_MASK = 0xffff0000;
export const SELECT_STATUS_MASK = SpellStatus.LEFT_SELECT | SpellStatus.RIGHT_SELECT;
export const GET_STATUS_MASK = SpellStatus.LEFT_GET | SpellStatus.RIGHT_GET;
export const VISIBILITY_STATUS_MASK = SpellStatus.LEFT_SEE_ONLY | SpellStatus.RIGHT_SEE_ONLY;

export const basicSpellStatus = (status: number): number => status & BASIC_STATUS_MASK;

export const optionalSpellStatus = (status: number): number => status & OPTIONAL_STATUS_MASK;

export const withBasicSpellStatus = (status: number, basicStatus: number): number =>
  optionalSpellStatus(status) | (basicStatus & BASIC_STATUS_MASK);

export const withOptionalSpellStatus = (status: number, optionalStatus: number): number =>
  basicSpellStatus(status) | (optionalStatus & OPTIONAL_STATUS_MASK);

export const hasBasicAttribute = (status: number, attribute: number): boolean =>
  attribute === SpellStatus.NONE
    ? basicSpellStatus(status) === SpellStatus.NONE
    : (basicSpellStatus(status) & attribute) === attribute;

export const hasAnyBasicAttribute = (status: number, mask: number): boolean => (basicSpellStatus(status) & mask) !== 0;

export const isSelectStatus = (status: number): boolean => hasAnyBasicAttribute(status, SELECT_STATUS_MASK);

export const isGetStatus = (status: number): boolean => hasAnyBasicAttribute(status, GET_STATUS_MASK);

export const isEmptyStatus = (status: number): boolean => basicSpellStatus(status) === SpellStatus.NONE;

export interface OptionalSpellStatusParser {
  hasAttribute(status: number, attribute: number): boolean;
  isVisibleTo(status: number, playerIndex: 0 | 1 | null): boolean;
}

export const defaultOptionalSpellStatusParser: OptionalSpellStatusParser = {
  hasAttribute(status, attribute) {
    const optionalStatus = optionalSpellStatus(status);
    return attribute === SpellStatus.BOTH_HIDDEN
      ? optionalStatus === SpellStatus.BOTH_HIDDEN
      : (optionalStatus & attribute) === attribute;
  },
  isVisibleTo(status, playerIndex) {
    if (playerIndex === 0) return (status & SpellStatus.LEFT_SEE_ONLY) !== 0;
    if (playerIndex === 1) return (status & SpellStatus.RIGHT_SEE_ONLY) !== 0;
    return (status & VISIBILITY_STATUS_MASK) !== 0;
  },
};

export const isFullyHiddenStatus = (
  status: number,
  blindSetting: number,
  playerIndex: 0 | 1 | null,
  parser: OptionalSpellStatusParser = defaultOptionalSpellStatusParser
): boolean => {
  if (blindSetting <= 1) return false;
  const optionalStatus = optionalSpellStatus(status);
  const revealMask =
    SpellStatus.ONLY_REVEAL_GAME | SpellStatus.ONLY_REVEAL_GAME_STAGE | SpellStatus.ONLY_REVEAL_STAR;
  if ((optionalStatus & revealMask) !== 0) return false;
  return !parser.isVisibleTo(status, playerIndex);
};

export const convertLegacySpellStatus = (status: number, blindSetting: number): number => {
  switch (status) {
    case -1:
      return SpellStatus.BANNED;
    case 0:
      return blindSetting > 1 ? SpellStatus.LEFT_SEE_ONLY | SpellStatus.RIGHT_SEE_ONLY : SpellStatus.NONE;
    case 1:
      return SpellStatus.LEFT_SELECT;
    case 2:
      return SpellStatus.LEFT_SELECT | SpellStatus.RIGHT_SELECT;
    case 3:
      return SpellStatus.RIGHT_SELECT;
    case 5:
      return SpellStatus.LEFT_GET;
    case 6:
      return SpellStatus.LEFT_GET | SpellStatus.RIGHT_GET;
    case 7:
      return SpellStatus.RIGHT_GET;
    case 0x1000:
      return SpellStatus.BOTH_HIDDEN;
    case 0x1001:
      return SpellStatus.LEFT_SEE_ONLY;
    case 0x1002:
      return SpellStatus.RIGHT_SEE_ONLY;
    case 0x1010:
      return SpellStatus.ONLY_REVEAL_GAME;
    case 0x1011:
      return SpellStatus.ONLY_REVEAL_GAME_STAGE;
    case 0x1012:
      return SpellStatus.ONLY_REVEAL_STAR;
    default:
      throw new Error(`不支持的旧版符卡状态：${status}`);
  }
};

export const normalizeSpellStatuses = (statuses: number[], version: number, blindSetting: number): number[] => {
  if (version === SPELL_STATUS_VERSION) return [...statuses];
  if (version === 1) return statuses.map((status) => convertLegacySpellStatus(status, blindSetting));
  throw new Error(`不支持的符卡状态版本：${version}`);
};
