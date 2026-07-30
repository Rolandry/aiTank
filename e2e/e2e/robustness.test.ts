import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(TEST_DIR, "../..");
const SERVER_DIR = resolve(PROJECT_DIR, "server");
const CLIENT_DIR = resolve(PROJECT_DIR, "client");

const CLIENT_PORT = 3999;
const SERVER_PORT = 8181;
const BASE_URL = `http://127.0.0.1:${CLIENT_PORT}`;

let browser: Browser;
let serverProcess: ChildProcess;
let clientProcess: ChildProcess;

beforeAll(async () => {
  // 启动服务端
  serverProcess = spawn(
    process.execPath,
    [resolve(SERVER_DIR, "node_modules/tsx/dist/cli.mjs"), "src/index.ts"],
    {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: String(SERVER_PORT) },
      stdio: "pipe",
    }
  );
  await new Promise((r) => setTimeout(r, 1000));

  // 启动客户端
  clientProcess = spawn(
    process.execPath,
    [
      resolve(CLIENT_DIR, "node_modules/vite/bin/vite.js"),
      "--port",
      String(CLIENT_PORT),
      "--host",
    ],
    {
      cwd: CLIENT_DIR,
      env: { ...process.env, VITE_WS_URL: `ws://127.0.0.1:${SERVER_PORT}/ws` },
      stdio: "pipe",
    }
  );
  await new Promise((r) => setTimeout(r, 2000));

  browser = await chromium.launch({ headless: true });
}, 30000);

afterAll(async () => {
  await browser?.close();
  serverProcess?.kill();
  clientProcess?.kill();
});

describe("鲁棒性测试", () => {
  it("无效昵称显示错误提示", async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE_URL);

    // 不输入昵称直接点击创建房间
    await page.click("text=创建房间");

    // 等待错误提示出现
    const errorText = await page.textContent(".error");
    expect(errorText).toBeTruthy();

    await ctx.close();
  });

  it("页面能正常加载并显示标题", async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE_URL);

    const title = await page.textContent("h1");
    expect(title).toContain("坦克");

    await ctx.close();
  });
});
