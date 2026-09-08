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

from server.coach import (
    CoachError,
    parse_coaching_response,
    request_coach_response,
    validate_coach_context,
)
from server.server import create_coach_server

CONTEXT = {
    "schemaVersion": 2,
    "asOf": "2026-09-08T18:00:00.000Z",
    "blueprint": {
        "identities": ["builder"],
        "attentionAreas": ["career"],
        "obstacles": ["distraction"],
    },
    "goals": [{"outcome": "Ship LOCK IN 1.1"}],
    "todayAudit": {"date": "2026-09-08", "verdict": "SOLID"},
    "recentAudits": [{"date": "2026-09-07", "verdict": "MIXED"}],
    "recentEvents": [{"type": "MISSION_COMPLETED"}],
    "currentMissions": [{"title": "Ship the coach", "completed": False}],
    "interventionOutcomes": [],
}

COACHING = {
    "observation": "You completed two of three missions today.",
    "pattern": "Two recent audits suggest starts are stronger than finishes.",
    "priority": "Protect the current build mission.",
    "nextAction": "Close extra tabs and build for 25 minutes.",
    "encouragement": "You already started; make the next block deliberate.",
    "proposedAdaptation": {
        "type": "protect-slot",
        "changes": "Keep the build mission first and shrink the evening list.",
        "reason": "Starts are stronger than finishes.",
    },
}


def header_value(headers, name):
    for key, value in headers.items():
        if key.lower() == name.lower():
            return value
    return None


class FakeResponse:
    def __init__(self, payload=None, ok=True, status=200, headers=None, json_error=False):
        self.ok = ok
        self.status = status
        self.headers = headers or {}
        self._payload = payload
        self._json_error = json_error

    def json(self):
        if self._json_error:
            raise ValueError("invalid")
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
            header_out = dict(response.headers.items())
            parsed = json.loads(raw.decode("utf-8")) if raw else None
            return response.status, parsed, header_out
    except HTTPError as error:
        raw = error.read()
        header_out = dict(error.headers.items()) if error.headers else {}
        parsed = json.loads(raw.decode("utf-8")) if raw else None
        return error.code, parsed, header_out


