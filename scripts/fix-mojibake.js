const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "src");
const checkOnly = process.argv.includes("--check");

const extensions = new Set([".vue", ".ts", ".tsx", ".js", ".jsx"]);

const replacements = [
  ["璋冮€?", "调速"],
  ["鎬荤瓑绾?", "总等级"],
  ["鍥炴斁鎺у埗鎸夐挳", "回放控制按钮"],
  ["棰勮绠＄悊", "预设管理"],
  ["杩涘叆涓嬭疆", "进入下轮"],
  ["閫€鍑哄洖鏀?", "退出回放"],
  ["鎹㈠崱娆℃暟", "换卡次数"],
  ["寰楀垎", "得分"],
  ["宸叉敹绛夌骇", "已收等级"],
  ["绛夌骇", "等级"],
  ["鍓╀綑璺宠繃", "剩余跳过"],
  ["寮哄埗璺宠繃", "强制跳过"],
  ["鎾ら攢鏀跺彇", "撤销收取"],
  ["鎹㈤潰", "换面"],
  ["鍓╀綑", "剩余"],
  ["缁撴潫姣旇禌", "结束比赛"],
  ["纭锛歿{ winFlag < 0 ? roomData.names[0] : roomData.names[1] }}鑾疯儨", "确认：{{ winFlag < 0 ? roomData.names[0] : roomData.names[1] }}获胜"],
  ["鎶藉彇绗﹀崱", "抽取符卡"],
  ["閫夋嫨绗﹀崱", "选择符卡"],
  ["纭鏀跺彇", "确认收取"],
  ["绛夊緟瀵规墜閫夋嫨绗﹀崱", "等待对手选择符卡"],
  ["绛夊緟瀵规墜绂佺敤绗﹀崱", "等待对手禁用符卡"],
  ["绛夊緟鎴夸富鎿嶄綔", "等待房主操作"],
  ["绂佺敤绗﹀崱", "禁用符卡"],
  ["鍙栨秷纭", "取消确认"],
  ["纭璺嚎", "确认路线"],
  ["璺宠繃", "跳过"],
  ["纭畾", "确定"],
  ["鑷畾涔夋父鎴?", "自定义游戏"],
  ["寮€濮嬫瘮璧?", "开始比赛"],
  ["閲嶇疆鎴块棿", "重置房间"],
  ["缁х画姣旇禌", "继续比赛"],
  ["鏆傚仠姣旇禌", "暂停比赛"],
  ["娓呯┖鏍煎瓙", "清空格子"],
  ["娲楁贩鏍煎瓙", "洗混格子"],
  ["閲嶆柊BP", "重新BP"],
  ["鎾ゅ洖璺嚎", "撤回路线"],
  ["缃┖", "置空"],
  ["閫夋嫨", "选择"],
  ["鏀跺彇澶辫触", "收取失败"],
  ["鏀跺彇", "收取"],
  ["鍒锋柊", "刷新"],
  ["宸︿晶", "左侧"],
  ["鍙充晶", "右侧"],
  ["涓や晶", "两侧"],
  ["绂佺敤", "禁用"],
  ["璧涘墠BP", "赛前BP"],
  ["鏍囧噯璧?", "标准赛"],
  ["BP璧?", "BP赛"],
  ["璁＄畻鏄惁浜х敓浜嗘柊鐨勫洓杩?", "计算是否产生了新的四连"],
  ["濡傛灉娌℃湁瀵兼挱...", "如果没有导播..."],
  ["鎬诲け璐ユ鏁?", "总失败次数"],
  ["澶辫触鐨勪竴鏂圭垎鐐搁煶鏁?", "失败的一方爆点音效"],
  ["鍗曚汉缁冧範妯″紡鍏佽鍏抽棴鑳滃埄鍒ゅ畾", "单人练习模式允许关闭胜利判定"],
  ["鍚﹀垯鐢卞乏渚х帺瀹跺喅瀹氳儨鍒?", "否则由左侧玩家决定胜负"],
  ["宸叉弧瓒宠儨鍒╂潯浠讹紝绛夊緟宸︿晶鐜╁鍒ゆ柇鑳滆礋", "已满足胜利条件，等待左侧玩家判断胜负"],
  ["宸叉弧瓒宠儨鍒╂潯浠讹紝绛夊緟鎴夸富鍒ゆ柇鑳滆礋", "已满足胜利条件，等待房主判断胜负"],
  ["宸叉弧瓒宠儨鍒╂潯浠讹紝绛夊緟左侧鐜╁鍒ゆ柇鑳滆礋", "已满足胜利条件，等待左侧玩家判断胜负"],
  ["鍙屾柟宸插畬鎴愶紝绛夊緟纭鑳滆礋", "双方已完成，等待确认胜负"],
  ["姣旇禌宸茬粨鏉燂紝绛夊緟鎴夸富鎿嶄綔", "比赛已结束，等待房主操作"],
  ["姣旇禌宸茬粨鏉燂紝等待房主操作", "比赛已结束，等待房主操作"],
  ["鑾疯儨", "获胜"],
  ["姣旇禌缁撴潫", "比赛结束"],
  ["杩樻病鏈変汉鑾疯儨锛岀幇鍦ㄧ粨鏉熸瘮璧涜閫夋嫨涓€涓€夐」", "还没有人获胜，现在结束比赛请选择一个选项"],
  ["杩樻病鏈変汉获胜锛岀幇鍦ㄧ粨鏉熸瘮璧涜选择涓€涓€夐」", "还没有人获胜，现在结束比赛请选择一个选项"],
  ["缁撴灉浣滃簾", "结果作废"],
  ["娓告垙鏃堕棿鍒帮紝绛夊緟鎴夸富鍒ゆ柇鑳滆礋", "游戏时间到，等待房主判断胜负"],
  ["娓告垙鏃堕棿鍒帮紝绛夊緟宸︿晶鐜╁鍒ゆ柇鑳滆礋", "游戏时间到，等待左侧玩家判断胜负"],
  ["娓告垙鏃堕棿鍒帮紝绛夊緟左侧鐜╁鍒ゆ柇鑳滆礋", "游戏时间到，等待左侧玩家判断胜负"],
  ["纭", "确认"],
  ["鍙栨秷", "取消"],
  ["浠呭€掕鏃舵湡闂翠笖鏈疄闄呴€夋嫨鏃跺厑璁稿疄闄呯殑鐩橀潰杞崲", "仅倒计时期间且未实际选择时允许实际的盘面转换"],
  ["涓嶆槸閫夋墜锛屽缁堜负鏌ョ湅妯″紡", "不是选手，始终为查看模式"],
  ["鏄€夋墜锛屽彧鏈夊€掕鏃舵湡闂翠笖鏈疄闄呴€夊崱鎵嶆湁鑷敱杩涜瀹為檯鐨勫垏鎹紝鍏朵綑鎯呭喌浠ユ湇鍔″櫒涓哄噯", "是选手，只有倒计时期间且未实际选卡才可自由切换，其余情况以服务端为准"],
  ["鍦ㄤ笉鍏佽鑷敱鍒囨崲鐨勬椂鍊欙紝鍒ゆ柇閫夋墜鏄惁涓庢湇鍔″櫒鏈€杩戣繑鍥炵殑鏁版嵁鐩哥", "不允许自由切换时，判断选手是否与服务端最近返回的数据相符"],
  ["褰撴柊鐨勫洖鏀惧紑濮嬫椂锛屽皢UI婊戝潡鐨勪綅缃噸缃负1", "当新的回放开始时，将 UI 滑块的位置重置为 1"],
  ["濡傛灉宸茬粨鏉燂紝涓嶅仛浠讳綍浜?", "如果已经结束，不做任何事"],
  ["鍒囨崲鍥炴斁鎾斁/鏆傚仠", "切换回放播放/暂停"],
  ["鏀瑰彉鍥炴斁閫熷害", "改变回放速度"],
  ["鏍煎紡鍖栧洖鏀炬椂闂存樉绀?(淇濇寔涓嶅彉)", "格式化回放时间显示"],
  ["纭閫€鍑哄洖鏀?(淇濇寔涓嶅彉)", "确认退出回放"],
  ["淇濇寔涓嶅彉", "保持不变"],
  ["璁＄畻灞炴€э紝鐢ㄤ簬鍚戞ā鎬佹浼犻€掓暟鎹?", "计算属性，用于向模态框传递数据"],
  ["澶勭悊妯℃€佹纭浜嬩欢", "处理模态框确认事件"],
  ["澶勭悊妯℃€佹确认浜嬩欢", "处理模态框确认事件"],
  ["澶勭悊妯℃€佹娓呯┖浜嬩欢", "处理模态框清空事件"],
  ["妫€鏌ユ槸鍚﹀湪杈撳叆妗嗗唴锛岄伩鍏嶅啿绐?", "检查是否在输入框内，避免冲突"],
  ["閿洏蹇嵎閿?", "键盘快捷键"],
  ["纭娓呯┖", "确认清空"],
  ["确认娓呯┖", "确认清空"],
  ["纭娲楁贩", "确认洗混"],
  ["确认娲楁贩", "确认洗混"],
];

