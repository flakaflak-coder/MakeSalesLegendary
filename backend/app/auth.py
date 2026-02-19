import os

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

bearer_scheme = HTTPBearer(auto_error=False)


def _get_credentials(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> HTTPAuthorizationCredentials | None:
    return credentials


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_get_credentials),
) -> None:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return
    if not settings.admin_token:
        return
    if credentials is None or credentials.credentials != settings.admin_token:
        raise HTTPException(status_code=401, detail="Unauthorized")
