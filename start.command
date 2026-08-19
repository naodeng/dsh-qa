#!/bin/bash
# 质量工作台独立模式启动器（macOS 双击运行）
cd "$(dirname "$0")"
exec node server/cli.js
