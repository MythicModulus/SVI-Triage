import os
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "nhaa_svi_test")
os.environ.setdefault("JWT_SECRET", "test-only-secret-with-at-least-32-bytes")
os.environ.setdefault("JWT_ALG", "HS256")

import jwt
import server
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = list(documents or [])

    @staticmethod
    def _value(document, key):
        value = document
        for part in key.split("."):
            if isinstance(value, list):
                value = [item.get(part) for item in value if isinstance(item, dict)]
            elif isinstance(value, dict):
                value = value.get(part)
            else:
                return None
        return value

    @classmethod
    def _matches(cls, document, query):
        for key, expected in query.items():
            if key == "$or":
                if not any(cls._matches(document, option) for option in expected):
                    return False
                continue
            value = cls._value(document, key)
            if isinstance(expected, dict) and "$ne" in expected:
                values = value if isinstance(value, list) else [value]
                if expected["$ne"] in values:
                    return False
            elif value != expected:
                return False
        return True

    async def find_one(self, query, projection=None):
        document = next((item for item in self.documents if self._matches(item, query)), None)
        if document is None:
            return None
        result = dict(document)
        if projection:
            included = {key for key, value in projection.items() if value and key != "_id"}
            if included:
                result = {key: value for key, value in result.items() if key in included}
            else:
                for key, value in projection.items():
                    if value == 0:
                        result.pop(key, None)
        return result

    async def update_one(self, query, update, upsert=False):
        document = next((item for item in self.documents if self._matches(item, query)), None)
        inserted = document is None
        if inserted:
            if not upsert:
                return SimpleNamespace(matched_count=0, upserted_id=None)
            document = {key: value for key, value in query.items() if not key.startswith("$")}
            document.update(update.get("$setOnInsert", {}))
            self.documents.append(document)
        for key, value in update.get("$set", {}).items():
            document[key] = value
        for key, value in update.get("$push", {}).items():
            document.setdefault(key, []).append(value)
        for key, value in update.get("$inc", {}).items():
            document[key] = document.get(key, 0) + value
        return SimpleNamespace(
            matched_count=0 if inserted else 1,
            upserted_id=document.get("_id") if inserted else None,
        )


class FakeDatabase:
    def __init__(self, sessions=None, cases=None):
        self.sessions = FakeCollection(sessions)
        self.cases = FakeCollection(cases)
        self.chat_rate_limits = FakeCollection()
        self.officers = FakeCollection()


def session(session_id):
    return {"id": session_id, "messages": [], "created_at": server.now_iso()}


def body(message, message_id="client-message-001"):
    return server.ChatMessageIn(client_message_id=message_id, message=message)


class AIChatTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.database = FakeDatabase(sessions=[session("victim-a"), session("victim-b")])
        self.db_patch = patch.object(server, "db", self.database)
        self.db_patch.start()
        self.addCleanup(self.db_patch.stop)

    async def test_different_inputs_and_history_are_sent_to_model(self):
        self.assertIn("do not ask for details the victim already supplied", server.CHAT_SYSTEM_INSTRUCTION)
        seen_context = []

        async def contextual_model(messages):
            seen_context.append(messages)
            last_user = next(item["content"] for item in reversed(messages) if item["role"] == "user")
            if "found my dog" in last_user:
                self.assertTrue(any("dog is missing" in item["content"] for item in messages))
                reply = "I’m glad you shared that update about finding your dog."
            else:
                reply = "I’m sorry your dog is missing. Would you like to share when you last saw them?"
            return server.ChatAIOutput(reply=reply, unknown_fields=list(server.FACT_FIELDS))

        with patch.object(server, "call_chat_model", new=AsyncMock(side_effect=contextual_model)):
            first = await server.chat_message(body("My dog is missing.", "message-dog-0001"), "victim-a")
            second = await server.chat_message(body("I found my dog.", "message-dog-0002"), "victim-a")

        self.assertNotEqual(first["reply"], second["reply"])
        self.assertEqual(len(seen_context), 2)
        self.assertTrue(any("message-dog-0001" in item["content"] for item in seen_context[1]))

    async def test_each_session_receives_only_its_own_history(self):
        seen = []

        async def capture(messages):
            seen.append(messages)
            return server.ChatAIOutput(reply="I hear you.", unknown_fields=list(server.FACT_FIELDS))

        with patch.object(server, "call_chat_model", new=AsyncMock(side_effect=capture)):
            await server.chat_message(body("private detail alpha", "message-alpha-001"), "victim-a")
            await server.chat_message(body("private detail beta", "message-beta-001"), "victim-b")

        self.assertIn("private detail alpha", str(seen[0]))
        self.assertNotIn("private detail alpha", str(seen[1]))
        self.assertIn("private detail beta", str(seen[1]))

    async def test_invalid_and_missing_victim_tokens_are_rejected(self):
        missing = HTTPAuthorizationCredentials(scheme="Bearer", credentials="")
        with self.assertRaises(HTTPException) as error:
            await server.current_victim(missing)
        self.assertEqual(error.exception.status_code, 401)

        forged = jwt.encode(
            {"sub": "not-a-real-session", "role": "victim", "exp": 4_102_444_800},
            server.JWT_SECRET,
            algorithm=server.JWT_ALG,
        )
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=forged)
        with self.assertRaises(HTTPException) as error:
            await server.current_victim(credentials)
        self.assertEqual(error.exception.status_code, 401)

    async def test_blank_and_oversized_messages_are_rejected(self):
        with self.assertRaises(ValidationError):
            body("  ")
        with self.assertRaises(ValidationError):
            body("x" * (server.CHAT_MESSAGE_MAX_LENGTH + 1))

    async def test_provider_failure_keeps_original_and_returns_safe_error(self):
        with patch.object(
            server,
            "call_chat_model",
            new=AsyncMock(side_effect=HTTPException(503, "The automated response service is temporarily unavailable.")),
        ):
            with self.assertRaises(HTTPException) as error:
                await server.chat_message(body("Please help me.", "message-failure-001"), "victim-a")
        self.assertEqual(error.exception.status_code, 503)
        messages = self.database.sessions.documents[0]["messages"]
        self.assertEqual([message["role"] for message in messages], ["user"])
        self.assertNotIn("traceback", error.exception.detail.lower())

    async def test_openai_compatible_provider_uses_server_key_and_timeout(self):
        response = SimpleNamespace(
            raise_for_status=Mock(),
            json=Mock(return_value={
                "choices": [{
                    "message": {
                        "content": json.dumps({"reply": "I hear you.", "unknown_fields": list(server.FACT_FIELDS)})
                    }
                }]
            }),
        )
        client = SimpleNamespace(post=AsyncMock(return_value=response))

        class ClientContext:
            async def __aenter__(self):
                return client

            async def __aexit__(self, *_):
                return None

        with patch.object(server, "CHAT_LLM_PROVIDER", "openai"), patch.object(
            server, "OPENAI_API_KEY", "test-server-only-key"
        ), patch.object(
            server.httpx, "AsyncClient", return_value=ClientContext()
        ) as client_constructor:
            result = await server.call_chat_model([{"role": "system", "content": "safe instructions"}])

        self.assertEqual(result.reply, "I hear you.")
        self.assertTrue(client_constructor.call_args.kwargs["timeout"].read > 0)
        request = client.post.await_args
        self.assertEqual(request.kwargs["headers"]["Authorization"], "Bearer test-server-only-key")
        self.assertNotIn("test-server-only-key", str(request.kwargs["json"]))

    async def test_ollama_provider_uses_local_endpoint_without_authorization(self):
        response = SimpleNamespace(
            raise_for_status=Mock(),
            json=Mock(return_value={
                "choices": [{
                    "message": {
                        "content": json.dumps({"reply": "I hear you.", "unknown_fields": list(server.FACT_FIELDS)})
                    }
                }]
            }),
        )
        client = SimpleNamespace(post=AsyncMock(return_value=response))

        class ClientContext:
            async def __aenter__(self):
                return client

            async def __aexit__(self, *_):
                return None

        with patch.object(server, "CHAT_LLM_PROVIDER", "ollama"), patch.object(
            server, "OLLAMA_BASE_URL", "http://localhost:11434/v1"
        ), patch.object(server, "OLLAMA_MODEL", "test-local-model"), patch.object(
            server.httpx, "AsyncClient", return_value=ClientContext()
        ):
            result = await server.call_chat_model([{"role": "system", "content": "safe instructions"}])

        self.assertEqual(result.reply, "I hear you.")
        request = client.post.await_args
        self.assertEqual(request.args[0], "http://localhost:11434/v1/chat/completions")
        self.assertEqual(request.kwargs["json"]["model"], "test-local-model")
        self.assertNotIn("Authorization", request.kwargs["headers"])
        response_format = request.kwargs["json"]["response_format"]
        self.assertEqual(response_format["type"], "json_schema")
        self.assertEqual(response_format["json_schema"]["schema"], server.ChatAIOutput.model_json_schema())
        self.assertTrue(response_format["json_schema"]["strict"])

    async def test_ollama_rejects_remote_endpoint(self):
        with patch.object(server, "OLLAMA_BASE_URL", "http://example.com/v1"):
            with self.assertRaises(HTTPException) as error:
                await server.call_ollama_chat_model([])
        self.assertEqual(error.exception.status_code, 503)

    async def test_model_context_includes_selected_response_language(self):
        context = server.model_context(session("victim-language"), "hi")
        self.assertIn("Hindi", context[0]["content"])
        self.assertIn("exact source evidence quotes", context[0]["content"])

    async def test_retried_message_is_idempotent(self):
        model = AsyncMock(return_value=server.ChatAIOutput(reply="I hear you."))
        with patch.object(server, "call_chat_model", new=model):
            first = await server.chat_message(body("Please help.", "message-retry-001"), "victim-a")
            second = await server.chat_message(body("Please help.", "message-retry-001"), "victim-a")
        self.assertEqual(first, second)
        self.assertEqual(model.await_count, 1)
        self.assertEqual(len(self.database.sessions.documents[0]["messages"]), 2)

    async def test_corrections_preserve_prior_extracted_value_and_unknown_fields(self):
        outputs = [
            server.ChatAIOutput(
                reply="Thank you. Is there anything you would like to correct?",
                summary="Victim shared an approximate date.",
                explicit_facts=[server.ChatExtractedFact(
                    field="incident_datetime",
                    value="Yesterday",
                    evidence="It happened yesterday.",
                    source_message_id="message-correct-001",
                )],
            ),
            server.ChatAIOutput(
                reply="Thank you for correcting that. I will use Tuesday.",
                summary="Victim corrected the approximate date to Tuesday.",
                explicit_facts=[server.ChatExtractedFact(
                    field="incident_datetime",
                    value="Last Tuesday",
                    evidence="Correction: it was last Tuesday.",
                    source_message_id="message-correct-002",
                )],
            ),
        ]
        with patch.object(server, "call_chat_model", new=AsyncMock(side_effect=outputs)):
            await server.chat_message(body("It happened yesterday.", "message-correct-001"), "victim-a")
            await server.chat_message(body("Correction: it was last Tuesday.", "message-correct-002"), "victim-a")

        analysis = self.database.sessions.documents[0]["conversation_analysis"]
        self.assertEqual(analysis["explicit_facts"]["incident_datetime"]["value"], "Last Tuesday")
        self.assertEqual(analysis["fact_history"][0]["value"], "Yesterday")
        self.assertIn("incident_description", analysis["unknown_fields"])
        self.assertEqual(analysis["explicit_facts"]["incident_datetime"]["provenance"], "victim_message_quote")

    async def test_unverified_or_non_victim_fact_citations_are_dropped(self):
        with patch.object(
            server,
            "call_chat_model",
            new=AsyncMock(return_value=server.ChatAIOutput(
                reply="I understand.",
                explicit_facts=[server.ChatExtractedFact(
                    field="location",
                    value="A hospital",
                    evidence="I live near the river.",
                    source_message_id="message-invalid-001",
                )],
            )),
        ):
            await server.chat_message(body("I live near the river.", "message-real-001"), "victim-a")
        self.assertEqual(self.database.sessions.documents[0]["conversation_analysis"]["explicit_facts"], {})

    async def test_immediate_danger_bypasses_model_and_requests_human_review(self):
        model = AsyncMock()
        with patch.object(server, "call_chat_model", new=model):
            response = await server.chat_message(
                body("They are outside my home right now.", "message-danger-001"),
                "victim-a",
            )
        self.assertTrue(response["immediate_safety_concern"])
        self.assertIn("has not contacted anyone", response["reply"])
        self.assertEqual(model.await_count, 0)
        analysis = self.database.sessions.documents[0]["conversation_analysis"]
        self.assertTrue(analysis["human_review_recommended"])
        self.assertEqual(analysis["potential_safety_concerns"][0]["source_message_id"], "message-danger-001")

    async def test_original_transcript_is_available_only_to_assigned_officer(self):
        self.database.cases.documents.append({
            "id": "case-a",
            "session_id": "victim-a",
            "assigned_officer_id": "OFF-2001",
        })
        with patch.object(
            server,
            "call_chat_model",
            new=AsyncMock(return_value=server.ChatAIOutput(reply="I understand.")),
        ):
            await server.chat_message(body("My neighbor threatened me.", "message-review-001"), "victim-a")
        with self.assertRaises(HTTPException) as denied:
            await server.get_case_conversation("case-a", {
                "officer_id": "OFF-2002",
                "role": "officer",
            })
        self.assertEqual(denied.exception.status_code, 403)

        reviewed = await server.get_case_conversation("case-a", {
            "officer_id": "OFF-2001",
            "role": "officer",
        })
        self.assertEqual(reviewed["messages"][0]["text"], "My neighbor threatened me.")
        self.assertEqual(reviewed["unknown_fields"], list(server.FACT_FIELDS))

    async def test_unassigned_case_conversation_requires_admin(self):
        self.database.cases.documents.append({
            "id": "case-unassigned",
            "session_id": "victim-a",
        })
        with self.assertRaises(HTTPException) as denied:
            await server.get_case_conversation("case-unassigned", {
                "officer_id": "OFF-2001",
                "role": "officer",
            })
        self.assertEqual(denied.exception.status_code, 403)
        result = await server.get_case_conversation("case-unassigned", {
            "officer_id": "OFF-2002",
            "role": "admin",
        })
        self.assertEqual(result["messages"], [])

    async def test_name_only_assignment_does_not_authorize_conversation(self):
        self.database.cases.documents.append({
            "id": "case-name-only",
            "session_id": "victim-a",
            "assigned_officer": "Officer Same Name",
        })
        with self.assertRaises(HTTPException) as denied:
            await server.get_case_conversation("case-name-only", {
                "officer_id": "OFF-2001",
                "name": "Officer Same Name",
                "role": "officer",
            })
        self.assertEqual(denied.exception.status_code, 403)

    async def test_original_message_and_timestamp_are_preserved_after_response(self):
        with patch.object(server, "call_chat_model", new=AsyncMock(
            return_value=server.ChatAIOutput(reply="I understand.")
        )):
            await server.chat_message(body("This is what happened.", "message-original-001"), "victim-a")
        messages = self.database.sessions.documents[0]["messages"]
        self.assertEqual(messages[0]["text"], "This is what happened.")
        self.assertEqual(messages[0]["role"], "user")
        self.assertTrue(messages[0]["ts"])
        self.assertEqual(messages[0]["id"], "message-original-001")

    async def test_chat_rate_limit_is_enforced_per_session(self):
        with patch.object(server, "CHAT_RATE_LIMIT_PER_MINUTE", 1), patch.object(
            server,
            "call_chat_model",
            new=AsyncMock(return_value=server.ChatAIOutput(reply="I understand.")),
        ):
            await server.chat_message(body("First message.", "message-limit-001"), "victim-a")
            with self.assertRaises(HTTPException) as error:
                await server.chat_message(body("Second message.", "message-limit-002"), "victim-a")
        self.assertEqual(error.exception.status_code, 429)
        self.assertEqual(self.database.chat_rate_limits.documents[0]["count"], 2)


if __name__ == "__main__":
    unittest.main()
