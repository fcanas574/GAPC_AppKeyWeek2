from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "gapc.db"


def utc_now_iso() -> str:
	return datetime.now(timezone.utc).isoformat(timespec="seconds")


def create_app() -> Flask:
	app = Flask(__name__)
	app.config["JSON_SORT_KEYS"] = False

	init_db()

	@app.route("/")
	def index() -> str:
		state = get_state()
		return render_template("index.html", state=state)

	@app.get("/api/state")
	def api_state() -> Any:
		return jsonify(get_state())

	@app.post("/api/meeting/new")
	def api_new_meeting() -> Any:
		meeting_id = start_new_meeting()
		return jsonify({"ok": True, "meeting_id": meeting_id, "state": get_state()})

	@app.post("/api/attendance")
	def api_attendance() -> Any:
		payload = request.get_json(silent=True) or {}
		member_id = payload.get("member_id")
		status = payload.get("status")

		if not isinstance(member_id, int) or status not in {"present", "absent"}:
			return jsonify({"ok": False, "error": "Datos invalidos"}), 400

		meeting_id = get_active_meeting_id()
		upsert_attendance(meeting_id, member_id, status)
		return jsonify({"ok": True, "state": get_state()})

	@app.post("/api/payment")
	def api_payment() -> Any:
		payload = request.get_json(silent=True) or {}
		member_id = payload.get("member_id")
		principal = payload.get("principal")
		interest = payload.get("interest")

		if not isinstance(member_id, int):
			return jsonify({"ok": False, "error": "Socia invalida"}), 400

		try:
			principal_value = round(float(principal), 2)
			interest_value = round(float(interest), 2)
		except (TypeError, ValueError):
			return jsonify({"ok": False, "error": "Monto invalido"}), 400

		if principal_value < 0 or interest_value < 0:
			return jsonify({"ok": False, "error": "Monto invalido"}), 400

		if principal_value == 0 and interest_value == 0:
			return jsonify({"ok": False, "error": "Pago vacio"}), 400

		meeting_id = get_active_meeting_id()
		existing_principal, existing_interest = get_member_payment_for_meeting(
			meeting_id, member_id
		)
		cap_principal, cap_interest = get_member_remaining(member_id)
		cap_principal += existing_principal
		cap_interest += existing_interest
		if principal_value > cap_principal + 0.001 or interest_value > cap_interest + 0.001:
			return jsonify({"ok": False, "error": "Sobrepago detectado"}), 400

		save_or_update_payment(meeting_id, member_id, principal_value, interest_value)
		return jsonify({"ok": True, "state": get_state()})

	return app


def get_connection() -> sqlite3.Connection:
	conn = sqlite3.connect(DB_PATH)
	conn.row_factory = sqlite3.Row
	return conn


def init_db() -> None:
	with get_connection() as conn:
		conn.executescript(
			"""
			CREATE TABLE IF NOT EXISTS members (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				photo_emoji TEXT NOT NULL
			);

			CREATE TABLE IF NOT EXISTS loans (
				member_id INTEGER PRIMARY KEY,
				principal_total REAL NOT NULL,
				interest_total REAL NOT NULL,
				FOREIGN KEY (member_id) REFERENCES members(id)
			);

			CREATE TABLE IF NOT EXISTS meetings (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				started_at TEXT NOT NULL,
				is_active INTEGER NOT NULL DEFAULT 1
			);

			CREATE TABLE IF NOT EXISTS attendance (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				meeting_id INTEGER NOT NULL,
				member_id INTEGER NOT NULL,
				status TEXT NOT NULL CHECK(status IN ('present', 'absent')),
				updated_at TEXT NOT NULL,
				UNIQUE(meeting_id, member_id),
				FOREIGN KEY (meeting_id) REFERENCES meetings(id),
				FOREIGN KEY (member_id) REFERENCES members(id)
			);

			CREATE TABLE IF NOT EXISTS payments (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				meeting_id INTEGER NOT NULL,
				member_id INTEGER NOT NULL,
				principal REAL NOT NULL,
				interest REAL NOT NULL,
				updated_at TEXT NOT NULL,
				UNIQUE(meeting_id, member_id),
				FOREIGN KEY (meeting_id) REFERENCES meetings(id),
				FOREIGN KEY (member_id) REFERENCES members(id)
			);
			"""
		)

		seed_if_needed(conn)


def seed_if_needed(conn: sqlite3.Connection) -> None:
	row = conn.execute("SELECT COUNT(*) AS total FROM members").fetchone()
	if row and row["total"] > 0:
		ensure_active_meeting(conn)
		return

	demo_members = [
		("Ana", "👩"),
		("Luz", "🧕"),
		("Marta", "👩‍🌾"),
		("Rosa", "👩🏽"),
		("Dina", "👩🏾"),
		("Sonia", "👩🏿"),
	]

	conn.executemany("INSERT INTO members(name, photo_emoji) VALUES (?, ?)", demo_members)

	rows = conn.execute("SELECT id FROM members ORDER BY id").fetchall()
	demo_loans = []
	for idx, member in enumerate(rows, start=1):
		principal_total = float(8 + idx)
		interest_total = float(1 + (idx % 3) * 0.5)
		demo_loans.append((member["id"], principal_total, interest_total))

	conn.executemany(
		"INSERT INTO loans(member_id, principal_total, interest_total) VALUES (?, ?, ?)",
		demo_loans,
	)

	ensure_active_meeting(conn)


