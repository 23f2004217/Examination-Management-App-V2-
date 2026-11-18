
"""REST API: one module per area. Importing the modules registers their endpoints on the shared `api` blueprint."""
from routes import auth  # noqa: F401
from routes import bookings  # noqa: F401
from routes import courses  # noqa: F401
from routes import dashboard  # noqa: F401
from routes import evaluation  # noqa: F401
from routes import exams  # noqa: F401
from routes import exports  # noqa: F401
from routes import people  # noqa: F401
from routes import rubrics  # noqa: F401
from routes import slots  # noqa: F401
from routes.common import api, ApiError, error_response  # noqa: F401  (must come first: defines the blueprint)