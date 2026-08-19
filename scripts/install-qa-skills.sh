#!/usr/bin/env bash
# =============================================================================
# install-qa-skills.sh
# 把 awesome-qa-skills 的测试技能安装为 DSH 技能，供「质量工作台」对话内
# 以 /skill-name 或 DSH 技能面板调用。
#
# 用法:
#   scripts/install-qa-skills.sh [--src PATH] [--lang zh|en|all] [--skill NAME] [--dry-run]
#
# 选项:
#   --src PATH    awesome-qa-skills 仓库路径（默认 ~/awsomeCode/awesome-qa-skills）
#   --lang LANG   zh | en | all（默认 zh）
#   --skill NAME  只安装单个技能（目录名，如 test-case-writing）
#   --dry-run     仅预览，不写入
#   -h, --help    帮助
#
# 目标目录: $HOME/.dsh/skills/（可用 DSH_SKILLS_DIR 覆盖）
# =============================================================================
set -euo pipefail

DEFAULT_SRC="$HOME/awsomeCode/awesome-qa-skills"
QA_SRC="${QA_SRC:-$DEFAULT_SRC}"
QA_LANG="${QA_LANG:-zh}"
QA_SKILL="${QA_SKILL:-all}"
QA_DRY_RUN="${QA_DRY_RUN:-0}"
QA_DEST="${DSH_SKILLS_DIR:-$HOME/.dsh/skills}"

usage() {
  sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --src) QA_SRC="${2:-}"; shift 2 ;;
    --lang) QA_LANG="${2:-}"; shift 2 ;;
    --skill) QA_SKILL="${2:-}"; shift 2 ;;
    --dest) QA_DEST="${2:-}"; shift 2 ;;
    --dry-run) QA_DRY_RUN=1; shift ;;
    -h|--help) usage ;;
    *) echo "未知参数: $1" >&2; usage ;;
  esac
done

if [[ ! -d "${QA_SRC}/skills" ]]; then
  echo "✗ 未找到技能仓库: ${QA_SRC}/skills" >&2
  echo "  请用 --src 指定 awesome-qa-skills 的本地路径。" >&2
  exit 1
fi

mkdir -p "${QA_DEST}"

install_dir() {
  local dir="$1"
  [[ -d "$dir" ]] || return 0
  for s in "$dir"/*; do
    [[ -d "$s" ]] || continue
    local name
    name="$(basename "$s")"
    if [[ "${QA_SKILL}" == "all" || "${QA_SKILL}" == "$name" ]]; then
      if [[ "$QA_DRY_RUN" == "1" ]]; then
        echo "[DRY-RUN] 安装 $name -> ${QA_DEST}/${name}"
      else
        rm -rf "${QA_DEST}/${name}"
        cp -R "$s" "${QA_DEST}/${name}"
        echo "✔ 已安装 $name"
      fi
    fi
  done
}

echo "来源: ${QA_SRC}"
echo "目标: ${QA_DEST}（DSH 技能目录）"
echo "语言: ${QA_LANG} | 技能: ${QA_SKILL}"
echo "----------------------------------------"

case "${QA_LANG}" in
  zh|all) install_dir "${QA_SRC}/skills/zh/testing-types"; install_dir "${QA_SRC}/skills/zh/testing-workflows" ;;
esac
case "${QA_LANG}" in
  en|all) install_dir "${QA_SRC}/skills/en/testing-types"; install_dir "${QA_SRC}/skills/en/testing-workflows" ;;
esac

if [[ "$QA_DRY_RUN" == "1" ]]; then
  echo "----------------------------------------"
  echo "以上为预览。去掉 --dry-run 后执行安装。"
else
  echo "----------------------------------------"
  echo "完成。重启 dsh web 后，在质量工作台对话中输入 / 即可看到新技能。"
fi
