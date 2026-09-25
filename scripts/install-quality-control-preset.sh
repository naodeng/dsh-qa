#!/usr/bin/env bash
# Install the optional quality-control profile bundle.
# Harness 0.1.7+ owns preset declarations in profile bundles; this script
# installs the bundle package shipped inside the current dsh-qa checkout.
#
# Usage:
#   scripts/install-quality-control-preset.sh [--profile NAME] [--dsh PATH] [--dry-run]
#
# Environment:
#   DSH_PROFILE         default profile name (web)
#   DSH_BIN             DSH executable (dsh)
#   DSH_QC_BUNDLE       bundle spec override (local bundle by default)
#   DSH_HOME            forwarded to DSH when set
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROFILE="${DSH_PROFILE:-web}"
DSH_BIN="${DSH_BIN:-dsh}"
BUNDLE_SPEC="${DSH_QC_BUNDLE:-link:$REPO_ROOT/preset/quality-control}"
DRY_RUN=0

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile)
      if [[ $# -lt 2 || -z "${2:-}" || "${2}" == -* ]]; then
        echo "✗ --profile 需要一个非空值" >&2
        exit 2
      fi
      PROFILE="$2"
      shift 2
      ;;
    --dsh)
      if [[ $# -lt 2 || -z "${2:-}" || "${2}" == -* ]]; then
        echo "✗ --dsh 需要一个非空值" >&2
        exit 2
      fi
      DSH_BIN="$2"
      shift 2
      ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ -z "$PROFILE" || -z "$DSH_BIN" ]]; then
  echo "✗ profile 和 dsh executable 不能为空" >&2
  exit 2
fi

PROFILE_LOWER="$(printf '%s' "$PROFILE" | tr '[:upper:]' '[:lower:]')"
if [[ "$PROFILE_LOWER" == "desktop" ]]; then
  echo "✗ desktop profile 由官方 Electron 客户端管理，不能通过 CLI 修改；请在 DSH 客户端的插件页安装。独立 Web 请使用 --profile web。" >&2
  exit 2
fi

echo "来源 bundle: ${BUNDLE_SPEC}"
echo "目标 profile: ${PROFILE}"
echo "----------------------------------------"

if [[ "$DRY_RUN" == "1" ]]; then
  printf '[DRY-RUN] %q plugin --profile %q add %q\n' "$DSH_BIN" "$PROFILE" "$BUNDLE_SPEC"
else
  if ! command -v "$DSH_BIN" >/dev/null 2>&1; then
    echo "✗ 未找到 DSH executable: $DSH_BIN（可用 --dsh 或 DSH_BIN 指定）" >&2
    exit 1
  fi
  "$DSH_BIN" plugin --profile "$PROFILE" add "$BUNDLE_SPEC"
  echo "✔ 已将 quality-control bundle 安装到 profile：${PROFILE}"
fi

echo "完成。Harness 将从当前 profile 的声明中提供 id=quality-control。"
