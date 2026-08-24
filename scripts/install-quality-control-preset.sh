#!/usr/bin/env bash
# 安装 dsh-qa 的「研发质量控制模式」（preset id: quality-control）。
# 用法：scripts/install-quality-control-preset.sh [--dest PATH] [--dry-run]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$REPO_ROOT/preset/quality-control"
QC_DEST="${QC_DEST:-$HOME/.dsh/.agent-presets/quality-control}"
QC_DRY_RUN="${QC_DRY_RUN:-0}"

usage() {
  sed -n '2,4p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest) QC_DEST="${2:-}"; shift 2 ;;
    --dry-run) QC_DRY_RUN=1; shift ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1" >&2; usage ;;
  esac
done

for source_file in agent.cordis.yml preset.yml; do
  if [[ ! -f "$SRC_DIR/$source_file" ]]; then
    echo "✗ 未找到 preset 源文件: $SRC_DIR/$source_file" >&2
    exit 1
  fi
done

echo "来源: $SRC_DIR"
echo "目标: ${QC_DEST}（DSH 用户 preset：quality-control / 研发质量控制模式）"
echo "----------------------------------------"

if [[ "$QC_DRY_RUN" == "1" ]]; then
  echo "[DRY-RUN] 创建 $QC_DEST/"
  echo "[DRY-RUN] 复制 agent.cordis.yml"
  echo "[DRY-RUN] 复制 preset.yml"
else
  mkdir -p "$QC_DEST"
  cp "$SRC_DIR/agent.cordis.yml" "$QC_DEST/agent.cordis.yml"
  cp "$SRC_DIR/preset.yml" "$QC_DEST/preset.yml"
  echo "✔ 已安装 quality-control preset：$QC_DEST"
fi

echo "----------------------------------------"
echo "完成。DSH 的 agentPreset.list 将包含 id=quality-control（研发质量控制模式）。"
