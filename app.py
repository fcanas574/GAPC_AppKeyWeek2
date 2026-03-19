from __future__ import annotations

import argparse
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request, send_from_directory, url_for
from werkzeug.utils import secure_filename


BASE_DIR = Path(__file__).resolve().parent
IS_VERCEL = bool(os.environ.get("VERCEL"))
RUNTIME_DATA_DIR = Path("/tmp/gapc_app") if IS_VERCEL else BASE_DIR
DB_PATH = RUNTIME_DATA_DIR / "gapc.db"
UPLOADS_DIR = RUNTIME_DATA_DIR / "uploads"


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

	@app.get("/uploads/<path:filename>")
	def uploaded_file(filename: str) -> Any:
		return send_from_directory(UPLOADS_DIR, filename)

	@app.get("/api/state")
	def api_state() -> Any:
		return jsonify(get_state())

	@app.post("/api/meeting/new")
	def api_new_meeting() -> Any:
		meeting_id = start_new_meeting()
		return jsonify({"ok": True, "meeting_id": meeting_id, "state": get_state()})

	@app.post("/api/demo/reset")
	def api_demo_reset() -> Any:
		reset_database()
		return jsonify({"ok": True, "state": get_state()})

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
			return jsonify({"ok": False, "error": "Socio/a invalido/a"}), 400

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

		applied_principal = round(min(principal_value, cap_principal), 2)
		applied_interest = round(min(interest_value, cap_interest), 2)
		change_principal = round(max(0.0, principal_value - applied_principal), 2)
		change_interest = round(max(0.0, interest_value - applied_interest), 2)

		save_or_update_payment(meeting_id, member_id, applied_principal, applied_interest)
		return jsonify(
			{
				"ok": True,
				"state": get_state(),
				"payment_summary": {
					"entered": {
						"principal": principal_value,
						"interest": interest_value,
					},
					"applied": {
						"principal": applied_principal,
						"interest": applied_interest,
					},
					"change": {
						"principal": change_principal,
						"interest": change_interest,
						"total": round(change_principal + change_interest, 2),
					},
				},
			}
		)

	@app.post("/api/member/save")
	def api_member_save() -> Any:
		mode = (request.form.get("mode") or "new").strip().lower()
		member_id_raw = request.form.get("member_id")
		name = (request.form.get("name") or "").strip()
		gender = normalize_gender(request.form.get("gender"))
		principal_raw = request.form.get("principal_total")
		interest_raw = request.form.get("interest_total")
		photo = request.files.get("photo")

		try:
			principal_total = round(float(principal_raw), 2)
			interest_total = round(float(interest_raw), 2)
		except (TypeError, ValueError):
			return jsonify({"ok": False, "error": "Monto de prestamo invalido"}), 400

		if principal_total < 0 or interest_total < 0:
			return jsonify({"ok": False, "error": "Monto de prestamo invalido"}), 400

		if mode not in {"new", "existing"}:
			return jsonify({"ok": False, "error": "Modo invalido"}), 400

		if mode == "new" and not name:
			return jsonify({"ok": False, "error": "Nombre requerido"}), 400

		if mode == "existing" and not member_id_raw:
			return jsonify({"ok": False, "error": "Socio/a requerido/a"}), 400

		member_id: int | None = None
		if mode == "existing":
			try:
				member_id = int(member_id_raw)
			except (TypeError, ValueError):
				return jsonify({"ok": False, "error": "Socio/a invalido/a"}), 400

		photo_path = save_uploaded_photo(photo)

		try:
			saved_member_id = create_or_update_member(
				mode=mode,
				member_id=member_id,
				name=name,
				gender=gender,
				principal_total=principal_total,
				interest_total=interest_total,
				photo_path=photo_path,
			)
		except ValueError as error:
			return jsonify({"ok": False, "error": str(error)}), 400

		return jsonify({"ok": True, "member_id": saved_member_id, "state": get_state()})

	@app.post("/api/member/delete")
	def api_member_delete() -> Any:
		payload = request.get_json(silent=True) or {}
		member_id = payload.get("member_id")

		if not isinstance(member_id, int):
			return jsonify({"ok": False, "error": "Socio/a invalido/a"}), 400

		try:
			delete_member(member_id)
		except ValueError as error:
			return jsonify({"ok": False, "error": str(error)}), 400

		return jsonify({"ok": True, "state": get_state()})

	@app.post("/api/member/update")
	def api_member_update() -> Any:
		payload = request.get_json(silent=True) or {}
		member_id = payload.get("member_id")
		name = (payload.get("name") or "").strip()
		gender = normalize_gender(payload.get("gender"))
		principal_raw = payload.get("principal_total")
		interest_raw = payload.get("interest_total")

		if not isinstance(member_id, int):
			return jsonify({"ok": False, "error": "Socio/a invalido/a"}), 400

		if not name:
			return jsonify({"ok": False, "error": "Nombre requerido"}), 400

		try:
			principal_total = round(float(principal_raw), 2)
			interest_total = round(float(interest_raw), 2)
		except (TypeError, ValueError):
			return jsonify({"ok": False, "error": "Monto de prestamo invalido"}), 400

		if principal_total < 0 or interest_total < 0:
			return jsonify({"ok": False, "error": "Monto de prestamo invalido"}), 400

		try:
			update_member_attributes(
				member_id=member_id,
				name=name,
				gender=gender,
				principal_total=principal_total,
				interest_total=interest_total,
			)
		except ValueError as error:
			return jsonify({"ok": False, "error": str(error)}), 400

		return jsonify({"ok": True, "state": get_state(), "member_id": member_id})

	return app


