import os
import unittest
from types import SimpleNamespace

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "nhaa_svi_test")
os.environ.setdefault("JWT_SECRET", "test-only-secret-with-at-least-32-bytes")
os.environ.setdefault("JWT_ALG", "HS256")

import server
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = list(documents or [])

    @staticmethod
    def _matches(document, query):
        for key, value in query.items():
            if key == "$or":
                if not any(FakeCollection._matches(document, item) for item in value):
                    return False
            elif document.get(key) != value:
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

    async def insert_one(self, document):
        self.documents.append(dict(document))
        return SimpleNamespace(inserted_id=document.get("id"))

    async def update_one(self, query, update, upsert=False):
        document = next((item for item in self.documents if self._matches(item, query)), None)
        inserted = document is None
        if inserted:
            if not upsert:
                return SimpleNamespace(matched_count=0, upserted_id=None)
            document = {key: value for key, value in query.items() if key != "$or"}
            self.documents.append(document)
            document.update(update.get("$setOnInsert", {}))
        document.update(update.get("$set", {}))
        return SimpleNamespace(
            matched_count=0 if inserted else 1,
            upserted_id=document.get("id") if inserted else None,
        )


class FakeDatabase:
    def __init__(self, cases=None):
        self.sessions = FakeCollection([{"id": "session-1"}])
        self.cases = FakeCollection(cases)
        self.victim_locations = FakeCollection()


def gps_location(**overrides):
    values = {
        "source": "gps",
        "latitude": 28.6139,
        "longitude": 77.209,
        "accuracy_m": 18.5,
        "consent": True,
    }
    values.update(overrides)
    return server.VictimLocationIn(**values)


class VictimLocationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.original_db = server.db
        self.case = {
            "id": "case-1",
            "case_ref": "NHAA-2026-12345",
            "session_id": "session-1",
            "assigned_officer": "Officer One",
            "assigned_officer_id": "OFF-1",
        }
        server.db = FakeDatabase([self.case])

    def tearDown(self):
        server.db = self.original_db

    async def test_valid_gps_location_is_persisted_with_consent_and_timestamps(self):
        result = await server.share_victim_location("case-1", gps_location(), "session-1")

        self.assertEqual(result["sharing_status"], "shared")
        self.assertEqual(result["latitude"], 28.6139)
        self.assertEqual(result["source"], "gps")
        self.assertTrue(result["consented_at"])
        self.assertTrue(result["created_at"])
        self.assertEqual(result["created_at"], result["updated_at"])
        self.assertEqual(len(server.db.victim_locations.documents), 1)

    async def test_manual_location_can_be_shared_without_coordinates(self):
        body = server.VictimLocationIn(
            source="manual",
            instructions="Blue gate beside the pharmacy",
            consent=True,
        )

        result = await server.share_victim_location("case-1", body, "session-1")

        self.assertEqual(result["source"], "manual")
        self.assertEqual(result["instructions"], "Blue gate beside the pharmacy")
        self.assertIsNone(result["latitude"])

    async def test_manual_location_requires_an_address_or_landmark(self):
        with self.assertRaises(HTTPException) as error:
            await server.share_victim_location(
                "case-1",
                server.VictimLocationIn(source="manual", consent=True),
                "session-1",
            )
        self.assertEqual(error.exception.status_code, 422)

    async def test_invalid_coordinates_and_incomplete_gps_are_rejected(self):
        with self.assertRaises(ValidationError):
            gps_location(latitude=91)
        with self.assertRaises(ValidationError):
            gps_location(longitude=181)
        with self.assertRaises(HTTPException) as error:
            await server.share_victim_location(
                "case-1",
                gps_location(longitude=None),
                "session-1",
            )
        self.assertEqual(error.exception.status_code, 422)

    async def test_consent_is_required_before_sharing(self):
        with self.assertRaises(HTTPException) as error:
            await server.share_victim_location(
                "case-1",
                gps_location(consent=False),
                "session-1",
            )
        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(server.db.victim_locations.documents, [])

    async def test_victim_token_is_required_and_must_have_victim_role(self):
        with self.assertRaises(HTTPException) as error:
            await server.current_victim(None)
        self.assertEqual(error.exception.status_code, 401)

        officer_token = server.make_token("OFF-1", "officer")
        with self.assertRaises(HTTPException) as error:
            await server.current_victim(
                HTTPAuthorizationCredentials(scheme="Bearer", credentials=officer_token)
            )
        self.assertEqual(error.exception.status_code, 403)

        victim_token = server.make_token("session-1", "victim")
        session_id = await server.current_victim(
            HTTPAuthorizationCredentials(scheme="Bearer", credentials=victim_token)
        )
        self.assertEqual(session_id, "session-1")

    async def test_location_is_bound_to_the_victim_session_and_case(self):
        with self.assertRaises(HTTPException) as error:
            await server.share_victim_location("case-1", gps_location(), "another-session")
        self.assertEqual(error.exception.status_code, 404)

        server.db.cases.documents.append({
            "id": "case-2",
            "session_id": "session-1",
            "assigned_officer": None,
        })
        response = await server.get_victim_location("case-2", "session-1")
        self.assertEqual(response, {"sharing_status": "not_shared"})

    async def test_officer_access_is_scoped_to_assignment_or_admin_role(self):
        await server.share_victim_location("case-1", gps_location(), "session-1")

        with self.assertRaises(HTTPException) as error:
            await server.get_officer_victim_location(
                "case-1",
                {"officer_id": "OFF-2", "name": "Officer Two", "role": "officer"},
            )
        self.assertEqual(error.exception.status_code, 404)

        authorized = await server.get_officer_victim_location(
            "case-1",
            {"officer_id": "OFF-1", "name": "Officer One", "role": "officer"},
        )
        self.assertEqual(authorized["latitude"], 28.6139)

        administrator = await server.get_officer_victim_location(
            "case-1",
            {"officer_id": "OFF-3", "name": "Administrator", "role": "admin"},
        )
        self.assertEqual(administrator["sharing_status"], "shared")

    async def test_withdrawal_hides_coordinates_but_retains_record(self):
        await server.share_victim_location("case-1", gps_location(), "session-1")
        withdrawn = await server.withdraw_victim_location("case-1", "session-1")
        officer_view = await server.get_officer_victim_location(
            "case-1",
            {"officer_id": "OFF-1", "name": "Officer One", "role": "officer"},
        )

        self.assertEqual(withdrawn["sharing_status"], "withdrawn")
        self.assertEqual(officer_view["sharing_status"], "withdrawn")
        self.assertNotIn("latitude", officer_view)
        self.assertEqual(len(server.db.victim_locations.documents), 1)
        self.assertEqual(server.db.victim_locations.documents[0]["latitude"], 28.6139)

    async def test_deletion_request_withdraws_sharing_and_records_request(self):
        await server.share_victim_location("case-1", gps_location(), "session-1")
        response = await server.request_victim_location_deletion("case-1", "session-1")
        officer_view = await server.get_officer_victim_location(
            "case-1",
            {"officer_id": "OFF-1", "name": "Officer One", "role": "officer"},
        )

        self.assertTrue(response["deletion_requested"])
        self.assertEqual(response["sharing_status"], "withdrawn")
        self.assertTrue(server.db.victim_locations.documents[0]["latitude"])
        self.assertTrue(officer_view["deletion_requested"])
        self.assertNotIn("latitude", officer_view)

        with self.assertRaises(HTTPException) as error:
            await server.share_victim_location("case-1", gps_location(), "session-1")
        self.assertEqual(error.exception.status_code, 409)

    async def test_case_reference_from_another_session_does_not_resolve(self):
        await server.share_victim_location("case-1", gps_location(), "session-1")
        with self.assertRaises(HTTPException) as error:
            await server.get_victim_location("NHAA-2026-12345", "another-session")
        self.assertEqual(error.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
