#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const playwrightModule = process.env.PLAYWRIGHT_MODULE
  || "/tmp/md-quiz-demo-video-tooling/node_modules/playwright";
const { chromium } = require(playwrightModule);

const VIEWPORT = { width: 1920, height: 1080 };
const OUTPUT_DIR = path.resolve(
  process.env.DEMO_OUTPUT_DIR || "artifacts/demo-video",
);
const BROWSER_EXECUTABLE = process.env.DEMO_BROWSER_EXECUTABLE
  || "/tmp/md-quiz-demo-video-browsers/chromium-1234/chrome-linux64/chrome";
const MODE = process.env.DEMO_MODE === "preview" ? "preview" : "record";
const QUIZ_DETAIL_PATH = process.env.DEMO_QUIZ_DETAIL_PATH
  || "/admin/quizzes/common-test-2025";

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`缺少运行配置：${name}`);
  }
  return value;
}

function pageUrl(baseUrl, pathname) {
  return new URL(pathname, baseUrl).toString();
}

async function login(browser, baseUrl) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: VIEWPORT,
  });
  const page = await context.newPage();

  await page.goto(pageUrl(baseUrl, "/admin/login"), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.locator('input[autocomplete="username"]').fill(
    requiredEnv("ADMIN_USERNAME"),
  );
  await page.locator('input[autocomplete="current-password"]').fill(
    requiredEnv("ADMIN_PASSWORD"),
  );
  await page.locator('button[type="submit"]').click();
  await page.locator(".admin-r-shell").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  const state = await context.storageState();
  await context.close();
  return state;
}