def get_connection() -> sqlite3.Connection:
	conn = sqlite3.connect(DB_PATH)
	conn.row_factory = sqlite3.Row
	return conn


def init_db() -> None:
	UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
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
				interest_per_meeting REAL NOT NULL,
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

		ensure_schema_migrations(conn)

		seed_if_needed(conn)


def ensure_schema_migrations(conn: sqlite3.Connection) -> None:
	columns = conn.execute("PRAGMA table_info(members)").fetchall()
	column_names = {column["name"] for column in columns}
	if "photo_path" not in column_names:
		conn.execute("ALTER TABLE members ADD COLUMN photo_path TEXT")
	if "gender" not in column_names:
		conn.execute("ALTER TABLE members ADD COLUMN gender TEXT NOT NULL DEFAULT 'female'")

	loan_columns = conn.execute("PRAGMA table_info(loans)").fetchall()
	loan_column_names = {column["name"] for column in loan_columns}
	if "interest_per_meeting" not in loan_column_names:
		conn.execute("ALTER TABLE loans ADD COLUMN interest_per_meeting REAL")
		conn.execute(
			"UPDATE loans SET interest_per_meeting = interest_total WHERE interest_per_meeting IS NULL"
		)
		conn.execute(
			"UPDATE loans SET interest_per_meeting = 0 WHERE interest_per_meeting IS NULL"
		)


def normalize_gender(gender: str | None) -> str:
	value = (gender or "female").strip().lower()
	if value in {"male", "m"}:
		return "male"
	return "female"


def default_emoji_for_gender(gender: str) -> str:
	return "👨" if gender == "male" else "👩"


def save_uploaded_photo(photo: Any) -> str | None:
	if not photo or not getattr(photo, "filename", ""):
		return None

	filename = secure_filename(str(photo.filename))
	if not filename:
		return None

	suffix = Path(filename).suffix.lower()
	if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
		return None

	timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
	final_name = f"member_{timestamp}{suffix}"
	destination = UPLOADS_DIR / final_name
	photo.save(destination)
	return final_name


def create_or_update_member(
	*,
	mode: str,
	member_id: int | None,
	name: str,
	gender: str,
	principal_total: float,
	interest_total: float,
	photo_path: str | None,
) -> int:
	with get_connection() as conn:
		if mode == "new":
			existing_by_name = conn.execute(
				"""
				SELECT id, photo_path, gender
				FROM members
				WHERE lower(trim(name)) = lower(trim(?))
				ORDER BY id
				LIMIT 1
				""",
				(name,),
			).fetchone()

			if existing_by_name:
				existing_id = int(existing_by_name["id"])
				final_photo = photo_path if photo_path else existing_by_name["photo_path"]
				final_gender = normalize_gender(gender if gender else existing_by_name["gender"])
				emoji = default_emoji_for_gender(final_gender)
				conn.execute(
					"UPDATE members SET name = ?, photo_path = ?, gender = ?, photo_emoji = ? WHERE id = ?",
					(name, final_photo, final_gender, emoji, existing_id),
				)
				conn.execute(
					"""
					INSERT INTO loans(member_id, principal_total, interest_total, interest_per_meeting)
					VALUES (?, ?, ?, ?)
					ON CONFLICT(member_id)
					DO UPDATE SET
						principal_total = excluded.principal_total,
						interest_total = excluded.interest_total,
						interest_per_meeting = excluded.interest_per_meeting
					""",
					(existing_id, principal_total, interest_total, interest_total),
				)
				return existing_id

			emoji = default_emoji_for_gender(gender)
			cursor = conn.execute(
				"INSERT INTO members(name, photo_emoji, photo_path, gender) VALUES (?, ?, ?, ?)",
				(name, emoji, photo_path, gender),
			)
			new_member_id = int(cursor.lastrowid)
			conn.execute(
				"INSERT INTO loans(member_id, principal_total, interest_total, interest_per_meeting) VALUES (?, ?, ?, ?)",
				(new_member_id, principal_total, interest_total, interest_total),
			)
			return new_member_id

		if member_id is None:
			raise ValueError("Socio/a invalido/a")

		existing = conn.execute(
			"SELECT id, name, photo_path, gender FROM members WHERE id = ?",
			(member_id,),
		).fetchone()
		if not existing:
			raise ValueError("Socio/a no encontrado/a")

		final_name = name if name else str(existing["name"])
		final_photo = photo_path if photo_path else existing["photo_path"]
		final_gender = gender if gender else str(existing["gender"])
		emoji = default_emoji_for_gender(final_gender)
		conn.execute(
			"UPDATE members SET name = ?, photo_path = ?, gender = ?, photo_emoji = ? WHERE id = ?",
			(final_name, final_photo, final_gender, emoji, member_id),
		)
		conn.execute(
			"""
			INSERT INTO loans(member_id, principal_total, interest_total, interest_per_meeting)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(member_id)
			DO UPDATE SET
				principal_total = excluded.principal_total,
				interest_total = excluded.interest_total,
				interest_per_meeting = excluded.interest_per_meeting
			""",
			(member_id, principal_total, interest_total, interest_total),
		)
		return member_id