def ensure_active_meeting(conn: sqlite3.Connection) -> int:
	active = conn.execute(
		"SELECT id FROM meetings WHERE is_active = 1 ORDER BY id DESC LIMIT 1"
	).fetchone()
	if active:
		return int(active["id"])

	now = utc_now_iso()
	cursor = conn.execute(
		"INSERT INTO meetings(started_at, is_active) VALUES (?, 1)",
		(now,),
	)
	return int(cursor.lastrowid)


def get_active_meeting_id() -> int:
	with get_connection() as conn:
		return ensure_active_meeting(conn)


def start_new_meeting() -> int:
	now = utc_now_iso()
	with get_connection() as conn:
		conn.execute("UPDATE meetings SET is_active = 0 WHERE is_active = 1")
		cursor = conn.execute(
			"INSERT INTO meetings(started_at, is_active) VALUES (?, 1)",
			(now,),
		)
		return int(cursor.lastrowid)


def upsert_attendance(meeting_id: int, member_id: int, status: str) -> None:
	now = utc_now_iso()
	with get_connection() as conn:
		conn.execute(
			"""
			INSERT INTO attendance(meeting_id, member_id, status, updated_at)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(meeting_id, member_id)
			DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
			""",
			(meeting_id, member_id, status, now),
		)


def save_or_update_payment(
	meeting_id: int,
	member_id: int,
	principal: float,
	interest: float,
) -> None:
	now = utc_now_iso()
	with get_connection() as conn:
		conn.execute(
			"""
			INSERT INTO payments(meeting_id, member_id, principal, interest, updated_at)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(meeting_id, member_id)
			DO UPDATE SET
				principal = excluded.principal,
				interest = excluded.interest,
				updated_at = excluded.updated_at
			""",
			(meeting_id, member_id, principal, interest, now),
		)


def get_member_payment_for_meeting(meeting_id: int, member_id: int) -> tuple[float, float]:
	with get_connection() as conn:
		row = conn.execute(
			"SELECT principal, interest FROM payments WHERE meeting_id = ? AND member_id = ?",
			(meeting_id, member_id),
		).fetchone()

	if not row:
		return (0.0, 0.0)

	return (round(float(row["principal"]), 2), round(float(row["interest"]), 2))


def get_member_remaining(member_id: int) -> tuple[float, float]:
	with get_connection() as conn:
		row = conn.execute(
			"""
			SELECT
				l.principal_total,
				l.interest_total,
				COALESCE(SUM(p.principal), 0) AS paid_principal,
				COALESCE(SUM(p.interest), 0) AS paid_interest
			FROM loans l
			LEFT JOIN payments p ON p.member_id = l.member_id
			WHERE l.member_id = ?
			GROUP BY l.member_id, l.principal_total, l.interest_total
			""",
			(member_id,),
		).fetchone()

	if not row:
		return (0.0, 0.0)

	principal_remaining = max(0.0, round(row["principal_total"] - row["paid_principal"], 2))
	interest_remaining = max(0.0, round(row["interest_total"] - row["paid_interest"], 2))
	return (principal_remaining, interest_remaining)


def get_state() -> dict[str, Any]:
	with get_connection() as conn:
		meeting = conn.execute(
			"SELECT id, started_at FROM meetings WHERE is_active = 1 ORDER BY id DESC LIMIT 1"
		).fetchone()
		if not meeting:
			meeting_id = ensure_active_meeting(conn)
			meeting = conn.execute(
				"SELECT id, started_at FROM meetings WHERE id = ?",
				(meeting_id,),
			).fetchone()

		members = conn.execute(
			"""
			SELECT
				m.id,
				m.name,
				m.photo_emoji,
				l.principal_total,
				l.interest_total,
				COALESCE(a.status, 'absent') AS attendance,
				COALESCE(pm.principal, 0) AS current_principal,
				COALESCE(pm.interest, 0) AS current_interest,
				COALESCE(sum_p.paid_principal, 0) AS paid_principal,
				COALESCE(sum_p.paid_interest, 0) AS paid_interest
			FROM members m
			JOIN loans l ON l.member_id = m.id
			LEFT JOIN attendance a
				ON a.member_id = m.id AND a.meeting_id = ?
			LEFT JOIN payments pm
				ON pm.member_id = m.id AND pm.meeting_id = ?
			LEFT JOIN (
				SELECT
					member_id,
					SUM(principal) AS paid_principal,
					SUM(interest) AS paid_interest
				FROM payments
				GROUP BY member_id
			) AS sum_p ON sum_p.member_id = m.id
			ORDER BY m.id
			""",
			(meeting["id"], meeting["id"]),
		).fetchall()

	member_cards: list[dict[str, Any]] = []
	for row in members:
		principal_remaining = max(0.0, round(row["principal_total"] - row["paid_principal"], 2))
		interest_remaining = max(0.0, round(row["interest_total"] - row["paid_interest"], 2))
		member_cards.append(
			{
				"id": row["id"],
				"name": row["name"],
				"photo_emoji": row["photo_emoji"],
				"attendance": row["attendance"],
				"loan": {
					"principal_total": round(row["principal_total"], 2),
					"interest_total": round(row["interest_total"], 2),
					"principal_remaining": principal_remaining,
					"interest_remaining": interest_remaining,
					"current_payment": {
						"principal": round(row["current_principal"], 2),
						"interest": round(row["current_interest"], 2),
					},
				},
			}
		)

	return {
		"meeting": {
			"id": meeting["id"],
			"started_at": meeting["started_at"],
		},
		"denominations": [0.25, 0.5, 1, 2, 5],
		"members": member_cards,
	}


app = create_app()


if __name__ == "__main__":
	app.run(debug=True)
