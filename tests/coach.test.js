const test = require("node:test");
const assert = require("node:assert/strict");

const {
  CoachError,
  parseCoachingResponse,
  requestCoachResponse,
  validateCoachContext,
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
  goals: [{ outcome: "Ship LOCK IN 1.1" }],
  todayAudit: { date: "2026-09-08", verdict: "SOLID" },
  recentAudits: [{ date: "2026-09-07", verdict: "MIXED" }],
  recentEvents: [{ type: "MISSION_COMPLETED" }],
  currentMissions: [{ title: "Ship the coach", completed: false }],
  interventionOutcomes: [],
};

const COACHING = {
  observation: "You completed two of three missions today.",
  pattern: "Two recent audits suggest starts are stronger than finishes.",
  priority: "Protect the current build mission.",
  nextAction: "Close extra tabs and build for 25 minutes.",
  encouragement: "You already started; make the next block deliberate.",
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

test("rejects malformed coach context", () => {
  assert.throws(
    () =>
      validateCoachContext({
        blueprint: {},
        goals: [],
        todayAudit: {},
        recentAudits: {},
        recentEvents: [],
        currentMissions: [],
        interventionOutcomes: [],
      }),
    (error) =>
      error instanceof CoachError &&
      error.statusCode === 400 &&
      error.code === "MALFORMED_REQUEST",
  );
});

test("rejects empty coach context", () => {
  assert.throws(
    () =>
      validateCoachContext({
        blueprint: {},
        goals: [],
        todayAudit: {},
        recentAudits: [],
        recentEvents: [],
        currentMissions: [],
        interventionOutcomes: [],
      }),
    (error) => error instanceof CoachError && error.code === "EMPTY_CONTEXT",
  );
});

test("rejects requests when the API key is missing", async () => {
  await assert.rejects(
    requestCoachResponse(CONTEXT, { apiKey: "" }),
    (error) => error instanceof CoachError && error.code === "MISSING_API_KEY",
  );
});

test("uses structured Responses API output", async () => {
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(COACHING) }],
          },
        ],
      }),
    };
  };

  const coaching = await requestCoachResponse(CONTEXT, {
    apiKey: "test-key",
    model: "test-model",
    fetchImpl,
  });

  assert.deepEqual(coaching, COACHING);
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.body.model, "test-model");
  assert.match(request.body.instructions, /Never shame the user/);
  assert.match(request.body.instructions, /multiple days support it/);
  assert.match(request.body.input[0].content[0].text, /Ship LOCK IN 1.1/);
  assert.equal(request.body.text.format.type, "json_schema");
  assert.equal(request.body.text.format.strict, true);
  assert.equal(request.body.text.verbosity, "low");
  assert.equal(request.body.reasoning.effort, "minimal");
  assert.equal(request.body.max_output_tokens, 1_600);
  assert.deepEqual(
    request.body.text.format.schema.required,
    ["observation", "pattern", "priority", "nextAction", "encouragement"],
  );
  assert.equal(request.options.headers.Authorization, "Bearer test-key");
});

test("accepts fenced JSON from a compatible model", () => {
  assert.deepEqual(
    parseCoachingResponse(`\`\`\`json\n${JSON.stringify(COACHING)}\n\`\`\``),
    COACHING,
  );
});

test("retries once when reasoning consumes the output token budget", async () => {
  const tokenLimits = [];
  const fetchImpl = async (_url, options) => {
    const request = JSON.parse(options.body);
    tokenLimits.push(request.max_output_tokens);
    if (tokenLimits.length === 1) {
      return {
        ok: true,
        json: async () => ({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: '{"observation":"' }],
            },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        status: "completed",
        output_text: JSON.stringify(COACHING),
      }),
    };
  };

  const coaching = await requestCoachResponse(CONTEXT, {
    apiKey: "test-key",
    fetchImpl,
  });

  assert.deepEqual(tokenLimits, [1_600, 4_000]);
  assert.deepEqual(coaching, COACHING);
});

test("returns a clear error for a model refusal", async () => {
  await assert.rejects(
    requestCoachResponse(CONTEXT, {
      apiKey: "test-key",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          status: "completed",
          output: [
            {
              type: "message",
              content: [{ type: "refusal", refusal: "Cannot comply." }],
            },
          ],
        }),
      }),
    }),
    (error) => error instanceof CoachError && error.code === "OPENAI_REFUSAL",
  );
});

