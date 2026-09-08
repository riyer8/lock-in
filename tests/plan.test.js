const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CoachError,
  parsePlanResponse,
  requestDailyPlan,
} = require("../server/coach.js");
const { createCoachServer } = require("../server/server.js");

const CONTEXT = {
  schemaVersion: 2,
  asOf: "2026-09-08T18:00:00.000Z",
  blueprint: {
    identities: ["builder"],
    attentionAreas: ["career"],
    obstacles: ["distraction"],
  },
  goals: [
    {
      id: "goal-ship",
      area: "career",
      outcome: "Ship LOCK IN 1.3",
      actions: {
        minimum: "Write the plan mapper",
        standard: "Finish adaptive missions",
        stretch: "Polish the plan copy",
      },
    },
  ],
  todayAudit: { date: "2026-09-08", verdict: "SOLID" },
  recentAudits: [{ date: "2026-09-07", verdict: "MIXED" }],
  recentEvents: [{ type: "MISSION_COMPLETED" }],
  currentMissions: [{ title: "Ship the coach", completed: false }],
  recentMissionOutcomes: [
    { date: "2026-09-07", completed: true, planned: true },
    { date: "2026-09-06", completed: false, planned: true },
  ],
  interventionOutcomes: [],
};

const PLAN = {
  missions: [
    {
      title: "Finish the adaptive mapper",
      category: "CAREER",
      priority: "high",
      reason: "The career goal is still open and yesterday's audit was mixed.",
    },
    {
      title: "Protect a 45-minute focus block",
      category: "MIND",
      priority: "medium",
      reason: "Recent events show attention slipping during longer sessions.",
    },
    {
      title: "Walk outside after the first mission",
      category: "FITNESS",
      priority: "low",
      reason: "A small recovery action keeps the plan from stacking only work.",
    },
  ],
};

async function withServer(callback) {
  const server = createCoachServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("parses a structured 3-mission plan", () => {
  assert.deepEqual(parsePlanResponse(JSON.stringify(PLAN)), PLAN);
});

test("accepts fenced JSON plans and trims extra missions", () => {
  const extra = {
    missions: [
      ...PLAN.missions,
      {
        title: "Fourth",
        category: "LIFE",
        priority: "low",
        reason: "Optional fourth.",
      },
      {
        title: "Fifth",
        category: "LIFE",
        priority: "low",
        reason: "Optional fifth.",
      },
      {
        title: "Sixth",
        category: "LIFE",
        priority: "low",
        reason: "Should be dropped.",
      },
    ],
  };
  const parsed = parsePlanResponse(`\`\`\`json\n${JSON.stringify(extra)}\n\`\`\``);
  assert.equal(parsed.missions.length, 5);
  assert.equal(parsed.missions.at(-1).title, "Fifth");
});

test("rejects plans with fewer than three missions", () => {
  assert.throws(
    () =>
      parsePlanResponse(
        JSON.stringify({
          missions: PLAN.missions.slice(0, 2),
        }),
      ),
    (error) =>
      error instanceof CoachError && error.code === "OPENAI_INVALID_RESPONSE",
  );
});

test("rejects missions with an invalid priority", () => {
  assert.throws(
    () =>
      parsePlanResponse(
        JSON.stringify({
          missions: [
            ...PLAN.missions.slice(0, 2),
            { ...PLAN.missions[2], priority: "urgent" },
          ],
        }),
      ),
    (error) =>
      error instanceof CoachError && error.code === "OPENAI_INVALID_RESPONSE",
  );
});

test("uses the daily plan schema and instructions", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({ output_text: JSON.stringify(PLAN) }),
    };
  };

  const plan = await requestDailyPlan(CONTEXT, {
    apiKey: "test-key",
    model: "test-model",
    fetchImpl,
  });

  assert.deepEqual(plan, PLAN);
  assert.equal(request.body.model, "test-model");
  assert.equal(request.body.text.format.name, "lock_in_daily_plan");
  assert.equal(request.body.text.format.strict, true);
  assert.deepEqual(request.body.text.format.schema.required, ["missions"]);
  assert.match(request.body.instructions, /Return 3 to 5 concrete missions/);
  assert.match(request.body.instructions, /Preserve important existing commitments/);
  assert.match(request.body.input[0].content[0].text, /Ship LOCK IN 1.3/);
});

test("different completion contexts produce different sized plans", async () => {
  const scenarioFetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    const suppliedContext = request.input[0].content[0].text;
    const missedHeavy = suppliedContext.includes('"completed":false');
    const strongWeek = (suppliedContext.match(/"completed":true/g) || []).length >= 3;
    let missions;
    if (missedHeavy && !strongWeek) {
      missions = PLAN.missions.map((mission, index) => ({
        ...mission,
        title: index === 0 ? "Do the five-minute minimum" : mission.title,
        reason:
          index === 0
            ? "Recent misses suggest a smaller first action."
            : mission.reason,
      }));
    } else {
      missions = [
        ...PLAN.missions,
        {
          title: "Stretch the shipping block to 90 minutes",
          category: "CAREER",
          priority: "medium",
          reason: "Follow-through has been consistent.",
        },
        {
          title: "Prepare tomorrow's first cue",
          category: "MIND",
          priority: "low",
          reason: "A light fifth mission fits a strong week.",
        },
      ];
    }
    return {
      ok: true,
      json: async () => ({ output_text: JSON.stringify({ missions }) }),
    };
  };

  const missedContext = {
    ...CONTEXT,
    recentMissionOutcomes: [
      { date: "2026-09-07", completed: false, planned: true },
      { date: "2026-09-06", completed: false, planned: true },
      { date: "2026-09-05", completed: false, planned: true },
    ],
  };
  const strongContext = {
    ...CONTEXT,
    recentMissionOutcomes: [
      { date: "2026-09-07", completed: true, planned: true },
      { date: "2026-09-06", completed: true, planned: true },
      { date: "2026-09-05", completed: true, planned: true },
    ],
  };

  const [missedPlan, strongPlan] = await Promise.all([
    requestDailyPlan(missedContext, { apiKey: "test-key", fetchImpl: scenarioFetch }),
    requestDailyPlan(strongContext, { apiKey: "test-key", fetchImpl: scenarioFetch }),
  ]);

  assert.equal(missedPlan.missions.length, 3);
  assert.equal(strongPlan.missions.length, 5);
  assert.match(missedPlan.missions[0].title, /five-minute/);
  assert.match(strongPlan.missions[3].title, /90 minutes/);
});

test("plan endpoint returns structured missions", async () => {
  const originalKey = process.env.OPENAI_DEVELOPER_KEY;
  process.env.OPENAI_DEVELOPER_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("api.openai.com")) {
      return {
        ok: true,
        json: async () => ({ output_text: JSON.stringify(PLAN) }),
      };
    }
    return originalFetch(url, options);
  };
  try {
    await withServer(async (baseUrl) => {
      const response = await originalFetch(`${baseUrl}/api/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(CONTEXT),
      });
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.deepEqual(body.plan, PLAN);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) {
      delete process.env.OPENAI_DEVELOPER_KEY;
    } else {
      process.env.OPENAI_DEVELOPER_KEY = originalKey;
    }
  }
});