def delete_member(member_id: int) -> None:
	with get_connection() as conn:
		existing = conn.execute(
			"SELECT id, photo_path FROM members WHERE id = ?",
			(member_id,),
		).fetchone()
		if not existing:
			raise ValueError("Socio/a no encontrado/a")

		conn.execute("DELETE FROM attendance WHERE member_id = ?", (member_id,))
		conn.execute("DELETE FROM payments WHERE member_id = ?", (member_id,))
		conn.execute("DELETE FROM loans WHERE member_id = ?", (member_id,))
		conn.execute("DELETE FROM members WHERE id = ?", (member_id,))

	photo_path = existing["photo_path"]
	if photo_path:
		photo_file = UPLOADS_DIR / str(photo_path)
		if photo_file.exists():
			try:
				photo_file.unlink()
			except OSError:
				pass


def update_member_attributes(
	*,
	member_id: int,
	name: str,
	gender: str,
	principal_total: float,
	interest_total: float,
) -> None:
	with get_connection() as conn:
		existing = conn.execute(
			"SELECT id FROM members WHERE id = ?",
			(member_id,),
		).fetchone()
		if not existing:
			raise ValueError("Socio/a no encontrado/a")

		emoji = default_emoji_for_gender(gender)
		conn.execute(
			"UPDATE members SET name = ?, gender = ?, photo_emoji = ? WHERE id = ?",
			(name, gender, emoji, member_id),
		)
		conn.execute(
			"""
			INSERT INTO loans(member_id, principal_total, interest_total, interest_per_meeting)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(member_id)
			DO UPDATE SET
				principal_total = excluded.principal_total,
				interest_total = excluded.interest_total,
				interest_per_meeting = excluded.interest_per_meeting
			""",
			(member_id, principal_total, interest_total, interest_total),
		)


def reset_database() -> None:
	if DB_PATH.exists():
		DB_PATH.unlink()
	init_db()


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
		principal_total = round(1.0 + (idx * 0.4), 2)
		interest_total = round(0.10 + (idx % 3) * 0.05, 2)
		demo_loans.append((member["id"], principal_total, interest_total, interest_total))

	conn.executemany(
		"INSERT INTO loans(member_id, principal_total, interest_total, interest_per_meeting) VALUES (?, ?, ?, ?)",
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
		accrue_interest_for_open_principal(conn)
		conn.execute("UPDATE meetings SET is_active = 0 WHERE is_active = 1")
		cursor = conn.execute(
			"INSERT INTO meetings(started_at, is_active) VALUES (?, 1)",
			(now,),
		)
		return int(cursor.lastrowid)


def accrue_interest_for_open_principal(conn: sqlite3.Connection) -> None:
	conn.execute(
		"""
		UPDATE loans
		SET interest_total = ROUND(interest_total + interest_per_meeting, 2)
		WHERE interest_per_meeting > 0
			AND (
				principal_total
				- COALESCE((SELECT SUM(p.principal) FROM payments p WHERE p.member_id = loans.member_id), 0)
			) > 0.0001
		"""
	)


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
				m.photo_path,
				m.gender,
				l.principal_total,
				l.interest_total,
				l.interest_per_meeting,
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
				"gender": row["gender"],
				"photo_url": (
					url_for("uploaded_file", filename=row["photo_path"])
					if row["photo_path"]
					else None
				),
				"attendance": row["attendance"],
				"loan": {
					"principal_total": round(row["principal_total"], 2),
					"interest_total": round(row["interest_per_meeting"], 2),
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
		"denominations": [0.01, 0.05, 0.10, 0.25, 1, 5, 10],
		"members": member_cards,
	}


app = create_app()


if __name__ == "__main__":
	parser = argparse.ArgumentParser(description="GAPC Demo")
	parser.add_argument(
		"--reset-db",
		action="store_true",
		help="Reinicia la base SQLite con datos demo y sale.",
	)
	args = parser.parse_args()

	if args.reset_db:
		reset_database()
		print(f"Base de datos reiniciada: {DB_PATH}")
	else:
		app.run(debug=True, host="127.0.0.1", port=8000)
