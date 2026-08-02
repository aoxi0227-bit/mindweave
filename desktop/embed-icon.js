"use strict";
// 用法：node embed-icon.js <exe 路径> <ico 路径>
const fs = require("fs");
const PELibrary = require("pe-library");
const ResEdit = require("resedit");

const [exePath, icoPath] = process.argv.slice(2);
if (!exePath || !icoPath || !fs.existsSync(exePath) || !fs.existsSync(icoPath)) {
  console.error("usage: node embed-icon.js <exe> <ico>");
  process.exit(1);
}
const data = fs.readFileSync(exePath);
const exe = PELibrary.NtExecutable.from(data);
const res = PELibrary.NtExecutableResource.from(exe);
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
if (!groups.length) { console.error("no icon group found in exe"); process.exit(1); }
for (const g of groups) {
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries, g.id, 1033, iconFile.icons.map((item) => item.data)
  );
}
// 版本元数据
const viList = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
if (viList.length) {
  const vi = viList[0];
  const fs2 = require("fs"), path = require("path");
  let ver = [1, 0, 0, 0];
  try {
    const vt = fs2.readFileSync(path.join(__dirname, "app", "VERSION"), "utf8").trim().split(".");
    ver = [0, 1, 2, 3].map((i) => parseInt(vt[i] || "0", 10) || 0);
  } catch (e) {}
  vi.setFileVersion(ver[0], ver[1], ver[2], ver[3], 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: "MindWeave Desktop",
    ProductName: "MindWeave",
    CompanyName: "MindWeave",
    OriginalFilename: "MindWeave.exe",
  });
  vi.outputToResourceEntries(res.entries);
}
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log("icon embedded into " + exePath + " (groups: " + groups.map((g) => g.id).join(",") + ")");
