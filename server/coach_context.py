MAX_GOALS = 10
MAX_RECENT_AUDITS = 6
MAX_RECENT_EVENTS = 100
MAX_CURRENT_MISSIONS = 5
MAX_RECENT_MISSION_OUTCOMES = 35
MAX_INTERVENTION_OUTCOMES = 20


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
            value.get("interventionOutcomes"),
            "interventionOutcomes",
            MAX_INTERVENTION_OUTCOMES,
        ),
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
    )

    if not has_context:
        raise ContextError(
            "Add blueprint, audit, event, mission, or intervention context.",
            400,
            "EMPTY_CONTEXT",
        )

    return context
