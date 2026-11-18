from datetime import datetime, timezone
import sqlite3

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event
from sqlalchemy.engine import Engine


db = SQLAlchemy()


def utc_now():
    """Timezone-aware UTC timestamp without tzinfo (for SQLite DateTime storage). Avoids datetime.utcnow() deprecation."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


@event.listens_for(Engine, "connect")
def _enforce_foreign_keys(dbapi_conn, _record):
    """SQLite ignores FOREIGN KEY constraints unless this pragma is switched on for every connection."""
    if isinstance(dbapi_conn, sqlite3.Connection):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


def iso(v):
    return v.isoformat() if v else None
