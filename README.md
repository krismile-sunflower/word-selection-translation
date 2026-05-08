# 划词翻译

拖选即翻译的桌面悬浮翻译工具。在任意应用中选中文字，松开鼠标自动翻译，结果以毛玻璃悬浮卡片形式显示在光标附近。

兼容所有 OpenAI 协议接口：智谱 AI、DeepSeek、Moonshot、Ollama 等。

---

## 功能

- **拖选触发**：在任意窗口拖选文字，松开鼠标自动触发翻译，无需快捷键
- **智能方向**：自动检测语言，中文→英文，英文/其他→中文
- **悬浮卡片**：透明毛玻璃弹框，显示在光标附近，自动避免超出屏幕边缘
- **快速复制**：翻译完成后一键复制结果
- **兼容多平台 API**：任何 OpenAI 兼容接口均可配置使用
- **设置页**：配置 API Key、Base URL、模型；支持自定义系统提示词

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri 2 |
| 前端 | React 19 + TypeScript + Vite |
| 后端 | Rust (enigo, reqwest, tokio) |
| 鼠标监听 | Windows WH_MOUSE_LL 低级钩子 |
| 数据持久化 | tauri-plugin-store |

## 开发环境

**前置要求**

- [Rust](https://rustup.rs/) (stable, MSVC toolchain)
- [Node.js](https://nodejs.org/) 18+
- pnpm

**安装依赖**

```bash
pnpm install
```

**启动开发模式**

```bash
pnpm tauri dev
```

**构建**

```bash
pnpm tauri build
```

## 配置

首次启动后，设置窗口（主窗口）会显示配置表单：

| 字段 | 说明 | 默认值 |
|---|---|---|
| API Key | LLM 服务密钥 | — |
| Base URL | OpenAI 兼容接口地址 | `https://open.bigmodel.cn/api/paas/v4` |
| 模型 | 模型名称 | `glm-4.5-air` |
| 系统提示词 | 自定义翻译指令（高级设置） | 内置默认提示词 |

填写后点击**保存**，再点击**测试连接**验证配置是否正确。

## 使用方式

1. 运行应用后托盘/窗口保持后台运行
2. 在任意程序中**拖选**一段文字
3. **松开鼠标**，悬浮翻译卡自动出现
4. 点击**复制**或按 **Esc** 关闭卡片