const suspiciousPattern = /閫|绛|鎶|鎹|寰|纭|璺|鏀|撳|姣|鎴|鐜|鍙|鍓|璧|濞|娑|幂|歿|锛|绂|鑾|鏆|閲|妫|浣|灞|鏍|鐩|鍒|鎬荤|鍥炴斁|鎺у埗|棰勮|杩涘叆|濡傛灉|瀵兼挱|鍔犲垎|澶辫触|鐐搁煶|鏂规硶|閿洏/;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

function applyReplacements(text) {
  let next = text;
  for (const [from, to] of replacements) {
    next = next.split(from).join(to);
  }
  return next;
}

const changed = [];
const suspicious = [];

for (const file of walk(root)) {
  const original = fs.readFileSync(file, "utf8");
  const fixed = applyReplacements(original);
  if (fixed !== original) {
    changed.push(path.relative(path.resolve(__dirname, ".."), file));
    if (!checkOnly) fs.writeFileSync(file, fixed, "utf8");
  }
  const textToCheck = checkOnly ? fixed : fs.readFileSync(file, "utf8");
  const lines = textToCheck.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (suspiciousPattern.test(line)) {
      suspicious.push(`${path.relative(path.resolve(__dirname, ".."), file)}:${index + 1}: ${line.trim()}`);
    }
  });
}

if (changed.length > 0) {
  console.log(`${checkOnly ? "Would fix" : "Fixed"} ${changed.length} file(s):`);
  changed.forEach((file) => console.log(`  ${file}`));
} else {
  console.log("No mojibake replacements needed.");
}

if (suspicious.length > 0) {
  console.error("\nSuspicious mojibake-like text remains:");
  suspicious.slice(0, 200).forEach((line) => console.error(`  ${line}`));
  if (suspicious.length > 200) {
    console.error(`  ... ${suspicious.length - 200} more`);
  }
  process.exit(1);
}

console.log("Mojibake check passed.");