async function installPrivacyLayer(context, publicHost) {
  await context.addInitScript(({ host }) => {
    const exactHost = String(host || "");
    const escapedHost = exactHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hostPattern = escapedHost
      ? new RegExp(`(?:https?:\\/\\/)?${escapedHost}`, "gi")
      : null;

    const redactText = (value) => {
      const text = String(value || "");
      const withoutHost = hostPattern
        ? text.replace(hostPattern, "演示环境")
        : text;
      return withoutHost.replace(/\b1[3-9]\d{9}\b/g, "138****0000");
    };

    const scrub = () => {
      document.querySelectorAll(
        ".admin-r-user-name, .admin-r-user-menu__account",
      ).forEach((node) => {
        if (node.textContent !== "演示账号") {
          node.textContent = "演示账号";
        }
      });

      const loginUsername = document.querySelector(
        'input[autocomplete="username"]',
      );
      if (
        loginUsername
        && loginUsername.value
        && loginUsername.value !== "演示账号"
      ) {
        loginUsername.value = "演示账号";
      }

      document.querySelectorAll(".admin-public-invite").forEach((node) => {
        node.style.setProperty("display", "none", "important");
      });

      document.querySelectorAll(".admin-r-repo-input code").forEach((node) => {
        if (node.textContent !== "演示题库仓库") {
          node.textContent = "演示题库仓库";
        }
      });

      document.querySelectorAll(
        ".admin-r-responsive-list--assignments "
          + ".admin-r-responsive-list__row, "
          + ".admin-r-responsive-list--dashboard "
          + ".admin-r-responsive-list__row",
      ).forEach((row, index) => {
        const candidate = row.querySelector(
          ".admin-r-responsive-list__cell--candidate",
        );
        const name = candidate?.querySelector(".admin-r-row-title");
        const token = candidate?.querySelector(".admin-r-row-meta");
        const demoIndex = String(index + 1).padStart(2, "0");
        if (name && name.textContent !== `演示候选人 ${demoIndex}`) {
          name.textContent = `演示候选人 ${demoIndex}`;
        }
        if (token && token.textContent !== `DEMO-RECORD-${demoIndex}`) {
          token.textContent = `DEMO-RECORD-${demoIndex}`;
        }
      });

      const candidateInput = document.querySelector(
        'input[placeholder="请选择候选人"]',
      );
      const candidateSelect = candidateInput?.closest(".relative");
      candidateSelect?.querySelectorAll("button").forEach((button, index) => {
        const name = button.querySelector("div.text-sm");
        const phone = button.querySelector(".admin-r-code");
        const demoIndex = String(index + 1).padStart(2, "0");
        if (name && name.textContent !== `演示候选人 ${demoIndex}`) {
          name.textContent = `演示候选人 ${demoIndex}`;
        }
        if (phone && phone.textContent !== "138****0000") {
          phone.textContent = "138****0000";
        }
      });
      if (
        candidateInput
        && candidateInput.value
        && candidateInput.value !== "演示候选人"
      ) {
        candidateInput.value = "演示候选人";
      }

      if (document.querySelector(".admin-r-review-question")) {
        document.querySelectorAll(
          ".admin-r-breadcrumb__current, [aria-current='page']",
        ).forEach((breadcrumb) => {
          if (breadcrumb.textContent !== "答题详情") {
            breadcrumb.textContent = "答题详情";
          }
        });
      }

      document.querySelectorAll(
        '[x-text^="attemptReviewShortAnswerText"]',
      ).forEach((node) => {
        const demoAnswer = "演示作答：围绕题目要求给出结构化回答。";
        if (node.textContent !== demoAnswer) node.textContent = demoAnswer;
      });
      document.querySelectorAll('[x-text="question.reason"]').forEach((node) => {
        const demoReason = "系统依据评分标准自动生成评分理由。";
        if (node.textContent !== demoReason) node.textContent = demoReason;
      });
      document.querySelectorAll(
        '[x-text="attemptReviewEvaluation().final_analysis"]',
      ).forEach((node) => {
        const demoAnalysis = "综合作答表现稳定，关键能力维度清晰可见。";
        if (node.textContent !== demoAnalysis) {
          node.textContent = demoAnalysis;
        }
      });
      document.querySelectorAll(
        '[x-text="attemptReviewEvaluation().candidate_remark"]',
      ).forEach((node) => {
        const demoRemark = "演示候选人的能力表现已完成自动归纳。";
        if (node.textContent !== demoRemark) node.textContent = demoRemark;
      });
      document.querySelectorAll(
        '[x-show^="assignmentHandledMeta"]',
      ).forEach((node) => {
        if (node.textContent !== "处理状态：已完成") {
          node.textContent = "处理状态：已完成";
        }
      });

      document.querySelectorAll(
        '[x-text*="integration?.summary"]',
      ).forEach((node) => {
        const summary = node.closest("#sms-config")
          ? "短信认证已配置 · 接口正常"
          : "模型服务已配置 · 接口正常";
        if (node.textContent !== summary) node.textContent = summary;
      });

      if (!hostPattern || !document.body) return;
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
      );
      let node = walker.nextNode();
      while (node) {
        const next = redactText(node.nodeValue);
        if (next !== node.nodeValue) node.nodeValue = next;
        node = walker.nextNode();
      }
      document.querySelectorAll("[href], [src], [value]").forEach((element) => {
        for (const attribute of ["href", "src", "value"]) {
          if (!element.hasAttribute(attribute)) continue;
          const current = element.getAttribute(attribute);
          const next = redactText(current);
          if (current !== next) element.setAttribute(attribute, next);
        }
      });
    };

    const start = () => {
      const style = document.createElement("style");
      style.id = "mdq-demo-privacy-style";
      style.textContent = `
        .assignment-qr-thumb {
          visibility: hidden !important;
        }
        .admin-public-invite {
          display: none !important;
        }
        body:has(.admin-r-review-question) .admin-r-breadcrumb__current {
          color: transparent !important;
          font-size: 0 !important;
        }
        body:has(.admin-r-review-question)
          .admin-r-breadcrumb__current::after {
          content: "答题详情";
          color: #0f172a;
          font-size: .875rem;
        }
      `;
      document.head.append(style);
      scrub();
      const observer = new MutationObserver(scrub);
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["href", "src", "value"],
      });
      window.setInterval(scrub, 250);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }, { host: publicHost });
}

