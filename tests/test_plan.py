import json
import os
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
if not sys.path or sys.path[0] != str(ROOT):
    sys.path.insert(0, str(ROOT))

from server import coach as coach_module
from server.coach import CoachError, parse_plan_response, request_daily_plan
from server.server import create_coach_server

CONTEXT = {
    "schemaVersion": 2,
    "asOf": "2026-09-08T18:00:00.000Z",
    "blueprint": {
        "identities": ["builder"],
        "attentionAreas": ["career"],
        "obstacles": ["distraction"],
    },
    "goals": [
        {
            "id": "goal-ship",
            "area": "career",
            "outcome": "Ship LOCK IN 1.3",
            "actions": {
                "minimum": "Write the plan mapper",
                "standard": "Finish adaptive missions",
                "stretch": "Polish the plan copy",
            },
        }
    ],
    "todayAudit": {"date": "2026-09-08", "verdict": "SOLID"},
    "recentAudits": [{"date": "2026-09-07", "verdict": "MIXED"}],
    "recentEvents": [{"type": "MISSION_COMPLETED"}],
    "currentMissions": [{"title": "Ship the coach", "completed": False}],
    "recentMissionOutcomes": [
        {"date": "2026-09-07", "completed": True, "planned": True},
        {"date": "2026-09-06", "completed": False, "planned": True},
    ],
    "interventionOutcomes": [],
}

PLAN = {
    "missions": [
        {
            "title": "Finish the adaptive mapper",
            "category": "CAREER",
            "priority": "high",
            "reason": "The career goal is still open and yesterday's audit was mixed.",
        },
        {
            "title": "Protect a 45-minute focus block",
            "category": "MIND",
            "priority": "medium",
            "reason": "Recent events show attention slipping during longer sessions.",
        },
        {
            "title": "Walk outside after the first mission",
            "category": "FITNESS",
            "priority": "low",
            "reason": "A small recovery action keeps the plan from stacking only work.",
        },
    ]
}


class FakeResponse:
    def __init__(self, payload=None, ok=True, status=200):
        self.ok = ok
        self.status = status
        self._payload = payload

    def json(self):
        return self._payload


class RunningServer:
    def __init__(self):
        self.server = create_coach_server()
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self):
        self.thread.start()
        return f"http://127.0.0.1:{self.port}"

    def __exit__(self, *args):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)


def http_json(url, method="POST", body=None, headers=None):
    header_map = dict(headers or {})
    data = None
    if body is not None:
        data = body.encode("utf-8") if isinstance(body, str) else body
    request = Request(url, data=data, headers=header_map, method=method)
    try:
        with urlopen(request, timeout=5) as response:
            raw = response.read()
            parsed = json.loads(raw.decode("utf-8")) if raw else None
            return response.status, parsed, dict(response.headers.items())
    except HTTPError as error:
        raw = error.read()
        parsed = json.loads(raw.decode("utf-8")) if raw else None
        return error.code, parsed, dict(error.headers.items()) if error.headers else {}


