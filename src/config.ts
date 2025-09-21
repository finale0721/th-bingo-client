class WebSocketConfig {
  public static readonly url = process.env.VUE_APP_WS_API || ""; //webSocket地址
  public static readonly heartBeatInterval = 30; //发送心跳间隔秒数
  public static readonly maxRetryTimes = 3; //连接失败后尝试重新连接的最大次数
  public static readonly timeOutSeconds = 10; //发出心跳后多少秒没收到消息判断掉线
  public static readonly heartBeatMaxFailureTimes = 6;
}

const rankList = ["L", "EX", "PH"];
const difficultyList = [
  {
    name: "低",
    value: 1,
  },
  {
    name: "中",
    value: 2,
  },
  {
    name: "高",
    value: 3,
  },
  {
    name: "史",
    value: 4
  },
  {
    name: "随机",
    value: 0,
  },
];

const gameOptionList = [
  {
    code: "6",
    name: "红魔乡",
  },
  {
    code: "7",
    name: "妖妖梦",
  },
  {
    code: "8",
    name: "永夜抄",
  },
  {
    code: "10",
    name: "风神录",
  },
  {
    code: "11",
    name: "地灵殿",
  },
  {
    code: "12",
    name: "星莲船",
  },
  {
    code: "13",
    name: "神灵庙",
  },
  {
    code: "14",
    name: "辉针城",
  },
  {
    code: "15",
    name: "绀珠传",
  },
  {
    code: "16",
    name: "天空璋",
  },
  {
    code: "17",
    name: "鬼形兽",
  },
  {
    code: "18",
    name: "虹龙洞",
  },
];

const gameOptionListPoint1 = [
  {
    code: "101",
    name: "东方文花帖",
  },
  {
    code: "102",
    name: "文花帖DS",
  },
  {
    code: "103",
    name: "弹幕天邪鬼",
  },
  {
    code: "104",
    name: "密封噩梦日记",
  },
  {
    code: "105",
    name: "妖精大战争",
  }
];

const gameOptionFanGameList = [
  {
    code: "1001",
    name: "东方雪莲华"
  },
  {
    code: "1002",
    name: "东方祈华梦"
  },
  {
    code: "1003",
    name: "东方栖霞园"
  },
  {
    code: "1004",
    name: "东方夏夜祭"
  },
  {
    code: "1005",
    name: "东方宝天京"
  },
  {
    code: "1006",
    name: "东方潮圣书"
  },
  {
    code: "1007",
    name: "铃集无名之丘"
  },
  {
    code: "1008",
    name: "东方远空界"
  },
  {
    code: "1009",
    name: "东方资志疏"
  },
  {
    code: "1010",
    name: "东方幕华祭春雪"
  },
  {
    code: "1011",
    name: "东方希莲船"
  },
  {
    code: "1012",
    name: "东方桃源宫"
  },
  {
    code: "1013",
    name: "东方实在相（后果自负）"
  },
  {
    code: "1014",
    name: "东方真珠岛"
  },
]

const predefineColors = [
  "hsl(16, 100%, 50%)",
  "hsl(33, 100%, 50%)",
  "hsl(51, 100%, 50%)",
  "hsl(120, 72%, 75%)",
  "hsl(181, 100%, 41%)",
  "hsl(210, 100%, 56%)",
  "hsl(322, 80%, 43%)",
];

const gameTypeList = [
  {
    name: "bingo 标准赛",
    type: 1,
    timeLimit: 30, //分钟
    countdown: 180, //秒
  },
  {
    name: "bingo BP赛",
    type: 2,
    timeLimit: 60,
    countdown: 60,
  },
  {
    name: "bingo link赛",
    type: 3,
    timeLimit: 60,
    countdown: 300,
  },
];

const spellVersionList = [
  {
    name: "S6卡池",
    type: 1
  },
  {
    name: "S5卡池",
    type: 3
  },
  {
    name: "史卡池（你确定吗）",
    type: 5
  },
  {
    name: "小数点",
    type: 6
  },
  {
    name: "二同（游戏自备）",
    type: 8
  },
  {
    name: "缘（th10替换）",
    type: 7
  }
];

const spellListWithTimer = 1

const realSpellList = (version: number) => {
  if(version === 6) return gameOptionListPoint1
  if(version === 8) return gameOptionFanGameList
  return gameOptionList
}

abstract class Config {
  public static readonly webSocket = WebSocketConfig;
  public static readonly rankList = rankList;
  public static readonly gameOptionList = realSpellList;
  public static readonly predefineColors = predefineColors;
  public static readonly gameTypeList = gameTypeList;
  public static readonly difficultyList = difficultyList;
  public static readonly spellVersionList = spellVersionList;
  public static readonly spellListWithTimer = spellListWithTimer;
}

export default Config;