async function waitForQuizList(page) {
  await page.locator(".admin-r-shell").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  const rows = page.locator(
    ".admin-r-workspace--split section.admin-r-surface "
      + '[role="button"].admin-r-row',
  );
  await rows.first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(800);
  return rows;
}

async function ensureCursor(page) {
  await page.evaluate(() => {
    if (document.querySelector("#mdq-demo-cursor")) return;
    const style = document.createElement("style");
    style.textContent = `
      #mdq-demo-cursor {
        position: fixed;
        left: 0;
        top: 0;
        z-index: 2147483647;
        width: 24px;
        height: 24px;
        border: 3px solid rgba(255, 255, 255, .98);
        border-radius: 999px;
        background: #2563eb;
        box-shadow: 0 3px 14px rgba(15, 23, 42, .42);
        pointer-events: none;
        opacity: 0;
        transform: translate(-50%, -50%);
        transition:
          left 560ms cubic-bezier(.22, .82, .24, 1),
          top 560ms cubic-bezier(.22, .82, .24, 1),
          opacity 160ms ease;
      }
      #mdq-demo-cursor.is-visible { opacity: 1; }
      #mdq-demo-cursor::after {
        content: "";
        position: absolute;
        inset: -12px;
        border: 3px solid rgba(37, 99, 235, .48);
        border-radius: inherit;
        opacity: 0;
      }
      #mdq-demo-cursor.is-clicking::after {
        animation: mdq-demo-click 520ms ease-out;
      }
      @keyframes mdq-demo-click {
        0% { opacity: .95; transform: scale(.3); }
        100% { opacity: 0; transform: scale(1.8); }
      }
    `;
    document.head.append(style);
    const cursor = document.createElement("div");
    cursor.id = "mdq-demo-cursor";
    document.body.append(cursor);
  });
}

async function moveCursor(page, x, y, durationMs = 620) {
  await ensureCursor(page);
  await page.evaluate(({ left, top }) => {
    const cursor = document.querySelector("#mdq-demo-cursor");
    cursor.style.left = `${left}px`;
    cursor.style.top = `${top}px`;
    cursor.classList.add("is-visible");
  }, { left: x, top: y });
  await page.waitForTimeout(durationMs);
}

async function moveCursorTo(page, locator, durationMs = 620) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error("目标控件当前不可见");
  const point = {
    x: box.x + Math.min(box.width * 0.54, box.width - 28),
    y: box.y + Math.min(box.height * 0.5, box.height - 20),
  };
  await moveCursor(page, point.x, point.y, durationMs);
  return point;
}

