#!/usr/bin/env python3
"""生成站点快照并内联进 web/index.html。

数据源复用项目原有的 queryLine 接口，一次性抓取全部线路的上下行站点，
压缩为「站点名称表 + 线路方向站点数组」后写入页面，避免运行时重复请求线路详情。

用法：
    python scripts/generate-station-index.py            # 从官方接口抓取
    python scripts/generate-station-index.py --cache scripts/_line_details_snapshot.json
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import json
import re
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAGE = ROOT / "web" / "index.html"
START = "/* <<<STATION_INDEX_START>>> */"
END = "/* <<<STATION_INDEX_END>>> */"
BASE = "https://zjcx.zhuji.gov.cn:9443"
HEADERS = {
    "deviceId": "zjbus_web_1",
    "userToken": "userToken",
    "codeValue": "330681",
    "appCode": "330681",
    "sourceCodeValue": "330681",
    "appVersion": "1.0.0",
    "deviceTypeName": "weixin",
}


def post(path: str, body: dict, timeout: int = 30) -> dict:
    payload = json.dumps({"h": HEADERS, "b": body}).encode("utf-8")
    req = urllib.request.Request(
        BASE + path,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def fetch_line(name: str) -> tuple[str, dict | None, str]:
    last_error = ""
    for attempt in range(3):
        try:
            data = post(
                "/gzcx-busServer/client/busLine/queryLine",
                {"lineName": name, "needGeometry": 0},
            )
            if str(data.get("code") or data.get("returnFlag")) == "200" and data.get("data"):
                return name, data["data"], ""
            last_error = "接口返回异常"
        except Exception as exc:  # noqa: BLE001 - 网络重试
            last_error = str(exc)
        time.sleep(0.4 * (attempt + 1))
    return name, None, last_error


def load_lines() -> list[str]:
    source = PAGE.read_text(encoding="utf-8")
    match = re.search(r"^const SEED_LINES=(\[.*\]);$", source, re.M)
    if not match:
        raise SystemExit("未找到 SEED_LINES")
    return [row[0] for row in json.loads(match.group(1)) if row and row[0]]


def fetch_all(names: list[str]) -> dict:
    result: dict = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for name, data, error in pool.map(fetch_line, names):
            if data:
                result[name] = data
            else:
                print(f"跳过 {name}: {error}")
    if len(result) < len(names) * 0.9:
        raise SystemExit(f"抓取成功率过低：{len(result)}/{len(names)}")
    return result


def compact(details: dict) -> dict:
    names: list[str] = []
    name_index: dict[str, int] = {}

    def name_id(value) -> int:
        text = str(value or "").strip()
        if text not in name_index:
            name_index[text] = len(names)
            names.append(text)
        return name_index[text]

    lines = []
    for line_name, detail in details.items():
        directions = []
        for key in ("up", "down"):
            direction = detail.get(key) or {}
            stops = sorted(
                direction.get("stationList") or [],
                key=lambda item: int(item.get("stationOrder") or 0),
            )
            if not stops:
                continue
            packed = []
            for stop in stops:
                try:
                    lat = round(float(stop.get("poiOriginLat") or 0) * 100000)
                except (TypeError, ValueError):
                    lat = 0
                try:
                    lon = round(float(stop.get("poiOriginLon") or 0) * 100000)
                except (TypeError, ValueError):
                    lon = 0
                try:
                    distance = max(0, int(round(float(stop.get("lastDistance") or 0))))
                except (TypeError, ValueError):
                    distance = 0
                packed.append([name_id(stop.get("stationName")), distance, lat, lon])
            directions.append(
                {
                    "k": key,
                    "id": str(direction.get("id") or ""),
                    "f": str(direction.get("startFirst") or "")[:5],
                    "l": str(direction.get("startLast") or "")[:5],
                    "s": packed,
                }
            )
        if directions:
            lines.append({"n": line_name, "d": directions})

    return {
        "v": 1,
        "generated": dt.date.today().isoformat(),
        "names": names,
        "lines": lines,
    }


def inject(snapshot: dict) -> None:
    source = PAGE.read_text(encoding="utf-8")
    payload = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
    block = f"{START}\nconst STATION_SNAPSHOT = {payload};\n{END}"
    if START in source and END in source:
        before, rest = source.split(START, 1)
        _, after = rest.split(END, 1)
        source = before + block + after
    else:
        marker = "/* ==================== 基础工具 ==================== */"
        if marker not in source:
            raise SystemExit("未找到插入位置：基础工具注释")
        source = source.replace(marker, block + "\n\n" + marker, 1)
    PAGE.write_text(source, encoding="utf-8")
    size = len(payload.encode("utf-8"))
    print(f"已写入 {PAGE.relative_to(ROOT)}，快照 {size / 1024:.0f} KB")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", help="已有 queryLine 原始结果 JSON，跳过网络抓取")
    args = parser.parse_args()
    names = load_lines()
    if args.cache:
        details = json.loads(Path(args.cache).read_text(encoding="utf-8"))
        print(f"使用缓存：{len(details)} 条线路")
    else:
        print(f"从接口抓取 {len(names)} 条线路…")
        details = fetch_all(names)
    inject(compact(details))


if __name__ == "__main__":
    main()