class PlanTests(unittest.TestCase):
    def test_parses_a_structured_3_mission_plan(self):
        self.assertEqual(parse_plan_response(json.dumps(PLAN)), PLAN)

    def test_accepts_fenced_json_plans_and_trims_extra_missions(self):
        extra = {
            "missions": PLAN["missions"]
            + [
                {
                    "title": "Fourth",
                    "category": "LIFE",
                    "priority": "low",
                    "reason": "Optional fourth.",
                },
                {
                    "title": "Fifth",
                    "category": "LIFE",
                    "priority": "low",
                    "reason": "Optional fifth.",
                },
                {
                    "title": "Sixth",
                    "category": "LIFE",
                    "priority": "low",
                    "reason": "Should be dropped.",
                },
            ]
        }
        parsed = parse_plan_response("```json\n" + json.dumps(extra) + "\n```")
        self.assertEqual(len(parsed["missions"]), 5)
        self.assertEqual(parsed["missions"][-1]["title"], "Fifth")

    def test_rejects_plans_with_fewer_than_three_missions(self):
        with self.assertRaises(CoachError) as caught:
            parse_plan_response(json.dumps({"missions": PLAN["missions"][:2]}))
        self.assertEqual(caught.exception.code, "OPENAI_INVALID_RESPONSE")

    def test_rejects_missions_with_an_invalid_priority(self):
        missions = PLAN["missions"][:2] + [{**PLAN["missions"][2], "priority": "urgent"}]
        with self.assertRaises(CoachError) as caught:
            parse_plan_response(json.dumps({"missions": missions}))
        self.assertEqual(caught.exception.code, "OPENAI_INVALID_RESPONSE")

    def test_uses_the_daily_plan_schema_and_instructions(self):
        captured = {}

        def fetch_impl(url, options=None):
            options = options or {}
            captured["url"] = url
            captured["body"] = json.loads(options["body"])
            return FakeResponse({"output_text": json.dumps(PLAN)})

        plan = request_daily_plan(
            CONTEXT,
            api_key="test-key",
            model="test-model",
            fetch_impl=fetch_impl,
        )
        self.assertEqual(plan, PLAN)
        self.assertEqual(captured["body"]["model"], "test-model")
        self.assertEqual(captured["body"]["text"]["format"]["name"], "lock_in_daily_plan")
        self.assertEqual(captured["body"]["text"]["format"]["strict"], True)
        self.assertEqual(captured["body"]["text"]["format"]["schema"]["required"], ["missions"])
        self.assertRegex(captured["body"]["instructions"], r"Return 3 to 5 concrete missions")
        self.assertRegex(
            captured["body"]["instructions"],
            r"Preserve important existing commitments",
        )
        self.assertIn("Ship LOCK IN 1.3", captured["body"]["input"][0]["content"][0]["text"])

    def test_different_completion_contexts_produce_different_sized_plans(self):
        def scenario_fetch(_url, options=None):
            request = json.loads((options or {})["body"])
            supplied_context = request["input"][0]["content"][0]["text"]
            missed_heavy = '"completed":false' in supplied_context or '"completed": false' in supplied_context
            strong_week = supplied_context.count('"completed":true') + supplied_context.count(
                '"completed": true'
            ) >= 3
            if missed_heavy and not strong_week:
                missions = []
                for index, mission in enumerate(PLAN["missions"]):
                    updated = dict(mission)
                    if index == 0:
                        updated["title"] = "Do the five-minute minimum"
                        updated["reason"] = "Recent misses suggest a smaller first action."
                    missions.append(updated)
            else:
                missions = PLAN["missions"] + [
                    {
                        "title": "Stretch the shipping block to 90 minutes",
                        "category": "CAREER",
                        "priority": "medium",
                        "reason": "Follow-through has been consistent.",
                    },
                    {
                        "title": "Prepare tomorrow's first cue",
                        "category": "MIND",
                        "priority": "low",
                        "reason": "A light fifth mission fits a strong week.",
                    },
                ]
            return FakeResponse({"output_text": json.dumps({"missions": missions})})

        missed_context = dict(
            CONTEXT,
            recentMissionOutcomes=[
                {"date": "2026-09-07", "completed": False, "planned": True},
                {"date": "2026-09-06", "completed": False, "planned": True},
                {"date": "2026-09-05", "completed": False, "planned": True},
            ],
        )
        strong_context = dict(
            CONTEXT,
            recentMissionOutcomes=[
                {"date": "2026-09-07", "completed": True, "planned": True},
                {"date": "2026-09-06", "completed": True, "planned": True},
                {"date": "2026-09-05", "completed": True, "planned": True},
            ],
        )

        missed_plan = request_daily_plan(
            missed_context, api_key="test-key", fetch_impl=scenario_fetch
        )
        strong_plan = request_daily_plan(
            strong_context, api_key="test-key", fetch_impl=scenario_fetch
        )
        self.assertEqual(len(missed_plan["missions"]), 3)
        self.assertEqual(len(strong_plan["missions"]), 5)
        self.assertRegex(missed_plan["missions"][0]["title"], r"five-minute")
        self.assertRegex(strong_plan["missions"][3]["title"], r"90 minutes")

    def test_plan_endpoint_returns_structured_missions(self):
        original_key = os.environ.get("OPENAI_DEVELOPER_KEY")
        os.environ["OPENAI_DEVELOPER_KEY"] = "test-key"
        original_fetch = coach_module.default_fetch

        def fake_fetch(url, options=None):
            if "api.openai.com" in str(url):
                return FakeResponse({"output_text": json.dumps(PLAN)})
            return original_fetch(url, options)

        try:
            with patch.object(coach_module, "default_fetch", fake_fetch):
                with RunningServer() as base_url:
                    status, body, _headers = http_json(
                        f"{base_url}/api/plan",
                        headers={"Content-Type": "application/json"},
                        body=json.dumps(CONTEXT),
                    )
                    self.assertEqual(status, 200)
                    self.assertEqual(body["plan"], PLAN)
        finally:
            if original_key is None:
                os.environ.pop("OPENAI_DEVELOPER_KEY", None)
            else:
                os.environ["OPENAI_DEVELOPER_KEY"] = original_key


if __name__ == "__main__":
    unittest.main()