async function clickWithCursor(
  page,
  locator,
  moveDurationMs = 620,
  settleDurationMs = 520,
) {
  const point = await moveCursorTo(page, locator, moveDurationMs);
  await page.evaluate(() => {
    const cursor = document.querySelector("#mdq-demo-cursor");
    cursor.classList.remove("is-clicking");
    void cursor.offsetWidth;
    cursor.classList.add("is-clicking");
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(settleDurationMs);
}

function assignmentRows(page) {
  return page.locator(
    ".admin-r-responsive-list--assignments "
      + '.admin-r-responsive-list__row[role="button"]',
  );
}

async function waitForAssignments(page) {
  await page.locator(".admin-r-shell").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await assignmentRows(page).first().waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.waitForTimeout(600);
}

async function discoverDemoRoutes(browser, baseUrl, storageState) {
  const context = await browser.newContext({
    storageState,
    ignoreHTTPSErrors: true,
    viewport: VIEWPORT,
  });
  const page = await context.newPage();

  await page.goto(pageUrl(baseUrl, "/admin/quizzes"), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await waitForQuizList(page);
  await page.goto(pageUrl(baseUrl, QUIZ_DETAIL_PATH), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await page.getByText("当前选择版本", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  const quizDetailPath = new URL(page.url()).pathname;

  const finishedAssignmentsPath =
    "/admin/assignments?status=finished&start_from=&end_to=";
  await page.goto(pageUrl(baseUrl, finishedAssignmentsPath), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  try {
    await waitForAssignments(page);
  } catch {
    await page.goto(
      pageUrl(baseUrl, "/admin/assignments?start_from=&end_to="),
      { waitUntil: "domcontentloaded", timeout: 30_000 },
    );
    await waitForAssignments(page);
  }

  let attemptDetailPath = "";
  const candidateCount = Math.min(await assignmentRows(page).count(), 8);
  for (let index = 0; index < candidateCount; index += 1) {
    const row = assignmentRows(page).nth(index);
    await row.click();
    await page.waitForURL(/\/admin\/attempt\/[^/?#]+/, {
      timeout: 30_000,
    });
    await page.getByRole("heading", {
      name: "答题回放",
      exact: true,
    }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
    if (await page.locator(".admin-r-review-question").count()) {
      attemptDetailPath = new URL(page.url()).pathname;
      break;
    }
    await page.goto(pageUrl(baseUrl, finishedAssignmentsPath), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await waitForAssignments(page);
  }
  await context.close();

  if (!attemptDetailPath) {
    throw new Error("没有找到可用于演示的已完成答题记录");
  }
  return { quizDetailPath, attemptDetailPath };
}

async function waitUntil(page, startMs, targetMs) {
  const remaining = targetMs - (Date.now() - startMs);
  if (remaining > 0) await page.waitForTimeout(remaining);
}

async function waitForScene(page, sceneName) {
  if (sceneName === "login") {
    await page.locator('input[autocomplete="username"]').waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.locator('button[type="submit"]').waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
    return;
  }
  await page.locator(".admin-r-shell").waitFor({
    state: "visible",
    timeout: 30_000,
  });
  if (sceneName === "dashboard") {
    await page.getByRole("heading", {
      name: "总览工作台",
      exact: true,
    }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
  } else if (sceneName === "list") {
    await waitForQuizList(page);
  } else if (sceneName === "quiz") {
    await page.getByText("当前选择版本", { exact: true }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.locator("article").first().waitFor({
      state: "visible",
      timeout: 30_000,
    });
  } else if (sceneName === "invite") {
    await page.getByRole("heading", {
      name: "创建邀约",
      exact: true,
    }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await assignmentRows(page).first().waitFor({
      state: "visible",
      timeout: 30_000,
    });
  } else if (sceneName === "answer") {
    await page.getByRole("heading", {
      name: "答题回放",
      exact: true,
    }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.locator(".admin-r-review-question").first().waitFor({
      state: "visible",
      timeout: 30_000,
    });
  } else if (sceneName === "status") {
    await page.getByRole("heading", {
      name: "系统状态摘要",
      exact: true,
    }).waitFor({
      state: "visible",
      timeout: 30_000,
    });
  }
  await page.waitForTimeout(700);
}

async function performLoginScene(page, startMs) {
  const username = page.locator('input[autocomplete="username"]');
  await clickWithCursor(page, username, 260, 120);
  await username.fill("演示账号");
  await waitUntil(page, startMs, 550);

  const password = page.locator('input[autocomplete="current-password"]');
  await clickWithCursor(page, password, 260, 120);
  await password.fill("demo-access");
  await waitUntil(page, startMs, 1_100);

  await moveCursorTo(page, page.locator('button[type="submit"]'), 360);
  await waitUntil(page, startMs, 2_400);
}

async function performListScene(page, startMs) {
  const activeNav = page.getByRole("button", {
    name: "测验",
    exact: true,
  });
  if (await activeNav.count()) {
    await moveCursorTo(page, activeNav.first(), 320);
  }
  await waitUntil(page, startMs, 650);

  const firstRow = page.locator(
    ".admin-r-workspace--split section.admin-r-surface "
      + '[role="button"].admin-r-row',
  ).first();
  await moveCursorTo(page, firstRow, 420);
  await waitUntil(page, startMs, 2_600);
}

async function performDashboardScene(page, startMs) {
  const kpiCards = page.locator(".admin-r-kpi");
  await moveCursorTo(page, kpiCards.first(), 360);
  await waitUntil(page, startMs, 900);

  if (await kpiCards.count() > 2) {
    await moveCursorTo(page, kpiCards.nth(2), 360);
  }
  await waitUntil(page, startMs, 1_750);

  const syncPanel = page.getByText("题库同步", { exact: true }).first();
  if (await syncPanel.count()) {
    await moveCursorTo(page, syncPanel, 360);
  }
  await waitUntil(page, startMs, 3_000);
}

async function performQuizScene(page, startMs) {
  await moveCursor(page, 1320, 760, 300);
  await page.mouse.wheel(0, 620);
  await waitUntil(page, startMs, 1_250);

  await page.mouse.wheel(0, 720);
  await waitUntil(page, startMs, 2_250);

  await moveCursor(page, 1180, 620, 360);
  await waitUntil(page, startMs, 4_300);
}

async function performInviteScene(page, startMs) {
  const quizInput = page.locator('input[placeholder="请选择测验"]');
  await clickWithCursor(page, quizInput, 320, 180);
  const quizOption = quizInput.locator("xpath=../../div[2]//button").first();
  await quizOption.waitFor({ state: "visible", timeout: 10_000 });
  await clickWithCursor(page, quizOption, 280, 160);
  await waitUntil(page, startMs, 1_250);

  const candidateInput = page.locator('input[placeholder="请选择候选人"]');
  await clickWithCursor(page, candidateInput, 320, 180);
  const candidateOption = candidateInput
    .locator("xpath=../../div[2]//button")
    .first();
  if (await candidateOption.count()) {
    await candidateOption.waitFor({ state: "visible", timeout: 10_000 });
    await clickWithCursor(page, candidateOption, 280, 160);
  }
  await waitUntil(page, startMs, 2_600);

  const createButton = page.getByRole("button", {
    name: /创建邀请链接/,
  });
  await moveCursorTo(page, createButton, 420);
  await waitUntil(page, startMs, 4_300);
}

async function performAnswerScene(page, startMs) {
  const evaluation = page.getByRole("heading", {
    name: "智能评价",
    exact: true,
  });
  if (await evaluation.count()) {
    await moveCursorTo(page, evaluation.first(), 420);
  }
  await waitUntil(page, startMs, 1_100);

  const firstQuestion = page.locator(".admin-r-review-question").first();
  await firstQuestion.evaluate((element) => {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  await waitUntil(page, startMs, 2_100);
  const selectedBadge = page.getByText("候选人选择", { exact: true }).first();
  if (await selectedBadge.count()) {
    await moveCursorTo(page, selectedBadge, 420);
  } else {
    await moveCursorTo(
      page,
      firstQuestion.locator("header").first(),
      420,
    );
  }
  await waitUntil(page, startMs, 4_500);
}

async function performStatusScene(page, startMs) {
  const llmCard = page.getByText("LLM tokens", { exact: true });
  await moveCursorTo(page, llmCard.first(), 420);
  await waitUntil(page, startMs, 1_050);

  const smsCard = page.getByText("短信调用", { exact: true });
  await moveCursorTo(page, smsCard.first(), 420);
  await waitUntil(page, startMs, 2_000);

  const dailyTable = page.locator(".admin-status-daily-table");
  await dailyTable.evaluate((element) => {
    element.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  await waitUntil(page, startMs, 2_800);
  await moveCursorTo(page, dailyTable, 420);
  await waitUntil(page, startMs, 4_500);
}

function buildScenes(targets) {
  return [
    {
      name: "login",
      route: "/admin/login",
      authenticated: false,
      duration: 2.4,
      perform: performLoginScene,
    },
    {
      name: "dashboard",
      route: "/admin/dashboard",
      duration: 2.6,
      perform: performDashboardScene,
    },
    {
      name: "list",
      route: "/admin/quizzes",
      duration: 2.6,
      perform: performListScene,
    },
    {
      name: "quiz",
      route: targets.quizDetailPath,
      duration: 3.0,
      perform: performQuizScene,
    },
    {
      name: "invite",
      route: "/admin/assignments?start_from=&end_to=",
      duration: 3.4,
      perform: performInviteScene,
    },
    {
      name: "answer",
      route: targets.attemptDetailPath,
      duration: 3.6,
      perform: performAnswerScene,
    },
    {
      name: "status",
      route: "/admin/status",
      duration: 3.6,
      perform: performStatusScene,
    },
  ];
}

async function previewScenes(browser, baseUrl, storageState, targets) {
  const scenes = buildScenes(targets);
  for (const scene of scenes) {
    const contextOptions = {
      ignoreHTTPSErrors: true,
      viewport: VIEWPORT,
    };
    if (scene.authenticated !== false) {
      contextOptions.storageState = storageState;
    }
    const context = await browser.newContext(contextOptions);
    await installPrivacyLayer(context, new URL(baseUrl).host);
    const page = await context.newPage();
    await page.goto(pageUrl(baseUrl, scene.route), {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await waitForScene(page, scene.name);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `preview-${scene.name}.png`),
    });
    await context.close();
  }
  return { sceneCount: scenes.length };
}

async function recordScene(
  browser,
  baseUrl,
  storageState,
  scene,
) {
  const captureDir = path.join(OUTPUT_DIR, "capture");
  await fs.mkdir(captureDir, { recursive: true });
  const contextOptions = {
    ignoreHTTPSErrors: true,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: {
      dir: captureDir,
      size: VIEWPORT,
    },
  };
  if (scene.authenticated !== false) {
    contextOptions.storageState = storageState;
  }
  const context = await browser.newContext(contextOptions);
  await installPrivacyLayer(context, new URL(baseUrl).host);
  const page = await context.newPage();
  const videoStartMs = Date.now();
  const video = page.video();

  await page.goto(pageUrl(baseUrl, scene.route), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await waitForScene(page, scene.name);
  await ensureCursor(page);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(500);

  const contentStartMs = Date.now();
  await scene.perform(page, contentStartMs);
  await waitUntil(page, contentStartMs, 4_600);
  const contentEndMs = Date.now();
  await page.close();
  await context.close();

  const rawVideo = path.join(OUTPUT_DIR, `scene-${scene.name}.webm`);
  await video.saveAs(rawVideo);
  return {
    name: scene.name,
    duration: scene.duration,
    videoStartOffsetSeconds: Number(
      ((contentStartMs - videoStartMs) / 1000).toFixed(3),
    ),
    contentDurationSeconds: Number(
      ((contentEndMs - contentStartMs) / 1000).toFixed(3),
    ),
  };
}

async function recordScenes(browser, baseUrl, storageState, targets) {
  const scenes = buildScenes(targets);
  const markers = [];
  for (const scene of scenes) {
    markers.push(
      await recordScene(browser, baseUrl, storageState, scene),
    );
  }
  await fs.writeFile(
    path.join(OUTPUT_DIR, "markers.json"),
    `${JSON.stringify(markers, null, 2)}\n`,
    "utf8",
  );
  return markers;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const baseUrl = requiredEnv("DEMO_BASE_URL");
  const browser = await chromium.launch({
    headless: true,
    executablePath: BROWSER_EXECUTABLE,
  });

  try {
    const storageState = await login(browser, baseUrl);
    const targets = await discoverDemoRoutes(
      browser,
      baseUrl,
      storageState,
    );
    if (MODE === "preview") {
      const result = await previewScenes(
        browser,
        baseUrl,
        storageState,
        targets,
      );
      console.log(JSON.stringify({
        mode: "preview",
        sceneCount: result.sceneCount,
        privacyLayer: true,
      }));
      return;
    }
    const result = await recordScenes(
      browser,
      baseUrl,
      storageState,
      targets,
    );
    console.log(JSON.stringify({
      mode: "record",
      markers: result,
      privacyLayer: true,
    }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`录制失败：${error.message}`);
  process.exitCode = 1;
});