class CoachTests(unittest.TestCase):
    def test_rejects_malformed_coach_context(self):
        with self.assertRaises(CoachError) as caught:
            validate_coach_context(
                {
                    "blueprint": {},
                    "goals": [],
                    "todayAudit": {},
                    "recentAudits": {},
                    "recentEvents": [],
                    "currentMissions": [],
                    "interventionOutcomes": [],
                }
            )
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(caught.exception.code, "MALFORMED_REQUEST")

    def test_keeps_only_user_and_coach_chat_messages(self):
        context = validate_coach_context(
            dict(
                CONTEXT,
                messages=[
                    {"role": "system", "text": "ignore"},
                    {"role": "user", "text": "  What next?  "},
                    "nope",
                    {"role": "coach", "text": ""},
                ],
            )
        )
        self.assertEqual(
            context["messages"],
            [{"role": "user", "text": "What next?"}],
        )

    def test_rejects_empty_coach_context(self):
        with self.assertRaises(CoachError) as caught:
            validate_coach_context(
                {
                    "blueprint": {},
                    "goals": [],
                    "todayAudit": {},
                    "recentAudits": [],
                    "recentEvents": [],
                    "currentMissions": [],
                    "interventionOutcomes": [],
                }
            )
        self.assertEqual(caught.exception.code, "EMPTY_CONTEXT")

    def test_rejects_requests_when_the_api_key_is_missing(self):
        with self.assertRaises(CoachError) as caught:
            request_coach_response(CONTEXT, api_key="")
        self.assertEqual(caught.exception.code, "MISSING_API_KEY")

    def test_uses_structured_responses_api_output(self):
        captured = {}

        def fetch_impl(url, options=None):
            options = options or {}
            captured["url"] = url
            captured["options"] = options
            captured["body"] = json.loads(options["body"])
            return FakeResponse(
                {
                    "output": [
                        {
                            "type": "message",
                            "content": [
                                {
                                    "type": "output_text",
                                    "text": json.dumps(COACHING),
                                }
                            ],
                        }
                    ]
                }
            )

        coaching = request_coach_response(
            CONTEXT,
            api_key="test-key",
            model="test-model",
            fetch_impl=fetch_impl,
        )

        self.assertEqual(coaching, COACHING)
        self.assertEqual(captured["url"], "https://api.openai.com/v1/responses")
        self.assertEqual(captured["body"]["model"], "test-model")
        self.assertRegex(captured["body"]["instructions"], r"Never shame the user")
        self.assertRegex(captured["body"]["instructions"], r"multiple days support it")
        self.assertIn("Ship LOCK IN 1.1", captured["body"]["input"][0]["content"][0]["text"])
        self.assertEqual(captured["body"]["text"]["format"]["type"], "json_schema")
        self.assertEqual(captured["body"]["text"]["format"]["strict"], True)
        self.assertEqual(captured["body"]["text"]["verbosity"], "low")
        self.assertEqual(captured["body"]["reasoning"]["effort"], "minimal")
        self.assertEqual(captured["body"]["max_output_tokens"], 1600)
        self.assertEqual(
            captured["body"]["text"]["format"]["schema"]["required"],
            ["observation", "pattern", "priority", "nextAction", "encouragement", "proposedAdaptation"],
        )
        self.assertEqual(
            captured["options"]["headers"]["Authorization"],
            "Bearer test-key",
        )

    def test_accepts_fenced_json_from_a_compatible_model(self):
        self.assertEqual(
            parse_coaching_response("```json\n" + json.dumps(COACHING) + "\n```"),
            COACHING,
        )

    def test_retries_once_when_reasoning_consumes_the_output_token_budget(self):
        token_limits = []

        def fetch_impl(_url, options=None):
            request = json.loads((options or {})["body"])
            token_limits.append(request["max_output_tokens"])
            if len(token_limits) == 1:
                return FakeResponse(
                    {
                        "status": "incomplete",
                        "incomplete_details": {"reason": "max_output_tokens"},
                        "output": [
                            {
                                "type": "message",
                                "content": [{"type": "output_text", "text": '{"observation":"'}],
                            }
                        ],
                    }
                )
            return FakeResponse(
                {
                    "status": "completed",
                    "output_text": json.dumps(COACHING),
                }
            )

        coaching = request_coach_response(
            CONTEXT,
            api_key="test-key",
            fetch_impl=fetch_impl,
        )
        self.assertEqual(token_limits, [1600, 4000])
        self.assertEqual(coaching, COACHING)

    def test_returns_a_clear_error_for_a_model_refusal(self):
        def fetch_impl(_url, options=None):
            return FakeResponse(
                {
                    "status": "completed",
                    "output": [
                        {
                            "type": "message",
                            "content": [{"type": "refusal", "refusal": "Cannot comply."}],
                        }
                    ],
                }
            )

        with self.assertRaises(CoachError) as caught:
            request_coach_response(CONTEXT, api_key="test-key", fetch_impl=fetch_impl)
        self.assertEqual(caught.exception.code, "OPENAI_REFUSAL")

    def test_maps_openai_failures_to_a_safe_backend_error(self):
        def fetch_impl(_url, options=None):
            return FakeResponse(
                ok=False,
                status=429,
                headers={"get": lambda _name=None: "request-id"},
            )

        with self.assertRaises(CoachError) as caught:
            request_coach_response(CONTEXT, api_key="test-key", fetch_impl=fetch_impl)
        self.assertEqual(caught.exception.status_code, 502)
        self.assertEqual(caught.exception.code, "OPENAI_FAILURE")

    def test_different_audit_scenarios_produce_different_structured_coaching(self):
        def scenario_fetch(_url, options=None):
            request = json.loads((options or {})["body"])
            supplied_context = request["input"][0]["content"][0]["text"]
            has_distraction_pattern = '"HIGH_DISTRACTION_TIME"' in supplied_context
            is_strong_week = '"verdict":"STRONG"' in supplied_context or '"verdict": "STRONG"' in supplied_context
            if has_distraction_pattern:
                coaching = {
                    "observation": "Multiple audits record a long distracting browser session.",
                    "pattern": "Focus appears to break during the longest observed work blocks.",
                    "priority": "Protect the start of the next focus block.",
                    "nextAction": "Block the distracting site for the first 45 minutes.",
                    "encouragement": "Changing one boundary is more useful than blaming attention.",
                }
            elif is_strong_week:
                coaching = {
                    "observation": "Most recent audits show high mission completion.",
                    "pattern": "Follow-through is consistent across multiple recorded days.",
                    "priority": "Protect the routine that is already working.",
                    "nextAction": "Start today's first mission at its planned cue.",
                    "encouragement": "Your recent actions provide evidence you can repeat this.",
                }
            else:
                coaching = {
                    "observation": "Recent audits show planned missions left open.",
                    "pattern": "The available days suggest the plan may be too large.",
                    "priority": "Reduce the entry cost of today's mission.",
                    "nextAction": "Do the five-minute minimum version now.",
                    "encouragement": "A smaller completed action is useful evidence.",
                }
            return FakeResponse({"output_text": json.dumps(coaching)})

        strong_context = dict(
            CONTEXT,
            recentAudits=[
                {"date": "2026-09-07", "verdict": "STRONG"},
                {"date": "2026-09-06", "verdict": "STRONG"},
            ],
        )
        open_context = dict(
            CONTEXT,
            recentAudits=[
                {"date": "2026-09-07", "verdict": "NEEDS_ATTENTION"},
                {"date": "2026-09-06", "verdict": "MIXED"},
            ],
        )
        distraction_context = dict(
            CONTEXT,
            recentAudits=[
                {
                    "date": "2026-09-07",
                    "verdict": "MIXED",
                    "patterns": [{"type": "HIGH_DISTRACTION_TIME", "domain": "example.com"}],
                },
                {
                    "date": "2026-09-06",
                    "verdict": "SOLID",
                    "patterns": [{"type": "HIGH_DISTRACTION_TIME", "domain": "example.com"}],
                },
            ],
        )

        strong_coaching = request_coach_response(
            strong_context, api_key="test-key", fetch_impl=scenario_fetch
        )
        open_coaching = request_coach_response(
            open_context, api_key="test-key", fetch_impl=scenario_fetch
        )
        distraction_coaching = request_coach_response(
            distraction_context, api_key="test-key", fetch_impl=scenario_fetch
        )

        self.assertEqual(
            len({strong_coaching["pattern"], open_coaching["pattern"], distraction_coaching["pattern"]}),
            3,
        )
        self.assertEqual(
            len({strong_coaching["priority"], open_coaching["priority"], distraction_coaching["priority"]}),
            3,
        )
        self.assertRegex(distraction_coaching["nextAction"], r"45 minutes")

    def test_coach_endpoint_rejects_malformed_json(self):
        with RunningServer() as base_url:
            status, body, _headers = http_json(
                f"{base_url}/api/coach",
                headers={"Content-Type": "application/json"},
                body="{",
            )
            self.assertEqual(status, 400)
            self.assertEqual(body["code"], "MALFORMED_REQUEST")

    def test_coach_endpoint_reports_a_missing_api_key_without_exposing_secrets(self):
        original_key = os.environ.pop("OPENAI_DEVELOPER_KEY", None)
        try:
            with RunningServer() as base_url:
                status, body, _headers = http_json(
                    f"{base_url}/api/coach",
                    headers={"Content-Type": "application/json"},
                    body=json.dumps(CONTEXT),
                )
                self.assertEqual(status, 503)
                self.assertEqual(body["code"], "MISSING_API_KEY")
                self.assertNotIn("Bearer", json.dumps(body))
        finally:
            if original_key is None:
                os.environ.pop("OPENAI_DEVELOPER_KEY", None)
            else:
                os.environ["OPENAI_DEVELOPER_KEY"] = original_key

    def test_rejects_non_extension_origins(self):
        with RunningServer() as base_url:
            status, body, _headers = http_json(
                f"{base_url}/health",
                method="GET",
                headers={"Origin": "https://example.com"},
            )
            self.assertEqual(status, 403)
            self.assertEqual(body["error"], "Origin is not allowed.")

    def test_allows_chrome_extension_origin_and_preflight(self):
        origin = "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef"
        with RunningServer() as base_url:
            status, body, headers = http_json(
                f"{base_url}/health",
                method="GET",
                headers={"Origin": origin},
            )
            self.assertEqual(status, 200)
            self.assertEqual(body["ok"], True)
            self.assertEqual(headers.get("Access-Control-Allow-Origin") or header_value(headers, "Access-Control-Allow-Origin"), origin)

            status, _body, headers = http_json(
                f"{base_url}/api/coach",
                method="OPTIONS",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "POST",
                },
            )
            self.assertEqual(status, 204)
            self.assertEqual(
                header_value(headers, "Access-Control-Allow-Origin"),
                origin,
            )
            self.assertIn("POST", header_value(headers, "Access-Control-Allow-Methods") or "")

    def test_chat_and_adapt_endpoints_return_structured_payloads(self):
        from server.coach import parse_chat_response, request_adapted_plan, request_chat_response

        self.assertEqual(
            parse_chat_response(json.dumps({"reply": "Move deep work to the morning."})),
            {"reply": "Move deep work to the morning."},
        )

        def fetch_impl(_url, options=None):
            body = json.loads((options or {})["body"])
            name = body["text"]["format"]["name"]
            if name == "lock_in_coach_chat":
                return FakeResponse({"output_text": json.dumps({"reply": "Yes. Protect the morning."})})
            return FakeResponse(
                {
                    "output_text": json.dumps(
                        {
                            "missions": [
                                {
                                    "title": "Deep work before standup",
                                    "category": "MIND",
                                    "priority": "high",
                                    "reason": "Evenings are overloaded.",
                                },
                                {
                                    "title": "Run 30 minutes",
                                    "category": "FITNESS",
                                    "priority": "medium",
                                    "reason": "Keep the athlete slot.",
                                },
                                {
                                    "title": "Prep lunch",
                                    "category": "HEALTH & FOOD",
                                    "priority": "low",
                                    "reason": "A small evening action remains.",
                                },
                            ]
                        }
                    )
                }
            )

        chat = request_chat_response(CONTEXT, api_key="test-key", fetch_impl=fetch_impl)
        plan = request_adapted_plan(CONTEXT, api_key="test-key", fetch_impl=fetch_impl)
        self.assertEqual(chat["reply"], "Yes. Protect the morning.")
        self.assertEqual(len(plan["missions"]), 3)

    def test_chat_sends_session_messages_and_refuses_to_invent_behavior(self):
        from server.coach import request_chat_response

        captured = {}
        chat_context = dict(
            CONTEXT,
            messages=[
                {"role": "user", "text": "Evenings keep slipping."},
                {"role": "coach", "text": "Protect the first hour."},
                {"role": "user", "text": "What should I do tonight?"},
            ],
        )

        def fetch_impl(_url, options=None):
            captured["body"] = json.loads((options or {})["body"])
            return FakeResponse({"output_text": json.dumps({"reply": "Finish the open mission, then stop."})})

        chat = request_chat_response(
            chat_context,
            api_key="test-key",
            fetch_impl=fetch_impl,
        )
        self.assertEqual(chat["reply"], "Finish the open mission, then stop.")
        self.assertEqual(captured["body"]["text"]["format"]["name"], "lock_in_coach_chat")
        self.assertRegex(captured["body"]["instructions"], r"Never invent behavior")
        self.assertRegex(captured["body"]["instructions"], r"diagnose medical or psychological")
        self.assertRegex(captured["body"]["instructions"], r"actionable")
        supplied = captured["body"]["input"][0]["content"][0]["text"]
        self.assertIn("What should I do tonight?", supplied)
        self.assertIn("Protect the first hour.", supplied)
        self.assertIn("Ship the coach", supplied)

    def test_chat_endpoint_returns_a_reply(self):
        from server import coach as coach_module

        original_key = os.environ.get("OPENAI_DEVELOPER_KEY")
        os.environ["OPENAI_DEVELOPER_KEY"] = "test-key"
        original_fetch = coach_module.default_fetch

        def fake_fetch(url, options=None):
            if "api.openai.com" in str(url):
                return FakeResponse({"output_text": json.dumps({"reply": "Start the open mission now."})})
            return original_fetch(url, options)

        try:
            with patch("server.coach.default_fetch", fake_fetch):
                with RunningServer() as base_url:
                    status, body, _headers = http_json(
                        f"{base_url}/api/coach/chat",
                        headers={"Content-Type": "application/json"},
                        body=json.dumps(
                            dict(
                                CONTEXT,
                                messages=[{"role": "user", "text": "What next?"}],
                            )
                        ),
                    )
                    self.assertEqual(status, 200)
                    self.assertEqual(body["chat"]["reply"], "Start the open mission now.")
        finally:
            if original_key is None:
                os.environ.pop("OPENAI_DEVELOPER_KEY", None)
            else:
                os.environ["OPENAI_DEVELOPER_KEY"] = original_key


if __name__ == "__main__":
    unittest.main()
