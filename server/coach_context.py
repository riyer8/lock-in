MAX_GOALS = 10
MAX_RECENT_AUDITS = 6
MAX_RECENT_EVENTS = 100
MAX_CURRENT_MISSIONS = 5
MAX_RECENT_MISSION_OUTCOMES = 35
MAX_INTERVENTION_OUTCOMES = 20
MAX_CHAT_MESSAGES = 12
MAX_CHAT_MESSAGE_CHARS = 400


class ContextError(Exception):
    def __init__(self, message, status_code=400, code="MALFORMED_REQUEST"):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


def is_plain_object(value):
    return isinstance(value, dict)


def require_array(value, name, maximum):
    if not isinstance(value, list):
        raise ContextError(f"{name} must be an array.")
    if len(value) > maximum:
        raise ContextError(f"{name} contains too many items.", 413, "CONTEXT_TOO_LARGE")
    return value


def sanitize_messages(value):
    messages = require_array(
        value if value is not None else [],
        "messages",
        MAX_CHAT_MESSAGES,
    )
    cleaned = []
    for item in messages:
        if not is_plain_object(item):
            continue
        role = item.get("role")
        text = item.get("text")
        if role not in ("user", "coach") or not isinstance(text, str):
            continue
        trimmed = text.strip()[:MAX_CHAT_MESSAGE_CHARS]
        if not trimmed:
            continue
        entry = {"role": role, "text": trimmed}
        if isinstance(item.get("asOf"), str) and item["asOf"]:
            entry["asOf"] = item["asOf"]
        cleaned.append(entry)
    return cleaned


def build_coach_context(value):
    if not is_plain_object(value):
        raise ContextError("Request body must be a JSON object.")

    blueprint = value.get("blueprint")
    today_audit = value.get("todayAudit")
    if not is_plain_object(blueprint) or not is_plain_object(today_audit):
        raise ContextError("blueprint and todayAudit must be objects.")

    context = {
        "schemaVersion": 2,
        "asOf": value["asOf"] if isinstance(value.get("asOf"), str) else "",
        "blueprint": blueprint,
        "goals": require_array(value.get("goals"), "goals", MAX_GOALS),
        "todayAudit": today_audit,
        "recentAudits": require_array(
            value.get("recentAudits"),
            "recentAudits",
            MAX_RECENT_AUDITS,
        ),
        "recentEvents": require_array(
            value.get("recentEvents"),
            "recentEvents",
            MAX_RECENT_EVENTS,
        ),
        "currentMissions": require_array(
            value.get("currentMissions"),
            "currentMissions",
            MAX_CURRENT_MISSIONS,
        ),
        "recentMissionOutcomes": require_array(
            value["recentMissionOutcomes"]
            if value.get("recentMissionOutcomes") is not None
            else [],
            "recentMissionOutcomes",
            MAX_RECENT_MISSION_OUTCOMES,
        ),
        "interventionOutcomes": require_array(
            value.get("interventionOutcomes")
            if value.get("interventionOutcomes") is not None
            else [],
            "interventionOutcomes",
            MAX_INTERVENTION_OUTCOMES,
        ),
        "experiments": require_array(
            value.get("experiments") if value.get("experiments") is not None else [],
            "experiments",
            10,
        ),
        "patterns": require_array(
            value.get("patterns") if value.get("patterns") is not None else [],
            "patterns",
            10,
        ),
        "lastInsight": value.get("lastInsight")
        if isinstance(value.get("lastInsight"), dict)
        else None,
        "activeExperiment": value.get("activeExperiment")
        if isinstance(value.get("activeExperiment"), dict)
        else None,
        "messages": sanitize_messages(value.get("messages")),
    }

    has_context = (
        len(blueprint) > 0
        or len(context["goals"]) > 0
        or len(today_audit) > 0
        or len(context["recentAudits"]) > 0
        or len(context["recentEvents"]) > 0
        or len(context["currentMissions"]) > 0
        or len(context["recentMissionOutcomes"]) > 0
        or len(context["interventionOutcomes"]) > 0
        or len(context["experiments"]) > 0
        or len(context["patterns"]) > 0
        or context["lastInsight"] is not None
        or context["activeExperiment"] is not None
        or len(context["messages"]) > 0
    )

    if not has_context:
        raise ContextError(
            "Add blueprint, audit, event, mission, or intervention context.",
            400,
            "EMPTY_CONTEXT",
        )

    return context