test("maps OpenAI failures to a safe backend error", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      requestCoachResponse(CONTEXT, {
        apiKey: "test-key",
        fetchImpl: async () => ({
          ok: false,
          status: 429,
          headers: { get: () => "request-id" },
        }),
      }),
      (error) =>
        error instanceof CoachError &&
        error.statusCode === 502 &&
        error.code === "OPENAI_FAILURE",
    );
  } finally {
    console.error = originalError;
  }
});

test("different audit scenarios produce different structured coaching", async () => {
  const scenarioFetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    const suppliedContext = request.input[0].content[0].text;
    const hasDistractionPattern = suppliedContext.includes(
      '"HIGH_DISTRACTION_TIME"',
    );
    const isStrongWeek = suppliedContext.includes('"verdict":"STRONG"');
    let coaching;
    if (hasDistractionPattern) {
      coaching = {
        observation: "Multiple audits record a long distracting browser session.",
        pattern: "Focus appears to break during the longest observed work blocks.",
        priority: "Protect the start of the next focus block.",
        nextAction: "Block the distracting site for the first 45 minutes.",
        encouragement: "Changing one boundary is more useful than blaming attention.",
      };
    } else if (isStrongWeek) {
      coaching = {
        observation: "Most recent audits show high mission completion.",
        pattern: "Follow-through is consistent across multiple recorded days.",
        priority: "Protect the routine that is already working.",
        nextAction: "Start today's first mission at its planned cue.",
        encouragement: "Your recent actions provide evidence you can repeat this.",
      };
    } else {
      coaching = {
        observation: "Recent audits show planned missions left open.",
        pattern: "The available days suggest the plan may be too large.",
        priority: "Reduce the entry cost of today's mission.",
        nextAction: "Do the five-minute minimum version now.",
        encouragement: "A smaller completed action is useful evidence.",
      };
    }
    return {
      ok: true,
      json: async () => ({ output_text: JSON.stringify(coaching) }),
    };
  };
  const strongContext = {
    ...CONTEXT,
    recentAudits: [
      { date: "2026-09-07", verdict: "STRONG" },
      { date: "2026-09-06", verdict: "STRONG" },
    ],
  };
  const openContext = {
    ...CONTEXT,
    recentAudits: [
      { date: "2026-09-07", verdict: "NEEDS_ATTENTION" },
      { date: "2026-09-06", verdict: "MIXED" },
    ],
  };
  const distractionContext = {
    ...CONTEXT,
    recentAudits: [
      {
        date: "2026-09-07",
        verdict: "MIXED",
        patterns: [{ type: "HIGH_DISTRACTION_TIME", domain: "example.com" }],
      },
      {
        date: "2026-09-06",
        verdict: "SOLID",
        patterns: [{ type: "HIGH_DISTRACTION_TIME", domain: "example.com" }],
      },
    ],
  };

  const [strongCoaching, openCoaching, distractionCoaching] = await Promise.all([
    requestCoachResponse(strongContext, {
      apiKey: "test-key",
      fetchImpl: scenarioFetch,
    }),
    requestCoachResponse(openContext, {
      apiKey: "test-key",
      fetchImpl: scenarioFetch,
    }),
    requestCoachResponse(distractionContext, {
      apiKey: "test-key",
      fetchImpl: scenarioFetch,
    }),
  ]);

  assert.equal(
    new Set([
      strongCoaching.pattern,
      openCoaching.pattern,
      distractionCoaching.pattern,
    ]).size,
    3,
  );
  assert.equal(
    new Set([
      strongCoaching.priority,
      openCoaching.priority,
      distractionCoaching.priority,
    ]).size,
    3,
  );
  assert.match(distractionCoaching.nextAction, /45 minutes/);
});

test("coach endpoint rejects malformed JSON", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/coach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "MALFORMED_REQUEST");
  });
});

test("coach endpoint reports a missing API key without exposing secrets", async () => {
  const originalKey = process.env.OPENAI_DEVELOPER_KEY;
  delete process.env.OPENAI_DEVELOPER_KEY;
  try {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/coach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(CONTEXT),
      });
      const body = await response.json();

      assert.equal(response.status, 503);
      assert.equal(body.code, "MISSING_API_KEY");
      assert.equal(JSON.stringify(body).includes("Bearer"), false);
    });
  } finally {
    if (originalKey === undefined) {
      delete process.env.OPENAI_DEVELOPER_KEY;
    } else {
      process.env.OPENAI_DEVELOPER_KEY = originalKey;
    }
  }
});
